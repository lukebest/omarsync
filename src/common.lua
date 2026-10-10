-- 公共路径、配置读写、日志、锁状态、scope 解析与安全校验。
-- 对应原 lib/common.sh。锁本身由 bin/omarsync(bash wrapper)用 flock 持有,
-- 这里只负责"探测锁是否被别的进程持有"(status 的 running 标志)。

local exec = require("exec")

local M = {}

M.PLUGIN_ID = "io.github.lukebest.omarsync"
M.MAX_FILE_SIZE = "50m"
M.BACKUP_KEEP = 5

-- 全局开关(由 main.lua 根据命令行设置)
M.QUIET = false
M.NOTIFY = false

local HOME = assert(os.getenv("HOME"), "HOME is not set")

-- ===== 日志 =====

function M.log(msg)
  if M.QUIET then return end
  io.write("omarsync: " .. msg .. "\n")
end

function M.warn(msg)
  io.stderr:write("omarsync: " .. msg .. "\n")
  -- 同时追加到 last.log,面板可以查看
  local logf = M.state_dir() .. "/last.log"
  os.execute("/usr/bin/mkdir -p " .. exec.quote(M.state_dir()))
  local fh = io.open(logf, "a")
  if fh then
    fh:write(M.iso8601() .. " omarsync: " .. msg .. "\n")
    fh:close()
  end
end

function M.die(msg)
  io.stderr:write("omarsync: " .. msg .. "\n")
  os.exit(1)
end

-- ===== 路径 =====

function M.config_file() return HOME .. "/.config/omarsync/config" end
function M.state_dir() return HOME .. "/.local/state/omarsync" end
function M.mirror_dir() return M.state_dir() .. "/repo" end
function M.backup_dir() return M.state_dir() .. "/backup" end
function M.local_scope_file() return HOME .. "/.config/omarsync/scope" end

-- 插件仓库根目录(main.lua 启动时注入,取自 wrapper 传来的 OMARSYNC_ROOT)
M.ROOT = os.getenv("OMARSYNC_ROOT") or "."

-- ===== 小工具 =====

