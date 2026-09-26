#!/usr/bin/env bash
# Export and restore third-party Omarchy shell plugins.

plugin_dir() {
  printf '%s\n' "$HOME/.config/omarchy/plugins/$1"
}

valid_plugin_id() {
  [[ ${1:-} =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && $1 != *..* && $1 != omarchy.* ]]
}

https_plugin_url() {
  local url="$1"
  local pattern='^https://[A-Za-z0-9._~:/?#%+-]+$'
  [[ $url != *..* ]] || return 1
  [[ $url =~ $pattern ]]
}

local_plugin_url() {
  local url="$1"
  [[ $url == file:///* && $url != *..* && $url != *$'\n'* ]]
}

export_plugins() {
  local dest="$1"
  local mode="${2:-apply}"
  local listing=""
  local row id enabled url dir rev

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

  if [[ $mode == apply ]]; then
    rm -rf "$dest/plugins-local"
  fi

  local ndjson=""
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    if jq -e '.firstParty == true' <<<"$row" >/dev/null 2>&1; then
      continue
    fi
    id=$(jq -r '.id // ""' <<<"$row")
    valid_plugin_id "$id" || continue
    [[ $id != "$PLUGIN_ID" ]] || continue
    enabled=$(jq -r 'if .enabled == true then "true" else "false" end' <<<"$row")
    dir=$(plugin_dir "$id")
    url=""
    rev=""
    if [[ -d $dir/.git ]]; then
      url=$(git -C "$dir" remote get-url origin 2>/dev/null || true)
      rev=$(git -C "$dir" rev-parse --verify HEAD 2>/dev/null || true)
      is_full_sha "$rev" || rev=""
    fi
    if https_plugin_url "$url" && [[ -n $rev ]]; then
      ndjson+=$(jq -nc --arg id "$id" --arg url "$url" --arg rev "$rev" --argjson enabled "$enabled" \
        '{id:$id, url:$url, commit:$rev, enabled:$enabled, local:false}')
      ndjson+=$'\n'
    elif [[ -d $dir && $mode == apply ]]; then
      copy_local_plugin "$dir" "$dest/plugins-local/$id"
      ndjson+=$(jq -nc --arg id "$id" --argjson enabled "$enabled" \
        '{id:$id, url:"", commit:"", enabled:$enabled, local:true}')
      ndjson+=$'\n'
    fi
  done < <(jq -c '.[]' <<<"$listing")

  if [[ -n $ndjson ]]; then
    jq -s 'sort_by(.id)' <<<"$ndjson" >"$dest/plugins.json"
  else
    printf '[]\n' >"$dest/plugins.json"
  fi
}

copy_local_plugin() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  rsync -a --delete --max-size="$MAX_FILE_SIZE" \
    --exclude '.git/' --exclude 'node_modules/' \
    "$src/" "$dest/"
  local link
  while IFS= read -r link; do
    [[ -n $link ]] || continue
    rm -f "$link"
    warn "removed symlink from plugin snapshot: ${link#"$dest"/}"
  done < <(/usr/bin/find "$dest" -type l -print)
}

install_missing_plugins() {
  local mirror="$1"
  local allow_exec="$2"
  [[ -f $mirror/plugins.json ]] || return 0
  if (( allow_exec != 1 )); then
    warn "skipped plugin install; executable restore needs a trusted signature"
    return 0
  fi
  local row id url rev enabled dest tmp head failed=0 installed_any=0
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    id=$(jq -r '.id // ""' <<<"$row")
    url=$(jq -r '.url // ""' <<<"$row")
    rev=$(jq -r '.commit // ""' <<<"$row")
    enabled=$(jq -r 'if .enabled == true then "true" else "false" end' <<<"$row")
    valid_plugin_id "$id" || { warn "skipping plugin with an invalid id"; continue; }
    [[ $id != "$PLUGIN_ID" ]] || continue
    dest=$(plugin_dir "$id")
    if [[ -d $dest ]]; then
      if [[ -n $rev && -d $dest/.git ]]; then
        head=$(git -C "$dest" rev-parse --verify HEAD 2>/dev/null || true)
        if [[ $head != "$rev" ]]; then
          warn "plugin ${id} is at ${head:-unknown}, snapshot records ${rev}; left it alone"
        fi
      fi
      continue
    fi
    tmp=$(/usr/bin/mktemp -d)
    if { https_plugin_url "$url" || local_plugin_url "$url"; } && is_full_sha "$rev"; then
      if ! git clone --quiet --no-checkout "$url" "$tmp/plugin"; then
        warn "failed to clone plugin ${id} from ${url}"
        rm -rf "$tmp"
        failed=1
        continue
      fi
      if ! git -C "$tmp/plugin" checkout --quiet --detach "$rev"; then
        warn "plugin ${id} does not contain commit ${rev}"
        rm -rf "$tmp"
        failed=1
        continue
      fi
      head=$(git -C "$tmp/plugin" rev-parse --verify HEAD)
      if [[ $head != "$rev" ]]; then
        warn "plugin ${id} checkout ${head} is not ${rev}"
        rm -rf "$tmp"
        failed=1
        continue
      fi
    elif jq -e '.local == true' <<<"$row" >/dev/null 2>&1 && [[ -d $mirror/plugins-local/$id ]]; then
      mkdir -p "$tmp/plugin"
      rsync -a "$mirror/plugins-local/$id/" "$tmp/plugin/"
    else
      warn "not installing plugin ${id}; no pinned https commit or local snapshot"
      rm -rf "$tmp"
      continue
    fi
    if ! omarchy plugin validate "$tmp/plugin"; then
      warn "plugin ${id} failed validation; not installed"
      rm -rf "$tmp"
      failed=1
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    rm -rf "$dest"
    mv "$tmp/plugin" "$dest"
    rm -rf "$tmp"
    log "installed plugin ${id}"
    installed_any=1
    if [[ $enabled == true && ${OMARSYNC_SKIP_LIVE:-0} != 1 ]]; then
      omarchy plugin enable "$id" || warn "could not enable plugin ${id}"
    fi
  done < <(jq -c '.[]' "$mirror/plugins.json")
  if (( installed_any )) && [[ ${OMARSYNC_SKIP_LIVE:-0} != 1 && -n ${OMARCHY_SHELL_BIN:-} ]]; then
    omarchy-shell shell rescanPlugins || warn "shell plugin rescan failed"
  fi
  return "$failed"
}
