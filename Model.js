.pragma library

function pathFromUrl(url) {
  var value = String(url || "")
  if (value.indexOf("file://") === 0)
    value = value.substring(7)
  try {
    value = decodeURIComponent(value)
  } catch (error) {
    // Keep the raw path when a percent-escape is malformed.
  }
  return value
}

function parseStatus(text) {
  try {
    var data = JSON.parse(String(text || ""))
    if (!data || typeof data !== "object")
      return null
    return data
  } catch (error) {
    return null
  }
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

function safeRepo(repo) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo || ""))
}

function fullCommit(value) {
  var sha = String(value || "")
  return /^[0-9a-f]{40}$/.test(sha) ? sha : ""
}

function pluginVersion(manifestText) {
  try {
    var data = JSON.parse(String(manifestText || ""))
    var version = data && data.version ? String(data.version) : ""
    if (/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(version))
      return version
  } catch (error) {
    // Ignore a manifest that is not JSON yet.
  }
  return ""
}

function shortCommit(value) {
  var sha = fullCommit(value)
  return sha === "" ? "" : sha.substring(0, 7)
}

function systemLanguage() {
  var name = ""
  try {
    name = Qt.locale().name || ""
  } catch (error) {
    name = ""
  }
  return /^zh/i.test(String(name)) ? "zh" : "en"
}

function normalizeLanguage(lang) {
  return lang === "zh" ? "zh" : "en"
}

