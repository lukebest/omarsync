#!/usr/bin/env bash
# Back up the local trees a sync would overwrite, then copy the mirror back.

prune_backups() {
  local root
  root=$(backup_dir)
  [[ -d $root ]] || return 0
  local -a stamps=()
  local name
  while IFS= read -r name; do
    [[ -n $name ]] || continue
    stamps+=("$name")
  done < <(ls -1 "$root" | sort)
  local extra=$(( ${#stamps[@]} - BACKUP_KEEP ))
  local i
  for (( i = 0; i < extra; i++ )); do
    rm -rf "$root/${stamps[$i]}"
  done
}

backup_tree() {
  local mirror="$1"
  local stamp dest scope_file rel excludes src
  stamp=$(date +%Y%m%d-%H%M%S)
  dest="$(backup_dir)/$stamp"
  scope_file=$(scope_file_for "$mirror")
  while IFS=$'\t' read -r rel excludes; do
    [[ -n $rel ]] || continue
    src="$HOME/$rel"
    if [[ -e $src || -L $src ]]; then
      mkdir -p "$(dirname "$dest/home/$rel")"
      rsync -a "$src" "$(dirname "$dest/home/$rel")/"
    fi
  done < <(read_scope "$scope_file")

  local state="$HOME/.local/state/omarchy/current"
  if [[ -d $state ]]; then
    mkdir -p "$dest/current"
    [[ -f $state/theme.name ]] && cp -f "$state/theme.name" "$dest/current/theme.name"
    if [[ -L $state/background || -e $state/background ]]; then
      readlink -f "$state/background" >"$dest/current/background.path" || true
    fi
  fi
  printf '%s\n' "$dest"
}

restore_scope() {
  local mirror="$1"
  local scope_file rel excludes src dst
  scope_file=$(scope_file_for "$mirror")
  while IFS=$'\t' read -r rel excludes; do
    [[ -n $rel ]] || continue
    src="$mirror/home/$rel"
    dst="$HOME/$rel"
    if [[ ! -e $src && ! -L $src ]]; then
      warn "mirror has no ${rel}; left the local copy alone"
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    local -a trust_exclude=()
    if [[ $rel == .config || $rel == .config/* ]]; then
      trust_exclude=(--exclude "omarsync/")
    fi
    if [[ -d $src && ! -L $src ]]; then
      mkdir -p "$dst"
      rsync -a --delete "${trust_exclude[@]}" "$src/" "$dst/"
    else
      rsync -a "${trust_exclude[@]}" "$src" "$dst"
    fi
    log "restored ${rel}"
  done < <(read_scope "$scope_file")
}

apply_current() {
  local mirror="$1"
  local theme="" background="" target=""
  [[ -f $mirror/current/theme.name ]] && theme=$(tr -d '[:space:]' <"$mirror/current/theme.name")
  [[ -f $mirror/current/background ]] && background=$(tr -d '[:space:]' <"$mirror/current/background")

  local state="$HOME/.local/state/omarchy/current"
  if [[ ${OMARSYNC_SKIP_LIVE:-0} == 1 ]]; then
    mkdir -p "$state"
    if [[ -n $theme ]]; then
      printf '%s\n' "$theme" >"$state/theme.name"
    fi
    if [[ $background == rel:* ]]; then
      target="$HOME/.config/omarchy/backgrounds/${background#rel:}"
    elif [[ $background == abs:* ]]; then
      target="${background#abs:}"
    fi
    if [[ -n $target && -e $target ]]; then
      ln -sfn "$target" "$state/background"
    fi
    return 0
  fi

  local failed=0
  if [[ -n $theme ]]; then
    log "setting theme ${theme}"
    if ! omarchy theme set "$theme"; then
      warn "could not set theme ${theme}"
      failed=1
    fi
  fi
  if [[ $background == rel:* ]]; then
    target="$HOME/.config/omarchy/backgrounds/${background#rel:}"
  elif [[ $background == abs:* ]]; then
    target="${background#abs:}"
  fi
  if [[ -n $target ]]; then
    if [[ -e $target ]]; then
      log "setting background ${target}"
      if ! omarchy theme bg set "$target"; then
        warn "could not set background"
        failed=1
      fi
    else
      warn "background file is missing: ${target}"
      failed=1
    fi
  fi
  return "$failed"
}

reload_desktop() {
  if [[ ${OMARSYNC_SKIP_LIVE:-0} == 1 ]]; then
    return 0
  fi
  if command -v omarchy-shell >/dev/null 2>&1; then
    omarchy-shell shell reloadConfig || warn "shell reload failed"
  fi
  if command -v hyprctl >/dev/null 2>&1; then
    hyprctl reload || warn "hyprctl reload failed"
  elif command -v omarchy-refresh-hyprland >/dev/null 2>&1; then
    omarchy-refresh-hyprland || warn "hyprland refresh failed"
  fi
}

assert_pinned() {
  local mirror="$1"
  local sha="$2"
  is_full_sha "$sha" || die "refusing to activate an unpinned revision"
  local head
  head=$(git -C "$mirror" rev-parse --verify HEAD)
  [[ $head == "$sha" ]] || die "mirror HEAD ${head} is not the reviewed commit ${sha}"
  if git -C "$mirror" symbolic-ref -q HEAD >/dev/null; then
    die "refusing to apply while the mirror is on a branch"
  fi
}

apply_mirror() {
  local mirror="$1"
  local with_packages="$2"
  local sha="$3"
  assert_pinned "$mirror" "$sha"
  log "activating signed commit ${sha}"
  local backup
  backup=$(backup_tree "$mirror")
  log "backed up existing files to ${backup}"
  restore_scope "$mirror"
  report_plugins "$mirror"
  local failed=0
  apply_current "$mirror" || failed=1
  reload_desktop
  if (( with_packages )); then
    install_missing_packages "$mirror" || failed=1
  else
    log "skipped official package install"
  fi
  assert_pinned "$mirror" "$sha"
  prune_backups
  return "$failed"
}
