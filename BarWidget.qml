import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "io.github.lukebest.omarsync"

  readonly property string cliPath: Model.pathFromUrl(Qt.resolvedUrl("bin/omarsync"))
  readonly property string manifestPath: Model.pathFromUrl(Qt.resolvedUrl("manifest.json"))
  property string version: ""
  // bin/omarsync 是可执行 wrapper(自带 shebang 和环境清洗),直接执行即可
  readonly property string trustedShell: ""
  readonly property int outputLimit: 65536
  readonly property int statusDeadlineMs: 120000
  readonly property int pushDeadlineMs: 300000
  property var status: ({})
  property bool statusReady: false
  property bool statusAborted: false
  property string statusError: ""
  property int rememberedAutoMin: 30
  readonly property bool busy: statusProcess.running || pushProcess.running || status.running === true

  function trustedEnvironment() {
    var env = {
      "HOME": Quickshell.env("HOME") || "",
      "PATH": "/usr/bin:/bin:/usr/sbin:/usr/share/omarchy/bin",
      "LANG": "C.UTF-8",
      "LC_ALL": "C.UTF-8",
      "OMARCHY_PATH": "/usr/share/omarchy",
      "OMARSYNC_NOTIFY": root.settingBool("notify", true) ? "1" : "0"
    }
    var names = [
      "http_proxy", "https_proxy", "all_proxy", "no_proxy",
      "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"
    ]
    var i, value
    for (i = 0; i < names.length; i++) {
      value = Quickshell.env(names[i]) || ""
      if (value !== "")
        env[names[i]] = value
    }
    return env
  }

  function boundedText(value) {
    var text = String(value || "")
    if (text.length > root.outputLimit)
      return text.substring(0, root.outputLimit)
    return text
  }

  function armProcess(proc) {
    proc.clearEnvironment = true
    proc.environment = root.trustedEnvironment()
  }

  function trustedCommand(args) {
    var command = []
    if (root.trustedShell !== "")
      command.push(root.trustedShell)
    command.push(root.cliPath)
    var index
    for (index = 0; index < args.length; index++)
      command.push(String(args[index]))
    return command
  }

  function expireProcess(proc, message) {
    if (!proc.running)
      return
    if (proc === statusProcess)
      root.statusAborted = true
    root.statusError = message
    proc.signal(15)
    Qt.callLater(function() {
      if (proc.running)
        proc.signal(9)
    })
  }
  readonly property bool dirty: status.dirty === true
  readonly property var icon: Model.iconState(root.status, root.statusError)

  onBusyChanged: if (!busy) button.textRotation = 0

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true
    : false

  function open() {
    if (panelLoader.item)
      panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item)
      panelLoader.item.close()
  }

  function toggle() {
    if (panelLoader.item)
      panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item)
      panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target)
      return
    if ("bar" in target)
      target.bar = root.bar
    if ("settings" in target)
      target.settings = root.settings
    if ("anchorItem" in target)
      target.anchorItem = button
    if ("hostWidget" in target)
      target.hostWidget = root
  }

  function settingInt(name, fallback) {
    var value = root.setting(name, fallback)
    var parsed = parseInt(value, 10)
    return isNaN(parsed) ? fallback : parsed
  }

  function settingBool(name, fallback) {
    var value = root.setting(name, fallback)
    if (value === undefined || value === null || value === "")
      return fallback
    return value === true || value === "true"
  }

  function persistSettings(values) {
    var entry = { id: root.moduleName }
    var existing
    for (existing in root.settings) {
      if (existing !== "id")
        entry[existing] = root.settings[existing]
    }
    var key
    for (key in values)
      entry[key] = values[key]
    root.settings = entry
    if (panelLoader.item && "settings" in panelLoader.item)
      panelLoader.item.settings = entry
    if (root.bar && root.bar.shell && typeof root.bar.shell.updateEntryInline === "function")
      root.bar.shell.updateEntryInline(root.moduleName, entry)
  }

  function applyStatus(text) {
    if (root.statusAborted) {
      root.statusAborted = false
      return
    }
    var parsed = Model.parseStatus(root.boundedText(text))
    if (!parsed) {
      root.statusError = "Could not read omarsync status"
      return
    }
    root.status = parsed
    root.statusReady = true
    root.statusError = parsed.error || ""
  }

  function refreshStatus() {
    if (statusProcess.running || root.cliPath === "")
      return
    var home = Quickshell.env("HOME") || ""
    if (home === "")
      return
    root.statusAborted = false
    root.armProcess(statusProcess)
    statusProcess.command = root.trustedCommand(["status", "--json"])
    statusDeadline.restart()
    statusProcess.running = true
  }

  // 手动 push:必须亲眼看到 diff 再确认,所以一律弹浮动终端
  function pushNow() {
    if (root.cliPath === "")
      return
    root.runInTerminal(root.quotedCli() + " push")
  }

  // 自动 push(设置里开启):非交互,跳过确认
  function autoPushNow() {
    if (pushProcess.running || root.cliPath === "")
      return
    var home = Quickshell.env("HOME") || ""
    if (home === "")
      return
    root.armProcess(pushProcess)
    pushProcess.command = root.trustedCommand(["push", "--yes"])
    pushDeadline.restart()
    pushProcess.running = true
  }

  function runInTerminal(shellCommand) {
    if (!root.bar || typeof root.bar.run !== "function")
      return
    root.bar.run("omarchy-launch-floating-terminal-with-presentation " + Model.shellQuote(shellCommand))
  }

  function quotedCli() {
    return Model.shellQuote(root.cliPath)
  }

  function installGh() {
    root.runInTerminal("omarchy pkg add github-cli")
  }

  function login() {
    root.runInTerminal(root.quotedCli() + " login")
  }

  function setup() {
    root.runInTerminal(root.quotedCli() + " setup")
  }

  function viewLog() {
    var home = Quickshell.env("HOME") || ""
    if (!root.bar || typeof root.bar.run !== "function" || home === "")
      return
    root.bar.run("omarchy-launch-editor " + Model.shellQuote(home + "/.local/state/omarsync/last.log"))
  }

  function pullAndApply() {
    var sha = Model.fullCommit(root.status.remoteCommit)
    if (sha === "")
      return
    root.runInTerminal(root.quotedCli() + " apply --commit " + sha)
  }

  // 信任远程提交的签名者:公钥从提交自带的 gpgsig 里提取,终端里核对指纹确认即可
  function trustRemoteSigner() {
    var sha = Model.fullCommit(root.status.remoteCommit)
    if (sha === "")
      return
    root.runInTerminal(root.quotedCli() + " trust-signer --commit " + sha)
  }

  function openGitHubRepo(repo) {
    if (!Model.safeRepo(repo) || !root.bar || typeof root.bar.run !== "function")
      return
    root.bar.run("xdg-open " + Model.shellQuote("https://github.com/" + repo))
  }

  function openRepo() {
    root.openGitHubRepo(root.status.repo)
  }

  function openDotRepo() {
    var repo = root.status.dotRepo
    var branch = String(root.status.dotBranch || "dotfiles")
    if (!Model.safeRepo(repo) || !/^[A-Za-z0-9._-]+$/.test(branch))
      return
    if (!root.bar || typeof root.bar.run !== "function")
      return
    root.bar.run("xdg-open " + Model.shellQuote("https://github.com/" + repo + "/tree/" + branch))
  }

  function changedFiles() {
    var files = root.status && root.status.changedFiles ? root.status.changedFiles : []
    return files.length ? files : []
  }

  function openChanges() {
    var home = Quickshell.env("HOME") || ""
    var files = root.changedFiles()
    if (!root.bar || typeof root.bar.run !== "function" || home === "" || files.length === 0)
      return
    var parts = []
    var limit = Math.min(files.length, 10)
    for (var i = 0; i < limit; i++)
      parts.push(Model.shellQuote(home + "/" + String(files[i])))
    root.bar.run("code " + parts.join(" "))
  }

  function editScope() {
    var home = Quickshell.env("HOME") || ""
    if (!root.bar || typeof root.bar.run !== "function")
      return
    root.bar.run("omarchy-launch-editor " + Model.shellQuote(home + "/.config/omarsync/scope"))
  }

  function toggleAutoPush() {
    var current = root.settingInt("autoPushIntervalMin", 0)
    if (current > 0) {
      root.rememberedAutoMin = current
      root.persistSettings({ autoPushIntervalMin: 0 })
    } else {
      var restored = root.rememberedAutoMin > 0 ? root.rememberedAutoMin : 30
      root.persistSettings({ autoPushIntervalMin: restored })
    }
  }

  function toggleNotify() {
    root.persistSettings({ notify: !root.settingBool("notify", true) })
  }

  function setScanInterval(seconds) {
    var next = parseInt(seconds, 10)
    if (isNaN(next) || next < 0)
      next = 0
    root.persistSettings({ refreshIntervalSec: next })
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  readonly property int scanIntervalSec: Math.max(0, root.settingInt("refreshIntervalSec", 3600))

  Timer {
    interval: root.scanIntervalSec > 0 ? root.scanIntervalSec * 1000 : 3600000
    running: root.scanIntervalSec > 0
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refreshStatus()
  }

  Timer {
    interval: Math.max(1, root.settingInt("autoPushIntervalMin", 0)) * 60000
    running: root.settingInt("autoPushIntervalMin", 0) > 0
    repeat: true
    onTriggered: root.autoPushNow()
  }

  Timer {
    id: statusDeadline
    interval: root.statusDeadlineMs
    repeat: false
    onTriggered: root.expireProcess(statusProcess, "status timed out")
  }

  Timer {
    id: pushDeadline
    interval: root.pushDeadlineMs
    repeat: false
    onTriggered: root.expireProcess(pushProcess, "push timed out")
  }

  Process {
    id: statusProcess
    running: false
    clearEnvironment: true
    stdout: StdioCollector {
      id: statusOut
      waitForEnd: true
      onDataChanged: {
        if (text.length > root.outputLimit)
          root.expireProcess(statusProcess, "status output exceeded the limit")
      }
      onStreamFinished: root.applyStatus(text)
    }
    stderr: StdioCollector {
      id: statusErr
      waitForEnd: true
      onDataChanged: {
        if (text.length > root.outputLimit)
          root.expireProcess(statusProcess, "status output exceeded the limit")
      }
    }
    onExited: function(exitCode, exitStatus) {
      statusDeadline.stop()
      var message = root.boundedText(statusErr.text).trim()
      if (exitCode !== 0 && message !== "" && !root.statusAborted)
        root.statusError = message
    }
  }

  Process {
    id: pushProcess
    running: false
    clearEnvironment: true
    stdout: StdioCollector {
      waitForEnd: true
      onDataChanged: {
        if (text.length > root.outputLimit)
          root.expireProcess(pushProcess, "push output exceeded the limit")
      }
    }
    stderr: StdioCollector {
      id: pushErr
      waitForEnd: true
      onDataChanged: {
        if (text.length > root.outputLimit)
          root.expireProcess(pushProcess, "push output exceeded the limit")
      }
    }
    onExited: function(exitCode, exitStatus) {
      pushDeadline.stop()
      var message = root.boundedText(pushErr.text).trim()
      if (exitCode !== 0 && message !== "")
        root.statusError = message
      root.refreshStatus()
    }
  }

  Component.onDestruction: {
    if (statusProcess.running)
      statusProcess.signal(9)
    if (pushProcess.running)
      pushProcess.signal(9)
  }

  readonly property string statusPath: (Quickshell.env("HOME") || "") + "/.local/state/omarsync/status.json"

  FileView {
    path: root.manifestPath
    watchChanges: true
    printErrors: false
    onLoaded: root.version = Model.pluginVersion(text())
    onFileChanged: reload()
  }

  FileView {
    path: root.statusPath
    watchChanges: true
    printErrors: false
    onLoaded: {
      if (String(text()).trim() !== "")
        root.applyStatus(text())
    }
    onFileChanged: reload()
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.icon.glyph
    dimmed: root.icon.dimmed
    active: root.icon.alert
    tooltipText: {
      var line = root.version !== "" ? ("Omarsync " + root.version) : "Omarsync"
      if (root.busy)
        return line + " · working…"
      var sentence = Model.statusSentence(root.status)
      if (root.icon.label === "last command failed")
        sentence = "Last command failed: " + String(root.statusError).split("\n")[0]
      var hint = "\nLeft: panel · Middle: push · Right: scan now"
      var when = root.status.lastPush && root.status.lastPush.time
        ? Model.relativeTime(root.status.lastPush.time)
        : ""
      if (when !== "")
        return line + " · " + sentence + " · last push " + when + hint
      return line + " · " + sentence + hint
    }

    RotationAnimation on textRotation {
      from: 0
      to: 360
      duration: 1200
      loops: Animation.Infinite
      running: root.busy
    }

    onPressed: function(buttonCode) {
      if (buttonCode === Qt.MiddleButton)
        root.pushNow()
      else if (buttonCode === Qt.RightButton)
        root.refreshStatus()
      else if (buttonCode === Qt.LeftButton)
        root.toggle()
    }
  }
}
