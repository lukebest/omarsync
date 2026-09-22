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
  command -v omarchy-notification-send >/dev/null 2>&1 || return 0
  omarchy-notification-send --app-name omarsync "$headline" ${body:+"$body"} || true
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

require_tools() {
  local missing=()
  local tool
  for tool in git rsync jq; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  (( ${#missing[@]} == 0 )) || die "missing required tools: ${missing[*]}"
}

gh_installed() {
  command -v gh >/dev/null 2>&1
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
  local mirror_rel=".local/state/omarsync"
  [[ -n $rel && $rel != "." && $rel != ".." ]] || die "invalid scope path: '${rel}'"
  [[ $rel != /* ]] || die "scope path must be relative to \$HOME: '${rel}'"
  [[ $rel != *..* ]] || die "scope path may not contain '..': '${rel}'"
  [[ $rel != *$'\n'* ]] || die "scope path may not contain a newline"
  if [[ $rel == "$mirror_rel" || $rel == "$mirror_rel"/* || $mirror_rel == "$rel"/* ]]; then
    die "scope path '${rel}' overlaps the omarsync state directory"
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
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

scope_file_for() {
  local mirror="$1"
  if [[ -f $mirror/omarsync.scope ]]; then
    printf '%s\n' "$mirror/omarsync.scope"
  else
    printf '%s\n' "$ROOT/omarsync.scope.example"
  fi
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

ensure_identity() {
  local mirror="$1"
  git -C "$mirror" config user.name >/dev/null 2>&1 \
    && git -C "$mirror" config user.email >/dev/null 2>&1 \
    && return 0

  local name="" email="" login="" id=""
  if gh_logged_in; then
    name=$(gh api user --jq '.name // .login' 2>/dev/null || true)
    login=$(gh api user --jq '.login' 2>/dev/null || true)
    id=$(gh api user --jq '.id' 2>/dev/null || true)
    if [[ -n $id && -n $login ]]; then
      email="${id}+${login}@users.noreply.github.com"
    fi
  fi
  git -C "$mirror" config user.name "${name:-Omarsync}"
  git -C "$mirror" config user.email "${email:-omarsync@localhost}"
}

write_config() {
  local repo="$1"
  local branch="$2"
  local file
  file=$(config_file)
  mkdir -p "$(dirname "$file")"
  cat >"$file" <<EOF
REPO=${repo}
BRANCH=${branch}
EOF
}

hostname_safe() {
  local name
  name=$(hostname 2>/dev/null || printf 'unknown')
  name=${name//[^A-Za-z0-9._-]/}
  printf '%s\n' "${name:-unknown}"
}