var copy = {
  zh: {
    notLoggedIn: "未登录 GitHub",
    noRepo: "尚未设置仓库",
    checking: "正在检查状态…",
    running: "执行中…",
    notSetUp: "还没有设置同步仓库",
    dirtyAndBehind: function(n) { return "本地有改动待 push，远程还有 " + n + " 个提交待 apply" },
    dirty: "本地有改动，点 push 上传",
    behind: function(n) { return "远程有 " + n + " 个新提交，点 apply 恢复" },
    behindUntrusted: function(n) { return "远程有 " + n + " 个新提交，签名者还没信任，先信任再 apply" },
    ahead: function(n) { return n + " 个提交还没上传到远程" },
    synced: "一切已同步",
    never: "从未",
    justNow: "刚刚",
    minutesAgo: function(n) { return n + " 分钟前" },
    hoursAgo: function(n) { return n + " 小时前" },
    daysAgo: function(n) { return n + " 天前" },
    noPush: "还没有 push 过",
    lastPush: function(a) { return "上次 push：" + a.when + "，来自 " + a.host },
    unknownHost: "未知机器",
    version: function(v) { return " · 版本 " + v },
    pushOk: function(a) { return "上次结果：成功，" + a.when + " 来自 " + a.host },
    pushNever: "还没有推送过",
    signedOk: "签名可信",
    untrustedKey: "签名密钥未登记，会询问是否信任",
    unsigned: "未签名：只写配置，不装插件、不跑钩子",
    autoPushOn: function(n) { return "每 " + n + " 分钟自动上传本机改动" },
    autoPushOff: "已关闭，开启后默认每 30 分钟上传",
    changes: function(a) {
      return a.extra > 0 ? ("改动：" + a.names + " 等 " + a.extra + " 个文件") : ("改动：" + a.names)
    },
    changesMore: function(n) { return "… 共 " + n + " 个" },
    signed: function(sha) { return "已签名 " + sha },
    firstApply: function(sha) { return "首次应用 " + sha },
    otherKey: function(sha) { return "另一把密钥 " + sha },
    unsignedCommit: function(sha) { return "未签名 " + sha },
    trustSigner: "信任签名者",
    trustSignerDesc: function(fp) { return "核对指纹 " + fp + "，确认后本机以后都认它的提交" },
    trustSignerTip: "公钥从远程提交自带的签名里提取，不用手动拷贝",
    legend: "暗云：还没设置。云：已同步。红上箭头：需要 push。红下箭头：需要 apply。红叹号：上次失败。",
    viewChanges: "查看改动",
    viewChangesDesc: "用 VS Code 打开这些文件，确认无误再 push",
    setup: "初始化",
    setupConnected: "重新检查依赖、登录，以及 dotfiles 分支的连接",
    setupNeeded: "装依赖、登录 GitHub，并连接 omarchy-config 的两条分支",
    pushRunning: "push（执行中…）",
    pushDesc: "弹出终端，看完 diff 按 y 才上传，并自动签名",
    applyRunning: "apply（执行中…）",
    applyDesc: "把远程快照恢复到这台电脑，先预览再确认",
    scanRunning: "检查中…",
    scan: "检查更新",
    scanDesc: "只检查差异，不同步文件",
    scanTip: "本地有改动 → 显示 push；远程有新快照 → 显示 apply",
    openConfig: "打开配置仓库",
    openConfigDesc: "签名元数据：软件包、插件、钩子",
    openFiles: "打开文件分支",
    openFilesDesc: "同一仓库的 dotfiles 分支",
    editScope: "编辑同步范围",
    editScopeDesc: "决定哪些目录会被同步",
    viewLog: "查看日志",
    settingsHide: "收起设置",
    settings: "设置",
    scanInterval: "自动检查间隔",
    intervalOff: "关闭，手动检查",
    interval15: "每 15 分钟",
    interval30: "每 30 分钟",
    intervalHour: "每小时",
    interval6: "每 6 小时",
    interval24: "每 24 小时",
    autoPush: "自动 push",
    notify: "桌面通知",
    notifyDesc: "push 完成后弹出通知",
    helpHide: "收起指南",
    help: "使用指南",
    language: "界面语言",
    languageDesc: "向右是英文。没拨过时跟随系统。",
    helpBody: "这台电脑（日常）:\n" +
      "改完配置点 push，会弹出终端展示 diff，按 y 才上传。中键图标 = push。\n\n" +
      "新电脑（恢复）:\n" +
      "1. omarchy plugin add 装本插件\n" +
      "2. 点「初始化」（装依赖、登录 GitHub、建仓库）\n" +
      "3. 点 apply，终端里先看到全部更改，按 y 才写入\n" +
      "4. 首次会问是否信任签名密钥，选是即可\n\n" +
      "检查更新 = 只看差异，不同步文件。\n" +
      "设置里可改自动检查间隔，自动 push 可自动上传。\n\n" +
      "apply 前会自动备份到 ~/.local/state/omarsync/backup/。\n" +
      "文件没同步过来？终端跑:\n" +
      "mise dot pull --take-remote-all\n\n" +
      "完整文档：仓库里的 docs/NEW_MACHINE.md"
  },
  en: {
    notLoggedIn: "Not signed in to GitHub",
    noRepo: "No repository yet",
    checking: "Checking status…",
    running: "Working…",
    notSetUp: "Sync repository is not set up",
    dirtyAndBehind: function(n) { return "Local changes need a push, and " + n + " remote commit(s) need apply" },
    dirty: "Local changes. Push to upload them",
    behind: function(n) { return n + " new remote commit(s). Apply to restore them" },
    behindUntrusted: function(n) { return n + " new remote commit(s) from an untrusted signer. Trust them, then apply" },
    ahead: function(n) { return n + " commit(s) are not on the remote yet" },
    synced: "Everything is in sync",
    never: "never",
    justNow: "just now",
    minutesAgo: function(n) { return n + " minutes ago" },
    hoursAgo: function(n) { return n + " hours ago" },
    daysAgo: function(n) { return n + " days ago" },
    noPush: "No push yet",
    lastPush: function(a) { return "Last push: " + a.when + ", from " + a.host },
    unknownHost: "unknown machine",
    version: function(v) { return " · version " + v },
    pushOk: function(a) { return "Last result: ok, " + a.when + " from " + a.host },
    pushNever: "Nothing has been pushed yet",
    signedOk: "Signature is trusted",
    untrustedKey: "Signing key is not on file. Apply will ask before trusting it",
    unsigned: "Unsigned: configuration only, no plugins or hooks",
    autoPushOn: function(n) { return "Uploads local changes every " + n + " minutes" },
    autoPushOff: "Off. Turning it on uploads every 30 minutes",
    changes: function(a) {
      return a.extra > 0 ? ("Changes: " + a.names + " (" + a.extra + " files)") : ("Changes: " + a.names)
    },
    changesMore: function(n) { return "… " + n + " total" },
    signed: function(sha) { return "Signed " + sha },
    firstApply: function(sha) { return "First apply " + sha },
    otherKey: function(sha) { return "Different key " + sha },
    unsignedCommit: function(sha) { return "Unsigned " + sha },
    trustSigner: "Trust signer",
    trustSignerDesc: function(fp) { return "Check fingerprint " + fp + ". Once trusted, this machine accepts their commits" },
    trustSignerTip: "The public key comes from the commit's own signature — no file copying",
    legend: "Faded cloud: not set up. Cloud: up to date. Red up: push. Red down: apply. Red !: failed.",
    viewChanges: "Review changes",
    viewChangesDesc: "Open the files in VS Code, then push",
    setup: "Set up",
    setupConnected: "Check dependencies, sign-in, and the dotfiles branch again",
    setupNeeded: "Install dependencies, sign in to GitHub, and connect both branches of omarchy-config",
    pushRunning: "push (working…)",
    pushDesc: "Open a terminal, review the diff, press y to upload, and sign the commit",
    applyRunning: "apply (working…)",
    applyDesc: "Restore the remote snapshot on this machine, after a preview",
    scanRunning: "Checking…",
    scan: "Check for updates",
    scanDesc: "Look for differences. Do not sync files",
    scanTip: "Local changes show push. A newer remote snapshot shows apply",
    openConfig: "Open config branch",
    openConfigDesc: "Signed metadata: packages, plugins, hooks",
    openFiles: "Open files branch",
    openFilesDesc: "The dotfiles branch in the same repository",
    editScope: "Edit sync scope",
    editScopeDesc: "Choose which directories are synced",
    viewLog: "View log",
    settingsHide: "Hide settings",
    settings: "Settings",
    scanInterval: "Check interval",
    intervalOff: "Off, check manually",
    interval15: "Every 15 minutes",
    interval30: "Every 30 minutes",
    intervalHour: "Every hour",
    interval6: "Every 6 hours",
    interval24: "Every 24 hours",
    autoPush: "Auto push",
    notify: "Desktop notification",
    notifyDesc: "Notify when a push finishes",
    helpHide: "Hide guide",
    help: "Guide",
    language: "Language",
    languageDesc: "To the right is English. Follows the system until you change it.",
    helpBody: "This machine:\n" +
      "Push after you change configuration. A terminal shows the diff; press y to upload. Middle-click the icon to push.\n\n" +
      "A new machine:\n" +
      "1. Install this plugin with omarchy plugin add\n" +
      "2. Choose Set up (dependencies, GitHub sign-in, repository)\n" +
      "3. Run apply, read the diff in the terminal, and press y before anything is written\n" +
      "4. The first time, agree to trust the signing key\n\n" +
      "Check for updates only looks for differences.\n" +
      "Settings control the check interval. Auto push uploads on its own.\n\n" +
      "Apply backs up files to ~/.local/state/omarsync/backup/ first.\n" +
      "A file did not arrive? Run:\n" +
      "mise dot pull --take-remote-all\n\n" +
      "Full notes: docs/NEW_MACHINE.md in the repository"
  }
}

