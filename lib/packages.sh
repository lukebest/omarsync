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
  local app origin branch commit
  while IFS=$'\t' read -r app origin branch _active; do
    [[ $app =~ ^[A-Za-z0-9._-]+$ ]] || continue
    [[ $origin =~ ^[A-Za-z0-9._-]+$ ]] || continue
    [[ $branch =~ ^[A-Za-z0-9._-]+$ ]] || continue
    commit=$(flatpak info --user --show-commit "$app" 2>/dev/null || true)
    [[ $commit =~ ^[0-9a-f]{64}$ ]] || commit=""
    printf '%s\t%s\t%s\t%s\n' "$app" "$origin" "$branch" "$commit" >>"$out"
  done < <(flatpak list --user --app --columns=application,origin,branch,active 2>/dev/null || true)
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
  local app origin branch commit installed
  while IFS=$'\t' read -r app origin branch commit || [[ -n ${app:-} ]]; do
    [[ -n $app ]] || continue
    [[ $app =~ ^[A-Za-z0-9._-]+$ ]] || die "refusing unusual flatpak id: ${app}"
    [[ $origin =~ ^[A-Za-z0-9._-]+$ ]] || die "refusing unusual flatpak origin: ${origin}"
    [[ $branch =~ ^[A-Za-z0-9._-]+$ ]] || die "refusing unusual flatpak branch: ${branch}"
    [[ -z $commit || $commit =~ ^[0-9a-f]{64}$ ]] || die "refusing unusual flatpak commit: ${commit}"
    installed=0
    flatpak info --user "$app" >/dev/null 2>&1 && installed=1
    if (( ! installed )); then
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
