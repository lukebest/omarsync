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
  property var status: ({})
  property bool statusReady: false
  property string statusError: ""
  property int rememberedAutoMin: 30
  readonly property bool busy: statusProcess.running || pushProcess.running || status.running === true
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
    var parsed = Model.parseStatus(text)
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
    statusProcess.command = [root.cliPath, "status", "--json"]
    statusProcess.running = true
  }

  function pushNow() {
    if (pushProcess.running || root.cliPath === "")
      return
    var args = [root.cliPath, "push", "--quiet"]
    if (root.settingBool("notify", true))
      args.push("--notify")
    pushProcess.command = args
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
    root.bar.run("omarchy-launch-editor " + Model.shellQuote(home + "/.local/state/omarsync/repo/omarsync.scope"))
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

  Process {
    id: statusProcess
    running: false
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.applyStatus(text)
    }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var message = String(text || "").trim()
        if (message !== "")
          root.statusError = message
      }
    }
  }

  Process {
    id: pushProcess
    running: false
    stdout: StdioCollector { waitForEnd: true }
    stderr: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var message = String(text || "").trim()
        if (message !== "")
          root.statusError = message
      }
    }
    onExited: function(exitCode, exitStatus) {
      root.refreshStatus()
    }
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
    tooltipText: root.busy ? "Omarsync is working" : "Omarsync"

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