function tr(lang, key, arg) {
  var pack = copy[normalizeLanguage(lang)] || copy.en
  var value = pack[key]
  if (typeof value === "function")
    return value(arg)
  return value !== undefined ? value : key
}

function statusSentence(sync, lang) {
  lang = lang || systemLanguage()
  if (!sync || sync.initialized !== true)
    return tr(lang, "notSetUp")
  if (sync.dirty === true && (sync.behind || 0) > 0)
    return tr(lang, "dirtyAndBehind", sync.behind)
  if (sync.dirty === true)
    return tr(lang, "dirty")
  if ((sync.behind || 0) > 0 && sync.remoteSignature === "untrusted" && sync.hasTrustedKeys === true)
    return tr(lang, "behindUntrusted", sync.behind)
  if ((sync.behind || 0) > 0)
    return tr(lang, "behind", sync.behind)
  if ((sync.ahead || 0) > 0)
    return tr(lang, "ahead", sync.ahead)
  return tr(lang, "synced")
}

// One rule for the bar icon. Red means "you need to do something".
//   faded cloud          not set up or not signed in
//   normal cloud         up to date
//   red cloud-down       the remote has changes to apply
//   red cloud-up         this machine has changes to push
//   red warning          the last command failed
function iconState(sync, error) {
  var s = sync || ({})
  if (s.loggedIn !== true || s.initialized !== true)
    return { glyph: "\uf0c2", alert: false, dimmed: true, label: "not set up" }
  if (error)
    return { glyph: "\uf071", alert: true, dimmed: false, label: "last command failed" }
  if ((s.behind || 0) > 0)
    return { glyph: "\uf0ed", alert: true, dimmed: false, label: "apply needed" }
  if (s.dirty === true || (s.ahead || 0) > 0)
    return { glyph: "\uf0ee", alert: true, dimmed: false, label: "push needed" }
  return { glyph: "\uf0c2", alert: false, dimmed: false, label: "up to date" }
}

function relativeTime(iso, lang) {
  lang = lang || systemLanguage()
  if (!iso)
    return tr(lang, "never")
  var then = Date.parse(iso)
  if (isNaN(then))
    return iso
  var seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45)
    return tr(lang, "justNow")
  if (seconds < 3600)
    return tr(lang, "minutesAgo", Math.floor(seconds / 60))
  if (seconds < 86400)
    return tr(lang, "hoursAgo", Math.floor(seconds / 3600))
  return tr(lang, "daysAgo", Math.floor(seconds / 86400))
}
