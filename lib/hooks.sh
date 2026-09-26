#!/usr/bin/env bash
# Post-apply hooks live on the machine that writes them and are copied into
# the snapshot. Apply runs them only for a trusted commit, after one confirmation.

hooks_source_dir() {
  printf '%s\n' "$HOME/.config/omarsync-hooks/post-apply.d"
}

export_hooks() {
  local dest="$1"
  local src
  src=$(hooks_source_dir)
  rm -rf "$dest/hooks"
  [[ -d $src ]] || return 0
  mkdir -p "$dest/hooks/post-apply.d"
  local name
  for name in "$src"/*; do
    [[ -f $name && ! -L $name ]] || continue
    [[ $(basename "$name") =~ ^[A-Za-z0-9._-]+$ ]] || continue
    cp -a "$name" "$dest/hooks/post-apply.d/"
  done
}

list_hooks() {
  local mirror="$1"
  local dir="$mirror/hooks/post-apply.d"
  [[ -d $dir ]] || return 0
  local name
  for name in "$dir"/*; do
    [[ -f $name && ! -L $name ]] || continue
    basename "$name"
  done
}

run_hooks() {
  local mirror="$1"
  local allow_exec="$2"
  if (( allow_exec != 1 )); then
    if [[ -d $mirror/hooks/post-apply.d ]]; then
      warn "skipped post-apply hooks; executable restore needs a trusted signature"
    fi
    return 0
  fi
  local dir="$mirror/hooks/post-apply.d"
  [[ -d $dir ]] || return 0
  local name failed=0
  for name in "$dir"/*; do
    [[ -f $name && ! -L $name ]] || continue
    [[ -x $name ]] || chmod +x "$name" || true
    log "running hook $(basename "$name")"
    if ! /usr/bin/bash "$name"; then
      warn "hook $(basename "$name") failed"
      failed=1
    fi
  done
  return "$failed"
}

refresh_user_services() {
  [[ -n ${SYSTEMCTL_BIN:-} ]] || return 0
  local scope_file rel
  scope_file=$(scope_file_for)
  local wanted=0
  while IFS=$'\t' read -r rel _; do
    if [[ $rel == .config/systemd/user || $rel == .config/systemd/user/* || $rel == .config/systemd ]]; then
      wanted=1
      break
    fi
  done <<<"$(load_scope "$scope_file")"
  (( wanted )) || return 0
  [[ -d $HOME/.config/systemd/user ]] || return 0
  [[ -n ${XDG_RUNTIME_DIR:-} && -S ${XDG_RUNTIME_DIR}/systemd/private ]] || return 0
  systemctl --user daemon-reload || warn "systemctl --user daemon-reload failed"
  local link unit
  for link in "$HOME/.config/systemd/user/"*.target.wants/* "$HOME/.config/systemd/user/"*/*.target.wants/*; do
    [[ -L $link ]] || continue
    unit=$(basename "$link")
    [[ $unit == *.service ]] || continue
    systemctl --user start "$unit" || warn "could not start ${unit}"
  done
}
