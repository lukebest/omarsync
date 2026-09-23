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
  readonly property string trustedShell: "/usr/bin/bash"
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
    return {
      "HOME": Quickshell.env("HOME") || "",
      "PATH": "/usr/bin:/bin:/usr/sbin:/usr/share/omarchy/bin",
      "LANG": "C.UTF-8",
      "LC_ALL": "C.UTF-8",
      "OMARCHY_PATH": "/usr/share/omarchy"
    }
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
    var command = [root.trustedShell, root.cliPath]
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
    if (statusProcess.running || root.cliPath === "" || root.trustedShell === "")
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

  function pushNow() {
    if (pushProcess.running || root.cliPath === "" || root.trustedShell === "")
      return
    var home = Quickshell.env("HOME") || ""
    if (home === "")
      return
    var args = ["push", "--quiet"]
    if (root.settingBool("notify", true))
      args.push("--notify")
    root.armProcess(pushProcess)
    pushProcess.command = root.trustedCommand(args)
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
    root.runInTerminal(root.quotedCli() + " init")
  }

  function pullAndApply() {
    var sha = Model.fullCommit(root.status.remoteCommit)
    if (sha === "" || root.status.remoteSigned !== true)
      return
    root.runInTerminal(root.quotedCli() + " apply --commit " + sha)
  }

  function openRepo() {
    if (!Model.safeRepo(root.status.repo) || !root.bar || typeof root.bar.run !== "function")
      return
    root.bar.run("xdg-open " + Model.shellQuote("https://github.com/" + root.status.repo))
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

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()

  Timer {
    interval: Math.max(30, root.settingInt("refreshIntervalSec", 300)) * 1000
    running: true
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refreshStatus()
  }

  Timer {
    interval: Math.max(1, root.settingInt("autoPushIntervalMin", 0)) * 60000
    running: root.settingInt("autoPushIntervalMin", 0) > 0
    repeat: true
    onTriggered: root.pushNow()
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
      waitForEnd: true
      onDataChanged: {
        if (text.length > root.outputLimit)
          root.expireProcess(statusProcess, "status output exceeded the limit")
      }
      onStreamFinished: {
        var message = root.boundedText(text).trim()
        if (message !== "" && !root.statusAborted)
          root.statusError = message
      }
    }
    onExited: function(exitCode, exitStatus) {
      statusDeadline.stop()
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
      waitForEnd: true
      onDataChanged: {
        if (text.length > root.outputLimit)
          root.expireProcess(pushProcess, "push output exceeded the limit")
      }
      onStreamFinished: {
        var message = root.boundedText(text).trim()
        if (message !== "")
          root.statusError = message
      }
    }
    onExited: function(exitCode, exitStatus) {
      pushDeadline.stop()
      root.refreshStatus()
    }
  }

  Component.onDestruction: {
    if (statusProcess.running)
      statusProcess.signal(9)
    if (pushProcess.running)
      pushProcess.signal(9)
  }

  FileView {
    path: root.manifestPath
    watchChanges: true
    printErrors: false
    onLoaded: root.version = Model.pluginVersion(text())
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
    text: "\uf0c2"
    dimmed: root.status.loggedIn !== true
    active: root.dirty || (root.status.behind || 0) > 0
    tooltipText: root.busy
      ? "Omarsync is working"
      : (root.version !== "" ? ("Omarsync " + root.version) : "Omarsync")

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

  Rectangle {
    visible: root.dirty && !root.busy
    width: 5
    height: 5
    radius: 2.5
    color: root.bar ? root.bar.urgent : Color.urgent
    anchors.right: button.right
    anchors.top: button.top
    anchors.margins: 3
  }
}
