# Shared Context

A local, multi-project issue tracker and context service for coding agents, exposed over MCP.

**Status:** M0 (scaffold), M1 (schema + domain), M2 (HTTP API + SSE), M3 (MCP), M4 (board UI), M5 (editable drawer), M6 (attachments + command palette), and M7 (settings, trash, export, backup, startup) are implemented. No milestone is pending.

## Start here

- [`plan/README.md`](plan/README.md) — plan index, locked decisions, milestone tracker.
- [`CONTEXT.md`](CONTEXT.md) — domain glossary (the vocabulary source of truth).
- [`docs/adr/`](docs/adr/) — eight decision records.
- [`AGENTS.md`](AGENTS.md) — project memory for coding agents.

## What works now

- One local daemon on `127.0.0.1:4319` with `/healthz`.
- SQLite schema with WAL, FTS5, migrations, and the full repository layer.
- Domain services for Projects, Actors, Modules, Issues, hierarchy/progress, revisions, claims, blocking, soft delete/restore, activity, comments, links, attachments metadata, and allowlisted project docs.
- HTTP JSON API for setup, projects, modules, issues, comments, links, actors, search, board, context, docs, activity, and attachments (multipart upload, content, OS open).
- MCP Streamable HTTP at `/mcp` with bearer auth, stateful sessions, `identify`, and all 23 tools.
- Attachment copy/hash/dedupe, text and PDF extraction, capability-gated image content for MCP, and realpath-contained file serving.
- Kanban board with six columns, collapsible Done/Cancelled, compact cards, child progress, drag-and-drop, URL filters, saved views, and live SSE invalidation.
- Editable Issue drawer: immediate Stage/Priority/Assignee/Module/Parent/Blocked updates, explicit title/description saves, conflict banner with reload/copy-draft, children creation, comments, delete dialog, attachments with thumbnails/upload/open/download/remove, links with add/remove, and activity.
- `Ctrl/Cmd+K` command palette: debounced cross-Project search, recent Issues/Projects, Issue and Project jumps, and actions for new Issue, board, settings, and theme.
- Project sidebar, setup flow, create-issue modal, and a full Project settings screen: name/description/root path, doc allowlist, Module manager with usage counts, Trash batch restore, backup status/Backup now, Markdown/JSON export, and empty-Project deletion.
- DeepSeek Harness plugin (`dsh-plugin/`): a left-sidebar **Issues** entry and a Shared Context board panel inside the Harness Web UI, with Project chips, Stage columns, an Issue drawer, Stage moves, comments, and new-Issue creation.
- DeepSeek Harness agent presets (`dsh-preset/`): a tracker-owning orchestrator that triages Issues and delegates to tracker-free implementer, reviewer, and researcher presets over the MCP tools.
- Global settings: theme/density, reveal/copy/regenerate MCP token, server paths/version/uptime, startup and Reasonix snippets, and Actor capability editing.
- Daily backups with catch-up, integrity verification, attachment mirroring, retention, and a documented restore procedure.
- CSRF, host, and origin guards; SSE replay from the Activity cursor; `waitForChange`.
- 65 domain, HTTP, SSE, MCP, and concurrency tests, 5 docs/plan/schema guards, and a Playwright UI smoke suite run by `npm test`.

UI smoke tests run with Playwright against the built daemon (`npm run test:ui`). Local runs use the installed Chrome channel; CI installs Chromium.

## Commands

```sh
npm install
npm run dev        # server watch + Vite
npm run typecheck
npm run lint
npm test           # docs guards + Vitest + Playwright smoke
npm run test:ui    # build + Playwright smoke only
npm run build      # dist/server + dist/web
npm start          # built daemon
```

Windows logon task (run `npm run build` first):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-startup.ps1
```

The daemon stores data under `%LOCALAPPDATA%\shared-context` by default. Override with `SHARED_CONTEXT_DATA_DIR` for a portable or test install.

## Backup, export, and restore

- Backups run daily at 03:00 local time, catch up on startup if the last successful backup is over 24 hours old, and can be run immediately from Project settings.
- Each backup verifies the SQLite snapshot with `PRAGMA integrity_check`, mirrors new attachment directories, and keeps the last 14 snapshots.
- Project settings exports a Markdown zip (one file per Issue plus `_board.md`) or a JSON snapshot without attachment bytes.
- Restore steps, including WAL cleanup and the attachment mirror, are in [`docs/restore.md`](docs/restore.md).

## Docs

- [`plan/00-overview.md`](plan/00-overview.md) — architecture and scope.
- [`plan/02-data-model.md`](plan/02-data-model.md) — executable schema.
- [`plan/03-concurrency.md`](plan/03-concurrency.md) — revisions and atomic claims.
- [`plan/10-build-order.md`](plan/10-build-order.md) — M0–M7.
- [`docs/restore.md`](docs/restore.md) — backup restore procedure.

## Repository

https://github.com/zauns/shared-context
