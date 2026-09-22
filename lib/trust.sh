#!/usr/bin/env bash
# Pin a sync snapshot to one signed commit. The trust policy is local and is
# never read from the sync repository.

trusted_keys_file() {
  printf '%s\n' "$HOME/.config/omarsync/trusted-keys"
}

is_full_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]]
}

refuse_inside_mirror() {
  local path="$1"
  local mirror
  mirror=$(mirror_dir)
  [[ -d $mirror ]] || return 0
  local real_path real_mirror
  real_path=$(realpath "$path")
  real_mirror=$(realpath "$mirror")
  [[ $real_path != "$real_mirror" && $real_path != "$real_mirror"/* ]] \
    || die "refusing a trust file inside the sync mirror: ${path}"
}

# Fetch the branch once and return its full commit id. Does not check out.
resolve_remote_sha() {
  local mirror="$1"
  local branch="$2"
  git -C "$mirror" fetch --quiet origin "$branch"
  local sha
  sha=$(git -C "$mirror" rev-parse --verify "refs/remotes/origin/${branch}^{commit}")
  is_full_sha "$sha" || die "origin/${branch} did not resolve to a full commit: ${sha:-<empty>}"
  printf '%s\n' "$sha"
}

# Check out exactly one resolved commit. The worktree is detached, so a later
# branch move cannot change the files this operation reads.
checkout_pinned_commit() {
  local mirror="$1"
  local sha="$2"
  is_full_sha "$sha" || die "refusing to check out a non-commit: ${sha}"
  git -C "$mirror" checkout --quiet --force --detach "$sha"
  local head
  head=$(git -C "$mirror" rev-parse --verify HEAD)
  [[ $head == "$sha" ]] || die "mirror HEAD ${head} is not the pinned commit ${sha}"
  if git -C "$mirror" symbolic-ref -q HEAD >/dev/null; then
    die "mirror is still attached to a branch after pinning ${sha}"
  fi
}

commit_is_trusted() {
  local mirror="$1"
  local sha="$2"
  local keys
  keys=$(trusted_keys_file)
  [[ -f $keys ]] || return 1
  grep -q '[^[:space:]]' "$keys" || return 1
  refuse_inside_mirror "$keys"
  git -C "$mirror" -c gpg.ssh.allowedSignersFile="$keys" verify-commit "$sha" >/dev/null 2>&1
}

require_trusted_commit() {
  local mirror="$1"
  local sha="$2"
  is_full_sha "$sha" || die "refusing an unpinned revision: ${sha:-<empty>}"
  if ! commit_is_trusted "$mirror" "$sha"; then
    die "commit ${sha} is not signed by a key in $(trusted_keys_file). Refusing to apply it."
  fi
}

prepare_push_branch() {
  local mirror="$1"
  local branch="$2"
  git -C "$mirror" checkout -q -B "$branch"
}

cmd_trust_key() {
  local pub="${1:-}"
  local priv="${2:-}"
  [[ -n $pub && -f $pub ]] || die "usage: omarsync trust-key <ssh-public-key> [private-key]"
  refuse_inside_mirror "$pub"
  if [[ -n $priv ]]; then
    [[ -f $priv ]] || die "private key not found: ${priv}"
    refuse_inside_mirror "$priv"
  fi

  local type keydata
  read -r type keydata _ <"$pub"
  [[ $type == ssh-* ]] || die "not an ssh public key: ${pub}"
  [[ $keydata =~ ^[A-Za-z0-9+/=]+$ ]] || die "malformed ssh public key"

  local email
  email=$(config_get SIGNING_EMAIL 2>/dev/null || true)
  if [[ -z $email ]]; then
    email="omarsync@localhost"
    config_set SIGNING_EMAIL "$email"
  fi

  local keys entry
  keys=$(trusted_keys_file)
  mkdir -p "$(dirname "$keys")"
  [[ -f $keys ]] || : >"$keys"
  chmod 644 "$keys"
  entry="${email} namespaces=\"git\" ${type} ${keydata}"
  if ! grep -qxF "$entry" "$keys"; then
    printf '%s\n' "$entry" >>"$keys"
  fi
  if [[ -n $priv ]]; then
    config_set SIGNING_KEY "$priv"
  fi
  log "trusted ${type} key for ${email}"
}
