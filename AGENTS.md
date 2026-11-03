# Shared Context

A local, multi-project issue tracker and context service for coding agents, exposed over MCP.

## Project

- Status: M0, M1, M2, M3, M4, M5, M6, and M7 are implemented. No milestone is pending; deferred items remain in the plan.
- Repository (private): https://github.com/zauns/shared-context
- Source of truth: `plan/README.md` (plan index and milestone tracker), `CONTEXT.md` (domain glossary), and `docs/adr/` (decision records).
- Stack: Node 24 + TypeScript, Express 5, `node:sqlite` (WAL + FTS5), React + Vite.
- Entry point: `src/server/index.ts`. One daemon on `127.0.0.1:4319` serving `/mcp`, `/api`, `/api/events`, and the UI.
- Data location: one global SQLite database plus managed attachments and backups under `%LOCALAPPDATA%\shared-context`.

## Commands

- `npm install` — install dependencies.
- `npm run dev` — tsx server watch + Vite dev server.
- `npm run typecheck` — typecheck server and web.
- `npm run lint` — ESLint.
- `npm test` — docs/plan/schema guards, all Vitest tests, and the Playwright UI smoke suite.
- `npm run test:ui` — build the app and run Playwright (local Chrome channel).
- `npm run test:unit` — unit tests only.
- `npm run test:concurrency` — concurrency invariants only.
- `npm run test:docs` — glossary, ADR, plan-link, and schema guards.
- `npm run build` — compile server and build UI.
- `npm start` — run the built daemon.
- `node dsh-plugin/scripts/check-host.mjs` — offline Host-half proxy checks (mock daemon + live read-only daemon).
- `node dsh-plugin/scripts/check-registration.mjs` / `check-render.mjs` / `check-css.mjs` — verify slot registrations, render the panel components server-side, and parse the injected stylesheet.
- `node dsh-preset/scripts/check-mcp.mjs` — verify the agent-preset bundle declarations and the live daemon MCP session (token, 23 tools, read-only call).
- `npm run format` — Prettier.
- `powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1` — register and start the `SharedContext` logon task (run `npm run build` first).
- `powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-startup.ps1` — stop and unregister the logon task.
- `gh run list --repo zauns/shared-context --limit 3` — check CI runs.

## Architecture

Implemented:

- `src/server/config.ts` — env/config resolution, data paths, token generation.
- `src/server/logger.ts` — pino with redaction.
- `src/server/db/connection.ts` — `node:sqlite`, WAL, foreign keys, `BEGIN IMMEDIATE` helper.
- `src/server/db/migrate.ts` + `db/migrations/001_init.sql` — versioned schema.
- `src/server/db/repositories/` — projects, actors, modules, issues, activities, comments, links, attachments.
- `src/server/domain/` — types, errors, validation, IDs, time, projects, project summaries, actors, modules, issues, activity, comments, links, attachments, docs.
- `src/server/http/server.ts` — Express app, host/CSRF guards, `/healthz`, API mounting, static UI fallback.
- `src/server/http/routes/` — system/setup/config/actors/search, projects/modules/board/context/docs, issues/comments/links, attachments upload/content/open/remove, and SSE events.
- `src/server/services/change-bus.ts` — post-commit publish, SSE fan-out, and `waitForChange`.
- `src/server/services/mutations.ts` — cursor-captured post-commit publishing for sync HTTP/MCP mutations and async attachment work.
- `src/server/services/attachments.ts` — file copy, hashing, dedupe, text/PDF extraction, image gating, and realpath-contained file resolution.
- `src/server/services/open-file.ts` — Windows default-handler launch with argument-safe `cmd /c start` (Explorer fallback), injectable for tests.
- `src/server/services/backups.ts` — verified `VACUUM INTO` snapshots, attachment mirroring, retention, last-backup status, and the daily/catch-up scheduler.
- `src/server/services/export.ts` — Markdown zip entries, JSON snapshot, and zip streaming.
- `src/server/http/routes/admin.ts` — manual backup, backup listing, Markdown/JSON export, and token reveal/regenerate.
- `src/server/domain/trash.ts` — deleted-batch listing and atomic batch restore.
- `src/server/mcp/` — Streamable HTTP transport, session state, bearer auth, tool result envelopes, and all 23 tools.
- `src/web/api/` — typed client, TanStack Query hooks, SSE invalidation, multipart upload, settings/backup/export APIs, and shared types.
- `src/web/components/` — shell/sidebar, board, cards, filters, create modal, toasts, command palette, and the editable Issue drawer with attachments and links.
- `src/web/routes/` — setup, home redirect, Project shell, board, deep-linked Issue route, full Project settings, and global settings.
- `src/web/lib/` — URL filter serialization, board position/move helpers, labels, byte formatting, and relative time.
- `src/web/state/` — theme, density, collapsed columns, saved views, last/recent Projects, and recent Issues.
- `src/web/` — React/Vite board UI with editable drawer, attachments, links, comments, children, conflict handling, settings, and a `Ctrl/Cmd+K` palette.
- `dsh-plugin/` — DeepSeek Harness bundle `dsh-plugin-shared-context`: a Host half that mounts a stable same-origin `/shared-context` proxy over `/api` (CSRF handled Host-side; mutations guarded by `Sec-Fetch-Site` plus a marker header) and a Client half that adds a left-sidebar Issues entry and a board panel to the Harness Web UI. `dsh-plugin/README.md` documents install, config, and checks.
- `dsh-preset/` — DeepSeek Harness bundle `dsh-preset-shared-context`: four agent presets. The orchestrator owns the tracker over the MCP client (bearer token read from the daemon config at activation) and delegates to tracker-free implementer, reviewer, and researcher presets through `agent_preset`. `dsh-preset/README.md` documents install, configuration, and checks.
- `scripts/install-startup.ps1` + `scripts/uninstall-startup.ps1` — Task Scheduler logon task with a custom-data/config wrapper and `/healthz` verification.
- `docs/restore.md` — stop, snapshot copy, WAL cleanup, attachment mirror, and verification steps.
- `test/helpers/db.ts` — in-memory migrated database and seed.
- `test/helpers/http.ts` — Supertest app with CSRF setup and an injectable OS opener.
- `test/unit/`, `test/integration/`, `test/concurrency/`, `test/mcp/` — domain, HTTP (including attachments/settings/backups/export), SSE, MCP, and concurrency tests.
- `test/ui/smoke.spec.ts` + `playwright.config.ts` — setup-to-settings browser smoke against a freshly built daemon.
- `.github/workflows/ci.yml` — `npm ci`, Chromium install, typecheck, lint, test (including UI), build.

