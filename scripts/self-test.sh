#!/usr/bin/env bash
# Omarsync 关键路径冒烟测试(TypeScript CLI)。
#   1. CLI 能跑(--help)
#   2. status --json 输出合法 JSON,且带面板依赖的字段(含 dotRepo/dotBranch)
#   3. 非交互 apply 一律拒绝(审阅模型不能被绕过)
#   4. 插件身份仍是 Omarsync
# 使用临时 HOME,不碰本机真实配置。

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CLI="$ROOT/bin/omarsync"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

ok() { printf 'PASS %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf 'FAIL %s\n' "$1"; fail=$((fail + 1)); }

if [[ ! -f $ROOT/cli/dist/index.js ]]; then
  printf 'cli/dist/index.js 不存在;先跑 (cd cli && bun run build)\n' >&2
  exit 1
fi

if "$CLI" --help 2>&1 | grep -q '审阅'; then
  ok "cli --help"
else
  bad "cli --help"
fi

json=$(HOME="$TMP/home" XDG_CONFIG_HOME="$TMP/home/.config" XDG_STATE_HOME="$TMP/home/.local/state" \
  "$CLI" status --json 2>/dev/null) || true
missing=$(printf '%s' "$json" | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const need = ["ghInstalled","loggedIn","user","repo","dotRepo","dotBranch","branch","initialized","dirty","behind","ahead",
    "remoteCommit","pinnedCommit","remoteSigned","remoteSignature","signerFingerprint","hasTrustedKeys",
    "firstApply","lastPush","running","error","miseConnected","changedFiles"];
  try {
    const st = JSON.parse(s);
    const miss = need.filter((k) => !(k in st));
    if (st.dotBranch !== "dotfiles") miss.push("dotBranch!=dotfiles");
    process.stdout.write(miss.join(","));
  } catch {
    process.stdout.write("<not-json>");
  }
});')
if [[ -z $missing ]]; then
  ok "status --json 字段齐全"
else
  bad "status --json 缺字段: $missing"
fi

if [[ -f $TMP/home/.local/state/omarsync/status.json ]]; then
  ok "status.json 落盘"
else
  bad "status.json 落盘"
fi

if HOME="$TMP/home" "$CLI" apply </dev/null >/dev/null 2>&1; then
  bad "apply 无 --commit 竟然成功"
else
  ok "apply 无 --commit 被拒绝"
fi

fake=$(printf 'a%.0s' {1..40})
if HOME="$TMP/home" "$CLI" apply --commit "$fake" </dev/null >/dev/null 2>&1; then
  bad "apply 伪造 commit 竟然成功"
else
  ok "apply 伪造 commit 被拒绝"
fi

id=$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.id+" "+m.name+" "+m.version)' "$ROOT/manifest.json")
if [[ $id == "io.github.lukebest.omarsync Omarsync 2.0.1" ]]; then
  ok "插件身份"
else
  bad "插件身份: $id"
fi

if grep -R -n -E 'eastgold15|omarchy\.sync|OMARCHY_SYNC' \
  --exclude-dir node_modules --exclude-dir dist --exclude-dir .git \
  "$ROOT/cli/src" "$ROOT/bin" "$ROOT/manifest.json" "$ROOT/BarWidget.qml" "$ROOT/Panel.qml" >/dev/null; then
  bad "仍有 omarchy.sync / eastgold15 命名"
else
  ok "命名已恢复为 Omarsync"
fi

if grep -q 'signUntrustedTip' "$ROOT/cli/src/commands/push.ts" "$ROOT/cli/src/lib/trust.ts"; then
  bad "仍会给未审阅的尖端补签名"
else
  ok "不再给未审阅的尖端补签名"
fi

