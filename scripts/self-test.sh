#!/usr/bin/bash
# 端到端自测:本地 bare 仓库 + 多个假 HOME,覆盖 push/apply/信任/插件/hooks/冲突/迁移。
# 不登录 GitHub,不写真实 HOME。文件同步内核是 mise dot,元数据仓库仍是签名 git。

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass() { printf 'PASS %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

# git/lua/mise 的影子二进制:若被调用说明可信路径解析失效
mkdir -p "$TMP/bin" "$TMP/keys"
for tool in git lua mise; do
  cat >"$TMP/bin/$tool" <<EOF
#!/bin/sh
touch "$TMP/${tool}-shadow"
exit 99
EOF
done
cat >"$TMP/bin/yay" <<EOF
#!/bin/sh
touch "$TMP/yay-shadow"
exit 0
EOF
chmod +x "$TMP/bin/"*

ssh-keygen -t ed25519 -f "$TMP/keys/id" -N "" -C omarsync-test >/dev/null

ORIGIN="$TMP/meta.git"
DOT_ORIGIN="$TMP/dot.git"
git init --bare -b main "$ORIGIN" >/dev/null
git init --bare -b main "$DOT_ORIGIN" >/dev/null

run() {
  env -u GH_TOKEN -u GITHUB_TOKEN -u GH_CONFIG_DIR \
    HOME="$1" \
    XDG_CONFIG_HOME="$1/.config" \
    XDG_STATE_HOME="$1/.local/state" \
    USER=tester LOGNAME=tester \
    OMARSYNC_ORIGIN="${OMARSYNC_TEST_ORIGIN:-$ORIGIN}" \
    OMARSYNC_DOT_ORIGIN="${OMARSYNC_TEST_DOT:-$DOT_ORIGIN}" \
    OMARSYNC_SKIP_LIVE=1 \
    PATH="$TMP/bin:/usr/bin:/bin:/usr/sbin:/usr/share/omarchy/bin" \
    LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    "$ROOT/bin/omarsync" "${@:2}"
}

setup_home() {
  local home="$1"
  mkdir -p \
    "$home/.config/omarchy/backgrounds/demo" \
    "$home/.config/omarchy/plugins/secret" \
    "$home/.config/omarsync" \
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
  cat >"$home/.config/omarsync/scope" <<'EOF'
.config/omarchy | plugins/,*.bak.*,*.mp4,*.mkv,*.webm,*.mov,*.avi,*.m4v
.config/hypr | *.bak.*
.config/nvim
EOF
}

mirror() { printf '%s\n' "$1/.local/state/omarsync/repo"; }

# ===== 1. 签名 push 与状态 =====
setup_home "$TMP/home1"
run "$TMP/home1" trust-key "$TMP/keys/id.pub" "$TMP/keys/id"
run "$TMP/home1" init local/omarchy-config
run "$TMP/home1" push --quiet
grep -qxF "SIGNING_KEY=$TMP/keys/id" "$TMP/home1/.config/omarsync/config"
M1=$(mirror "$TMP/home1")
git -C "$M1" -c gpg.ssh.allowedSignersFile="$TMP/home1/.config/omarsync/trusted-keys" verify-commit HEAD
# 新格式:镜像里不再有 home/ 目录
[[ ! -e $M1/home ]]
[[ $(tr -d '[:space:]' <"$M1/current/theme.name") == demo ]]
grep -q '^rel:demo/a.png$' "$M1/current/background"
grep -q '"miseHead"' "$M1/omarsync.json"
# dotfiles 仓库已有 mise 历史
[[ $(git --git-dir="$DOT_ORIGIN" rev-list --all --count) -gt 0 ]]
pass "signed push, meta-only mirror, dotfiles published"

[[ $(run "$TMP/home1" status --json | jq -r '.dirty') == false ]]
[[ $(run "$TMP/home1" status --json | jq -r '.behind') == 0 ]]
printf '{ "version": 1, "changed": true }\n' >"$TMP/home1/.config/omarchy/shell.json"
[[ $(run "$TMP/home1" status --json | jq -r '.dirty') == true ]]
run "$TMP/home1" push --quiet
[[ $(run "$TMP/home1" status --json | jq -r '.remoteSigned') == true ]]
tip=$(run "$TMP/home1" status --json | jq -r '.remoteCommit')
[[ $tip =~ ^[0-9a-f]{40}$ ]]
if run "$TMP/home1" apply --no-packages >/dev/null 2>&1; then
  fail "apply without --commit should fail"
fi
pass "status dirty/clean + apply requires --commit"

# ===== 2. 插件/hooks(可信提交,exec 开启)=====
mkdir -p "$M1/plugins-local/evil" "$M1/plugins-local/test.widget" "$M1/hooks/post-apply.d"
printf 'echo pwned\n' >"$M1/plugins-local/evil/payload.sh"
chmod +x "$M1/plugins-local/evil/payload.sh"
cat >"$M1/plugins-local/test.widget/manifest.json" <<'EOF'
{
  "schemaVersion": 1,
  "id": "test.widget",
  "name": "Test",
  "version": "1",
  "kinds": ["overlay"],
  "entryPoints": { "overlay": "Widget.qml" }
}
EOF
printf 'import QtQuick\n' >"$M1/plugins-local/test.widget/Widget.qml"
cat >"$M1/hooks/post-apply.d/10-mark.sh" <<'EOF'
#!/bin/bash
touch "$HOME/hook-ran"
EOF
chmod +x "$M1/hooks/post-apply.d/10-mark.sh"
jq -n '[{id:"test.widget",url:"",commit:"",enabled:true,local:true}]' >"$M1/plugins.json"
git -C "$M1" add plugins-local hooks plugins.json
git -C "$M1" commit -S -m "plant an executable plugin tree" >/dev/null
git -C "$M1" push --quiet origin HEAD:main
pass "planted signed plugin/hook snapshot"

# ===== 3. home2 应用(信任密钥已导入)=====
setup_home "$TMP/home2"
printf 'local only\n' >"$TMP/home2/.config/omarchy/shell.json"
rm -f "$TMP/home2/.config/hypr/bindings.lua.bak.1"
run "$TMP/home2" trust-key "$TMP/keys/id.pub" "$TMP/keys/id"
run "$TMP/home2" init local/omarchy-config
run "$TMP/home2" pull
if git -C "$(mirror "$TMP/home2")" symbolic-ref -q HEAD >/dev/null; then
  fail "mirror is still on a branch after pull"
fi
sha=$(git -C "$(mirror "$TMP/home2")" rev-parse --verify HEAD)
if run "$TMP/home2" apply --commit 0000000000000000000000000000000000000000 --no-packages >/dev/null 2>&1; then
  fail "apply of a different commit should fail"
fi
mkdir -p "$TMP/home2/.config/omarchy/plugins/io.github.lukebest.omarsync"
printf 'stay\n' >"$TMP/home2/.config/omarchy/plugins/io.github.lukebest.omarsync/keep"
run "$TMP/home2" apply --commit "$sha" --no-packages
# 文件来自 mise dot
grep -q '"changed": true' "$TMP/home2/.config/omarchy/shell.json"
[[ ! -e $TMP/home2/.config/hypr/bindings.lua.bak.1 ]]
# 插件与 hooks 来自签名元数据
[[ ! -e $TMP/home2/.config/omarchy/plugins/evil ]]
[[ -f $TMP/home2/.config/omarchy/plugins/test.widget/Widget.qml ]]
[[ -f $TMP/home2/hook-ran ]]
# 已安装的插件目录原样保留
grep -q '^stay$' "$TMP/home2/.config/omarchy/plugins/io.github.lukebest.omarsync/keep"
[[ -f $TMP/home2/.config/omarchy/plugins/secret/x ]]
# 主题与壁纸(SKIP_LIVE 写状态文件)
[[ $(tr -d '[:space:]' <"$TMP/home2/.local/state/omarchy/current/theme.name") == demo ]]
[[ $(readlink -f "$TMP/home2/.local/state/omarchy/current/background") == "$TMP/home2/.config/omarchy/backgrounds/demo/a.png" ]]
# 应用前留有备份(init adopt 已同步过文件,内容是同步后的)
[[ -d $TMP/home2/.local/state/omarsync/backup ]]
[[ -n $(find "$TMP/home2/.local/state/omarsync/backup" -type f -print -quit) ]]
pass "apply: files via mise, plugins/hooks via signed meta, backup kept"

# ===== 4. home3 首次应用 TOFU =====
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
[[ ! -f $TMP/yay-shadow ]]
pass "first-apply TOFU pins the signer"

# ===== 5. 钉住 commit 的远程插件 =====
plug=$TMP/plugsrc
mkdir -p "$plug"
git -C "$plug" init -q -b main
cat >"$plug/manifest.json" <<'EOF'
{
  "schemaVersion": 1,
  "id": "test.remote",
  "name": "Remote",
  "version": "1",
  "kinds": ["overlay"],
  "entryPoints": { "overlay": "Widget.qml" }
}
EOF
printf 'import QtQuick\n' >"$plug/Widget.qml"
git -C "$plug" config user.email test@example.com
git -C "$plug" config user.name test
git -C "$plug" add -A
git -C "$plug" commit -q -m plugin
good=$(git -C "$plug" rev-parse HEAD)
git clone -q --bare "$plug" "$TMP/plug.git"
jq -n --arg url "file://$TMP/plug.git" --arg rev "$good" \
  '[{id:"test.remote",url:$url,commit:$rev,enabled:false,local:false}]' >"$M1/plugins.json"
git -C "$M1" add plugins.json
git -C "$M1" commit -S -m "pin a plugin commit" >/dev/null
git -C "$M1" push --quiet origin HEAD:main
remote_sha=$(git -C "$M1" rev-parse HEAD)
run "$TMP/home2" apply --commit "$remote_sha" --no-packages
[[ -f $TMP/home2/.config/omarchy/plugins/test.remote/Widget.qml ]]
rm -rf "$TMP/home2/.config/omarchy/plugins/test.remote"
jq -n --arg url "file://$TMP/plug.git" \
  '[{id:"test.remote",url:$url,commit:"0123456789abcdef0123456789abcdef01234567",enabled:false,local:false}]' >"$M1/plugins.json"
git -C "$M1" add plugins.json
git -C "$M1" commit -S -m "pin a missing plugin commit" >/dev/null
git -C "$M1" push --quiet origin HEAD:main
bad_sha=$(git -C "$M1" rev-parse HEAD)
if run "$TMP/home2" apply --commit "$bad_sha" --no-packages >/dev/null 2>&1; then
  fail "a plugin commit mismatch should fail"
fi
[[ ! -e $TMP/home2/.config/omarchy/plugins/test.remote ]]
pass "pinned remote plugin install + mismatch refusal"

# ===== 6. 双机编辑同一文件:冲突后 apply 取远程 =====
printf 'from home2\n' >"$TMP/home2/.config/omarchy/shell.json"
run "$TMP/home2" push --quiet
printf 'from home1\n' >"$TMP/home1/.config/omarchy/shell.json"
# home1 的 mise sync 与 home2 冲突:push 报冲突但元数据已推
run "$TMP/home1" push --quiet >/dev/null 2>&1 || true
h1_sha=$(git -C "$M1" rev-parse origin/main)
run "$TMP/home1" apply --commit "$h1_sha" --no-packages
# take-remote-all:home2 的版本获胜
grep -q 'from home2' "$TMP/home1/.config/omarchy/shell.json"
git -C "$M1" -c gpg.ssh.allowedSignersFile="$TMP/home1/.config/omarsync/trusted-keys" verify-commit HEAD
pass "conflict resolves take-remote on apply"

# ===== 7. 远程 scope 投毒被丢弃;本地 scope 选 .ssh 被拒绝 =====
printf '%s\n' '.ssh' '.config/gh' >"$M1/omarsync.scope"
git -C "$M1" add omarsync.scope
git -C "$M1" commit -S -m "poison remote scope" >/dev/null
git -C "$M1" push --quiet origin HEAD:main
mkdir -p "$TMP/home1/.ssh" "$TMP/home1/.config/gh"
printf 'SECRET\n' >"$TMP/home1/.ssh/id_ed25519"
printf 'token\n' >"$TMP/home1/.config/gh/hosts.yml"
run "$TMP/home1" push --quiet
[[ ! -e $M1/omarsync.scope ]]
if git -C "$M1" ls-tree -r --name-only HEAD | grep -Eq '(^|/)(\.ssh/|id_ed25519|hosts\.yml|omarsync\.scope)$'; then
  fail "remote scope caused secrets or scope policy to be uploaded"
fi
printf '\n.ssh\n' >>"$TMP/home1/.config/omarsync/scope"
if run "$TMP/home1" push --quiet >/dev/null 2>&1; then
  fail "local scope was allowed to select .ssh"
fi
printf '\n.config/mise\n' >>"$TMP/home1/.config/omarsync/scope"
if run "$TMP/home1" push --quiet >/dev/null 2>&1; then
  fail "local scope was allowed to select .config/mise"
fi
cp "$ROOT/omarsync.scope.example" "$TMP/home1/.config/omarsync/scope"
pass "scope poisoning and banned paths refused"

# ===== 8. scope 移除条目 → untrack =====
grep -q nvim "$TMP/home1/.config/omarsync/scope"
sed -i '/^\.config\/nvim$/d' "$TMP/home1/.config/omarsync/scope"
run "$TMP/home1" push --quiet
if env -i HOME="$TMP/home1" PATH=/usr/bin:/bin mise dot paths 2>/dev/null | grep -q '\.config/nvim'; then
  fail "removed scope entry is still tracked by mise"
fi
pass "scope removal untracks"

# ===== 9. 未签名/他人签名/force =====
git -C "$M1" -c commit.gpgsign=false commit --allow-empty -m "unsigned" >/dev/null
git -C "$M1" push --quiet origin HEAD:main
unsigned=$(git -C "$M1" rev-parse HEAD)
if run "$TMP/home2" apply --commit "$unsigned" --no-packages >/dev/null 2>&1; then
  fail "unsigned commit was applied"
fi
if run "$TMP/home3" apply --trust-signer --commit "$unsigned" --no-packages >/dev/null 2>&1; then
  fail "trust-signer accepted an unsigned commit"
fi
ssh-keygen -t ed25519 -f "$TMP/keys/other" -N "" -C other >/dev/null
git -C "$M1" -c commit.gpgsign=false -c user.signingkey="$TMP/keys/other" -c gpg.format=ssh \
  commit -S --allow-empty -m "signed by someone else" >/dev/null
git -C "$M1" push --quiet origin HEAD:main
other=$(git -C "$M1" rev-parse HEAD)
before=$(cat "$TMP/home3/.config/omarsync/trusted-keys")
if run "$TMP/home3" apply --trust-signer --commit "$other" --no-packages >/dev/null 2>&1; then
  fail "a second signing key was trusted"
fi
[[ $(cat "$TMP/home3/.config/omarsync/trusted-keys") == "$before" ]]
keys_before=$(cat "$TMP/home3/.config/omarsync/trusted-keys")
run "$TMP/home3" apply --force --commit "$other" --no-packages
[[ $(cat "$TMP/home3/.config/omarsync/trusted-keys") == "$keys_before" ]]
pass "unsigned/foreign-signer/force policy"

# ===== 10. 密码保护的默认密钥 → 专用签名密钥 =====
SIGN_ORIGIN="$TMP/sign.git"; SIGN_DOT="$TMP/sign-dot.git"
git init --bare -b main "$SIGN_ORIGIN" >/dev/null
git init --bare -b main "$SIGN_DOT" >/dev/null
setup_home "$TMP/home4"
mkdir -p "$TMP/home4/.ssh"
ssh-keygen -q -t ed25519 -f "$TMP/home4/.ssh/id_ed25519" -N "secret" -C locked
OMARSYNC_TEST_ORIGIN="$SIGN_ORIGIN" OMARSYNC_TEST_DOT="$SIGN_DOT" run "$TMP/home4" init local/omarchy-config
OMARSYNC_TEST_ORIGIN="$SIGN_ORIGIN" OMARSYNC_TEST_DOT="$SIGN_DOT" run "$TMP/home4" push --quiet
grep -qxF "SIGNING_KEY=$TMP/home4/.config/omarsync/signing_key" "$TMP/home4/.config/omarsync/config"
git -C "$(mirror "$TMP/home4")" \
  -c gpg.ssh.allowedSignersFile="$TMP/home4/.config/omarsync/trusted-keys" verify-commit HEAD
if git -C "$(mirror "$TMP/home4")" ls-tree -r --name-only HEAD | grep -q signing_key; then
  fail "signing key was uploaded"
fi
pass "dedicated signing key for passphrase-locked default"

# ===== 11. 未签名快照:首机一次,之后拒绝;force 可过但不跑 hooks =====
UNSIGNED_ORIGIN="$TMP/unsigned.git"; UNSIGNED_DOT="$TMP/unsigned-dot.git"
git init --bare -b main "$UNSIGNED_ORIGIN" >/dev/null
git init --bare -b main "$UNSIGNED_DOT" >/dev/null
plant_unsigned() {
  local message="$1"
  local work="$TMP/unsigned-work"
  rm -rf "$work"
  if git --git-dir="$UNSIGNED_ORIGIN" rev-parse --verify --quiet refs/heads/main >/dev/null; then
    git clone -q "$UNSIGNED_ORIGIN" "$work"
    git -C "$work" checkout -q -B main origin/main
  else
    git init -q -b main "$work"
    git -C "$work" remote add origin "$UNSIGNED_ORIGIN"
  fi
  git -C "$work" config user.email test@example.com
  git -C "$work" config user.name test
  mkdir -p "$work/hooks/post-apply.d"
  printf '%s\n' '#!/bin/bash' 'touch "$HOME/hook-ran"' >"$work/hooks/post-apply.d/10-mark.sh"
  chmod +x "$work/hooks/post-apply.d/10-mark.sh"
  git -C "$work" add -A
  git -C "$work" -c commit.gpgsign=false commit -q --allow-empty -m "$message"
  git -C "$work" push -q origin HEAD:main
}
plant_unsigned 'unsigned snapshot'
unsigned_tip=$(git --git-dir="$UNSIGNED_ORIGIN" rev-parse refs/heads/main)
setup_home "$TMP/home5"
OMARSYNC_TEST_ORIGIN="$UNSIGNED_ORIGIN" OMARSYNC_TEST_DOT="$UNSIGNED_DOT" run "$TMP/home5" init local/omarchy-config
unsigned_status=$(OMARSYNC_TEST_ORIGIN="$UNSIGNED_ORIGIN" OMARSYNC_TEST_DOT="$UNSIGNED_DOT" run "$TMP/home5" status --json)
[[ $(jq -r '.remoteSignature' <<<"$unsigned_status") == none ]]
[[ $(jq -r '.firstApply' <<<"$unsigned_status") == true ]]
OMARSYNC_TEST_ORIGIN="$UNSIGNED_ORIGIN" OMARSYNC_TEST_DOT="$UNSIGNED_DOT" run "$TMP/home5" apply --commit "$unsigned_tip" --no-packages
# 未签名首应用:配置写入,但 hooks 不跑
[[ ! -f $TMP/home5/hook-ran ]]
plant_unsigned 'second unsigned snapshot'
unsigned_tip2=$(git --git-dir="$UNSIGNED_ORIGIN" rev-parse refs/heads/main)
if OMARSYNC_TEST_ORIGIN="$UNSIGNED_ORIGIN" OMARSYNC_TEST_DOT="$UNSIGNED_DOT" run "$TMP/home5" apply --commit "$unsigned_tip2" --no-packages >/dev/null 2>&1; then
  fail "a second unsigned commit was applied"
fi
if OMARSYNC_TEST_ORIGIN="$UNSIGNED_ORIGIN" OMARSYNC_TEST_DOT="$UNSIGNED_DOT" run "$TMP/home5" apply --force --commit 0000000000000000000000000000000000000000 --no-packages >/dev/null 2>&1; then
  fail "force apply of a different commit should fail"
fi
OMARSYNC_TEST_ORIGIN="$UNSIGNED_ORIGIN" OMARSYNC_TEST_DOT="$UNSIGNED_DOT" run "$TMP/home5" apply --force --commit "$unsigned_tip2" --no-packages
[[ ! -f $TMP/home5/hook-ran ]]
pass "unsigned first-apply-once policy and force"

# ===== 12. 老格式迁移 =====
setup_home "$TMP/home6"
run "$TMP/home6" trust-key "$TMP/keys/id.pub" "$TMP/keys/id"
run "$TMP/home6" init local/omarchy-config
M6=$(mirror "$TMP/home6")
# 模拟老格式:镜像里有 home/ 目录
mkdir -p "$M6/home/.config/omarchy"
printf 'legacy\n' >"$M6/home/.config/omarchy/shell.json"
git -C "$M6" add home
git -C "$M6" commit -S -m "legacy mirror layout" >/dev/null
git -C "$M6" push --quiet origin HEAD:main
run "$TMP/home6" migrate
[[ ! -e $M6/home ]]
if git -C "$M6" ls-tree -r --name-only HEAD | grep -q '^home/'; then
  fail "migrate left home/ in the repository"
fi
# 迁移后 dotfiles 仍由 mise 管理
env -i HOME="$TMP/home6" PATH=/usr/bin:/bin mise dot status >/dev/null 2>&1
pass "legacy mirror migration"

# ===== 13. 终端要求与影子哨兵 =====
if run "$TMP/home1" setup </dev/null >/dev/null 2>&1; then
  fail "setup should fail without a terminal"
fi
if run "$TMP/home1" login </dev/null >/dev/null 2>&1; then
  fail "login should fail without a terminal when GitHub is signed out"
fi
[[ ! -f $TMP/git-shadow ]]
[[ ! -f $TMP/lua-shadow ]]
[[ ! -f $TMP/mise-shadow ]]
pass "no shadow binaries were executed"

echo
echo "self-test ok"
