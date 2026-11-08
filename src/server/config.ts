import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  configPath: string;
  dbPath: string;
  attachmentsDir: string;
  tmpDir: string;
  backupDir: string;
  logDir: string;
  token: string;
  logLevel: string;
  backupHour: number;
  backupRetentionDays: number;
}

interface FileConfig {
  port?: number;
  token?: string;
  data_dir?: string;
  backup_dir?: string;
  backup_hour?: number;
  backup_retention_days?: number;
  log_level?: string;
  theme?: string;
}

/**
 * Read an environment variable, treating a blank value as unset.
 *
 * A stray `SHARED_CONTEXT_DATA_DIR=` would otherwise win over the file and the
 * default through `??`, resolving the data directory to the empty string.
 *
 * @param name - variable name.
 * @returns the trimmed value, or undefined when unset or blank.
 */
function envValue(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Report a configuration problem before the logger exists.
 *
 * @param message - one line for stderr.
 */
function warn(message: string): void {
  process.stderr.write(`${message}\n`);
}

function xdgConfigHome(): string {
  return envValue('XDG_CONFIG_HOME') ?? path.join(os.homedir(), '.config');
}

function defaultDataDir(): string {
  if (process.platform === 'win32') {
    return path.join(
      envValue('LOCALAPPDATA') ?? path.join(os.homedir(), 'AppData', 'Local'),
      'shared-context',
    );
  }
  return path.join(os.homedir(), '.local', 'share', 'shared-context');
}

function defaultConfigPath(): string {
  if (process.platform === 'win32') {
    return path.join(
      envValue('APPDATA') ?? path.join(os.homedir(), 'AppData', 'Roaming'),
      'shared-context',
      'config.json',
    );
  }
  return path.join(xdgConfigHome(), 'shared-context', 'config.json');
}

/** Where Linux and macOS installs kept `config.json` before `XDG_CONFIG_HOME`. */
function legacyConfigPath(): string {
  return path.join(os.homedir(), '.config', 'shared-context', 'config.json');
}

/**
 * Resolve the config file path.
 *
 * Precedence: an explicit argument, `SHARED_CONTEXT_CONFIG`, then the platform
 * default — `%APPDATA%` on Windows, `${XDG_CONFIG_HOME:-~/.config}` elsewhere.
 * When the XDG path differs from the legacy location and only the legacy file
 * exists, that file wins: an upgrade must not generate a new token and lock
 * every MCP client out.
 *
 * @param explicit - path supplied by a caller or a test.
 * @returns the path to read and write.
 */
export function resolveConfigPath(explicit?: string): string {
  const requested = explicit ?? envValue('SHARED_CONTEXT_CONFIG');
  if (requested !== undefined) return requested;

  const preferred = defaultConfigPath();
  if (process.platform === 'win32') return preferred;

  const legacy = legacyConfigPath();
  if (legacy === preferred) return preferred;

  const hasPreferred = fs.existsSync(preferred);
  const hasLegacy = fs.existsSync(legacy);
  if (!hasPreferred && hasLegacy) {
    warn(
      `shared-context: using the legacy config at ${legacy}; move it to ${preferred} when convenient.`,
    );
    return legacy;
  }
  if (hasPreferred && hasLegacy) {
    warn(
      `shared-context: ${preferred} and ${legacy} both exist; using the former and ignoring the legacy file.`,
    );
  }
  return preferred;
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

/**
 * Read a config file without creating or rewriting it.
 *
 * Exported so offline checks can reuse the daemon's path and token resolution
 * instead of duplicating it; never use `loadConfig` for that, because it writes
 * a config (and a fresh token) when the file is absent.
 *
 * @param configPath - resolved path to read.
 * @returns the parsed contents, or an empty object when the file is absent.
 */
export function readConfigFile(configPath: string): FileConfig {
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as FileConfig;
  } catch (error) {
    throw new Error(`Cannot parse config file ${configPath}`, { cause: error });
  }
}

function writeFileConfig(configPath: string, file: FileConfig): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') {
    fs.chmodSync(configPath, 0o600);
  }
}

const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const WINDOWS_UNC_PATH = /^\\\\/;
const POSIX_ABSOLUTE_PATH = /^\/(?!\/)/;

/**
 * Reject a path written in the other platform's absolute-path grammar.
 *
 * `path.isAbsolute('C:\\Users\\me')` is false on POSIX, so without this guard a
 * config copied from Windows makes the daemon create a literal `C:\Users\me`
 * directory tree inside the working directory instead of failing loudly.
 *
 * @param label - field name for the message.
 * @param value - resolved absolute path.
 * @param source - where the value came from, for the message.
 */
