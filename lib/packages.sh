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

  return "$failed"
}
