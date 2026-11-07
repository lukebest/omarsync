# Omarsync 架构指南(给改代码的人)

这篇文档面向第一次接手本仓库的开发者,目标是让你在半小时内建立完整的心智模型:
**进程怎么跑起来、数据存在哪、一次 push/apply 在代码里经过哪些函数、哪些规则不能破坏。**

用户视角的操作说明看 [README.md](../README.md),同步流程草图看 [SYNC_FLOW.md](SYNC_FLOW.md),
新机恢复步骤看 [NEW_MACHINE.md](NEW_MACHINE.md),选型历史看 [TECH_STACK.md](TECH_STACK.md)。

---

## 1. 一分钟理解这个项目

Omarsync 是 [Omarchy](https://omarchy.org) 桌面环境的**点对点配置同步插件**,由两层组成:

- **QML 状态栏小部件**(Hyprland/Quickshell 面板上的云图标):负责展示状态、提供按钮。
- **TypeScript CLI**(`omarsync` 命令):全部业务逻辑所在,面板只是它的一个图形前端。

核心思想(也是所有设计决策的源头):

> **track 模式做点对点同步;推之前手动存检查点,拉之后先审阅再应用,本机永远保留决定权。**

它不自己实现文件同步——文件传输交给 [mise dot](https://mise.jdx.dev),
Omarsync 自己负责 mise 管不了的部分:软件包清单、shell 插件、钩子、主题壁纸,以及**签名信任链**。

### 1.1 一个私有仓库,两条分支

| 分支 | 内容 | 谁写入 | 是否签名 |
|---|---|---|---|
| `main` | 元数据:包清单、`plugins.json`、钩子、主题壁纸、`omarsync.json` | Omarsync 构造提交 | **每个提交都 SSH 签名** |
| `dotfiles` | 配置文件本体(mise 的历史,`home/` 前缀) | mise + Omarsync 选择性构树 | 不签名,由 main 里的 `miseHead` 树哈希钉住 |

两条分支**永不合并**。`main` 的签名提交里用 `omarsync.json.miseHead`(一棵 git tree 的 40 位哈希)
精确钉住本次快照对应的 dotfiles 树——接收机只认这棵树,从不跟随可变的 dotfiles 分支尖端。

---

## 2. 全景架构

```
┌──────────────────────────────────────────────────────────────────────┐
│ QML 层(Quickshell 面板,无业务逻辑)                                    │
│  BarWidget.qml  状态栏图标 + 进程生命周期 + 定时扫描                     │
│  Panel.qml      弹出菜单(按钮就是 CLI 子命令名)                         │
│  Model.js       纯函数库:status --json 解析、图标状态机、中英文案          │
└───────────────┬──────────────────────────────────┬───────────────────┘
                │ 只读轮询:omarsync status --json   │ 交互动作:浮动终端跑 omarsync <子命令>
                ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│ bin/omarsync(bash 薄 wrapper,安全边界)                                │
│  ① env -i 清洗环境后自我 re-exec  ② 写命令 flock 持锁  ③ PATH shim 自愈 │
└───────────────────────────────┬──────────────────────────────────────┘
                                ▼ /usr/bin/node(必须系统目录、不可写)
┌──────────────────────────────────────────────────────────────────────┐
│ cli/dist/index.js(ESM 单文件,packem 打包,源码在 cli/src)               │
│                                                                       │
│  index.ts            cerebro CLI 框架,13 个子命令的声明与参数解析        │
│  commands/*.ts       每个子命令一个文件,只做编排                        │
│  lib/*.ts             可复用能力:git/mise 封装、信任链、选择计划、构树…  │
└───────┬───────────────┬───────────────┬───────────────┬──────────────┘
        ▼               ▼               ▼               ▼
      git             mise            gh/rsync      omarchy/code/hyprctl
 (元数据仓库+      (文件同步的实际       (GitHub 建库     (包/主题/编辑器/
  mise 裸仓库)       传输与历史)          与登录)         桌面重载)
```

调用方向永远自上而下:**QML 不碰 git/mise,lib 不依赖 QML,commands 不直接 spawn 进程**
(进程都经 `lib/exec.ts` 的可信封装)。

---

## 3. 目录地图

### 3.1 仓库根目录(插件本体)

| 路径 | 职责 |
|---|---|
| `manifest.json` | Omarchy 插件清单:id `io.github.lukebest.omarsync`、面板 schema(扫描间隔、自动 push、通知、语言) |
| `BarWidget.qml` | 状态栏 widget:构造可信环境、跑 `status --json`、管图标与两个 Process(状态轮询 / 自动 push) |
| `Panel.qml` | 弹出面板:按钮菜单,触发时回调 `BarWidget` 上的同名函数(`setup`/`pushNow`/`apply`…) |
| `Model.js` | QML 侧唯一的逻辑文件:JSON 解析、`iconState()` 图标状态机、i18n 文案表 |
| `bin/omarsync` | bash wrapper,见 [§7 安全边界](#7-安全边界) |
| `lib/proxy.sh` | wrapper 用的代理变量白名单,与 `cli/src/lib/proxy.ts` 规则一致 |
| `omarsync.scope.example` | scope 模板,首次运行复制到 `~/.config/omarsync/scope` |
| `examples/hooks/` | post-apply 钩子示例(输入法、Murmur 补丁) |
| `scripts/dev-install.sh` | 本地开发:打包并复制到 `~/.config/omarchy/plugins/...` |
| `scripts/self-test.sh` | 关键路径冒烟测试(临时 HOME,不碰真实配置) |

### 3.2 `cli/src/commands/` —— 13 个子命令

| 命令 | 文件 | 一句话 |
|---|---|---|
| `status` | status.ts | 聚合全部状态,`--json` 是面板的**数据契约**,同时落盘 `status.json` |
| `push` | push.ts | 最复杂的编排:选择清单 → 选择性构树 → 签名 → 两分支原子推送 |
| `pull` | pull.ts | 只抓取 + 验签 + detached 钉住,**一个字节都不写活配置** |
| `apply` | apply.ts(薄) → lib/apply.ts(厚) | 审阅确认后把快照写入本机 |
| `init` | init.ts | 建/连元数据仓库与 dotfiles 分支;新机先 adopt 远程历史 |
| `setup` | setup.ts | 一键引导:装依赖 → login → init |
| `login` | login.ts | `gh auth login` 浏览器流程 |
| `trust-key` | trust.ts | 手工把 SSH 公钥加入 trusted-keys |
| `repair-remote` | repair-remote.ts | 审阅不可信的远程尖端,补一个**树不变**的签名提交 |
| `migrate` | migrate.ts | 旧布局迁移:删除元数据里的 `home/` 镜像,改走 mise |
| `conflicts` | conflicts.ts | 列出 mise 冲突并用编辑器打开 |
| `doctor` | doctor.ts | 依赖体检 |
| `scope-path` | index.ts 内联 | 打印本机 scope 路径,不存在则从示例复制 |

### 3.3 `cli/src/lib/` —— 能力模块(按主题分组)

**外部进程边界**

| 模块 | 职责 |
|---|---|
| `exec.ts` | 唯一的 `spawnSync` 出口。工具只从 `TRUSTED_DIRS`(`/usr/bin` 等)解析,`capture`/`run` 用白名单环境 |
| `git.ts` | git 薄封装;**每次调用强制带** `core.hooksPath=/dev/null`(禁钩子)和 `gpg.ssh.program=ssh-keygen` |
| `mise.ts` | `mise dot` 全量子进程封装(track/save/sync/pull/rollback/history),以及直接读 mise 裸仓库的 plumbing 助手 |
| `gh.ts` | GitHub CLI 封装,未安装/未登录只影响 GitHub 流程 |
| `omarchy.ts` | omarchy/rsync 封装、插件 id、dotfiles 分支名(`dotfiles`)、git 身份、桌面通知 |
| `proxy.ts` | 代理变量白名单(只允许 http/https/socks URL),与 `lib/proxy.sh` 同规则 |

**同步内核**

| 模块 | 职责 |
|---|---|
| `scope.ts` | scope 解析、**路径安全校验**(`assertSafeRel`)、scope→mise 跟踪集合的幂等对齐(`reconcile`) |
| `push-ignore.ts` | 本机双向忽略清单解析(路径/`plugin:`/`package:` 三种语法) |
| `selection.ts` | 对比远程签名快照与本机快照,生成 `SelectionPlan` 和可编辑的选择清单文件 |
| `selective-push.ts` | **选择性发布的核心**:用纯 git plumbing(read-tree/update-index/write-tree/commit-tree)以远程树为 base 构造"只含勾选项"的新树 |
| `meta.ts` | 元数据采集(主题/包/插件/钩子)、选择性合并进镜像、`mirrorDirty()` 脏判定 |
| `apply.ts` | apply 全编排:备份、按签名 `miseHead` 回滚、主题/包/插件/服务/钩子 |
| `ignored-files.ts` | apply 期间对 push-ignore 路径的 stash/restore |
| `hooks.ts` | post-apply 钩子导出与执行、用户 systemd 服务刷新 |
| `packages.ts` | pacman/AUR/Flatpak 清单导出与安装(Flatpak 钉 commit) |
| `plugins.ts` | shell 插件快照(https 插件钉 commit、无远端插件整体复制)、安装与校验、`plugins-skip` |

**信任与交互**

| 模块 | 职责 |
|---|---|
| `trust.ts` | SSH 签名/验签、trusted-keys、TOFU 首次应用、签名密钥选择、`signReviewedTip` |
| `diff-review.ts` | 统一差异审阅:VS Code 原生左右 Diff Editor(内联 difftool 定义,不依赖 git 版本) |
| `editor.ts` | 无图形环境的兜底:用 `$OMARSYNC_EDITOR`/`code` 打开文本 .diff |
| `paths.ts` | 全部本机路径常量 + `KEY=VALUE` 配置读写 |
| `log.ts` | 日志(`log.info/warn`、`die` 致命退出、`readTextFile`) |
| `util.ts` | TTY 确认、主机名清洗、ISO 时间戳、配置写入 |

---

## 4. 数据布局

### 4.1 本机三个存储位置

```
~/.config/omarsync/                  ← 本机策略,全部永不上传(scope.ts 的 BANNED_PATHS 兜底)
  config                             # KEY=VALUE:REPO / BRANCH / SIGNING_KEY / SIGNING_EMAIL
  scope                              # 同步哪些目录(唯一事实来源,仓库里的同名文件会被丢弃)
  push-ignore                        # 双向忽略:本机不发布,apply 也不覆盖
  plugins-skip                       # 因机而异、永不导出/安装的插件 id
  trusted-keys                       # git allowedSigners 格式,一行一把信任公钥
  signing_key[.pub]                  # 自动生成的专用签名密钥(无可用 ~/.ssh 密钥时)

~/.local/state/omarsync/
  repo/                              # ① 元数据镜像:main 分支的本地裸工作仓库(git)
  backup/<时间戳>/                    # apply 覆盖前的整树备份,保留最近 5 份
  applied                            # 上次应用的 40 位 sha(下次审阅 diff 的基准)
  omarsync.lock                      # 写操作的 flock
  status.json                        # 最近一次 status --json 的落盘
  last.log                           # 面板"查看日志"打开的文件
  pending-push.selection             # push 选择清单(临时,可删)
  pending-push.diff / pending-apply.diff / repair-remote.diff  # 文本审阅兜底

~/.local/state/mise/history/
  repo.git                           # ② mise 的裸仓库:dotfiles 分支的本地对象库
  sync.json                          # mise 记录的 upstream_commit(upstreamSnapshot 读它)
```

另外,桌面**活的**主题状态在 `~/.local/state/omarchy/current/`(注意是 omarchy 不是 omarsync),
镜像里对应的快照是 `<repo>/current/`。

### 4.2 远程 `main` 分支(签名元数据)的布局

```
omarsync.json            # schemaVersion 2;host / pushedAt / miseHead(钉住的 dotfiles 树哈希)
plugins.json             # 插件记录数组(https 插件带 commit;local=true 的实体在 plugins-local/)
plugins-local/<id>/      # 无远端插件的完整快照(可执行代码,只走签名通道)
packages/pacman.txt      # 显式安装的官方包
packages/aur.txt         # AUR 包(只记录,不自动安装)
packages/flatpak.txt     # 每行 app<TAB>remote<TAB>commit,安装后移到钉住的 commit
hooks/post-apply.d/*     # apply 末尾执行的钩子脚本
current/theme.name       # 主题名
current/background       # 壁纸指针:rel:/theme:/abs: 三种格式
```

### 4.3 远程 `dotfiles` 分支(mise 历史)的布局

```
home/<相对 $HOME 的路径>...        # 配置文件本体
.mise-history/manifest.json        # mise 的清单:enrollment(跟踪根)/ exclude(glob)/ permissions
```

Omarsync 在 mise 裸仓库里还维护三个内部 ref(`selective-push.ts`):

| ref | 含义 |
|---|---|
| `refs/omarsync/remote-dotfiles` | fetch 下来的远程 dotfiles 尖端 |
| `refs/omarsync/dotfiles-tip` | 本机构造出的待发布提交(shadow) |
| `refs/omarsync/dotfiles-publish` | 导入元数据镜像、供 atomic push 用的同一提交 |

---

## 5. 核心机制

### 5.1 push:一次选择性发布的完整链路

入口 `commands/push.ts` 的 `executePush()`,步骤与函数对应:

```
1. 确定远程基线
   refreshRemoteMain()            fetch main,requireTrustedRemoteTip() 验签,
                                  本机镜像 reset --hard 到远程基线(丢弃未发布的本地镜像)
2. 对齐跟踪集合
   ensurePushIgnore() + reconcile(scope)   scope/push-ignore → mise track/exclude,幂等
3. 存本机检查点
   mise.save()                    "推之前手动存";headSnapshot() 拿到本机树哈希 localTree
4. 生成候选与选择清单
   createPlan()(selection.ts)    对比远程签名树 vs 本机树:文件/插件/钩子/包组/主题
   writeSelectionFile()           写 pending-push.selection 并在编辑器打开
   readSelectionFile()            读回勾选结果;格式损坏直接中止
5. 构造两棵新树
   buildSelectedDotfiles()        dotfiles 树:read-tree 远程树 → 只 update-index 勾选项
                                  → 合并 manifest(exclude 取并集)→ write-tree → commit-tree
   collectSelectedInto()          元数据工作区:未勾选项保持 HEAD,勾选的包组取并集
   git add -A → 仅 pushedAt 变化时 discardTimestampOnlyChange() 还原
6. 审阅(VS Code Diff Editor,无 code 回退文本 .diff)
   reviewPushDiff()               元数据 --cached diff + dotfiles 两树 diff,逐文件左右对比
7. 签名与原子推送
   git commit -S                  元数据 SSH 签名提交
   reviewMergedTree()             若合并改写了已审阅的树,要求重审;自动 push 直接放弃
   signReviewedTip()              树未被信任时补一个树不变的签名提交
   importDotfilesCommit()         把 dotfiles 提交搬进元数据镜像的对象库
   git push --atomic              一次推送更新 main + dotfiles,均带 --force-with-lease
```

**为什么需要自己用 plumbing 构树?** 两台机器的 scope 不同,各自的 mise 树是"本机全量"。
直接推送本机树会把别人的文件删掉。以**远程树为 base、只覆盖勾选路径**构造出的树,
才能让"未勾选/ignored 的路径保持远程版本"。

**为什么 manifest 的 exclude 要做并集?** mise 对 `exclude` 字段只做整字段三方合并,
两台机器各加过规则且不相等就报 `enrollment conflict in exclusions`。
发布端预先并集后,接收端相对共同祖先只有一侧变化,合并永远可解
(应急流程见 README 故障排查章节)。push-ignore 派生的规则只留本机,不进并集。

`push --yes`(面板自动推送)跳过清单与编辑器,默认发布新增/修改、保留删除项。

### 5.2 pull 与 apply:先审阅,后写入

**`pull`(commands/pull.ts,故意做得很薄)**

1. `resolveRemoteSha()` fetch 并解析远程 main 尖端;
2. `requireTrustedRemoteTip()` —— 不可信就拒绝,不可信内容进不了工作区;
3. `checkoutPinnedCommit()` detached HEAD 钉住确切 sha(分支再移动也不影响本次读取);
4. `mise.sync(true)` 只 fetch dotfiles,不写活文件。

**`apply`(commands/apply.ts → lib/apply.ts)**

```
1. 三道签名门(trust.ts)
   commitIsTrusted()               可信 → withExec=true,允许全部动作
   firstApplyAvailable()           无信任密钥且首次 → TOFU,钉住签名者;只写配置
   confirm/--force                 其他不可信情况 → force 模式,插件/钩子/主题/服务全关
2. detach 钉住 --commit 指定的 sha(必须等于当前远程尖端,防你应用过时快照)
3. 强制审阅
   showChanges()                   元数据 diff(VS Code Diff Editor)+ 终端 log/stat
   previewApply()                  mise rollback --dry-run 的文件计划
   confirm()                       必须 TTY 手动输 y;无终端一律 die
4. applyMirror() 写入
   backupTree()                    按 scope rsync 整树备份
   stashIgnoredPaths()             push-ignore 文件先收走
   syncDotfiles()                  按 omarsync.json 的签名 miseHead 找 commit → rollback
   applyCurrent()                  主题/壁纸(可信才跑 omarchy theme set)
   installMissingPackages/Plugins  包与插件(插件逐个校验,跳过 plugins-skip)
   refreshUserServices/runHooks    用户服务与 post-apply 钩子(仅 withExec)
   restoreIgnoredPaths()           恢复本机 ignored 文件
5. markApplied(sha)                盖印章,作为下次 showChanges 的 diff 基准
```

`syncDotfiles()` 有一道关键防线:签名快照不在本机 mise 索引时,
**只有远程 dotfiles 尖端与签名树是同一棵树**才允许导入,否则拒绝——
dotfiles 分支任何人都能推,绝不能拿可变尖端去覆盖文件后再执行钩子。

### 5.3 信任链如何落地

- **签名**:`git commit -S`,SSH ed25519。密钥选择顺序(`ensurePushSigner`):
  配置的 `SIGNING_KEY` → 无密码的 `~/.ssh/id_ed25519` → 自动生成的 `signing_key`。私钥不出本机。
- **验签**:`git verify-commit` 配合临时 allowedSigners 文件;信任名单只存在本机
  `~/.config/omarsync/trusted-keys`,**绝不从同步仓库读取**,且禁止位于镜像目录内。
- **TOFU**:没有任何信任密钥的机器首次 apply 可以接受未签名提交,
  但只要提交带签名就把签名者钉住;之后别的密钥签的提交一律拒绝。
- **可执行内容门**:插件安装、钩子执行、在线主题切换、用户服务启动都要求 `withExec`,
  即快照必须通过可信签名。配置文件写入不受限(`--force` 也能恢复配置)。
- **repair-remote**:远程尖端不可信时的人工补签通道——人审完整 diff 后,
  只追加一个树不变的签名提交,不检出未验证内容、不移动本地待推送提交。

### 5.4 本机决定权的四道闸门

| 闸门 | 文件 | 代码位置 |
|---|---|---|
| 同步哪些目录 | `scope`(只信本机,远程同名文件 `discardRemoteScope` 丢弃) | `scope.ts` |
| 永久忽略什么 | `push-ignore`(双向)、`plugins-skip` | `push-ignore.ts`、`plugins.ts` |
| 本次发布什么 | `pending-push.selection` 勾选;删除项默认不选 | `selection.ts` |
| 是否应用快照 | TTY 输 y;无终端直接拒绝 | `commands/apply.ts` |

`scope.ts` 的 `assertSafeRel()` 是安全底座:拒绝绝对路径/`..`/通配符/秘密目录
(`.ssh`、`.gnupg`、`.config/git`、`.var`…)/凭证文件名/插件目录
(插件含可执行代码,只能走签名元数据通道)。`selective-push.ts` 的 `validateTree()`
在构树后对整棵树再扫一遍同样的规则,作为第二道闸。

### 5.5 status:面板图标背后的状态机

`commands/status.ts` 聚合出一个固定 schema 的 JSON(字段见文件里的 `Status` 接口),
**这是 QML 与 CLI 的契约,字段只能加不能随意改/删**。面板侧 `Model.js` 的 `iconState()` 用它决定图标:

```
未登录或未初始化        → 变暗的云
有 error / 上次失败      → 红色叹号
behind > 0(远程有新提交) → 红色下箭头(apply)
dirty 或 ahead > 0      → 红色上箭头(push)
其他                    → 普通云(已同步)
```

两个关键判定:

- `dirty = mirrorDirty() || miseDirty()`:前者重新导出一份元数据与镜像逐字节比较
  (JSON 先做**键序规范化**,纯键序差异不算脏);后者只读 mise 的 unsaved 列表。
  **status 是只读命令,绝不调用 `mise save`**——否则定时扫描会偷偷消费你的改动。
- `behind/ahead` 按 **tree 哈希**而非 commit 计数:补签名/空提交改变 sha 但树不变,
  不算有待 apply/push 的内容(`readCounts`)。

---

## 6. QML 面板与 CLI 的契约

- **面板按钮名就是子命令名**:`setup` / `push` / `apply` / `conflicts`…
  `Panel.qml` 只负责发 `callHost("pushNow")` 之类的回调,实际函数在 `BarWidget.qml`。
- 两类进程:
  - **只读轮询**:`statusProcess` 跑 `omarsync status --json`,带 120s 超时;
    QML 自己也构造一份白名单环境(`trustedEnvironment`),与 wrapper 的清洗规则对齐。
  - **交互动作**:`runInTerminal()` 调 `omarchy-launch-floating-terminal-with-presentation`
    开浮动终端跑完整命令(需要看 diff、输 y)。唯一例外是自动 push,直接后台跑 `push --yes`。
- 文案/i18n 全部集中在 `Model.js` 的 `copy.zh` / `copy.en`,QML 组件里不写死字符串。
- 改 QML 后用 `qmllint -I "${OMARCHY_PATH:-/usr/share/omarchy}/shell" BarWidget.qml Panel.qml` 校验。

---

## 7. 安全边界

威胁模型:面板/定时器在清洗过的环境里自动执行,同步内容来自可能不可信的远程仓库。

1. **环境清洗**:`bin/omarsync` 首次执行先校验 `HOME`,然后 `env -i` 白名单重 exec 自己
   (`OMARSYNC_SANITIZED=1` 防循环);`LD_PRELOAD`/`PYTHONPATH`/`NODE_OPTIONS`/`GIT_*` 等注入面全部 unset。
2. **可信 PATH**:`PATH=/usr/bin:/bin:/usr/sbin:/usr/share/omarchy/bin`;
   `exec.ts` 的 `resolveTool()` 只接受这些目录里的常规可执行文件,挡住 PATH 投毒影子二进制。
   node 本身也必须来自不可写的系统目录。
3. **进程锁**:`push/pull/apply/migrate/repair-remote` 经 `flock -n` 持锁到进程结束;
   status 探测到持锁会置 `running=true` 而不是并发执行。
4. **禁交互劫持**:`GIT_TERMINAL_PROMPT=0`、`GIT_EDITOR=/usr/bin/true`、`GH_PROMPT_DISABLED=1`。
5. **git 加固**:每次调用禁 hooks(`core.hooksPath=/dev/null`)、指定 ssh-keygen 为签名程序。
6. **代理白名单**:仅保留名字和值都合法的代理变量,且只透传给 git/gh/mise/钩子。
7. **GUI 变量透传**:wrapper 与 `exec.ts` 都显式放行 `WAYLAND_DISPLAY`/`DISPLAY`/
   `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS` 等,否则 VS Code 等 Electron 程序在精简环境起不来。
8. **shim 自愈**:wrapper 顺手维护 `~/.local/bin/omarsync`,只更新自己格式的 shim,
   绝不覆盖用户同名文件。

---

## 8. 构建、测试与分发

```
cli/
  package.json          # type: module;运行时依赖 @visulima/*,全部打进产物
  packem.config.ts      # esbuild transformer;resolveExternals 把依赖打进单文件
  src/                  # TypeScript 源码(ESM)
  dist/index.js         # 打包产物,★ 提交进仓库 ★:插件装机即用,用户机器不装 npm 依赖
  dist/packem_chunks/   # tabular/interact 拆出的块(插件市场单文件限 512 KiB)
  scripts/wrap-help.mjs # 后处理:帮助文本包装
  scripts/split-large.mjs # 后处理:超大块拆分
```

常用命令:

```sh
cd cli && bun install
bun run dev -- <args>     # 直接跑源码
bun run typecheck         # tsc --noEmit,提交前必跑
bun run build             # 重新生成 dist/(改了 src 必须重新 build 并一起提交)
../scripts/self-test.sh   # 冒烟:CLI 可跑、status JSON 字段齐全、非交互 apply 被拒、插件 id 不变
../scripts/dev-install.sh # 打包并真实复制到 ~/.config/omarchy/plugins/ 下联调面板
```

代码约定(见 CLAUDE.md):ESM 风格;CLI 输出、注释、提交信息用中文。

---

## 9. "我要改 X,从哪下手"

| 需求 | 入口 | 注意 |
|---|---|---|
| 加/改一个子命令 | `index.ts` 声明 + `commands/` 实现 | 编排放 command,复用逻辑放 lib |
| 改同步范围/禁用路径 | `lib/scope.ts` + `omarsync.scope.example` | 新秘密路径同时加 `BANNED_PATHS` |
| 改选择清单格式 | `lib/selection.ts` 的 write/read | 格式必须双向兼容,损坏要 die |
| 改选择性发布规则 | `lib/selective-push.ts` | 别动"远程树为 base"的前提 |
| 改签名/信任策略 | `lib/trust.ts` | 先读 [§5.3](#53-信任链如何落地) |
| 改 diff 审阅体验 | `lib/diff-review.ts`(UI)、`lib/editor.ts`(兜底) | 无头环境必须有文本兜底 |
| 加一类新元数据 | `meta.ts` 采集 → `selection.ts` 出候选 → `apply.ts` 消费 | 三处一起改,漏一处状态灯会假亮/假灭 |
| 改 status 输出 | `commands/status.ts` + `Model.js` 一起改 | QML 契约;`self-test.sh` 有字段断言 |
| 改图标/文案 | `Model.js`(状态机与 i18n)、`Panel.qml`/`BarWidget.qml` | 中英文案都要补 |
| 改 wrapper 环境 | `bin/omarsync` + `lib/exec.ts` + `BarWidget.qml` 三处白名单保持一致 | |

---

## 10. 不能破坏的不变量

修改任何代码前先过一遍这份清单,它们是整个设计的承重结构:

1. **远程 main 的每个提交在拉取/变基/补签前必须通过可信签名门**(`requireTrustedRemoteTip`)。
2. **apply 只恢复签名 `omarsync.json.miseHead` 钉住的树,永不跟随 dotfiles 分支尖端**。
3. **无 TTY 不应用任何快照**;`push --yes` 是唯一跳过交互的路径,且只发布新增/修改。
4. **scope 只信本机这份**;仓库里的 scope 必须丢弃,远程内容无法让本机开始跟踪新路径。
5. **可执行代码(插件、钩子)只走签名元数据通道**,scope 永远不能命名插件目录。
6. **选择性发布以远程树为 base**,未勾选与 push-ignore 的路径保持远程版本。
7. **main 与 dotfiles 必须 `--atomic` 同推**,且都带 `--force-with-lease`;远程在审阅期间前进就中止。
8. **status 只读**:不 save、不 checkout、不写活配置;写操作才允许持锁。
9. **所有子进程走 `exec.ts`/`git.ts`/`mise.ts` 封装**,不得在业务代码里直接 spawn 或信任 PATH。
10. **改 `cli/src` 必须重新 build 并提交 `cli/dist`**,装机运行的是 dist 不是 src。