# 未签名的远程尖端必须在合并前被拒绝;签名函数也不能给另一棵树补签。
trust="$TMP/trust"
mkdir -p "$trust/home/.config/omarsync"
ssh-keygen -q -t ed25519 -f "$trust/key" -N "" -C omarsync-test
pub=$(awk '{print $1 " " $2}' "$trust/key.pub")
printf '* namespaces="git" %s\n' "$pub" > "$trust/home/.config/omarsync/trusted-keys"
git init -q -b main "$trust/mirror"
git -C "$trust/mirror" config user.email omarsync@localhost
git -C "$trust/mirror" config user.name omarsync
git -C "$trust/mirror" config gpg.format ssh
git -C "$trust/mirror" config user.signingkey "$trust/key"
git -C "$trust/mirror" config commit.gpgsign true
git -C "$trust/mirror" config gpg.ssh.program "$(command -v ssh-keygen)"
echo base > "$trust/mirror/file"
git -C "$trust/mirror" add file
git -C "$trust/mirror" commit -q -m base
base_commit=$(git -C "$trust/mirror" rev-parse HEAD)
base_tree=$(git -C "$trust/mirror" rev-parse 'HEAD^{tree}')
git init -q --bare -b main "$trust/origin.git"
git -C "$trust/mirror" remote add origin "$trust/origin.git"
git -C "$trust/mirror" push -q origin HEAD:main
git clone -q -b main "$trust/origin.git" "$trust/attacker"
git -C "$trust/attacker" config user.email attacker@example.com
git -C "$trust/attacker" config user.name attacker
git -C "$trust/attacker" config commit.gpgsign false
mkdir -p "$trust/attacker/hooks/post-apply.d"
printf 'echo pwned\n' > "$trust/attacker/hooks/post-apply.d/evil.sh"
git -C "$trust/attacker" add hooks/post-apply.d/evil.sh
git -C "$trust/attacker" -c commit.gpgsign=false commit -q -m 'add hook'
git -C "$trust/attacker" push -q origin HEAD:main
git -C "$trust/mirror" fetch -q origin '+refs/heads/main:refs/remotes/origin/main'
remote_tip=$(git -C "$trust/mirror" rev-parse origin/main)
set +e
(
  cd "$ROOT/cli"
  HOME="$trust/home" MIRROR="$trust/mirror" SHA="$remote_tip" bun -e '
import { requireTrustedRemoteTip } from "./src/lib/trust.ts";
requireTrustedRemoteTip(process.env.MIRROR, process.env.SHA);
' >/dev/null 2>&1
)
trust_status=$?
set -e
if [[ $trust_status -ne 0 && $(git -C "$trust/mirror" rev-parse HEAD) == "$base_commit" ]]; then
  ok "未签名远程尖端被拒绝"
else
  bad "未签名远程尖端被拒绝"
fi
git -C "$trust/mirror" rebase -q "$remote_tip"
set +e
(
  cd "$ROOT/cli"
  HOME="$trust/home" MIRROR="$trust/mirror" TREE="$base_tree" bun -e '
import { signReviewedTip } from "./src/lib/trust.ts";
signReviewedTip(process.env.MIRROR, process.env.TREE);
' >/dev/null 2>&1
)
sign_status=$?
set -e
if [[ $sign_status -ne 0 && $(git -C "$trust/mirror" rev-parse HEAD) == "$remote_tip" ]]; then
  ok "变基后的树不会被补签"
else
  bad "变基后的树不会被补签"
fi
git -C "$trust/mirror" reset -q --hard "$base_commit"
set +e
(
  cd "$ROOT/cli"
  HOME="$trust/home" MIRROR="$trust/mirror" TREE="$base_tree" bun -e '
import { signReviewedTip } from "./src/lib/trust.ts";
signReviewedTip(process.env.MIRROR, process.env.TREE);
' >/dev/null 2>&1
)
same_status=$?
set -e
if [[ $same_status -eq 0 && $(git -C "$trust/mirror" rev-parse HEAD) == "$base_commit" ]]; then
  ok "已审阅且已签名的树保持原样"
else
  bad "已审阅且已签名的树保持原样"
fi

if grep -q 'signedMiseHead' "$ROOT/cli/src/lib/apply.ts" \
  && grep -q '拒绝应用可变的 dotfiles 分支' "$ROOT/cli/src/lib/apply.ts" \
  && grep -q '拒绝应用分支尖端' "$ROOT/cli/src/lib/apply.ts"; then
  ok "apply 仍钉住签名的 miseHead"