function M.trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- 本地时区的 ISO8601(等价 date -Iseconds)
function M.iso8601()
  local t = os.time()
  local local_str = os.date("%Y-%m-%dT%H:%M:%S", t)
  -- 用 UTC 与本地时间的差算出时区偏移
  local utc = os.time(os.date("!*t", t))
  local localt = os.time(os.date("*t", t))
  local diff = os.difftime(localt, utc)
  local sign = diff >= 0 and "+" or "-"
  diff = math.abs(diff)
  return string.format("%s%s%02d:%02d", local_str, sign, diff // 3600, (diff % 3600) // 60)
end

function M.hostname_safe()
  local name = ""
  local fh = io.open("/etc/hostname", "r")
  if fh then
    name = fh:read("*l") or ""
    fh:close()
  end
  name = name:gsub("[^A-Za-z0-9._-]", "")
  if name == "" then name = "unknown" end
  return name
end

function M.mkdirp(path)
  os.execute("/usr/bin/mkdir -p " .. exec.quote(path))
end

-- 读整个文件;不存在返回 nil
function M.read_file(path)
  local fh = io.open(path, "rb")
  if not fh then return nil end
  local data = fh:read("*a")
  fh:close()
  return data
end

function M.write_file(path, data)
  local fh = io.open(path, "wb")
  if not fh then return false end
  fh:write(data)
  fh:close()
  return true
end

-- ===== 配置读写(~/.config/omarsync/config,KEY=VALUE 格式)=====

function M.config_get(key)
  local data = M.read_file(M.config_file())
  if not data then return nil end
  local value
  -- 取最后一处出现(与 bash 版 grep | tail -1 一致)
  for line in data:gmatch("[^\n]+") do
    local k, v = line:match("^([A-Z_]+)=(.*)$")
    if k == key then value = v end
  end
  return value
end

function M.config_set(key, value)
  local file = M.config_file()
  M.mkdirp(HOME .. "/.config/omarsync")
  local lines = {}
  local data = M.read_file(file)
  if data then
    for line in data:gmatch("[^\n]+") do
      if not line:match("^" .. key .. "=") then
        lines[#lines + 1] = line
      end
    end
  end
  lines[#lines + 1] = key .. "=" .. value
  M.write_file(file, table.concat(lines, "\n") .. "\n")
end

function M.configured_repo()
  return M.config_get("REPO") or ""
end

function M.configured_branch()
  return M.config_get("BRANCH") or "main"
end

function M.valid_repo_name(s)
  return type(s) == "string" and s:match("^[A-Za-z0-9_.%-]+/[A-Za-z0-9_.%-]+$") ~= nil
end

-- dotfiles 仓库地址:mise dot origin 用;默认取元数据仓库的兄弟仓库
function M.dot_repo_name()
  local repo = M.configured_repo()
  if repo == "" then return "" end
  local owner = repo:match("^(.+)/[^/]+$")
  return (owner or repo) .. "/omarchy-dotfiles"
end

function M.dot_origin_url()
  local override = os.getenv("OMARSYNC_DOT_ORIGIN")
  if override and override ~= "" then return override end
  return "https://github.com/" .. M.dot_repo_name() .. ".git"
end

-- ===== 工具初始化 =====

-- 必需工具(缺失即拒绝运行)与可选工具
function M.require_tools()
  local missing = {}
  local required = { "git", "rsync", "ssh-keygen", "date", "lua" }
  for _, name in ipairs(required) do
    if not exec.resolve_tool(name) then missing[#missing + 1] = name end
  end
  -- 可选工具:解析失败也不致命
  local optional = {
    "gh", "pacman", "omarchy", "omarchy-shell", "omarchy-notification-send",
    "hyprctl", "flatpak", "ostree", "systemctl", "mise", "diff", "cmp",
    "find", "mktemp", "stat", "od", "flock",
  }
  for _, name in ipairs(optional) do
    exec.resolve_tool(name)
  end
  if #missing > 0 then
    M.die("missing trusted tools: " .. table.concat(missing, " "))
  end
end

function M.tool(name)
  return exec.resolve_tool(name)
end

-- git 包装:禁用 hooks,指定 ssh-keygen 作为签名程序
function M.git(args, opts)
  local git = exec.resolve_tool("git") or M.die("git is not available")
  local keygen = exec.resolve_tool("ssh-keygen") or M.die("ssh-keygen is not available")
  local full = { "-c", "core.hooksPath=/dev/null", "-c", "gpg.ssh.program=" .. keygen }
  for _, a in ipairs(args) do full[#full + 1] = a end
  if opts and opts.capture then
    return exec.capture(git, full, opts)
  end
  return exec.run(git, full, opts and opts.env)
end

-- git 捕获输出的便捷形式(去掉尾部换行)
function M.git_out(args)
  local out, ok = M.git(args, { capture = true })
  if not ok then return nil end
  return (out:gsub("%s+$", ""))
end

function M.rsync(args, opts)
  local bin = exec.resolve_tool("rsync") or M.die("rsync is not available")
  if opts and opts.capture then
    return exec.capture(bin, args, opts)
  end
  return exec.run(bin, args)
end

function M.gh(args, opts)
  local bin = exec.resolve_tool("gh") or M.die("GitHub CLI is not installed in a trusted directory")
  if opts and opts.capture then
    return exec.capture(bin, args, opts)
  end
  return exec.run(bin, args)
end

function M.gh_installed()
  return exec.resolve_tool("gh") ~= nil
end

function M.gh_logged_in()
  if not M.gh_installed() then return false end
  local _, ok = M.gh({ "auth", "status" }, { capture = true })
  return ok
end

function M.github_user()
  if not M.gh_logged_in() then return nil end
  local out, ok = M.gh({ "api", "user", "--jq", ".login" }, { capture = true })
  if not ok then return nil end
  return (out:gsub("%s+$", ""))
end

function M.omarchy(args)
  local bin = exec.resolve_tool("omarchy") or M.die("omarchy is not installed in a trusted directory")
  return exec.run(bin, args)
end

function M.omarchy_shell(args)
  local bin = exec.resolve_tool("omarchy-shell") or M.die("omarchy-shell is not installed in a trusted directory")
  return exec.run(bin, args)
end

function M.notify(headline, body)
  if not M.NOTIFY then return end
  local bin = exec.resolve_tool("omarchy-notification-send")
  if not bin then return end
  local args = { "--app-name", "omarsync", headline }
  if body and body ~= "" then args[#args + 1] = body end
  exec.run(bin, args)
end

-- ===== 锁 =====

function M.lock_file()
  return M.state_dir() .. "/omarsync.lock"
end

-- 另一个 omarsync 进程是否持有锁(不取锁,只探测)
function M.is_running()
  local flock = exec.resolve_tool("flock")
  if not flock then return false end
  M.mkdirp(M.state_dir())
  -- flock -n <file> -c true:拿不到锁则退出码非 0
  local ok = exec.run(flock, { "-n", M.lock_file(), "-c", "true" })
  return not ok
end

-- ===== scope 解析与安全校验 =====

-- 禁用的相对路径:秘密目录与循环依赖目录
local BANNED_PATHS = {
  ".ssh",
  ".config/gh",
  ".config/git",
  ".config/omarsync",
  ".gnupg",
  ".aws",
  ".kube",
  ".docker",
  ".netrc",
  ".npmrc",
  ".config/npm",
  ".password-store",
  ".local/share/keyrings",
  ".local/state/omarsync",
  ".config/doubao-murmur",
  ".var",
  -- mise 自身的配置与状态:同步它们会循环
  ".config/mise",
  ".local/share/mise",
  ".local/state/mise",
}

-- 插件目录含可执行代码,只能走签名快照路径,不允许被 scope 直接命名;
-- 但 .config/omarchy 这样的父级是允许的(用 plugins/ 排除模式隔开)
local PLUGINS_REL = ".config/omarchy/plugins"

-- 凭证类文件名(按 basename 拦)
local function banned_basename(base)
  if base:match("^id_rsa") or base:match("^id_ecdsa") or base:match("^id_ed25519") then
    return true
  end
  if base == "credentials" or base == "credentials.json" then return true end
  if base:match("%.pem$") or base:match("%.key$") then return true end
  return false
end

function M.assert_safe_rel(rel)
  if rel == "" or rel == "." or rel == ".." then
    M.die("invalid scope path: '" .. rel .. "'")
  end
  if rel:sub(1, 1) == "/" then
    M.die("scope path must be relative to $HOME: '" .. rel .. "'")
  end
  if rel:find("%.%.") then
    M.die("scope path may not contain '..': '" .. rel .. "'")
  end
  if rel:find("\n") then
    M.die("scope path may not contain a newline")
  end
  if rel:find("*") or rel:find("?") then
    M.die("scope path may not contain globs: '" .. rel .. "'")
  end
  if rel == PLUGINS_REL or rel:sub(1, #PLUGINS_REL + 1) == PLUGINS_REL .. "/" then
    M.die("scope path '" .. rel .. "' names the plugin directory; it syncs only through signed snapshots")
  end
  for _, banned in ipairs(BANNED_PATHS) do
    if rel == banned or rel:sub(1, #banned + 1) == banned .. "/"
      or banned:sub(1, #rel + 1) == rel .. "/" then
      M.die("scope path '" .. rel .. "' includes secret location " .. banned)
    end
  end
  local base = rel:match("[^/]+$")
  if banned_basename(base) then
    M.die("scope path '" .. rel .. "' names a credential file")
  end
end

-- 确保本机 scope 文件存在;不存在则从仓库自带示例复制
function M.ensure_local_scope()
  local file = M.local_scope_file()
  if exec.is_file(file) then return end
  M.mkdirp(HOME .. "/.config/omarsync")
  local example = M.ROOT .. "/omarsync.scope.example"
  os.execute(string.format("/usr/bin/cp %s %s && /usr/bin/chmod 644 %s",
    exec.quote(example), exec.quote(file), exec.quote(file)))
end

-- 采集与应用只读本机这份 scope;镜像里的 scope 是远程内容,永不采信
function M.scope_file_for()
  M.ensure_local_scope()
  return M.local_scope_file()
end

-- 解析 scope 文件,返回数组 { {rel=..., excludes={...}}, ... };非法路径直接 die
function M.read_scope(file)
  local entries = {}
  if not exec.is_file(file) then return entries end
  local data = M.read_file(file) or ""
  for raw in (data .. "\n"):gmatch("([^\n]*)\n") do
    local line = M.trim(raw)
    if line ~= "" and line:sub(1, 1) ~= "#" then
      local rel, csv
      if line:find("|", 1, true) then
        rel = M.trim(line:match("^(.-)|"))
        csv = M.trim(line:match("|(.*)$") or "")
      else
        rel, csv = line, ""
      end
      M.assert_safe_rel(rel)
      local excludes = {}
      for raw_part in csv:gmatch("[^,]+") do
        local part = M.trim(raw_part)
        if part ~= "" then excludes[#excludes + 1] = part end
      end
      entries[#entries + 1] = { rel = rel, excludes = excludes }
    end
  end
  return entries
end

-- 从镜像中删除任何远程 scope 文件(它不是策略)
function M.discard_remote_scope(mirror)
  if not exec.is_dir(mirror) then return end
  local f = mirror .. "/omarsync.scope"
  if exec.exists(f) or exec.is_link(f) then
    os.remove(f)
  end
  if exec.is_dir(mirror .. "/.git") then
    local out = M.git_out({ "-C", mirror, "ls-files", "--error-unmatch", "--", "omarsync.scope" })
    if out then
      M.git({ "-C", mirror, "rm", "-q", "--ignore-unmatch", "--", "omarsync.scope" }, { capture = true })
    end
  end
end

-- ===== git 身份 =====

function M.ensure_identity(mirror)
  local email = M.config_get("SIGNING_EMAIL")
  local name = M.config_get("SIGNING_NAME")
  if not email then
    if M.gh_logged_in() then
      if not name then
        local out = M.gh({ "api", "user", "--jq", ".name // .login" }, { capture = true })
        if out then name = (out:gsub("%s+$", "")) end
      end
      local login_out = M.gh({ "api", "user", "--jq", ".login" }, { capture = true })
      local id_out = M.gh({ "api", "user", "--jq", ".id" }, { capture = true })
      local login = login_out and (login_out:gsub("%s+$", "")) or ""
      local id = id_out and (id_out:gsub("%s+$", "")) or ""
      if login ~= "" and id ~= "" then
        email = id .. "+" .. login .. "@users.noreply.github.com"
      end
    end
    email = email or "omarsync@localhost"
  end
  M.git({ "-C", mirror, "config", "user.name", (name and name ~= "") and name or "Omarsync" })
  M.git({ "-C", mirror, "config", "user.email", email })

  local signing_key = M.config_get("SIGNING_KEY")
  if signing_key and exec.is_file(signing_key) then
    M.git({ "-C", mirror, "config", "gpg.format", "ssh" })
    M.git({ "-C", mirror, "config", "user.signingkey", signing_key })
    M.git({ "-C", mirror, "config", "commit.gpgsign", "true" })
  end
end

function M.write_config(repo, branch)
  M.config_set("REPO", repo)
  M.config_set("BRANCH", branch)
end

function M.mirror_ready()
  return exec.is_dir(M.mirror_dir() .. "/.git")
end

-- 标准输入是否为终端(交互提示用)
function M.stdin_is_tty()
  -- 用 test -t 0 判断;通过 sh -c 让文件描述符继承
  local ok = os.execute("/usr/bin/test -t 0 && /usr/bin/test -t 1")
  return ok == true or ok == 0
end

-- 判断 a 是否等于 b 或位于 b 之下(路径前缀比较,纯字符串)
function M.path_within(a, b)
  return a == b or a:sub(1, #b + 1) == b .. "/"
end

return M
