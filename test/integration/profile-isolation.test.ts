import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AppConfig } from '../../src/server/config.js';
import { ensureDataDirs } from '../../src/server/config.js';
import { closeDatabase, openDatabase } from '../../src/server/db/connection.js';
import { migrate } from '../../src/server/db/migrate.js';
import { createApp } from '../../src/server/http/server.js';
import { createLogger } from '../../src/server/logger.js';
import { setupProject } from '../helpers/http.js';

const roots: string[] = [];

function configFor(root: string, token: string): AppConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    dataDir: root,
    configPath: path.join(root, 'config.json'),
    dbPath: path.join(root, 'data', 'shared-context.db'),
    attachmentsDir: path.join(root, 'data', 'attachments'),
    tmpDir: path.join(root, 'data', 'tmp'),
    backupDir: path.join(root, 'backups'),
    logDir: path.join(root, 'logs'),
    token,
    logLevel: 'silent',
    backupHour: 3,
    backupRetentionDays: 14,
  };
}

function createStore(root: string, token: string) {
  const config = configFor(root, token);
  ensureDataDirs(config);
  const db = openDatabase(config.dbPath);
  migrate(db);
  const app = createApp({ db, config, logger: createLogger('silent') });
  return { db, app, config, csrfToken: app.locals.csrfToken as string };
}

afterEach(() => {
  while (roots.length > 0) {
    fs.rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

describe('DSH profile store isolation', () => {
  it('keeps two data roots and their credentials independent', async () => {
    const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-isolation-a-'));
    const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-context-isolation-b-'));
    roots.push(rootA, rootB);

    const personal = createStore(rootA, 'token-personal');
    const empresa = createStore(rootB, 'token-empresa');

    try {
      await setupProject(personal.app, personal.csrfToken, 'PER');
      await setupProject(empresa.app, empresa.csrfToken, 'EMP');

      const createdPersonal = await request(personal.app)
        .post('/api/issues')
        .set('X-CSRF-Token', personal.csrfToken)
        .send({ project: 'PER', title: 'Only in the personal store' });
      expect(createdPersonal.status).toBe(201);

      // B's setup created EMP in B's own store; it must never see A's PER.
      const empresaProjects = await request(empresa.app).get('/api/projects');
      expect(empresaProjects.status).toBe(200);
      expect(empresaProjects.body.items.map((project: { key: string }) => project.key)).toEqual([
        'EMP',
      ]);

      const createdEmpresa = await request(empresa.app)
        .post('/api/issues')
        .set('X-CSRF-Token', empresa.csrfToken)
        .send({ project: 'EMP', title: 'Only in the empresa store' });
      expect(createdEmpresa.status).toBe(201);

      const personalProjects = await request(personal.app).get('/api/projects');
      expect(personalProjects.status).toBe(200);
      expect(personalProjects.body.items).toHaveLength(1);
      expect(personalProjects.body.items[0].key).toBe('PER');

      const personalIssues = await request(personal.app).get('/api/issues?project=PER');
      expect(personalIssues.status).toBe(200);
      expect(personalIssues.body.items).toHaveLength(1);

      const initialize = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'profile-isolation-test', version: '0.1.0' },
        },
      };

      const personalTokenOnEmpresa = await request(empresa.app)
        .post('/mcp')
        .set('Authorization', 'Bearer token-personal')
        .send(initialize);
      expect(personalTokenOnEmpresa.status).toBe(401);

      const empresaTokenOnPersonal = await request(personal.app)
        .post('/mcp')
        .set('Authorization', 'Bearer token-empresa')
        .send(initialize);
      expect(empresaTokenOnPersonal.status).toBe(401);
    } finally {
      closeDatabase(personal.db);
      closeDatabase(empresa.db);
    }
  });
});
