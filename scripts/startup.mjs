#!/usr/bin/env node
// Cross-platform entry point for the startup scripts.
//
// npm cannot select a script by operating system, so `npm run startup:install`
// and `npm run startup:uninstall` both land here and this dispatcher picks the
// Windows Task Scheduler script or the systemd --user script.
//
// No dependencies: node:child_process, node:path, node:process only.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Long option -> PowerShell parameter, for the Windows leg. */
const POWERSHELL_PARAMETERS = new Map([
  ['--name', '-TaskName'],
  ['--data-dir', '-DataDir'],
  ['--config', '-ConfigPath'],
  ['--port', '-Port'],
  ['--health-timeout', '-HealthTimeoutSeconds'],
  ['--verify-only', '-VerifyOnly'],
  ['--no-start', '-NoStart'],
  ['--keep-wrapper', '-KeepWrapper'],
]);

const FLAGS = new Set(['--verify-only', '--no-start', '--keep-wrapper']);

const USAGE = `Usage: node scripts/startup.mjs <install|uninstall> [options]

Options:
  --name <name>            unit / task name (default: shared-context)
  --data-dir <path>        SHARED_CONTEXT_DATA_DIR for the daemon
  --config <path>          SHARED_CONTEXT_CONFIG for the daemon
  --port <port>            health-check port (default: 4319)
  --health-timeout <secs>  health-check deadline (default: 20)
  --no-start               register without starting (install only)
  --keep-wrapper           keep the generated env file (uninstall only)
  --verify-only            print the plan and change nothing

Windows runs scripts/<command>-startup.ps1; everything else runs
scripts/<command>-startup.sh.`;

/**
 * Translate the shared long options into PowerShell parameters.
 *
 * @param {string[]} args - options after the command.
 * @returns {string[]} PowerShell arguments.
 */
function toPowerShell(args) {
  const mapped = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const parameter = POWERSHELL_PARAMETERS.get(arg);
    if (parameter === undefined) throw new Error(`Unknown option: ${arg}`);
    mapped.push(parameter);
    if (!FLAGS.has(arg)) {
      index += 1;
      if (args[index] === undefined) throw new Error(`${arg} needs a value`);
      mapped.push(args[index]);
    }
  }
  return mapped;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || command === '--help' || command === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (command !== 'install' && command !== 'uninstall') {
    throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
  }
  for (const arg of rest) {
    if (arg.startsWith('--') && !POWERSHELL_PARAMETERS.has(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const isWindows = process.platform === 'win32';
  const result = isWindows
    ? spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, `${command}-startup.ps1`), ...toPowerShell(rest)],
        { stdio: 'inherit' },
      )
    : spawnSync('bash', [path.join(here, `${command}-startup.sh`), ...rest], { stdio: 'inherit' });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
