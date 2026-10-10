-- pacman / AUR / Flatpak 清单的导出与安装。逻辑 1:1 移植自 lib/packages.sh。

local common = require("common")
local exec = require("exec")

local M = {}

local function pacman_bin()
  return exec.resolve_tool("pacman")
end

local function flatpak_bin()
  return exec.resolve_tool("flatpak")
end

local function flatpak(args, opts)
  local bin = flatpak_bin() or common.die("flatpak is not installed in a trusted directory")
  if opts and opts.capture then
    return exec.capture(bin, args, opts)
  end
  return exec.run(bin, args)
end

function M.export_packages(dest)
  common.mkdirp(dest .. "/packages")
  local pacman = pacman_bin()
  if pacman then
    local official = exec.capture(pacman, { "-Qqen" }) or ""
    common.write_file(dest .. "/packages/pacman.txt", official)
    local aur = exec.capture(pacman, { "-Qqem" }) or ""
    common.write_file(dest .. "/packages/aur.txt", aur)
  else
    common.write_file(dest .. "/packages/pacman.txt", "")
    common.write_file(dest .. "/packages/aur.txt", "")
  end
  M.export_flatpaks(dest)
end

function M.flatpak_remote_url_ok(url)
  if type(url) ~= "string" or #url > 300 then return false end
  if not url:match("^https://[A-Za-z0-9._~:/?#&=%%+%-]+$") then return false end
  if url:find("..", 1, true) then return false end
  return true
end

