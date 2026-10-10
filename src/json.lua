-- 纯 Lua 的 JSON 编解码,不依赖任何 luarocks 包。
-- 只支持 omarsync 需要的子集:对象、数组、字符串、数字、布尔、null。
-- 编码时 null 用 json.null 哨兵表示;解码时 JSON null 也映射为该哨兵。

local M = {}

-- null 哨兵(table 身份唯一,可与普通值区分)
M.null = setmetatable({}, { __tostring = function() return "null" end })

local null = M.null

-- ===== 编码 =====

local ESCAPES = {
  ['"'] = '\\"', ['\\'] = '\\\\', ['\b'] = '\\b',
  ['\f'] = '\\f', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t',
}

-- 字符串转义:控制字符一律 \u00XX
local function encode_str(s)
  return '"' .. s:gsub('[%z\1-\31\\"]', function(c)
    return ESCAPES[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end

-- 判断 table 是否为数组(1..n 连续整数键)
local function is_array(t)
  local n = #t
  local count = 0
  for k in pairs(t) do
    if type(k) ~= "number" or k % 1 ~= 0 or k < 1 then
      return false
    end
    count = count + 1
  end
  return count == n, n
end

local encode_value

local function encode_table(t, buf)
  local arr, n = is_array(t)
  if arr then
    -- 空 table 一律编码为对象 {},由调用方用 encode_array 包一层来表示空数组
    if n == 0 then
      buf[#buf + 1] = "{}"
      return
    end
    buf[#buf + 1] = "["
    for i = 1, n do
      if i > 1 then buf[#buf + 1] = "," end
      encode_value(t[i], buf)
    end
    buf[#buf + 1] = "]"
  else
    -- 收集键并排序,保证输出稳定(便于 git diff)
    local keys = {}
    for k in pairs(t) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    buf[#buf + 1] = "{"
    local first = true
    for _, k in ipairs(keys) do
      if not first then buf[#buf + 1] = "," end
      first = false
      buf[#buf + 1] = encode_str(tostring(k))
      buf[#buf + 1] = ":"
      encode_value(t[k], buf)
    end
    buf[#buf + 1] = "}"
  end
end

encode_value = function(v, buf)
  local tv = type(v)
  if tv == "nil" or v == null then
    buf[#buf + 1] = "null"
  elseif tv == "boolean" then
    buf[#buf + 1] = v and "true" or "false"
  elseif tv == "number" then
    -- 整数不输出小数点
    if v % 1 == 0 and math.abs(v) < 2 ^ 52 then
      buf[#buf + 1] = string.format("%d", v)
    else
      buf[#buf + 1] = tostring(v)
    end
  elseif tv == "string" then
    buf[#buf + 1] = encode_str(v)
  elseif tv == "table" then
    encode_table(v, buf)
  else
    error("cannot encode type: " .. tv)
  end
end

-- 编码任意值;empty_array=true 时把空 table 编码为 []
function M.encode(v, empty_array)
  local buf = {}
  if empty_array and type(v) == "table" and next(v) == nil then
    return "[]"
  end
  encode_value(v, buf)
  return table.concat(buf)
end

-- ===== 解码 =====

local function decode_error(str, pos, msg)
  error(string.format("json: %s at byte %d", msg, pos), 0)
end

local parse_value

local function skip_ws(str, pos)
  local _, e = str:find("^[ \t\n\r]+", pos)
  return e and e + 1 or pos
end

local function parse_string(str, pos)
  -- pos 指向开引号
  local buf = {}
  local i = pos + 1
  while true do
    local c = str:sub(i, i)
    if c == "" then decode_error(str, i, "unterminated string") end
    if c == '"' then
      return table.concat(buf), i + 1
    elseif c == "\\" then
      local esc = str:sub(i + 1, i + 1)
      local map = { ['"'] = '"', ["\\"] = "\\", ["/"] = "/",
        b = "\b", f = "\f", n = "\n", r = "\r", t = "\t" }
      if map[esc] then
        buf[#buf + 1] = map[esc]
        i = i + 2
      elseif esc == "u" then
        local hex = str:sub(i + 2, i + 5)
        if not hex:match("^%x%x%x%x$") then decode_error(str, i, "bad \\u escape") end
        local cp = tonumber(hex, 16)
        -- 处理代理对(超出 BMP 的字符)
        if cp >= 0xD800 and cp <= 0xDBFF then
          local lo_hex = str:sub(i + 8, i + 11)
          if str:sub(i + 6, i + 7) == "\\u" and lo_hex:match("^%x%x%x%x$") then
            local lo = tonumber(lo_hex, 16)
            if lo >= 0xDC00 and lo <= 0xDFFF then
              cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
              i = i + 6
            end
          end
        end
        buf[#buf + 1] = utf8.char(cp)
        i = i + 6
      else
        decode_error(str, i, "bad escape: " .. esc)
      end
    else
      buf[#buf + 1] = c
      i = i + 1
    end
  end
end

local function parse_number(str, pos)
  local s, e = str:find("^-?%d+%.?%d*[eE]?[+-]?%d*", pos)
  local text = str:sub(s, e)
  local n = tonumber(text)
  if not n then decode_error(str, pos, "bad number") end
  return n, e + 1
end

local function parse_array(str, pos)
  local arr = {}
  pos = skip_ws(str, pos + 1)
  if str:sub(pos, pos) == "]" then return arr, pos + 1 end
  while true do
    local v
    v, pos = parse_value(str, pos)
    arr[#arr + 1] = v
    pos = skip_ws(str, pos)
    local c = str:sub(pos, pos)
    if c == "," then
      pos = skip_ws(str, pos + 1)
    elseif c == "]" then
      return arr, pos + 1
    else
      decode_error(str, pos, "expected , or ]")
    end
  end
end

local function parse_object(str, pos)
  local obj = {}
  pos = skip_ws(str, pos + 1)
  if str:sub(pos, pos) == "}" then return obj, pos + 1 end
  while true do
    if str:sub(pos, pos) ~= '"' then decode_error(str, pos, "expected object key") end
    local k
    k, pos = parse_string(str, pos)
    pos = skip_ws(str, pos)
    if str:sub(pos, pos) ~= ":" then decode_error(str, pos, "expected :") end
    pos = skip_ws(str, pos + 1)
    local v
    v, pos = parse_value(str, pos)
    obj[k] = v
    pos = skip_ws(str, pos)
    local c = str:sub(pos, pos)
    if c == "," then
      pos = skip_ws(str, pos + 1)
    elseif c == "}" then
      return obj, pos + 1
    else
      decode_error(str, pos, "expected , or }")
    end
  end
end

parse_value = function(str, pos)
  pos = skip_ws(str, pos)
  local c = str:sub(pos, pos)
  if c == '"' then
    return parse_string(str, pos)
  elseif c == "{" then
    return parse_object(str, pos)
  elseif c == "[" then
    return parse_array(str, pos)
  elseif c == "t" then
    if str:sub(pos, pos + 3) == "true" then return true, pos + 4 end
  elseif c == "f" then
    if str:sub(pos, pos + 4) == "false" then return false, pos + 5 end
  elseif c == "n" then
    if str:sub(pos, pos + 3) == "null" then return null, pos + 4 end
  elseif c == "-" or c:match("%d") then
    return parse_number(str, pos)
  end
  decode_error(str, pos, "unexpected character: " .. (c == "" and "<eof>" or c))
end

-- 解码 JSON 文本;失败返回 nil + 错误信息
function M.decode(str)
  local ok, result = pcall(function()
    local v, pos = parse_value(str, 1)
    pos = skip_ws(str, pos)
    if pos <= #str then decode_error(str, pos, "trailing data") end
    return v
  end)
  if ok then return result end
  return nil, result
end

-- 解码并断言类型,失败时 die 风格报错(由调用方处理)
function M.decode_or_die(str, what)
  local v, err = M.decode(str)
  if v == nil then
    error(string.format("invalid JSON in %s: %s", what, tostring(err)), 0)
  end
  return v
end

return M
