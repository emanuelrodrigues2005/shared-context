#!/usr/bin/env bash
# Stop and remove the Shared Context systemd --user service.
# Mirrors scripts/uninstall-startup.ps1:
#
#   uninstall-startup.sh [--name shared-context] [--keep-wrapper] [--verify-only]
#
# Issue data and the daemon config are never touched.
set -euo pipefail

NAME='shared-context'
KEEP_WRAPPER=0
VERIFY_ONLY=0

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="${2:-}"; shift 2 ;;
    --keep-wrapper) KEEP_WRAPPER=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    --help|-h)
      sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
done

[ "$(uname -s)" = 'Linux' ] || fail 'This script targets systemd on Linux. Use uninstall-startup.ps1 on Windows.'
command -v systemctl >/dev/null 2>&1 || fail 'systemctl was not found. This script needs systemd.'

CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
UNIT_FILE="$CONFIG_HOME/systemd/user/$NAME.service"
# Mirrors install-startup.sh: the default unit keeps the historical env file,
# and every other unit has its own.
if [ "$NAME" = 'shared-context' ]; then
  ENV_FILE="$CONFIG_HOME/shared-context/startup.env"
else
  ENV_FILE="$CONFIG_HOME/shared-context/startup-$NAME.env"
fi

if [ ! -f "$UNIT_FILE" ]; then
  echo "systemd user unit '$NAME' is not installed."
  exit 0
fi

if [ "$VERIFY_ONLY" -eq 1 ]; then
  echo "Would stop and disable systemd user unit '$NAME'."
  echo "  Unit: $UNIT_FILE"
  if [ "$KEEP_WRAPPER" -eq 0 ]; then echo "  Env:  $ENV_FILE"; fi
  echo 'No changes were made.'
  exit 0
fi

systemctl --user disable --now "$NAME.service" >/dev/null 2>&1 || true
rm -f "$UNIT_FILE"
echo "Removed systemd user unit '$NAME'."

if [ "$KEEP_WRAPPER" -eq 0 ] && [ -f "$ENV_FILE" ]; then
  rm -f "$ENV_FILE"
  echo "Removed startup environment file $ENV_FILE."
fi

systemctl --user daemon-reload

echo 'The daemon may still be running in this session; stop it with Ctrl+C or kill the node process.'
