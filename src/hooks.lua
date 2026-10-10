-- post-apply hooks:由编写的机器放入 ~/.config/omarsync-hooks/post-apply.d,
-- push 时复制进签名快照;apply 仅对可信提交、确认一次后执行。
-- 1:1 移植自 lib/hooks.sh。

local common = require("common")
local exec = require("exec")

local M = {}

local HOME = os.getenv("HOME")

function M.hooks_source_dir()
  return HOME .. "/.config/omarsync-hooks/post-apply.d"
end

local function hook_names(dir)
  local names = {}
  if not exec.is_dir(dir) then return names end
  local find = exec.resolve_tool("find")
  local out = find and exec.capture(find, { dir, "-mindepth", "1", "-maxdepth", "1", "-type", "f", "!", "-type", "l", "-printf", "%f\n" }) or ""
  for name in (out or ""):gmatch("[^\n]+") do
    names[#names + 1] = name
  end
  table.sort(names)
  return names
end

function M.export_hooks(dest)
  os.execute("/usr/bin/rm -rf " .. exec.quote(dest .. "/hooks"))
  local src = M.hooks_source_dir()
  if not exec.is_dir(src) then return end
  common.mkdirp(dest .. "/hooks/post-apply.d")
  for _, name in ipairs(hook_names(src)) do
    if name:match("^[A-Za-z0-9._%-]+$") then
      os.execute(string.format("/usr/bin/cp -a %s %s",
        exec.quote(src .. "/" .. name), exec.quote(dest .. "/hooks/post-apply.d/")))
    end
  end
end

function M.list_hooks(mirror)
  return hook_names(mirror .. "/hooks/post-apply.d")
end

function M.run_hooks(mirror, allow_exec)
  local dir = mirror .. "/hooks/post-apply.d"
  if not allow_exec then
    if exec.is_dir(dir) then
      common.warn("skipped post-apply hooks; executable restore needs a trusted signature")
    end
    return true
  end
  if not exec.is_dir(dir) then return true end
  local failed = false
  for _, name in ipairs(hook_names(dir)) do
    local path = dir .. "/" .. name
    if not exec.is_exec(path) then
      os.execute("/usr/bin/chmod +x " .. exec.quote(path))
    end
    common.log("running hook " .. name)
    -- hooks 用系统 bash 执行(它们本身是 shell 脚本)
    local ok = exec.run("/usr/bin/bash", { path })
    if not ok then
      common.warn("hook " .. name .. " failed")
      failed = true
    end
  end
  return not failed
end

-- scope 覆盖 .config/systemd/user 时,apply 后重载用户服务
function M.refresh_user_services()
  local systemctl = exec.resolve_tool("systemctl")
  if not systemctl then return true end
  local wanted = false
  for _, e in ipairs(common.read_scope(common.scope_file_for())) do
    if e.rel == ".config/systemd/user" or e.rel:match("^%.config/systemd/user/")
      or e.rel == ".config/systemd" then
      wanted = true
      break
    end
  end
  if not wanted then return true end
  if not exec.is_dir(HOME .. "/.config/systemd/user") then return true end
  local runtime = os.getenv("XDG_RUNTIME_DIR")
  if not runtime or runtime == "" or not exec.exists(runtime .. "/systemd/private") then
    return true
  end
  local ok_all = true
  if not exec.run(systemctl, { "--user", "daemon-reload" }) then
    common.warn("systemctl --user daemon-reload failed")
    ok_all = false
  end
  -- 启动 *.target.wants 里链接的 service
  local find = exec.resolve_tool("find")
  local out = find and exec.capture(find, {
    HOME .. "/.config/systemd/user", "-type", "l",
    "-path", "*.target.wants/*", "-printf", "%f\n",
  }) or ""
  for unit in (out or ""):gmatch("[^\n]+") do
    if unit:match("%.service$") then
      if not exec.run(systemctl, { "--user", "start", unit }) then
        common.warn("could not start " .. unit)
        ok_all = false
      end
    end
  end
  return ok_all
end

return M
