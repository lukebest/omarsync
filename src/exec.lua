-- 受限进程执行:所有外部命令都以清洗过的环境、固定 PATH、
-- 绝对路径的可信二进制运行。对应原 lib/common.sh 的 resolve_tool/run_restricted。

local M = {}

-- 可信目录:工具只从这些目录里挑
M.TRUSTED_DIRS = { "/usr/bin", "/bin", "/usr/sbin", "/usr/share/omarchy/bin" }
M.TRUSTED_PATH = table.concat(M.TRUSTED_DIRS, ":")

-- 已解析的工具路径缓存:name -> 绝对路径(或 false 表示不存在)
M.tools = {}

-- shell 单引号转义:' → '\''
function M.quote(s)
  s = tostring(s)
  return "'" .. s:gsub("'", "'\\''") .. "'"
end

-- 简单存在性/属性测试(通过 /usr/bin/test,避免依赖 lfs)
local function test_flag(flag, path)
  local ok = os.execute(string.format("/usr/bin/test %s %s", flag, M.quote(path)))
  -- Lua 5.4+:os.execute 返回 true/"exit"/0 形式
  return ok == true or ok == 0
end

M.is_exec = function(p) return test_flag("-x", p) and not test_flag("-d", p) end
M.is_file = function(p) return test_flag("-f", p) end
M.is_dir = function(p) return test_flag("-d", p) end
M.is_link = function(p) return test_flag("-L", p) end
M.exists = function(p) return test_flag("-e", p) end
M.is_writable = function(p) return test_flag("-w", p) end

-- 捕获命令 stdout(命令已完整转义拼接);返回 stdout、是否成功
function M.capture_raw(cmdline)
  local fh = io.popen(cmdline .. " 2>/dev/null")
  if not fh then return nil, false end
  local out = fh:read("*a") or ""
  local ok = fh:close()
  return out, ok == true or ok == 0
end

-- realpath -e 包装
function M.realpath(path, must_exist)
  local args = must_exist == false and "" or "-e "
  local out, ok = M.capture_raw("/usr/bin/realpath " .. args .. M.quote(path))
  if not ok then return nil end
  return (out:gsub("%s+$", ""))
end

-- 解析可信工具:必须在可信目录内、realpath 仍指向可信目录、且不可写
function M.resolve_tool(name)
  if M.tools[name] ~= nil then
    return M.tools[name] or nil
  end
  if not name:match("^[A-Za-z0-9._+%-]+$") then
    M.tools[name] = false
    return nil
  end
  for _, dir in ipairs(M.TRUSTED_DIRS) do
    local candidate = dir .. "/" .. name
    if M.is_exec(candidate) then
      local real = M.realpath(candidate)
      if real then
        local ok = false
        for _, prefix in ipairs(M.TRUSTED_DIRS) do
          if real == prefix or real:sub(1, #prefix + 1) == prefix .. "/" then
            ok = true
            break
          end
        end
        if ok and not M.is_writable(real) then
          M.tools[name] = real
          return real
        end
      end
    end
  end
  M.tools[name] = false
  return nil
end

-- 拼接受限环境(env -i 后面的 KEY=VALUE 列表)
local function env_args(extra)
  local vars = {
    "HOME=" .. (os.getenv("HOME") or ""),
    "USER=" .. (os.getenv("USER") or ""),
    "LOGNAME=" .. (os.getenv("LOGNAME") or os.getenv("USER") or ""),
    "PATH=" .. M.TRUSTED_PATH,
    "LANG=C.UTF-8",
    "LC_ALL=C.UTF-8",
    "OMARCHY_PATH=/usr/share/omarchy",
    "GIT_TERMINAL_PROMPT=0",
    "GIT_EDITOR=/usr/bin/true",
    "GH_PROMPT_DISABLED=1",
  }
  local runtime = os.getenv("XDG_RUNTIME_DIR")
  if runtime and runtime ~= "" then
    vars[#vars + 1] = "XDG_RUNTIME_DIR=" .. runtime
  end
  if extra then
    for _, v in ipairs(extra) do vars[#vars + 1] = v end
  end
  local parts = {}
  for _, v in ipairs(vars) do parts[#parts + 1] = M.quote(v) end
  return table.concat(parts, " ")
end

-- 运行可信程序,继承终端(交互场景);返回是否成功、退出码
function M.run(exe, args, env_extra)
  assert(exe:sub(1, 1) == "/" and M.is_exec(exe) and not M.is_writable(exe),
    "refusing to run an untrusted program: " .. tostring(exe))
  local parts = { "/usr/bin/env -i", env_args(env_extra), M.quote(exe) }
  for _, a in ipairs(args or {}) do parts[#parts + 1] = M.quote(a) end
  local cmdline = table.concat(parts, " ")
  local _, how, code = os.execute(cmdline)
  if how == "exit" then
    return code == 0, code
  end
  -- 信号等异常退出
  return false, -1
end

-- 运行可信程序并捕获 stdout;stderr 可重定向到指定文件(默认丢弃)
function M.capture(exe, args, opts)
  opts = opts or {}
  local parts = { "/usr/bin/env -i", env_args(opts.env), M.quote(exe) }
  for _, a in ipairs(args or {}) do parts[#parts + 1] = M.quote(a) end
  local cmdline = table.concat(parts, " ")
  if opts.merge_stderr then
    cmdline = cmdline .. " 2>&1"
  elseif opts.stderr_file then
    cmdline = cmdline .. " 2>" .. M.quote(opts.stderr_file)
  elseif not opts.keep_stderr then
    cmdline = cmdline .. " 2>/dev/null"
  end
  local fh = io.popen(cmdline)
  if not fh then return nil, false, -1 end
  local out = fh:read("*a") or ""
  local _, how, code = fh:close()
  if how == "exit" then
    return out, code == 0, code
  end
  return out, false, -1
end

return M
