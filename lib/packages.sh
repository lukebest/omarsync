#!/usr/bin/env bash
# Export and install explicit pacman / AUR package lists.

export_packages() {
  local dest="$1"
  mkdir -p "$dest/packages"
  if command -v pacman >/dev/null 2>&1; then
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
    if ! command -v yay >/dev/null 2>&1; then
      warn "yay is not installed; skipped AUR packages: ${aur[*]}"
      failed=1
    else
      local -a args=()
      for pkg in "${aur[@]}"; do
        args+=("aur/${pkg}")
      done
      log "installing ${#aur[@]} AUR packages"
      if ! yay -S --noconfirm "${args[@]}"; then
        warn "AUR package install failed"
        failed=1
      fi
    fi
  else
    log "AUR packages already installed"
  fi

  return "$failed"
}