Planned next:

- No milestone pending. Deferred: importer, OCR, per-agent tokens, notifications, purge UI, custom workflows, mobile-first layout.

## Conventions

- Use the glossary terms exactly: Issue (not task/ticket), Stage (not status), Assignee (one Actor), Blocked (a flag, never a Stage).
- Stage is exactly `backlog`, `todo`, `in_progress`, `review`, `done`, `cancelled`. Never add `blocked`.
- Mutations require `expected_rev`; `claim_issue` is atomic. Do not add last-write-wins paths.
- Soft-delete Issues. Activity is append-only and written in the same transaction as the mutation.
- Projects are UI-managed. Agents may create Modules explicitly through MCP, but not Projects.
- Attachments are copied into the managed store. Image content is returned only to Actors with `can_read_images`; PDFs get best-effort text extraction, no OCR.
- Comments are discussion; Activity is audit. A comment event may appear in Activity, but a Comment is not an Activity.
- Route handlers must call domain services; no mutation SQL in HTTP/MCP adapters.
- `node:sqlite` is synchronous. Never `await` inside a database transaction.
- `plan/README.md` is the tracker. Update the milestone checkbox and matching spec status in the same change that lands the work.
- A spec is a contract. If the code must deviate, add or supersede an ADR and update the affected spec in the same change.
- Update `CONTEXT.md` when a term changes. Add an ADR only for hard-to-reverse, surprising, trade-off decisions: one paragraph, next number.
- When adding or removing glossary terms, ADRs, or plan specs, update `test/docs.test.mjs` / `test/plan.test.mjs` so the guards stay accurate.
- Run `npm run typecheck`, `npm run lint`, and `npm test` before claiming a milestone. `dist/` is generated and gitignored; live data stays outside the repo.

## Notes

M0–M7 verified on 2026-10-23: 5 docs/plan/schema guards, 65 Vitest tests, and the Playwright UI smoke suite pass; `npm run typecheck`, `npm run lint`, and `npm run build` pass (Vite still warns that the main chunk exceeds 500 kB). The smoke covers setup, Issue creation, attachment upload, Project settings, module add, deletion + batch restore, Backup now, Markdown export download, token reveal/regenerate, and navigation. Task Scheduler registration was verified with a temporary task and removed; startup scripts expose `-VerifyOnly` and `-NoStart`.
