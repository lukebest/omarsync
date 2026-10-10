-- omarsync 入口:命令分发、usage、全局开关。
-- 由 bin/omarsync(bash wrapper,负责清洗环境)以 /usr/bin/lua 启动。

-- 模块搜索路径:src/ 目录本身
local src = arg and arg[0] and arg[0]:match("^(.*)/[^/]*$") or "."
package.path = src .. "/?.lua;" .. package.path

local common = require("common")
local cmds = require("cmds")
local status_mod = require("status")
local trust = require("trust")

local USAGE = [[
Usage: omarsync <command> [options]

Commands:
  status [--json]     Show login, repo, and whether this machine differs
  doctor              Check git, rsync, lua, mise, gh, and the local mirror
  login               Sign in with GitHub CLI (device code, interactive)
  init [owner/name]   Create or clone the private data repository and
                      connect the mise dot origin (omarchy-dotfiles)
  push [--quiet] [--notify]
                      Track scope files with mise dot, save a checkpoint,
                      commit signed metadata, push both. --quiet skips the notification
  trust-key <pub> [priv]
                      Trust an SSH signing key. Push does this for its own key.
  pull                Fetch once and detach the mirror at that exact commit
  apply --commit <40-hex> [--no-packages] [--no-exec] [--trust-signer] [--force]
                      Apply that commit. The SHA must be the one you reviewed.
                      Files arrive via mise dot pull; packages, plugins, and
                      hooks run only for a trusted signature, unless
                      --no-exec or --force is set.
  setup               Install mise/GitHub CLI if needed, sign in, create the repositories
  sync [--quiet] [--notify]
                      push, then pull
  migrate             Move an old rsync-mirror repository to the mise dot layout
  scope-path          Print the local scope file path

Files sync through mise dot (track mode; the remote is <github-user>/omarchy-dotfiles).
Signed metadata (packages, plugins, hooks, theme) stays in <github-user>/omarchy-config.
Set OMARSYNC_ORIGIN / OMARSYNC_DOT_ORIGIN to use non-GitHub remotes.
]]

-- 退出时刷新一次 status.json(面板通过它感知状态变化)
local function status_trap()
  if status_mod.written then return end
  local ok = pcall(function()
    local st = status_mod.collect()
    status_mod.write_json(st)
  end)
  if not ok then
    -- 状态刷新失败不影响主命令的退出码
  end
end

local function main(argv)
  local cmd = argv[1] or "status"
  local args = {}
  for i = 2, #argv do args[#args + 1] = argv[i] end

  local rc = 0
  if cmd == "-h" or cmd == "--help" or cmd == "help" then
    io.write(USAGE)
  elseif cmd == "status" then
    rc = status_mod.cmd_status(args)
  elseif cmd == "doctor" then
    rc = cmds.cmd_doctor()
  elseif cmd == "login" then
    rc = cmds.cmd_login()
  elseif cmd == "trust-key" then
    trust.cmd_trust_key(args)
  elseif cmd == "init" then
    rc = cmds.cmd_init(args)
  elseif cmd == "setup" then
    rc = cmds.cmd_setup()
  elseif cmd == "push" or cmd == "sync" then
    common.NOTIFY = true
    for _, a in ipairs(args) do
      if a == "--quiet" then
        common.QUIET = true
        common.NOTIFY = false
      elseif a == "--notify" then
        common.NOTIFY = true
      else
        common.die("unknown " .. cmd .. " option: " .. a)
      end
    end
    rc = cmds.cmd_push()
    if rc == 0 and cmd == "sync" then
      rc = cmds.cmd_pull()
    end
  elseif cmd == "pull" then
    rc = cmds.cmd_pull()
  elseif cmd == "apply" then
    rc = cmds.cmd_apply(args)
  elseif cmd == "migrate" then
    rc = cmds.cmd_migrate()
  elseif cmd == "scope-path" then
    rc = cmds.cmd_scope_path()
  else
    io.stderr:write(USAGE)
    common.die("unknown command: " .. cmd)
  end
  return rc or 0
end

common.require_tools()
local rc = main(arg)
status_trap()
os.exit(rc)
