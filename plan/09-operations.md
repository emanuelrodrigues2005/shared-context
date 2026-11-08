# 09 — Operations

**Status:** implemented (M7)
**Depends on:** [01-repository-layout](01-repository-layout.md), [07-attachments](07-attachments.md), [08-security](08-security.md)
**Feeds:** M0, M7

## Paths

Resolution is per platform; the XDG variables apply on Linux and macOS only.

| Purpose | Windows | Linux and macOS |
|---|---|---|
| Config | `%APPDATA%\shared-context\config.json` | `${XDG_CONFIG_HOME:-~/.config}/shared-context/config.json` |
| Data root | `%LOCALAPPDATA%\shared-context` | `~/.local/share/shared-context` |
| Database | `<data>\data\shared-context.db` | `<data>/data/shared-context.db` |
| Attachments | `<data>\data\attachments\` | `<data>/data/attachments/` |
| Temp | `<data>\data\tmp\` | `<data>/data/tmp/` |
| Backups | `<data>\backups\` | `<data>/backups/` |
| Logs | `<data>\logs\` | `<data>/logs/` |

Override the data root with `SHARED_CONTEXT_DATA_DIR` and the config file with `SHARED_CONTEXT_CONFIG` for tests or a portable install. Blank values count as unset. A path written for the other platform is rejected at startup with an explicit error rather than creating a literal `C:\Users\...` directory. The repository never contains live data.

## Config file

```json
{
  "port": 4319,
  "token": "base64url...",
  "data_dir": "/home/<user>/.local/share/shared-context",
  "backup_dir": "/home/<user>/.local/share/shared-context/backups",
  "backup_hour": 3,
  "backup_retention_days": 14,
  "log_level": "info",
  "theme": "dark"
}
```

Rules:

- Create the file on first run with a generated token.
- Environment variables override file values for tests and advanced setups.
- Never commit the config file; `.gitignore` covers `.env*` and data directories.
- A malformed config refuses to start with a clear message; do not silently reset it.

## First run

1. Create the data, attachments, temp, backups, and logs directories.
2. Create/open the database; apply migrations.
3. Generate the MCP token if absent.
4. Start the server on `127.0.0.1:4319`.
5. `GET /api/setup` returns `required: true` when there is no human Actor or no Project.
6. The UI setup asks for the owner display name and optionally the first Project key/name.
7. Settings shows the Reasonix `[[plugins]]` snippet and the token copy button.

## Starting at logon

`npm run startup:install` dispatches to the platform script; both share one flag surface (`--verify-only`, `--no-start`, `--data-dir`, `--config`, `--port`, `--health-timeout`).

Windows — `scripts/install-startup.ps1`:

- Resolves the current `node.exe` path.
- Registers a Task Scheduler task named `SharedContext` at logon for the current user.
- Action: `node.exe "<repo>\dist\server\index.js"` with working directory `<repo>`.
- Sets `SHARED_CONTEXT_DATA_DIR` and `SHARED_CONTEXT_CONFIG` in a `.cmd` wrapper if non-default.
- Starts the task immediately and verifies `/healthz`.
- `scripts/uninstall-startup.ps1` unregisters the task.

Linux — `scripts/install-startup.sh`:

- Resolves an absolute `node` (nvm's node is not on a user unit's PATH).
- Writes `~/.config/systemd/user/shared-context.service` from `scripts/shared-context.service.in`.
- `WantedBy=graphical-session.target`, `Type=exec`, `Restart=on-failure`.
- Sets `SHARED_CONTEXT_DATA_DIR` and `SHARED_CONTEXT_CONFIG` through `EnvironmentFile`, never the token.
- Enables, starts, and verifies `/healthz`; `scripts/uninstall-startup.sh` disables and removes it.

Neither runs before logon: a Windows service would run in session 0, and a `systemd --user`
unit bound to `default.target` would start before the compositor. Both cannot open
attachments with the user's default applications. See
[ADR-0006](../docs/adr/0006-run-at-logon.md).

If the machine reboots and nobody logs in, the tracker is offline. This is accepted for personal use.

## Process lifecycle

- Single instance: bind the port. On `EADDRINUSE`, log "already running" and exit with code 1.
- Graceful shutdown: stop accepting requests, close SSE connections, end MCP sessions, close the database.
- On startup: clean `data/tmp`, apply migrations, verify WAL, start the HTTP server, then start the backup scheduler.
- A crash leaves WAL files; SQLite recovers on next open. Log a startup recovery notice if `-wal` existed.

## Logging

- `pino` JSON logs to stdout in development and to `logs/server-YYYY-MM-DD.log` in production.
- Daily rotation, 14-day retention.
- Fields: time, level, request id, method, route, status, duration, actor name, issue key.
- Redact `authorization`, `cookie`, `x-csrf-token`, and `token`.
- Never log attachment contents, extracted text, or full Markdown bodies.
- `GET /healthz` returns `{ ok, version, uptime_seconds, db: { open, journal_mode }, last_backup }`.

## Backup

Schedule:

- Daily at `backup_hour` (default 03:00 local).
- Catch-up on startup if the last successful backup is older than 24 hours.
- `POST /api/admin/backup` runs one on demand.
- A backup failure logs an error and updates the UI status; it does not stop the daemon.

Procedure:

1. Create `backups/db/shared-context-YYYYMMDD-HHMMSS.db` with SQLite's backup API or `VACUUM INTO`.
2. Mirror new attachment directories into `backups/attachments/` without deleting existing files.
3. Write/update `backups/last-backup.json` with timestamp, DB size, attachment count, and success.
4. Keep the last 14 DB snapshots; attachments are retained indefinitely (immutable files).
5. Verify the new snapshot opens read-only and `PRAGMA integrity_check` returns `ok`.

Restore:

1. Stop the daemon.
2. Pick a snapshot from `backups/db/`.
3. Copy it to `data/shared-context.db`, removing stale `-wal`/`-shm` files.
4. Ensure `backups/attachments/` is available; copy missing files into `data/attachments/`.
5. Start the daemon and run `/healthz`.
6. Open the board and spot-check Issues and attachments.

Do not copy a live SQLite file with `copy` while the daemon is running. Use the app's backup.

## Export

Markdown (zip):

```
export-<project>-YYYYMMDD/
  _board.md
  SHC-42-title.md
  SHC-43-title.md
  attachments/
    index.md
