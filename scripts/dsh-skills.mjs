#!/usr/bin/env node
// Materialize the per-preset skill sets that the Shared Context DSH presets read.
//
// The registry has no filter primitive, so scoping is done by roots: each preset
// mounts `dsh-skill-filesystem` with `includeDefaultRoots: false` and one
// `customSkillDirs` entry pointing at `<agentsHome>/skill-sets/<preset id>`.
// This script builds those directories as symlinks into `<agentsHome>/skills`,
// validating every name first so a typo fails here instead of silently shipping
// a preset with a missing skill.
//
// No dependencies: node:fs, node:path, node:process only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const mapPath = path.join(repoRoot, 'dsh-preset', 'skills.json');
const prebuiltMapPath = path.join(repoRoot, 'dsh-preset', 'prebuilt-skills.json');
const patchPath = path.join(repoRoot, 'dsh-preset', 'cordis.patch.yml');

/** Directory name under the agents home that holds the generated sets. */
const SETS_DIR = 'skill-sets';

const USAGE = `Usage: node scripts/dsh-skills.mjs [--status|--dry-run] [--skills-home <path>]

Builds <agentsHome>/skill-sets/<preset>/ as symlinks to the skills listed for that
preset in dsh-preset/skills.json, so each DSH agent sees only its own catalog.

Options:
  --status            report what is linked; change nothing
  --dry-run           print the planned links; change nothing
  --skills-home <p>   agents home holding skills/ and skill-sets/
                      (default: $DSH_AGENTS_HOME, else ~/.agents)
  --help              show this message
`;

function parseArgs(argv) {
  const options = { mode: 'build', skillsHome: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--status') options.mode = 'status';
    else if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--skills-home') {
      index += 1;
      if (argv[index] === undefined) throw new Error('--skills-home needs a path');
      options.skillsHome = path.resolve(argv[index]);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function resolveAgentsHome(explicit) {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env.DSH_AGENTS_HOME;
  if (fromEnv !== undefined && fromEnv.trim() !== '') return path.resolve(fromEnv.trim());
  return path.join(os.homedir(), '.agents');
}

function readEntries(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const agentsHome = resolveAgentsHome(options.skillsHome);
  const skillsRoot = path.join(agentsHome, 'skills');
  const setsRoot = path.join(agentsHome, SETS_DIR);

  if (!fs.existsSync(skillsRoot)) {
    throw new Error(`No skills directory at ${skillsRoot}. Set DSH_AGENTS_HOME or pass --skills-home.`);
  }

  // Two maps: the presets this bundle declares, and the built-in presets the
  // DSH profile declares (which live in the profile patch, not here).
  const bundleMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const prebuiltMap = JSON.parse(fs.readFileSync(prebuiltMapPath, 'utf8'));
  const mapping = { ...bundleMap, ...prebuiltMap };
  const bundlePresets = new Set(Object.keys(bundleMap));
  const patch = fs.readFileSync(patchPath, 'utf8');

  const known = new Set(
    readEntries(skillsRoot)
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
      .map((entry) => entry.name),
  );

  const failures = [];
  const presets = Object.keys(mapping);
  if (presets.length === 0) failures.push(`${mapPath} declares no preset`);

  for (const preset of presets) {
    if (bundlePresets.has(preset) && !patch.includes(`id: ${preset}`)) {
      failures.push(`preset "${preset}" is not declared in ${path.basename(patchPath)}`);
    }
    const names = mapping[preset];
    if (!Array.isArray(names) || names.length === 0) {
      failures.push(`preset "${preset}" has no skill list`);
      continue;
    }
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    for (const duplicate of new Set(duplicates)) {
      failures.push(`preset "${preset}" lists "${duplicate}" twice`);
    }
    for (const name of names) {
      if (!known.has(name)) failures.push(`preset "${preset}": unknown skill "${name}"`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
    process.stderr.write(`\n${failures.length} problem(s) in ${mapPath}; nothing was written.\n`);
    return 1;
  }

  process.stdout.write(`agents home: ${agentsHome}\n`);
  process.stdout.write(`skills: ${known.size} available\n`);

  if (options.mode === 'status') {
    for (const preset of presets) {
      const setDir = path.join(setsRoot, preset);
      const linked = new Set(
        readEntries(setDir).filter((entry) => entry.isSymbolicLink()).map((entry) => entry.name),
      );
      const wanted = new Set(mapping[preset]);
      const missing = [...wanted].filter((name) => !linked.has(name));
      const extra = [...linked].filter((name) => !wanted.has(name));
      const mark = missing.length === 0 && extra.length === 0 ? 'ok  ' : 'DRIFT';
      process.stdout.write(
        `  ${mark} ${preset.padEnd(32)} ${wanted.size} wanted, ${linked.size} linked` +
          `${missing.length > 0 ? `, missing: ${missing.join(', ')}` : ''}` +
          `${extra.length > 0 ? `, stale: ${extra.join(', ')}` : ''}\n`,
      );
    }
    return 0;
  }

  for (const preset of presets) {
    const setDir = path.join(setsRoot, preset);
    const wanted = new Set(mapping[preset]);

    if (options.mode === 'dry-run') {
      process.stdout.write(`  would link ${wanted.size} skill(s) into ${setDir}\n`);
      continue;
    }

    fs.mkdirSync(setDir, { recursive: true });

    // Remove links this script owns that are no longer wanted. Real directories
    // are left alone: they may be a hand-made override.
    for (const entry of readEntries(setDir)) {
      if (!entry.isSymbolicLink() || wanted.has(entry.name)) continue;
      fs.unlinkSync(path.join(setDir, entry.name));
    }

    let linked = 0;
    for (const name of wanted) {
      const linkPath = path.join(setDir, name);
      // A junction needs an absolute target; a POSIX symlink stays relative so a
      // moved agents home keeps working.
      const target =
        process.platform === 'win32'
          ? path.join(skillsRoot, name)
          : path.join('..', '..', 'skills', name);
      try {
        const existing = fs.lstatSync(linkPath);
        if (existing.isSymbolicLink()) {
          if (fs.readlinkSync(linkPath) === target) linked += 1;
          else {
            fs.unlinkSync(linkPath);
            fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
            linked += 1;
          }
        }
      } catch {
        fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
        linked += 1;
      }
    }
    process.stdout.write(`  ok   ${preset.padEnd(32)} ${linked}/${wanted.size} linked\n`);
  }

  process.stdout.write(
    '\nRestart each DSH app so the presets remount their skill providers.\n',
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