else
  bad "apply 仍钉住签名的 miseHead"
fi

if grep -q 'requireTrustedRemoteTip(mirror, tip)' "$ROOT/cli/src/commands/push.ts" \
  && grep -q -- '--atomic' "$ROOT/cli/src/commands/push.ts"; then
  ok "push 仍在发布前验远程尖端"
else
  bad "push 仍在发布前验远程尖端"
fi

if ! grep -q 'mise\.save()' "$ROOT/cli/src/commands/status.ts" \
  && grep -q 'unsavedFiles()' "$ROOT/cli/src/commands/status.ts"; then
  ok "status 只读探测 mise 改动,不创建检查点"
else
  bad "status 只读探测 mise 改动,不创建检查点"
fi

if grep -q '签名并发布去掉 home/ 之后的这棵树' "$ROOT/cli/dist/index.js" \
  && grep -q '镜像有未提交的改动,拒绝在迁移时签名' "$ROOT/cli/dist/index.js"; then
  ok "dist 带上迁移签名门"
else
  bad "dist 带上迁移签名门"
fi

too_big=""
while IFS= read -r file; do
  size=$(wc -c <"$file")
  if (( size > 524288 )); then
    too_big="$too_big $file($size)"
  fi
done < <(find "$ROOT/cli/dist" -name '*.js' -type f)
if [[ -z $too_big ]]; then
  ok "dist 单个文件不超过 512 KiB"
else
  bad "dist 超过 512 KiB:$too_big"
fi

# pull 不得检出未验证的远程元数据;migrate 不得把那棵树删掉 home/ 之后签走。
setup_key() {
  local home=$1 key=$2
  mkdir -p "$home/.config/omarsync" "$home/.local/state/omarsync"
  ssh-keygen -q -t ed25519 -f "$key" -N "" -C omarsync-test
  printf '* namespaces="git" %s\n' "$(awk '{print $1 " " $2}' "$key.pub")" >"$home/.config/omarsync/trusted-keys"
}

init_mirror() {
  local home=$1 key=$2
  local mirror="$home/.local/state/omarsync/repo"
  git init -q -b main "$mirror"
  git -C "$mirror" config user.email omarsync@localhost
  git -C "$mirror" config user.name omarsync
  git -C "$mirror" config gpg.format ssh
  git -C "$mirror" config user.signingkey "$key"
  git -C "$mirror" config commit.gpgsign true
  git -C "$mirror" config gpg.ssh.program "$(command -v ssh-keygen)"
}

run_cli() {
  local home=$1
  shift
  set +e
  HOME="$home" "$CLI" "$@" >"$home/cli.out" 2>"$home/cli.err"
  local rc=$?
  set -e
  printf '%s' "$rc"
}

run_confirmed_cli() {
  local home=$1 log=$2
  shift 2
  set +e
  python3 - "$CLI" "$home" "$log" "$@" <<'PY'
import os, pty, select, subprocess, sys, time

cli, home, log_path, *args = sys.argv[1:]
master, slave = pty.openpty()
env = os.environ.copy()
env["HOME"] = home
env["OMARSYNC_EDITOR"] = "true"
proc = subprocess.Popen([cli, *args], stdin=slave, stdout=slave, stderr=slave, env=env, close_fds=True)
os.close(slave)
buf = b""
sent = False
end = time.monotonic() + 25
while time.monotonic() < end:
    if proc.poll() is not None:
        while select.select([master], [], [], 0)[0]:
            try:
                chunk = os.read(master, 4096)
            except OSError:
                chunk = b""
            if not chunk:
                break
            buf += chunk
        break
    ready, _, _ = select.select([master], [], [], 0.2)
    if not ready:
        continue
    try:
        chunk = os.read(master, 4096)
    except OSError:
        break
    if not chunk:
        continue
    buf += chunk
    if not sent and b"[y/N]" in buf:
        os.write(master, b"y\n")
        sent = True
else:
    proc.kill()
proc.wait(timeout=5)
with open(log_path, "wb") as handle:
    handle.write(buf)
sys.exit(0 if sent and proc.returncode == 0 else proc.returncode or 1)
PY
  local rc=$?
  set -e
  return "$rc"
}

