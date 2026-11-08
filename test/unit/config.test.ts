import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cleanTmpDir,
  ensureDataDirs,
  loadConfig,
  resolveConfigPath,
} from '../../src/server/config.js';
import { testConfig } from '../helpers/http.js';

/** Write a config file with a token, so `loadConfig` never rewrites it. */
function tempConfig(extra: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-config-'));
  const file = path.join(dir, 'config.json');
  fs.writeFileSync(file, `${JSON.stringify({ token: 'test-token', ...extra }, null, 2)}\n`);
  return file;
}

/** Run `body` with `name` set to `value`, restoring the previous value. */
function withEnv(name: string, value: string, body: () => void): void {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    body();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

describe('startup temp cleanup', () => {
  it('removes leftover upload staging files and directories', () => {
    const config = testConfig();
    ensureDataDirs(config);
    fs.writeFileSync(path.join(config.tmpDir, 'upload-leftover.tmp'), 'partial');
    fs.mkdirSync(path.join(config.tmpDir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(config.tmpDir, 'nested', 'upload.tmp'), 'partial');

    cleanTmpDir(config);

    expect(fs.readdirSync(config.tmpDir)).toHaveLength(0);
    expect(fs.existsSync(config.tmpDir)).toBe(true);
  });
});

describe('config path resolution', () => {
  it('honours an explicit config path', () => {
    const configPath = tempConfig();
    expect(resolveConfigPath(configPath)).toBe(configPath);
  });

  it('reads data_dir from the config file', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-data-'));
    const configPath = tempConfig({ data_dir: dataDir });
    expect(loadConfig({ configPath }).dataDir).toBe(dataDir);
  });

  it('treats a blank SHARED_CONTEXT_DATA_DIR as unset', () => {
    const configPath = tempConfig();
    let dataDir = '';
    withEnv('SHARED_CONTEXT_DATA_DIR', '   ', () => {
      dataDir = loadConfig({ configPath }).dataDir;
    });
    expect(dataDir).not.toBe('');
    expect(path.isAbsolute(dataDir)).toBe(true);
  });
});

describe('config portability guard', () => {
  it.skipIf(process.platform === 'win32')('rejects a Windows drive path', () => {
    const configPath = tempConfig();
    expect(() => loadConfig({ configPath, dataDir: 'C:\\Users\\me\\shared-context' })).toThrow(
      /Windows drive path/,
    );
  });

  it.skipIf(process.platform === 'win32')('rejects a Windows UNC path', () => {
    const configPath = tempConfig();
    expect(() => loadConfig({ configPath, dataDir: '\\\\server\\share\\sc' })).toThrow(
      /Windows UNC path/,
    );
  });

  it.skipIf(process.platform === 'win32')('rejects a Windows path from the config file', () => {
    const configPath = tempConfig({ data_dir: 'C:\\Users\\me\\shared-context' });
    expect(() => loadConfig({ configPath })).toThrow(/Windows drive path/);
  });

  it('rejects a relative path', () => {
    const configPath = tempConfig();
    expect(() => loadConfig({ configPath, dataDir: 'relative/dir' })).toThrow(/not absolute/);
  });

  it('rejects an unexpanded tilde', () => {
    const configPath = tempConfig();
    expect(() => loadConfig({ configPath, dataDir: '~/shared-context' })).toThrow(/not expanded/);
  });

  it.skipIf(process.platform !== 'win32')('rejects a POSIX absolute path on Windows', () => {
    const configPath = tempConfig();
    expect(() => loadConfig({ configPath, dataDir: '/home/me/shared-context' })).toThrow(
      /POSIX absolute path/,
    );
  });
});