function M.export_flatpaks(dest)
  local out_path = dest .. "/packages/flatpak.txt"
  if not flatpak_bin() then
    common.write_file(out_path, "")
    return
  end
  -- 先收集用户级 remote 的下载 URL
  local remote_urls = {}
  local remotes = flatpak({ "remotes", "--user", "--columns=name,url" }, { capture = true }) or ""
  for line in remotes:gmatch("[^\n]+") do
    local name, url = line:match("^(%S+)%s+(%S+)")
    if name and name:match("^[A-Za-z0-9._%-]+$") then
      if not M.flatpak_remote_url_ok(url) then url = "" end
      remote_urls[name] = url
    end
  end
  local lines = {}
  local list = flatpak({ "list", "--user", "--app", "--columns=application,origin,branch,active" }, { capture = true }) or ""
  for line in list:gmatch("[^\n]+") do
    local app, origin, branch = line:match("^(%S+)%s+(%S+)%s+(%S+)")
    if app and app:match("^[A-Za-z0-9._%-]+$")
      and origin:match("^[A-Za-z0-9._%-]+$")
      and branch:match("^[A-Za-z0-9._%-]+$") then
      local commit = flatpak({ "info", "--user", "--show-commit", app }, { capture = true }) or ""
      commit = commit:gsub("%s+$", "")
      if not (#commit == 64 and commit:match("^[0-9a-f]+$")) then commit = "" end
      local url = remote_urls[origin] or ""
      lines[#lines + 1] = table.concat({ app, origin, branch, commit, url }, "\t")
    end
  end
  common.write_file(out_path, (#lines > 0 and table.concat(lines, "\n") .. "\n" or ""))
end

local function user_flatpak_remote_exists(name)
  local remotes = flatpak({ "remotes", "--user", "--columns=name" }, { capture = true }) or ""
  for line in remotes:gmatch("[^\n]+") do
    if common.trim(line) == name then return true end
  end
  return false
end

-- Flathub 是唯一众所周知的 remote;其他 origin 需要导出端记录的 URL
local function ensure_user_flatpak_remote(name, url)
  if user_flatpak_remote_exists(name) then return true end
  if name == "flathub" then
    url = "https://dl.flathub.org/repo/flathub.flatpakrepo"
  end
  if not url or not M.flatpak_remote_url_ok(url) then return false end
  local ok = flatpak({ "remote-add", "--user", "--if-not-exists", name, url })
  return ok
end

local function valid_pkg_name(s)
  return type(s) == "string" and s:match("^[A-Za-z0-9@._+%-]+$") ~= nil
end

local function pkg_installed(pkg)
  local pacman = pacman_bin()
  if not pacman then return false end
  -- capture 抑制 pacman -Q 的输出
  local _, ok = exec.capture(pacman, { "-Q", pkg })
  return ok
end

function M.install_missing_packages(mirror)
  local failed = false
  local official, aur = {}, {}

  local pacman_list = common.read_file(mirror .. "/packages/pacman.txt")
  if pacman_list then
    for line in pacman_list:gmatch("[^\n]+") do
      local pkg = common.trim(line)
      if pkg ~= "" and pkg:sub(1, 1) ~= "#" then
        if not valid_pkg_name(pkg) then
          common.die("refusing unusual package name: " .. pkg)
        end
        if not pkg_installed(pkg) then
          official[#official + 1] = pkg
        end
      end
    end
  end

  if #official > 0 then
    common.log("installing " .. #official .. " official packages")
    local args = { "pkg", "add" }
    for _, p in ipairs(official) do args[#args + 1] = p end
    if not common.omarchy(args) then
      common.warn("official package install failed")
      failed = true
    end
  else
    common.log("official packages already installed")
  end

  local aur_list = common.read_file(mirror .. "/packages/aur.txt")
  if aur_list then
    for line in aur_list:gmatch("[^\n]+") do
      local pkg = common.trim(line)
      if pkg ~= "" and pkg:sub(1, 1) ~= "#" then
        if not valid_pkg_name(pkg) then
          common.die("refusing unusual package name: " .. pkg)
        end
        if not pkg_installed(pkg) then
          aur[#aur + 1] = pkg
        end
      end
    end
  end

  if #aur > 0 then
    common.warn("not installing AUR packages (unpinned build recipes): " .. table.concat(aur, " "))
    common.warn("install a pinned PKGBUILD commit yourself if you still want them")
  end

  if not M.install_missing_flatpaks(mirror) then
    failed = true
  end
  return not failed
end

function M.install_missing_flatpaks(mirror)
  local list_path = mirror .. "/packages/flatpak.txt"
  if not flatpak_bin() or not exec.is_file(list_path) then return true end
  local failed = false
  local data = common.read_file(list_path) or ""
  for line in (data .. "\n"):gmatch("([^\n]*)\n") do
    local app, origin, branch, commit, url = line:match("^([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t?([^\t]*)")
    if app and app ~= "" then
      if not app:match("^[A-Za-z0-9._%-]+$") then common.die("refusing unusual flatpak id: " .. app) end
      if not origin:match("^[A-Za-z0-9._%-]+$") then common.die("refusing unusual flatpak origin: " .. origin) end
      if not branch:match("^[A-Za-z0-9._%-]+$") then common.die("refusing unusual flatpak branch: " .. branch) end
      if commit ~= "" and not (#commit == 64 and commit:match("^[0-9a-f]+$")) then common.die("refusing unusual flatpak commit: " .. commit) end
      if url ~= "" and not M.flatpak_remote_url_ok(url) then common.die("refusing unusual flatpak remote URL for " .. origin) end
      -- flatpak info 成功即已安装
      local _, installed = flatpak({ "info", "--user", app }, { capture = true })
      if not installed then
        if not ensure_user_flatpak_remote(origin, url) then
          common.warn("skipping flatpak " .. app .. "; remote " .. origin .. " is not on this machine and has no download URL")
          goto continue
        end
        common.log("installing flatpak " .. app .. " from " .. origin)
        if not flatpak({ "install", "--user", "--noninteractive", "--app", origin, app }) then
          common.warn("failed to install flatpak " .. app)
          failed = true
          goto continue
        end
      end
      if commit ~= "" then
        common.log("pinning flatpak " .. app .. " to " .. commit)
        if not flatpak({ "update", "--user", "--noninteractive", "--commit=" .. commit, app }) then
          common.warn("failed to pin flatpak " .. app .. " to " .. commit)
          failed = true
        end
      end
    end
    ::continue::
  end
  return not failed
end

return M