pull_home="$TMP/pull"
setup_key "$pull_home" "$pull_home/key"
init_mirror "$pull_home" "$pull_home/key"
pull_mirror="$pull_home/.local/state/omarsync/repo"
printf 'safe\n' >"$pull_mirror/safe"
git -C "$pull_mirror" add safe
git -C "$pull_mirror" commit -q -m base
pull_base=$(git -C "$pull_mirror" rev-parse HEAD)
git init -q --bare -b main "$pull_home/origin.git"
git -C "$pull_mirror" remote add origin "$pull_home/origin.git"
git -C "$pull_mirror" push -q origin HEAD:main
pull_rc=$(run_cli "$pull_home" pull)
if [[ $pull_rc -eq 0 && $(git -C "$pull_mirror" rev-parse HEAD) == "$pull_base" ]] \
  && ! git -C "$pull_mirror" symbolic-ref -q HEAD >/dev/null; then
  ok "可信远程尖端可以钉住"
else
  bad "可信远程尖端可以钉住"
fi
git clone -q -b main "$pull_home/origin.git" "$pull_home/attacker"
git -C "$pull_home/attacker" config user.email attacker@example.com
git -C "$pull_home/attacker" config user.name attacker
git -C "$pull_home/attacker" config commit.gpgsign false
mkdir -p "$pull_home/attacker/home" "$pull_home/attacker/hooks/post-apply.d"
printf 'secret\n' >"$pull_home/attacker/home/secret"
printf 'echo pwned\n' >"$pull_home/attacker/hooks/post-apply.d/evil.sh"
chmod +x "$pull_home/attacker/hooks/post-apply.d/evil.sh"
git -C "$pull_home/attacker" add home hooks
git -C "$pull_home/attacker" -c commit.gpgsign=false commit -q -m 'add hook'
git -C "$pull_home/attacker" push -q origin HEAD:main
unsigned_tip=$(git -C "$pull_home/attacker" rev-parse HEAD)
pull_rc=$(run_cli "$pull_home" pull)
if [[ $pull_rc -ne 0 && $(git -C "$pull_mirror" rev-parse HEAD) == "$pull_base" \
  && -f $pull_mirror/safe && ! -e $pull_mirror/hooks/post-apply.d/evil.sh ]] \
  && grep -q '不是可信签名' "$pull_home/cli.err"; then
  ok "pull 拒绝检出未签名远程元数据"
else
  bad "pull 拒绝检出未签名远程元数据"
fi
git -C "$pull_mirror" fetch -q origin
git -C "$pull_mirror" checkout -q --detach "$unsigned_tip"
origin_before=$(git -C "$pull_home/origin.git" rev-parse main)
migrate_rc=$(run_cli "$pull_home" migrate)
origin_after=$(git -C "$pull_home/origin.git" rev-parse main)
if [[ $migrate_rc -ne 0 && $(git -C "$pull_mirror" rev-parse HEAD) == "$unsigned_tip" \
  && $origin_before == "$origin_after" && -d $pull_mirror/home ]] \
  && ! git -C "$pull_mirror" log --format=%s | grep -q 'drop file mirror'; then
  ok "migrate 拒绝签名未验证的 home/ 树"
else
  bad "migrate 拒绝签名未验证的 home/ 树"
fi

repair_rc=$(run_cli "$pull_home" repair-remote --commit "$unsigned_tip")
if [[ $repair_rc -ne 0 && $(git -C "$pull_home/origin.git" rev-parse main) == "$unsigned_tip" ]]; then
  ok "repair-remote 非交互时拒绝补签名"
else
  bad "repair-remote 非交互时拒绝补签名"
