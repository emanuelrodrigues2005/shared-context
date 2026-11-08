#!/usr/bin/env node
// Install, remove, or inspect the Shared Context DSH bundles in every profile
// of every DSH home on this machine.
//
// A DSH bundle is a profile dependency plus a name in `dsh.profile.bundles`.
// The rows themselves come from each bundle's own `cordis.patch.yml`, so this
// script never edits a profile patch: installing does not write rows.
//
// No dependencies: node:fs, node:path, node:child_process only.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

/** The two bundles this repository publishes, with their package directories. */
const BUNDLES = [
  { name: 'dsh-plugin-shared-context', dir: path.join(repoRoot, 'dsh-plugin') },
  { name: 'dsh-preset-shared-context', dir: path.join(repoRoot, 'dsh-preset') },
];

const USAGE = `Usage: node scripts/dsh-bundles.mjs <install|uninstall|status> [options]

Installs both Shared Context bundles (the Web UI plugin and the agent presets)
into every profile of every DSH home discovered on this machine.

Options:
  --dsh-home <path>   explicit DSH home (repeatable); skips discovery
  --dry-run           report what would change, write nothing
  --via-dsh           install through \`dsh plugin --profile <name> add\`
                      instead of pnpm plus a manifest merge
  --help              show this message

Discovery order: --dsh-home, DSH_HOME, DSH_PROFILE_ROOT/*, then the platform
default profiles root (~/.local/share/dsh-profiles on Linux and macOS,
%LOCALAPPDATA%\\\\dsh-profiles on Windows).
`;

/** Parse `--flag value` and `--flag` pairs without a dependency. */
function parseArgs(argv) {
  const options = { command: argv[0], dshHomes: [], dryRun: false, viaDsh: false, help: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dsh-home') {
      index += 1;
      if (argv[index] === undefined) throw new Error('--dsh-home needs a path');
      options.dshHomes.push(path.resolve(argv[index]));
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--via-dsh') {
      options.viaDsh = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

/** List a directory, tolerating absence. */
function readEntries(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Write JSON with the daemon's formatting and, off Windows, mode 0600. */
function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(file, 0o600);
}

/**
 * Find every DSH home that looks like one.
 *
 * A home is a directory holding `profiles/`; the profiles root holds homes.
 */
function discoverHomes(options) {
  if (options.dshHomes.length > 0) return options.dshHomes;

  const roots = [];
  const configuredRoot = process.env.DSH_PROFILE_ROOT;
  if (configuredRoot !== undefined && configuredRoot.trim() !== '') {
    roots.push(path.resolve(configuredRoot.trim()));
  }
  const dataBase =
    process.platform === 'win32'
      ? (process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'))
      : (process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'));
  roots.push(path.join(dataBase, 'dsh-profiles'));

  // Scan every home before trusting DSH_HOME: a command run from inside a DSH
  // session inherits that variable and would otherwise cover only one profile.
  const homes = [];
  for (const root of roots) {
    for (const entry of readEntries(root)) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name);
      if (isDirectory(path.join(candidate, 'profiles'))) homes.push(candidate);
    }
    if (homes.length > 0) break;
  }
  if (homes.length > 0) return homes;

  const single = process.env.DSH_HOME;
  if (single !== undefined && single.trim() !== '') return [path.resolve(single.trim())];
  return [];
}

/** Every profile directory (`<home>/profiles/<name>`) that has a manifest. */
function discoverProfiles(home) {
  const base = path.join(home, 'profiles');
  return readEntries(base)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'package.json')));
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function resolveDshBinary() {
  const candidates = [
    process.env.DSH_BIN,
    path.join(os.homedir(), '.local', 'share', 'dsh-runtime', 'node_modules', '.bin', 'dsh'),
    path.join(os.homedir(), 'AppData', 'Local', 'dsh-runtime', 'node_modules', '.bin', 'dsh'),
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && fs.existsSync(candidate)) return candidate;
  }
  return 'dsh';
}

function isInstalled(profileDir, manifest, name) {
  const declared = manifest.dependencies?.[name] !== undefined;
  const resolved = fs.existsSync(path.join(profileDir, 'node_modules', name, 'package.json'));
  const listed = (manifest.dsh?.profile?.bundles ?? []).includes(name);
  return { declared, resolved, listed, ok: declared && resolved && listed };
}

