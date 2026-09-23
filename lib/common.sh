#!/usr/bin/env bash
# Shared paths, config, locking, and logging for omarsync.

PLUGIN_ID="io.github.lukebest.omarsync"
MAX_FILE_SIZE="50m"
BACKUP_KEEP=5
QUIET=0
NOTIFY=0

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

log() {
  (( QUIET )) && return 0
  printf 'omarsync: %s\n' "$*"
}

warn() {
  printf 'omarsync: %s\n' "$*" >&2
}

die() {
  printf 'omarsync: %s\n' "$*" >&2
  exit 1
}

notify() {
  local headline="$1"
  local body="${2:-}"
  (( NOTIFY )) || return 0
  [[ -n ${OMARCHY_NOTIFY_BIN:-} ]] || return 0
  run_restricted "$OMARCHY_NOTIFY_BIN" --app-name omarsync "$headline" ${body:+"$body"} || true
}

config_file() {
  printf '%s\n' "$HOME/.config/omarsync/config"
}

state_dir() {
  printf '%s\n' "$HOME/.local/state/omarsync"
}

mirror_dir() {
  printf '%s\n' "$(state_dir)/repo"
}

backup_dir() {
  printf '%s\n' "$(state_dir)/backup"
}

config_get() {
  local key="$1"
  local file
  file=$(config_file)
  [[ -f $file ]] || return 1
  local line
  line=$(grep -E "^${key}=" "$file" | tail -n 1 || true)
  [[ -n $line ]] || return 1
  printf '%s\n' "${line#*=}"
}