fi
repair_rc=0
run_confirmed_cli "$pull_home" "$TMP/repair.log" repair-remote --commit "$unsigned_tip" || repair_rc=$?
repaired_tip=$(git -C "$pull_home/origin.git" rev-parse main)
if [[ $repair_rc -ne 0 ]] \
  || [[ $(git -C "$pull_mirror" rev-parse "$repaired_tip^") != "$unsigned_tip" ]] \
  || [[ $(git -C "$pull_mirror" rev-parse "$repaired_tip^{tree}") != $(git -C "$pull_mirror" rev-parse "$unsigned_tip^{tree}") ]] \
  || [[ $(git -C "$pull_mirror" rev-parse HEAD) != "$unsigned_tip" ]] \
  || ! git -C "$pull_mirror" -c "gpg.ssh.allowedSignersFile=$pull_home/.config/omarsync/trusted-keys" verify-commit "$repaired_tip" >/dev/null 2>&1; then
  bad "repair-remote 审阅后签同一棵树且不动本地 HEAD"
  printf 'repair rc=%s\n%s\n' "$repair_rc" "$(<"$TMP/repair.log")"
else
  ok "repair-remote 审阅后签同一棵树且不动本地 HEAD"
fi
repair_status=$(HOME="$pull_home" "$CLI" status --json 2>/dev/null) || repair_status=""
if [[ $repair_status == *'"behind":0,"ahead":0'* && $repair_status == *'"remoteSignature":"trusted"'* ]]; then
  ok "仅签名变化的提交不显示为待同步"
else
  bad "仅签名变化的提交不显示为待同步"
fi

other_home="$TMP/other"
setup_key "$other_home" "$other_home/key"
init_mirror "$other_home" "$other_home/key"
other_mirror="$other_home/.local/state/omarsync/repo"
printf 'safe\n' >"$other_mirror/safe"
git -C "$other_mirror" add safe
git -C "$other_mirror" commit -q -m base
git init -q --bare -b main "$other_home/origin.git"
git -C "$other_mirror" remote add origin "$other_home/origin.git"
git -C "$other_mirror" push -q origin HEAD:main
ssh-keygen -q -t ed25519 -f "$other_home/other" -N "" -C other
git clone -q -b main "$other_home/origin.git" "$other_home/attacker"
git -C "$other_home/attacker" config user.email attacker@example.com
git -C "$other_home/attacker" config user.name attacker
git -C "$other_home/attacker" config gpg.format ssh
git -C "$other_home/attacker" config user.signingkey "$other_home/other"
git -C "$other_home/attacker" config commit.gpgsign true
git -C "$other_home/attacker" config gpg.ssh.program "$(command -v ssh-keygen)"
mkdir -p "$other_home/attacker/home" "$other_home/attacker/hooks/post-apply.d"
printf 'secret\n' >"$other_home/attacker/home/secret"
printf 'echo pwned\n' >"$other_home/attacker/hooks/post-apply.d/evil.sh"
git -C "$other_home/attacker" add home hooks
git -C "$other_home/attacker" commit -q -m 'signed by other key'
git -C "$other_home/attacker" push -q origin HEAD:main
other_tip=$(git -C "$other_home/attacker" rev-parse HEAD)
other_pull=$(run_cli "$other_home" pull)
if [[ $other_pull -ne 0 && $(git -C "$other_mirror" rev-parse HEAD) != "$other_tip" \
  && ! -e $other_mirror/hooks/post-apply.d/evil.sh ]]; then
  ok "pull 拒绝检出别的密钥签过的元数据"
else
  bad "pull 拒绝检出别的密钥签过的元数据"
fi
git -C "$other_mirror" fetch -q origin
git -C "$other_mirror" checkout -q --detach "$other_tip"
other_before=$(git -C "$other_home/origin.git" rev-parse main)
other_rc=$(run_cli "$other_home" migrate)
if [[ $other_rc -ne 0 && $(git -C "$other_mirror" rev-parse HEAD) == "$other_tip" \
  && $(git -C "$other_home/origin.git" rev-parse main) == "$other_before" ]]; then
  ok "migrate 拒绝别的密钥签过的 home/ 树"
else
  bad "migrate 拒绝别的密钥签过的 home/ 树"
fi

