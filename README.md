# Omarsync

Sync an [Omarchy](https://omarchy.org) setup to private GitHub repositories and apply it on another machine. The bar widget pushes and pulls; the same commands are available from the terminal.

File sync is handled by **[mise dot](https://mise.jdx.dev)**: Omarsync tracks the configured directories with `mise dot track` (files stay in place, no symlinks), saves history checkpoints, and publishes them to a private dotfiles repository. Everything mise cannot do — package lists, pinned Flatpak commits, shell plugins, post-apply hooks, and the trust/signature gate — stays in Omarsync's signed metadata repository.

Two private repositories are used:

- `<github-user>/omarchy-config` — signed metadata: package lists, `plugins.json`, local plugin snapshots, hooks, current theme/wallpaper, and `omarsync.json` (which records the mise history head at push time).
- `<github-user>/omarchy-dotfiles` — the `mise dot` origin holding the actual file history.

Omarsync records:

- the directories listed in `~/.config/omarsync/scope` (by default `~/.config/omarchy`, `~/.config/hypr`, and terminal/Neovim/btop/lazygit config when those directories exist), tracked in place by mise
- the current theme name and wallpaper
- explicitly installed official and AUR packages, and user-installed Flatpak apps pinned to the commit that was installed. An app whose remote has no download URL is recorded and skipped
- third-party shell plugins. A plugin with an https remote is recorded by commit and cloned at that commit. A plugin with no remote is copied into the snapshot. Omarsync itself is not copied. Plugins are never tracked by mise — executable code only ever comes from the signed metadata path
- post-apply hooks from `~/.config/omarsync-hooks/post-apply.d`

## Install

```sh
omarchy plugin add https://github.com/lukebest/omarsync.git --enable
```

The Omarchy plugin system does not put a plugin's `bin/` on `PATH`, so the CLI installs its own shim: the first time the wrapper runs (the panel scans status right after installing), it creates `~/.local/bin/omarsync`, which is already on `PATH` in Omarchy. An existing file with that name that was not created by Omarsync is left untouched.

Requires `git`, `rsync`, the system `lua` and `mise` (`/usr/bin/lua`, `/usr/bin/mise`), and the system GitHub CLI at `/usr/bin/gh`. Copies installed only into a user directory are ignored. If anything is missing, the panel can install it:

```sh
omarchy pkg add lua mise github-cli
```

## First sync

1. Click the cloud icon and choose **Get started**. That installs missing dependencies, signs in to GitHub, creates both private repositories, and connects `mise dot` to the dotfiles repository.
2. Choose **Push**. The metadata commit is signed. Push uses `~/.ssh/id_ed25519` when that key has no passphrase. Otherwise it creates `~/.config/omarsync/signing_key` and trusts that key on this machine. The private key stays local. Files are checkpointed with `mise dot save` and published with `mise dot sync`.

The bar updates as soon as those commands finish. A right-click scan is not required. Opening the panel does not scan.

On the other machine, install the plugin and choose **Get started**, then **Apply**. Init adopts the remote mise history wholesale (it never creates a local baseline first, so the two histories always merge). Apply shows what will change and asks before it writes. A signed commit can install missing plugins and run hooks. An unsigned first apply, or **apply --force**, writes configuration and skips those executable steps. `--no-exec` skips them even for a signed commit.

```sh
omarsync trust-key /path/to/the-signing-key.pub
```

The panel shows a short commit id. **Apply** runs only for that exact snapshot, after showing the preview in a terminal.

Before it overwrites anything, apply copies the current files to `~/.local/state/omarsync/backup/<timestamp>/` and keeps the last five backups. Independently, `mise dot pull` takes its own protective checkpoint and supports undo.

## Bar

- Left click opens the panel.
- Middle click pushes.
- Right click refreshes status.
- The icon dims until you are signed in, spins while a command is running, and shows a dot when there are local changes to push.

**Scan for changes** defaults to every hour. The same menu can set 15 minutes, 30 minutes, 6 hours, or 24 hours, or turn periodic scanning off. **Scan now**, or a right-click on the icon, checks immediately. Auto push follows the **Auto push** interval (minutes). `0` turns it off. The default interval after you enable it from the panel is 30 minutes.

## Command line

```sh
omarsync login
omarsync setup
omarsync init [owner/name]
omarsync push
omarsync trust-key <public-key> [private-key]
omarsync pull
omarsync apply --commit <40-character sha> [--no-packages] [--no-exec] [--force]
omarsync migrate
omarsync status
omarsync doctor
```

`push --quiet` skips the desktop notification. Pass `--notify` as well when a quiet push should still notify. The panel's Notify toggle controls that.

`migrate` upgrades an old installation whose metadata repository still contains a `home/` file mirror: it publishes the files through mise and removes `home/` from the repository (the old content stays recoverable from git history).

## What is included

Which files are uploaded is decided only by `~/.config/omarsync/scope` on this machine. Edit it from the panel. A scope file inside the sync repository is ignored, including after `git pull`, and push removes it from the snapshot. Each machine keeps its own scope; a remote edit cannot start uploading new local paths.

```
.config/omarchy | plugins/,*.bak.*,*.mp4,*.mkv,*.webm,*.mov,*.avi,*.m4v
.config/hypr | *.bak.*
.config/nvim
.config/btop
.config/lazygit
.config/autostart
.local/bin | agent,cursor,cursor-agent
.local/share/applications | mimeinfo.cache
.local/share/icons/hicolor | icon-theme.cache
```

Paths are relative to `$HOME`. Text after `|` is a comma-separated list of exclude patterns, translated to mise exclude globs. A missing path is skipped. Removing a line stops tracking that directory (mise keeps the earlier history). Paths that would include `.ssh`, `.config/gh`, `.config/git`, `.gnupg`, `.config/doubao-murmur`, `.var`, `.config/mise` or the mise state directories, key files, or the local omarsync trust directory are rejected.

Hooks are not scope entries. Put executable scripts in `~/.config/omarsync-hooks/post-apply.d/`. Apply copies them into the snapshot and, for a trusted commit, runs them in the terminal after the files are written. `examples/hooks/10-murmur.sh` re-applies Doubao Murmur patches and, if F9 cannot read the input device, installs a udev rule with sudo. Session cookies under `~/.config/doubao-murmur` are not synced.

## Apply behavior

- Existing files under each scope path are backed up, then `mise dot pull --take-remote-all` writes the remote versions. Unlike the old rsync mirror, files that were excluded from the sync (for example `*.bak.*`) are **not** deleted on the receiving machine — mise only writes files it tracks.
- Apply does not remove `~/.config/omarchy/plugins`. That directory is excluded from tracking, so omarsync and the other installed plugins survive.
- Apply resolves the remote branch once, checks out that full commit detached, and checks the signature against `~/.config/omarsync/trusted-keys` before it changes anything. The command has to name that same 40-character id. The first apply on a PC with no trusted key can use that commit even when it is unsigned, and pins the signer when the commit is signed. Later applies require a trusted signature. `--force` applies that exact commit anyway and does not add the signing key to the trust file.
- Official packages from that signed snapshot are installed with `omarchy pkg add`, which uses the signed Arch repositories. User Flatpak apps are installed from the recorded remote and then moved to the recorded commit. A missing Flathub user remote is added from Flathub. An app whose remote has no download URL, such as a disabled local origin, is skipped. AUR names are only printed. Omarsync does not run `yay`.
- Missing plugins from that signed snapshot are installed. An https plugin is cloned and checked out at the recorded commit. A plugin with no remote is copied from the snapshot. Each one is validated before it is moved into `~/.config/omarchy/plugins`. Omarsync does not install its own tree. `--no-exec`, an unsigned first apply, and `--force` skip this.
- When both machines edited the same file, the remote side wins on apply (`--take-remote-all`). If a push reports a mise conflict, resolve it with `mise dot conflicts` (or `mise dot pull --take-remote-all` / `--keep-local`) and push again.
- `omarsync.json` records the mise history head at push time as `miseHead` (for forensics; the receiving machine's local history head legitimately differs, so it is not pinned).

## Permissions

This plugin runs unsandboxed inside the Omarchy shell, as your user. Automatic status and push start the CLI with a cleared environment and a fixed `PATH`. The CLI is Lua (system `/usr/bin/lua`) behind a thin bash wrapper and runs `git`, `rsync`, `mise`, `gh`, and Omarchy tools only from trusted system directories. Apply can overwrite configuration, reload Hyprland, and install official packages with sudo. Review the repository before enabling it.

`OMARSYNC_ORIGIN` and `OMARSYNC_DOT_ORIGIN` can point git and mise at non-GitHub remotes. Those are development hooks; the panel flow uses GitHub.

## Remove

```sh
omarchy plugin remove io.github.lukebest.omarsync
```

Removing the plugin does not delete `~/.local/state/omarsync`, the mise tracking configuration, or the GitHub repositories.

## Development

```sh
scripts/dev-install.sh
omarchy plugin enable io.github.lukebest.omarsync
scripts/self-test.sh
omarchy plugin validate .
qmllint -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" BarWidget.qml Panel.qml
```

`scripts/dev-install.sh` copies this tree into `~/.config/omarchy/plugins/io.github.lukebest.omarsync` and asks the shell to rescan. The plugin directory cannot contain symlinks, so the copy is real.

`scripts/self-test.sh` runs the full end-to-end suite against local bare repositories and fake HOMEs: signed push, dirty detection, two-machine apply, conflicts, trust policy (TOFU, unsigned, foreign signer, `--force`), scope poisoning, banned paths, scope-removal untracking, plugins and hooks, passphrase-key fallback, and legacy-mirror migration.
