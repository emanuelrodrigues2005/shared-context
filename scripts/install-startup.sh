#!/usr/bin/env bash
# Register the Shared Context daemon as a systemd --user service that starts
# with the desktop session. Mirrors scripts/install-startup.ps1:
#
#   install-startup.sh [--name shared-context] [--data-dir PATH] [--config PATH]
#                      [--port N] [--health-timeout N] [--no-start] [--verify-only]
#
# The unit runs in the user session on purpose: the daemon opens attachments
# with the user's default applications, which a system-wide service cannot do
# (docs/adr/0006-run-at-logon.md).
set -euo pipefail

NAME='shared-context'
DATA_DIR=''
CONFIG_PATH=''
PORT=4319
HEALTH_TIMEOUT=20
NO_START=0
VERIFY_ONLY=0

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

usage() {
  sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="${2:-}"; shift 2 ;;
    --data-dir) DATA_DIR="${2:-}"; shift 2 ;;
    --config) CONFIG_PATH="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --health-timeout) HEALTH_TIMEOUT="${2:-}"; shift 2 ;;
    --no-start) NO_START=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

[ "$(uname -s)" = 'Linux' ] || fail 'This script targets systemd on Linux. Use install-startup.ps1 on Windows.'
command -v systemctl >/dev/null 2>&1 || fail 'systemctl was not found. This script needs systemd.'
if ! systemctl --user show-environment >/dev/null 2>&1; then
  fail 'Cannot reach the systemd user manager. Run this from a terminal inside your desktop session.'
fi
if [ "$(id -u)" -eq 0 ]; then
  fail 'Run this as your normal user, not as root: the unit belongs to your user session.'
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENTRY="$REPO_ROOT/dist/server/index.js"
[ -f "$ENTRY" ] || fail "Built entry point not found: $ENTRY. Run 'npm run build' first."
TEMPLATE="$REPO_ROOT/scripts/shared-context.service.in"
[ -f "$TEMPLATE" ] || fail "Unit template not found: $TEMPLATE"

# The systemd user manager does not source a shell profile, so nvm's node is not
# on PATH. Resolve an absolute binary and pin it into the unit.
resolve_node() {
  if [ -n "${SHARED_CONTEXT_NODE:-}" ] && [ -x "${SHARED_CONTEXT_NODE}" ]; then
    printf '%s' "$SHARED_CONTEXT_NODE"
    return
  fi
  local found
  found="$(command -v node 2>/dev/null || true)"
  if [ -n "$found" ]; then printf '%s' "$found"; return; fi
  found="$(bash -lc 'command -v node' 2>/dev/null || true)"
  if [ -n "$found" ]; then printf '%s' "$found"; return; fi
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [ -d "$nvm_dir/versions/node" ]; then
    found="$(find "$nvm_dir/versions/node" -maxdepth 3 -type f -name node -perm -u+x 2>/dev/null | sort -V | tail -1)"
    if [ -n "$found" ]; then printf '%s' "$found"; return; fi
  fi
}

NODE="$(resolve_node)"
[ -n "$NODE" ] || fail "node was not found. Install Node 24 or set SHARED_CONTEXT_NODE to its absolute path."
[ -x "$NODE" ] || fail "node is not executable: $NODE"
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 24 ] || fail "node $NODE_MAJOR is too old; Node 24 or newer is required (found $NODE)."

CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
UNIT_DIR="$CONFIG_HOME/systemd/user"
UNIT_FILE="$UNIT_DIR/$NAME.service"
# One env file per unit: the default name keeps the historical path, and any
# other unit gets its own file so two daemons cannot overwrite each other.
if [ "$NAME" = 'shared-context' ]; then
  ENV_FILE="$CONFIG_HOME/shared-context/startup.env"
else
  ENV_FILE="$CONFIG_HOME/shared-context/startup-$NAME.env"
fi

# systemd treats "%" as a specifier introducer, so it must be doubled.
escape_unit() { local value="$1"; printf '%s' "${value//%/%%}"; }

