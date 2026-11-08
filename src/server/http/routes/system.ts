import { Router } from 'express';
import type { Database } from '../../db/connection.js';
import type { AppConfig } from '../../config.js';
import { identifyActor, listActors, updateActor } from '../../domain/actors.js';
import { actorRowToRef } from '../../domain/actors.js';
import { DomainError } from '../../domain/errors.js';
import { searchIssues } from '../../domain/issues.js';
import { createProject, getProject } from '../../domain/projects.js';
import { readLastBackup } from '../../services/backups.js';
import {
  actorCreateSchema,
  actorUpdateSchema,
  parseBody,
  queryNumber,
  queryString,
  setupSchema,
} from '../schemas.js';
import { ownerActorRow } from '../actor-context.js';

function setupRequired(db: Database): boolean {
  const humans = db
    .prepare(`SELECT COUNT(*) AS count FROM actors WHERE kind = 'human'`)
    .get() as unknown as { count: number };
  const projects = db
    .prepare('SELECT COUNT(*) AS count FROM projects')
    .get() as unknown as { count: number };
  return humans.count === 0 || projects.count === 0;
}

export interface SystemRouterDeps {
  db: Database;
  config: AppConfig;
  csrfToken: string;
}

export function createSystemRouter({ db, config, csrfToken }: SystemRouterDeps): Router {
  const router = Router();

  router.get('/csrf', (_request, response) => {
    response.cookie('sc_csrf', csrfToken, {
      httpOnly: false,
      sameSite: 'strict',
      path: '/',
    });
    response.json({ ok: true, token: csrfToken });
  });

  router.get('/config', (_request, response) => {
    const schema = db.prepare('PRAGMA user_version').get() as unknown as {
      user_version: number;
    };
    response.json({
      ok: true,
      version: '0.1.0',
      /** `process.platform`, so the UI can show the right startup commands. */
      platform: process.platform,
      port: config.port,
      data_dir: config.dataDir,
      attachments_dir: config.attachmentsDir,
      config_path: config.configPath,
      log_dir: config.logDir,
      backup_dir: config.backupDir,
      backup_hour: config.backupHour,
      backup_retention_days: config.backupRetentionDays,
      schema_version: schema.user_version,
      uptime_seconds: process.uptime(),
      setup_required: setupRequired(db),
      last_backup: readLastBackup(config),
    });
  });

  router.get('/setup', (_request, response) => {
    response.json({ ok: true, required: setupRequired(db) });
  });

  router.post('/setup', (request, response) => {
    const body = parseBody(setupSchema, request.body);
    const ownerActor = ownerActorRow(db);
    let actor;
    if (!ownerActor) {
      actor = identifyActor(db, { name: body.owner_name, kind: 'human' });
    } else {
      actor = actorRowToRef(ownerActor);
    }

    let project = null;
    if (body.project_key) {
      try {
        project = getProject(db, body.project_key);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== 'not_found') throw error;
        project = createProject(db, {
          key: body.project_key,
          name: body.project_name ?? body.project_key,
        });
      }
    }

    response.json({ ok: true, actor, project });
  });

  router.get('/actors', (_request, response) => {
    response.json({ ok: true, items: listActors(db) });
  });

  router.post('/actors', (request, response) => {
    const body = parseBody(actorCreateSchema, request.body);
    const actor = identifyActor(db, {
      name: body.name,
      kind: body.kind ?? 'agent',
      can_read_images: body.can_read_images,
    });
    const updated =
      body.color === undefined ? actor : updateActor(db, actor.id, { color: body.color });
    response.status(201).json({ ok: true, actor: updated });
  });

  router.patch('/actors/:id', (request, response) => {
    const body = parseBody(actorUpdateSchema, request.body);
    const actor = updateActor(db, request.params.id, body);
    response.json({ ok: true, actor });
  });

  router.get('/search', (request, response) => {
    const query = queryString(request.query.q);
    if (!query) {
      throw new DomainError('validation_error', 'q is required');
    }
    const limit = queryNumber(request.query.limit) ?? 20;
    response.json({ ok: true, items: searchIssues(db, query, limit) });
  });

  return router;
}
