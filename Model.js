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

function statusSentence(sync) {
  if (!sync || sync.initialized !== true)
    return "Repository is not set up"
  if (sync.dirty === true && (sync.behind || 0) > 0)
    return "Local changes to push, and " + sync.behind + " to apply"
  if (sync.dirty === true)
    return "Local changes to push"
  if ((sync.behind || 0) > 0)
    return sync.behind + (sync.behind === 1 ? " commit to apply" : " commits to apply")
  if ((sync.ahead || 0) > 0)
    return sync.ahead + (sync.ahead === 1 ? " commit not on the remote yet" : " commits not on the remote yet")
  return "Up to date"
}

function relativeTime(iso) {
  if (!iso)
    return "never"
  var then = Date.parse(iso)
  if (isNaN(then))
    return iso
  var seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 45)
    return "just now"
  if (seconds < 3600)
    return Math.floor(seconds / 60) + "m ago"
  if (seconds < 86400)
    return Math.floor(seconds / 3600) + "h ago"
  return Math.floor(seconds / 86400) + "d ago"
}
