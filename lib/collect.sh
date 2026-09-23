#!/usr/bin/env bash
# Copy the scoped home directories and machine metadata into a mirror tree.

export_current() {
  local dest="$1"
  local state="$HOME/.local/state/omarchy/current"
  mkdir -p "$dest/current"
  if [[ -f $state/theme.name ]]; then
    cp -f "$state/theme.name" "$dest/current/theme.name"
  else
    : >"$dest/current/theme.name"
  fi

  local target="" base record=""
  base="$HOME/.config/omarchy/backgrounds"
  if [[ -L $state/background || -e $state/background ]]; then
    target=$(readlink -f "$state/background" 2>/dev/null || true)
  fi
  if [[ -n $target && $target == "$base/"* ]]; then
    record="rel:${target#"$base/"}"
  elif [[ -n $target ]]; then
    record="abs:${target}"
  fi
  printf '%s\n' "$record" >"$dest/current/background"
}

write_meta() {
  local dest="$1"
  local version="unknown"
  if [[ -f ${OMARCHY_PATH:-/usr/share/omarchy}/version ]]; then
    version=$(tr -d '[:space:]' <"${OMARCHY_PATH:-/usr/share/omarchy}/version")
  fi
  jq -n \
    --arg host "$(hostname_safe)" \
    --arg omarchyVersion "$version" \
    --arg pushedAt "$("$DATE_BIN" -Iseconds)" \
    '{schemaVersion: 1, host: $host, omarchyVersion: $omarchyVersion, pushedAt: $pushedAt}' \
    >"$dest/omarsync.json"
}

# rsync one scope entry. Returns 0 when the destination changed (or would).
# mode is "apply" or "check".
sync_one() {
  local mode="$1"
  local rel="$2"
  local excludes="$3"
  local src_root="$4"
  local dst_root="$5"
  local src="$src_root/$rel"
  local dst="$dst_root/$rel"
  local -a args=()
  local part
  while IFS= read -r -d '' part; do
    args+=("$part")
  done < <(exclude_args "$excludes")
  # The trust policy lives under ~/.config/omarsync and must not be replaced
  # by a synced parent such as .config.
  if [[ $rel == .config || $rel == .config/* ]]; then
    args+=(--exclude "omarsync/")
  fi

  local -a dry=()
  if [[ $mode == check ]]; then
    dry=(-n --itemize-changes)
  fi

  if [[ ! -e $src && ! -L $src ]]; then
    if [[ -e $dst || -L $dst ]]; then
      if [[ $mode == check ]]; then
        printf 'deleting %s\n' "$rel"
      else
        rm -rf "$dst"
      fi
    fi
    return 0
  fi

  mkdir -p "$(dirname "$dst")"
  local out=""
  if [[ -d $src && ! -L $src ]]; then
    if [[ $mode != check ]]; then
      mkdir -p "$dst"
    fi
    if [[ $mode == check ]]; then
      out=$(rsync -a --delete --max-size="$MAX_FILE_SIZE" "${dry[@]}" "${args[@]}" "$src/" "$dst/" 2>/dev/null || true)
      printf '%s\n' "$out" | grep -E '^(<|>|c|\*deleting|deleting)' || true
    else
      rsync -a --delete --max-size="$MAX_FILE_SIZE" "${args[@]}" "$src/" "$dst/"
    fi
  else
    if [[ $mode == check ]]; then
      out=$(rsync -a --max-size="$MAX_FILE_SIZE" "${dry[@]}" "${args[@]}" "$src" "$dst" 2>/dev/null || true)
      printf '%s\n' "$out" | grep -E '^(<|>|c|\*deleting|deleting)' || true
    else
      rsync -a --max-size="$MAX_FILE_SIZE" "${args[@]}" "$src" "$dst"
    fi
  fi
}

sync_scope() {
  local mode="$1"
  local scope_file="$2"
  local src_root="$3"
  local dst_root="$4"
  local rel excludes entries
  entries=$(load_scope "$scope_file")
  while IFS=$'\t' read -r rel excludes; do
    [[ -n $rel ]] || continue
    sync_one "$mode" "$rel" "$excludes" "$src_root" "$dst_root"
  done <<<"$entries"
}

# Drop mirror files that are no longer covered by the scope.
prune_unscoped() {
  local scope_file="$1"
  local dst_root="$2"
  local home="$dst_root/home"
  [[ -d $home ]] || return 0
  local -a rels=()
  local rel excludes path covered parent entries
  entries=$(load_scope "$scope_file")
  while IFS=$'\t' read -r rel excludes; do
    [[ -n $rel ]] || continue
    rels+=("$rel")
  done <<<"$entries"

  while IFS= read -r path; do
    [[ -n $path ]] || continue
    rel=${path#"$home/"}
    covered=0
    for parent in "${rels[@]}"; do
      if [[ $rel == "$parent" || $rel == "$parent"/* || $parent == "$rel"/* ]]; then
        covered=1
        break
      fi
    done
    if (( covered == 0 )); then
      rm -rf "$path"
    fi
  done < <(/usr/bin/find "$home" -mindepth 1 -depth -print)
}

collect_into() {
  local dest="$1"
  local scope_file
  discard_remote_scope "$dest"
  scope_file=$(scope_file_for)
  mkdir -p "$dest/home"
  sync_scope apply "$scope_file" "$HOME" "$dest/home"
  prune_unscoped "$scope_file" "$dest"
  export_current "$dest"
  export_packages "$dest"
  export_plugins "$dest"
}

scope_dirty() {
  local mirror="$1"
  local scope_file out
  scope_file=$(scope_file_for)
  out=$(sync_scope check "$scope_file" "$HOME" "$mirror/home")
  [[ -n ${out//[[:space:]]/} ]]
}

files_differ() {
  local left="$1"
  local right="$2"
  if [[ -d $left || -d $right ]]; then
    ! diff -rq "$left" "$right" >/dev/null 2>&1
    return
  fi
  if [[ ! -f $left && ! -f $right ]]; then
    return 1
  fi
  ! cmp -s "$left" "$right"
}

mirror_dirty() {
  local mirror="$1"
  local tmp plugins_known=1
  tmp=$(/usr/bin/mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN
  mkdir -p "$tmp"
  export_current "$tmp"
  export_packages "$tmp"
  if ! export_plugins "$tmp" check; then
    plugins_known=0
  fi
  if scope_dirty "$mirror"; then
    return 0
  fi
  files_differ "$mirror/current" "$tmp/current" && return 0
  files_differ "$mirror/packages" "$tmp/packages" && return 0
  if (( plugins_known )); then
    files_differ "$mirror/plugins.json" "$tmp/plugins.json" && return 0
    if [[ -d $mirror/plugins-local || -d $tmp/plugins-local ]]; then
      files_differ "$mirror/plugins-local" "$tmp/plugins-local" && return 0
    fi
  fi
  if git -C "$mirror" status --porcelain | grep -q .; then
    return 0
  fi
  return 1
}
