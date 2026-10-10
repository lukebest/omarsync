-- 签名信任链:SSH(ed25519)提交签名、trusted-keys、首次应用 TOFU。
-- 1:1 移植自原 lib/trust.sh,作用于元数据仓库。
-- 信任策略是本机的,绝不从同步仓库读取。

local common = require("common")
local exec = require("exec")

local M = {}

local HOME = os.getenv("HOME")

function M.trusted_keys_file()
  return HOME .. "/.config/omarsync/trusted-keys"
end

function M.is_full_sha(s)
  -- 注意:Lua 模式不支持 {40} 量词,先比长度再比字符集
  return type(s) == "string" and #s == 40 and s:match("^[0-9a-f]+$") ~= nil
end

-- 信任文件/密钥不得位于镜像仓库内
function M.refuse_inside_mirror(path)
  local mirror = common.mirror_dir()
  if not exec.is_dir(mirror) then return end
  local real_path = exec.realpath(path, false)
  local real_mirror = exec.realpath(mirror, false)
  if real_path and real_mirror and common.path_within(real_path, real_mirror) then
    common.die("refusing a trust file inside the sync mirror: " .. path)
  end
end

-- 抓取一次分支并返回其完整提交 id;不切换工作区
function M.resolve_remote_sha(mirror, branch)
  common.git({ "-C", mirror, "fetch", "--quiet", "origin", branch })
  local sha = common.git_out({ "-C", mirror, "rev-parse", "--verify", "refs/remotes/origin/" .. branch .. "^{commit}" })
  if not M.is_full_sha(sha) then
    common.die("origin/" .. branch .. " did not resolve to a full commit: " .. (sha or "<empty>"))
  end
  return sha
end

-- 检出到唯一确定的提交(detached HEAD,分支移动不会影响本次读取)
function M.checkout_pinned_commit(mirror, sha)
  if not M.is_full_sha(sha) then
    common.die("refusing to check out a non-commit: " .. tostring(sha))
  end
  common.git({ "-C", mirror, "checkout", "--quiet", "--force", "--detach", sha })
  local head = common.git_out({ "-C", mirror, "rev-parse", "--verify", "HEAD" })
  if head ~= sha then
    common.die("mirror HEAD " .. tostring(head) .. " is not the pinned commit " .. sha)
  end
  if select(2, common.git({ "-C", mirror, "symbolic-ref", "-q", "HEAD" }, { capture = true })) then
    -- symbolic-ref 成功说明还挂在分支上
    common.die("mirror is still attached to a branch after pinning " .. sha)
  end
end

-- git 命令成功返回 true(注意 common.git capture 模式返回 out, ok)
local function git_ok(args)
  local _, ok = common.git(args, { capture = true })
  return ok
end

function M.commit_is_trusted(mirror, sha)
  local keys = M.trusted_keys_file()
  if not exec.is_file(keys) then return false end
  local data = common.read_file(keys) or ""
  if not data:match("%S") then return false end
  M.refuse_inside_mirror(keys)
  return git_ok({ "-C", mirror, "-c", "gpg.ssh.allowedSignersFile=" .. keys, "verify-commit", sha })
end

function M.trusted_keys_present()
  local keys = M.trusted_keys_file()
  if not exec.is_file(keys) then return false end
  local data = common.read_file(keys) or ""
  return data:match("%S") ~= nil
end

-- ===== SSHSIG 解析(纯 Lua 实现,替代原 od/dd 组合)=====

-- base64 解码
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64T = {}
for i = 1, #B64 do B64T[B64:sub(i, i)] = i - 1 end

