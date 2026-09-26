#!/usr/bin/env bash
# Export and install explicit pacman / AUR package lists.

export_packages() {
  local dest="$1"
  mkdir -p "$dest/packages"
  if [[ -n ${PACMAN_BIN:-} ]]; then
    pacman -Qqen >"$dest/packages/pacman.txt" || true
    pacman -Qqem >"$dest/packages/aur.txt" || true
  else
    : >"$dest/packages/pacman.txt"
    : >"$dest/packages/aur.txt"
  fi
  export_flatpaks "$dest"
}

export_flatpaks() {
  local dest="$1"
  local out="$dest/packages/flatpak.txt"
  : >"$out"
  [[ -n ${FLATPAK_BIN:-} ]] || return 0
  local -A remote_urls=()
  local name url
  while IFS=$'\t' read -r name url; do
    [[ $name =~ ^[A-Za-z0-9._-]+$ ]] || continue
    flatpak_remote_url_ok "$url" || url=""
    remote_urls["$name"]=$url
  done < <(flatpak remotes --user --columns=name,url 2>/dev/null || true)
  local app origin branch commit
  while IFS=$'\t' read -r app origin branch _active; do
    [[ $app =~ ^[A-Za-z0-9._-]+$ ]] || continue
    [[ $origin =~ ^[A-Za-z0-9._-]+$ ]] || continue
    [[ $branch =~ ^[A-Za-z0-9._-]+$ ]] || continue
    commit=$(flatpak info --user --show-commit "$app" 2>/dev/null || true)
    [[ $commit =~ ^[0-9a-f]{64}$ ]] || commit=""
    url=${remote_urls[$origin]:-}
    printf '%s\t%s\t%s\t%s\t%s\n' "$app" "$origin" "$branch" "$commit" "$url" >>"$out"
  done < <(flatpak list --user --app --columns=application,origin,branch,active 2>/dev/null || true)
}

flatpak_remote_url_ok() {
  local url="$1"
  local pattern='^https://[A-Za-z0-9._~:/?#&=%+-]+$'
  [[ ${#url} -le 300 ]] || return 1
  [[ $url =~ $pattern ]] || return 1
  [[ $url != *..* ]] || return 1
}

user_flatpak_remote_exists() {
  local name="$1"
  local existing
  while IFS= read -r existing; do
    [[ $existing == "$name" ]] && return 0
  done < <(flatpak remotes --user --columns=name 2>/dev/null || true)
  return 1
}

# Flathub is the one well-known remote. Other origins need a URL recorded
# from the machine that exported them. A disabled local origin has none.
ensure_user_flatpak_remote() {
  local name="$1"
  local url="${2:-}"
  user_flatpak_remote_exists "$name" && return 0
  if [[ $name == flathub ]]; then
    url="https://dl.flathub.org/repo/flathub.flatpakrepo"
  fi
  flatpak_remote_url_ok "$url" || return 1
  flatpak remote-add --user --if-not-exists "$name" "$url"
}

valid_pkg_name() {
  [[ ${1:-} =~ ^[A-Za-z0-9@._+-]+$ ]]
}

install_missing_packages() {
  local mirror="$1"
  local failed=0
  local pkg
  local -a official=()
  local -a aur=()

  if [[ -f $mirror/packages/pacman.txt ]]; then
    while IFS= read -r pkg || [[ -n $pkg ]]; do
      pkg=$(trim "$pkg")
      [[ -z $pkg || $pkg == \#* ]] && continue
      valid_pkg_name "$pkg" || die "refusing unusual package name: ${pkg}"
      if ! pacman -Q "$pkg" &>/dev/null; then
        official+=("$pkg")
      fi
    done <"$mirror/packages/pacman.txt"
  fi

  if (( ${#official[@]} )); then
    log "installing ${#official[@]} official packages"
    if ! omarchy pkg add "${official[@]}"; then
      warn "official package install failed"
      failed=1
    fi
  else
    log "official packages already installed"
  fi

  if [[ -f $mirror/packages/aur.txt ]]; then
    while IFS= read -r pkg || [[ -n $pkg ]]; do
      pkg=$(trim "$pkg")
      [[ -z $pkg || $pkg == \#* ]] && continue
      valid_pkg_name "$pkg" || die "refusing unusual package name: ${pkg}"
      if ! pacman -Q "$pkg" &>/dev/null; then
        aur+=("$pkg")
      fi
    done <"$mirror/packages/aur.txt"
  fi

  if (( ${#aur[@]} )); then
    warn "not installing AUR packages (unpinned build recipes): ${aur[*]}"
    warn "install a pinned PKGBUILD commit yourself if you still want them"
  fi

  install_missing_flatpaks "$mirror" || failed=1
  return "$failed"
}

install_missing_flatpaks() {
  local mirror="$1"
  local list="$mirror/packages/flatpak.txt"
  local failed=0
  [[ -n ${FLATPAK_BIN:-} && -f $list ]] || return 0
  local app origin branch commit url installed
  while IFS=$'\t' read -r app origin branch commit url || [[ -n ${app:-} ]]; do
    [[ -n $app ]] || continue
    [[ $app =~ ^[A-Za-z0-9._-]+$ ]] || die "refusing unusual flatpak id: ${app}"
    [[ $origin =~ ^[A-Za-z0-9._-]+$ ]] || die "refusing unusual flatpak origin: ${origin}"
    [[ $branch =~ ^[A-Za-z0-9._-]+$ ]] || die "refusing unusual flatpak branch: ${branch}"
    [[ -z $commit || $commit =~ ^[0-9a-f]{64}$ ]] || die "refusing unusual flatpak commit: ${commit}"
    [[ -z $url ]] || flatpak_remote_url_ok "$url" || die "refusing unusual flatpak remote URL for ${origin}"
    installed=0
    flatpak info --user "$app" >/dev/null 2>&1 && installed=1
    if (( ! installed )); then
      if ! ensure_user_flatpak_remote "$origin" "$url"; then
        warn "skipping flatpak ${app}; remote ${origin} is not on this machine and has no download URL"
        continue
      fi
      log "installing flatpak ${app} from ${origin}"
      if ! flatpak install --user --noninteractive --app "$origin" "$app"; then
        warn "failed to install flatpak ${app}"
        failed=1
        continue
      fi
    fi
    if [[ -n $commit ]]; then
      log "pinning flatpak ${app} to ${commit}"
      if ! flatpak update --user --noninteractive --commit="$commit" "$app"; then
        warn "failed to pin flatpak ${app} to ${commit}"
        failed=1
      fi
    fi
  done <"$list"
  return "$failed"
}
