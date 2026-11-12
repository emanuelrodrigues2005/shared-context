import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  provisionProfile,
  readProfileConfig,
  resolveProfilePaths,
  startProfile,
} from '../../scripts/dsh-profiles.mjs';

const ENV_KEYS = [
  'APPDATA',
  'DSH_HOME',
  'DSH_PROFILE_ROOT',
  'LOCALAPPDATA',
  'SHARED_CONTEXT_CONFIG',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
];

let sandbox: string;
let savedEnv: Record<string, string | undefined>;

function fakeProfilesRoot(base: string): string {
  const root = path.join(base, 'profiles-root');
  fs.mkdirSync(path.join(root, 'fake-home', 'profiles'), { recursive: true });
  return root;
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-profiles-'));
  process.env.DSH_PROFILE_ROOT = fakeProfilesRoot(sandbox);
  delete process.env.DSH_HOME;
  process.env.SHARED_CONTEXT_CONFIG = path.join(sandbox, 'absent-global-config.json');
  process.env.XDG_CONFIG_HOME = path.join(sandbox, 'xdg-config');
  process.env.XDG_DATA_HOME = path.join(sandbox, 'xdg-data');
  process.env.APPDATA = path.join(sandbox, 'appdata');
  process.env.LOCALAPPDATA = path.join(sandbox, 'localappdata');
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('dsh profile provisioning', () => {
  it('writes an isolated config with owner-only permissions and is idempotent', async () => {
    const home = path.join(sandbox, 'pessoal');
    fs.mkdirSync(home, { recursive: true });
    const paths = resolveProfilePaths(home);

    expect(paths.config).toBe(path.join(home, 'shared-context', 'config.json'));
    expect(paths.dataDir).toBe(paths.root);

    const first = await provisionProfile(home, {
      start: false,
      port: 54321,
      isFree: async () => true,
    });

    expect(first.created).toBe(true);
    expect(first.started).toBe(false);
    expect(fs.existsSync(paths.config)).toBe(true);
    if (process.platform !== 'win32') {
      expect(fs.statSync(paths.config).mode & 0o777).toBe(0o600);
      expect(fs.statSync(paths.root).mode & 0o777).toBe(0o700);
    }

    const config = readProfileConfig(paths);
    expect(config).not.toBeNull();
    expect(typeof config?.token).toBe('string');
    expect(String(config?.token).length).toBeGreaterThan(20);
    expect(config?.port).toBe(54321);
    expect(path.resolve(String(config?.data_dir))).toBe(paths.dataDir);
    expect(path.resolve(String(config?.data_dir)).startsWith(home)).toBe(true);

    const second = await provisionProfile(home, {
      start: false,
      port: 54322,
      isFree: async () => true,
    });

    expect(second.created).toBe(false);
    expect(second.warning).toMatch(/keeping/);
    const again = readProfileConfig(paths);
    expect(again?.token).toBe(config?.token);
    expect(again?.port).toBe(54321);
  });

  it('does not write anything on a dry run', async () => {
    const home = path.join(sandbox, 'pessoal');
    fs.mkdirSync(home, { recursive: true });
    const paths = resolveProfilePaths(home);

    const outcome = await provisionProfile(home, {
      start: false,
      port: 54323,
      dryRun: true,
      isFree: async () => true,
    });

    expect(outcome.dryRun).toBe(true);
    expect(fs.existsSync(paths.config)).toBe(false);
  });

  it('refuses a profile data_dir that overlaps the global store', async () => {
    const globalDir = path.join(sandbox, 'global-store');
    fs.mkdirSync(globalDir, { recursive: true });
    const globalConfig = path.join(sandbox, 'global-config.json');
    fs.writeFileSync(
      globalConfig,
      `${JSON.stringify({ port: 4319, token: 'global-token', data_dir: globalDir })}\n`,
    );
    process.env.SHARED_CONTEXT_CONFIG = globalConfig;

    const home = path.join(sandbox, 'pessoal');
    const paths = resolveProfilePaths(home);
    fs.mkdirSync(paths.root, { recursive: true });
    fs.writeFileSync(
      paths.config,
      `${JSON.stringify({ port: 54324, token: 'profile-token', data_dir: globalDir })}\n`,
    );

    await expect(startProfile(home, { healthTimeoutMs: 1 })).rejects.toThrow(
      /overlaps the Shared Context store/,
    );
    await expect(
      provisionProfile(home, { start: false, port: 54324, isFree: async () => true }),
    ).rejects.toThrow(/overlaps the Shared Context store/);
  });

  it('refuses to provision a profile root that is the global store', async () => {
    const globalDir = path.join(sandbox, 'shared-context');
    fs.mkdirSync(globalDir, { recursive: true });
    const globalConfig = path.join(sandbox, 'global-config.json');
    fs.writeFileSync(
      globalConfig,
      `${JSON.stringify({ port: 4319, token: 'global-token', data_dir: globalDir })}\n`,
    );
    process.env.SHARED_CONTEXT_CONFIG = globalConfig;

    await expect(
      provisionProfile(sandbox, { start: false, port: 54325, isFree: async () => true }),
    ).rejects.toThrow(/overlaps the Shared Context store/);
  });
});