function installProfile(profileDir, options) {
  const manifestPath = path.join(profileDir, 'package.json');
  const manifest = readJson(manifestPath);
  const missing = BUNDLES.filter((bundle) => !isInstalled(profileDir, manifest, bundle.name).ok);
  if (missing.length === 0) {
    return `already installed`;
  }
  if (options.dryRun) {
    return `would install ${missing.map((bundle) => bundle.name).join(', ')}`;
  }

  const profileName = path.basename(profileDir);
  if (options.viaDsh) {
    const binary = resolveDshBinary();
    const status = run(binary, ['plugin', '--profile', profileName, 'add', ...missing.map((b) => b.dir)], profileDir, {
      DSH_HOME: path.dirname(path.dirname(profileDir)),
    });
    if (status !== 0) throw new Error(`dsh plugin add exited ${status}`);
    return `installed via dsh (${missing.map((bundle) => bundle.name).join(', ')})`;
  }

  const status = run('pnpm', ['add', ...missing.map((bundle) => bundle.dir)], profileDir);
  if (status !== 0) throw new Error(`pnpm add exited ${status}`);

  // pnpm rewrites package.json, so re-read before merging the bundle list.
  const updated = readJson(manifestPath);
  const bundles = Array.isArray(updated.dsh?.profile?.bundles) ? [...updated.dsh.profile.bundles] : [];
  for (const bundle of BUNDLES) {
    if (!bundles.includes(bundle.name)) bundles.push(bundle.name);
  }
  updated.dsh = {
    ...(updated.dsh ?? {}),
    profile: { ...(updated.dsh?.profile ?? {}), bundles },
  };
  writeJson(manifestPath, updated);

  const check = isInstalled(profileDir, readJson(manifestPath), BUNDLES[0].name);
  if (!check.ok) {
    throw new Error(
      `package.json updated but ${BUNDLES[0].name} does not resolve; check pnpm output above`,
    );
  }
  return `installed (${missing.map((bundle) => bundle.name).join(', ')})`;
}

function uninstallProfile(profileDir, options) {
  const manifestPath = path.join(profileDir, 'package.json');
  const manifest = readJson(manifestPath);
  const present = BUNDLES.filter((bundle) => isInstalled(profileDir, manifest, bundle.name).declared);
  if (present.length === 0) return 'already absent';
  if (options.dryRun) {
    return `would remove ${present.map((bundle) => bundle.name).join(', ')}`;
  }

  const status = run('pnpm', ['remove', ...present.map((bundle) => bundle.name)], profileDir);
  if (status !== 0) throw new Error(`pnpm remove exited ${status}`);

  const updated = readJson(manifestPath);
  const bundles = (updated.dsh?.profile?.bundles ?? []).filter(
    (name) => !BUNDLES.some((bundle) => bundle.name === name),
  );
  updated.dsh = {
    ...(updated.dsh ?? {}),
    profile: { ...(updated.dsh?.profile ?? {}), bundles },
  };
  writeJson(manifestPath, updated);
  return `removed (${present.map((bundle) => bundle.name).join(', ')})`;
}

function reportProfile(profileDir) {
  const manifest = readJson(path.join(profileDir, 'package.json'));
  return BUNDLES.map((bundle) => {
    const state = isInstalled(profileDir, manifest, bundle.name);
    const mark = state.ok ? 'ok  ' : 'MISS';
    return `${mark} ${bundle.name}`;
  }).join('\n         ');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.command === undefined) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!['install', 'uninstall', 'status'].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}\n\n${USAGE}`);
  }

  const homes = discoverHomes(options);
  if (homes.length === 0) {
    throw new Error(
      'No DSH home found. Pass --dsh-home <path>, set DSH_PROFILE_ROOT, or install DSH first.',
    );
  }

  let failures = 0;
  for (const home of homes) {
    const profiles = discoverProfiles(home);
    process.stdout.write(`\n${home}\n`);
    if (profiles.length === 0) {
      process.stdout.write(`  (no profiles)\n`);
      continue;
    }
    for (const profileDir of profiles) {
      const label = `  ${path.basename(profileDir).padEnd(8)}`;
      try {
        if (options.command === 'status') {
          process.stdout.write(`${label} ${reportProfile(profileDir)}\n`);
        } else {
          const outcome =
            options.command === 'install'
              ? installProfile(profileDir, options)
              : uninstallProfile(profileDir, options);
          process.stdout.write(`${label} ${outcome}\n`);
        }
      } catch (error) {
        failures += 1;
        process.stderr.write(`${label} FAILED: ${error instanceof Error ? error.message : error}\n`);
      }
    }
  }

  if (failures > 0) {
    process.stderr.write(`\n${failures} profile(s) failed.\n`);
    return 1;
  }
  if (!options.dryRun && options.command === 'install') {
    process.stdout.write(
      '\nRestart each DSH app to pick up new Host rows; the browser needs one reload for the panel.\n',
    );
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
