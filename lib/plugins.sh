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

  # Plugin trees are executable. Record ids only; never copy them into the snapshot.
  rm -rf "$dest/plugins-local"

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
    rev=""
    if [[ -d $dir/.git ]]; then
      url=$(git -C "$dir" remote get-url origin 2>/dev/null || true)
      rev=$(git -C "$dir" rev-parse --verify HEAD 2>/dev/null || true)
      is_full_sha "$rev" || rev=""
    fi
    if [[ -n $url || -d $dir ]]; then
      ndjson+=$(jq -nc --arg id "$id" --arg url "$url" --arg rev "$rev" --argjson enabled "$enabled" \
        '{id:$id, url:$url, commit:$rev, enabled:$enabled, local:($url == "")}')
      ndjson+=$'\n'
    fi
  done < <(jq -c '.[]' <<<"$listing")

  if [[ -n $ndjson ]]; then
    jq -s 'sort_by(.id)' <<<"$ndjson" >"$dest/plugins.json"
  else
    printf '[]\n' >"$dest/plugins.json"
  fi
}

# Plugin checkouts and omarchy plugin add follow mutable remotes. Apply never
# installs or enables them. The snapshot only records what was installed.
report_plugins() {
  local mirror="$1"
  if [[ -d $mirror/plugins-local ]]; then
    warn "ignored plugins-local in the snapshot; omarsync does not install executable plugin trees"
  fi
  [[ -f $mirror/plugins.json ]] || return 0
  local row id url rev
  while IFS= read -r row; do
    [[ -n $row ]] || continue
    id=$(jq -r '.id // ""' <<<"$row")
    url=$(jq -r '.url // ""' <<<"$row")
    rev=$(jq -r '.commit // ""' <<<"$row")
    if [[ -n $url && $rev =~ ^[0-9a-f]{40}$ ]]; then
      warn "not installing plugin ${id}; pin and install ${url} at ${rev} yourself"
    elif [[ -n $url ]]; then
      warn "not installing plugin ${id}; ${url} has no pinned commit"
    else
      warn "not installing local plugin ${id}; omarsync does not copy plugin source"
    fi
  done < <(jq -c '.[]' "$mirror/plugins.json")
}
