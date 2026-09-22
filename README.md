# Omarsync

Sync an [Omarchy](https://omarchy.org) setup to a private GitHub repository and apply it on another machine. The bar widget pushes and pulls; the same commands are available from the terminal.

Omarsync records:

- `~/.config/omarchy` (bar layout, themes, wallpapers, hooks, extensions), except installed shell plugins, editor backups, and video wallpapers
- `~/.config/hypr`
- terminal, Neovim, btop, and lazygit config when those directories exist
- the current theme name and wallpaper
- explicitly installed official and AUR packages
- third-party shell plugins (git remotes, or a copy when a plugin has no remote)

The data repository defaults to a **private** `<github-user>/omarchy-config`. Files over 50MB and any `.git` directory are skipped.

## Install

```sh
omarchy plugin add https://github.com/lukebest/omarsync.git --enable
```

Requires `git`, `rsync`, `jq`, and GitHub CLI. If `gh` is missing, the panel can install it:

```sh
omarchy pkg add github-cli
```

## First sync

1. Click the cloud icon and choose **Sign in to GitHub**. That runs `gh auth login` in a terminal.
2. Choose **Set up repository**. Omarsync creates `you/omarchy-config` if it does not exist and clones it to `~/.local/state/omarsync/repo`.
3. Choose **Push**.

On the other machine, install the plugin, sign in with a GitHub account that can read the repository, set it up, then choose **Pull and apply**. Apply copies files back into your home directory, restores plugins, sets the theme and wallpaper, reloads the shell and Hyprland, and installs packages that are missing. Package installation asks for sudo in the terminal window.

Before it overwrites anything, apply copies the current files to `~/.local/state/omarsync/backup/<timestamp>/` and keeps the last five backups.

## Bar

- Left click opens the panel.
- Middle click pushes.
- Right click refreshes status.
- The icon dims until you are signed in, spins while a command is running, and shows a dot when there are local changes to push.

Auto push follows the **Auto push** interval (minutes). `0` turns it off. The default interval after you enable it from the panel is 30 minutes.

## Command line

```sh
omarsync login
omarsync init [owner/name]
omarsync push
omarsync pull
omarsync apply [--no-packages]
omarsync status
omarsync doctor
```

`push --quiet` skips the desktop notification. Pass `--notify` as well when a quiet push should still notify. The panel's Notify toggle controls that.

## What is included

The scope file lives in the data repository as `omarsync.scope`, so both machines share it. Edit it from the panel or in `~/.local/state/omarsync/repo/omarsync.scope`, then push.

```
.config/omarchy | plugins/,*.bak.*,*.mp4,*.mkv,*.webm,*.mov,*.avi,*.m4v
.config/hypr | *.bak.*
.config/nvim
```

Paths are relative to `$HOME`. Text after `|` is a comma-separated list of rsync exclude patterns. A missing path is skipped. Do not add `.local/state/omarsync`; that directory is the local mirror.

The repository is private, but it is still a copy of your configuration. Do not add directories that contain tokens, keys, or mail. `~/.config/gh` is not part of the default scope.

## Apply behavior

- Existing files under each scope path are backed up, then replaced so they match the mirror. Files that were excluded from the sync (for example `*.bak.*`) can be removed on apply because the mirror does not contain them; the backup still has them.
- A scope path that is missing from the mirror is left untouched.
- Official packages are installed with `omarchy pkg add`. AUR packages are installed with `yay` when it is available. Packages that exist only on this machine are not removed.
- Plugins with a git remote are added with `omarchy plugin add` when they are not already installed. Plugins without a remote are copied into `~/.config/omarchy/plugins/<id>/`.
- The last machine to push wins when both sides edited the same file.

## Permissions

This plugin runs unsandboxed inside the Omarchy shell, as your user. Push and status run `git`, `rsync`, `pacman -Q`, and `gh`. Apply can overwrite configuration, reload Hyprland, and install packages with sudo. Review the repository before enabling it.

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
