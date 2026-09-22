import QtQuick
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "io.github.lukebest.omarsync"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  readonly property var sync: hostWidget && hostWidget.status ? hostWidget.status : ({})
  readonly property bool ready: sync.initialized === true && sync.loggedIn === true
  readonly property bool working: hostWidget ? hostWidget.busy === true : false
  readonly property color dim: Qt.darker(root.barForeground, 1.35)
  readonly property string fontFamily: root.bar ? root.bar.fontFamily : Style.font.family

  function open() {
    root.controller.show()
    if (root.hostWidget && root.hostWidget.refreshStatus)
      root.hostWidget.refreshStatus()
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
    if (root.sync.ghInstalled !== true)
      return "Install GitHub CLI"
    if (root.sync.loggedIn !== true)
      return "Sign in to GitHub"
    if (root.sync.initialized !== true)
      return "Set up repository"
    return ""
  }

  function runPrimary() {
    if (sync.ghInstalled !== true)
      root.callHost("installGh")
    else if (sync.loggedIn !== true)
      root.callHost("login")
    else
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
    if (!root.sync.initialized)
      return "Repository is not set up"
    if (root.working)
      return "Working…"
    var parts = []
    parts.push(sync.dirty === true ? "Local changes waiting" : "Local files match the last push")
    if (sync.behind > 0)
      parts.push(sync.behind + " commit" + (sync.behind === 1 ? "" : "s") + " to pull")
    if (sync.ahead > 0)
      parts.push(sync.ahead + " unpushed commit" + (sync.ahead === 1 ? "" : "s"))
    return parts.join(" · ")
  }

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
          text: root.lastPushText()
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
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
          enabled: root.ready && !root.working
          opacity: enabled ? 1 : 0.45
          leftAlign: true
          foreground: root.barForeground
          fontFamily: root.fontFamily
          onClicked: root.callHost("pushNow")
        }

        Button {
          width: parent.width
          text: "Pull and apply"
          enabled: root.ready && !root.working
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

        Toggle {
          width: parent.width
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
