-- 各子命令实现:doctor/login/init/setup/push/pull/apply/sync/migrate/scope-path。
-- 文件同步内核是 mise dot;元数据仓库(签名、包、插件、hooks)沿用原有模型。

local common = require("common")
local exec = require("exec")
local json = require("json")
local trust = require("trust")
local meta = require("meta")
local mise = require("mise")
local scopemap = require("scopemap")
local apply_mod = require("apply")
local status_mod = require("status")

local M = {}

local function require_mirror()
  if not common.mirror_ready() then
    common.die("not initialized. Run: omarsync init")
  end
end

function M.cmd_doctor()
  local missing = false
  for _, tool in ipairs({ "git", "rsync", "lua", "mise" }) do
    if exec.resolve_tool(tool) then
      common.log("ok  " .. tool)
    else
      common.warn("missing " .. tool .. (tool == "lua" and ". Run: omarchy pkg add lua"
        or tool == "mise" and ". Run: omarchy pkg add mise" or ""))
      missing = true
    end
  end
  if common.gh_installed() then
    if common.gh_logged_in() then
      common.log("ok  gh (" .. (common.github_user() or "?") .. ")")
    else
      common.warn("gh is installed but not logged in. Run: omarsync login")
    end
  else
    common.warn("missing gh. Run: omarchy pkg add github-cli")
    missing = true
  end
  if mise.available() then
    if mise.feature_ok() then
      common.log("ok  mise dot")
    else
      common.warn("mise dot is not working; check `mise dot status`")
      missing = true
    end
    if mise.origin_connected() then
      common.log("ok  mise dot origin connected")
    else
      common.warn("mise dot origin is not connected. Run: omarsync init")
    end
  end
  if common.mirror_ready() then
    common.log("ok  mirror " .. common.mirror_dir() .. " (" .. common.configured_repo() .. " " .. common.configured_branch() .. ")")
  else
    common.warn("mirror is not initialized. Run: omarsync init")
  end
  return missing and 1 or 0
end

function M.cmd_login()
  if not common.gh_installed() then
    common.die("GitHub CLI is not installed. Run: omarchy pkg add github-cli")
  end
  if common.gh_logged_in() then
    common.log("already logged in as " .. (common.github_user() or "?"))
    common.gh({ "auth", "setup-git" }, { capture = true })
    return 0
  end
  if not common.stdin_is_tty() then
    common.die("GitHub login needs a terminal. Run: omarsync login")
  end
  common.gh({ "auth", "login", "-h", "github.com", "-p", "https", "-w" })
  common.gh({ "auth", "setup-git" })
  common.log("logged in as " .. (common.github_user() or "?"))
  return 0
end

-- mise dot status 文本里是否有待应用的远程变更
local function mise_incoming_pending()
  local bin = exec.resolve_tool("mise")
  if not bin then return false end
  local status_out = exec.capture(bin, { "dot", "status" })
  return type(status_out) == "string"
    and status_out:find("incoming change%(s%) pending") ~= nil
end

-- 确保 dotfiles 仓库存在并连接 mise origin(幂等)。
-- 关键顺序:新机器连接已有仓库时,先整体 adopt 远程历史(pull),
-- 绝不在 pull 之前 reconcile/save——否则本地基线检查点会让两边历史
-- 变成 "unrelated",mise 拒绝合并。
local function ensure_dotfiles_repo(user)
  if not mise.available() then
    common.warn("mise is not installed; skipping dotfiles repository. Run: omarchy pkg add mise")
    return
  end
  if mise.origin_connected() then
    return
  end
  local url = common.dot_origin_url()
  if not os.getenv("OMARSYNC_DOT_ORIGIN") and not os.getenv("OMARSYNC_ORIGIN") then
    -- 只有 GitHub 流程才负责建仓库
    local dot_repo = common.dot_repo_name()
    local name = dot_repo:match("[^/]+$")
    if not select(2, common.gh({ "repo", "view", dot_repo }, { capture = true })) then
      common.log("creating private repository " .. dot_repo)
      common.gh({ "repo", "create", name, "--private", "--description", "Omarchy dotfiles synced by omarsync via mise" })
    end
  end
  if not mise.origin_set(url, "main") then
    common.warn("could not connect mise dot origin " .. url)
    return
  end
  common.log("connected mise dot origin " .. url)
  if mise_incoming_pending() then
    -- 接收方:直接采用远程历史(含远程声明的 track 条目)
    local out, ok = mise.pull({ take_remote_all = true, capture = true })
    if not ok then
      common.warn("mise adopt pull failed: " .. tostring(out or ""))
    end
  else
    -- 第一台机器(空仓库):从 scope 建立跟踪
    scopemap.reconcile()
  end