health_ok() {
  "$NODE" -e '
    fetch(process.argv[1], { signal: AbortSignal.timeout(2000) })
      .then((response) => response.json())
      .then((body) => process.exit(body && body.ok === true ? 0 : 1))
      .catch(() => process.exit(1));
  ' "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1
}

if [ "$VERIFY_ONLY" -eq 1 ]; then
  echo 'Shared Context startup install (verify only)'
  echo "  Repository:  $REPO_ROOT"
  echo "  Node:        $NODE"
  echo "  Entry:       $ENTRY"
  echo "  Working dir: $REPO_ROOT"
  echo "  Unit:        $UNIT_FILE"
  echo "  Env file:    $ENV_FILE"
  if [ -n "$DATA_DIR" ]; then echo "  Data dir:    $DATA_DIR"; fi
  if [ -n "$CONFIG_PATH" ]; then echo "  Config:      $CONFIG_PATH"; fi
  if [ -n "${XDG_CONFIG_HOME:-}" ]; then echo "  XDG config:  $XDG_CONFIG_HOME"; fi
  echo '  Trigger:     graphical-session.target for the current user'
  if systemctl --user is-active --quiet graphical-session.target; then
    echo '  Target:      active'
  else
    echo '  Target:      NOT active — the unit will not start automatically in this session'
  fi
  echo 'No changes were made.'
  exit 0
fi

mkdir -p "$UNIT_DIR" "$(dirname "$ENV_FILE")"

{
  echo '# Written by scripts/install-startup.sh. Remove with scripts/uninstall-startup.sh.'
  if [ -n "$DATA_DIR" ]; then echo "SHARED_CONTEXT_DATA_DIR=$DATA_DIR"; fi
  if [ -n "$CONFIG_PATH" ]; then echo "SHARED_CONTEXT_CONFIG=$CONFIG_PATH"; fi
  if [ -n "${XDG_CONFIG_HOME:-}" ]; then echo "XDG_CONFIG_HOME=$XDG_CONFIG_HOME"; fi
  if [ -z "$DATA_DIR" ] && [ -z "$CONFIG_PATH" ] && [ -z "${XDG_CONFIG_HOME:-}" ]; then
    echo '# Defaults apply; no overrides are set.'
  fi
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

unit="$(cat "$TEMPLATE")"
unit="${unit//@REPO_ROOT@/$(escape_unit "$REPO_ROOT")}"
unit="${unit//@NODE@/$(escape_unit "$NODE")}"
unit="${unit//@ENTRY@/$(escape_unit "$ENTRY")}"
unit="${unit//@ENV_FILE@/$(escape_unit "$ENV_FILE")}"
printf '%s\n' "$unit" > "$UNIT_FILE"

systemctl --user daemon-reload
systemctl --user enable "$NAME.service" >/dev/null

echo "Registered systemd user unit '$NAME'."
echo "  $NODE $ENTRY"
echo "  Working directory: $REPO_ROOT"
echo "  Unit: $UNIT_FILE"

if ! systemctl --user is-active --quiet graphical-session.target; then
  echo 'warning: graphical-session.target is not active, so the unit will not start at logon.' >&2
fi

if [ "$NO_START" -eq 1 ]; then
  echo 'Skipped starting the unit (--no-start).'
  exit 0
fi

systemctl --user start "$NAME.service"

deadline=$((SECONDS + HEALTH_TIMEOUT))
healthy=0
while [ "$SECONDS" -lt "$deadline" ]; do
  if systemctl --user is-active --quiet "$NAME.service" && health_ok; then
    healthy=1
    break
  fi
  sleep 0.5
done

if [ "$healthy" -ne 1 ]; then
  systemctl --user status "$NAME.service" --no-pager >&2 || true
  journalctl --user -u "$NAME.service" -n 30 --no-pager >&2 || true
  fail "The unit started but /healthz did not answer with ok on port $PORT."
fi

echo "Shared Context is healthy on http://127.0.0.1:$PORT/healthz"
