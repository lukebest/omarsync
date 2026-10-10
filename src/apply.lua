-- apply 编排:备份 → mise dot pull(文件)→ 主题/壁纸 → 包/插件/hooks。
-- 文件的写入由 mise 负责(自带保护检查点与 undo);这里保留本机备份作为第二道保险。
-- 移植自 lib/apply.sh,删除了 restore_scope(rsync 还原)。

local common = require("common")
local exec = require("exec")
local json = require("json")
local trust = require("trust")
local mise = require("mise")
local packages = require("packages")
local plugins = require("plugins")
local hooks = require("hooks")

local M = {}

local HOME = os.getenv("HOME")

function M.prune_backups()
  local root = common.backup_dir()
  if not exec.is_dir(root) then return end
  local names = {}
  local handle = io.popen("/usr/bin/ls -1 " .. exec.quote(root) .. " 2>/dev/null")
  if handle then
    for name in handle:lines() do
      if name ~= "" then names[#names + 1] = name end
    end
    handle:close()
  end
  table.sort(names)
  for i = 1, #names - common.BACKUP_KEEP do
    os.execute("/usr/bin/rm -rf " .. exec.quote(root .. "/" .. names[i]))
  end
end

-- 按 scope 备份 $HOME 的现有文件(在 mise pull 覆盖之前)
function M.backup_tree()
  local date = exec.resolve_tool("date")
  local stamp = date and (exec.capture(date, { "+%Y%m%d-%H%M%S" }) or ""):gsub("%s+$", "") or "unknown"
  local dest = common.backup_dir() .. "/" .. stamp
  for _, e in ipairs(common.read_scope(common.scope_file_for())) do
    local src = HOME .. "/" .. e.rel
    if exec.exists(src) or exec.is_link(src) then
      local parent = dest .. "/home/" .. e.rel:match("^(.*)/[^/]*$")
      common.mkdirp(parent)
      common.rsync({ "-a", src, parent .. "/" })
    end
  end
  local state = HOME .. "/.local/state/omarchy/current"
  if exec.is_dir(state) then
    common.mkdirp(dest .. "/current")
    local theme = common.read_file(state .. "/theme.name")
    if theme then common.write_file(dest .. "/current/theme.name", theme) end
    local bg = state .. "/background"
    if exec.is_link(bg) or exec.exists(bg) then
      local target = exec.realpath(bg)
      if target then common.write_file(dest .. "/current/background.path", target .. "\n") end
    end
  end
  return dest
end

-- 应用主题与壁纸(在线模式调用 omarchy;OMARSYNC_SKIP_LIVE=1 时只写状态文件)
function M.apply_current(mirror)
  local theme = ""
  local background = ""
  local t = common.read_file(mirror .. "/current/theme.name")
  if t then theme = (t:gsub("%s+", "")) end
  local b = common.read_file(mirror .. "/current/background")
  if b then background = (b:gsub("%s+", "")) end

  local state = HOME .. "/.local/state/omarchy/current"
  local target = ""
  if background:sub(1, 4) == "rel:" then
    target = HOME .. "/.config/omarchy/backgrounds/" .. background:sub(5)
  elseif background:sub(1, 4) == "abs:" then
    target = background:sub(5)
  end

  if os.getenv("OMARSYNC_SKIP_LIVE") == "1" then
    common.mkdirp(state)
    if theme ~= "" then common.write_file(state .. "/theme.name", theme .. "\n") end
    if target ~= "" and exec.exists(target) then
      os.execute(string.format("/usr/bin/ln -sfn %s %s", exec.quote(target), exec.quote(state .. "/background")))
    end
    return true
  end

  local failed = false
  if theme ~= "" then
    common.log("setting theme " .. theme)
    if not common.omarchy({ "theme", "set", theme }) then
      common.warn("could not set theme " .. theme)
      failed = true
    end
  end
  if target ~= "" then
    if exec.exists(target) then
      common.log("setting background " .. target)
      if not common.omarchy({ "theme", "bg", "set", target }) then
        common.warn("could not set background")
        failed = true
      end
    else
      common.warn("background file is missing: " .. target)
      failed = true
    end
  end
  return not failed
end

-- 清洗后的进程不携带 HYPRLAND_INSTANCE_SIGNATURE;
-- 从 /run/user/<uid>/hypr 下唯一的会话目录推导
local function hypr_instance_signature()
  local runtime = os.getenv("XDG_RUNTIME_DIR") or ""
  if not runtime:match("^/run/user/%d+") or not exec.is_dir(runtime .. "/hypr") then
    return nil
  end
  local found = {}
  local handle = io.popen("/usr/bin/ls -1 " .. exec.quote(runtime .. "/hypr") .. " 2>/dev/null")
  if handle then
    for name in handle:lines() do
      local dir = runtime .. "/hypr/" .. name
      if exec.is_dir(dir) and exec.is_file(dir .. "/hyprland.lock")
        and name:match("^[0-9a-f]+_[0-9]+_[0-9]+$") then
        found[#found + 1] = name
      end
    end
    handle:close()
  end
  if #found ~= 1 then return nil end
  return found[1]
end

function M.reload_desktop()
  if os.getenv("OMARSYNC_SKIP_LIVE") == "1" then return end
  if exec.resolve_tool("omarchy-shell") then
    if not common.omarchy_shell({ "shell", "reloadConfig" }) then
      common.warn("shell reload failed")
    end
  end
  local hyprctl = exec.resolve_tool("hyprctl")
  if not hyprctl then return end
  local sig = hypr_instance_signature()
  if not sig then
    common.warn("hyprctl reload skipped; this user has no single Hyprland session")
    return
  end
  local ok = exec.run(hyprctl, { "reload" }, {
    "XDG_RUNTIME_DIR=" .. os.getenv("XDG_RUNTIME_DIR"),
    "HYPRLAND_INSTANCE_SIGNATURE=" .. sig,
  })
  if not ok then common.warn("hyprctl reload failed") end
end

function M.assert_pinned(mirror, sha)
  if not trust.is_full_sha(sha) then
    common.die("refusing to activate an unpinned revision")
  end
  local head = common.git_out({ "-C", mirror, "rev-parse", "--verify", "HEAD" })
  if head ~= sha then
    common.die("mirror HEAD " .. tostring(head) .. " is not the reviewed commit " .. sha)
  end
  if select(2, common.git({ "-C", mirror, "symbolic-ref", "-q", "HEAD" }, { capture = true })) then
    common.die("refusing to apply while the mirror is on a branch")
  end
end

-- mise 侧的文件同步:fetch → 校验签名提交记录的 miseHead → pull
function M.sync_dotfiles(mirror, force)
  if not mise.available() then
    common.warn("mise is not installed; skipping dotfiles. Run: omarchy pkg add mise")
    return false
  end
  local ok, out = mise.sync(true) -- 只抓取,不发布
  if not ok then
    common.warn("mise fetch failed: " .. tostring(out or ""))
    return false
  end
  -- omarsync.json 里的 miseHead 只做留档(取证用),不做钉死校验:
  -- 接收机本地历史头与发布机的合法地不同,mise 的 pull 事务自带保护检查点
  local pull_out, pull_ok = mise.pull({ take_remote_all = true, capture = true })
  if not pull_ok then
    common.warn("mise pull failed: " .. tostring(pull_out or ""))
    common.warn("resolve conflicts with: mise dot conflicts / mise dot pull --take-remote-all")
    return false
  end
  return true
end

function M.apply_mirror(mirror, with_packages, sha, with_exec)
  M.assert_pinned(mirror, sha)
  common.log("activating commit " .. sha)
  local backup = M.backup_tree()
  common.log("backed up existing files to " .. backup)
  local failed = false
  if not M.sync_dotfiles(mirror, false) then failed = true end
  if not M.apply_current(mirror) then failed = true end
  M.reload_desktop()
  if with_packages then
    if not packages.install_missing_packages(mirror) then failed = true end
  else
    common.log("skipped official package install")
  end
  if not plugins.install_missing_plugins(mirror, with_exec) then failed = true end
  if not hooks.refresh_user_services() then failed = true end
  if not hooks.run_hooks(mirror, with_exec) then failed = true end
  M.assert_pinned(mirror, sha)
  M.prune_backups()
  return not failed
end

function M.preview_apply(mirror, sha, with_exec)
  common.log("commit " .. sha)
  -- 文件列表:scope 条目 + mise dry-run 预览
  common.log("files (tracked by mise dot):")
  for _, e in ipairs(common.read_scope(common.scope_file_for())) do
    common.log("  " .. e.rel)
  end
  if mise.available() then
    local out = mise.pull({ dry_run = true, take_remote_all = true, capture = true })
    if type(out) == "string" and out:match("%S") then
      for line in out:gmatch("[^\n]+") do
        common.log("  " .. line)
      end
    end
  end
  local pac = common.read_file(mirror .. "/packages/pacman.txt")
  if pac then
    local n = 0
    for line in pac:gmatch("[^\n]+") do
      if common.trim(line) ~= "" then n = n + 1 end
    end
    common.log("official packages listed: " .. n)
  end
  local fp = common.read_file(mirror .. "/packages/flatpak.txt")
  if fp then
    common.log("flatpaks:")
    for line in fp:gmatch("[^\n]+") do
      local app = line:match("^([^\t]+)")
      if app and app ~= "" then common.log("  " .. app) end
    end
  end
  local pj = common.read_file(mirror .. "/plugins.json")
  if pj then
    local data = json.decode(pj)
    if type(data) == "table" then
      common.log("plugins:")
      for _, row in ipairs(data) do
        local note = row["local"] == true and "(local snapshot)" or (type(row.commit) == "string" and row.commit or "")
        common.log("  " .. tostring(row.id) .. " " .. note)
      end
    end
  end
  for _, name in ipairs(hooks.list_hooks(mirror)) do
    common.log("hook " .. name)
  end
  if not with_exec then
    common.log("plugins and hooks will not run")
  end
end

-- 交互确认:tty 下询问,非交互用默认值(default_yes 决定)
function M.prompt_yes(prompt, default_yes)
  if not common.stdin_is_tty() then
    return default_yes
  end
  io.stderr:write(prompt .. " [y/N] ")
  local answer = io.read("*l") or ""
  return answer == "y" or answer == "Y"
end

return M
