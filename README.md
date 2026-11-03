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
- DeepSeek Harness plugin (`dsh-plugin/`): a left-sidebar **Issues** entry and a Shared Context board panel inside the Harness Web UI, with Project chips, Stage columns, Module color accents, drag-and-drop Stage moves and ordering, an Issue drawer, comments, and new-Issue creation.
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

## DeepSeek Harness plugin (DSH)

`dsh-plugin/` is a local DSH bundle that adds an **Issues** entry to the Harness
sidebar and a Shared Context board panel: Project chips, Stage columns, colored
Module accents, a draggable kanban, an Issue drawer, comments, and new-Issue
creation. It reaches the daemon through a same-origin proxy on the Harness
origin, so the daemon must be running. See
[`dsh-plugin/README.md`](dsh-plugin/README.md) for the architecture and checks.

### 1. Prepare the daemon

```powershell
npm install
npm run build
npm start
```

`npm start` is the built daemon. For development use `npm run dev`; for automatic
startup use the logon task above (run `npm run build` first). Verify it:

```powershell
Invoke-RestMethod http://127.0.0.1:4319/healthz
```

### 2. Install the bundle in DSH

You can install it from the DSH Web UI or ask the DSH agent.

**From the Web UI**

1. Select **Plugins** in the Harness left sidebar.
2. Select **Add plugin** (or the arrow beside it → **Install a third-party plugin**).
3. Enter the absolute path to this checkout's plugin directory:
   `C:\Users\<you>\Documents\shared-context\dsh-plugin`
4. Select **Install** and wait for the dialog to finish. The registry choice does
   not matter for a local directory.
5. Confirm `dsh-plugin-shared-context` appears under **Installed plugins**, is
   switched on, and lists the row `shared-context`.

**From the DSH agent**

```text
plugin_manager(action="install_bundle", target="C:\Users\<you>\Documents\shared-context\dsh-plugin")
```

This action needs Full access or an approval for that call, and it changes the
current DSH profile for every session. A local directory install links this
checkout: source edits are visible without reinstalling. Client changes need a
page reload; Host changes need the row switched off and on, or a DSH restart.

### 3. Reload and open the Issues panel

1. Reload the Harness page (`Ctrl+R`) once so the browser loads the new client
   module and the boot payload.
2. Select **Issues** in the Harness left sidebar. The panel opens in the main
   area and its subtitle shows **online** plus the daemon version.
3. Pick a Project chip (the last used Project is restored automatically), then
   use the board. Drag a card within a column to reorder it, or into another
   column to change its Stage.
4. Optionally enable **Closed** to show Done/Cancelled columns; that choice and
   the selected Project persist across Harness panels and page reloads.

### 4. Point the plugin at another daemon port (optional)

The default is `http://127.0.0.1:4319`. Change `config.baseUrl` in
[`dsh-plugin/cordis.patch.yml`](dsh-plugin/cordis.patch.yml), then reload the
Host generation (switch the `shared-context` row off/on in Plugins, or restart
DSH). Only loopback origins (`127.0.0.1`, `localhost`, `::1`) are accepted.

### 5. Check the setup

- Daemon: `Invoke-RestMethod http://127.0.0.1:4319/healthz`.
- Proxy through the Harness: open `http://127.0.0.1:57891/shared-context/healthz`
  in the same browser, replacing the port with the Harness GUI's port. It should
  return the daemon's health JSON.
- Plugin checks (run from this checkout):
  `node dsh-plugin/scripts/check-host.mjs`,
  `check-registration.mjs`, `check-render.mjs`, and `check-css.mjs`.

**Troubleshooting**

| Symptom | Fix |
| --- | --- |
| No **Issues** entry in the sidebar | Reload the page; confirm the bundle is switched on under **Plugins** and lists `shared-context`. |
| Panel says offline or shows HTTP 404 | Start the daemon, check `baseUrl`, and confirm the `shared-context` row is enabled. |
| Project list is empty | Create a Project in the full app (`Open full app`) and reload the panel. |
| Drag does not move a card | Reload to get the current client; use a pointer, and enable **Closed** to reach Done/Cancelled. |
| Mutation fails with 403 | Reload the panel; mutations must come from the same-origin panel (marker header or `Sec-Fetch-Site: same-origin`). |

### 6. Update or remove

- **Update:** edit `dsh-plugin/`; reload the page for client changes. For Host
  changes, toggle the row off/on under **Plugins** (or restart DSH). A moved
  checkout needs to be installed again from its new path.
- **Remove:** open **Plugins**, select the bundle, and choose **Remove**, or run
  `plugin_manager(action="remove_bundle", target="dsh-plugin-shared-context")`.
  Issue data stays in `%LOCALAPPDATA%\shared-context`.

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
