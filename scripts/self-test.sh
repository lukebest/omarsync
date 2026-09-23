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
mkdir -p "$TMP/keys" "$TMP/bin"
ssh-keygen -t ed25519 -f "$TMP/keys/id" -N "" -C omarsync-test >/dev/null
cat >"$TMP/bin/yay" <<'EOF'
#!/bin/sh
touch "${OMARSYNC_YAY_LOG:?}"
exit 0
EOF
cat >"$TMP/bin/git" <<EOF
#!/bin/sh
touch "$TMP/git-shadow"
exit 99
EOF
chmod +x "$TMP/bin/yay" "$TMP/bin/git"

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
    OMARSYNC_YAY_LOG="$TMP/yay.log" \
    PATH="$TMP/bin:$PATH" \
    "$ROOT/bin/omarsync" "${@:2}"
}

pinned_sha() {
  git -C "$1/.local/state/omarsync/repo" rev-parse --verify HEAD
}

assert_detached() {
  if git -C "$1/.local/state/omarsync/repo" symbolic-ref -q HEAD >/dev/null; then
    echo "mirror is still on a branch: $1" >&2
    exit 1
  fi
}

setup_home "$TMP/home1"
run "$TMP/home1" trust-key "$TMP/keys/id.pub" "$TMP/keys/id"
run "$TMP/home1" init local/omarchy-config
run "$TMP/home1" push --quiet
git -C "$TMP/home1/.local/state/omarsync/repo" \
  -c gpg.ssh.allowedSignersFile="$TMP/home1/.config/omarsync/trusted-keys" \
  verify-commit HEAD

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

signed=$(run "$TMP/home1" status --json | jq -r '.remoteSigned')
[[ $signed == true ]]
tip=$(run "$TMP/home1" status --json | jq -r '.remoteCommit')
[[ $tip =~ ^[0-9a-f]{40}$ ]]
if run "$TMP/home1" apply --no-packages >/dev/null 2>&1; then
  echo "apply without --commit should fail" >&2
  exit 1
fi

mkdir -p "$MIRROR/plugins-local/evil"
printf 'echo pwned\n' >"$MIRROR/plugins-local/evil/payload.sh"
chmod +x "$MIRROR/plugins-local/evil/payload.sh"
git -C "$MIRROR" add plugins-local
git -C "$MIRROR" commit -S -m "plant an executable plugin tree" >/dev/null
git -C "$MIRROR" push --quiet origin HEAD:main

setup_home "$TMP/home2"
printf 'local only\n' >"$TMP/home2/.config/omarchy/shell.json"
run "$TMP/home2" trust-key "$TMP/keys/id.pub" "$TMP/keys/id"
run "$TMP/home2" init local/omarchy-config
run "$TMP/home2" pull
assert_detached "$TMP/home2"
sha=$(pinned_sha "$TMP/home2")
if run "$TMP/home2" apply --commit 0000000000000000000000000000000000000000 --no-packages >/dev/null 2>&1; then
  echo "apply of a different commit should fail" >&2
  exit 1
fi
mkdir -p "$TMP/home2/.config/omarchy/plugins/io.github.lukebest.omarsync"
printf 'stay\n' >"$TMP/home2/.config/omarchy/plugins/io.github.lukebest.omarsync/keep"
run "$TMP/home2" apply --commit "$sha" --no-packages
[[ ! -e $TMP/home2/.config/omarchy/plugins/evil ]]
grep -q '^stay$' "$TMP/home2/.config/omarchy/plugins/io.github.lukebest.omarsync/keep"
[[ -f $TMP/home2/.config/omarchy/plugins/secret/x ]]

# A new machine has no trusted key. The first apply runs directly and pins the signer.
setup_home "$TMP/home3"
run "$TMP/home3" init local/omarchy-config
fresh=$(run "$TMP/home3" status --json)
[[ $(jq -r '.remoteSigned' <<<"$fresh") == false ]]
[[ $(jq -r '.remoteSignature' <<<"$fresh") == untrusted ]]
[[ $(jq -r '.hasTrustedKeys' <<<"$fresh") == false ]]
[[ $(jq -r '.firstApply' <<<"$fresh") == true ]]
[[ $(jq -r '.signerFingerprint' <<<"$fresh") == SHA256:* ]]
run "$TMP/home3" apply --commit "$sha" --no-packages
grep -q 'namespaces="git"' "$TMP/home3/.config/omarsync/trusted-keys"
[[ -f $TMP/home3/.local/state/omarsync/applied ]]
[[ $(run "$TMP/home3" status --json | jq -r '.remoteSigned') == true ]]
[[ $(run "$TMP/home3" status --json | jq -r '.firstApply') == false ]]
run "$TMP/home3" apply --commit "$sha" --no-packages
[[ ! -f $TMP/yay.log ]]

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
git -C "$MIRROR" -c gpg.ssh.allowedSignersFile="$TMP/home1/.config/omarsync/trusted-keys" verify-commit HEAD

