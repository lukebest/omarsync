#!/usr/bin/env bash
# Copy this checkout into the Omarchy plugin directory and reload the shell.
# The plugin folder cannot contain symlinks, so this is a real copy.

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ID="io.github.lukebest.omarsync"
DEST="$HOME/.config/omarchy/plugins/$ID"

mkdir -p "$DEST"
rsync -a --delete \
  --exclude .git \
  --exclude preview.png \
  "$ROOT/" "$DEST/"
chmod +x "$DEST/bin/omarsync" "$DEST/scripts/"*.sh

if command -v omarchy-shell >/dev/null 2>&1; then
  omarchy-shell shell rescanPlugins || true
fi

printf 'installed %s\n' "$DEST"