local function b64decode(s)
  s = s:gsub("%s", ""):gsub("=+$", "")
  local out = {}
  local acc, nbits = 0, 0
  for i = 1, #s do
    local v = B64T[s:sub(i, i)]
    if not v then return nil end
    acc = (acc << 6) | v
    nbits = nbits + 6
    if nbits >= 8 then
      nbits = nbits - 8
      out[#out + 1] = string.char((acc >> nbits) & 0xFF)
    end
  end
  return table.concat(out)
end

-- 读大端 u32
local function u32be(s, off)
  if #s < off + 4 then return nil end
  local a, b, c, d = s:byte(off + 1, off + 4)
  return ((a * 256 + b) * 256 + c) * 256 + d
end

-- 从提交的 gpgsig 头提取 SSH 签名 armor 文本
local function extract_armor(commit_text)
  local lines = {}
  local on = false
  for line in (commit_text .. "\n"):gmatch("([^\n]*)\n") do
    if not on then
      local rest = line:match("^gpgsig (.*)$")
      if rest then
        on = true
        lines[#lines + 1] = rest
        if rest:find("END SSH SIGNATURE", 1, true) then break end
      end
    else
      local rest = line:match("^ (.*)$")
      if not rest then break end
      lines[#lines + 1] = rest
      if rest:find("END SSH SIGNATURE", 1, true) then break end
    end
  end
  local armor = table.concat(lines, "\n")
  if not armor:find("BEGIN SSH SIGNATURE", 1, true)
    or not armor:find("END SSH SIGNATURE", 1, true) then
    return nil
  end
  return armor
end

-- 输出签名里嵌入的 SSH 公钥行 "type keydata";失败返回 nil。
-- 这里只是文本提取,调用方仍须让 git 真正验签。
function M.signature_pubkey_line(mirror, sha)
  local commit = common.git_out({ "-C", mirror, "cat-file", "commit", sha })
  if not commit then return nil end
  local armor = extract_armor(commit)
  if not armor then return nil end
  local body = armor:gsub("%-%-%-%-%-BEGIN SSH SIGNATURE%-%-%-%-%-", "")
    :gsub("%-%-%-%-%-END SSH SIGNATURE%-%-%-%-%-", "")
  local sig = b64decode(body)
  if not sig or #sig < 14 then return nil end
  if sig:sub(1, 6) ~= "SSHSIG" then return nil end
  if u32be(sig, 6) ~= 1 then return nil end
  local key_len = u32be(sig, 10)
  if not key_len or key_len < 16 or key_len > 4096 then return nil end
  if #sig < 14 + key_len then return nil end
  local key = sig:sub(15, 14 + key_len)
  local type_len = u32be(key, 0)
  if not type_len or type_len < 4 or type_len > 64 or #key < 4 + type_len then return nil end
  local ktype = key:sub(5, 4 + type_len)
  if not ktype:match("^ssh%-[a-z0-9-]+$") then return nil end
  -- 重新 base64 编码公钥 blob(标准输出形式)
  local function b64encode(data)
    local out = {}
    for i = 1, #data, 3 do
      local a = data:byte(i) or 0
      local b = data:byte(i + 1) or 0
      local c = data:byte(i + 2) or 0
      local n = (a << 16) | (b << 8) | c
      local pad = (i + 2 > #data) and 2 or (i + 1 > #data and 1 or 0)
      out[#out + 1] = B64:sub(((n >> 18) & 63) + 1, ((n >> 18) & 63) + 1)
      out[#out + 1] = B64:sub(((n >> 12) & 63) + 1, ((n >> 12) & 63) + 1)
      out[#out + 1] = pad >= 2 and "=" or B64:sub(((n >> 6) & 63) + 1, ((n >> 6) & 63) + 1)
      out[#out + 1] = pad >= 1 and "=" or B64:sub((n & 63) + 1, (n & 63) + 1)
    end
    return table.concat(out)
  end
  local keydata = b64encode(key)
  if not keydata:match("^[A-Za-z0-9+/=]+$") then return nil end
  return ktype .. " " .. keydata
end

function M.fingerprint_of_pubkey_line(pub)
  local mktemp = exec.resolve_tool("mktemp")
  if not mktemp then return nil end
  local tmp = (exec.capture(mktemp, {}) or ""):gsub("%s+$", "")
  if tmp == "" then return nil end
  common.write_file(tmp, pub .. "\n")
  local keygen = exec.resolve_tool("ssh-keygen")
  local out = keygen and exec.capture(keygen, { "-lf", tmp }) or nil
  os.remove(tmp)
  if not out then return nil end
  local fp = out:match("%S+%s+(SHA256:[A-Za-z0-9+/]+=*)")
  if not fp then return nil end
  return fp
end

function M.pubkey_verifies_commit(mirror, sha, pub)
  local mktemp = exec.resolve_tool("mktemp")
  if not mktemp then return false end
  local tmp = (exec.capture(mktemp, {}) or ""):gsub("%s+$", "")
  if tmp == "" then return false end
  common.write_file(tmp, '* namespaces="git" ' .. pub .. "\n")
  local ok = git_ok({ "-C", mirror, "-c", "gpg.ssh.allowedSignersFile=" .. tmp, "verify-commit", sha })
  os.remove(tmp)
  return ok
end

-- ===== 首次应用(TOFU)=====

function M.applied_stamp_file()
  return common.state_dir() .. "/applied"
end

-- 从未信任过任何密钥的机器,第一次 apply 可以用未签名的提交;
-- 印章文件会挡住第二次。
function M.first_apply_available()
  if M.trusted_keys_present() then return false end
  return not exec.is_file(M.applied_stamp_file())
end

function M.mark_applied(sha)
  local stamp = M.applied_stamp_file()
  common.mkdirp(common.state_dir())
  common.write_file(stamp, sha .. "\n")
end

function M.remember_signer(pub)
  local keys = M.trusted_keys_file()
  M.refuse_inside_mirror(keys)
  common.mkdirp(HOME .. "/.config/omarsync")
  if not exec.is_file(keys) then common.write_file(keys, "") end
  os.execute("/usr/bin/chmod 644 " .. exec.quote(keys))
  local entry = '* namespaces="git" ' .. pub
  local data = common.read_file(keys) or ""
  local found = false
  for line in data:gmatch("[^\n]+") do
    if line == entry then
      found = true
      break
    end
  end
  if not found then
    local fh = io.open(keys, "a")
    fh:write(entry .. "\n")
    fh:close()
  end
end

function M.accept_first_apply(mirror, sha)
  local pub = M.signature_pubkey_line(mirror, sha)
  local fp = pub and M.fingerprint_of_pubkey_line(pub) or nil
  if pub and fp and M.pubkey_verifies_commit(mirror, sha, pub) then
    M.remember_signer(pub)
    common.log("trusted signer " .. fp)
    return
  end
  common.log("first apply on this PC; commit " .. sha .. " is not signed")
  common.log("later applies require a trusted signature")
end

-- 没有信任密钥的机器可以钉住这一个提交的签名者;
-- 之后来自其他密钥的提交仍被拒绝。
function M.trust_signer_of_commit(mirror, sha, allow_prompt)
  local pub = M.signature_pubkey_line(mirror, sha)
  local fp = pub and M.fingerprint_of_pubkey_line(pub) or nil
  if M.trusted_keys_present() then
    if fp then
      common.die("commit " .. sha .. " is signed by " .. fp .. ", which is not in " .. M.trusted_keys_file() .. ". Refusing to apply it.")
    end
    common.die("commit " .. sha .. " is not signed by a key in " .. M.trusted_keys_file() .. ". Refusing to apply it.")
  end
  if not pub or not fp or not M.pubkey_verifies_commit(mirror, sha, pub) then
    common.die("commit " .. sha .. " is not signed. Refusing to apply it.")
  end
  if allow_prompt then
    -- 调用方已确认
  elseif common.stdin_is_tty() then
    common.log("this PC has not trusted a signing key yet")
    common.log("commit " .. sha .. " is signed by " .. fp)
    io.stderr:write("Trust this key and apply? [y/N] ")
    local answer = io.read("*l") or ""
    if answer ~= "y" and answer ~= "Y" then
      common.die("left the signing key untrusted")
    end
  else
    common.die("commit " .. sha .. " is signed by " .. fp .. ", and this PC has not trusted a signing key. Run apply in a terminal and confirm, or pass --trust-signer.")
  end
  M.remember_signer(pub)
  common.log("trusted signer " .. fp)
end

function M.require_trusted_commit(mirror, sha)
  if not M.is_full_sha(sha) then
    common.die("refusing an unpinned revision: " .. tostring(sha))
  end
  if not M.commit_is_trusted(mirror, sha) then
    common.die("commit " .. sha .. " is not signed by a key in " .. M.trusted_keys_file() .. ". Refusing to apply it.")
  end
end

-- 返回 state("trusted"/"untrusted"/"none") 与指纹(可能为空串)
function M.commit_signature_state(mirror, sha)
  local state = "none"
  if M.commit_is_trusted(mirror, sha) then
    state = "trusted"
  end
  local pub = M.signature_pubkey_line(mirror, sha)
  local fp = pub and M.fingerprint_of_pubkey_line(pub) or ""
  if state == "none" and pub and fp ~= "" and M.pubkey_verifies_commit(mirror, sha, pub) then
    state = "untrusted"
  end
  return state, fp
end

function M.prepare_push_branch(mirror, branch)
  common.git({ "-C", mirror, "checkout", "-q", "-B", branch })
end

-- ===== 签名密钥管理 =====

function M.record_trusted_signer(ktype, keydata, priv)
  if not ktype:match("^ssh%-") then common.die("not an ssh public key") end
  if not keydata:match("^[A-Za-z0-9+/=]+$") then common.die("malformed ssh public key") end
  if priv and priv ~= "" then
    if not (exec.is_file(priv) and not exec.is_link(priv)) then
      common.die("private key not found: " .. priv)
    end
    M.refuse_inside_mirror(priv)
  end

  local email = common.config_get("SIGNING_EMAIL")
  if not email or email == "" then
    email = "omarsync@localhost"
    common.config_set("SIGNING_EMAIL", email)
  end

  local keys = M.trusted_keys_file()
  M.refuse_inside_mirror(keys)
  common.mkdirp(HOME .. "/.config/omarsync")
  if not exec.is_file(keys) then common.write_file(keys, "") end
  os.execute("/usr/bin/chmod 644 " .. exec.quote(keys))
  local entry = email .. ' namespaces="git" ' .. ktype .. " " .. keydata
  local data = common.read_file(keys) or ""
  local found = false
  for line in data:gmatch("[^\n]+") do
    if line == entry then
      found = true
      break
    end
  end
  if not found then
    local fh = io.open(keys, "a")
    fh:write(entry .. "\n")
    fh:close()
  end
  if priv and priv ~= "" then
    common.config_set("SIGNING_KEY", priv)
  end
  common.log("trusted " .. ktype .. " key for " .. email)
end

-- 私钥可以无密码签名时,输出其公钥行;否则返回 nil
function M.private_key_pub(priv)
  if not priv or priv == "" or not exec.is_file(priv) or exec.is_link(priv) then
    return nil
  end
  local mirror = common.mirror_dir()
  if exec.is_dir(mirror) then
    local real_path = exec.realpath(priv)
    local real_mirror = exec.realpath(mirror)
    if not real_path or not real_mirror then return nil end
    if common.path_within(real_path, real_mirror) then return nil end
  end
  local stat = exec.resolve_tool("stat")
  local mode_out = stat and exec.capture(stat, { "-c", "%a", priv }) or nil
  local mode = mode_out and tonumber((mode_out:gsub("%s+$", "")), 8) or nil
  if not mode then return nil end
  -- 八进制 022 = 十进制 18:组/其他人可写则拒绝
  if (mode & 18) ~= 0 then return nil end
  local keygen = exec.resolve_tool("ssh-keygen")
  local pub = keygen and exec.capture(keygen, { "-y", "-f", priv, "-P", "" }) or nil
  if not pub then return nil end
  pub = pub:gsub("%s+$", "")
  if not pub:match("^ssh%-[a-z0-9-]+%s+[A-Za-z0-9+/=]+") then return nil end
  return pub
end

function M.dedicated_signing_key()
  return HOME .. "/.config/omarsync/signing_key"
end

function M.create_dedicated_signing_key(priv)
  if exec.exists(priv) or exec.is_link(priv) or exec.exists(priv .. ".pub") or exec.is_link(priv .. ".pub") then
    common.die("cannot create a signing key at " .. priv)
  end
  M.refuse_inside_mirror(priv)
  common.mkdirp(HOME .. "/.config/omarsync")
  local keygen = exec.resolve_tool("ssh-keygen") or common.die("ssh-keygen is not available")
  local ok = exec.run(keygen, { "-q", "-t", "ed25519", "-f", priv, "-N", "", "-C", "omarsync@" .. common.hostname_safe() })
  if not ok then common.die("could not create a signing key") end
  os.execute("/usr/bin/chmod 600 " .. exec.quote(priv))
end

-- push 依次尝试:配置的密钥 → 无密码的 ~/.ssh/id_ed25519 → 专用密钥
function M.ensure_push_signer()
  local priv, pub
  local configured = common.config_get("SIGNING_KEY")
  if configured and configured ~= "" then
    pub = M.private_key_pub(configured)
    if not pub then common.die("SIGNING_KEY cannot sign without a prompt: " .. configured) end
    priv = configured
  else
    pub = M.private_key_pub(HOME .. "/.ssh/id_ed25519")
    if pub then
      priv = HOME .. "/.ssh/id_ed25519"
      common.log("signing with ~/.ssh/id_ed25519")
    else
      priv = M.dedicated_signing_key()
      pub = M.private_key_pub(priv)
      if not pub then
        M.create_dedicated_signing_key(priv)
        pub = M.private_key_pub(priv)
        if not pub then common.die("could not create a signing key") end
      end
      common.log("signing with " .. priv)
    end
  end
  local ktype, keydata = pub:match("^(%S+)%s+(%S+)")
  M.record_trusted_signer(ktype, keydata, priv)
end

-- 提交顶端不是可信签名时,补一个空的签名提交
function M.sign_untrusted_tip(mirror)
  local sha = common.git_out({ "-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD" })
  if sha then
    if M.commit_is_trusted(mirror, sha) then return end
    common.log("signing the snapshot")
  end
  common.git({ "-C", mirror, "commit", "-S", "--allow-empty", "-m",
    "sign snapshot from " .. common.hostname_safe() .. " @ " .. common.iso8601() }, { capture = true })
end

function M.cmd_trust_key(args)
  local pub, priv = args[1], args[2]
  if not pub or not exec.is_file(pub) then
    common.die("usage: omarsync trust-key <ssh-public-key> [private-key]")
  end
  M.refuse_inside_mirror(pub)
  if priv then
    if not exec.is_file(priv) then common.die("private key not found: " .. priv) end
    M.refuse_inside_mirror(priv)
  end
  local data = common.read_file(pub) or ""
  local ktype, keydata = data:match("^(%S+)%s+(%S+)")
  if not ktype then common.die("not an ssh public key") end
  M.record_trusted_signer(ktype, keydata, priv)
end

return M
