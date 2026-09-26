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
  local stamp dest scope_file rel excludes src entries
  stamp=$("$DATE_BIN" +%Y%m%d-%H%M%S)
  dest="$(backup_dir)/$stamp"
  scope_file=$(scope_file_for)
  entries=$(load_scope "$scope_file")
  while IFS=$'\t' read -r rel excludes; do
    [[ -n $rel ]] || continue
    src="$HOME/$rel"
    if [[ -e $src || -L $src ]]; then
      mkdir -p "$(dirname "$dest/home/$rel")"
      rsync -a "$src" "$(dirname "$dest/home/$rel")/"
    fi
  done <<<"$entries"

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

# Installed plugins are not part of the snapshot. Restoring .config/omarchy
# with rsync --delete would otherwise remove this checkout of omarsync.
installed_plugins_rel() {
  printf '%s\n' ".config/omarchy/plugins"
}

plugin_restore_excludes() {
  local rel="$1"
  local plugins rest
  plugins=$(installed_plugins_rel)
  if [[ $plugins == "$rel"/* ]]; then
    rest="${plugins#"$rel"/}"
    printf '%s\0' --exclude "${rest}/"
    printf '%s\0' --exclude "${rest}"
  fi
}

restore_scope() {
  local mirror="$1"
  local scope_file rel excludes src dst entries plugins
  scope_file=$(scope_file_for)
  plugins=$(installed_plugins_rel)
  entries=$(load_scope "$scope_file")
  while IFS=$'\t' read -r rel excludes; do
    [[ -n $rel ]] || continue
    if [[ $rel == "$plugins" || $rel == "$plugins"/* ]]; then
      log "left ${rel} alone so installed plugins stay"
      continue
    fi
    src="$mirror/home/$rel"
    dst="$HOME/$rel"
    if [[ ! -e $src && ! -L $src ]]; then
      warn "mirror has no ${rel}; left the local copy alone"
      continue
    fi
    mkdir -p "$(dirname "$dst")"
    local -a trust_exclude=()
    local -a plugin_exclude=()
    local part
    if [[ $rel == .config || $rel == .config/* ]]; then
      trust_exclude=(--exclude "omarsync/")
    fi
    while IFS= read -r -d '' part; do
      plugin_exclude+=("$part")
    done < <(plugin_restore_excludes "$rel")
    if [[ -d $src && ! -L $src ]]; then
      mkdir -p "$dst"
      rsync -a --delete "${trust_exclude[@]}" "${plugin_exclude[@]}" "$src/" "$dst/"
    else
      rsync -a "${trust_exclude[@]}" "${plugin_exclude[@]}" "$src" "$dst"
    fi
    log "restored ${rel}"
  done <<<"$entries"
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

# The sanitized process does not keep HYPRLAND_INSTANCE_SIGNATURE. The live
# session is the single runtime directory Hyprland created for this user.
hypr_instance_signature() {
  local runtime="${XDG_RUNTIME_DIR:-}"
  [[ $runtime == /run/user/[0-9]* && -d $runtime/hypr ]] || return 1
  local -a found=()
  local dir name
  for dir in "$runtime/hypr"/*; do
    [[ -d $dir && -f $dir/hyprland.lock ]] || continue
    name=${dir##*/}
    [[ $name =~ ^[0-9a-f]+_[0-9]+_[0-9]+$ ]] || continue
    found+=("$name")
  done
  (( ${#found[@]} == 1 )) || return 1
  printf '%s\n' "${found[0]}"
}

reload_desktop() {
  if [[ ${OMARSYNC_SKIP_LIVE:-0} == 1 ]]; then
    return 0
  fi
  if [[ -n ${OMARCHY_SHELL_BIN:-} ]]; then
    omarchy-shell shell reloadConfig || warn "shell reload failed"
  fi
  [[ -n ${HYPRCTL_BIN:-} ]] || return 0
  local sig
  if ! sig=$(hypr_instance_signature); then
    warn "hyprctl reload skipped; this user has no single Hyprland session"
    return 0
  fi
  /usr/bin/env -i \
    "HOME=${HOME}" \
    "USER=${USER}" \
    "LOGNAME=${LOGNAME:-$USER}" \
    "PATH=${TRUSTED_PATH}" \
    "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR}" \
    "HYPRLAND_INSTANCE_SIGNATURE=${sig}" \
    "$HYPRCTL_BIN" reload || warn "hyprctl reload failed"
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
  local with_exec="${4:-0}"
  assert_pinned "$mirror" "$sha"
  log "activating commit ${sha}"
  local backup
  backup=$(backup_tree "$mirror")
  log "backed up existing files to ${backup}"
  restore_scope "$mirror"
  local failed=0
  apply_current "$mirror" || failed=1
  reload_desktop
  if (( with_packages )); then
    install_missing_packages "$mirror" || failed=1
  else
    log "skipped official package install"
  fi
  install_missing_plugins "$mirror" "$with_exec" || failed=1
  refresh_user_services || failed=1
  run_hooks "$mirror" "$with_exec" || failed=1
  assert_pinned "$mirror" "$sha"
  prune_backups
  return "$failed"
}

preview_apply() {
  local mirror="$1"
  local sha="$2"
  local with_exec="$3"
  log "commit ${sha}"
  local rel
  if [[ -d $mirror/home ]]; then
    log "files:"
    while IFS= read -r rel; do
      [[ -n $rel ]] || continue
      log "  ${rel#"$mirror/home"/}"
    done < <(/usr/bin/find "$mirror/home" -mindepth 1 -maxdepth 2 -print)
  fi
  if [[ -f $mirror/packages/pacman.txt ]]; then
    log "official packages listed: $(grep -cve '^$' "$mirror/packages/pacman.txt" || true)"
  fi
  if [[ -f $mirror/packages/flatpak.txt ]]; then
    log "flatpaks:"
    while IFS=$'\t' read -r app _; do
      [[ -n $app ]] || continue
      log "  ${app}"
    done <"$mirror/packages/flatpak.txt"
  fi
  if [[ -f $mirror/plugins.json ]]; then
    log "plugins:"
    jq -r '.[] | "  \(.id) \(if .local then "(local snapshot)" else .commit end)"' "$mirror/plugins.json" || true
  fi
  local hook
  for hook in $(list_hooks "$mirror"); do
    log "hook ${hook}"
  done
  if (( with_exec != 1 )); then
    log "plugins and hooks will not run"
  fi
}

# Interactive prompts return 0 for yes. Non-interactive uses the default:
# 0 continues, 1 refuses.
prompt_yes() {
  local prompt="$1"
  local default_rc="$2"
  if [[ ! -t 0 || ! -t 1 ]]; then
    return "$default_rc"
  fi
  printf '%s [y/N] ' "$prompt" >&2
  local answer=""
  if ! IFS= read -r answer; then
    return 1
  fi
  [[ $answer == y || $answer == Y ]]
}
