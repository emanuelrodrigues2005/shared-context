#!/usr/bin/env node
// Provision and run one Shared Context daemon per DSH home.
//
// Each home keeps its own config, data root, pid, and log under
// `<home>/shared-context`, so two DSH homes can never read each other's Issues.
// The existing global daemon (port 4319) stays untouched; provisioning a home
// opts that home into an isolated instance.
//
// No dependencies: node:fs, node:path, node:net, node:crypto only.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const entry = path.join(repoRoot, 'dist', 'server', 'index.js');
const PROFILE_DIR_NAME = 'shared-context';
const DEFAULT_PORT = 4320;
const HEALTH_TIMEOUT_MS = 20_000;
const STOP_TIMEOUT_MS = 10_000;
const RETRY_MS = 250;

const USAGE = `Usage: node scripts/dsh-profiles.mjs [status|install|start|stop] [options]

Provision and run a Shared Context daemon per DSH home. The legacy global
daemon and store are never modified; a home with a profile config uses
<home>/shared-context instead.

Commands:
  status    report every discovered home (default)
  install   write this home's config and optionally start its daemon
  start     start this home's daemon from its config
  stop      stop this home's daemon

Options:
  --home <name>   DSH home basename (repeatable; required for install/start/stop)
  --port <n>      port for install (default: first free port from 4320)
  --no-start      install only; do not start the daemon
  --dry-run       report what would change, write and start nothing
  --help          show this message

Discovery: DSH_PROFILE_ROOT or the platform default profiles root
(~/.local/share/dsh-profiles on Linux and macOS, %LOCALAPPDATA%\\\\dsh-profiles
on Windows), then DSH_HOME as the single home.
`;

/** Parse `--flag value` and `--flag` pairs without a dependency. */
function parseArgs(argv) {
  const args = [...argv];
  const options = {
    command: 'status',
    homes: [],
    port: undefined,
    noStart: false,
    dryRun: false,
    help: false,
  };
  if (args[0] !== undefined && !args[0].startsWith('-')) {
    options.command = args.shift();
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--home') {
      index += 1;
      if (args[index] === undefined) throw new Error('--home needs a DSH home name');
      options.homes.push(args[index]);
    } else if (arg === '--port') {
      index += 1;
      if (args[index] === undefined) throw new Error('--port needs a number');
      options.port = normalizePort(args[index], '--port');
    } else if (arg === '--no-start') {
      options.noStart = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
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

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizePort(value, label = 'port') {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The platform default profiles root, matching scripts/dsh-bundles.mjs. */
function defaultProfilesRoot() {
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'dsh-profiles',
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
    'dsh-profiles',
  );
}

/** Every DSH home discovered on this machine. */
function discoverHomes() {
  const roots = [];
  const configuredRoot = process.env.DSH_PROFILE_ROOT;
  if (configuredRoot !== undefined && configuredRoot.trim() !== '') {
    roots.push(path.resolve(configuredRoot.trim()));
  }
  roots.push(defaultProfilesRoot());

  const homes = [];
  for (const root of roots) {
    for (const entryItem of readEntries(root)) {
      if (!entryItem.isDirectory()) continue;
      const candidate = path.join(root, entryItem.name);
      if (isDirectory(path.join(candidate, 'profiles'))) homes.push(candidate);
    }
    if (homes.length > 0) break;
  }
  if (homes.length > 0) return homes;

  const single = process.env.DSH_HOME;
  if (single !== undefined && single.trim() !== '') return [path.resolve(single.trim())];
  return [];
}

/** Match `--home` values against discovered homes by basename. */
function selectHomes(homes, names) {
  if (names.length === 0) return homes;
  const selected = [];
  for (const name of names) {
    const matches = homes.filter((home) => path.basename(home) === name);
    if (matches.length === 0) {
      throw new Error(
        `DSH home not found: ${name} (discovered: ${homes.map((home) => path.basename(home)).join(', ') || 'none'})`,
      );
    }
    if (matches.length > 1) {
      throw new Error(`DSH home name is ambiguous: ${name} matches ${matches.join(', ')}`);
    }
    if (!selected.includes(matches[0])) selected.push(matches[0]);
  }
  return selected;
}

/**
 * The platform default daemon config, used when a home has no profile config.
 *
 * @param {boolean} [useEnv] - honour `SHARED_CONTEXT_CONFIG`; false reads the
 *   platform path only, which the isolation guards need.
 * @returns {string} the config file path.
 */
function globalConfigPath(useEnv = true) {
  const explicit = process.env.SHARED_CONTEXT_CONFIG;
  if (useEnv && explicit !== undefined && explicit.trim() !== '') {
    return path.resolve(explicit.trim());
  }
  const configHome =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'));
  return path.join(configHome, 'shared-context', 'config.json');
}

/** The platform default data root, matching the daemon's own default. */
function defaultDataDir() {
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
      'shared-context',
    );
  }
  return path.join(os.homedir(), '.local', 'share', 'shared-context');
}

