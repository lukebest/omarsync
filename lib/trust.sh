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
  real_path=$(/usr/bin/realpath "$path")
  real_mirror=$(/usr/bin/realpath "$mirror")
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

trusted_keys_present() {
  local keys
  keys=$(trusted_keys_file)
  [[ -f $keys ]] || return 1
  grep -q '[^[:space:]]' "$keys"
}

read_u32_at() {
  local file="$1"
  local offset="$2"
  local b0="" b1="" b2="" b3=""
  read -r b0 b1 b2 b3 < <(/usr/bin/od -An -t u1 -N 4 -j "$offset" "$file")
  [[ -n $b0 && -n $b1 && -n $b2 && -n $b3 ]] || return 1
  printf '%s\n' $(( (10#$b0 << 24) | (10#$b1 << 16) | (10#$b2 << 8) | 10#$b3 ))
}

# Print "type keydata" for the SSH key embedded in this commit's signature.
# The line is text. Callers still have to check that git accepts it.
signature_pubkey_line() {
  local mirror="$1"
  local sha="$2"
  local work armor_body
  work=$(/usr/bin/mktemp -d)
  if ! git -C "$mirror" cat-file commit "$sha" >"$work/commit" 2>/dev/null; then
    rm -rf "$work"
    return 1
  fi
  awk '
    /^gpgsig -----BEGIN SSH SIGNATURE-----/ { on = 1; sub(/^gpgsig /, ""); print; next }
    on && /^ / { sub(/^ /, ""); print; if ($0 ~ /-----END SSH SIGNATURE-----/) exit }
  ' "$work/commit" >"$work/armor"
  armor_body=$(sed -n '/-----BEGIN SSH SIGNATURE-----/,/-----END SSH SIGNATURE-----/p' "$work/armor" | sed '1d;$d' | tr -d '[:space:]')
  if [[ -z $armor_body ]] || ! printf '%s' "$armor_body" | /usr/bin/base64 -d >"$work/sig" 2>/dev/null; then
    rm -rf "$work"
    return 1
  fi
  local magic ver key_len type_len type b64
  magic=$(/usr/bin/dd if="$work/sig" bs=1 count=6 status=none 2>/dev/null || true)
  ver=$(read_u32_at "$work/sig" 6 2>/dev/null || true)
  key_len=$(read_u32_at "$work/sig" 10 2>/dev/null || true)
  if [[ $magic != SSHSIG || $ver != 1 || -z $key_len || $key_len -lt 16 || $key_len -gt 4096 ]]; then
    rm -rf "$work"
    return 1
  fi
  if ! /usr/bin/dd if="$work/sig" bs=1 skip=14 count="$key_len" status=none of="$work/key" 2>/dev/null; then
    rm -rf "$work"
    return 1
  fi
  type_len=$(read_u32_at "$work/key" 0 2>/dev/null || true)
  if [[ -z $type_len || $type_len -lt 4 || $type_len -gt 64 ]]; then
    rm -rf "$work"
    return 1
  fi
  type=$(/usr/bin/dd if="$work/key" bs=1 skip=4 count="$type_len" status=none 2>/dev/null || true)
  b64=$(/usr/bin/base64 -w 0 "$work/key" 2>/dev/null || true)
  rm -rf "$work"
  [[ $type =~ ^ssh-[a-z0-9-]+$ ]] || return 1
  [[ $b64 =~ ^[A-Za-z0-9+/=]+$ ]] || return 1
  printf '%s %s\n' "$type" "$b64"
}

fingerprint_of_pubkey_line() {
  local pub="$1"
  local tmp fp
  tmp=$(/usr/bin/mktemp)
  printf '%s\n' "$pub" >"$tmp"
  fp=$(run_restricted "$SSH_KEYGEN_BIN" -lf "$tmp" 2>/dev/null | /usr/bin/awk '{print $2}')
  rm -f "$tmp"
  [[ $fp =~ ^SHA256:[A-Za-z0-9+/]+=*$ ]] || return 1
  printf '%s\n' "$fp"
}

pubkey_verifies_commit() {
  local mirror="$1"
  local sha="$2"
  local pub="$3"
  local tmp
  tmp=$(/usr/bin/mktemp)
  printf '%s\n' "* namespaces=\"git\" ${pub}" >"$tmp"
  local rc=0
  git -C "$mirror" -c gpg.ssh.allowedSignersFile="$tmp" verify-commit "$sha" >/dev/null 2>&1 || rc=$?
  rm -f "$tmp"
  return "$rc"
}

remember_signer() {
  local pub="$1"
  local keys entry
  keys=$(trusted_keys_file)
  refuse_inside_mirror "$keys"
  mkdir -p "$(dirname "$keys")"
  [[ -f $keys ]] || : >"$keys"
  chmod 644 "$keys"
  entry="* namespaces=\"git\" ${pub}"
  if ! grep -qxF "$entry" "$keys"; then
    printf '%s\n' "$entry" >>"$keys"
  fi
}

# A machine with no trusted key can pin the signer of this one commit.
# A later commit signed by any other key is still refused.
trust_signer_of_commit() {
  local mirror="$1"
  local sha="$2"
  local allow_prompt="$3"
  local pub="" fp=""
  if pub=$(signature_pubkey_line "$mirror" "$sha"); then
    fp=$(fingerprint_of_pubkey_line "$pub" || true)
  fi
  if trusted_keys_present; then
    if [[ -n $fp ]]; then
      die "commit ${sha} is signed by ${fp}, which is not in $(trusted_keys_file). Refusing to apply it."
    fi
    die "commit ${sha} is not signed by a key in $(trusted_keys_file). Refusing to apply it."
  fi
  if [[ -z $pub || -z $fp ]] || ! pubkey_verifies_commit "$mirror" "$sha" "$pub"; then
    die "commit ${sha} is not signed. Refusing to apply it."
  fi
  if (( allow_prompt == 1 )); then
    :
  elif [[ -t 0 ]]; then
    log "this PC has not trusted a signing key yet"
    log "commit ${sha} is signed by ${fp}"
    printf 'Trust this key and apply? [y/N] ' >&2
    local answer=""
    if ! IFS= read -r answer; then
      die "left the signing key untrusted"
    fi
    [[ $answer == y || $answer == Y ]] || die "left the signing key untrusted"
  else
    die "commit ${sha} is signed by ${fp}, and this PC has not trusted a signing key. Run apply in a terminal and confirm, or pass --trust-signer."
  fi
  remember_signer "$pub"
  log "trusted signer ${fp}"
}

require_trusted_commit() {
  local mirror="$1"
  local sha="$2"
  is_full_sha "$sha" || die "refusing an unpinned revision: ${sha:-<empty>}"
  if ! commit_is_trusted "$mirror" "$sha"; then
    die "commit ${sha} is not signed by a key in $(trusted_keys_file). Refusing to apply it."
  fi
}

# trusted, untrusted, or none. Prints the fingerprint as a second line when known.
commit_signature_state() {
  local mirror="$1"
  local sha="$2"
  local pub="" fp="" state="none"
  if commit_is_trusted "$mirror" "$sha"; then
    state="trusted"
  fi
  if pub=$(signature_pubkey_line "$mirror" "$sha"); then
    fp=$(fingerprint_of_pubkey_line "$pub" || true)
  fi
  if [[ $state == none && -n $pub && -n $fp ]] && pubkey_verifies_commit "$mirror" "$sha" "$pub"; then
    state="untrusted"
  fi
  printf '%s\n%s\n' "$state" "$fp"
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