keep_home="$TMP/keep"
setup_key "$keep_home" "$keep_home/key"
init_mirror "$keep_home" "$keep_home/key"
keep_mirror="$keep_home/.local/state/omarsync/repo"
mkdir -p "$keep_mirror/home" "$keep_mirror/hooks/post-apply.d"
printf 'old\n' >"$keep_mirror/home/old"
printf 'echo kept\n' >"$keep_mirror/hooks/post-apply.d/kept.sh"
chmod +x "$keep_mirror/hooks/post-apply.d/kept.sh"
git -C "$keep_mirror" add home hooks
git -C "$keep_mirror" commit -q -m 'legacy home'
keep_base=$(git -C "$keep_mirror" rev-parse HEAD)
git init -q --bare -b main "$keep_home/origin.git"
git -C "$keep_mirror" remote add origin "$keep_home/origin.git"
git -C "$keep_mirror" push -q origin HEAD:main
keep_rc=$(run_cli "$keep_home" migrate)
if [[ $keep_rc -ne 0 && $(git -C "$keep_mirror" rev-parse HEAD) == "$keep_base" \
  && -f $keep_mirror/home/old ]] && grep -q '已取消,未签名也未推送' "$keep_home/cli.err"; then
  ok "没有终端时 migrate 不签名"
else
  bad "没有终端时 migrate 不签名"
fi
mkdir -p "$keep_mirror/hooks/post-apply.d"
printf 'echo pwned\n' >"$keep_mirror/hooks/post-apply.d/evil.sh"
dirty_rc=$(run_cli "$keep_home" migrate)
if [[ $dirty_rc -ne 0 && $(git -C "$keep_mirror" rev-parse HEAD) == "$keep_base" \
  && -f $keep_mirror/home/old ]] && grep -q '未提交的改动' "$keep_home/cli.err"; then
  ok "migrate 不把工作区里多出来的钩子签进去"
else
  bad "migrate 不把工作区里多出来的钩子签进去"
fi
rm -f "$keep_mirror/hooks/post-apply.d/evil.sh"
keep_yes=0
run_confirmed_cli "$keep_home" "$TMP/keep-migrate.log" migrate || keep_yes=$?
keep_now=$(git -C "$keep_mirror" rev-parse HEAD)
keep_diff=$(git -C "$keep_mirror" diff --name-only --no-renames "$keep_base" HEAD)
keep_mode=$(git -C "$keep_mirror" ls-tree HEAD hooks/post-apply.d/kept.sh | awk '{print $1}')
if [[ $keep_yes -eq 0 && $keep_now != "$keep_base" \
  && $(git -C "$keep_mirror" rev-parse 'HEAD^') == "$keep_base" \
  && $keep_diff == "home/old" \
  && $keep_mode == 100755 \
  && $(git -C "$keep_home/origin.git" rev-parse main) == "$keep_now" ]] \
  && git -C "$keep_mirror" -c "gpg.ssh.allowedSignersFile=$keep_home/.config/omarsync/trusted-keys" verify-commit HEAD >/dev/null 2>&1 \
  && ! git -C "$keep_mirror" ls-tree -r --name-only HEAD | grep -q '^home/'; then
  ok "确认后只签名去掉 home/ 的可信树"
else
  bad "确认后只签名去掉 home/ 的可信树"
fi

