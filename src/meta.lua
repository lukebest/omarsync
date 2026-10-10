-- 元数据导出:当前主题/壁纸、包清单、插件清单、hooks、omarsync.json。
-- 文件本体同步已由 mise dot 接管,这里只处理"非文件"的机器状态。
-- 对应原 lib/collect.sh 去掉 rsync 镜像后的部分。

local common = require("common")
local exec = require("exec")
local json = require("json")
local packages = require("packages")
local plugins = require("plugins")
local hooks = require("hooks")

local M = {}

local HOME = os.getenv("HOME")

-- 导出当前主题名与壁纸记录(rel:/abs: 形式)
function M.export_current(dest)
  local state = HOME .. "/.local/state/omarchy/current"
  common.mkdirp(dest .. "/current")
  local theme = common.read_file(state .. "/theme.name")
  common.write_file(dest .. "/current/theme.name", theme or "")

  local record = ""
  local bg = state .. "/background"
  local target
  if exec.is_link(bg) or exec.exists(bg) then
    target = exec.realpath(bg)
  end
  local base = HOME .. "/.config/omarchy/backgrounds"
  if target and target:sub(1, #base + 1) == base .. "/" then
    record = "rel:" .. target:sub(#base + 2)
  elseif target then
    record = "abs:" .. target
  end
  common.write_file(dest .. "/current/background", record .. "\n")
end

-- omarsync.json:主机、Omarchy 版本、推送时间、mise 历史头(tree.snapshot)
function M.write_meta(dest, mise_head)
  local version = "unknown"
  local vf = (os.getenv("OMARCHY_PATH") or "/usr/share/omarchy") .. "/version"
  local v = common.read_file(vf)
  if v then version = (v:gsub("%s+", "")) end
  local data = {
    schemaVersion = 2,
    host = common.hostname_safe(),
    omarchyVersion = version,
    pushedAt = common.iso8601(),
    miseHead = mise_head or json.null,
  }
  common.write_file(dest .. "/omarsync.json", json.encode(data) .. "\n")
end

-- 采集元数据到镜像(不再含 home/ 目录;dotfiles 走 mise)
function M.collect_into(dest, mise_head)
  common.discard_remote_scope(dest)
  -- 旧格式遗留:home/ 目录由 migrate 移除;这里防御性忽略
  M.export_current(dest)
  packages.export_packages(dest)
  plugins.export_plugins(dest, "apply")
  hooks.export_hooks(dest)
  M.write_meta(dest, mise_head)
end

-- 比较两棵树(文件级,调 diff/cmp 这两个可信工具)
local function trees_differ(left, right)
  if exec.is_dir(left) or exec.is_dir(right) then
    local diff = exec.resolve_tool("diff")
    if not diff then return true end
    -- capture 模式抑制 stderr(一侧不存在时 diff 会抱怨)
    local _, ok = exec.capture(diff, { "-rq", left, right })
    return not ok
  end
  if not exec.is_file(left) and not exec.is_file(right) then
    return false
  end
  local cmp = exec.resolve_tool("cmp")
  if not cmp then return true end
  local _, ok = exec.capture(cmp, { "-s", left, right })
  return not ok
end

-- 元数据是否脏(本机状态与镜像不一致)。
-- 注意:dotfiles 的脏判定在 status.lua 里由 mise 负责,这里只看元数据。
function M.mirror_dirty(mirror)
  local mktemp = exec.resolve_tool("mktemp")
  if not mktemp then return true end
  local tmp = (exec.capture(mktemp, { "-d" }) or ""):gsub("%s+$", "")
  if tmp == "" then return true end
  local plugins_known = true
  M.export_current(tmp)
  packages.export_packages(tmp)
  if not plugins.export_plugins(tmp, "check") then
    plugins_known = false
  end
  local dirty = false
  if trees_differ(mirror .. "/current", tmp .. "/current") then dirty = true end
  if not dirty and trees_differ(mirror .. "/packages", tmp .. "/packages") then dirty = true end
  if not dirty and plugins_known then
    if trees_differ(mirror .. "/plugins.json", tmp .. "/plugins.json") then dirty = true end
    if not dirty and (exec.is_dir(mirror .. "/plugins-local") or exec.is_dir(tmp .. "/plugins-local")) then
      if trees_differ(mirror .. "/plugins-local", tmp .. "/plugins-local") then dirty = true end
    end
  end
  if not dirty then
    local out = common.git_out({ "-C", mirror, "status", "--porcelain" })
    if out and out:match("%S") then dirty = true end
  end
  os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
  return dirty
end

return M
