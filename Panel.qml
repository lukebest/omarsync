import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "io.github.lukebest.omarsync"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  readonly property var sync: hostWidget && hostWidget.status ? hostWidget.status : ({})
  readonly property bool ready: sync.initialized === true && sync.loggedIn === true
  readonly property string trustedCommit: {
    var sha = String(sync.remoteCommit || "")
    return /^[0-9a-f]{40}$/.test(sha) ? sha : ""
  }
  readonly property bool firstApply: sync.firstApply === true
  readonly property bool firstTrust: sync.remoteSignature === "untrusted" && sync.hasTrustedKeys !== true
  readonly property bool canApply: ready && trustedCommit !== "" && (sync.remoteSigned === true || firstTrust || firstApply)
  readonly property bool working: hostWidget ? hostWidget.busy === true : false
  readonly property color dim: Qt.darker(root.barForeground, 1.35)
  readonly property string fontFamily: root.bar ? root.bar.fontFamily : Style.font.family
  readonly property string pluginVersion: hostWidget && hostWidget.version ? String(hostWidget.version) : ""

  function open() {
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.hostWidget || root, direction)
    return false
  }

  function callHost(name) {
    if (root.hostWidget && typeof root.hostWidget[name] === "function")
      root.hostWidget[name]()
  }

  function primaryLabel() {
    if (!root.hostWidget || root.hostWidget.statusReady !== true)
      return ""
    if (root.sync.ghInstalled !== true || root.sync.loggedIn !== true || root.sync.initialized !== true)
      return "Get started"
    return ""
  }

  function runPrimary() {
    root.callHost("setup")
  }

  function lastPushText() {
    var push = sync.lastPush || ({})
    if (!push.time)
      return "No push yet"
    var when = Qt.formatDateTime(new Date(push.time), "yyyy-MM-dd HH:mm")
    if (isNaN(Date.parse(push.time)))
      when = push.time
    var who = push.host || "unknown host"
    return "Last push " + when + " from " + who
  }

  function autoPushDescription() {
    var minutes = root.hostWidget ? root.hostWidget.settingInt("autoPushIntervalMin", 0) : 0
    if (minutes > 0)
      return "Pushes this machine every " + minutes + " minutes"
    return "Off. Turn on to push every 30 minutes"
  }

  function problemText() {
    if (root.hostWidget && root.hostWidget.statusError)
      return String(root.hostWidget.statusError)
    if (root.sync && root.sync.error)
      return String(root.sync.error)
    return ""
  }

  function changeText() {
    if (!root.hostWidget || root.hostWidget.statusReady !== true)
      return "Checking status…"
    if (root.working)
      return "Working…"
    return Model.statusSentence(root.sync)
  }

  function commitText() {
    var sha = root.trustedCommit
    if (sha === "")
      return ""
    var shortSha = sha.substring(0, 7)
    var fp = root.sync.signerFingerprint ? (" " + root.sync.signerFingerprint) : ""
    if (root.sync.remoteSigned === true)
      return "Signed " + shortSha + fp
    if (root.sync.firstApply === true && root.sync.remoteSignature === "untrusted")
      return "Signed " + shortSha + fp
    if (root.sync.firstApply === true)
      return "First apply " + shortSha
    if (root.sync.remoteSignature === "untrusted" && root.sync.hasTrustedKeys === true)
      return "Different key " + shortSha + fp
    if (root.sync.remoteSignature === "untrusted")
      return "Signed " + shortSha + fp
    return "Unsigned " + shortSha
  }

  property bool settingsOpen: false

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(320))
    contentHeight: panel.fittedContentHeight(content.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: scanInterval.popupOpen
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: content
        width: parent.width
        spacing: Style.space(8)

        PanelHero {
          width: parent.width
          title: "Omarsync"
          meta: root.sync.loggedIn === true ? (root.sync.user || "GitHub") : "Not signed in"
          detail: root.sync.repo || "No repository yet"
          foreground: root.barForeground
          fontFamily: root.fontFamily
        }

        Text {
          width: parent.width
          visible: root.pluginVersion !== ""
          text: "Version " + root.pluginVersion
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Text {
          width: parent.width
          text: root.lastPushText()
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          visible: root.trustedCommit !== ""
          text: root.commitText()
          color: root.barForeground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WrapAnywhere
        }

        Text {
          width: parent.width
          text: root.changeText()
          color: root.barForeground
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          visible: root.problemText() !== ""
          text: root.problemText()
          color: root.barForeground
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }

        PanelSeparator { width: parent.width; foreground: root.barForeground }

        Button {
          width: parent.width
          visible: root.primaryLabel() !== ""
          text: root.primaryLabel()
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.runPrimary()
        }

        Button {
          width: parent.width
          text: root.working ? "Working…" : "Push"
          visible: root.ready && (root.sync.dirty === true || (root.sync.ahead || 0) > 0)
          enabled: !root.working
          opacity: enabled ? 1 : 0.45
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("pushNow")
        }

        Button {
          width: parent.width
          text: (root.firstApply && root.sync.remoteSigned !== true) ? "Apply this commit" : "Apply"
          visible: root.canApply && ((root.sync.behind || 0) > 0 || root.firstApply || root.sync.remoteSigned !== true)
          enabled: !root.working
          opacity: enabled ? 1 : 0.45
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("pullAndApply")
        }

        Button {
          width: parent.width
          text: "Open repository"
          enabled: root.sync.repo !== "" && root.sync.repo !== undefined
          opacity: enabled ? 1 : 0.45
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("openRepo")
        }

        Button {
          width: parent.width
          text: "Edit scope"
          enabled: root.sync.initialized === true
          opacity: enabled ? 1 : 0.45
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("editScope")
        }

        Button {
          width: parent.width
          text: root.working ? "Scanning…" : "Scan now"
          enabled: !root.working
          opacity: enabled ? 1 : 0.45
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("refreshStatus")
        }

        Button {
          width: parent.width
          text: "View log"
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("viewLog")
        }

        Button {
          width: parent.width
          text: root.settingsOpen ? "Hide settings" : "Settings"
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.settingsOpen = !root.settingsOpen
        }

        Dropdown {
          id: scanInterval
          width: parent.width
          visible: root.settingsOpen
          label: "Scan for changes"
          foreground: root.barForeground
          fontFamily: root.fontFamily
          value: String(root.hostWidget ? root.hostWidget.settingInt("refreshIntervalSec", 3600) : 3600)
          options: [
            { "value": "0", "label": "Off, scan manually" },
            { "value": "900", "label": "Every 15 minutes" },
            { "value": "1800", "label": "Every 30 minutes" },
            { "value": "3600", "label": "Every hour" },
            { "value": "21600", "label": "Every 6 hours" },
            { "value": "86400", "label": "Every 24 hours" }
          ]
          onChanged: function(value) {
            if (root.hostWidget && root.hostWidget.setScanInterval)
              root.hostWidget.setScanInterval(parseInt(value, 10))
          }
        }

        Toggle {
          width: parent.width
          visible: root.settingsOpen
          label: "Auto push"
          description: root.autoPushDescription()
          checked: root.hostWidget ? root.hostWidget.settingInt("autoPushIntervalMin", 0) > 0 : false
          enabled: root.ready
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("toggleAutoPush")
        }

        Toggle {
          width: parent.width
          visible: root.settingsOpen
          label: "Notify"
          description: "Desktop notification after a push"
          checked: root.hostWidget ? root.hostWidget.settingBool("notify", true) : true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("toggleNotify")
        }
      }
    }
  }
}
