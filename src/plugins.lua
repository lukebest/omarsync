-- 第三方 Omarchy shell 插件的导出与安装。逻辑 1:1 移植自 lib/plugins.sh。
-- https 插件按 commit 钉住;无远程的插件整体复制进快照(符号链接被剥掉)。

local common = require("common")
local exec = require("exec")
local json = require("json")
local trust = require("trust")

local M = {}

local HOME = os.getenv("HOME")

local function plugin_dir(id)
  return HOME .. "/.config/omarchy/plugins/" .. id
end

local function valid_plugin_id(id)
  return type(id) == "string"
    and id:match("^[A-Za-z0-9][A-Za-z0-9._%-]*$") ~= nil
    and not id:find("..", 1, true)
    and not id:match("^omarchy%.")
end

local function https_plugin_url(url)
  if type(url) ~= "string" or url:find("..", 1, true) then return false end
  return url:match("^https://[A-Za-z0-9._~:/?#%%+%-]+$") ~= nil
end

local function local_plugin_url(url)
  return type(url) == "string"
    and url:match("^file:///") ~= nil
    and not url:find("..", 1, true)
    and not url:find("\n")
end

-- 读取 omarchy plugin list --json;失败返回 nil
local function list_plugins()
  local omarchy = exec.resolve_tool("omarchy")
  if not omarchy then return nil end
  local out, ok = exec.capture(omarchy, { "plugin", "list", "--json" })
  if not ok then return nil end
  local data = json.decode(out)
  -- 必须是一个数组
  if type(data) ~= "table" then return nil end
  if data[1] ~= nil and type(data[1]) ~= "table" then return nil end
  -- 空 table 视为空数组
  return data
end