printf '%s\n' '.ssh' '.config/gh' >"$MIRROR/omarsync.scope"
git -C "$MIRROR" add omarsync.scope
git -C "$MIRROR" commit -S -m "poison remote scope" >/dev/null
git -C "$MIRROR" push --quiet origin HEAD:main
mkdir -p "$TMP/home1/.ssh" "$TMP/home1/.config/gh"
printf 'SECRET\n' >"$TMP/home1/.ssh/id_ed25519"
printf 'token\n' >"$TMP/home1/.config/gh/hosts.yml"
run "$TMP/home1" push --quiet
if git -C "$MIRROR" ls-tree -r --name-only HEAD | grep -Eq '(^|/)(\.ssh/|id_ed25519|hosts\.yml|omarsync\.scope)$'; then
  echo "remote scope caused secrets or scope policy to be uploaded" >&2
  git -C "$MIRROR" ls-tree -r --name-only HEAD >&2
  exit 1
fi
printf '\n.ssh\n' >>"$TMP/home1/.config/omarsync/scope"
if run "$TMP/home1" push --quiet >/dev/null 2>&1; then
  echo "local scope was allowed to select .ssh" >&2
  exit 1
fi
cp "$ROOT/omarsync.scope.example" "$TMP/home1/.config/omarsync/scope"

git -C "$MIRROR" -c commit.gpgsign=false commit --allow-empty -m "unsigned" >/dev/null
git -C "$MIRROR" push --quiet origin HEAD:main
unsigned=$(git -C "$MIRROR" rev-parse HEAD)
if run "$TMP/home2" apply --commit "$unsigned" --no-packages >/dev/null 2>&1; then
  echo "unsigned commit was applied" >&2
  exit 1
fi
if run "$TMP/home3" apply --trust-signer --commit "$unsigned" --no-packages >/dev/null 2>&1; then
  echo "trust-signer accepted an unsigned commit" >&2
  exit 1
fi

ssh-keygen -t ed25519 -f "$TMP/keys/other" -N "" -C other >/dev/null
git -C "$MIRROR" -c commit.gpgsign=false -c user.signingkey="$TMP/keys/other" -c gpg.format=ssh \
  commit -S --allow-empty -m "signed by someone else" >/dev/null
git -C "$MIRROR" push --quiet origin HEAD:main
other=$(git -C "$MIRROR" rev-parse HEAD)
before=$(cat "$TMP/home3/.config/omarsync/trusted-keys")
if run "$TMP/home3" apply --trust-signer --commit "$other" --no-packages >/dev/null 2>&1; then
  echo "a second signing key was trusted" >&2
  exit 1
fi
[[ $(cat "$TMP/home3/.config/omarsync/trusted-keys") == "$before" ]]

# A new PC can apply an unsigned commit once, then later unsigned commits are refused.
UNSIGNED_ORIGIN="$TMP/unsigned.git"
git init --bare -b main "$UNSIGNED_ORIGIN" >/dev/null
setup_home "$TMP/home4"
ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home4" init local/omarchy-config
ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home4" push --quiet
unsigned_tip=$(git --git-dir="$UNSIGNED_ORIGIN" rev-parse refs/heads/main)
setup_home "$TMP/home5"
ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home5" init local/omarchy-config
unsigned_status=$(ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home5" status --json)
[[ $(jq -r '.remoteSignature' <<<"$unsigned_status") == none ]]
[[ $(jq -r '.firstApply' <<<"$unsigned_status") == true ]]
ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home5" apply --commit "$unsigned_tip" --no-packages
printf 'second\n' >"$TMP/home4/.config/omarchy/shell.json"
ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home4" push --quiet
unsigned_tip2=$(git --git-dir="$UNSIGNED_ORIGIN" rev-parse refs/heads/main)
if ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home5" apply --commit "$unsigned_tip2" --no-packages >/dev/null 2>&1; then
  echo "a second unsigned commit was applied" >&2
  exit 1
fi
if ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home5" apply --force --commit 0000000000000000000000000000000000000000 --no-packages >/dev/null 2>&1; then
  echo "force apply of a different commit should fail" >&2
  exit 1
fi
ORIGIN="$UNSIGNED_ORIGIN" run "$TMP/home5" apply --force --commit "$unsigned_tip2" --no-packages
grep -q 'second' "$TMP/home5/.config/omarchy/shell.json"
keys_before=$(cat "$TMP/home3/.config/omarsync/trusted-keys")
run "$TMP/home3" apply --force --commit "$other" --no-packages
[[ $(cat "$TMP/home3/.config/omarsync/trusted-keys") == "$keys_before" ]]

if run "$TMP/home1" login </dev/null >/dev/null 2>&1; then
  echo "login should fail without a terminal when GitHub is signed out" >&2
  exit 1
fi

if [[ -n ${BEFORE:-} ]]; then
  AFTER=$(md5sum "$REAL_SHELL")
  [[ $BEFORE == "$AFTER" ]]
fi

[[ ! -f $TMP/git-shadow ]]
echo "self-test ok"
