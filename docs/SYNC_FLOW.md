# 同步流程草图（审阅稿）

核心思想：**用 track 模式做点对点配置同步；每台电脑推之前手动存；
拉之后先审阅再应用；本机保留决定权。**

```
                ┌─────────────────────────────┐
                │  私有 GitHub（一个仓库）       │
                │  omarchy-config  main 分支     │  包清单/插件快照/hooks/主题
                │  同一仓库的 dotfiles 分支      │  文件本体(track 模式,原地跟踪)
                └───────┬─────────────┬───────┘
                        │             │
              ┌─────────┴──┐     ┌────┴─────────┐
              │  电脑 A     │     │   电脑 B      │
              │ scope 本机  │     │  scope 本机   │  ← 各管各的,互不可改
              │ skip 本机   │     │  skip 本机    │
              └────────────┘     └──────────────┘
```

## 推（push）——推之前手动存

```
本机文件改动
   │
   ▼
omarsync push
   ├─ 1. reconcile：track 集合对齐【本机 scope】（远程永远改不了本机 track 什么）
   ├─ 2. mise dot save  ──────★ 手动存：先把当前状态显式存成检查点
   │        └─ 无变化 → 跳过；失败 → 中止,不推半成品
   ├─ 3. 采集元数据 → 签名提交 → push 元数据仓库
   │        （插件按 plugins-skip 过滤；机器相关文件不进快照）
   └─ 4. mise dot sync 发布 dotfiles 历史
          └─ 冲突 → 停下报错,由【本机】决定：
               mise dot pull --keep-local 〈我的赢〉 / --take-remote 〈它的赢〉
```

## 拉（pull）与 应用（apply）——拉之后先审阅再应用

```
omarsync pull            ← 只抓取,一个字节都不写进活配置
   ├─ fetch 元数据仓库
   ├─ 远程提交不是可信签名 → 拒绝检出(和 push 同一道门)
   └─ 可信才 detach 钉住,并 mise dot sync --fetch-only

omarsync apply --commit <40位sha>
   ├─ 1. 签名校验（trusted-keys）
   │       可信签名 → 可装插件/跑 hooks
   │       不可信   → 拒绝；或 --force 只写配置,可执行步骤全关
   ├─ 2. ★ 审阅（必须看到更改）
   │       a. git log + diff：上次应用..本次（plugins/包清单逐行 diff）
   │       b. mise dot pull --dry-run：哪些文件会被改成什么样
   ├─ 3. ★ 本机决定：手动输 y 才继续；无终端一律拒绝,没有默认答案
   ├─ 4. 备份现有文件 → mise dot pull --take-remote-all 写入
   ├─ 5. 主题/壁纸、缺失的包、缺失的插件（跳过本机 plugins-skip）、hooks
   └─ 6. 盖 applied 印章（下次审阅的 diff 基准）
```

## 冲突时——本机保留决定权

```
两台机器改了同一个文件
   ├─ 在 push 端发现：mise 暂停发布
   │     → 本机选 --keep-local（我覆盖它）或 --take-remote（我接受它）
   └─ 在 apply 端发现（本地有未保存编辑）：
         → mise 暂停整个事务,不写半个文件
         → 审阅时 dry-run 已标出,本机逐条定夺
```

## 本机决定权清单（远程永远无法越过）

| 决定 | 由谁说了算 | 存在哪 |
|---|---|---|
| 同步哪些目录 | 本机 scope（仓库里的 scope 文件直接丢弃） | `~/.config/omarsync/scope` |
| 哪些文件因机而异 | 本机 scope 排除（monitors/input/envs 默认排除） | 同上 |
| 哪些插件不同步 | 本机 plugins-skip（不导出也不安装） | `~/.config/omarsync/plugins-skip` |
| 是否应用这次合并 | 本机看完 diff 后输 y；无终端=拒绝 | 终端 |
| 信任哪个签名者 | 本机 trusted-keys（TOFU 首用即钉） | `~/.config/omarsync/trusted-keys` |
| 冲突谁赢 | 本机逐条 keep-local / take-remote | mise dot conflicts |

## 已定

1. `pull` 只抓取，`apply` 负责审阅和写入。
2. `push` 会把元数据 diff 和 `mise dot diff` 交给编辑器，并要求在终端输入 y。`push --yes` 只给面板的自动推送。
3. `omarsync conflicts` 列出 mise 冲突并用本机编辑器打开。
