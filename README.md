# Shared Context

A local, multi-project issue tracker and context service for coding agents, exposed over MCP.

**Status:** M0 (scaffold), M1 (schema + domain), M2 (HTTP API + SSE), M3 (MCP), M4 (board UI), M5 (editable drawer), M6 (attachments + command palette), and M7 (settings, trash, export, backup, startup) are implemented. No milestone is pending. Each DSH home can run its own daemon and store; the global instance on `127.0.0.1:4319` remains the default/legacy one.

## Start here

- [`plan/README.md`](plan/README.md) — plan index, locked decisions, milestone tracker.
- [`CONTEXT.md`](CONTEXT.md) — domain glossary (the vocabulary source of truth).
- [`docs/adr/`](docs/adr/) — nine decision records.
- [`AGENTS.md`](AGENTS.md) — project memory for coding agents.

## What works now

- A local daemon with `/healthz` on `127.0.0.1:4319`, the default/empresa instance. A DSH home with `<DSH_HOME>/shared-context/` gets its own daemon, config, SQLite store, attachments, backups, logs, and token; one store never sees another home's Issues.
- SQLite schema with WAL, FTS5, migrations, and the full repository layer.
- Domain services for Projects, Actors, Modules, Issues, hierarchy/progress, revisions, claims, blocking, soft delete/restore, activity, comments, links, attachments metadata, and allowlisted project docs.
- HTTP JSON API for setup, projects, modules, issues, comments, links, actors, search, board, context, docs, activity, and attachments (multipart upload, content, OS open).
- MCP Streamable HTTP at `/mcp` with bearer auth, stateful sessions, `identify`, and all 23 tools.
- Attachment copy/hash/dedupe, text and PDF extraction, capability-gated image content for MCP, and realpath-contained file serving.
- Kanban board with six columns, collapsible Done/Cancelled, compact cards, child progress, drag-and-drop, URL filters, saved views, and live SSE invalidation.
- Editable Issue drawer: immediate Stage/Priority/Assignee/Module/Parent/Blocked updates, explicit title/description saves, conflict banner with reload/copy-draft, children creation, comments, delete dialog, attachments with thumbnails/upload/open/download/remove, links with add/remove, and activity.
- `Ctrl/Cmd+K` command palette: debounced cross-Project search, recent Issues/Projects, Issue and Project jumps, and actions for new Issue, board, settings, and theme.
- Project sidebar, setup flow, create-issue modal, and a full Project settings screen: name/description/root path, doc allowlist, Module manager with usage counts, Trash batch restore, backup status/Backup now, Markdown/JSON export, and empty-Project deletion.
- DeepSeek Harness plugin (`dsh-plugin/`): a left-sidebar **Issues** entry and a Shared Context board panel inside the Harness Web UI, with Project chips, Stage columns, Module color accents, drag-and-drop Stage moves and ordering, an Issue drawer, comments, and new-Issue creation. The Host resolves the live daemon from the current DSH home and shows the home name in the panel subtitle.
- DeepSeek Harness agent presets (`dsh-preset/`): a tracker-owning orchestrator that triages Issues and delegates to tracker-free implementer, reviewer, and researcher presets over the MCP tools. The orchestrator resolves its MCP URL and token from the same DSH home.
- Per-home instance management: `npm run dsh:profiles` reports every DSH home (config source, port, health, data directory, Project count), and install/start/stop are one command each.
- Global settings: theme/density, reveal/copy/regenerate MCP token, server paths/version/uptime, startup and Reasonix snippets, and Actor capability editing.
- Daily backups with catch-up, integrity verification, attachment mirroring, retention, and a documented restore procedure.
- CSRF, host, and origin guards; SSE replay from the Activity cursor; `waitForChange`.
- 95 Vitest tests (1 skipped) covering domain, HTTP, SSE, MCP, concurrency, profile resolution, and store isolation, 5 docs/plan/schema guards, and a Playwright UI smoke suite run by `npm test`.

