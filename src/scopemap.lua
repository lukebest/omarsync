-- scope 文件 → mise dot 跟踪条目的幂等转换。
-- scope(~/.config/omarsync/scope)仍是唯一事实来源;
-- reconcile 在 push / init / migrate 时运行,把 track 集合与排除 glob 对齐。

local common = require("common")
local mise = require("mise")
local exec = require("exec")

local M = {}

-- 恒排除:任何跟踪目录里的 .git 与 node_modules
local CONST_EXCLUDES = {
  "**/.git/**",
  "**/.git",
  "**/node_modules/**",
  "**/node_modules",
  -- 信任目录绝不能进历史(双保险;scope 本身已禁)
  "~/.config/omarsync/**",
  "~/.config/omarsync",
}

-- 把一条 rsync 风格的排除模式转换为路径限定的 glob 列表。
-- rsync 里不带 / 的模式匹配任意层级;末尾 / 表示目录。
local function pattern_to_globs(root, pat)
  local globs = {}
  local base = "~/" .. root
  if pat:sub(-1) == "/" then
    -- 目录模式:plugins/
    local dir = pat:sub(1, -2)
    globs[#globs + 1] = base .. "/" .. dir .. "/**"
    globs[#globs + 1] = base .. "/" .. dir
    if not dir:find("/", 1, true) then
      globs[#globs + 1] = base .. "/**/" .. dir .. "/**"
      globs[#globs + 1] = base .. "/**/" .. dir
    end
  elseif pat:find("/", 1, true) then
    -- 带路径的模式只匹配根部
    globs[#globs + 1] = base .. "/" .. pat
  else
    -- 裸名字匹配任意层级
    globs[#globs + 1] = base .. "/" .. pat
    globs[#globs + 1] = base .. "/**/" .. pat
  end
  return globs
end

-- 计算 reconcile 之后应当存在的全部排除 glob(集合)
function M.desired_excludes(entries)
  local set = {}
  for _, g in ipairs(CONST_EXCLUDES) do set[g] = true end
  for _, e in ipairs(entries) do
    for _, pat in ipairs(e.excludes) do
      for _, g in ipairs(pattern_to_globs(e.rel, pat)) do
        set[g] = true
      end
    end
  end
  return set
end

-- 幂等对齐:track 集合 = scope 条目;排除集合 = desired_excludes。
-- omarsync 拥有这台机器的 mise dot 配置;scope 之外的手动 track 会被 untrack。
function M.reconcile()
  if not mise.available() then
    common.die("mise is not installed. Run: omarchy pkg add mise")
  end
  if not mise.feature_ok() then
    common.die("mise dot is not working on this machine; check `mise dot status`")
  end
  local entries = common.read_scope(common.scope_file_for())
  local wanted = {}
  for _, e in ipairs(entries) do
    wanted[e.rel] = true
    if not mise.tracked_rels()[e.rel] then
      if mise.track(e.rel) then
        common.log("tracking " .. e.rel)
      else
        common.warn("failed to track " .. e.rel)
      end
    end
  end
  -- untrack scope 之外的条目
  local tracked = mise.tracked_rels()
  for rel in pairs(tracked) do
    if not wanted[rel] then
      if mise.untrack(rel) then
        common.log("untracked " .. rel .. " (not in scope)")
      else
        common.warn("failed to untrack " .. rel)
      end
    end
  end
  -- 排除 glob 差量对齐
  local desired = M.desired_excludes(entries)
  for _, g in ipairs(mise.current_excludes()) do
    if not desired[g] then
      if not mise.exclude_del(g) then
        common.warn("failed to remove exclude " .. g)
      end
    end
  end
  for g in pairs(desired) do
    local have = false
    for _, cur in ipairs(mise.current_excludes()) do
      if cur == g then have = true break end
    end
    if not have then
      if not mise.exclude_add(g) then
        common.warn("failed to add exclude " .. g)
      end
    end
  end
end

-- 供预览/status 使用:当前 scope 条目列表
function M.entries()
  return common.read_scope(common.scope_file_for())
end

return M
