#!/usr/bin/env node
// Give the DSH profile's built-in agent presets their own scoped skill catalog.
//
// The built-in presets (architect, coder, reviewer, tester, planner, security,
// researcher, database, devops) ship without `skill-filesystem` or `tool-skill`,
// so their agents cannot load a skill and sessions work around it by reading
// SKILL.md by hand. This script appends the two rows to each preset in a
// profile's cordis.patch.yml, scoped to the same per-preset skill set the
// Shared Context bundle uses.
//
// It is idempotent, skips a preset that already mounts skill-filesystem (the
// `equipe` orchestrator), and writes a timestamped backup before editing.
//
// No dependencies: node:fs, node:path, node:process only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const mapPath = path.join(repoRoot, 'dsh-preset', 'prebuilt-skills.json');

const USAGE = `Usage: node scripts/dsh-presets-skills.mjs [--check|--dry-run]
                                        [--profile <home>] [--profiles-root <path>]

Appends scoped \`skill-filesystem\` + \`tool-skill\` rows to the built-in agent
presets in every DSH profile patch, using dsh-preset/prebuilt-skills.json.

Options:
  --check                 report which presets still lack skills; change nothing
  --dry-run               print the rows that would be inserted; change nothing
  --profile <home>        only this DSH home, e.g. pessoal (repeatable)
  --profiles-root <path>  root holding the homes (default: $DSH_PROFILE_ROOT,
                          else ~/.local/share/dsh-profiles)
  --help                  show this message
`;

function parseArgs(argv) {
  const options = { mode: 'apply', profiles: [], profilesRoot: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--check') options.mode = 'check';
    else if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg === '--profile') {
      index += 1;
      if (argv[index] === undefined) throw new Error('--profile needs a name');
      options.profiles.push(argv[index]);
    } else if (arg === '--profiles-root') {
      index += 1;
      if (argv[index] === undefined) throw new Error('--profiles-root needs a path');
      options.profilesRoot = path.resolve(argv[index]);
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function resolveProfilesRoot(explicit) {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env.DSH_PROFILE_ROOT;
  if (fromEnv !== undefined && fromEnv.trim() !== '') return path.resolve(fromEnv.trim());
  return path.join(os.homedir(), '.local', 'share', 'dsh-profiles');
}

function readEntries(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Split a profile patch into its 4-space `- id:` blocks. */
function splitBlocks(lines) {
  const blocks = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^ {4}- id: (\S+)$/.exec(lines[index]);
    if (match) {
      if (current !== null) current.end = index;
      current = { id: match[1], start: index, end: lines.length };
      blocks.push(current);
    } else if (current !== null && /^\S/.test(lines[index])) {
      current.end = index;
      current = null;
    }
  }
  return blocks;
}

function skillRows(preset) {
  const expression =
    `(function(){var p=process.getBuiltinModule('node:path');` +
    `var o=process.getBuiltinModule('node:os');` +
    `var h=process.env.DSH_AGENTS_HOME;` +
    `if(!h||h.trim()==='')h=p.join(o.homedir(),'.agents');` +
    `return p.join(h,'skill-sets','${preset}')})()`;
  return [
    '          - id: skill-filesystem',
    "            name: '@deepseek-ai/dsh-skill-filesystem'",
    '            config:',
    '              # Root-scoped: this preset sees only its own curated set.',
    '              includeDefaultRoots: false',
    '              customSkillDirs:',
    `                - !!js "${expression}"`,
    '          - id: tool-skill',
    "            name: '@deepseek-ai/dsh-tool-skill'",
  ];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  const mapping = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const root = resolveProfilesRoot(options.profilesRoot);
  const homes = readEntries(root)
    .filter((entry) => entry.isDirectory())
    .filter((entry) => options.profiles.length === 0 || options.profiles.includes(entry.name))
    .map((entry) => entry.name);

  if (homes.length === 0) {
    throw new Error(`No DSH profile under ${root}${options.profiles.length ? ` matching ${options.profiles}` : ''}.`);
  }

  let touched = 0;
  let missing = 0;
  const failures = [];

  for (const home of homes) {
    const profilesDir = path.join(root, home, 'profiles');
    for (const profileEntry of readEntries(profilesDir)) {
      if (!profileEntry.isDirectory()) continue;
      const patchPath = path.join(profilesDir, profileEntry.name, 'cordis.patch.yml');
      if (!fs.existsSync(patchPath)) continue;

      const original = fs.readFileSync(patchPath, 'utf8');
      const lines = original.split('\n');
      const blocks = splitBlocks(lines);
      const insertions = [];

      for (const block of blocks) {
        if (mapping[block.id] === undefined) continue;
        const body = lines.slice(block.start, block.end).join('\n');
        if (body.includes('id: skill-filesystem')) continue;
        insertions.push(block);
        missing += 1;
      }

      const label = `${home}/${profileEntry.name}`;
      if (insertions.length === 0) {
        process.stdout.write(`  ok   ${label.padEnd(22)} all mapped presets already mount skills\n`);
        continue;
      }
      if (options.mode === 'check') {
        process.stdout.write(
          `  TODO ${label.padEnd(22)} ${insertions.map((block) => block.id).join(', ')}\n`,
        );
        continue;
      }
      if (options.mode === 'dry-run') {
        process.stdout.write(
          `  plan ${label.padEnd(22)} would patch ${insertions.map((block) => block.id).join(', ')}\n`,
        );
        continue;
      }

      // Insert from the bottom up so earlier offsets stay valid.
      insertions.sort((a, b) => b.start - a.start);
      for (const block of insertions) {
        let insertAt = block.end;
        while (insertAt > block.start && lines[insertAt - 1].trim() === '') insertAt -= 1;
        lines.splice(insertAt, 0, ...skillRows(block.id));
      }

      const backup = `${patchPath}.bak-pre-skills-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15)}`;
      fs.copyFileSync(patchPath, backup);
      fs.writeFileSync(patchPath, lines.join('\n'));
      touched += 1;
      process.stdout.write(
        `  ok   ${label.padEnd(22)} patched ${insertions.map((block) => block.id).join(', ')}\n`,
      );
    }
  }

  if (options.mode === 'check') {
    if (missing === 0) {
      process.stdout.write('\nAll mapped presets mount a skill catalog.\n');
      return 0;
    }
    process.stderr.write(`\n${missing} preset(s) still lack skills; run without --check.\n`);
    return 1;
  }
  if (options.mode === 'apply' && touched > 0) {
    process.stdout.write('\nRestart each DSH app so the presets remount.\n');
  }
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
    return 1;
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