valid_repo_name() {
  [[ ${1:-} =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]
}

origin_url() {
  if [[ -n ${OMARSYNC_ORIGIN:-} ]]; then
    printf '%s\n' "$OMARSYNC_ORIGIN"
    return 0
  fi
  local repo="$1"
  printf 'https://github.com/%s.git\n' "$repo"
}

TRUSTED_PATH="/usr/bin:/bin:/usr/sbin:/usr/share/omarchy/bin"
GIT_BIN=""
RSYNC_BIN=""
JQ_BIN=""
GH_BIN=""
SSH_KEYGEN_BIN=""
PACMAN_BIN=""
OMARCHY_BIN=""
OMARCHY_SHELL_BIN=""
OMARCHY_NOTIFY_BIN=""
HYPRCTL_BIN=""
DATE_BIN=""
HOSTNAME_BIN=""

resolve_tool() {
  local name="$1"
  local dir candidate real prefix ok
  [[ $name =~ ^[A-Za-z0-9._+-]+$ ]] || return 1
  local -a dirs=(/usr/bin /bin /usr/sbin /usr/share/omarchy/bin)
  for dir in "${dirs[@]}"; do
    candidate="${dir}/${name}"
    [[ -x $candidate && ! -d $candidate ]] || continue
    real=$(/usr/bin/realpath -e "$candidate" 2>/dev/null) || continue
    ok=0
    for prefix in "${dirs[@]}"; do
      if [[ $real == "$prefix" || $real == "$prefix"/* ]]; then
        ok=1
        break
      fi
    done
    (( ok )) || continue
    [[ ! -w $real ]] || continue
    printf '%s\n' "$real"
    return 0
  done
  return 1
}

run_restricted() {
  local exe="$1"
  shift
  [[ $exe == /* && -x $exe && ! -w $exe ]] || die "refusing to run an untrusted program: ${exe}"
  /usr/bin/env -i \
    "HOME=${HOME}" \
    "USER=${USER}" \
    "LOGNAME=${LOGNAME:-$USER}" \
    "PATH=${TRUSTED_PATH}" \
    "LANG=C.UTF-8" \
    "LC_ALL=C.UTF-8" \
    "OMARCHY_PATH=/usr/share/omarchy" \
    "GIT_TERMINAL_PROMPT=0" \
    "GIT_EDITOR=/usr/bin/true" \
    "GH_PROMPT_DISABLED=1" \
    ${XDG_RUNTIME_DIR:+"XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR}"} \
    "$exe" "$@"
}

git() {
  run_restricted "$GIT_BIN" -c core.hooksPath=/dev/null -c gpg.ssh.program="$SSH_KEYGEN_BIN" "$@"
}

rsync() {
  run_restricted "$RSYNC_BIN" "$@"
}

jq() {
  run_restricted "$JQ_BIN" "$@"
}

gh() {
  [[ -n $GH_BIN ]] || die "GitHub CLI is not installed in a trusted directory"
  run_restricted "$GH_BIN" "$@"
}

pacman() {
  [[ -n $PACMAN_BIN ]] || die "pacman is not installed in a trusted directory"
  run_restricted "$PACMAN_BIN" "$@"
}

omarchy() {
  [[ -n $OMARCHY_BIN ]] || die "omarchy is not installed in a trusted directory"
  run_restricted "$OMARCHY_BIN" "$@"
}

omarchy-shell() {
  [[ -n $OMARCHY_SHELL_BIN ]] || die "omarchy-shell is not installed in a trusted directory"
  run_restricted "$OMARCHY_SHELL_BIN" "$@"
}

require_tools() {
  local missing=()
  GIT_BIN=$(resolve_tool git) || missing+=(git)
  RSYNC_BIN=$(resolve_tool rsync) || missing+=(rsync)
  JQ_BIN=$(resolve_tool jq) || missing+=(jq)
  SSH_KEYGEN_BIN=$(resolve_tool ssh-keygen) || missing+=(ssh-keygen)
  DATE_BIN=$(resolve_tool date) || missing+=(date)
  HOSTNAME_BIN=$(resolve_tool hostname) || HOSTNAME_BIN=""
  GH_BIN=$(resolve_tool gh || true)
  PACMAN_BIN=$(resolve_tool pacman || true)
  OMARCHY_BIN=$(resolve_tool omarchy || true)
  OMARCHY_SHELL_BIN=$(resolve_tool omarchy-shell || true)
  OMARCHY_NOTIFY_BIN=$(resolve_tool omarchy-notification-send || true)
  HYPRCTL_BIN=$(resolve_tool hyprctl || true)
  (( ${#missing[@]} == 0 )) || die "missing trusted tools: ${missing[*]}"
}

gh_installed() {
  [[ -n ${GH_BIN:-} && -x $GH_BIN ]]
}

gh_logged_in() {
  gh_installed || return 1
  gh auth status >/dev/null 2>&1
}

github_user() {
  gh_logged_in || return 1
  gh api user --jq '.login' 2>/dev/null
}

configured_repo() {
  config_get REPO 2>/dev/null || true
}

configured_branch() {
  local branch
  branch=$(config_get BRANCH 2>/dev/null || true)
  printf '%s\n' "${branch:-main}"
}

mirror_ready() {
  [[ -d "$(mirror_dir)/.git" ]]
}

# Hold the operation lock for the rest of this process.
lock() {
  mkdir -p "$(state_dir)"
  exec 9>"$(state_dir)/omarsync.lock"
  if ! flock -n 9; then
    die "another omarsync operation is running"
  fi
}

# True when another process holds the lock. Does not keep the lock.
is_running() {
  mkdir -p "$(state_dir)"
  exec 8>"$(state_dir)/omarsync.lock"
  if flock -n 8; then
    flock -u 8
    return 1
  fi
  return 0
}

json_bool() {
  if [[ ${1:-0} == 1 ]]; then
    printf 'true'
  else
    printf 'false'
  fi
}

assert_safe_rel() {
  local rel="$1"
  local banned base
  local -a banned_paths=(
    .ssh
    .config/gh
    .config/git
    .config/omarsync
    .gnupg
    .aws
    .kube
    .docker
    .netrc
    .npmrc
    .config/npm
    .password-store
    .local/share/keyrings
    .local/state/omarsync
  )
  [[ -n $rel && $rel != "." && $rel != ".." ]] || die "invalid scope path: '${rel}'"
  [[ $rel != /* ]] || die "scope path must be relative to \$HOME: '${rel}'"
  [[ $rel != *..* ]] || die "scope path may not contain '..': '${rel}'"
  [[ $rel != *$'\n'* ]] || die "scope path may not contain a newline"
  [[ $rel != *'*'* && $rel != *'?'* ]] || die "scope path may not contain globs: '${rel}'"
  for banned in "${banned_paths[@]}"; do
    if [[ $rel == "$banned" || $rel == "$banned"/* || $banned == "$rel"/* ]]; then
      die "scope path '${rel}' includes secret location ${banned}"
    fi
  done
  base=$(basename "$rel")
  case "$base" in
    id_rsa|id_ecdsa|id_ed25519|id_rsa.pub|id_ecdsa.pub|id_ed25519.pub|credentials|credentials.json|*.pem|*.key)
      die "scope path '${rel}' names a credential file"
      ;;
  esac
}

local_scope_file() {
  printf '%s\n' "$HOME/.config/omarsync/scope"
}

ensure_local_scope() {
  local file
  file=$(local_scope_file)
  [[ -f $file ]] && return 0
  mkdir -p "$(dirname "$file")"
  cp "$ROOT/omarsync.scope.example" "$file"
  chmod 644 "$file"
}

# Collection and apply read only this local file. A scope file inside the
# sync mirror is untrusted remote policy and is never consulted.
scope_file_for() {
  ensure_local_scope
  local_scope_file
}

discard_remote_scope() {
  local mirror="$1"
  [[ -d $mirror ]] || return 0
  if [[ -e $mirror/omarsync.scope || -L $mirror/omarsync.scope ]]; then
    rm -f "$mirror/omarsync.scope"
  fi
  if [[ -d $mirror/.git ]] && git -C "$mirror" ls-files --error-unmatch -- omarsync.scope >/dev/null 2>&1; then
    git -C "$mirror" rm -q --ignore-unmatch -- omarsync.scope >/dev/null
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

# Load scope entries in this process. read_scope runs in a command substitution,
# so a rejected path aborts the caller instead of only the reader.
load_scope() {
  local file="$1"
  local entries=""
  if ! entries=$(read_scope "$file"); then
    exit 1
  fi
  printf '%s\n' "$entries"
}

# Print "rel<TAB>exclude,exclude" for each scope entry.
read_scope() {
  local file="$1"
  [[ -f $file ]] || return 0
  local line rel excludes
  while IFS= read -r line || [[ -n $line ]]; do
    line=$(trim "$line")
    [[ -z $line || $line == \#* ]] && continue
    if [[ $line == *"|"* ]]; then
      rel=$(trim "${line%%|*}")
      excludes=$(trim "${line#*|}")
    else
      rel=$(trim "$line")
      excludes=""
    fi
    assert_safe_rel "$rel"
    printf '%s\t%s\n' "$rel" "$excludes"
  done <"$file"
}

exclude_args() {
  local csv="$1"
  local part
  printf '%s\0' "--exclude" ".git/"
  printf '%s\0' "--exclude" "node_modules/"
  [[ -n $csv ]] || return 0
  local IFS=','
  for part in $csv; do
    part=$(trim "$part")
    [[ -n $part ]] || continue
    printf '%s\0' "--exclude" "$part"
  done
}

config_set() {
  local key="$1"
  local value="$2"
  local file tmp
  file=$(config_file)
  mkdir -p "$(dirname "$file")"
  tmp=$(/usr/bin/mktemp)
  if [[ -f $file ]]; then
    grep -vE "^${key}=" "$file" >"$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$value" >>"$tmp"
  mv "$tmp" "$file"
}

ensure_identity() {
  local mirror="$1"
  local name="" email="" login="" id=""
  email=$(config_get SIGNING_EMAIL 2>/dev/null || true)
  name=$(config_get SIGNING_NAME 2>/dev/null || true)
  if [[ -z $email ]]; then
    if gh_logged_in; then
      name=${name:-$(gh api user --jq '.name // .login' 2>/dev/null || true)}
      login=$(gh api user --jq '.login' 2>/dev/null || true)
      id=$(gh api user --jq '.id' 2>/dev/null || true)
      if [[ -n $id && -n $login ]]; then
        email="${id}+${login}@users.noreply.github.com"
      fi
    fi
    email=${email:-omarsync@localhost}
  fi
  git -C "$mirror" config user.name "${name:-Omarsync}"
  git -C "$mirror" config user.email "$email"

  local signing_key=""
  signing_key=$(config_get SIGNING_KEY 2>/dev/null || true)
  if [[ -n $signing_key && -f $signing_key ]]; then
    git -C "$mirror" config gpg.format ssh
    git -C "$mirror" config user.signingkey "$signing_key"
    git -C "$mirror" config commit.gpgsign true
  fi
}

write_config() {
  local repo="$1"
  local branch="$2"
  config_set REPO "$repo"
  config_set BRANCH "$branch"
}

hostname_safe() {
  local name
  if [[ -n ${HOSTNAME_BIN:-} ]]; then
    name=$("$HOSTNAME_BIN" 2>/dev/null || printf 'unknown')
  else
    name="unknown"
  fi
  name=${name//[^A-Za-z0-9._-]/}
  printf '%s\n' "${name:-unknown}"
}