/**
 * Resolve every path that belongs to one home's isolated instance.
 *
 * @param {string} home - a DSH home directory.
 * @returns {{home: string, root: string, config: string, dataDir: string, backupDir: string,
 *   pid: string, logDir: string, log: string}} absolute instance paths.
 */
export function resolveProfilePaths(home) {
  const homeDir = path.resolve(home);
  const root = path.join(homeDir, PROFILE_DIR_NAME);
  return {
    home: homeDir,
    root,
    config: path.join(root, 'config.json'),
    dataDir: root,
    backupDir: path.join(root, 'backups'),
    pid: path.join(root, 'daemon.pid'),
    logDir: path.join(root, 'logs'),
    log: path.join(root, 'logs', 'daemon.log'),
  };
}

/**
 * Read a profile config, distinguishing absence from corruption.
 *
 * @param {ReturnType<typeof resolveProfilePaths>} paths - resolved instance paths.
 * @returns {Record<string, unknown> | null} the parsed config, or null when absent.
 */
export function readProfileConfig(paths) {
  if (!fs.existsSync(paths.config)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(paths.config, 'utf8'));
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('the file is not a JSON object');
    }
    return config;
  } catch (error) {
    throw new Error(`Cannot read profile config ${paths.config}: ${messageOf(error)}`, {
      cause: error,
    });
  }
}

/**
 * Write a profile config with owner-only permissions.
 *
 * @param {ReturnType<typeof resolveProfilePaths>} paths - resolved instance paths.
 * @param {Record<string, unknown>} config - the config to persist.
 */
export function writeProfileConfig(paths, config) {
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(paths.root, 0o700);
  fs.writeFileSync(paths.config, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') fs.chmodSync(paths.config, 0o600);
}

/** Whether a loopback port can be bound right now. */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Allocate the first free loopback port at or above `start`.
 *
 * @param {number} start - first candidate port.
 * @param {{reserved?: number[], isFree?: (port: number) => Promise<boolean>}} [options] - reserved
 *   ports and an injectable availability probe (tests pass a stub).
 * @returns {Promise<number>} a free port.
 */
export async function allocatePort(start, options = {}) {
  const first = normalizePort(start, 'start port');
  const reserved = new Set((options.reserved ?? []).map(Number));
  const free = options.isFree ?? isPortFree;
  for (let port = first; port <= 65535; port += 1) {
    if (reserved.has(port)) continue;
    if (await free(port)) return port;
  }
  throw new Error(`No free loopback port at or above ${start}`);
}

/** Ports already claimed by the global daemon or another home's profile config. */
function reservedPorts(homes, excludeRoot) {
  // 4319 is the daemon default even when the global config is missing or
  // temporarily unreadable, so never hand it to a profile instance.
  const ports = [4319];
  const global = readConfigFileQuietly(globalConfigPath());
  if (global !== null && Number.isInteger(global.port)) ports.push(global.port);
  for (const home of homes) {
    const paths = resolveProfilePaths(home);
    if (paths.root === excludeRoot) continue;
    const config = readConfigFileQuietly(paths.config);
    if (config !== null && Number.isInteger(config.port)) ports.push(config.port);
  }
  return ports;
}

/** Parse a config without throwing, for reporting paths. */
function readConfigFileQuietly(file) {
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    return config !== null && typeof config === 'object' && !Array.isArray(config) ? config : null;
  } catch {
    return null;
  }
}