-- mode: "apply"(写快照)或 "check"(只探测,不动现有快照)
-- check 模式返回 false 表示"清单不可用"(调用方按未知处理)
function M.export_plugins(dest, mode)
  local listing = list_plugins()
  if not listing then
    if mode == "check" then
      return false
    end
    if exec.is_file(dest .. "/plugins.json") then
      common.warn("plugin list unavailable; keeping existing plugins.json")
      return true
    end
    common.write_file(dest .. "/plugins.json", "[]\n")
    common.warn("plugin list unavailable; wrote an empty plugins.json")
    return true
  end

  if mode == "apply" then
    os.execute("/usr/bin/rm -rf " .. exec.quote(dest .. "/plugins-local"))
  end

  local records = {}
  for _, row in ipairs(listing) do
    if row.firstParty ~= true then
      local id = row.id
      if valid_plugin_id(id) and id ~= common.PLUGIN_ID then
        local enabled = row.enabled == true
        local dir = plugin_dir(id)
        local url, rev
        if exec.is_dir(dir .. "/.git") then
          url = common.git_out({ "-C", dir, "remote", "get-url", "origin" })
          rev = common.git_out({ "-C", dir, "rev-parse", "--verify", "HEAD" })
          if not trust.is_full_sha(rev) then rev = nil end
        end
        if url and https_plugin_url(url) and rev then
          records[#records + 1] = { id = id, url = url, commit = rev, enabled = enabled, local_ = false, key = id }
        elseif exec.is_dir(dir) and mode == "apply" then
          M.copy_local_plugin(dir, dest .. "/plugins-local/" .. id)
          records[#records + 1] = { id = id, url = "", commit = "", enabled = enabled, local_ = true, key = id }
        end
      end
    end
  end

  -- 按 id 排序,保证输出稳定
  table.sort(records, function(a, b) return a.id < b.id end)
  local arr = {}
  for _, r in ipairs(records) do
    arr[#arr + 1] = {
      id = r.id,
      url = r.url,
      commit = r.commit,
      enabled = r.enabled,
      ["local"] = r.local_,
    }
  end
  common.write_file(dest .. "/plugins.json", json.encode(arr, true) .. "\n")
  return true
end

function M.copy_local_plugin(src, dest)
  common.mkdirp(dest)
  common.rsync({
    "-a", "--delete", "--max-size=" .. common.MAX_FILE_SIZE,
    "--exclude", ".git/", "--exclude", "node_modules/",
    src .. "/", dest .. "/",
  })
  -- 剥掉快照里的所有符号链接(插件目录不允许符号链接)
  local find = exec.resolve_tool("find")
  local out = find and exec.capture(find, { dest, "-type", "l", "-print" }) or ""
  for line in (out or ""):gmatch("[^\n]+") do
    if line ~= "" then
      os.remove(line)
      common.warn("removed symlink from plugin snapshot: " .. line:sub(#dest + 2))
    end
  end
end

function M.install_missing_plugins(mirror, allow_exec)
  local file = mirror .. "/plugins.json"
  if not exec.is_file(file) then return true end
  if not allow_exec then
    common.warn("skipped plugin install; executable restore needs a trusted signature")
    return true
  end
  local data = json.decode_or_die(common.read_file(file) or "[]", "plugins.json")
  local failed = false
  local installed_any = false
  for _, row in ipairs(data) do
    local id = type(row.id) == "string" and row.id or ""
    local url = type(row.url) == "string" and row.url or ""
    local rev = type(row.commit) == "string" and row.commit or ""
    local enabled = row.enabled == true
    if not valid_plugin_id(id) then
      common.warn("skipping plugin with an invalid id")
      goto continue
    end
    if id == common.PLUGIN_ID then goto continue end
    local dest = plugin_dir(id)
    if exec.is_dir(dest) then
      if rev ~= "" and exec.is_dir(dest .. "/.git") then
        local head = common.git_out({ "-C", dest, "rev-parse", "--verify", "HEAD" })
        if head ~= rev then
          common.warn("plugin " .. id .. " is at " .. (head or "unknown") .. ", snapshot records " .. rev .. "; left it alone")
        end
      end
      goto continue
    end
    local mktemp = exec.resolve_tool("mktemp")
    local tmp = (exec.capture(mktemp, { "-d" }) or ""):gsub("%s+$", "")
    if tmp == "" then
      failed = true
      goto continue
    end
    local ok_to_install = false
    if (https_plugin_url(url) or local_plugin_url(url)) and trust.is_full_sha(rev) then
      if not common.git({ "clone", "--quiet", "--no-checkout", url, tmp .. "/plugin" }) then
        common.warn("failed to clone plugin " .. id .. " from " .. url)
        os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
        failed = true
        goto continue
      end
      if not common.git({ "-C", tmp .. "/plugin", "checkout", "--quiet", "--detach", rev }) then
        common.warn("plugin " .. id .. " does not contain commit " .. rev)
        os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
        failed = true
        goto continue
      end
      local head = common.git_out({ "-C", tmp .. "/plugin", "rev-parse", "--verify", "HEAD" })
      if head ~= rev then
        common.warn("plugin " .. id .. " checkout " .. tostring(head) .. " is not " .. rev)
        os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
        failed = true
        goto continue
      end
      ok_to_install = true
    elseif row["local"] == true and exec.is_dir(mirror .. "/plugins-local/" .. id) then
      common.mkdirp(tmp .. "/plugin")
      common.rsync({ "-a", mirror .. "/plugins-local/" .. id .. "/", tmp .. "/plugin/" })
      ok_to_install = true
    else
      common.warn("not installing plugin " .. id .. "; no pinned https commit or local snapshot")
      os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
      goto continue
    end
    if ok_to_install then
      if not common.omarchy({ "plugin", "validate", tmp .. "/plugin" }) then
        common.warn("plugin " .. id .. " failed validation; not installed")
        os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
        failed = true
        goto continue
      end
      common.mkdirp(HOME .. "/.config/omarchy/plugins")
      os.execute("/usr/bin/rm -rf " .. exec.quote(dest))
      os.execute(string.format("/usr/bin/mv %s %s", exec.quote(tmp .. "/plugin"), exec.quote(dest)))
      os.execute("/usr/bin/rm -rf " .. exec.quote(tmp))
      common.log("installed plugin " .. id)
      installed_any = true
      if enabled and os.getenv("OMARSYNC_SKIP_LIVE") ~= "1" then
        if not common.omarchy({ "plugin", "enable", id }) then
          common.warn("could not enable plugin " .. id)
        end
      end
    end
    ::continue::
  end
  if installed_any and os.getenv("OMARSYNC_SKIP_LIVE") ~= "1" and exec.resolve_tool("omarchy-shell") then
    if not common.omarchy_shell({ "shell", "rescanPlugins" }) then
      common.warn("shell plugin rescan failed")
    end
  end
  return not failed
end

return M