function assertPortablePath(label: string, value: string, source: string): void {
  const fail = (reason: string): never => {
    throw new Error(
      `Invalid ${label} "${value}" (from ${source}): ${reason}. ` +
        'Point it at an absolute path for this platform, or unset it, then retry.',
    );
  };

  if (value === '') fail('the path is empty');
  if (value.startsWith('~')) fail('a leading "~" is not expanded by the daemon');

  if (process.platform === 'win32') {
    if (POSIX_ABSOLUTE_PATH.test(value)) fail('a POSIX absolute path is not valid on Windows');
    if (!path.isAbsolute(value)) fail('the path is not absolute');
    return;
  }

  if (WINDOWS_DRIVE_PATH.test(value)) fail('a Windows drive path is not valid on this platform');
  if (WINDOWS_UNC_PATH.test(value)) fail('a Windows UNC path is not valid on this platform');
  if (!path.isAbsolute(value)) fail('the path is not absolute');
}

export function persistConfigToken(configPath: string, token: string): void {
  const file = readConfigFile(configPath);
  writeFileConfig(configPath, { ...file, token });
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const configPath = resolveConfigPath(overrides.configPath);
  const file = readConfigFile(configPath);

  const envDataDir = envValue('SHARED_CONTEXT_DATA_DIR');
  const dataDir = overrides.dataDir ?? envDataDir ?? file.data_dir ?? defaultDataDir();
  const dataDirSource =
    overrides.dataDir !== undefined
      ? 'the caller'
      : envDataDir !== undefined
        ? 'SHARED_CONTEXT_DATA_DIR'
        : file.data_dir !== undefined
          ? configPath
          : 'the platform default';

  const token =
    overrides.token ??
    envValue('SHARED_CONTEXT_TOKEN') ??
    file.token ??
    randomBytes(32).toString('base64url');

  const port = overrides.port ?? parsePort(envValue('SHARED_CONTEXT_PORT')) ?? file.port ?? 4319;

  const backupDir = overrides.backupDir ?? file.backup_dir ?? path.join(dataDir, 'backups');
  const backupDirSource =
    overrides.backupDir !== undefined
      ? 'the caller'
      : file.backup_dir !== undefined
        ? configPath
        : 'the default for data_dir';

  assertPortablePath(
    'config path',
    configPath,
    'SHARED_CONTEXT_CONFIG or the platform default',
  );
  assertPortablePath('data_dir', dataDir, dataDirSource);
  assertPortablePath('backup_dir', backupDir, backupDirSource);

  const config: AppConfig = {
    port,
    host: '127.0.0.1',
    dataDir,
    configPath,
    dbPath: path.join(dataDir, 'data', 'shared-context.db'),
    attachmentsDir: path.join(dataDir, 'data', 'attachments'),
    tmpDir: path.join(dataDir, 'data', 'tmp'),
    backupDir,
    logDir: path.join(dataDir, 'logs'),
    token,
    logLevel: overrides.logLevel ?? envValue('LOG_LEVEL') ?? file.log_level ?? 'info',
    backupHour: overrides.backupHour ?? file.backup_hour ?? 3,
    backupRetentionDays: overrides.backupRetentionDays ?? file.backup_retention_days ?? 14,
  };

  if (!fs.existsSync(configPath) || !file.token) {
    writeFileConfig(configPath, {
      port: config.port,
      token: config.token,
      data_dir: config.dataDir,
      backup_dir: config.backupDir,
      backup_hour: config.backupHour,
      backup_retention_days: config.backupRetentionDays,
      log_level: config.logLevel,
      theme: file.theme ?? 'dark',
    });
  }

  return config;
}

export function ensureDataDirs(config: AppConfig): void {
  for (const directory of [
    config.dataDir,
    path.dirname(config.dbPath),
    config.attachmentsDir,
    config.tmpDir,
    config.backupDir,
    config.logDir,
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * Remove staging files left by a crash or killed upload. Only call this at
 * startup, when no upload can be in flight for this data directory.
 */
export function cleanTmpDir(config: AppConfig): void {
  if (!fs.existsSync(config.tmpDir)) return;
  for (const entry of fs.readdirSync(config.tmpDir)) {
    fs.rmSync(path.join(config.tmpDir, entry), { recursive: true, force: true });
  }
}
