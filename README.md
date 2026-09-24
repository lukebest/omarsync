# Omarsync

Sync an [Omarchy](https://omarchy.org) setup to a private GitHub repository and apply it on another machine. The bar widget pushes and pulls; the same commands are available from the terminal.

Omarsync records:

- `~/.config/omarchy` (bar layout, themes, wallpapers, hooks, extensions), except installed shell plugins, editor backups, and video wallpapers
- `~/.config/hypr`
- terminal, Neovim, btop, and lazygit config when those directories exist
- the current theme name and wallpaper
- explicitly installed official and AUR packages, and user-installed Flatpak apps (such as a Flathub Zotero) pinned to the commit that was installed
- a list of third-party shell plugins (id, remote, and commit when the checkout has one). The plugin source itself is not copied or installed
- application launchers in `~/.local/share/applications` and their icons in `~/.local/share/icons/hicolor` (web apps and other Omarchy-installed apps)

The data repository defaults to a **private** `<github-user>/omarchy-config`. Files over 50MB and any `.git` directory are skipped.

## Install

```sh
omarchy plugin add https://github.com/lukebest/omarsync.git --enable
```

Requires `git`, `rsync`, `jq`, and the system GitHub CLI at `/usr/bin/gh`. A copy installed only into a user directory is ignored. If `gh` is missing, the panel can install it:

```sh
omarchy pkg add github-cli
```

## First sync

1. Click the cloud icon and choose **Sign in to GitHub**. That runs `gh auth login` in a terminal.
2. Choose **Set up repository**. Omarsync creates `you/omarchy-config` if it does not exist and clones it to `~/.local/state/omarsync/repo`.
3. Choose **Push**. The commit is signed. Push uses `~/.ssh/id_ed25519` when that key has no passphrase. Otherwise it creates `~/.config/omarsync/signing_key` and trusts that key on this machine. The private key stays local.

On the other machine, install the plugin, sign in with a GitHub account that can read the repository, and set up the repository. The first time, choose **Apply this commit**. That apply does not need a trusted key. If the commit is signed, the signing key is saved in `~/.config/omarsync/trusted-keys` on this PC. If it is not signed, this PC still applies that exact commit once. The trust file stays on the machine; it is not part of the synced snapshot.

Later applies accept only a commit signed by a trusted key. **Force pull and apply** fetches that same commit and writes it anyway when the signature check would refuse it. Apply still refuses a branch name or a different commit id. You can pin the public key ahead of time:

```sh
omarsync trust-key /path/to/the-signing-key.pub
```

The panel shows the full commit id. **Apply signed commit** runs only for that exact signed snapshot.

Before it overwrites anything, apply copies the current files to `~/.local/state/omarsync/backup/<timestamp>/` and keeps the last five backups.

## Bar

- Left click opens the panel.
- Middle click pushes.
- Right click refreshes status.
- The icon dims until you are signed in, spins while a command is running, and shows a dot when there are local changes to push.

**Scan for changes** defaults to every hour. The same menu can set 15 minutes, 30 minutes, 6 hours, or 24 hours, or turn periodic scanning off. **Scan now**, or a right-click on the icon, checks immediately. Auto push follows the **Auto push** interval (minutes). `0` turns it off. The default interval after you enable it from the panel is 30 minutes.

## Command line

```sh
omarsync login
omarsync init [owner/name]
omarsync push
omarsync trust-key <public-key> [private-key]
omarsync pull
omarsync apply --commit <40-character sha> [--no-packages] [--force]
omarsync status
omarsync doctor
```

`push --quiet` skips the desktop notification. Pass `--notify` as well when a quiet push should still notify. The panel's Notify toggle controls that.

## What is included

Which files are uploaded is decided only by `~/.config/omarsync/scope` on this machine. Edit it from the panel. A scope file inside the sync repository is ignored, including after `git pull`, and push removes it from the snapshot. Each machine keeps its own scope; a remote edit cannot start uploading new local paths.

```
.config/omarchy | plugins/,*.bak.*,*.mp4,*.mkv,*.webm,*.mov,*.avi,*.m4v
.config/hypr | *.bak.*
.config/nvim
.local/share/applications | mimeinfo.cache
.local/share/icons/hicolor | icon-theme.cache
```

Paths are relative to `$HOME`. Text after `|` is a comma-separated list of rsync exclude patterns. A missing path is skipped. Paths that would include `.ssh`, `.config/gh`, `.config/git`, `.gnupg`, key files, or the local omarsync trust directory are rejected.

## Apply behavior

- Existing files under each scope path are backed up, then replaced so they match the mirror. Files that were excluded from the sync (for example `*.bak.*`) can be removed on apply because the mirror does not contain them; the backup still has them.
- A scope path that is missing from the mirror is left untouched.
- Apply does not remove `~/.config/omarchy/plugins`. Snapshots omit that directory, so replacing `.config/omarchy` would otherwise delete omarsync and the other installed plugins.
- Apply resolves the remote branch once, checks out that full commit detached, and checks the signature against `~/.config/omarsync/trusted-keys` before it changes anything. The command has to name that same 40-character id. The first apply on a PC with no trusted key can use that commit even when it is unsigned, and pins the signer when the commit is signed. Later applies require a trusted signature. `--force` applies that exact commit anyway and does not add the signing key to the trust file.
- Official packages from that signed snapshot are installed with `omarchy pkg add`, which uses the signed Arch repositories. User Flatpak apps are installed from the recorded remote and then moved to the recorded commit. A missing Flathub user remote is added from Flathub. An app whose remote has no download URL, such as a disabled local origin, is skipped. AUR names are only printed. Omarsync does not run `yay`.
- Plugin ids are recorded in `plugins.json`. Omarsync does not copy plugin trees out of the snapshot and does not run `omarchy plugin add` or `omarchy plugin enable`.
- The last signed push wins when both sides edited the same file.

## Permissions

This plugin runs unsandboxed inside the Omarchy shell, as your user. Automatic status and push start `/usr/bin/bash` with a cleared environment and a fixed `PATH`. The command then runs `git`, `rsync`, `jq`, `gh`, and Omarchy tools only from trusted system directories. Apply can overwrite configuration, reload Hyprland, and install official packages with sudo. Review the repository before enabling it.

`OMARSYNC_ORIGIN` can point git at a non-GitHub remote. That is a development hook; the panel flow uses GitHub.

## Remove

```sh
omarchy plugin remove io.github.lukebest.omarsync
```

Removing the plugin does not delete `~/.local/state/omarsync` or the GitHub repository.

## Development

```sh
scripts/dev-install.sh
omarchy plugin enable io.github.lukebest.omarsync
scripts/self-test.sh
omarchy plugin validate .
qmllint -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" BarWidget.qml Panel.qml
```

`scripts/dev-install.sh` copies this tree into `~/.config/omarchy/plugins/io.github.lukebest.omarsync` and asks the shell to rescan. The plugin directory cannot contain symlinks, so the copy is real.