/** Read one config file with absence and corruption kept distinct. */
function inspectConfigFile(file) {
  if (!fs.existsSync(file)) return { exists: false, config: null, error: null };
  try {
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('the file is not a JSON object');
    }
    return { exists: true, config, error: null };
  } catch (error) {
    return { exists: true, config: null, error: `Cannot read ${file}: ${messageOf(error)}` };
  }
}

function samePath(left, right) {
  return path.resolve(left) === path.resolve(right);
}

/** Whether `child` is strictly inside `parent`. */
function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Every data root a profile instance must not share: the platform default, the
 * platform global config's data_dir, and an explicit SHARED_CONTEXT_CONFIG that
 * is not this home's own config.
 */
function globalStoreDirs(paths) {
  const dirs = [path.resolve(defaultDataDir())];
  const platformConfig = readConfigFileQuietly(globalConfigPath(false));
  if (
    platformConfig !== null &&
    typeof platformConfig.data_dir === 'string' &&
    platformConfig.data_dir.trim() !== ''
  ) {
    dirs.push(path.resolve(platformConfig.data_dir));
  }
  const explicit = process.env.SHARED_CONTEXT_CONFIG;
  if (
    explicit !== undefined &&
    explicit.trim() !== '' &&
    !samePath(explicit.trim(), paths.config)
  ) {
    const override = readConfigFileQuietly(path.resolve(explicit.trim()));
    if (
      override !== null &&
      typeof override.data_dir === 'string' &&
      override.data_dir.trim() !== ''
    ) {
      dirs.push(path.resolve(override.data_dir));
    }
  }
  return [...new Set(dirs)];
}

/**
 * Refuse a data root that overlaps the global daemon or another home.
 *
 * A profile config pointed at the global store would proxy the empresa database
 * through the personal daemon's CSRF token, which is exactly the leak per-home
 * isolation prevents.
 *
 * @param {ReturnType<typeof resolveProfilePaths>} paths - resolved instance paths.
 * @param {string} dataDir - the data root to validate.
 * @param {string} label - human-readable source of the data root.
 */
function assertIsolatedDataDir(paths, dataDir, label) {
  const forbidden = globalStoreDirs(paths);
  for (const home of discoverHomes()) {
    const other = resolveProfilePaths(home);
    if (!samePath(other.root, paths.root)) forbidden.push(other.root);
  }
  for (const dir of forbidden) {
    if (samePath(dataDir, dir) || isInside(dataDir, dir) || isInside(dir, dataDir)) {
      throw new Error(
        `${label} ${path.resolve(dataDir)} overlaps the Shared Context store at ${dir}. ` +
          `Move it under ${paths.root} and re-run "npm run dsh:profiles:install -- --home ${path.basename(paths.home)}" to repair ${paths.config}.`,
      );
    }
  }
}

/**
 * Provision one home's isolated instance.
 *
 * Existing configs are idempotent: the token, port, and data directory are
 * kept, and a missing `data_dir` is repaired so the daemon can never fall back
 * to the global store. The daemon starts only when `options.start === true`
 * and this is not a dry run.
 *
 * @param {string} home - a DSH home directory.
 * @param {{port?: number, start?: boolean, dryRun?: boolean, reservedPorts?: number[],
 *   isFree?: (port: number) => Promise<boolean>}} [options] - provisioning options.
 * @returns {Promise<{paths: object, config: object, created: boolean, started: boolean,
 *   warning?: string, dryRun?: boolean, pid?: number}>} the outcome.
 */
