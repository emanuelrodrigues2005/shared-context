# Shared Context

A local, multi-project issue tracker and context service for coding agents, exposed over MCP.

## Project

- Status: M0, M1, M2, M3, M4, M5, M6, and M7 are implemented. No milestone is pending; deferred items remain in the plan.
- Repository (private): https://github.com/zauns/shared-context
- Source of truth: `plan/README.md` (plan index and milestone tracker), `CONTEXT.md` (domain glossary), and `docs/adr/` (decision records).
- Stack: Node 24 + TypeScript, Express 5, `node:sqlite` (WAL + FTS5), React + Vite.
- Entry point: `src/server/index.ts`. One daemon on `127.0.0.1:4319` serving `/mcp`, `/api`, `/api/events`, and the UI.
- Data location: one global SQLite database plus managed attachments and backups under `%LOCALAPPDATA%\shared-context` on Windows and `~/.local/share/shared-context` elsewhere; the config lives under `%APPDATA%` or `${XDG_CONFIG_HOME:-~/.config}`.

## Commands

- `npm install` — install dependencies.
- `npm run dev` — tsx server watch + Vite dev server.
- `npm run typecheck` — typecheck server and web.
- `npm run lint` — ESLint.
- `npm test` — docs/plan/schema guards, all Vitest tests, and the Playwright UI smoke suite.
- `npm run test:ui` — build the app and run Playwright (bundled Chromium).
- `npm run test:unit` — unit tests only.
- `npm run test:concurrency` — concurrency invariants only.
- `npm run test:docs` — glossary, ADR, plan-link, and schema guards.
- `npm run build` — compile server and build UI.
- `npm start` — run the built daemon.
- `node dsh-plugin/scripts/check-host.mjs` — offline Host-half proxy checks (mock daemon + live read-only daemon).
- `node dsh-plugin/scripts/check-registration.mjs` / `check-render.mjs` / `check-css.mjs` — verify slot registrations, render the panel components server-side, and parse the injected stylesheet.
- `node dsh-preset/scripts/check-mcp.mjs` — verify the agent-preset bundle declarations and the live daemon MCP session (token, 23 tools, read-only call).
- `npm run format` — Prettier.
- `npm run test:ui:install` — download Playwright's bundled Chromium (no branded browser is used).
- `npm run startup:install` / `startup:uninstall` / `startup:verify` — logon startup via Task Scheduler on Windows and `systemd --user` on Linux (run `npm run build` first).
- `npm run dsh:install` / `dsh:uninstall` / `dsh:status` — install both DSH bundles into every profile of every DSH home found on this machine.
- `npm run dsh:skills` / `dsh:skills:status` — build and verify the per-preset skill sets under `~/.agents/skill-sets`, from `dsh-preset/skills.json` and `dsh-preset/prebuilt-skills.json`.
- `npm run dsh:presets:skills` / `dsh:presets:skills:check` — append the scoped `skill-filesystem` + `tool-skill` rows to the nine built-in presets in each profile patch (idempotent, backs up first).
- `powershell -ExecutionPolicy Bypass -File .\scripts\install-startup.ps1` — the Windows-only form of `startup:install`, with `-VerifyOnly` / `-NoStart`.
- `bash scripts/install-startup.sh` — the Linux-only form of `startup:install`, with `--verify-only` / `--no-start`.
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
- `src/server/services/open-file.ts` — default-handler launch: argument-safe `cmd /c start` (Explorer fallback) on Windows, `open` on macOS, `xdg-open` elsewhere; injectable for tests.
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
- `scripts/install-startup.sh` + `scripts/uninstall-startup.sh` + `scripts/shared-context.service.in` — the `systemd --user` equivalent, bound to `graphical-session.target`, with `EnvironmentFile` overrides and the same `/healthz` wait.
- `scripts/startup.mjs` — OS-neutral dispatcher behind `npm run startup:*`.
- `scripts/dsh-bundles.mjs` — installs, removes, and reports both DSH bundles across every profile of every discovered DSH home (pnpm add + `dsh.profile.bundles`, idempotent).
- `scripts/dsh-skills.mjs` + `dsh-preset/skills.json` + `dsh-preset/prebuilt-skills.json` — materializes `<agentsHome>/skill-sets/<preset>/` as symlinks so each preset's `skill-filesystem` provider exposes only its curated catalog (the registry has no filter primitive; scoping is by root).
- `scripts/dsh-presets-skills.mjs` — appends the scoped `skill-filesystem` + `tool-skill` rows to the nine built-in presets in each profile patch, with a timestamped backup and an idempotency check.
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

Cross-platform pass on Linux (Pop!_OS, Node 24.18.0, 2026-11-08), with no branded browser installed: `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` all pass — 5 guards, 77 Vitest tests (1 Windows-only test skipped), and the UI smoke on Playwright's bundled Chromium. `node dsh-plugin/scripts/check-host.mjs` and `node dsh-preset/scripts/check-mcp.mjs` pass against a real daemon; `check-registration.mjs` now asserts `main.key === sidebar.panellist.id` and dictionary parity instead of only printing. The systemd unit rendered by `scripts/install-startup.sh` passes `systemd-analyze verify`; it was installed and removed against a stub `systemctl`, because the sandbox cannot reach `systemctl --user` — the live start still needs a desktop terminal. Both DSH bundles were installed into the `pessoal` and `empresa` homes with `npm run dsh:install`, and `dsh --profile web --dump-config` shows the `shared-context` Host row plus all four presets with no skipped bundles; `agent-preset-registry` still defaults to `equipe`. The Windows leg was not re-run in this pass.

Skill scoping (2026-11-08): the registry has no filter primitive, so each preset now mounts `dsh-skill-filesystem` with `includeDefaultRoots: false` plus one `customSkillDirs` root under `<agentsHome>/skill-sets/<preset>`, and `tool-skill` to expose the catalog and loader. Thirteen sets exist (four bundle presets, nine built-in), built from `dsh-preset/skills.json` and `dsh-preset/prebuilt-skills.json`, validated against the 104 installed skills. The nine built-in presets in both profiles were patched in place, with timestamped `.bak-pre-skills-*` backups, and both patches still compose (`--dump-config` exit 0, no skipped rows); a second run reports "already mount skills". Session history showed 22 of 139 `subagent` calls carrying a skill instruction, concentrated in planner (`planning-and-task-breakdown`), tester and coder (`tdd`), coder (`frontend-design`), and reviewer (`code-review`, declared but never passed).