```

Each Issue file has YAML frontmatter (project, key, stage, priority, assignee, module, parent, blocked, created, updated), the description, children links, links, attachment names, comments, and a recent activity summary. The board index groups keys by Stage.

JSON: full dump of projects, modules, actors, issues, links, attachments metadata, comments, and activity. No file bytes, no token.

Exports are snapshots. There is no import in v1.

## Migrations and upgrades

- On startup, compare `PRAGMA user_version` with the highest migration.
- If lower, take a backup, then apply each migration in a transaction.
- If a migration fails, roll back, log, and refuse to start.
- Never edit an applied migration.
- After upgrading, `/healthz` reports the schema version.
- Keep the previous `dist/` build until the new one passes `/healthz`; the Task Scheduler points at the built entry point.

## Failure modes

| Failure | Behavior |
|---|---|
| Port in use | Log and exit 1; UI not available |
| DB locked | `busy_timeout=5000`, then 500 with a clear message; no data corruption |
| Disk full | Upload/backup fails with `attachment_copy_failed` or a backup error; daemon keeps running |
| Corrupt DB | Startup fails; restore from the latest verified snapshot |
| Token lost | Regenerate in settings; update Reasonix config |
| MCP client cannot connect | Check daemon, token, URL, and that the client preserves `Mcp-Session-Id` |
| Attachment missing on disk | Metadata remains; UI shows "file missing"; restore from backup mirror |
| Task Scheduler not running | Start manually with `npm start`; check the task history |

## Acceptance criteria

- First run creates the config/data tree without touching the repo.
- The Task Scheduler task starts the daemon at logon and `/healthz` passes.
- A manual backup produces a valid SQLite file and mirrors new attachments.
- Restoring a snapshot produces a working board with attachments.
- A port conflict exits with a clear message and does not corrupt the DB.
- Logs rotate daily and contain no secrets.
- An upgrade from v1 to a test v2 migration backs up first and refuses to start on failure.
