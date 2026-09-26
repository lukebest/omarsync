#!/usr/bin/bash
# Re-apply Doubao Murmur patches and make F9 readable on a new machine.
# Runs from an Omarsync apply terminal, so sudo can ask for a password.
set -euo pipefail

if [[ -x "$HOME/.local/bin/doubao-murmur-repatch" ]]; then
  "$HOME/.local/bin/doubao-murmur-repatch"
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload || true
fi

if [[ -r /dev/input/event0 ]]; then
  exit 0
fi

rule=/etc/udev/rules.d/99-omarsync-input-acl.rules
if [[ ! -f $rule ]]; then
  echo "Installing an input-device rule so Murmur can see F9. This asks for your password."
  sudo tee "$rule" >/dev/null <<EOF
KERNEL=="event*", SUBSYSTEM=="input", RUN+="/usr/bin/setfacl -m u:${USER}:rw /dev/%k"
EOF
  sudo udevadm control --reload-rules || true
  sudo udevadm trigger --subsystem-match=input || true
fi

if ! id -nG "$USER" | grep -qw input; then
  echo "Adding ${USER} to the input group. Log out and back in afterward."
  sudo usermod -aG input "$USER"
fi
