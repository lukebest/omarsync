#!/usr/bin/env bash
# Export and restore third-party Omarchy shell plugins.

plugin_dir() {
  printf '%s\n' "$HOME/.config/omarchy/plugins/$1"
}

export_plugins() {
  local dest="$1"
  local mode="${2:-apply}"
  local listing=""
  local row id enabled url dir local_root

  if listing=$(omarchy plugin list --json 2>/dev/null) && jq -e 'type == "array"' <<<"$listing" >/dev/null 2>&1; then
    :
  else
    if [[ $mode == check ]]; then
      return 2
    fi
    if [[ -f $dest/plugins.json ]]; then
      warn "plugin list unavailable; keeping existing plugins.json"
      return 0
    fi
    printf '[]\n' >"$dest/plugins.json"
    warn "plugin list unavailable; wrote an empty plugins.json"
    return 0
  fi

  local_root="$dest/plugins-local"
  rm -rf "$local_root"
  mkdir -p "$local_root"

  local ndjson=""
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    if jq -e '.firstParty == true' <<<"$row" >/dev/null 2>&1; then
      continue
    fi
    id=$(jq -r '.id // ""' <<<"$row")
    [[ -n $id ]] || continue
    enabled=$(jq -r 'if .enabled == true then "true" else "false" end' <<<"$row")
    dir=$(plugin_dir "$id")
    url=""
    if [[ -d $dir/.git ]]; then
      url=$(git -C "$dir" remote get-url origin 2>/dev/null || true)
    fi
    if [[ -n $url ]]; then
      ndjson+=$(jq -nc --arg id "$id" --arg url "$url" --argjson enabled "$enabled" \
        '{id:$id, url:$url, enabled:$enabled, local:false}')
      ndjson+=$'\n'
    elif [[ -d $dir ]]; then
      mkdir -p "$local_root/$id"
      rsync -a --delete --exclude '.git/' --exclude 'node_modules/' "$dir/" "$local_root/$id/"
      ndjson+=$(jq -nc --arg id "$id" --argjson enabled "$enabled" \
        '{id:$id, url:"", enabled:$enabled, local:true}')
      ndjson+=$'\n'
    fi
  done < <(jq -c '.[]' <<<"$listing")

  if [[ -n $ndjson ]]; then
    jq -s 'sort_by(.id)' <<<"$ndjson" >"$dest/plugins.json"
  else
    printf '[]\n' >"$dest/plugins.json"
  fi
}

restore_plugins() {
  local mirror="$1"
  local failed=0
  local id dest path row url enabled local_flag
  local -a enable_ids=()

  if [[ -d $mirror/plugins-local ]]; then
    for path in "$mirror/plugins-local"/*/; do
      [[ -d $path ]] || continue
      id=$(basename "$path")
      [[ $id =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "refusing unusual plugin id: ${id}"
      dest=$(plugin_dir "$id")
      mkdir -p "$dest"
      rsync -a --delete "$path" "$dest/"
      log "restored local plugin ${id}"
    done
  fi

  if [[ ${OMARSYNC_SKIP_LIVE:-0} == 1 ]]; then
    if [[ -f $mirror/plugins.json ]]; then
      jq -r '.[] | select(.local != true and .url != "") | "would add \(.id) from \(.url)"' \
        "$mirror/plugins.json" || true
    fi
    return 0
  fi

  command -v omarchy >/dev/null 2>&1 || {
    warn "omarchy is not on PATH; skipped plugin install"
    return 1
  }

  if [[ -f $mirror/plugins.json ]]; then
    while IFS= read -r row; do
      [[ -n $row ]] || continue
      id=$(jq -r '.id' <<<"$row")
      url=$(jq -r '.url // ""' <<<"$row")
      enabled=$(jq -r 'if .enabled == true then "true" else "false" end' <<<"$row")
      local_flag=$(jq -r 'if .local == true then "true" else "false" end' <<<"$row")
      [[ $id =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "refusing unusual plugin id: ${id}"
      dest=$(plugin_dir "$id")
      if [[ $local_flag != true && -n $url ]]; then
        [[ $url =~ ^(https://|git@|ssh://)[^[:space:]]+$ ]] || die "refusing unusual plugin url for ${id}"
        if [[ ! -d $dest ]]; then
          log "adding plugin ${id}"
          if ! omarchy plugin add "$url" --yes; then
            warn "failed to add plugin ${id}"
            failed=1
            continue
          fi
        fi
      fi
      if [[ $enabled == true ]]; then
        enable_ids+=("$id")
      fi
    done < <(jq -c '.[]' "$mirror/plugins.json")
  fi

  if command -v omarchy-shell >/dev/null 2>&1; then
    omarchy-shell shell rescanPlugins || true
  fi

  if (( ${#enable_ids[@]} > 0 )); then
    local listed
    listed=$(omarchy plugin list --json 2>/dev/null || printf '[]')
    for id in "${enable_ids[@]}"; do
      if jq -e --arg id "$id" '.[] | select(.id == $id and .enabled == true)' <<<"$listed" >/dev/null 2>&1; then
        continue
      fi
      if ! omarchy plugin enable "$id"; then
        warn "failed to enable plugin ${id}"
        failed=1
      fi
    done
  fi
  return "$failed"
}