end

function M.cmd_init(args)
  local repo = args[1] or common.configured_repo()
  local branch = "main"
  local user

  if not os.getenv("OMARSYNC_ORIGIN") then
    if not common.gh_installed() then
      common.die("GitHub CLI is not installed. Run: omarchy pkg add github-cli")
    end
    if not common.gh_logged_in() then
      common.die("not logged in to GitHub. Run: omarsync login")
    end
    user = common.github_user()
    if not user or user == "" then
      common.die("could not read the GitHub user")
    end
    if repo == "" then
      repo = user .. "/omarchy-config"
    end
    if not common.valid_repo_name(repo) then
      common.die("repository must look like owner/name: " .. repo)
    end
    if not select(2, common.gh({ "repo", "view", repo }, { capture = true })) then
      local owner = repo:match("^(.-)/")
      local name = repo:match("/(.*)$")
      if owner ~= user then
        common.die("repository " .. repo .. " does not exist and is not owned by " .. user)
      end
      common.log("creating private repository " .. repo)
      common.gh({ "repo", "create", name, "--private", "--description", "Omarchy configuration synced by omarsync" })
    end
  else
    if repo == "" then repo = "local/omarchy-config" end
    if not common.valid_repo_name(repo) then
      common.die("repository must look like owner/name: " .. repo)
    end
  end

  local url = os.getenv("OMARSYNC_ORIGIN")
  if not url or url == "" then
    url = "https://github.com/" .. repo .. ".git"
  end
  local mirror = common.mirror_dir()
  common.mkdirp(common.state_dir())

  if exec.is_dir(mirror .. "/.git") then
    if common.git_out({ "-C", mirror, "remote", "get-url", "origin" }) then
      common.git({ "-C", mirror, "remote", "set-url", "origin", url })
    else
      common.git({ "-C", mirror, "remote", "add", "origin", url })
    end
  else
    os.execute("/usr/bin/rm -rf " .. exec.quote(mirror))
    common.mkdirp(mirror)
    common.git({ "-C", mirror, "init", "-b", branch }, { capture = true })
    common.git({ "-C", mirror, "remote", "add", "origin", url })
    if select(2, common.git({ "-C", mirror, "fetch", "--quiet", "origin", branch }, { capture = true }))
      and common.git_out({ "-C", mirror, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/" .. branch .. "^{commit}" }) then
      local sha = common.git_out({ "-C", mirror, "rev-parse", "--verify", "refs/remotes/origin/" .. branch .. "^{commit}" })
      trust.checkout_pinned_commit(mirror, sha)
      common.log("pinned " .. sha)
    else
      common.log("remote branch " .. branch .. " is empty")
    end
  end

  common.ensure_local_scope()
  common.ensure_identity(mirror)
  common.write_config(repo, branch)
  common.log("initialized " .. repo .. " at " .. mirror)

  ensure_dotfiles_repo(user)
  return 0
end

local function remote_has_branch(mirror, branch)
  return select(2, common.git({ "-C", mirror, "ls-remote", "--exit-code", "--heads", "origin", branch }, { capture = true }))
end

function M.cmd_push()
  require_mirror()
  local mirror = common.mirror_dir()
  local branch = common.configured_branch()
  trust.ensure_push_signer()
  common.ensure_identity(mirror)
  trust.prepare_push_branch(mirror, branch)
  -- 文件同步:对齐 track 集合,保存检查点,记录历史头
  local mise_head
  if mise.available() then
    scopemap.reconcile()
    local saved, save_out = mise.save()
    if saved == nil then
      common.die("mise dot save failed: " .. tostring(save_out or ""))
    end
    mise_head = mise.head_snapshot()
  else
    common.warn("mise is not installed; pushing metadata only. Run: omarchy pkg add mise")
  end
  meta.collect_into(mirror, mise_head)
  common.git({ "-C", mirror, "add", "-A" })
  if select(2, common.git({ "-C", mirror, "diff", "--cached", "--quiet" }, { capture = true })) then
    common.log("no local changes to commit")
  else
    common.git({ "-C", mirror, "commit", "-S", "-m",
      "sync from " .. common.hostname_safe() .. " @ " .. common.iso8601() }, { capture = true })
    common.log("committed local changes")
  end
  if remote_has_branch(mirror, branch) then
    if not common.git({ "-C", mirror, "pull", "--quiet", "--rebase", "-X", "theirs", "origin", branch }) then
      common.git({ "-C", mirror, "rebase", "--abort" }, { capture = true })
      common.die("rebase onto origin/" .. branch .. " failed")
    end
  end
  -- rebase 可能把远程的 scope 文件带回来;它不是策略
  common.discard_remote_scope(mirror)
  if not select(2, common.git({ "-C", mirror, "diff", "--cached", "--quiet" }, { capture = true })) then
    common.git({ "-C", mirror, "commit", "-S", "-m", "drop untrusted remote scope file" }, { capture = true })
  end
  trust.sign_untrusted_tip(mirror)
  if not common.git({ "-C", mirror, "push", "--quiet", "-u", "origin", "HEAD:" .. branch }) then
    common.die("git push failed")
  end
  common.log("pushed " .. branch)
  -- 元数据先行,然后发布 mise 历史(顺序保证签名提交记录的 miseHead 已存在)
  if mise.available() then
    local ok, out = mise.sync(false)
    if not ok then
      common.warn("mise dot sync failed: " .. tostring(out or ""))
      common.warn("resolve conflicts with: mise dot conflicts / mise dot pull --take-remote <path>")
      return 1
    end
  end
  common.notify("Omarsync", "Pushed " .. common.configured_repo())
  return 0
end

function M.cmd_pull()
  require_mirror()
  local mirror = common.mirror_dir()
  local branch = common.configured_branch()
  local sha = trust.resolve_remote_sha(mirror, branch)
  trust.checkout_pinned_commit(mirror, sha)
  if mise.available() then
    mise.sync(true) -- 只抓取,不写活文件
  end
  common.log("pinned " .. sha)
  return 0
end

function M.cmd_setup()
  if not common.stdin_is_tty() then
    common.die("setup needs a terminal. Run: omarsync setup")
  end
  -- lua 是硬依赖;能跑到这里说明 lua 已存在(wrapper 用它启动)
  if not mise.available() then
    common.log("installing mise")
    if not common.omarchy({ "pkg", "add", "mise" }) then
      common.die("could not install mise")
    end
    exec.tools = {}
    common.require_tools()
  end
  if not common.gh_installed() then
    common.log("installing GitHub CLI")
    if not common.omarchy({ "pkg", "add", "github-cli" }) then
      common.die("could not install github-cli")
    end
    exec.tools = {}
    common.require_tools()
  end
  if not common.gh_logged_in() then
    M.cmd_login()
  end
  if not common.mirror_ready() then
    M.cmd_init({})
  else
    ensure_dotfiles_repo(common.github_user())
  end
  local mirror = common.mirror_dir()
  local branch = common.configured_branch()
  local sha = trust.resolve_remote_sha(mirror, branch)
  if trust.is_full_sha(sha) then
    common.log("repository already has commit " .. sha)
    common.log("open the panel and choose Apply")
  else
    common.log("repository is empty")
    common.log("open the panel and choose Push")
  end
  return 0
end

function M.cmd_apply(args)
  local with_packages = true
  local trust_signer = false
  local force = false
  local no_exec = false
  local expected = ""
  local i = 1
  while i <= #args do
    local a = args[i]
    if a == "--no-packages" then
      with_packages = false
    elseif a == "--no-exec" then
      no_exec = true
    elseif a == "--trust-signer" then
      trust_signer = true
    elseif a == "--force" then
      force = true
    elseif a == "--commit" then
      if not args[i + 1] then
        common.die("apply --commit requires a 40-character sha")
      end
      expected = args[i + 1]
      i = i + 1
    else
      common.die("unknown apply option: " .. a)
    end
    i = i + 1
  end
  if not trust.is_full_sha(expected) then
    common.die("apply requires --commit <40-character sha> of the commit you reviewed")
  end
  require_mirror()
  local mirror = common.mirror_dir()
  local branch = common.configured_branch()
  local sha = trust.resolve_remote_sha(mirror, branch)
  if sha ~= expected then
    common.die("origin/" .. branch .. " is " .. sha .. ", not the reviewed commit " .. expected)
  end
  if force then
    common.warn("force apply of " .. sha .. "; the signature check was skipped")
  else
    local first = trust.first_apply_available()
    if not trust.commit_is_trusted(mirror, sha) then
      if first then
        trust.accept_first_apply(mirror, sha)
      -- 非交互默认拒绝(走 trust_signer 分支,未带 --trust-signer 则失败)
      elseif apply_mod.prompt_yes("Commit " .. sha .. " is not trusted. Apply anyway? Configuration only; plugins and hooks stay off.", false) then
        force = true
        common.warn("force apply of " .. sha .. "; the signature check was skipped")
      else
        trust.trust_signer_of_commit(mirror, sha, trust_signer)
      end
    end
    if not trust.commit_is_trusted(mirror, sha) and not first and not force then
      trust.require_trusted_commit(mirror, sha)
    end
  end
  trust.checkout_pinned_commit(mirror, sha)
  local with_exec = false
  if force or no_exec then
    common.log("plugins and hooks will be skipped")
  elseif trust.commit_is_trusted(mirror, sha) then
    with_exec = true
    common.log("reviewed signed commit " .. sha)
  else
    common.log("reviewed first commit " .. sha .. "; plugins and hooks stay off until it is signed")
  end
  -- 先抓取 mise 远程,让预览的 dry-run 反映真实待应用内容
  if mise.available() then
    mise.sync(true)
  end
  apply_mod.preview_apply(mirror, sha, with_exec)
  -- 非交互默认继续(与旧版一致;面板在终端里运行,会真实询问)
  if not apply_mod.prompt_yes("Apply this snapshot?", true) then
    common.die("left the snapshot unapplied")
  end
  if apply_mod.apply_mirror(mirror, with_packages, sha, with_exec) then
    trust.mark_applied(sha)
    common.log("applied " .. sha)
    return 0
  end
  common.warn("apply of " .. sha .. " finished with errors; configuration was written and a backup was kept")
  return 1
end

function M.cmd_scope_path()
  common.ensure_local_scope()
  io.write(common.local_scope_file() .. "\n")
  return 0
end

-- 老格式迁移:镜像里还有 home/ 目录,或已配置但 mise 未连接
function M.needs_migrate()
  local mirror = common.mirror_dir()
  if not common.mirror_ready() then return false end
  if exec.is_dir(mirror .. "/home") then return true end
  if common.configured_repo() ~= "" and mise.available() and not mise.origin_connected() then
    return true
  end
  return false
end

function M.cmd_migrate()
  require_mirror()
  local mirror = common.mirror_dir()
  common.log("migrating to the mise dot layout")
  -- 1. 建立 dotfiles 仓库并发布当前文件
  ensure_dotfiles_repo(common.github_user())
  if mise.available() and mise.origin_connected() then
    scopemap.reconcile()
    local saved = mise.save()
    if saved == nil then
      common.die("mise dot save failed during migration")
    end
    local ok, out = mise.sync(false)
    if not ok then
      common.die("mise dot sync failed during migration: " .. tostring(out or ""))
    end
  else
    common.warn("mise dot origin is not connected; dotfiles were not migrated")
  end
  -- 2. 元数据仓库移除旧的 home/ 镜像(历史里仍可找回)
  if exec.is_dir(mirror .. "/home") then
    common.git({ "-C", mirror, "rm", "-rq", "home" })
    common.git({ "-C", mirror, "commit", "-S", "-m",
      "drop file mirror; dotfiles moved to mise history" }, { capture = true })
    common.git({ "-C", mirror, "push", "--quiet", "-u", "origin", "HEAD:" .. common.configured_branch() })
    common.log("removed the old file mirror (still recoverable from git history)")
  end
  common.log("migration done; old backups in " .. common.backup_dir() .. " can be removed manually")
  return 0
end

return M
