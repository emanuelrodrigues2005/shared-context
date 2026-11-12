# Restore Shared Context from a backup

Backups live under the daemon's data directory — `%LOCALAPPDATA%\shared-context\backups\` on
Windows, `~/.local/share/shared-context/backups/` elsewhere:

- `backups/db/shared-context-YYYYMMDD-HHMMSS.db` — consistent SQLite snapshots.
- `backups/attachments/<attachment-id>/` — mirrored attachment files.
- `backups/last-backup.json` — timestamp, size, attachment count, and success status.

The nightly scheduler and **Backup now** in Project settings use the same procedure. Never
copy a live `shared-context.db` with a file copy while the daemon is running; use a
snapshot.

These are the global/legacy paths, used by the empresa instance on `127.0.0.1:4319`. A DSH
home with its own `shared-context` instance has a different root; see
[Profile stores](#profile-stores) below.

## Profile stores

A DSH home is a profile instance when `<DSH_HOME>/shared-context/` exists. Its config and
data live together under that directory:

| Purpose     | Path                                               |
| ----------- | -------------------------------------------------- |
| Config      | `<DSH_HOME>/shared-context/config.json`            |
| Data root   | `<DSH_HOME>/shared-context`                        |
| Database    | `<DSH_HOME>/shared-context/data/shared-context.db` |
| Attachments | `<DSH_HOME>/shared-context/data/attachments/`      |
| Backups     | `<DSH_HOME>/shared-context/backups/`               |
| Logs        | `<DSH_HOME>/shared-context/logs/`                  |

For the current `pessoal` home the root is
`~/.local/share/dsh-profiles/pessoal/shared-context`, and its daemon listens on
`127.0.0.1:4320`.

Stop a profile instance before touching its files:

```sh
npm run dsh:profiles:stop -- --home pessoal
npm run dsh:profiles                 # confirm the profile is not healthy
```

Restore the database and attachment mirror exactly as below, substituting the profile
paths. For Linux and macOS:

```sh
PROFILE="$HOME/.local/share/dsh-profiles/pessoal/shared-context"
rsync -a --ignore-existing "$PROFILE/backups/attachments/" "$PROFILE/data/attachments/"
```

Start it again and verify health:

```sh
npm run dsh:profiles:start -- --home pessoal
curl -s http://127.0.0.1:4320/healthz
```

The start command runs the daemon detached on this machine because the sandbox cannot reach
`systemctl --user`. For logon startup, install the profile unit from a desktop terminal
after stopping the detached daemon, using `scripts/install-startup.sh --name ...` with the
profile's `--config` and `--port` only. The config already owns `data_dir`, and
`--data-dir` would set `SHARED_CONTEXT_DATA_DIR` in the startup environment and override
it. The installer gives a non-default name its own unit and env file. The profile's config
file is the source of truth for `port` and `data_dir`; do not start it with
`SHARED_CONTEXT_PORT`.

## Before restoring

1. Stop the daemon: close its console, or run `npm run startup:uninstall` if it was
   installed at logon (`scripts/uninstall-startup.ps1` on Windows,
   `scripts/uninstall-startup.sh` on Linux). For a profile instance, use
   `npm run dsh:profiles:stop -- --home <name>`. Stopping the unit does not kill an
   already-running daemon; end the `node` process for this workspace if necessary.
2. Make a copy of the current `data/` directory aside, in case the restore is the wrong
   choice.
3. Pick the newest snapshot whose `last-backup.json` entry reports `"ok": true`, or an
   older snapshot if you need to go further back.

## Restore the database

1. Delete or rename the stale database and its WAL files:
   `data/shared-context.db`, `data/shared-context.db-wal`, `data/shared-context.db-shm`.
2. Copy the chosen snapshot to `data/shared-context.db`.
3. Do **not** copy the backup's `-wal` files; the snapshot is self-contained.

## Restore attachments

The attachment mirror is additive and keeps immutable files. Copy any missing directory
from `backups/attachments/` into `data/attachments/`:

```sh
# Linux and macOS
rsync -a --ignore-existing ~/.local/share/shared-context/backups/attachments/ \
                               ~/.local/share/shared-context/data/attachments/
```

```powershell
# Windows
robocopy "$env:LOCALAPPDATA\shared-context\backups\attachments" `
         "$env:LOCALAPPDATA\shared-context\data\attachments" `
         /E /XC /XN /XO
```

`rsync --ignore-existing` and the robocopy exclusion flags keep files that already exist.
The app tolerates extra files in the mirror; a database snapshot only references
attachments that existed before it.

## Start and verify

1. Start the daemon with `npm start`, or reinstall startup with `npm run startup:install`.
   For a profile, use `npm run dsh:profiles:start -- --home <name>`.
2. Check `http://127.0.0.1:4319/healthz` (or the profile's port, `4320` for `pessoal`); `ok`
   must be `true`, `db.journal_mode` should be `wal`, and `last_backup` should describe the
   snapshot you restored.
3. Open the board, spot-check a few Issues, open an attachment, and confirm Activity is
   present.
4. Run a fresh **Backup now** after verifying, so the next snapshot reflects the restored
   state.

## Restoring on another machine

- Install Node 24 and run `npm install` + `npm run build` in this repository.
- Copy the `shared-context.db` snapshot and the attachment mirror into the new machine's
  data directory. For a profile, restore under `<DSH_HOME>/shared-context/` and keep that
  home's own config; do not copy the empresa config over it. Do not copy `config.json`
  across platforms: a `data_dir` written for Windows is rejected on Linux (and vice versa)
  rather than creating a literal `C:\Users\...` directory. Keep the paths default or set
  them again.
- Run the daemon once so it creates `config.json` (`%APPDATA%\shared-context\` on Windows,
  `${XDG_CONFIG_HOME:-~/.config}/shared-context/` elsewhere) with a new MCP token, then
  update MCP clients with that token from Global settings.
- Reinstall startup after confirming `/healthz`.

Secrets: the config file contains the MCP token. Do not commit it, include it in exports, or
share backups without considering that they may contain sensitive Issue and attachment
content. Backups are not encrypted by the app.