export async function provisionProfile(home, options = {}) {
  const paths = resolveProfilePaths(home);
  assertIsolatedDataDir(paths, paths.dataDir, 'Profile root');
  const existing = readProfileConfig(paths);
  if (
    existing !== null &&
    typeof existing.data_dir === 'string' &&
    existing.data_dir.trim() !== ''
  ) {
    assertIsolatedDataDir(
      paths,
      path.resolve(existing.data_dir),
      `Profile config ${paths.config} data_dir`,
    );
  }

  if (existing !== null) {
    let warning;
    if (options.port !== undefined && normalizePort(options.port) !== existing.port) {
      warning = `config already uses port ${existing.port}; keeping it and ignoring --port ${options.port}`;
    }
    if (typeof existing.data_dir === 'string' && existing.data_dir.trim() !== '') {
      assertIsolatedDataDir(
        paths,
        path.resolve(existing.data_dir),
        `Profile config ${paths.config} data_dir`,
      );
    }
    let config = existing;
    let repaired = false;
    if (typeof existing.data_dir !== 'string' || existing.data_dir.trim() === '') {
      config = {
        ...existing,
        data_dir: paths.dataDir,
        backup_dir:
          typeof existing.backup_dir === 'string' && existing.backup_dir.trim() !== ''
            ? existing.backup_dir
            : paths.backupDir,
      };
      repaired = true;
      warning = `${warning ? `${warning}; ` : ''}config was missing data_dir; added ${paths.dataDir}`;
      if (options.dryRun !== true) writeProfileConfig(paths, config);
    }
    const outcome = {
      paths,
      config,
      created: false,
      repaired,
      started: false,
      warning,
      dryRun: options.dryRun === true,
    };
    if (options.start === true && options.dryRun !== true) {
      const started = await startProfile(home, options);
      outcome.started = started.started;
      outcome.alreadyRunning = started.alreadyRunning === true;
      outcome.pid = started.pid;
    }
    return outcome;
  }

  const reserved = new Set((options.reservedPorts ?? []).map(Number));
  let port;
  if (options.port !== undefined) {
    port = normalizePort(options.port);
    if (reserved.has(port)) {
      throw new Error(`Port ${port} is already used by another DSH home's profile config`);
    }
    const free = options.isFree ?? isPortFree;
    if (!(await free(port))) throw new Error(`Port ${port} is already in use on 127.0.0.1`);
  } else {
    port = await allocatePort(options.startPort ?? DEFAULT_PORT, {
      reserved: [...reserved],
      isFree: options.isFree,
    });
  }

  const config = {
    port,
    token: randomBytes(32).toString('base64url'),
    data_dir: paths.dataDir,
    backup_dir: paths.backupDir,
    backup_hour: 3,
    backup_retention_days: 14,
    log_level: 'info',
    theme: 'dark',
  };

  if (options.dryRun === true) {
    return { paths, config, created: false, started: false, dryRun: true };
  }

  writeProfileConfig(paths, config);
  const outcome = { paths, config, created: true, started: false };
  if (options.start === true) {
    const started = await startProfile(home, options);
    outcome.started = started.started;
    outcome.alreadyRunning = started.alreadyRunning === true;
    outcome.pid = started.pid;
  }
  return outcome;
}