UI smoke tests run with Playwright against the built daemon (`npm run test:ui`). They run
on Playwright's bundled Chromium on every platform, so a branded Chrome install is never
required: run `npm run test:ui:install` once. CI runs the same thing with system deps.

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
npm run dsh:profiles  # every DSH home: config source, port, health, data dir
```

Install the Playwright browser once (no branded browser is needed on any platform):

```sh
npm run test:ui:install
```

Startup at logon, in the user session, on either platform (run `npm run build` first):

```sh
npm run startup:install     # Windows: Task Scheduler; Linux: systemd --user
npm run startup:uninstall
npm run startup:verify      # print the plan, change nothing
```

The platform scripts stay callable directly: `scripts/install-startup.ps1` on Windows,
`scripts/install-startup.sh` on Linux. Both accept `--verify-only` and `--no-start`.

Per DSH home, from this checkout:

```sh
npm run dsh:profiles                              # status: source, port, health, data dir, Project count
npm run dsh:profiles:install -- --home pessoal    # idempotent: config/data root, free port, token, detached daemon
npm run dsh:profiles:start -- --home pessoal
npm run dsh:profiles:stop  -- --home pessoal
```

Install never prints a token: `dsh:profiles` reports the config source and health, not
secrets. The profile daemon's config file is the source of truth for its port and
`data_dir`; the child process receives only `SHARED_CONTEXT_CONFIG`, never a port
override.

The daemon stores data under `%LOCALAPPDATA%\shared-context` on Windows and
`~/.local/share/shared-context` elsewhere. The config file is
`%APPDATA%\shared-context\config.json` on Windows and
`${XDG_CONFIG_HOME:-~/.config}/shared-context/config.json` elsewhere. Override
either with `SHARED_CONTEXT_DATA_DIR` / `SHARED_CONTEXT_CONFIG` for a portable or
test install. A config path written for the other platform is rejected with an
explicit error instead of creating a literal `C:\Users\...` directory. A DSH home
whose `<DSH_HOME>/shared-context/` directory exists uses
`<DSH_HOME>/shared-context/config.json` and stores under
`<DSH_HOME>/shared-context/` instead.

## DeepSeek Harness plugin (DSH)

`dsh-plugin/` is a local DSH bundle that adds an **Issues** entry to the Harness
sidebar and a Shared Context board panel: Project chips, Stage columns, colored
Module accents, a draggable kanban, an Issue drawer, comments, and new-Issue
creation. It reaches the daemon through a same-origin proxy on the Harness
origin, so the daemon must be running. See
[`dsh-plugin/README.md`](dsh-plugin/README.md) for the architecture and checks.

### 1. Prepare the daemon

```sh
npm install
npm run build
npm start
```

`npm start` is the built daemon. For development use `npm run dev`; for automatic
startup use `npm run startup:install` above (run `npm run build` first). This starts
the global `4319` instance, the default/empresa store. A DSH home with its own
profile instance uses that one instead; see
[Two DSH homes, two stores](#4-two-dsh-homes-two-stores) below. Verify the default
daemon:

```sh
curl -s http://127.0.0.1:4319/healthz
```

### 2. Install the bundles in DSH

Both bundles — the Web UI plugin and the agent presets — install the same way, into
every profile of every DSH home on this machine:

```sh
npm run dsh:install      # pnpm add + dsh.profile.bundles, per profile
npm run dsh:status       # per profile: which bundles resolve
npm run dsh:uninstall    # remove both; issue data is untouched
npm run dsh:skills       # per-preset skill sets under ~/.agents/skill-sets
npm run dsh:presets:skills  # give the nine built-in presets a skill catalog
```

Discovery covers `$DSH_PROFILE_ROOT/*` (falling back to
`~/.local/share/dsh-profiles/*`), and `--dsh-home <path>` handles a home outside
those roots. The command is idempotent and never edits a profile's
`cordis.patch.yml`: the rows come from each bundle's own patch. A profile created
later needs one more `npm run dsh:install`.

**From the Web UI instead**

1. Select **Plugins** in the Harness left sidebar.
2. Select **Add plugin** (or the arrow beside it → **Install a third-party plugin**).
3. Enter the absolute path to this checkout's bundle directory:
   `/path/to/shared-context/dsh-plugin`, then repeat for `dsh-preset`.
4. Select **Install** and wait for the dialog to finish. The registry choice does
   not matter for a local directory.
5. Confirm `dsh-plugin-shared-context` appears under **Installed plugins**, is
   switched on, and lists the row `shared-context`.

**From the DSH agent**

```text
plugin_manager(action="install_bundle", target="/path/to/shared-context/dsh-plugin")
```

This action needs Full access or an approval for that call, and it changes the
current DSH profile for every session. It is disabled in profiles that turn
`tool-plugin-manager` off — which is why the script above exists. A local directory
install links this checkout: source edits are visible without reinstalling. Client
changes need a page reload; Host changes need the row switched off and on, or a DSH
restart.

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

### 4. Two DSH homes, two stores

Isolation is physical at the store level. A home is a profile instance when
`<DSH_HOME>/shared-context/` exists (DSH calls it a home; in conversation it is
also called a _perfil_): that directory holds its `config.json`, `data/`
(including `data/shared-context.db`), attachments, `backups/`, and `logs/`, and
its config carries its own token. A home without the directory keeps using the
global `4319` daemon and store. This is separation of local state, not a
security boundary: both daemons run as the same OS user, who can read both
configs and databases. The current machine has two:

| Home      | Instance                           | Store                                                                    |
| --------- | ---------------------------------- | ------------------------------------------------------------------------ |
| `empresa` | global/default on `127.0.0.1:4319` | the existing empresa database with 26 Issues in Project `SHC`; untouched |
| `pessoal` | profile on `127.0.0.1:4320`        | `~/.local/share/dsh-profiles/pessoal/shared-context`; starts empty       |

The personal store starts empty: no Actor and no Project. After the panel points
at it, open `http://127.0.0.1:4320` (the panel's **Open full app** link follows
the resolved daemon) and create the first Project there. Nothing is copied from
the empresa store, and existing empresa Issues stay on `4319`.

Provision, inspect, start, and stop a profile from this checkout:

```sh
npm run dsh:profiles                              # every discovered home: source, port, health, data dir, Project count
npm run dsh:profiles:install -- --home pessoal    # idempotent: config/data root, free port from 4320, token, detached daemon
npm run dsh:profiles:start -- --home pessoal
npm run dsh:profiles:stop  -- --home pessoal
```

Use `--home pessoal` for the current second home. The install command allocates a
free port starting at `4320`, writes the profile config and data root, generates
its token, and starts the daemon detached. It never prints the token. The daemon's
config file is the source of truth for its port and `data_dir`; the child process
gets only `SHARED_CONTEXT_CONFIG`, never `SHARED_CONTEXT_PORT`.

The detached start is the immediate path on this machine: the sandbox cannot
reach `systemctl --user`. To make the profile survive logon, install its startup
unit later from a desktop terminal with `scripts/install-startup.sh --name ...`,
after stopping the detached daemon. Use the profile's `--config` and `--port`
only: the config already owns `data_dir`, and passing `--data-dir` would put
`SHARED_CONTEXT_DATA_DIR` in the startup environment and override the config.
The installer's `--name` flag gives a non-default instance its own unit and
`startup-<name>.env`; the default `shared-context` names keep the historical
paths. The Windows startup leg was not verified in this pass.

`dsh:profiles:install` also accepts `--port` to pin the first port, `--dry-run`
to print the plan without writing, and `--no-start` to create the config/data
root and token without launching the daemon.

Restart requirement: the plugin Host resolves the daemon when the Host row
activates, and the browser reads the boot payload (route, `baseUrl`, `home`,
version) at page load. After provisioning a profile or changing its endpoint,
switch the `shared-context` row off/on or restart DSH for the Host, then reload
the page for the client. The preset resolves at mount, so a **new** session picks
up the new URL and token without a DSH restart; an existing session keeps its MCP
connection.

### 5. Point the plugin at another daemon port (optional)

The bundle ships `baseUrl: auto`, so the Host resolves the daemon from the DSH
home it runs in. Resolution order:

1. `SHARED_CONTEXT_URL` from the environment.
2. An explicit `config.baseUrl` in
   [`dsh-plugin/cordis.patch.yml`](dsh-plugin/cordis.patch.yml) that is not
   `auto` and not the legacy `http://127.0.0.1:4319`; it must be loopback.
3. `SHARED_CONTEXT_CONFIG`, an explicit config path; if it is set but
   unreadable, the Host fails closed.
4. `<DSH_HOME>/shared-context/config.json` when that directory exists. A
   missing or unreadable profile config fails closed to
   `http://127.0.0.1:1` (and `Bearer unavailable` for the preset) instead of
   borrowing the global store.
5. The platform global config, defaulting to port `4319`.

Only loopback origins (`127.0.0.1`, `localhost`, `::1`) are accepted. The `home`
field in the boot payload is `basename(DSH_HOME)`, or `null` when `DSH_HOME` is
unset; the panel subtitle shows it after the version. Changing the Host
resolution needs the row off/on or a DSH restart, plus a page reload for the
client.

The preset follows the same order for its MCP URL and token, evaluated when the
preset mounts (the explicit row `baseUrl` step is Host-only). An explicit
`SHARED_CONTEXT_CONFIG` wins over the profile config; the profile config wins
over the global config. `SHARED_CONTEXT_URL` and `SHARED_CONTEXT_TOKEN` remain
the environment overrides.

### 6. Check the setup

- Default daemon: `curl -s http://127.0.0.1:4319/healthz`.
- Profile daemon: `curl -s http://127.0.0.1:4320/healthz`, or run
  `npm run dsh:profiles` for every discovered home.
- Proxy through the Harness: open `http://127.0.0.1:3080/shared-context/healthz`
  in the same browser, replacing the port with the Harness GUI's port. It should
  return the daemon's health JSON.
- Bundle inventory: `npm run dsh:status` lists both bundles per profile.
- Plugin checks (run from this checkout, after `npm run build`):
  `node dsh-plugin/scripts/check-host.mjs`,
  `check-registration.mjs`, `check-render.mjs`, and `check-css.mjs`.
  `check-host.mjs` resolves the live daemon from `DSH_HOME` with the same
  precedence as the Host and tolerates a profile whose store is still empty.
- Preset check: `node dsh-preset/scripts/check-mcp.mjs` verifies the patch
  expressions and opens a live MCP session against the resolved daemon, token,
  and 23 tools.

**Troubleshooting**

| Symptom                                                         | Fix                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No **Issues** entry in the sidebar                              | Reload the page; confirm the bundle is switched on under **Plugins** and lists `shared-context`; run `npm run dsh:status`.                                                                                                      |
| Panel says offline or shows HTTP 404                            | Start the daemon, check `baseUrl`, and confirm the `shared-context` row is enabled.                                                                                                                                             |
| Panel still shows empresa Projects after provisioning `pessoal` | The Host resolves at activation and the client reads the boot payload at page load. Toggle the `shared-context` row off/on (or restart DSH), then reload the page.                                                              |
| Personal Project list is empty                                  | The profile store starts empty. Open the profile daemon (for `pessoal`, `http://127.0.0.1:4320`), create the first Project, and reload the panel.                                                                               |
| Profile daemon is offline                                       | Run `npm run dsh:profiles`; start it with `npm run dsh:profiles:start -- --home pessoal`. Check the port and `data_dir` in `<DSH_HOME>/shared-context/config.json`; the profile command starts it with `SHARED_CONTEXT_CONFIG`. |
| Drag does not move a card                                       | Reload to get the current client; use a pointer, and enable **Closed** to reach Done/Cancelled. Touch devices have no drag-and-drop; use the drawer's Stage select.                                                             |
| Mutation fails with 403                                         | Reload the panel; mutations must come from the same-origin panel (marker header or `Sec-Fetch-Site: same-origin`).                                                                                                              |

### 7. Update or remove

- **Update:** edit `dsh-plugin/`; reload the page for client changes. For Host
  changes, toggle the row off/on under **Plugins** (or restart DSH). A moved
  checkout needs `npm run dsh:install` again from its new path.
- **Remove:** `npm run dsh:uninstall`, or open **Plugins**, select the bundle, and
  choose **Remove**. Issue data stays in the daemon's data directory.

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
