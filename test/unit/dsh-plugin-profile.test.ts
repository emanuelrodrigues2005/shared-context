import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// The DSH plugin is plain JavaScript loaded by the Harness module loader; its
// resolver is the deployment boundary this test pins.
import { resolveDaemonSettings } from '../../dsh-plugin/index.js';

const roots: string[] = [];

function tempBase(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-resolver-'));
  roots.push(directory);
  return directory;
}

function writeConfig(file: string, config: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config)}\n`);
}

function writeProfile(home: string, config: unknown): void {
  writeConfig(path.join(home, 'shared-context', 'config.json'), config);
}

function resolve(home: string | undefined, base: string, env: Record<string, string> = {}) {
  return resolveDaemonSettings(undefined, {
    env: { ...(home === undefined ? {} : { DSH_HOME: home }), ...env },
    platform: 'linux',
    homedir: base,
  });
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

describe('resolveDaemonSettings', () => {
  it('uses a home profile config before the global config', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, {
      port: 4320,
      token: 'profile-token',
      data_dir: path.join(home, 'shared-context'),
    });

    const result = resolve(home, base);

    expect(result.baseUrl).toBe('http://127.0.0.1:4320');
    expect(result.home).toBe('pessoal');
    expect(result.source).toBe('profile');
    expect(result.error).toBeUndefined();
  });

  it('lets SHARED_CONTEXT_URL win over every config file', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 4320, token: 'profile-token' });

    const result = resolve(home, base, { SHARED_CONTEXT_URL: 'http://127.0.0.1:9999' });

    expect(result.baseUrl).toBe('http://127.0.0.1:9999');
    expect(result.source).toBe('env');
    expect(result.home).toBe('pessoal');
  });

  it('fails closed when SHARED_CONTEXT_URL is not a loopback origin', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 4320, token: 'profile-token' });

    const result = resolve(home, base, { SHARED_CONTEXT_URL: 'http://example.com:9999' });

    expect(result.baseUrl).toBe('http://127.0.0.1:1');
    expect(result.source).toBe('fail-closed');
    expect(result.error).toMatch(/loopback/);
  });

  it('treats a non-default loopback row origin as an explicit override', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 4320, token: 'profile-token' });

    const result = resolveDaemonSettings('http://127.0.0.1:4321', {
      env: { DSH_HOME: home },
      platform: 'linux',
      homedir: base,
    });

    expect(result.baseUrl).toBe('http://127.0.0.1:4321');
    expect(result.source).toBe('config');
    expect(result.home).toBe('pessoal');
  });

  it('lets an explicit row origin outrank SHARED_CONTEXT_CONFIG', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 4320, token: 'profile-token' });
    const explicit = path.join(base, 'explicit.json');
    writeConfig(explicit, { port: 4400, token: 'explicit-token' });

    const result = resolveDaemonSettings('http://127.0.0.1:4321', {
      env: { DSH_HOME: home, SHARED_CONTEXT_CONFIG: explicit },
      platform: 'linux',
      homedir: base,
    });

    expect(result.baseUrl).toBe('http://127.0.0.1:4321');
    expect(result.source).toBe('config');
  });

  it('keeps an already-installed row pinned to the legacy default resolving', () => {
    const base = tempBase();
    const home = path.join(base, 'empresa');
    fs.mkdirSync(home, { recursive: true });
    writeConfig(path.join(base, 'config', 'shared-context', 'config.json'), { port: 4400 });

    const result = resolveDaemonSettings('http://127.0.0.1:4319', {
      env: { DSH_HOME: home, XDG_CONFIG_HOME: path.join(base, 'config') },
      platform: 'linux',
      homedir: base,
    });

    expect(result.baseUrl).toBe('http://127.0.0.1:4400');
    expect(result.source).toBe('global');
  });

  it('fails closed when a profile directory has no config', () => {
    const base = tempBase();
    const home = path.join(base, 'sem-config');
    fs.mkdirSync(path.join(home, 'shared-context'), { recursive: true });

    const result = resolve(home, base);

    expect(result.baseUrl).toBe('http://127.0.0.1:1');
    expect(result.home).toBe('sem-config');
    expect(result.source).toBe('fail-closed');
    expect(result.error).toMatch(/missing or unreadable/);
  });

  it('fails closed when a profile config has an invalid port', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 70000, token: 'profile-token' });

    const result = resolve(home, base);

    expect(result.baseUrl).toBe('http://127.0.0.1:1');
    expect(result.source).toBe('fail-closed');
    expect(result.error).toMatch(/valid port/);
  });

  it('uses SHARED_CONTEXT_CONFIG ahead of the profile path', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 4320, token: 'profile-token' });
    const explicit = path.join(base, 'explicit.json');
    writeConfig(explicit, { port: 4400, token: 'explicit-token' });

    const result = resolve(home, base, { SHARED_CONTEXT_CONFIG: explicit });

    expect(result.baseUrl).toBe('http://127.0.0.1:4400');
    expect(result.source).toBe('config');
  });

  it('fails closed when SHARED_CONTEXT_CONFIG is unreadable', () => {
    const base = tempBase();
    const home = path.join(base, 'pessoal');
    writeProfile(home, { port: 4320, token: 'profile-token' });

    const result = resolve(home, base, {
      SHARED_CONTEXT_CONFIG: path.join(base, 'missing.json'),
    });

    expect(result.baseUrl).toBe('http://127.0.0.1:1');
    expect(result.source).toBe('fail-closed');
    expect(result.error).toMatch(/SHARED_CONTEXT_CONFIG/);
  });

  it('falls back to the platform global config when the home has no profile directory', () => {
    const base = tempBase();
    const home = path.join(base, 'empresa');
    fs.mkdirSync(home, { recursive: true });
    writeConfig(path.join(base, 'config', 'shared-context', 'config.json'), {
      port: 4400,
      token: 'global-token',
    });

    const result = resolve(home, base, { XDG_CONFIG_HOME: path.join(base, 'config') });

    expect(result.baseUrl).toBe('http://127.0.0.1:4400');
    expect(result.source).toBe('global');
    expect(result.home).toBe('empresa');
  });

  it('defaults the global port to 4319 when no config exists', () => {
    const base = tempBase();
    const home = path.join(base, 'empresa');
    fs.mkdirSync(home, { recursive: true });

    const result = resolve(home, base, { XDG_CONFIG_HOME: path.join(base, 'config') });

    expect(result.baseUrl).toBe('http://127.0.0.1:4319');
    expect(result.source).toBe('global');
  });

  it('checks ~/.dsh but reports no home label when DSH_HOME is unset', () => {
    const base = tempBase();
    writeConfig(path.join(base, '.dsh', 'shared-context', 'config.json'), { port: 4460 });

    const result = resolve(undefined, base);

    expect(result.baseUrl).toBe('http://127.0.0.1:4460');
    expect(result.home).toBeNull();
    expect(result.source).toBe('profile');
  });
});