async function fetchJson(url) {
  try {
    const response = await globalThis.fetch(url, {
      signal: globalThis.AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** Read a daemon's health and reported data directory on one port. */
async function inspectDaemon(port) {
  const health = await fetchJson(`http://127.0.0.1:${port}/healthz`);
  if (health === null || health.ok !== true) return { health: 'offline', dataDir: null };
  const config = await fetchJson(`http://127.0.0.1:${port}/api/config`);
  return {
    health: 'ok',
    dataDir:
      config !== null && typeof config.data_dir === 'string' ? path.resolve(config.data_dir) : null,
  };
}

function tailFile(file, lines) {
  try {
    const content = fs.readFileSync(file, 'utf8').trimEnd();
    return content === '' ? '' : content.split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/**
 * Start one home's daemon from its profile config, detached from this process.
 *
 * The config file is the single source of truth: the child receives only
 * `SHARED_CONTEXT_CONFIG`; data-dir, port, token, and URL overrides are removed
 * so they cannot redirect it to another store.
 *
 * @param {string} home - a DSH home directory.
 * @param {{dryRun?: boolean, healthTimeoutMs?: number}} [options] - start options.
 * @returns {Promise<{paths: object, started: boolean, port: number, pid?: number,
 *   alreadyRunning?: boolean, dryRun?: boolean, command?: string}>} the outcome.
 */
export async function startProfile(home, options = {}) {
  const paths = resolveProfilePaths(home);
  const config = readProfileConfig(paths);
  if (config === null) {
    throw new Error(
      `No profile config at ${paths.config}. Run "npm run dsh:profiles:install -- --home ${path.basename(paths.home)}" first.`,
    );
  }
  const port = normalizePort(config.port, `port in ${paths.config}`);
  if (typeof config.data_dir !== 'string' || config.data_dir.trim() === '') {
    throw new Error(
      `Profile config ${paths.config} has no data_dir. Re-run install so this home cannot fall back to the global store.`,
    );
  }
  const dataDir = path.resolve(config.data_dir);
  assertIsolatedDataDir(paths, dataDir, `Profile config ${paths.config} data_dir`);

  const current = await inspectDaemon(port);
  if (current.health === 'ok') {
    if (current.dataDir === dataDir) {
      return { paths, started: false, alreadyRunning: true, port };
    }
    throw new Error(
      `Port ${port} answers from data_dir ${current.dataDir ?? 'unknown'}, not ${dataDir}. Stop that daemon before starting this home.`,
    );
  }
  if (!(await isPortFree(port))) {
    throw new Error(
      `Port ${port} is already in use by another process. Stop it, or reinstall this home on another port.`,
    );
  }
  if (!fs.existsSync(entry)) {
    throw new Error(`Built entry point not found: ${entry}. Run "npm run build" first.`);
  }

  if (options.dryRun === true) {
    return {
      paths,
      started: false,
      dryRun: true,
      port,
      command: `${process.execPath} ${entry}`,
    };
  }

  fs.mkdirSync(paths.logDir, { recursive: true, mode: 0o700 });
  const logFd = fs.openSync(paths.log, 'a', 0o600);
  const childEnv = { ...process.env, SHARED_CONTEXT_CONFIG: paths.config };
  delete childEnv.SHARED_CONTEXT_DATA_DIR;
  delete childEnv.SHARED_CONTEXT_PORT;
  delete childEnv.SHARED_CONTEXT_TOKEN;
  delete childEnv.SHARED_CONTEXT_URL;

  let spawnError = null;
  let child;
  try {
    child = spawn(process.execPath, [entry], {
      cwd: repoRoot,
      detached: true,
      env: childEnv,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });
  } finally {
    fs.closeSync(logFd);
  }
  child.once('error', (error) => {
    spawnError = error;
  });
  child.unref();
  if (typeof child.pid === 'number') {
    fs.writeFileSync(paths.pid, `${child.pid}\n`, { mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(paths.pid, 0o600);
  }

  const deadline = Date.now() + (options.healthTimeoutMs ?? HEALTH_TIMEOUT_MS);
  let state = null;
  while (Date.now() < deadline) {
    state = await inspectDaemon(port);
    if (state.health === 'ok' && state.dataDir === dataDir) break;
    if (spawnError !== null) break;
    await delay(RETRY_MS);
  }

  if (state === null || state.health !== 'ok' || state.dataDir !== dataDir) {
    try {
      if (typeof child.pid === 'number') process.kill(child.pid, 'SIGTERM');
    } catch {
      // The child may already be gone.
    }
    fs.rmSync(paths.pid, { force: true });
    const tail = tailFile(paths.log, 20);
    throw new Error(
      `The daemon did not become healthy on port ${port}.${spawnError ? ` Spawn error: ${messageOf(spawnError)}.` : ''}${tail ? `\nLast log lines:\n${tail}` : ''}`,
    );
  }

  return { paths, started: true, port, pid: child.pid };
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

/** The config path a process was started with, when the platform exposes it. */
function processConfigPath(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const environ = fs.readFileSync(`/proc/${pid}/environ`, 'utf8');
    const match = environ.split('\0').find((item) => item.startsWith('SHARED_CONTEXT_CONFIG='));
    return match === undefined ? null : match.slice('SHARED_CONTEXT_CONFIG='.length);
  } catch {
    return null;
  }
}

/**
 * Stop one home's daemon using its pid file.
 *
 * @param {string} home - a DSH home directory.
 * @param {{dryRun?: boolean, stopTimeoutMs?: number}} [options] - stop options.
 * @returns {Promise<{paths: object, stopped: boolean, pid?: number, reason?: string,
 *   removed?: boolean, dryRun?: boolean}>} the outcome.
 */
export async function stopProfile(home, options = {}) {
  const paths = resolveProfilePaths(home);
  if (!fs.existsSync(paths.pid)) {
    return { paths, stopped: false, reason: 'no-pid' };
  }

  const pid = Number(fs.readFileSync(paths.pid, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    fs.rmSync(paths.pid, { force: true });
    return { paths, stopped: false, reason: 'invalid-pid', removed: true };
  }

  const config = readProfileConfig(paths);
  const port = config === null ? null : normalizePort(config.port, `port in ${paths.config}`);
  const dataDir =
    config !== null && typeof config.data_dir === 'string' && config.data_dir.trim() !== ''
      ? path.resolve(config.data_dir)
      : null;

  const ownedConfig = processConfigPath(pid);
  if (ownedConfig !== null && path.resolve(ownedConfig) !== path.resolve(paths.config)) {
    throw new Error(
      `PID ${pid} runs with SHARED_CONTEXT_CONFIG=${ownedConfig}, not ${paths.config}. Refusing to stop it.`,
    );
  }

  let state = port === null ? null : await inspectDaemon(port);
  if (state !== null && state.health === 'ok' && dataDir !== null && state.dataDir !== dataDir) {
    throw new Error(
      `Port ${port} answers from data_dir ${state.dataDir ?? 'unknown'}, not ${dataDir}. Refusing to stop it.`,
    );
  }

  if (!isAlive(pid)) {
    fs.rmSync(paths.pid, { force: true });
    return { paths, stopped: false, reason: 'stale-pid', removed: true };
  }

  if (options.dryRun === true) {
    return { paths, stopped: false, dryRun: true, pid };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error;
  }

  const deadline = Date.now() + (options.stopTimeoutMs ?? STOP_TIMEOUT_MS);
  while (Date.now() < deadline) {
    state = port === null ? null : await inspectDaemon(port);
    const healthDown = state === null || state.health === 'offline';
    if (!isAlive(pid) && healthDown) {
      fs.rmSync(paths.pid, { force: true });
      return { paths, stopped: true, pid };
    }
    await delay(RETRY_MS);
  }

  return { paths, stopped: false, reason: 'timeout', pid };
}

/** Report every home's config, health, data root, and setup state. */
async function reportStatus(homes) {
  let failures = 0;
  for (const home of homes) {
    const paths = resolveProfilePaths(home);
    const label = path.basename(home);
    const profileDirExists = fs.existsSync(paths.root);
    const profile = inspectConfigFile(paths.config);
    if (profileDirExists && !profile.exists) {
      failures += 1;
      process.stderr.write(
        `${label}: ${paths.root} exists but ${paths.config} is missing; the plugin and preset fail closed. ` +
          `Re-run "npm run dsh:profiles:install -- --home ${label}" to repair it, or remove the directory.\n`,
      );
      continue;
    }
    const source = profile.exists ? 'profile' : 'global';
    const file = profile.exists ? paths.config : globalConfigPath();
    const chosen = profile.exists ? profile : inspectConfigFile(file);

    if (chosen.error !== null) {
      failures += 1;
      process.stderr.write(`${label}: ${chosen.error}\n`);
      continue;
    }
    if (chosen.config === null) {
      process.stdout.write(`${label}: no ${source} config at ${file}\n`);
      continue;
    }

    const config = chosen.config;
    let port;
    if (source === 'profile') {
      try {
        port = normalizePort(config.port, `port in ${file}`);
      } catch (error) {
        failures += 1;
        process.stderr.write(`${label}: ${messageOf(error)}\n`);
        continue;
      }
      if (typeof config.data_dir !== 'string' || config.data_dir.trim() === '') {
        failures += 1;
        process.stderr.write(
          `${label}: ${file} has no data_dir; the daemon could open the global store. ` +
            `Re-run "npm run dsh:profiles:install -- --home ${label}" to repair it.\n`,
        );
        continue;
      }
      try {
        assertIsolatedDataDir(
          paths,
          path.resolve(config.data_dir),
          `Profile config ${file} data_dir`,
        );
      } catch (error) {
        failures += 1;
        process.stderr.write(`${label}: ${messageOf(error)}\n`);
        continue;
      }
    } else {
      port = Number.isInteger(config.port) ? config.port : 4319;
    }
    const dataDir =
      typeof config.data_dir === 'string' && config.data_dir.trim() !== ''
        ? path.resolve(config.data_dir)
        : source === 'profile'
          ? '(missing)'
          : defaultDataDir();
    const state = await inspectDaemon(port);
    if (state.health === 'ok' && state.dataDir !== null && state.dataDir !== dataDir) {
      failures += 1;
      process.stderr.write(
        `${label}: port ${port} serves data_dir ${state.dataDir}, not ${dataDir}; refusing to report this daemon as ${source}.\n`,
      );
      continue;
    }
    const projects =
      state.health === 'ok' ? await fetchJson(`http://127.0.0.1:${port}/api/projects`) : null;
    const liveConfig =
      state.health === 'ok' ? await fetchJson(`http://127.0.0.1:${port}/api/config`) : null;
    const projectCount =
      projects !== null && Array.isArray(projects.items) ? projects.items.length : '?';
    const setupRequired = liveConfig !== null ? liveConfig.setup_required : '?';

    process.stdout.write(
      `${label}: ${state.health} · ${source} config ${file}\n` +
        `  port ${port} · data_dir ${dataDir} · projects ${projectCount} · setup_required ${setupRequired}\n`,
    );
  }
  return failures;
}

function nextStep(home, action) {
  const name = path.basename(home);
  if (action === 'start') {
    return `Start it with "npm run dsh:profiles:start -- --home ${name}", then restart that DSH app (or toggle the plugin row) and reload the page.`;
  }
  return `Restart that DSH app (or toggle the plugin row) so the Host re-resolves the daemon, then reload the page.`;
}

async function runCommand(command, home, options, homes) {
  const label = path.basename(home);
  if (command === 'install') {
    const paths = resolveProfilePaths(home);
    const outcome = await provisionProfile(home, {
      port: options.port,
      start: options.noStart === true ? false : options.dryRun !== true,
      dryRun: options.dryRun,
      reservedPorts: reservedPorts(homes, paths.root),
    });
    if (outcome.warning !== undefined)
      process.stderr.write(`${label}: warning: ${outcome.warning}\n`);
    if (outcome.dryRun === true) {
      const action = fs.existsSync(paths.config) ? 'keep' : 'create';
      process.stdout.write(
        `${label}: would ${action} ${paths.config} with port ${outcome.config.port} and data_dir ${paths.dataDir}\n`,
      );
      return;
    }
    process.stdout.write(
      `${label}: ${outcome.created ? 'created' : 'kept'} ${paths.config} (port ${outcome.config.port}, data_dir ${outcome.config.data_dir})\n`,
    );
    if (outcome.started === true || outcome.alreadyRunning === true) {
      process.stdout.write(
        `${label}: daemon healthy on http://127.0.0.1:${outcome.config.port}/healthz\n`,
      );
      process.stdout.write(`${nextStep(home, 'install')}\n`);
    } else {
      process.stdout.write(`${label}: daemon not started.\n${nextStep(home, 'start')}\n`);
    }
    return;
  }

  if (command === 'start') {
    const outcome = await startProfile(home, options);
    if (outcome.dryRun === true) {
      process.stdout.write(
        `${label}: would start ${outcome.command} with SHARED_CONTEXT_CONFIG pointing at ${outcome.paths.config}\n`,
      );
      return;
    }
    if (outcome.alreadyRunning === true) {
      process.stdout.write(
        `${label}: daemon already healthy on http://127.0.0.1:${outcome.port}/healthz\n`,
      );
    } else {
      process.stdout.write(
        `${label}: daemon healthy on http://127.0.0.1:${outcome.port}/healthz (pid ${outcome.pid})\n`,
      );
    }
    process.stdout.write(`${nextStep(home, 'install')}\n`);
    return;
  }

  const outcome = await stopProfile(home, options);
  if (outcome.dryRun === true) {
    process.stdout.write(`${label}: would stop pid ${outcome.pid} from ${outcome.paths.pid}\n`);
    return;
  }
  if (outcome.stopped === true) {
    process.stdout.write(`${label}: stopped pid ${outcome.pid}\n`);
    return;
  }
  if (outcome.reason === 'no-pid') {
    process.stdout.write(
      `${label}: no pid file at ${outcome.paths.pid}. Stop the daemon with Ctrl+C, kill the node process, or stop its logon service.\n`,
    );
    return;
  }
  if (outcome.reason === 'stale-pid' || outcome.reason === 'invalid-pid') {
    process.stdout.write(`${label}: removed a stale pid file at ${outcome.paths.pid}\n`);
    return;
  }
  throw new Error(
    `PID ${outcome.pid} is still running; stop it manually and remove ${outcome.paths.pid}`,
  );
}

async function main(argv = process.argv.slice(2)) {
  if (process.platform !== 'win32') process.umask(0o077);
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!['status', 'install', 'start', 'stop'].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}\n\n${USAGE}`);
  }

  const homes = discoverHomes();
  if (homes.length === 0) {
    throw new Error('No DSH home found. Set DSH_PROFILE_ROOT or DSH_HOME, or install DSH first.');
  }

  if (options.command === 'status') {
    const failures = await reportStatus(selectHomes(homes, options.homes));
    return failures > 0 ? 1 : 0;
  }

  if (options.homes.length === 0) {
    throw new Error(`--home <name> is required for ${options.command}\n\n${USAGE}`);
  }
  const selected = selectHomes(homes, options.homes);
  if (selected.length > 1 && options.port !== undefined) {
    throw new Error('--port applies to one home at a time');
  }

  let failures = 0;
  for (const home of selected) {
    try {
      await runCommand(options.command, home, options, homes);
    } catch (error) {
      failures += 1;
      process.stderr.write(`${path.basename(home)}: ${messageOf(error)}\n`);
    }
  }
  return failures > 0 ? 1 : 0;
}

const invokedUrl =
  process.argv[1] === undefined ? '' : pathToFileURL(path.resolve(process.argv[1])).href;
if (import.meta.url === invokedUrl) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`error: ${messageOf(error)}\n`);
      process.exitCode = 1;
    });
}