# 选择性 push:临时 HOME + 本地 bare remote。默认 --yes 发布新增/修改,
# 保留删除项和 push-ignore 内容,并断言 main.miseHead == dotfiles tree。
sel_home="$TMP/selective"
setup_key "$sel_home" "$sel_home/key"
init_mirror "$sel_home" "$sel_home/key"
mkdir -p "$sel_home/.config/selective" "$sel_home/.config/omarsync"
printf 'a1\n' >"$sel_home/.config/selective/a.txt"
printf 'del\n' >"$sel_home/.config/selective/del.txt"
printf 'ignored1\n' >"$sel_home/.config/selective/ignored.txt"
printf 'REPO=test/selective\nBRANCH=main\n' >"$sel_home/.config/omarsync/config"
printf '.config/selective\n' >"$sel_home/.config/omarsync/scope"
printf '.config/selective/ignored.txt\n' >"$sel_home/.config/omarsync/push-ignore"
sel_origin="$sel_home/origin.git"
git init -q --bare -b main "$sel_origin"
git -C "$sel_home/.local/state/omarsync/repo" remote add origin "$sel_origin"
sel_env=(HOME="$sel_home" XDG_CONFIG_HOME="$sel_home/.config" XDG_STATE_HOME="$sel_home/.local/state" XDG_DATA_HOME="$sel_home/.local/share" XDG_CACHE_HOME="$sel_home/.cache" OMARSYNC_DOT_ORIGIN="$sel_origin" OMARSYNC_EDITOR=true)
env "${sel_env[@]}" mise dot track -y "$sel_home/.config/selective" >/dev/null 2>&1
env "${sel_env[@]}" mise dot save >/dev/null 2>&1
set +e
env "${sel_env[@]}" /usr/bin/node "$ROOT/cli/dist/index.js" push --yes >"$sel_home/push1.log" 2>&1
sel_rc1=$?
set -e
printf 'a2\n' >"$sel_home/.config/selective/a.txt"
printf 'b1\n' >"$sel_home/.config/selective/b.txt"
rm "$sel_home/.config/selective/del.txt"
printf 'ignored2\n' >"$sel_home/.config/selective/ignored.txt"
set +e
env "${sel_env[@]}" /usr/bin/node "$ROOT/cli/dist/index.js" push --yes >"$sel_home/push2.log" 2>&1
sel_rc2=$?
set -e
sel_main=$(git --git-dir="$sel_origin" show main:omarsync.json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).miseHead||"")}catch{}})')
sel_tree=$(git --git-dir="$sel_origin" rev-parse 'dotfiles^{tree}' 2>/dev/null || true)
if [[ $sel_rc1 -eq 0 && $sel_rc2 -eq 0 && $sel_main == "$sel_tree" \
  && $(git --git-dir="$sel_origin" show dotfiles:home/.config/selective/a.txt 2>/dev/null) == "a2" \
  && $(git --git-dir="$sel_origin" show dotfiles:home/.config/selective/b.txt 2>/dev/null) == "b1" \
  && $(git --git-dir="$sel_origin" show dotfiles:home/.config/selective/del.txt 2>/dev/null) == "del" ]] \
  && ! git --git-dir="$sel_origin" cat-file -e dotfiles:home/.config/selective/ignored.txt 2>/dev/null; then
  ok "选择性 push:只发布选中项,保留删除和 ignored"
else
  bad "选择性 push:只发布选中项,保留删除和 ignored"
  printf 'rc1=%s rc2=%s main=%s tree=%s\n%s\n' "$sel_rc1" "$sel_rc2" "$sel_main" "$sel_tree" "$(<"$sel_home/push2.log")"
fi

# 只有元数据变化、没有 dotfiles 变化时也必须真正推送 main。
sel_old_main=$(git --git-dir="$sel_origin" rev-parse main)
mkdir -p "$sel_home/.local/state/omarchy/current"
printf 'test-theme\n' >"$sel_home/.local/state/omarchy/current/theme.name"
printf 'theme:backgrounds/test.jpg\n' >"$sel_home/.local/state/omarchy/current/background"
set +e
env "${sel_env[@]}" /usr/bin/node "$ROOT/cli/dist/index.js" push --yes >"$sel_home/push3.log" 2>&1
sel_rc3=$?
set -e
sel_new_main=$(git --git-dir="$sel_origin" rev-parse main 2>/dev/null || true)
if [[ $sel_rc3 -eq 0 && $sel_new_main != "$sel_old_main" \
  && $(git --git-dir="$sel_origin" rev-parse 'dotfiles^{tree}') == "$sel_tree" ]] \
  && git --git-dir="$sel_origin" show main:current/theme.name | grep -qx 'test-theme'; then
  ok "只有元数据变化时也会推送"
else
  bad "只有元数据变化时也会推送"
  printf 'rc3=%s old=%s new=%s\n%s\n' "$sel_rc3" "$sel_old_main" "$sel_new_main" "$(<"$sel_home/push3.log")"
fi

printf '%d passed, %d failed\n' "$pass" "$fail"
[[ $fail -eq 0 ]]
