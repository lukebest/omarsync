#!/usr/bin/env bash
# Exercise init/push/pull/apply against a local bare repository and a fake $HOME.
# This does not sign in to GitHub and does not write the real home directory.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

REAL_SHELL="${REAL_HOME:-$HOME}/.config/omarchy/shell.json"
if [[ -f $REAL_SHELL ]]; then
  BEFORE=$(md5sum "$REAL_SHELL")
fi

ORIGIN="$TMP/origin.git"
git init --bare -b main "$ORIGIN" >/dev/null

setup_home() {
  local home="$1"
  mkdir -p \
    "$home/.config/omarchy/backgrounds/demo" \
    "$home/.config/omarchy/plugins/secret" \
    "$home/.config/hypr" \
    "$home/.config/nvim" \
    "$home/.local/state/omarchy/current"
  printf '{ "version": 1 }\n' >"$home/.config/omarchy/shell.json"
  printf 'wallpaper\n' >"$home/.config/omarchy/backgrounds/demo/a.png"
  printf 'secret\n' >"$home/.config/omarchy/plugins/secret/x"
  printf 'bind = SUPER, Q\n' >"$home/.config/hypr/bindings.lua"
  printf 'junk\n' >"$home/.config/hypr/bindings.lua.bak.1"
  printf 'set number\n' >"$home/.config/nvim/init.lua"
  printf 'demo\n' >"$home/.local/state/omarchy/current/theme.name"
  ln -sfn "$home/.config/omarchy/backgrounds/demo/a.png" \
    "$home/.local/state/omarchy/current/background"
}

run() {
  env -u GH_TOKEN -u GITHUB_TOKEN -u GH_CONFIG_DIR \
    HOME="$1" \
    XDG_CONFIG_HOME="$1/.config" \
    XDG_STATE_HOME="$1/.local/state" \
    OMARSYNC_ORIGIN="$ORIGIN" \
    OMARSYNC_SKIP_LIVE=1 \
    "$ROOT/bin/omarsync" "${@:2}"
}

setup_home "$TMP/home1"
run "$TMP/home1" init local/omarchy-config
run "$TMP/home1" push --quiet

MIRROR="$TMP/home1/.local/state/omarsync/repo"
[[ -f $MIRROR/home/.config/omarchy/shell.json ]]
[[ -f $MIRROR/home/.config/hypr/bindings.lua ]]
[[ ! -e $MIRROR/home/.config/omarchy/plugins ]]
[[ ! -e $MIRROR/home/.config/hypr/bindings.lua.bak.1 ]]
[[ $(tr -d '[:space:]' <"$MIRROR/current/theme.name") == demo ]]
grep -q '^rel:demo/a.png$' "$MIRROR/current/background"

dirty=$(run "$TMP/home1" status --json | jq -r '.dirty')
[[ $dirty == false ]]
behind=$(run "$TMP/home1" status --json | jq -r '.behind')
[[ $behind == 0 ]]

printf '{ "version": 1, "changed": true }\n' >"$TMP/home1/.config/omarchy/shell.json"
dirty=$(run "$TMP/home1" status --json | jq -r '.dirty')
[[ $dirty == true ]]
run "$TMP/home1" push --quiet

setup_home "$TMP/home2"
printf 'local only\n' >"$TMP/home2/.config/omarchy/shell.json"
run "$TMP/home2" init local/omarchy-config
run "$TMP/home2" pull
run "$TMP/home2" apply --no-packages

grep -q '"changed": true' "$TMP/home2/.config/omarchy/shell.json"
grep -q 'local only' "$TMP/home2/.local/state/omarsync/backup"/*/home/.config/omarchy/shell.json
[[ $(tr -d '[:space:]' <"$TMP/home2/.local/state/omarchy/current/theme.name") == demo ]]
[[ $(readlink -f "$TMP/home2/.local/state/omarchy/current/background") == "$TMP/home2/.config/omarchy/backgrounds/demo/a.png" ]]
[[ -f $TMP/home2/.config/nvim/init.lua ]]

printf 'from home2\n' >"$TMP/home2/.config/omarchy/shell.json"
run "$TMP/home2" push --quiet
printf 'from home1\n' >"$TMP/home1/.config/omarchy/shell.json"
run "$TMP/home1" push --quiet
grep -q 'from home1' "$MIRROR/home/.config/omarchy/shell.json"

if run "$TMP/home1" login </dev/null >/dev/null 2>&1; then
  echo "login should fail without a terminal when GitHub is signed out" >&2
  exit 1
fi

if [[ -n ${BEFORE:-} ]]; then
  AFTER=$(md5sum "$REAL_SHELL")
  [[ $BEFORE == "$AFTER" ]]
fi

echo "self-test ok"
