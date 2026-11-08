import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-ui-'));
/** Overridable so a busy port or a shared host cannot wedge the smoke run. */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4322);

export default defineConfig({
  testDir: './test/ui',
  outputDir: 'test-results/ui',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // No `channel`: the suite runs on Playwright's own bundled Chromium on every
  // platform, so a branded Chrome install is never a prerequisite. Install it
  // once with `npx playwright install chromium` (CI does this in the workflow).
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node dist/server/index.js',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      SHARED_CONTEXT_DATA_DIR: dataDir,
      SHARED_CONTEXT_CONFIG: path.join(dataDir, 'config.json'),
      SHARED_CONTEXT_PORT: String(port),
      LOG_LEVEL: 'silent',
    },
  },
});