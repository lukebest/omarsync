# Omarsync

把一台 [Omarchy](https://omarchy.org) 机器的整体环境同步到私有 GitHub 仓库,并在另一台机器上恢复。状态栏图标可以 push 和 pull;同样的功能在终端里都有对应命令——**面板按钮的名字就是 CLI 子命令**(`setup` / `push` / `apply`)。

文件同步由 **[mise dot](https://mise.jdx.dev)** 负责:Omarsync 用 `mise dot track` 跟踪配置目录(文件留在原地,不做符号链接),保存历史检查点,并发布到同一个私有仓库的 `dotfiles` 分支。mise 做不了的事——软件包清单、钉住 commit 的 Flatpak、shell 插件、post-apply 钩子、信任/签名门槛——都放在该仓库 `main` 分支的签名提交里。

只用一个私有仓库 `<github用户名>/omarchy-config`:

- `main` — 签名元数据:软件包清单、`plugins.json`、本地插件快照、钩子、当前主题/壁纸,以及 `omarsync.json`(记录 push 时的 mise 历史头)。
- `dotfiles` — mise 自己的文件历史。这条分支不和 `main` 合并。

Omarsync 会记录:

- `~/.config/omarsync/scope` 里列出的目录(默认包括 `~/.config/omarchy`、`~/.config/hypr`,以及存在的终端/Neovim/btop/lazygit 配置),由 mise 原地跟踪
- 当前主题名和壁纸
- 显式安装的官方/AUR 软件包,以及钉住安装时 commit 的用户 Flatpak 应用。没有下载地址的 remote 会被记录并跳过
- 第三方 shell 插件。有 https 远端的插件按 commit 记录、恢复时按该 commit 克隆;没有远端的插件整体复制进快照。Omarsync 自己不复制。插件永远不经 mise 跟踪——可执行代码只走签名元数据通道
- `~/.config/omarsync-hooks/post-apply.d` 里的 post-apply 钩子

## 安装

```sh
omarchy plugin add https://github.com/lukebest/omarsync.git --enable
```

Omarchy 插件系统不会把插件的 `bin/` 加入 PATH,所以 CLI 会自己装一个 shim:wrapper 第一次运行时(装好后面板扫描状态时)创建 `~/.local/bin/omarsync`,该目录在 Omarchy 里本就在 PATH 上。已存在且不是 Omarsync 创建的同名文件不会被覆盖。

依赖:`git`、`rsync`、系统的 `node`(≥22)和 `mise`(`/usr/bin/node`、`/usr/bin/mise`),以及 `/usr/bin/gh`。只装在用户目录里的副本会被忽略。CLI 是 TypeScript 写的,打包成单个文件随仓库分发(`cli/dist/index.js`),安装即用,不需要构建。缺依赖可以让面板安装,或手动:

```sh
omarchy pkg add nodejs mise github-cli
```

## 第一次同步

1. 点状态栏云图标,点 **setup**(对应 `omarsync setup`)。它会装缺失的依赖、登录 GitHub、创建私有仓库 `omarchy-config`,并把 `mise dot` 连到该仓库的 `dotfiles` 分支。
2. 点 **push**(对应 `omarsync push`)。会弹出浮动终端:先展示这次要发布的元数据 diff 和 `mise dot diff`,**按 y 确认才上传**。元数据提交会签名:push 优先使用无密码的 `~/.ssh/id_ed25519`;否则会创建 `~/.config/omarsync/signing_key` 并在本机信任它(私钥不出本机)。文件用 `mise dot save` 存检查点,用 `mise dot sync` 发布。自动 push 定时器使用 `push --yes`,不弹终端。

命令结束后状态栏立即刷新,不需要右键扫描。打开面板本身不会扫描。

在另一台机器上:装插件 → 点 **setup** → 点 **apply**。init 会整体采用远程 mise 历史(绝不先建本地基线,所以两边历史永远能合并)。apply 会先展示改动预览、询问后才写入。带可信签名的提交可以安装缺失插件、恢复 `~/.config/omarchy/hooks`、切换主题、启动用户服务,并跑 post-apply 钩子。未签名的首次 apply 或 `apply --force` 只写配置、跳过这些可执行步骤;`--no-exec` 即使签名可信也跳过。

面板显示短 commit id。**apply** 只针对那个确切的快照运行,运行前会在终端里显示预览。

apply 覆盖任何文件之前,会把现有文件复制到 `~/.local/state/omarsync/backup/<时间戳>/`,保留最近 5 份。另外 `mise dot pull` 自己会留保护检查点,支持撤销。

新机器的详细步骤与排查方法见 [docs/NEW_MACHINE.md](docs/NEW_MACHINE.md)。

## 签名与 trust-key

push 时用哪把密钥签名,取决于本机情况:

- `~/.ssh/id_ed25519` 存在且无密码 → 用它,公钥是 `~/.ssh/id_ed25519.pub`
- 否则 → 自动创建 `~/.config/omarsync/signing_key`,公钥是 `~/.config/omarsync/signing_key.pub`

push 时终端会打印 `signing with ...`,以那个路径为准。**大多数情况下不需要手动 trust-key**:新机器首次 apply 时会提示是否信任签名者,确认即可。需要手动信任时,把上面那个 `.pub` 文件拷到新机器(U 盘、scp 均可),然后:

```sh
omarsync trust-key --pubkey ~/.config/omarsync/signing_key.pub   # 路径换成你拷过来的实际位置
```

## 状态栏

- 左键打开面板。状态下面第一组动作里有 **检查更新**,它只看差异,不同步文件。
- 中键 push(弹终端,看完 diff 按 y 确认)
- 右键立即检查。图标提示里也写了这一点。
- 面板底部的 **使用指南** 折叠区内置了中文快速操作指引(日常 push / 新机 setup→apply / 常见问题),不用翻文档

图标只有一条规则:变红表示你需要做点什么。

| 图标 | 含义 |
| --- | --- |
| 变暗的云 | 还没登录,或还没有仓库。先点 **setup**。 |
| 普通的云 | 已经同步。 |
| 红色上箭头 | 这台机器有改动,需要 push。 |
| 红色下箭头 | 远程有改动,需要 apply。 |
| 红色叹号 | 上次命令失败。提示和面板会说明原因,**查看日志** 里有细节。 |
| 转动 | 正在检查或正在 push。 |

**扫描改动**默认每小时一次。同一个菜单可设 15 分钟、30 分钟、6 小时、24 小时,或关闭定时扫描。**检查更新**或右键图标会立刻检查。自动 push 跟随 **自动 push** 间隔(分钟),`0` 为关闭;从面板开启后默认 30 分钟。同一份内容只改了修改时间(比如 Fcitx5 原地重写配置)不会被当成需要 push。

## 命令行

```sh
omarsync login
omarsync setup
omarsync init --repo owner/name
omarsync push [--yes]
omarsync trust-key --pubkey <公钥> [--privkey <私钥>]
omarsync pull
omarsync apply --commit <40位sha> [--no-packages] [--no-exec] [--force] [--trust-signer]
omarsync conflicts
omarsync migrate
omarsync status [--json]
omarsync doctor
omarsync scope-path
```

手动 `push` 先展示 diff 并要求按 y 确认。`push --yes` 只跳过这一次确认,供面板的自动推送使用。fetch 之后,远程尖端不是可信签名就拒绝变基,也不会补签名。变基或丢掉远程 scope 之后,树和已确认的不一样时,自动推送直接停下;手动 push 会再打开最终 diff,确认后才签名。`pull` 使用同一道门:远程提交不是可信签名就不检出。`migrate` 只有在当前提交已由可信密钥签名,并且终端里确认过删除 `home/` 后仍会留下的文件时,才会签名并推送;对不上就拒绝。桌面通知由 `OMARSYNC_NOTIFY=1` 开启,面板上的通知开关控制这个行为。

遇到同步冲突跑 `omarsync conflicts`:列出冲突文件并用编辑器打开审阅。

`migrate` 升级旧安装:元数据仓库里还有 `home/` 文件镜像的旧布局,改为通过 mise 发布文件并从仓库删除 `home/`(旧内容仍可从 git 历史找回)。删除前会核对当前提交的签名,列出将要留下的文件(含 post-apply 钩子)并要求再确认一次;没有可信签名、没有终端,或树在确认后又变了,都不会签名也不会推送。

## 同步哪些文件

上传哪些文件只由本机的 `~/.config/omarsync/scope` 决定,可从面板编辑。同步仓库里的同名 scope 文件会被忽略(包括 `git pull` 之后),push 时会把它从快照里移除。每台机器各管各的 scope;远程改动无法让本机开始上传新路径。

```
.config/omarchy | plugins/,*.bak.*,*-bak.*,*.mp4,*.mkv,*.webm,*.mov,*.avi,*.m4v
.config/hypr | *.bak.*,*-bak.*,monitors.lua,input.lua,envs.lua
.config/nvim
.config/btop
.config/lazygit
.config/autostart
.config/qingjian
.config/fcitx5
.local/bin | agent,cursor,cursor-agent
.local/share/applications | mimeinfo.cache
.local/share/icons/hicolor | icon-theme.cache
```

路径相对于 `$HOME`。`|` 后面是逗号分隔的排除模式,会转换为 mise 的排除 glob。不存在的路径会被跳过。删掉某行就停止跟踪该目录(mise 保留已有历史)。

**因机器而异的文件默认排除**:`~/.config/hypr` 下的 `monitors.lua`(显示器布局)、`input.lua`(触摸板/键盘)、`envs.lua`(GPU/环境变量)每台机器都不同,默认不同步;想共享就从本机 scope 里删掉对应模式。`*-bak.*` 备份和 Python 字节码缓存(`__pycache__`)也不会进快照。`~/.config/omarchy/plugins` 永远不由 mise 跟踪——即使 scope 里忘了写 `plugins/` 排除,代码里也有兜底;插件只通过签名快照同步(见下)。会包含 `.ssh`、`.config/gh`、`.config/git`、`.gnupg`、`.config/doubao-murmur`、`.var`、`.config/mise` 或 mise 状态目录、密钥文件、omarsync 信任目录的路径会被拒绝。

钩子不是 scope 条目。把可执行脚本放进 `~/.config/omarsync-hooks/post-apply.d/`。apply 会把它们复制进快照;提交可信时,文件写完后在终端里执行。`examples/hooks/10-murmur.sh` 会重新应用 Doubao Murmur 补丁,F9 读不到输入设备时用 sudo 装 udev 规则。`~/.config/doubao-murmur` 下的会话 cookie 不同步。

输入法也一样。轻简(Fcitx5)把 `.config/qingjian` 和 `.config/fcitx5` 放进 scope;`examples/hooks/20-qingjian.sh` 在可信 apply 之后启动服务,没装程序时会告诉你先安装。程序本身、大约 200 MB 的词典和已学习的词默认不同步。要带上学习记录,加上 `.local/share/qingjian | resources/,dicts/,install-manifest.json`;后一次 apply 获胜。任何 scope 路径下的 `.env`(应用放 API key 的地方)都不会同步。

## apply 的行为

- 先备份各 scope 路径下的现有文件,然后 `mise dot pull --take-remote-all` 写入远程版本。与旧的 rsync 镜像不同:被排除同步的文件(如 `*.bak.*`)在接收端**不会**被删除——mise 只写它跟踪的文件。
- apply 不会动 `~/.config/omarchy/plugins`。该目录不在跟踪范围内,omarsync 和其他已装插件都会保留。
- apply 只解析一次远程分支,分离(detach)检出那个完整 commit,并在改动任何东西之前对照 `~/.config/omarsync/trusted-keys` 检查签名。命令必须指定同一个 40 位 id。没有可信密钥的机器,首次 apply 可以使用未签名提交;提交已签名时则钉住该签名者。之后的 apply 要求可信签名。`--force` 强行应用该 commit,且不把签名密钥加进信任文件。
- 签名快照里的官方软件包用 `omarchy pkg add` 安装(走 Arch 签名仓库)。用户 Flatpak 应用按记录的 remote 安装后移动到记录的 commit;缺 Flathub 用户 remote 时自动添加。没有下载地址的 remote(如被禁用的本地源)对应的应用会跳过。AUR 包只打印名字,Omarsync 不跑 `yay`。
- 签名快照里缺失的插件会被安装:https 插件按记录的 commit 克隆检出;无远端的插件从快照复制。每个插件在移入 `~/.config/omarchy/plugins` 前都会校验。Omarsync 不安装自己的目录。`--no-exec`、未签名的首次 apply、`--force` 都会跳过这步,同时跳过主题切换、`~/.config/omarchy/hooks` 的恢复和用户服务启动。可信签名的 apply 才会做这三件事。**因机器而异的插件**:把插件 id 一行一个写进本机的 `~/.config/omarsync/plugins-skip`(`#` 为注释,文件永不上传)——名单里的插件既不导出,也不安装。
- 合并前必须看到更改:apply 会先显示自上次应用以来的提交和 diff,再显示 `mise dot pull --dry-run` 的计划,然后**必须手动输入 y** 才继续。没有终端的非交互环境一律拒绝。
- 两台机器改了同一个文件时,apply 以远程为准(`--take-remote-all`)。push 报 mise 冲突时,用 `omarsync conflicts`(列出冲突并用编辑器打开)或 `mise dot pull --take-remote-all` / `--keep-local` 解决后再 push。
- `omarsync.json` 把 push 时的 mise 历史头记为 `miseHead`(仅留档取证;接收机本地历史头合法地不同,所以不做钉死校验)。

## 权限

本插件在 Omarchy shell 里以你的用户身份非沙箱运行。自动状态和自动 push 用清空的环境和固定 PATH 启动 CLI。会话代理只在名字是 `http_proxy`、`https_proxy`、`all_proxy` 或 `no_proxy`(或对应的大写形式),且值是普通的 `http`、`https`、`socks5`、`socks5h` 或 `socks4` URL 时才会保留。这个代理只传给 `git`、`gh`、`mise` 和 post-apply 钩子。CLI 是 TypeScript([visulima](https://visulima.com) 生态)写的,打包成 `cli/dist/index.js`,由系统 `/usr/bin/node`(≥22)运行,外面包一层 bash wrapper,只从可信系统目录调用 `git`、`rsync`、`mise`、`gh` 和 Omarchy 工具。apply 可以覆盖配置、重载 Hyprland、用 sudo 装官方软件包。用户服务、`~/.config/omarchy/hooks` 和在线主题切换只在可信 apply 之后才会发生。启用前请审查仓库。

`OMARSYNC_ORIGIN` 和 `OMARSYNC_DOT_ORIGIN` 可以把 git 和 mise 指向非 GitHub 远端。那是开发用的钩子;面板流程走 GitHub。

## 卸载

```sh
omarchy plugin remove io.github.lukebest.omarsync
```

卸载插件不会删除 `~/.local/state/omarsync`、mise 跟踪配置或 GitHub 仓库。

## 开发

```sh
scripts/dev-install.sh   # 有 bun 时先打包 CLI,再复制到插件目录并重扫 shell
omarchy plugin enable io.github.lukebest.omarsync
scripts/self-test.sh
omarchy plugin validate .
qmllint -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" BarWidget.qml Panel.qml
```

`scripts/dev-install.sh` 在本机有 bun 时把 `cli/` 打包成 `dist/index.js`,再把本目录(排除 `cli/node_modules`)复制到 `~/.config/omarchy/plugins/io.github.lukebest.omarsync`。插件目录不允许符号链接,所以是真实复制。仓库里已经提交了 `cli/dist`,装好即可运行;改 CLI 源码后需要重新打包。

CLI 开发:`cd cli && bun install` 后,`bun run dev -- <args>` 直接跑源码,`bun run typecheck` 做类型检查,`bun run build` 打包。技术栈与同步流程见 [docs/TECH_STACK.md](docs/TECH_STACK.md) 与 [docs/SYNC_FLOW.md](docs/SYNC_FLOW.md)。

`scripts/self-test.sh` 是关键路径冒烟测试:CLI 可用、`status --json` 字段与面板一致(含 `dotRepo` / `dotBranch`)、`status.json` 落在临时 HOME、非交互 apply 一律拒绝、插件 id 仍是 `io.github.lukebest.omarsync`。
