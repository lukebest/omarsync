#!/usr/bin/env node
import { createRequire } from 'node:module';
import { a as a$2, u, b as b$2, h as h$1, i as i$1, c as c$1, g, l, d, o, A as A$1, r as r$1, e as c$2, f as g$1, j as b$3, S as S$1, R as R$4, z as z$2, k as h$2, y, m, B as B$3, F as F$1, n as a$3, s as s$1, E as E$2, x as x$1, p as l$1, q as d$1, L as L$2, O as O$1, H as H$1, K as K$4, T, G as G$2, t as f, M as M$1, w, v as k$1, C as j$2, D as t$1 } from './packem_shared/index.server-iAND-ZxX.js';
import { spawnSync, spawn } from 'node:child_process';
import { statSync, accessSync, constants, existsSync, lstatSync, mkdtempSync, rmSync, realpathSync, readFileSync, mkdirSync, appendFileSync, writeFileSync, chmodSync, unlinkSync, copyFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { y as yC, W as W$3 } from './packem_shared/interact-Bvij7loV.js';
import * as readline from 'node:readline';

const s = 16;
const t = 32;
const n$2 = 64;
const E$1 = 128;
const c = "positionals";

class h extends Error {
  loc;
  title;
  hint;
  type = "VisulimaError";
  constructor({ cause: t, hint: e, location: i, message: a, name: c, stack: n, title: o }) {
    super(a, { cause: t }), this.title = o, this.name = c, this.stack = n ?? this.stack, this.loc = i, this.hint = e;
  }
  setLocation(t) {
    this.loc = t;
  }
  setName(t) {
    this.name = t;
  }
  setMessage(t) {
    this.message = t;
  }
  setHint(t) {
    this.hint = t;
  }
}

let n$1 = class n extends h {
  code;
  context;
  constructor(r, e, o) {
    super({ message: r, name: "CerebroError" }), this.code = e, this.context = o;
  }
};

class n extends n$1 {
  argument;
  choices;
  value;
  constructor(e, o, r) {
    super(`Invalid value "${o}" for argument "${e}". Allowed values: ${r.join(", ")}`, "INVALID_CHOICE", { argument: e, choices: r, value: o }), this.name = "InvalidArgumentChoiceError", this.argument = e, this.value = o, this.choices = r, this.hint = `Pass one of: ${r.join(", ")}`;
  }
}

class e extends n$1 {
  commandName;
  missingArguments;
  constructor(i, r) {
    super(`Command "${i}" is missing required arguments: ${r.join(", ")}`, "MISSING_ARGUMENT", { commandName: i, missingArguments: r }), this.name = "MissingArgumentError", this.commandName = i, this.missingArguments = r, this.hint = `Provide the following positional arguments: ${r.join(", ")}`;
  }
}

class i extends n$1 {
  commandName;
  surplusArguments;
  constructor(r, t, e) {
    super(`Command "${r}" accepts ${String(e)} positional argument${e === 1 ? "" : "s"}, but got ${String(t.length)} extra: ${t.join(", ")}`, "SURPLUS_ARGUMENT", { commandName: r, surplusArguments: [...t] }), this.name = "SurplusArgumentError", this.commandName = r, this.surplusArguments = t, this.hint = `Remove the extra argument${t.length === 1 ? "" : "s"}, or declare a trailing "multiple: true" argument to collect them.`;
  }
}

const N$2 = { COMMAND_NOT_FOUND: "COMMAND_NOT_FOUND", COMMAND_VALIDATION_ERROR: "COMMAND_VALIDATION_ERROR", CONFLICTING_OPTIONS: "CONFLICTING_OPTIONS", INVALID_ARGUMENT: "INVALID_ARGUMENT", INVALID_CHOICE: "INVALID_CHOICE", INVALID_INPUT: "INVALID_INPUT", MISSING_ARGUMENT: "MISSING_ARGUMENT", SURPLUS_ARGUMENT: "SURPLUS_ARGUMENT", UNKNOWN_OPTION: "UNKNOWN_OPTION" };
const U$3 = /* @__PURE__ */ new Set([N$2.COMMAND_NOT_FOUND, N$2.COMMAND_VALIDATION_ERROR, N$2.CONFLICTING_OPTIONS, N$2.INVALID_ARGUMENT, N$2.INVALID_CHOICE, N$2.INVALID_INPUT, N$2.MISSING_ARGUMENT, N$2.SURPLUS_ARGUMENT, N$2.UNKNOWN_OPTION]);
const r = (O) => {
  const I = O?.code;
  return typeof I == "string" && U$3.has(I);
};
const R$3 = (O) => {
  if (!r(O)) return;
  const { hint: I, message: _ } = O, A = (Array.isArray(I) ? I : [I]).filter((T) => typeof T == "string" && T.length > 0);
  return A.length > 0 ? [_, ...A].join(`
`) : _;
};

const peq = new Uint32Array(65536);
const myers_32 = (a, b) => {
  const n = a.length;
  const m = b.length;
  const lst = 1 << n - 1;
  let pv = -1;
  let mv = 0;
  let sc = n;
  let i = n;
  while (i--) {
    peq[a.charCodeAt(i)] |= 1 << i;
  }
  for (i = 0; i < m; i++) {
    let eq = peq[b.charCodeAt(i)];
    const xv = eq | mv;
    eq |= (eq & pv) + pv ^ pv;
    mv |= ~(eq | pv);
    pv &= eq;
    if (mv & lst) {
      sc++;
    }
    if (pv & lst) {
      sc--;
    }
    mv = mv << 1 | 1;
    pv = pv << 1 | ~(xv | mv);
    mv &= xv;
  }
  i = n;
  while (i--) {
    peq[a.charCodeAt(i)] = 0;
  }
  return sc;
};
const myers_x = (b, a) => {
  const n = a.length;
  const m = b.length;
  const mhc = [];
  const phc = [];
  const hsize = Math.ceil(n / 32);
  const vsize = Math.ceil(m / 32);
  for (let i = 0; i < hsize; i++) {
    phc[i] = -1;
    mhc[i] = 0;
  }
  let j = 0;
  for (; j < vsize - 1; j++) {
    let mv2 = 0;
    let pv2 = -1;
    const start2 = j * 32;
    const vlen2 = Math.min(32, m) + start2;
    for (let k = start2; k < vlen2; k++) {
      peq[b.charCodeAt(k)] |= 1 << k;
    }
    for (let i = 0; i < n; i++) {
      const eq = peq[a.charCodeAt(i)];
      const pb = phc[i / 32 | 0] >>> i & 1;
      const mb = mhc[i / 32 | 0] >>> i & 1;
      const xv = eq | mv2;
      const xh = ((eq | mb) & pv2) + pv2 ^ pv2 | eq | mb;
      let ph = mv2 | ~(xh | pv2);
      let mh = pv2 & xh;
      if (ph >>> 31 ^ pb) {
        phc[i / 32 | 0] ^= 1 << i;
      }
      if (mh >>> 31 ^ mb) {
        mhc[i / 32 | 0] ^= 1 << i;
      }
      ph = ph << 1 | pb;
      mh = mh << 1 | mb;
      pv2 = mh | ~(xv | ph);
      mv2 = ph & xv;
    }
    for (let k = start2; k < vlen2; k++) {
      peq[b.charCodeAt(k)] = 0;
    }
  }
  let mv = 0;
  let pv = -1;
  const start = j * 32;
  const vlen = Math.min(32, m - start) + start;
  for (let k = start; k < vlen; k++) {
    peq[b.charCodeAt(k)] |= 1 << k;
  }
  let score = m;
  for (let i = 0; i < n; i++) {
    const eq = peq[a.charCodeAt(i)];
    const pb = phc[i / 32 | 0] >>> i & 1;
    const mb = mhc[i / 32 | 0] >>> i & 1;
    const xv = eq | mv;
    const xh = ((eq | mb) & pv) + pv ^ pv | eq | mb;
    let ph = mv | ~(xh | pv);
    let mh = pv & xh;
    score += ph >>> m - 1 & 1;
    score -= mh >>> m - 1 & 1;
    if (ph >>> 31 ^ pb) {
      phc[i / 32 | 0] ^= 1 << i;
    }
    if (mh >>> 31 ^ mb) {
      mhc[i / 32 | 0] ^= 1 << i;
    }
    ph = ph << 1 | pb;
    mh = mh << 1 | mb;
    pv = mh | ~(xv | ph);
    mv = ph & xv;
  }
  for (let k = start; k < vlen; k++) {
    peq[b.charCodeAt(k)] = 0;
  }
  return score;
};
const distance = (a, b) => {
  if (a.length < b.length) {
    const tmp = b;
    b = a;
    a = tmp;
  }
  if (b.length === 0) {
    return a.length;
  }
  if (a.length <= 32) {
    return myers_32(a, b);
  }
  return myers_x(a, b);
};

let ht$2;
const ut$2 = (t) => (ht$2 ??= createRequire(import.meta.url))(t);
const Z$1 = typeof globalThis < "u" && typeof globalThis.process < "u" ? globalThis.process : process;
const pt$2 = (t) => {
  if (typeof Z$1 < "u" && Z$1.versions && Z$1.versions.node) {
    const [e, n] = Z$1.versions.node.split(".").map(Number);
    if (e > 22 || e === 22 && n >= 3 || e === 20 && n >= 16) return Z$1.getBuiltinModule(t);
  }
  return ut$2(t);
};
const { writeFile: ft$2, stat: dt$2, rm: gt$2, readFile: Ce$1, readdir: mt$2, mkdir: wt$2, access: yt$1 } = pt$2("node:fs/promises");
const te$3 = [{ alias: "v", description: "Turn on verbose output", group: "global", name: "verbose", type: Boolean }, { description: "Turn on debugging output", group: "global", name: "debug", type: Boolean }, { alias: "h", description: "Print out helpful usage information", group: "global", name: "help", type: Boolean }, { alias: "q", description: "Silence output", group: "global", name: "quiet", type: Boolean }, { alias: "V", description: "Print version info", group: "global", name: "version", type: Boolean }, { description: "Turn off colored output", group: "global", name: "no-color", type: Boolean }, { description: "Force colored output", group: "global", name: "color", type: Boolean }];
let B$2 = class B extends n$1 {
  commandName;
  constructor(e, n = []) {
    const s = `Command "${e}" not found${n.length > 0 ? `. Did you mean: ${n.join(", ")}?` : ""}`;
    super(s, "COMMAND_NOT_FOUND", { commandName: e, suggestions: n }), this.name = "CommandNotFoundError", this.commandName = e, n.length > 0 && (this.hint = `Try one of these commands: ${n.join(", ")}`);
  }
};
let Ge$2 = class Ge extends n$1 {
  option1;
  option2;
  constructor(e, n) {
    super(`Options "${e}" and "${n}" cannot be used together`, "CONFLICTING_OPTIONS", { option1: e, option2: n }), this.name = "ConflictingOptionsError", this.option1 = e, this.option2 = n, this.hint = `Remove either --${e} or --${n}`;
  }
};
let Zt$1 = class Zt extends n$1 {
  unknownOptions;
  constructor(e, n) {
    const s = e.join(", "), i = `Found unknown ${e.length === 1 ? "option" : "options"}: ${s}`;
    super(i, "UNKNOWN_OPTION", { suggestions: n, unknownOptions: e }), this.name = "UnknownOptionError", this.unknownOptions = e, n && n.length > 0 && (this.hint = `Did you mean: ${n.join(", ")}?`);
  }
};
let Qt$1 = class Qt extends n$1 {
  pluginName;
  constructor(e, n, s) {
    super(`Plugin "${e}" error: ${n}`, "PLUGIN_ERROR", { originalError: s, pluginName: e }), this.name = "PluginError", this.pluginName = e, s && (this.cause = s);
  }
};
let en$1 = class en {
  logger;
  plugins = /* @__PURE__ */ new Map();
  initialized = false;
  cachedDependencyOrder = void 0;
  constructor(e) {
    this.logger = e;
  }
  hasPlugins() {
    return this.plugins.size > 0;
  }
  register(e) {
    if (this.initialized) throw new Error(`Cannot register plugin "${e.name}" after initialization`);
    if (this.plugins.has(e.name)) throw new Error(`Plugin "${e.name}" is already registered`);
    a$2().CEREBRO_OUTPUT_LEVEL === String(E$1) && this.logger.debug(`registering plugin: ${e.name}`), this.plugins.set(e.name, e), this.cachedDependencyOrder = void 0;
  }
  async init(e) {
    if (this.initialized) throw new Error("PluginManager already initialized");
    if (this.plugins.size === 0) {
      this.logger.debug("no plugins registered, skipping initialization"), this.initialized = true;
      return;
    }
    this.validateDependencies();
    const n = this.getDependencyOrder();
    this.logger.debug(`initializing ${String(n.length)} plugin(s)...`);
    for (const s of n) if (typeof s.init == "function") {
      this.logger.debug(`initializing plugin: ${s.name}`);
      try {
        await s.init(e);
      } catch (i) {
        const o = new Qt$1(s.name, `Failed to initialize: ${i instanceof Error ? i.message : String(i)}`, i instanceof Error ? i : void 0);
        throw this.logger.error(o.message), o;
      }
    }
    this.initialized = true;
  }
  async executeLifecycle(e, n, s) {
    if (!this.initialized) throw new Error("PluginManager not initialized");
    if (this.plugins.size === 0) return;
    const i = this.getDependencyOrder();
    for (const o of i) {
      const l = o[e];
      if (typeof l == "function") {
        this.logger.debug(`executing ${e} hook for plugin: ${o.name}`);
        try {
          await (e === "afterCommand" ? l(n, s) : l(n));
        } catch (a) {
          throw this.logger.error(`Error in ${e} hook for plugin "${o.name}":`, a), a;
        }
      }
    }
  }
  async executeErrorHandlers(e, n) {
    if (!this.initialized || this.plugins.size === 0) return;
    const s = this.getDependencyOrder();
    for (const i of s) if (typeof i.onError == "function") {
      this.logger.debug(`executing error handler for plugin: ${i.name}`);
      try {
        await i.onError(e, n);
      } catch (o) {
        this.logger.error(`Error in error handler for plugin "${i.name}":`, o);
      }
    }
  }
  getDependencyOrder() {
    if (this.cachedDependencyOrder !== void 0) return this.cachedDependencyOrder;
    const e = [], n = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Set(), i = (o) => {
      if (n.has(o)) return;
      if (s.has(o)) throw new Error(`Circular dependency detected involving plugin "${o}"`);
      const l = this.plugins.get(o);
      if (!l) throw new Error(`Plugin "${o}" not found`);
      if (s.add(o), l.dependencies) for (const a of l.dependencies) i(a);
      s.delete(o), n.add(o), e.push(l);
    };
    for (const o of this.plugins.keys()) i(o);
    return this.cachedDependencyOrder = e, e;
  }
  validateDependencies() {
    for (const e of this.plugins.values()) if (e.dependencies) {
      for (const n of e.dependencies) if (!this.plugins.has(n)) throw new Error(`Plugin "${e.name}" depends on "${n}" which is not registered`);
    }
  }
};
const Q$2 = (t) => t.type?.name === "Boolean";
const tn$1 = (t) => {
  let e = t.type ? t.type.name.toLowerCase() : "string";
  const n = t.multiple ?? t.lazyMultiple ? "[]" : "";
  return e && (e = e === "boolean" ? "" : `{underline ${e}${n}}`), e;
};
const Ie$1 = (t) => (Q$2(t) || (t.typeLabel = t.typeLabel ?? tn$1(t), t.defaultOption && (t.typeLabel = `${t.typeLabel} (D)`), t.required && (t.typeLabel = `${t.typeLabel} (R)`)), t);
const nn$1 = new RegExp(/^-([^\d-])$/);
const sn$1 = new RegExp(/^--(\S+)/);
const on$1 = new RegExp(/^-([^\d-]{2,})$/);
const rn$1 = (t) => nn$1.test(t) || sn$1.test(t) || on$1.test(t);
const an$1 = (t, e) => {
  const n = e[0] && rn$1(e[0]) || e.length === 0 ? null : e.shift() ?? null;
  if (!t.includes(n)) {
    const s = new Error(`Command not recognised: ${String(n)}`);
    throw s.command = n, s.name = "INVALID_COMMAND", s;
  }
  return { argv: e, command: n };
};
let ln$1 = class Ke extends h {
  optionName;
  value;
  constructor(e, n, s) {
    super({ hint: `Pass a valid ${s} value for '${e}'.`, message: `Invalid ${s} value '${n}' for option '${e}'`, name: "INVALID_VALUE", title: "Invalid Value" }), this.optionName = e, this.value = n, Object.setPrototypeOf(this, Ke.prototype);
  }
};
let cn$1 = class He extends h {
  optionName;
  constructor(e) {
    super({ cause: void 0, hint: `Remove the duplicate option '${e}' from your command line arguments.`, location: void 0, message: `Option '${e}' is already set`, name: "ALREADY_SET", stack: void 0, title: "Option Already Set" }), this.optionName = e, Object.setPrototypeOf(this, He.prototype);
  }
};
let Pe = class Xe extends h {
  optionName;
  constructor(e) {
    super({ cause: void 0, hint: `Check your option definitions or remove the unknown option '${e}' from your command line arguments.`, location: void 0, message: `Unknown option: --${e}`, name: "UNKNOWN_OPTION", stack: void 0, title: "Unknown Option" }), this.optionName = `--${e}`, Object.setPrototypeOf(this, Xe.prototype);
  }
};
let Ae$1 = class Ae extends h {
  value;
  constructor(e) {
    super({ hint: "Use a defined option or add a defaultOption to capture this value.", message: `Unknown value: ${e}`, name: "UNKNOWN_VALUE", title: "Unknown Value" }), this.value = e, Object.setPrototypeOf(this, Ae.prototype);
  }
};
let L$1 = class Ye extends h {
  constructor(e, n) {
    super({ cause: void 0, hint: n, location: void 0, message: e, name: "INVALID_DEFINITIONS", stack: void 0, title: "Invalid Option Definition" }), Object.setPrototypeOf(this, Ye.prototype);
  }
};
const G$1 = (t) => t === Boolean || typeof t == "function" && t.name === "Boolean";
const ye$1 = (t) => t === Number || typeof t == "function" && t.name === "Number";
const $e$2 = (t) => t === String || typeof t == "function" && t.name === "String";
const Le$2 = (t, e, n) => {
  const s = Number(t);
  if (e && Number.isNaN(s) && String(t).trim().toLowerCase() !== "nan") throw new ln$1(n ?? "", String(t), "Number");
  return s;
};
const hn$1 = (t, e, n = {}) => {
  const { optionName: s, strictTypes: i } = n;
  return Array.isArray(t) ? G$1(e) ? t.map(Boolean) : ye$1(e) ? t.map((o) => Le$2(o, i, s)) : $e$2(e) ? t.map(String) : t.map((o) => e(String(o))) : t === null ? null : G$1(e) ? !!t : ye$1(e) ? Le$2(t, i, s) : $e$2(e) ? typeof t == "string" ? t : String(t) : e(typeof t == "string" ? t : String(t));
};
const x = (t, e, n, ...s) => {
  t && console.debug(`[command-line-args:${n}] ${e}`, ...s);
};
const un$1 = /-([a-z])/g;
const pn$1 = /^\d+$/;
const fn$1 = (t) => t.codePointAt(0) === 95;
const Me$2 = (t, e) => Array.isArray(t) ? [...t, ...e] : [t, ...e];
const Ue$2 = (t) => t === "__proto__" || t === "constructor" || t === "prototype";
const he$2 = (t, e, n, s = false) => {
  t[e] === void 0 ? t[e] = s ? [n] : n : s && Array.isArray(t[e]) ? t[e].push(n) : t[e] = [t[e], n];
};
const Se$2 = (t, e, n, s, i) => {
  let o = e.get(t) ?? n.get(t);
  if (!o && s) {
    const l = t.toLowerCase();
    o = s.get(l) ?? i?.get(l);
  }
  return o;
};
const dn$1 = (t, e, n, s) => {
  const i = n.debug ?? false;
  x(i, "resolveArgs called with options:", "resolver", { partial: n.partial, stopAtFirstUnknown: n.stopAtFirstUnknown }), x(i, "Starting argument resolution", "resolver"), x(i, "Tokens:", "resolver", t), x(i, "Definitions:", "resolver", e), x(i, "Processing tokens...", "resolver");
  const o = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new Map(), a = n.caseInsensitive ? /* @__PURE__ */ new Map() : void 0, u = n.caseInsensitive ? /* @__PURE__ */ new Map() : void 0, r = n.camelCase ? /* @__PURE__ */ new Map() : void 0, c = n.camelCase ? /* @__PURE__ */ new Map() : void 0;
  for (const f of e) if (o.set(f.name, f), f.alias && l.set(f.alias, f), n.caseInsensitive && a && (a.set(f.name.toLowerCase(), f), f.alias && u && u.set(f.alias.toLowerCase(), f)), n.camelCase && r && c) {
    const w = f.name.replaceAll(un$1, (v, I) => I.toUpperCase());
    r.set(f.name, w), c.set(w, f.name);
  }
  const p = /* @__PURE__ */ Object.create(null), h = /* @__PURE__ */ Object.create(null), m = [], g = [], y = /* @__PURE__ */ new Set();
  let A = false;
  const d = e.find((f) => f.defaultOption), C = e.some((f) => f.group), O = e.find((f) => ye$1(f.type));
  for (let f = 0; f < t.length; f++) {
    const w = t[f];
    if (w.kind === "option-terminator") {
      p._unknown = s.slice(w.index), A = true;
      break;
    }
    if (w.kind === "option" && w.name) {
      let v = Se$2(w.name, o, l, a, u);
      !v && w.value === void 0 && O && pn$1.test(w.name) && (v = O, w.value = w.name, w.name = O.name);
      let I = false;
      if (!v && n.negation && w.value === void 0 && w.name.startsWith("no-")) {
        const _ = w.name.slice(3), U = Se$2(_, o, l, a, u);
        U?.type && G$1(U.type) && (v = U, I = true);
      }
      const N = v ? v.name : w.name, P = v?.multiple, M = v?.lazyMultiple;
      if (Object.hasOwn(h, N) && h[N] !== void 0 && !P && !M && !n.partial) throw new cn$1(N);
      if (!v && n.partial) {
        const _ = w.rawName ?? `--${w.name}${w.value !== void 0 && w.inlineValue ? `=${w.value}` : ""}`;
        m.push({ index: w.index, value: _ });
        continue;
      }
      if (!v && n.stopAtFirstUnknown) {
        p._unknown = s.slice(w.index);
        break;
      }
      if (!v && !n.partial) throw new Pe(w.name);
      if (w.value === void 0) {
        const _ = t[f + 1], U = _?.kind === "option" && !("name" in _) && _.value !== void 0, T = _ && v && !(v.type && G$1(v.type)) && (_.kind === "positional" || U), lt = v && v.defaultOption && !v.multiple && !v.lazyMultiple;
        if (T && (!v?.defaultOption || lt)) if (P) {
          let D = f + 1;
          const ae = [];
          for (; D < t.length && (t[D].kind === "positional" || t[D].kind === "option" && !("name" in t[D]) && t[D].value !== void 0); ) ae.push(t[D].value), y.add(t[D].index), D++;
          h[N] = h[N] === void 0 ? ae : Me$2(h[N], ae), f = D - 1;
        } else M ? (he$2(h, N, _.value, true), y.add(_.index), f++) : (h[N] = _.value, y.add(_.index), f++);
        else v?.type && G$1(v.type) ? he$2(h, N, !I, P) : (P || M) && h[N] !== void 0 ? he$2(h, N, null, true) : h[N] = P ? [] : null;
      } else {
        let { value: _ } = w;
        if (v?.type && G$1(v.type)) switch (_) {
          case "": {
            if (n.partial) {
              const T = `${w.rawName ?? `--${w.name}`}${w.value ? `=${w.value}` : ""}`;
              g.push({ index: w.index, value: T }), _ = true;
            } else throw new Pe(w.name);
            break;
          }
          case "false": {
            _ = false;
            break;
          }
          case "true": {
            _ = true;
            break;
          }
          default:
            _ = true;
        }
        const U = [_];
        if (P) {
          let T = f + 1;
          for (; T < t.length && t[T].kind === "positional"; ) U.push(t[T].value), y.add(t[T].index), T++;
          f = T - 1;
        }
        h[N] === void 0 ? h[N] = P || M ? U : _ : P || M ? h[N] = Me$2(h[N], U) : h[N] = _;
      }
    } else if (w.kind === "positional" && n.stopAtFirstUnknown && !y.has(w.index) && !d) {
      x(i, `Found unconsumed positional token at index ${String(w.index)}, stopping processing`, "resolver"), p._unknown = s.slice(w.index);
      break;
    }
  }
  for (const [f, w] of Object.entries(h)) {
    const v = o.get(f);
    v && (v.multiple || v.lazyMultiple) && !Array.isArray(w) && (h[f] = [w]);
  }
  const k = (f) => f.kind === "option" && !o.has(f.name ?? "") && !l.has(f.name ?? "") && (!n.caseInsensitive || !a?.has(f.name?.toLowerCase() ?? "") && !u?.has(f.name?.toLowerCase() ?? ""));
  let E = -1, H = Number.POSITIVE_INFINITY;
  if (n.stopAtFirstUnknown && !A && (E = t.findIndex((f) => k(f)), E !== -1 && (H = t[E].index)), d) {
    const f = [], w = [];
    for (const v of t) v.kind === "positional" && !y.has(v.index) && v.index < H && (f.push(v.value), w.push(v));
    if (f.length > 0) {
      const v = h[d.name], I = d.multiple ?? d.lazyMultiple;
      v === void 0 ? I ? (w.forEach((N) => y.add(N.index)), h[d.name] = f) : (y.add(w[0].index), h[d.name] = f[0]) : I && (w.forEach((N) => y.add(N.index)), h[d.name] = Array.isArray(v) ? [...f, ...v] : [...f, v]);
    }
  }
  if (!n.partial) {
    for (const f of t) if (f.kind === "positional" && !y.has(f.index)) throw new Ae$1(s[f.index]);
  }
  if (n.partial && !n.stopAtFirstUnknown) {
    const f = [...m];
    for (const w of g) f.push({ index: w.index, value: w.value });
    for (const w of t) w.kind === "positional" && !y.has(w.index) && f.push({ index: w.index, value: s[w.index] });
    f.length > 0 && (f.sort((w, v) => w.index - v.index), p._unknown = f.map((w) => w.value));
  }
  if (n.stopAtFirstUnknown && !A) {
    const f = t.findIndex((v) => v.kind === "positional" && !y.has(v.index));
    let w = -1;
    if (E !== -1 && f !== -1 ? w = Math.min(E, f) : E !== -1 ? w = E : f !== -1 && (w = f), w >= 0) {
      const v = t[w].index;
      p._unknown = s.slice(v);
    }
  }
  for (const [f, w] of Object.entries(h)) {
    const v = n.camelCase ? r?.get(f) ?? f : f, I = o.get(f);
    I?.type ? p[v] = hn$1(w, I.type, { optionName: I.name, strictTypes: n.strictTypes }) : p[v] = w === void 0 ? null : w;
  }
  for (const f of e) {
    const w = n.camelCase ? r?.get(f.name) ?? f.name : f.name;
    !(w in p) && f.defaultValue !== void 0 && (f.multiple ?? f.lazyMultiple ? p[w] = Array.isArray(f.defaultValue) ? [...f.defaultValue] : [f.defaultValue] : p[w] = f.defaultValue);
  }
  if (C) {
    const f = {}, w = {}, v = {};
    for (const N of e) if (N.group) {
      const P = Array.isArray(N.group) ? N.group : [N.group];
      for (const M of P) Ue$2(M) || (f[M] ??= {});
    }
    for (const N of Object.keys(p)) if (!fn$1(N)) {
      w[N] = p[N];
      let P = N;
      n.camelCase && (P = c?.get(N) ?? N);
      const M = o.get(P);
      if (M?.group) {
        const _ = Array.isArray(M.group) ? M.group : [M.group];
        for (const U of _) Ue$2(U) || f[U] && (f[U][N] = p[N]);
      } else v[N] = p[N];
    }
    const I = { _all: w };
    for (const [N, P] of Object.entries(f)) I[N] = P;
    Object.keys(v).length > 0 && (I._none = v), p._unknown && (I._unknown = p._unknown), Object.keys(p).forEach((N) => delete p[N]), Object.assign(p, I);
  }
  const S = Object.defineProperties({}, Object.getOwnPropertyDescriptors(p));
  return x(i, "Final parsed result:", "resolver", S), S;
};
const Je$2 = "-";
const J$2 = Je$2.codePointAt(0);
const K$3 = "=";
const gn$1 = K$3.codePointAt(0);
const mn$1 = "--";
const wn$1 = Je$2;
const yn$1 = "--";
const Ze$2 = (t) => t.length > 2 && t.startsWith(yn$1);
const vn$1 = (t) => Ze$2(t) && !t.includes(K$3, 3);
const An$1 = (t) => Ze$2(t) && t.includes(K$3, 3);
const Cn$1 = (t) => {
  if (t.length !== 2 || t.codePointAt(0) !== J$2 || t.codePointAt(1) === J$2) return false;
  const e = t.codePointAt(1);
  return e !== void 0 && (e < 48 || e > 57);
};
const Nn$1 = (t) => {
  if (t.length <= 2 || t.codePointAt(0) !== J$2 || t.codePointAt(1) === J$2) return false;
  const e = t.codePointAt(1);
  return !(e !== void 0 && e >= 48 && e <= 57);
};
const bn$1 = (t) => {
  const e = [];
  let n = 0, s = [], i = 0, o = -1, l = 0;
  for (; i < s.length || n < t.length; ) {
    let a;
    if (i < s.length ? (a = s[i], i++) : (a = t[n], n++), l > 0 ? l-- : o++, a === mn$1) {
      e.push({ index: o, kind: "option-terminator" });
      const u = [...s.slice(i), ...t.slice(n)], r = u.map((c, p) => ({ index: o + p + 1, kind: "positional", value: c }));
      e.push(...r), o += u.length;
      break;
    }
    if (Cn$1(a)) {
      const u = a.charAt(1);
      e.push({ index: o, kind: "option", name: u, rawName: a });
      continue;
    }
    if (Nn$1(a) && !a.includes(K$3)) {
      const u = [];
      let r = "", c = false;
      for (let p = 1; p < a.length; p++) {
        const h = a.charAt(p);
        c ? r += h : h.codePointAt(0) === gn$1 ? c = true : u.push(`${wn$1}${h}`);
      }
      if (c) if (u.length > 0) {
        const p = u.pop();
        u.push(`${p}=${r}`);
      } else u.push(r);
      s = i < s.length ? [...u, ...s.slice(i)] : u, i = 0, l = u.length;
      continue;
    }
    if (vn$1(a)) {
      const u = a.slice(2);
      e.push({ index: o, kind: "option", name: u, rawName: a });
      continue;
    }
    if (An$1(a)) {
      const u = a.indexOf(K$3), r = a.slice(2, u), c = a.slice(u + 1);
      e.push({ index: o, inlineValue: true, kind: "option", name: r, rawName: a, value: c });
      continue;
    }
    if (a.length > 2 && a.codePointAt(0) === J$2 && a.codePointAt(1) !== J$2 && a.includes(K$3)) {
      const u = a.indexOf(K$3), r = a.charAt(1), c = a.slice(u + 1);
      e.push({ index: o, inlineValue: true, kind: "option", name: r, rawName: a, value: c });
      continue;
    }
    e.push({ index: o, kind: "positional", value: a });
  }
  return e;
};
const On$1 = /\d/;
const _n$1 = (t) => typeof t == "function";
const En$1 = (t, e, n) => {
  const s = n?.debug ?? false;
  x(s, "Validating definitions:", "validation", t, "caseInsensitive:", e);
  const i = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
  let u = 0;
  for (const r of t) {
    if (x(s, "Checking definition:", "validation", r), !r.name) throw x(s, "Validation failed: name is required", "validation"), new L$1("Invalid option definition: name is required");
    if (typeof r.name != "string") throw new L$1("Invalid option definition: name must be a string");
    if (r.name.trim() === "") throw new L$1("Invalid option definition: name cannot be empty");
    const c = e ? r.name.toLowerCase() : "";
    if (i.has(r.name) || e && l.has(c)) throw new L$1(`Invalid option definition: duplicate name '${r.name}'`);
    if (o.has(r.name) || e && a.has(c)) throw new L$1(`Invalid option definition: name '${r.name}' conflicts with an existing alias`);
    if (i.add(r.name), e && l.add(c), r.alias !== void 0) {
      if (typeof r.alias != "string") throw new L$1("Invalid option definition: alias must be a string");
      if (r.alias.length !== 1) throw new L$1("Invalid option definition: alias must be a single character");
      if (On$1.test(r.alias)) throw new L$1("Invalid option definition: alias cannot be numeric");
      if (r.alias === "-") throw new L$1('Invalid option definition: alias cannot be "-"');
      const p = e ? r.alias.toLowerCase() : "";
      if (o.has(r.alias) || e && a.has(p)) throw new L$1(`Invalid option definition: duplicate alias '${r.alias}'`);
      if (i.has(r.alias) || e && l.has(p)) throw new L$1(`Invalid option definition: alias '${r.alias}' conflicts with an existing option name`);
      o.add(r.alias), e && a.add(p);
    }
    if (r.defaultOption && (u++, r.type !== void 0 && G$1(r.type))) throw new L$1("Invalid option definition: defaultOption cannot be Boolean type");
    if (r.type !== void 0 && !(r.type === Boolean || r.type === Number || r.type === String || typeof r.type == "function" && _n$1(r.type))) throw new L$1("Invalid option definition: invalid type");
  }
  if (u > 1) throw x(s, "Validation failed: multiple defaultOptions not allowed", "validation"), new L$1("Invalid option definition: multiple defaultOptions not allowed");
  x(s, "Validation completed successfully", "validation");
};
function xn$1(t, e = {}) {
  const n = e.debug ?? false;
  x(n, "Starting command-line-args parsing", "index"), x(n, "Options:", "index", e);
  const s = { ...e };
  s.stopAtFirstUnknown && (s.partial = true);
  const i = Array.isArray(t) ? t : [t];
  x(n, "Normalized definitions:", "index", i), En$1(i, s.caseInsensitive, n ? s : void 0);
  let { argv: o } = s;
  o ??= process.argv.slice(2), x(n, "Using argv:", "index", o);
  let l = o;
  s.caseInsensitive && (l = o.map((r) => {
    if (r.startsWith("--")) {
      const c = r.indexOf("="), p = (c === -1 ? r.slice(2) : r.slice(2, c)).toLowerCase();
      return c === -1 ? `--${p}` : `--${p}${r.slice(c)}`;
    }
    if (r.startsWith("-") && !r.startsWith("--") && r.length > 1) {
      const c = r.indexOf("="), p = c === -1 ? r.slice(1) : r.slice(1, c);
      if (!p) return r;
      const h = p.toLowerCase();
      return c === -1 ? `-${h}` : `-${h}${r.slice(c)}`;
    }
    return r;
  }));
  const a = bn$1(l.map(String));
  x(n, "Tokenized arguments:", "index", a);
  const u = dn$1(a, i, s, o);
  return x(n, "Command-line-args parsing completed", "index"), u;
}
let kn$1 = class kn {
  result;
  argv;
  options;
  argument;
  args;
  command;
  commandName;
  env;
  logger;
  console;
  fs;
  process;
  runtime;
  rawUnknown;
  rawArgv;
  constructor(e, n) {
    this.commandName = e, this.command = n;
  }
};
let ue$1 = class ue extends n$1 {
  commandName;
  constructor(e, n, s) {
    super(`Failed to load command "${e}": ${n}`, "COMMAND_LOADER_ERROR", { commandName: e, reason: n }), this.name = "CommandLoaderError", this.commandName = e, this.hint = "Ensure the loader resolves to a module with a default export that is the command handler function.", s !== void 0 && (this.cause = s);
  }
};
const In$1 = /^-{1,2}(\w+)(=(.+))?$/;
const Qe$2 = (t, e, n, s) => {
  const i = In$1.exec(t);
  if (i === null) return {};
  const o = i[1];
  if (!o) return {};
  const l = n && s ? n.get(o) ?? s.get(o) : e.find((a) => a.name === o || a.alias === o);
  return l !== void 0 ? { argName: l.name, argValue: i[3], option: l } : {};
};
const Te$2 = (t, e) => {
  if (e.type === void 0) return t;
  if (e.type.name === "Boolean") {
    if (t === "true" || t === "1") return e.type(true);
    if (t === "false" || t === "0") return e.type(false);
  }
  return e.type(t);
};
const Pn$1 = /* @__PURE__ */ new Set(["0", "1", "false", "true"]);
const $n$1 = (t, e, n, s) => {
  if (e.length === 0 || t.length === 0) return {};
  const i = (o, l) => {
    const { argName: a, argValue: u, option: r } = Qe$2(l, e, n, s), { lastOption: c } = o;
    return r && Q$2(r) && u && a ? o.partial[a] = Te$2(u, r) : o.lastName && c && Q$2(c) && Pn$1.has(l) && (o.partial[o.lastName] = Te$2(l, c)), { lastName: a, lastOption: r, partial: o.partial };
  };
  return t.reduce(i, { partial: {} }).partial;
};
const Ln$1 = /* @__PURE__ */ new Set(["0", "1", "false", "true"]);
const Mn$1 = (t, e, n, s) => {
  if (e.length === 0 || t.length === 0) return t;
  const i = (o, l) => {
    const { argValue: a, option: u } = Qe$2(l, e, n, s), { lastOption: r } = o;
    if (r && Q$2(r) && Ln$1.has(l)) {
      const { args: p } = o;
      return { args: p.slice(0, -1) };
    }
    return u && Q$2(u) && a ? { args: o.args } : { args: [...o.args, l], lastOption: u };
  };
  return t.reduce(i, { args: [] }).args;
};
const De$1 = (t) => {
  const e = /* @__PURE__ */ new Map();
  for (const n of t) {
    const s = e.get(n.name);
    s ? e.set(n.name, { ...s, ...n }) : e.set(n.name, n);
  }
  return [...e.values()];
};
const Un$1 = (t) => {
  if (t === void 0) return;
  const e = t.toLowerCase().trim();
  return e === "true" || e === "1" || e === "yes" || e === "on";
};
const Sn$1 = (t, e) => {
  if (!t.type) return e;
  if (e === void 0) return;
  if (t.type === Boolean || typeof t.type == "function" && t.type.name === "Boolean") return Un$1(e);
  if (t.type === Number || typeof t.type == "function" && t.type.name === "Number") {
    const o = Number.parseFloat(e);
    return Number.isNaN(o) ? void 0 : o;
  }
  return t.type === String || typeof t.type == "function" && t.type.name === "String" ? e : t.type(e);
};
const Tn$1 = /_./g;
const Dn$1 = /^[A-Z]/;
const Vn$1 = (t) => t.toLowerCase().replaceAll(Tn$1, (e) => e[1]?.toUpperCase() ?? e).replace(Dn$1, (e) => e.toLowerCase());
const jn$1 = (t, e = a$2()) => {
  if (!t || t.length === 0) return {};
  const n = {};
  for (const s of t) {
    const i = e[s.name], o = Sn$1(s, i), l = o === void 0 ? s.defaultValue : o, a = Vn$1(s.name);
    n[a] = l;
  }
  return n;
};
const Rn$1 = /-([a-z])/g;
const et$2 = (t) => t.replaceAll(Rn$1, (e, n) => n.toUpperCase());
const Ve$1 = (t, e) => t.type === void 0 ? e : t.type(e);
const Bn$1 = (t, e) => {
  const { choices: n } = t;
  if (!n || n.length === 0) return [];
  const s = [];
  for (const i of e) n.includes(i) || s.push({ choices: n, name: t.name, value: i });
  return s;
};
const zn$1 = (t, e) => e && t.defaultValue !== void 0 && !Array.isArray(t.defaultValue) ? [t.defaultValue] : t.defaultValue;
const Fn$1 = (t, e) => {
  const n = {}, s = [], i = [], o = t.length - 1;
  let l = 0;
  for (const [a, u] of t.entries()) {
    const r = et$2(u.name), c = a === o && u.multiple === true, p = c ? e.slice(a) : e.slice(a, a + 1);
    if (p.length === 0) {
      u.required === true && s.push(u.name), n[r] = zn$1(u, c);
      continue;
    }
    i.push(...Bn$1(u, p)), l = a + p.length, n[r] = c ? p.map((h) => Ve$1(u, h)) : Ve$1(u, p[0]);
  }
  return { invalid: i, missing: s, resolved: n, surplus: e.slice(l) };
};
const Wn$1 = (t) => {
  const e = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map();
  for (const s of t) if (e.set(s.name, s), s.alias) {
    const i = Array.isArray(s.alias) ? s.alias : [s.alias];
    for (const o of i) n.set(o, s);
  }
  return { optionMapByAlias: n, optionMapByName: e };
};
const tt$2 = async (t) => {
  if (typeof t.__resolvedExecute__ == "function") return t.__resolvedExecute__;
  if (typeof t.loader != "function") throw new ue$1(t.name, "no execute or loader defined");
  let e;
  try {
    e = await t.loader();
  } catch (s) {
    throw new ue$1(t.name, s instanceof Error ? s.message : String(s), s);
  }
  const n = e.default;
  if (typeof n != "function") throw new ue$1(t.name, "loader did not return a module with a default-exported handler function");
  return t.__resolvedExecute__ = n, n;
};
const qn$1 = (t, e, n, s, i, o = []) => {
  const l = new kn$1(t.name, t), { _all: a, _unknown: u, positionals: r } = e, p = Object.keys(n).length > 0 ? { ...a, ...n } : a;
  c in p && delete p[c], l.argument = r?.[c] ?? [], l.args = {}, l.rawUnknown = [...u ?? []], l.rawArgv = [...o];
  const h = Object.keys(s).length > 0;
  return l.options = h ? { ...p, ...s } : p, l.env = jn$1(t.env, i), l;
};
const Gn$1 = (t, e, n) => {
  const s = t.options ?? [], i = s.length > 0;
  let o = De$1(i ? [...s, ...n] : n);
  if (o.length > 0) {
    for (const c of o) if (c.multiple && c.lazyMultiple) throw new Error(`Argument "${c.name}" cannot have both multiple and lazyMultiple options, please choose one.`);
  }
  const l = t.arguments !== void 0 && t.arguments.length > 0;
  (t.argument || l) && (o = [{ defaultOption: true, description: t.argument?.description, group: "positionals", multiple: true, name: c, type: t.argument?.type ?? String, typeLabel: t.argument?.typeLabel }, ...o]);
  let a, u;
  if (i) {
    const { optionMapByAlias: c, optionMapByName: p } = Wn$1(s);
    a = Mn$1(e, s, p, c), u = $n$1(e, s, p, c);
  } else a = e, u = {};
  const r = xn$1(o, { argv: a, camelCase: true, partial: true, stopAtFirstUnknown: true });
  return { arguments_: o, booleanValues: u, parsedArgs: r };
};
const pe$2 = async (t, e, n) => typeof t.execute == "function" ? t.execute(e) : (await tt$2(t))(e);
const Kn$1 = (t, e$1) => {
  if (!t.arguments || t.arguments.length === 0) return;
  const n$1 = e$1.rawUnknown.indexOf("--"), s = n$1 === -1 ? [] : e$1.rawUnknown.slice(n$1 + 1), i$1 = s.length === 0 ? e$1.argument : e$1.argument.slice(0, Math.max(0, e$1.argument.length - s.length)), o = Fn$1(t.arguments, i$1);
  if (e$1.args = o.resolved, o.missing.length > 0) throw new e(t.name, o.missing);
  const [l] = o.invalid;
  if (l) throw new n(l.name, l.value, l.choices);
  if (o.surplus.length > 0) throw new i(t.name, o.surplus, t.arguments.length);
};
let Hn$1 = class Hn {
  capacity;
  cache;
  constructor(e) {
    this.capacity = e, this.cache = /* @__PURE__ */ new Map();
  }
  get(e) {
    if (!this.cache.has(e)) return;
    const n = this.cache.get(e);
    return this.cache.delete(e), this.cache.set(e, n), n;
  }
  has(e) {
    return this.cache.has(e);
  }
  set(e, n) {
    if (this.cache.has(e)) this.cache.delete(e);
    else if (this.cache.size >= this.capacity) {
      const s = this.cache.keys().next().value;
      s !== void 0 && this.cache.delete(s);
    }
    this.cache.set(e, n);
  }
  delete(e) {
    this.cache.delete(e);
  }
  clear() {
    this.cache.clear();
  }
  size() {
    return this.cache.size;
  }
};
const Xn$1 = (t, e) => typeof t != "string" || t === "" ? "" : t[0].toLowerCase() + t.slice(1);
const Yn$1 = new RegExp("[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?(?:\\u0007|\\u001B\\u005C|\\u009C))|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))", "g");
const Jn$1 = (t) => {
  if (typeof t != "string") throw new TypeError(`The "value" argument must be of type string. Received ${typeof t}`);
  return t.replaceAll(Yn$1, "");
};
const fe$1 = new Hn$1(1e3);
const Zn$1 = /[.*+?^${}()|[\]\\]/g;
const Qn$1 = (t) => {
  const e = t.join("");
  if (fe$1.has(e)) {
    const i = fe$1.get(e);
    return i.lastIndex = 0, i;
  }
  const n = t.map((i) => i.replaceAll(Zn$1, String.raw`\$&`)).join("|"), s = new RegExp(n, "g");
  return fe$1.set(e, s), s;
};
const es = (t) => {
  const e = [];
  let n = 0, s;
  for (c$2.lastIndex = 0; (s = c$2.exec(t)) !== null; ) s.index > n && e.push(t.slice(n, s.index)), e.push(s[0]), n = c$2.lastIndex;
  return n < t.length && e.push(t.slice(n)), e.filter(Boolean);
};
const ts = /[ČŠŽĐ]/i;
const nt$2 = new Uint8Array(128);
const st$2 = new Uint8Array(128);
const ot$2 = new Uint8Array(128);
for (let t = 0; t < 128; t++) nt$2[t] = t >= 65 && t <= 90 ? 1 : 0, st$2[t] = t >= 97 && t <= 122 ? 1 : 0, ot$2[t] = t >= 48 && t <= 57 ? 1 : 0;
const de$2 = (t) => nt$2[t];
const je$1 = (t) => st$2[t];
const ge$2 = (t) => ot$2[t];
const j$1 = (t, e, n, s, i) => {
  if (t.length === 0) return [];
  let o = false;
  const l = Object.values(e);
  for (const m of l) if (m(t[0])) {
    o = true;
    break;
  }
  if (!o && !n) return [t];
  const a = [...t], u = [];
  let r = a[0], c = "other";
  const p = Object.entries(e);
  for (const m of p) {
    const [g, y] = m;
    if (y(a[0])) {
      c = g;
      break;
    }
  }
  let h = n && s ? a[0] === a[0].toLocaleUpperCase(s) : false;
  for (let m = 1; m < a.length; m++) {
    const g = a[m];
    let y = "other";
    for (const C of p) {
      const [O, k] = C;
      if (k(g)) {
        y = O;
        break;
      }
    }
    const A = n && s ? g === g.toLocaleUpperCase(s) : false;
    let d = false;
    i ? d = i(c, y, h, A, g, m, a) : (c !== y && c !== "other" && y !== "other" && (d = true), n && y !== "other" && !h && A && (d = true)), d ? (u.push(r), r = g) : r += g, c = y, n && (h = A);
  }
  return r && r.length > 0 && u.push(r), u.length > 0 ? u : [t];
};
const ns = (t, e, n, s) => {
  if (n.size === 0) return e;
  for (const i of n) if (t.startsWith(i, e)) return s.push(i), e + i.length;
  return e;
};
const it$2 = (t, e = /* @__PURE__ */ new Set()) => {
  if (t.length === 0) return [];
  if (t.toUpperCase() === t) return [t];
  let n = 0;
  const s = [], i = t.length;
  for (let o = 1; o < i; o++) {
    const l = ns(t, n, e, s);
    if (l !== n) {
      n = l, o = n - 1;
      continue;
    }
    const a = t.codePointAt(o - 1), u = t.codePointAt(o), r = a && a < 128 && de$2(a), c = u && u < 128 && de$2(u), p = a && a < 128 && je$1(a), h = a && a < 128 && ge$2(a), m = u && u < 128 && ge$2(u);
    if (p && c) {
      s.push(t.slice(n, o)), n = o;
      continue;
    }
    if (h && !m || !h && m) {
      s.push(t.slice(n, o)), n = o;
      continue;
    }
    if (m && !h) {
      let g = false, y = false;
      if (o + 1 < i) {
        const A = t.codePointAt(o + 1);
        g = A && A < 128 && de$2(A), y = A && A < 128 && ge$2(A);
      }
      if (!y && g) {
        s.push(t.slice(n, o), t.slice(o, o + 1)), n = o + 1;
        continue;
      }
    }
    if (o + 1 < i) {
      const g = t.codePointAt(o + 1), y = g && g < 128 && je$1(g);
      if (r && c && y) {
        const A = t.slice(n, o + 1);
        e.has(A) || (s.push(t.slice(n, o)), n = o);
      }
    }
  }
  return n < i && s.push(t.slice(n)), s.filter((o) => o !== "");
};
const rt$2 = (t, e, n) => {
  if (t.length === 0) return [];
  const s = t === t.toLocaleUpperCase(e);
  if (e.startsWith("de")) {
    if (!s && t.replaceAll("ß", "SS") === t.toLocaleUpperCase(e)) return [t];
    const r = [...t], c = r.length, p = [];
    let h = r[0], m = r[0] === r[0].toLocaleUpperCase(e), g = m, y = m ? 0 : -1;
    for (let A = 1; A < c; A++) {
      const d = r[A], C = d === d.toLocaleUpperCase(e);
      if (C === m) h += d;
      else if (C) h && h.length > 0 && (p.push(h), h = d), g = true, y = A;
      else {
        if (g && A - y > 1) {
          const O = r[A - 1], k = h.slice(0, -1);
          k && k.length > 0 && p.push(k), h = O + d;
        } else h += d;
        g = false, y = -1;
      }
      m = C;
    }
    return h && h.length > 0 && p.push(h), p;
  }
  if (e.startsWith("uk") || e.startsWith("ru") || e.startsWith("bg") || e.startsWith("sr") || e.startsWith("mk") || e.startsWith("be")) {
    if (!g$1.test(t) && !b$3.test(t)) return [t];
    const r = [...t], c = r.length, p = [];
    let h = r[0];
    const m = r[0];
    let g;
    g$1.test(m) ? g = 1 : b$3.test(m) ? g = 2 : g = 0;
    let y = m === m.toLocaleUpperCase(e);
    for (let d = 1; d < c; d++) {
      const C = r[d];
      let O;
      g$1.test(C) ? O = 1 : b$3.test(C) ? O = 2 : O = 0;
      const k = C === C.toLocaleUpperCase(e);
      g !== O && (g === 1 || g === 2) && (O === 1 || O === 2) || O === g && !y && k ? (p.push(h), h = C) : h += C, g = O, y = k;
    }
    h && h.length > 0 && p.push(h);
    const A = [];
    for (let d = 0; d < p.length; d++) d < p.length - 1 && p[d].length === 1 && b$3.test(p[d]) && g$1.test(p[d + 1][0]) ? (A.push(p[d] + p[d + 1]), d += 1) : A.push(p[d]);
    return A;
  }
  if (e.startsWith("el")) {
    if (!S$1.test(t) && !b$3.test(t)) return [t];
    const r = [];
    R$4.lastIndex = 0;
    let c;
    for (; (c = R$4.exec(t)) !== null; ) r.push(c[0]);
    r.length === 0 && r.push(t);
    const p = [];
    if (r.length === 1) {
      const h = r[0];
      if (!h || !S$1.test(h[0]) || h.length === 1) return [h ?? t];
    }
    for (const h of r) {
      if (!h) continue;
      if (!S$1.test(h[0]) || h.length === 1) {
        p.push(h);
        continue;
      }
      const m = h.length;
      let g = h[0], y = h[0] === h[0].toLocaleUpperCase(e);
      for (let A = 1; A < m; A++) {
        const d = h[A], C = d === d.toLocaleUpperCase(e);
        !y && C ? (p.push(g), g = d) : g += d, y = C;
      }
      g && p.push(g);
    }
    return p;
  }
  if (e.startsWith("ja") || e.startsWith("ko")) {
    const r = e.startsWith("ja"), c = r ? { hiragana: (h) => m.test(h), kanji: (h) => y.test(h), katakana: (h) => h$2.test(h), latin: (h) => b$3.test(h) } : { hangul: (h) => B$3.test(h), latin: (h) => b$3.test(h) }, p = /* @__PURE__ */ new Set(["が", "で", "と", "に", "の", "は", "へ", "も", "や", "を"]);
    if (r) {
      const h = j$1(t, c, false, e, (g, y) => g === "hiragana" && y === "katakana" || g === "katakana" && y === "hiragana" || g === "hiragana" && y === "latin" || g === "katakana" && y === "latin" || g === "kanji" && y === "latin" || g === "latin" && (y === "hiragana" || y === "katakana" || y === "kanji")), m = [];
      for (const g of h) {
        const y = g;
        y.length === 1 && p.has(y) && m.length > 0 ? m[m.length - 1] = m.at(-1) + y : m.push(y);
      }
      return m.length > 0 ? m : [t];
    }
    return j$1(t, c, false, e, (h, m) => h === "hangul" && m === "latin" || h === "latin" && m === "hangul");
  }
  if (e.startsWith("sl")) {
    const r = [...t], c = r.length, p = [];
    let h = r[0], m = r[0] === r[0].toLocaleUpperCase(e);
    for (let g = 1; g < c; g++) {
      const y = r[g], A = y === y.toLocaleUpperCase(e), d = ts.test(y), C = g < c - 1 && r[g + 1] === r[g + 1].toLocaleUpperCase(e);
      !m && A || d && C ? (p.push(h), h = y, d && C && (p.push(h), h = "")) : h += y, m = A;
    }
    return h && h.length > 0 && p.push(h), p;
  }
  if (e.startsWith("zh")) return j$1(t, { han: (r) => y.test(r), latin: (r) => b$3.test(r) }, false, e);
  if (["ar", "fa", "he", "ur"].includes(e.split("-")[0])) {
    const r = (c) => F$1.test(c) || a$3.test(c);
    return j$1(t, { latin: (c) => b$3.test(c), rtl: (c) => r(c) }, false, e);
  }
  if (["am", "bn", "gu", "hi", "km", "kn", "lo", "ml", "mr", "ne", "or", "pa", "si", "ta", "te", "th"].includes(e.split("-")[0])) {
    const r = (c) => s$1.test(c) || E$2.test(c) || x$1.test(c) || l$1.test(c) || d$1.test(c) || L$2.test(c) || O$1.test(c) || H$1.test(c) || K$4.test(c) || T.test(c) || G$2.test(c) || f.test(c) || M$1.test(c) || w.test(c) || k$1.test(c) || j$2.test(c);
    return j$1(t, { indic: (c) => r(c), latin: (c) => b$3.test(c) }, false, e);
  }
  if (["be", "bg", "ru", "sr", "uk"].includes(e)) return j$1(t, { cyrillic: (r) => g$1.test(r), latin: (r) => b$3.test(r) }, true, e);
  if (["ar", "fa", "he"].includes(e)) return j$1(t, { latin: (r) => b$3.test(r), rtl: (r) => F$1.test(r) || a$3.test(r) }, false, e);
  if (e.startsWith("ko")) return j$1(t, { hangul: (r) => B$3.test(r), latin: (r) => b$3.test(r) }, false, e);
  if (e.startsWith("uz")) {
    if (!g$1.test(t) && !b$3.test(t)) return [t];
    const r = [...t], c = r.length, p = [];
    let h = r[0], m = r[0] === r[0].toLocaleUpperCase(e);
    for (let g = 1; g < c; g++) {
      const y = r[g], A = y === y.toLocaleUpperCase(e);
      if (z$2.test(y) || z$2.test(r[g - 1])) {
        h += y;
        continue;
      }
      !m && A ? (p.push(h), h = y) : h += y, m = A;
    }
    return h && h.length > 0 && p.push(h), p;
  }
  const i = [...t], o = i.length, l = [];
  let a = i[0], u = i[0] === i[0].toLocaleUpperCase(e);
  for (const r of n) if (t.startsWith(r)) {
    l.push(r), a = i[r.length], u = a === a.toLocaleUpperCase(e);
    break;
  }
  for (let r = 1; r < o; r++) {
    const c = i[r], p = c === c.toLocaleUpperCase(e);
    let h = 0;
    for (const m of n) if (t.startsWith(m, r)) {
      l.push(a, m), h = m.length, a = "";
      const g = m.at(-1);
      g && (u = g === g.toLocaleUpperCase(e));
      break;
    }
    if (h > 0) {
      r += h - 1;
      continue;
    }
    !u && p ? (l.push(a), a = c) : a += c, u = p;
  }
  return a && l.push(a), l;
};
const ss = (t, e, n) => {
  const s = [], i = o.test(t) ? t.split(o).filter(Boolean) : [t];
  for (const o$1 of i) {
    const l = o$1;
    if (o.test(l)) s.push(l);
    else {
      c$2.lastIndex = 0;
      const a = c$2.test(l) ? es(l).filter(Boolean) : [l];
      for (const u of a) if (c$2.lastIndex = 0, c$2.test(u)) s.push(u);
      else if (e) {
        const r = e.toLowerCase().split("-")[0];
        s.push(...rt$2(u, r, n));
      } else s.push(...it$2(u, n));
    }
  }
  return s;
};
const os = (t, e = {}) => {
  if (!t || typeof t != "string") return [];
  const { handleAnsi: n = false, handleEmoji: s = false, knownAcronyms: i = [], locale: o, normalize: l = false, separators: a, stripAnsi: u = false, stripEmoji: r = false } = e, c = new Set([...i].toSorted((d, C) => C.length - d.length));
  let p = t;
  u && (p = Jn$1(p)), r && (p = A$1(p));
  let h;
  Array.isArray(a) ? h = Qn$1(a) : a instanceof RegExp ? h = a : h = r$1;
  const m = [];
  let g = p;
  const y = h.flags.includes("g") ? h : new RegExp(h.source, `${h.flags}g`);
  for (; g.length > 0; ) {
    const d = y.exec(g);
    if (!d) {
      g === ".." ? m.push("..") : g === "." ? m.push(".") : g.length > 0 && m.push(g);
      break;
    }
    const C = d.index, O = d[0], k = O.length, E = g.slice(0, C), H = g.slice(C + k);
    if (O.startsWith("../")) m.push(".."), g = g.slice(C + 3);
    else if (O.startsWith("./")) m.push("."), g = g.slice(C + 2);
    else if (C === 0 && O === "..") m.push(".."), g = g.slice(2);
    else if (C === 0 && O === ".") m.push("."), g = g.slice(1);
    else {
      E.length > 0 && m.push(E);
      let S = 0;
      for (; (S = O.indexOf("../", S)) !== -1; ) m.push(".."), S += 3;
      for (S = 0; (S = O.indexOf("./", S)) !== -1; ) (S === 0 || O[S - 1] !== ".") && m.push("."), S += 2;
      let f = H;
      for (; f.startsWith("../"); ) m.push(".."), f = f.slice(3);
      for (; f.startsWith("./"); ) m.push("."), f = f.slice(2);
      if (f === "..") {
        m.push("..");
        break;
      } else if (f === ".") {
        m.push(".");
        break;
      } else g = f;
    }
    y.lastIndex = 0;
  }
  if (m.length === 0) {
    const d = p.split(h).filter(Boolean);
    m.push(...d);
  }
  let A = [];
  for (const d of m) n || s ? A.push(...ss(d, o, c)) : o ? A.push(...rt$2(d, o, c)) : A.push(...it$2(d, c));
  return l && (A = A.map((d) => c.has(d) ? d : o && d === d.toLocaleUpperCase(o) ? d[0] + d.slice(1).toLocaleLowerCase(o) : d.toUpperCase() === d && !c.has(d) ? d.slice(0, 1) + d.slice(1).toLowerCase() : d)), A;
};
const is = (t, e) => typeof t != "string" || t === "" ? "" : t[0].toUpperCase() + t.slice(1);
const rs = (t, e) => {
  const { length: n } = t;
  if (n === 0) return "";
  if (n === 1) return t[0];
  const s = [];
  let i = "", o$1 = "";
  for (let l = 0; l < n; l++) {
    const a = t[l];
    if (o.test(a)) {
      i ? (s.push(i + o$1 + a), i = "", o$1 = "") : (s.length > 0 && s.push(e), i = a);
      continue;
    }
    i ? (o$1 && (o$1 += e), o$1 += a) : (s.length > 0 && s.push(e), s.push(a));
  }
  return s.join("");
};
const Y$1 = (t, e) => {
  if (typeof t != "string" || !t) return "";
  let n = true;
  return rs(os(t, { handleAnsi: e?.handleAnsi, handleEmoji: e?.handleEmoji, knownAcronyms: e?.knownAcronyms, locale: e?.locale, normalize: e?.normalize, separators: void 0, stripAnsi: e?.stripAnsi, stripEmoji: e?.stripEmoji }).map((i) => {
    const o = i, l = o.toLowerCase();
    return n ? (n = false, Xn$1(l)) : is(l);
  }), "");
};
class as extends n$1 {
  commandName;
  missingOptions;
  constructor(e, n) {
    super(`Command "${e}" is missing required options: ${n.join(", ")}`, "COMMAND_VALIDATION_ERROR", { commandName: e, missingOptions: n }), this.name = "CommandValidationError", this.commandName = e, this.missingOptions = n, this.hint = `Provide the following required options: ${n.join(", ")}`;
  }
}
class ls extends n$1 {
  choices;
  option;
  value;
  constructor(e, n, s) {
    super(`Invalid value "${n}" for option "${e}". Allowed values: ${s.join(", ")}`, "INVALID_CHOICE", { choices: s, option: e, value: n }), this.name = "InvalidChoiceError", this.option = e, this.value = n, this.choices = s, this.hint = `Use one of: ${s.map((i) => `--${e} ${i}`).join(", ")}`;
  }
}
const Re$2 = (t, e, n = false) => {
  const s = [], i = e._all ?? e;
  for (const o of t) {
    if (!n && !o.required) continue;
    const l = o.__camelCaseName__ ?? o.name;
    if (i[l] === void 0) {
      if (o.type?.name === "Boolean") {
        e[l] = false;
        continue;
      }
      s.push(o);
    }
  }
  return s;
};
const cs = (t, e) => e.includes(t) ? true : Math.abs(t.length - e.length) > t.length / 2 ? false : distance(t, e) <= t.length / 3;
const R$2 = (t, e) => {
  const n = t.toLowerCase();
  return e.filter((s) => cs(s.toLowerCase(), n));
};
const hs = (t, e) => {
  const n = [];
  if (t._unknown && t._unknown.forEach((s) => {
    const i = s.startsWith("--");
    let o = `Found unknown ${i ? "option" : "argument"} "${s}"`;
    if (i) {
      const l = R$2(s.replace("--", ""), (e.options ?? []).map((a) => a.name));
      if (l.length > 0) {
        const [a, ...u] = l.map((r) => `--${r}`);
        o += u.length > 0 ? `, did you mean ${a ?? ""} or ${u.join(", ")}?` : `, did you mean ${a ?? ""}?`;
      }
    }
    n.push(o);
  }), n.length > 0) throw new n$1(n.join(`
`), N$2.UNKNOWN_OPTION, { unknownOptions: [...t._unknown ?? []] });
};
const W$2 = (t, e) => new n$1(`Command "${t}" ${e}`, "INVALID_COMMAND", { commandName: t });
const us = (t, e) => {
  const n = /* @__PURE__ */ new Set();
  for (const [s, i] of t.entries()) {
    if (typeof i != "object" || i === null) throw W$2(e, `has a positional argument at index ${String(s)} that is not an object`);
    const { name: o } = i;
    if (typeof o != "string" || o.length === 0) throw W$2(e, `has a positional argument at index ${String(s)} without a name`);
    const l = et$2(o);
    if (n.has(l)) throw W$2(e, `declares duplicate positional argument "${o}"`);
    n.add(l);
    const a = s === 0 ? void 0 : t[s - 1];
    if (i.required === true && a !== void 0 && a.required !== true) throw W$2(e, `declares required positional "${o}" after an optional one, which can never be satisfied`);
    if (i.multiple === true && s !== t.length - 1) throw W$2(e, `declares a variadic positional "${o}" that is not the last one`);
  }
};
const ps = (t, e, n) => {
  const s = n.__requiredOptions__, i = s ? Re$2(s, e, true) : Re$2(t, e, false);
  if (i.length > 0) throw new as(n.name, i.map((o) => o.name));
  e._unknown && e._unknown.length > 0 && !n.argument && !n.arguments?.length && hs(e, n);
};
const fs = (t, e, n) => {
  const s = n.__conflictingOptions__ ?? t.filter((i) => i.conflicts !== void 0);
  if (s.length > 0) {
    const i = s.find((o) => {
      const l = o.__camelCaseName__ ?? Y$1(o.name);
      return Array.isArray(o.conflicts) ? o.conflicts.some((a) => e[Y$1(a)] !== void 0) && e[l] !== void 0 : e[Y$1(o.conflicts)] !== void 0 && e[l] !== void 0;
    });
    if (i) throw new Ge$2(i.name, typeof i.conflicts == "string" ? i.conflicts : i.conflicts?.[0] ?? "unknown");
  }
};
const ds = (t, e) => {
  const n = e.options;
  if (n) for (const s of n) {
    if (!s.choices || s.choices.length === 0) continue;
    const i = s.__camelCaseName__ ?? Y$1(s.name), o = t[i];
    if (o == null) continue;
    const l = Array.isArray(o) ? o : [o];
    for (const a of l) {
      const u = String(a);
      if (!s.choices.includes(u)) throw new ls(s.name, u, s.choices);
    }
  }
};
const gs = (t) => {
  if (!Array.isArray(t.options)) return;
  const e = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map();
  for (const i of t.options) {
    if (i.name) {
      const o = e.get(i.name) ?? [];
      o.push(i), e.set(i.name, o);
    }
    if (typeof i.alias == "string" && i.alias.length > 0) {
      const o = n.get(i.alias) ?? [];
      o.push(i), n.set(i.alias, o);
    } else if (Array.isArray(i.alias)) {
      for (const o of i.alias) if (o.length > 0) {
        const l = n.get(o) ?? [];
        l.push(i), n.set(o, l);
      }
    }
  }
  const s = [];
  for (const [i, o] of e) o.length > 1 && s.push(`Duplicate option name "${i}" in command "${t.name}": ${JSON.stringify(o)}`);
  for (const [i, o] of n) o.length > 1 && s.push(`Duplicate option alias "-${i}" used by options ${o.map((l) => `"${l.name}"`).join(", ")} in command "${t.name}"`);
  if (s.length > 0) throw new Error(s.join(`
`));
};
const ms = (t) => {
  const { arguments: e } = t;
  if (e !== void 0) {
    if (!Array.isArray(e)) throw W$2(t.name, 'must declare "arguments" as an array — slot order is significant, so a record cannot express it');
    if (t.argument !== void 0) throw W$2(t.name, 'cannot define both "argument" and "arguments" — choose one');
    us(e, t.name);
  }
};
const ws = (t, e) => {
  if (e.length === 0) return { argv: [], commandPath: void 0 };
  const n = [];
  let s;
  for (let i = 1; i <= e.length; i += 1) {
    const o = e[i - 1];
    if (o === void 0 || o.startsWith("-")) break;
    n.push(o);
    const l = n.join(" ");
    t.has(l) && (s = { commandPath: [...n], depth: i });
  }
  return s ? { argv: e.slice(s.depth), commandPath: s.commandPath } : { argv: e, commandPath: void 0 };
};
const z$1 = (t) => t.join(" ");
const Be$2 = (t, e) => e && e.length > 0 ? [...e, t] : [t];
const ze$1 = (t) => t === void 0 || Array.isArray(t) ? t : Object.entries(t).map(([e, n]) => ({ ...n, name: e }));
const ys = (t) => {
  const e = ze$1(t.options), n = ze$1(t.env);
  return e === t.options && n === t.env ? t : Object.assign(Object.create(Object.getPrototypeOf(t)), t, { env: n, options: e });
};
const vs = /^no-/;
const As = (t) => {
  t.options?.forEach((e) => {
    e.__camelCaseName__ = Y$1(e.name);
  });
};
const Cs = (t) => {
  if (!Array.isArray(t.options) || t.options.length === 0) return;
  const e = /* @__PURE__ */ new Set();
  for (const s of t.options) e.add(s.name);
  const n = [];
  for (const s of t.options) if (s.name.startsWith("no-")) {
    const i = s.name.replace(vs, "");
    if (!e.has(i)) {
      if (s.type !== Boolean) throw new Error(`Cannot add negated option "${s.name}" to command "${t.name}" because it is not a boolean.`);
      const o = { ...s, alias: void 0, defaultValue: s.defaultValue === void 0 ? true : !s.defaultValue, description: `Inverse of --${s.name}.`, name: i };
      n.push(o), e.add(i);
    }
  }
  n.length > 0 && t.options.push(...n);
};
const Ns = (t, e) => {
  if (!e.options || e.options.length === 0) return;
  const { options: n } = t, s = /* @__PURE__ */ new Map();
  for (const o of e.options) if (o.name.startsWith("no-")) {
    const l = Y$1(o.name);
    s.set(l, o);
  }
  const i = Object.keys(n).filter((o) => s.has(o));
  if (i.length !== 0) for (const o of i) {
    const l = o.charAt(2);
    if (!l) continue;
    const a = l.toLowerCase() + o.slice(3), u = s.get(o);
    u && (u.__negated__ = true), n[a] = !n[o], Reflect.deleteProperty(n, o);
  }
};
const bs = (t, e) => {
  if (!e.options || e.options.length === 0) return;
  const n = /* @__PURE__ */ new Map();
  for (const i of e.options) i.__camelCaseName__ && i.__negated__ === void 0 && i.implies !== void 0 && n.set(i.__camelCaseName__, i);
  if (n.size === 0) return;
  const { options: s } = t;
  for (const i of Object.keys(s)) {
    const o = n.get(i);
    if (o?.implies) {
      const { implies: l } = o;
      for (const [a, u] of Object.entries(l)) s[a] === void 0 && (s[a] = u);
    }
  }
};
const Os = () => !!process.versions.electron;
const _s = () => Os() && !process.defaultApp;
const Es = () => _s() ? 0 : 1;
const xs = (t) => t.slice(Es() + 1);
const ks = " ";
const Is = (t, e) => t === e ? true : t.length !== e.length ? false : t.every((n, s) => n === e[s]);
const Ps = (t) => {
  if (typeof t == "string") return t.split(ks);
  const e = i$1();
  return Is(t, e) ? xs(t) : t;
};
const $s = (t) => {
  const e = (o) => {
    t.error(`Uncaught exception: ${o.message || o}`), o.stack && t.error(o.stack), b$2(1);
  }, n = (o, l) => {
    if (o instanceof Error) t.error(`Promise rejection: ${o.message || o}`), o.stack && t.error(o.stack);
    else {
      let a;
      if (typeof o == "string") a = o;
      else try {
        a = JSON.stringify(o);
      } catch {
        a = String(o);
      }
      t.error(`Promise rejection: ${a}`);
    }
    b$2(1);
  }, s = d("uncaughtException", e), i = d("unhandledRejection", n);
  return () => {
    s(), i();
  };
};
const Fe$1 = 100;
const Ls = /^[a-z][\w-]*$/i;
const ve$1 = (t, e) => {
  if (typeof t != "string" || t.trim().length === 0) throw new n$1(`${e} must be a non-empty string`, "INVALID_INPUT", { fieldName: e, value: t });
  return t.trim();
};
const We$2 = (t, e) => {
  if (!Array.isArray(t) || !t.every((n) => typeof n == "string")) throw new n$1(`${e} must be an array of strings`, "INVALID_INPUT", { fieldName: e, value: t });
  return t;
};
const ne$3 = (t, e) => {
  if (typeof t != "object" || t === null) throw new n$1(`${e} must be an object`, "INVALID_INPUT", { fieldName: e, value: t });
  return t;
};
const se$2 = (t) => {
  const e = ve$1(t, "Command name");
  if (e.length > Fe$1) throw new n$1(`Command name is too long (maximum ${String(Fe$1)} characters)`, "INVALID_COMMAND_NAME", { commandName: e, length: e.length });
  if (e.includes("..") || e.includes("/") || e.includes("\\") || e.includes(";") || e.includes("|") || e.includes("&")) throw new n$1(`Command name "${e}" contains invalid characters`, "INVALID_COMMAND_NAME", { commandName: e });
  if (!Ls.test(e)) throw new n$1(`Command name "${e}" must start with a letter and contain only letters, numbers, hyphens, and underscores`, "INVALID_COMMAND_NAME", { commandName: e });
  return e;
};
const Ms = 1e6;
const Us = 1e5;
const Ss = /* @__PURE__ */ new Set([`
`, "\r", "	", "\0", '"', "$", "&", "'", "(", ")", ";", "<", ">", "[", "\\", "]", "`", "{", "|", "}"]);
const Ts = (t, e = {}) => {
  if (typeof t != "string") throw new TypeError("Argument must be a string");
  const n = typeof e == "boolean" ? { checkDangerousChars: e } : e, s = n.maxArgumentLength ?? Ms;
  if (Number.isFinite(s) && s > 0 && t.length > s) throw new Error(`Argument is too long (maximum ${String(s)} characters)`);
  if (n.checkDangerousChars) {
    for (const i of t) if (Ss.has(i)) throw new Error(`Argument contains dangerous character: ${i}`);
  }
  return n.trim ? t.trim() : t;
};
const qe$1 = (t, e = {}) => {
  if (!Array.isArray(t)) throw new TypeError("Arguments must be an array");
  const n = typeof e == "boolean" ? { checkDangerousChars: e } : e, s = n.maxArguments ?? Us;
  if (Number.isFinite(s) && s > 0 && t.length > s) throw new Error(`Too many arguments (maximum ${String(s)})`);
  return t.map((i) => Ts(i, n));
};
const Ds = /^-([^\d-])$/;
const Vs = /^--(\S+)/;
const js = /^-([^\d-]{2,})$/;
const me$2 = (t) => Ds.test(t) || Vs.test(t) || js.test(t);
const Rs = { access: (t, e) => yt$1(t, e), mkdir: (t, e) => wt$2(t, e), readdir: (t) => mt$2(t), readFile: (async (t, e) => e === void 0 ? Ce$1(t) : Ce$1(t, e)), rm: (t, e) => gt$2(t, e), stat: (t) => dt$2(t), writeFile: (t, e, n) => ft$2(t, e, n) };
const Bs = (t, e, n) => {
  const s = e.indexOf("--"), i = s === -1 ? /* @__PURE__ */ new Set() : new Set(e.slice(s + 1)), o = n.filter((u) => u.startsWith("--") && u !== "--" && !i.has(u));
  if (o.length === 0) return;
  const l = (t.options ?? []).map((u) => u.name), a = o.flatMap((u) => R$2(u.slice(2), l).map((r) => `--${r}`));
  throw new Zt$1(o, a);
};
let at$2 = class at {
  #t;
  #e;
  #h;
  #p;
  #f;
  #d;
  #O;
  #_;
  #E;
  #A;
  #x;
  #C;
  #k;
  #N = t;
  #u;
  #n;
  #s;
  #o;
  #i;
  #r;
  #I = false;
  #P;
  #$ = false;
  #g;
  #m;
  #w;
  #l = [];
  #D() {
    return this.#g === void 0 && (this.#g = [...this.#s.keys()]), this.#g;
  }
  #L() {
    return this.#m === void 0 && (this.#m = [...this.#n.keys()]), this.#m;
  }
  #a() {
    return this.#w === void 0 && (this.#w = [...this.#D(), ...this.#L()]), this.#w;
  }
  #M() {
    return this.#l.length === 0 ? te$3 : [...te$3, ...this.#l];
  }
  #U() {
    this.#g = void 0, this.#m = void 0, this.#w = void 0;
  }
  #b() {
    if (this.#h === void 0) {
      const e = Ps(this.#e.argv);
      this.#h = qe$1(e, { maxArguments: this.#C }), this.#V();
    }
    return this.#h;
  }
  #y() {
    return this.#A ?? a$2();
  }
  #v(e) {
    this.#N = e, this.#y().CEREBRO_OUTPUT_LEVEL = String(e);
  }
  #c() {
    return this.#N;
  }
  #V() {
    if (!this.#h) return;
    let e = false;
    for (const n of this.#h) {
      if (n === "--quiet" || n === "-q") {
        this.#v(s), e = true;
        break;
      }
      if (n === "--verbose" || n === "-v") {
        this.#v(n$2), e = true;
        break;
      }
      if (n === "--debug") {
        this.#v(E$1), e = true;
        break;
      }
    }
    e || this.#v(Object.hasOwn(this.#y(), "DEBUG") ? E$1 : t);
  }
  #j() {
    this.#$ || (this.#P = $s(this.#t), this.#$ = true);
  }
  #R() {
    return { arch: h$1(), argv: this.#b(), cwd: this.#p, env: this.#A ?? a$2(), exit: this.#E ?? ((e) => b$2(e ?? 0)), platform: u(), stdin: this.#x };
  }
  #S(e, n, s, i) {
    this.#c() === E$1 && this.#t.debug(`command '${i}' found, parsing command args: ${n.join(", ")}`);
    const { arguments_: o, booleanValues: l, parsedArgs: a } = Gn$1(e, n, this.#M()), u = Object.keys(l).length > 0;
    let r = a;
    u && (r = { ...a, _all: { ...a._all, ...l } }), ps(o, r, e);
    const c = qn$1(e, a, l, s, this.#y(), n);
    c.runtime = this, c.argv = this.#b(), c.fs = this.#_ ?? Rs, c.process = this.#R(), c.console = this.#t, Kn$1(e, c);
    const p = e.options && e.options.length > 0;
    if (p && e.options) {
      const h = e.options.filter((m) => m.name.startsWith("no-"));
      for (const m of h) {
        const g = m.name.slice(3), y = `--${m.name}`, A = `--${g}`, d = n.includes(y), C = n.includes(A);
        if (d && C) throw new Ge$2(g, m.name);
      }
    }
    return p && (Ns(c, e), bs(c, e)), fs(o, c.options, e), ds(c.options, e), this.#k && Bs(e, n, c.rawUnknown), this.#c() === E$1 && (this.#t.debug("command options parsed from options:"), this.#t.debug(JSON.stringify(c.options, null, 2)), this.#t.debug("command argument parsed from argument:"), this.#t.debug(JSON.stringify(c.argument, null, 2))), { arguments_: o, booleanValues: l, commandArgs: r, parsedArgs: a, toolbox: c };
  }
  async #T(e, n, s) {
    const i = this.getPluginManager();
    try {
      !this.#I && i.hasPlugins() && (await i.init({ cli: this, cwd: this.#p, logger: this.#t }), this.#I = true), await i.executeLifecycle("execute", n), await i.executeLifecycle("beforeCommand", n);
      let o;
      const l = s.global;
      if (l?.help) {
        const a = this.#n.get("help");
        if (!a) throw new n$1("Help command not found", "COMMAND_NOT_FOUND");
        o = await pe$2(a, n, s);
      } else if (l?.version ?? l?.V) {
        const a = this.#n.get("version");
        if (!a) throw new n$1("Version command not found", "COMMAND_NOT_FOUND");
        o = await pe$2(a, n, s);
      } else o = await pe$2(e, n, s);
      return await i.executeLifecycle("afterCommand", n, o), o;
    } catch (o) {
      throw await i.executeErrorHandlers(o, n), o;
    }
  }
  constructor(e, n = {}) {
    if (typeof e != "string" || e.trim().length === 0) throw new n$1("CLI name must be a non-empty string", "INVALID_INPUT", { cliName: e });
    this.#f = e.trim();
    const s = n.argv ?? i$1(), i = n.cwd ?? c$1();
    if (this.#e = { ...n, argv: s, cwd: i }, this.#e.argv && !Array.isArray(this.#e.argv)) throw new n$1("CLI argv option must be an array of strings", "INVALID_INPUT", { argv: this.#e.argv });
    if (this.#e.cwd && typeof this.#e.cwd != "string") throw new n$1("CLI cwd option must be a string", "INVALID_INPUT", { cwd: this.#e.cwd });
    if (this.#e.packageName && typeof this.#e.packageName != "string") throw new n$1("CLI packageName option must be a string", "INVALID_INPUT", { packageName: this.#e.packageName });
    if (this.#e.packageVersion && typeof this.#e.packageVersion != "string") throw new n$1("CLI packageVersion option must be a string", "INVALID_INPUT", { packageVersion: this.#e.packageVersion });
    if (typeof this.#e.logger == "object") {
      const p = ["debug", "error", "info", "log", "warn"], h = [], m = this.#e.logger;
      for (const g of p) typeof m[g] != "function" && h.push(g);
      if (h.length > 0) throw new n$1(`Logger object is missing required methods: ${h.join(", ")}`, "INVALID_INPUT", { logger: this.#e.logger, missingMethods: h });
      this.#t = this.#e.logger;
    } else this.#t = { ...console, debug: (...p) => {
      this.#c() === E$1 && console.debug(...p);
    } };
    this.#d = this.#e.packageVersion, this.#O = this.#e.packageName, this.#p = this.#e.cwd, this.#i = "help", this.#r = {};
    const o = n.fs;
    if (o !== void 0 && (typeof o != "object" || o === null)) throw new n$1("CLI fs option must be an object implementing the CerebroFs interface", "INVALID_INPUT", { fs: n.fs });
    const l = n.exit;
    if (l !== void 0 && typeof l != "function") throw new n$1("CLI exit option must be a function", "INVALID_INPUT", { exit: n.exit });
    const a = n.env;
    if (a !== void 0 && (typeof a != "object" || a === null)) throw new n$1("CLI env option must be a record of string keys", "INVALID_INPUT", { env: n.env });
    const u = n.stdin;
    if (u !== void 0 && typeof u != "string") throw new n$1("CLI stdin option must be a string", "INVALID_INPUT", { stdin: n.stdin });
    this.#_ = n.fs, this.#E = n.exit, this.#A = n.env, this.#x = n.stdin ?? "", this.#C = n.maxArguments, this.#k = n.strictOptions ?? false;
    const r = this.#y().CEREBRO_OUTPUT_LEVEL, c = r === void 0 ? Number.NaN : Number(r);
    this.#N = Number.isNaN(c) ? t : c, this.#n = /* @__PURE__ */ new Map(), this.#s = /* @__PURE__ */ new Map(), this.#o = /* @__PURE__ */ new Map();
  }
  setCommandSection(e) {
    return this.#r = e, this;
  }
  getCommandSection() {
    return this.#r.header || (this.#r.header = `${this.#f}${this.#d ? ` v${this.#d}` : ""}`), this.#r;
  }
  setDefaultCommand(e) {
    return this.#i = e, this;
  }
  get defaultCommand() {
    return this.#i;
  }
  addCommand(e) {
    ne$3(e, "Command"), se$2(e.name), e.options !== void 0 && ne$3(e.options, "Command options"), e.env !== void 0 && ne$3(e.env, "Command env"), ms(e);
    const n = ys(e), s = typeof n.execute == "function", i = typeof n.loader == "function";
    if (s && i) throw new n$1(`Command "${n.name}" cannot define both "execute" and "loader" — choose one`, "INVALID_COMMAND", { commandName: n.name });
    if (!s && !i) throw new n$1(`Command "${n.name}" must define either "execute" or "loader"`, "INVALID_COMMAND", { commandName: n.name });
    n.alias && (typeof n.alias == "string" ? se$2(n.alias) : We$2(n.alias, "Command alias").forEach((c) => se$2(c))), n.argument && ne$3(n.argument, "Command argument"), n.commandPath && (We$2(n.commandPath, "Command commandPath"), n.commandPath.forEach((c) => {
      se$2(c);
    }));
    const o = Be$2(n.name, n.commandPath), l = z$1(o);
    if (this.#s.has(l)) throw new n$1(`Command with path "${l}" already exists`, "DUPLICATE_COMMAND", { commandName: n.name, commandPath: n.commandPath });
    const a = Array.isArray(n.commandPath) && n.commandPath.length > 0, u = this.#n.get(n.name), r = u !== void 0 && (u.commandPath === void 0 || u.commandPath.length === 0);
    if (!a && r) throw new n$1(`Command with name "${n.name}" already exists`, "DUPLICATE_COMMAND", { commandName: n.name });
    if (n.options) for (const c of n.options) Ie$1(c);
    if (gs(n), Cs(n), As(n), n.options && (n.__conflictingOptions__ = n.options.filter((c) => c.conflicts !== void 0), n.__requiredOptions__ = n.options.filter((c) => c.required === true)), a && u !== void 0) this.#n.set(l, n);
    else {
      if (!a && u !== void 0 && !r) {
        const c = Be$2(u.name, u.commandPath);
        this.#n.set(z$1(c), u);
      }
      this.#n.set(n.name, n);
    }
    if (this.#s.set(l, o), this.#o.set(l, n), this.#U(), n.alias !== void 0) {
      const c = typeof n.alias == "string" ? [n.alias] : n.alias;
      for (const p of c) {
        if (this.#c() === E$1 && this.#t.debug("adding alias", p), this.#n.has(p)) throw new n$1(`Command alias "${p}" conflicts with existing command`, "DUPLICATE_COMMAND", { alias: p, commandName: n.name });
        this.#n.set(p, n);
      }
    }
    return this;
  }
  addGlobalOption(e) {
    const n = e, s = new Set(te$3.map((l) => l.name)), i = new Set(te$3.map((l) => l.alias).filter(Boolean));
    if (s.has(n.name)) throw new n$1(`Cannot add global option "--${n.name}": it conflicts with a built-in global option`, "DUPLICATE_OPTION", { optionName: n.name });
    if (n.alias && i.has(n.alias)) throw new n$1(`Cannot add global option with alias "-${n.alias}": it conflicts with a built-in global option alias`, "DUPLICATE_OPTION", { alias: n.alias, optionName: n.name });
    if (new Set(this.#l.map((l) => l.name)).has(n.name)) throw new n$1(`Global option "--${n.name}" has already been added`, "DUPLICATE_OPTION", { optionName: n.name });
    return n.group = "global", Ie$1(n), this.#l.push(n), this;
  }
  getGlobalOptions() {
    return this.#M();
  }
  addPlugin(e) {
    return this.getPluginManager().register(e), this;
  }
  getPluginManager() {
    return this.#u ? this.#u : (this.#u = new en$1(this.#t), this.#u.register({ description: "Attaches the logger to the toolbox", execute: (e) => {
      e.logger = this.#t, e.console = e.logger;
    }, name: "logger" }), this.#u);
  }
  getCliName() {
    return this.#f;
  }
  getPackageVersion() {
    return this.#d;
  }
  getPackageName() {
    return this.#O;
  }
  getCommands() {
    return this.#n;
  }
  getCwd() {
    return this.#p;
  }
  dispose() {
    this.#P?.();
  }
  async run(e = {}) {
    const { autoDispose: n = true, shouldExitProcess: s = true, ...i } = e;
    if (!this.#n.has("help")) {
      const { default: d } = await import('./packem_chunks/help-command.js');
      this.addCommand(new d(this.#n));
    }
    const o = this.#L(), l$1 = this.#s;
    this.#j();
    const a = this.#b();
    let u, r = [...a];
    this.#c() === E$1 && (this.#t.debug(`process.execPath: ${g()}`), this.#t.debug(`process.execArgv: ${l().join(" ")}`), this.#t.debug(`process.argv: ${i$1().join(" ")}`));
    const c = ws(l$1, [...a]);
    if (c.commandPath) u = c.commandPath, r = c.argv;
    else {
      if (a.length > 1 && a[0] && a[1] && !me$2(a[0]) && !me$2(a[1])) {
        const C = [];
        let O = 0;
        for (; O < a.length; ) {
          const E = a[O];
          if (!E || me$2(E)) break;
          C.push(E), O += 1;
        }
        const k = z$1(C);
        if (C[0] && !o.includes(C[0])) {
          const E = this.#a(), H = R$2(k, E);
          throw new B$2(k, H);
        }
      }
      let d;
      try {
        d = an$1([null, ...o], [...a]);
      } catch (C) {
        if (C instanceof Error && C.name === "INVALID_COMMAND" && "command" in C) {
          const O = C.command, k = this.#a(), E = R$2(O, k);
          throw new B$2(O, E);
        }
        throw C;
      }
      d.command && (u = [d.command], r = d.argv);
    }
    if (!u) if (this.#i) u = [this.#i];
    else {
      const d = this.#a();
      throw new B$2("", d);
    }
    const p = z$1(u), h = this.#s.get(p);
    let m;
    if (h) {
      if (m = this.#o.get(p), !m || z$1(h) !== p) {
        const d = this.#a(), C = R$2(p, d);
        throw new B$2(p, C);
      }
    } else {
      const d = u.at(-1);
      if (m = d ? this.#n.get(d) : void 0, !m) {
        const C = this.#a(), O = R$2(p, C);
        throw new B$2(p, O);
      }
    }
    if (typeof m.execute != "function" && typeof m.loader != "function") return this.#t.error(`Command "${m.name}" has no function to execute.`), s ? b$2(1) : void 0;
    const g$1 = r;
    let y, A;
    try {
      ({ commandArgs: y, toolbox: A } = this.#S(m, g$1, i, p));
    } catch (d) {
      const C = R$3(d);
      if (this.#t.error(C ?? d), s) return b$2(1);
      throw d;
    }
    try {
      return await this.#T(m, A, y), s ? b$2(0) : void 0;
    } catch (d) {
      if (s) return this.#t.error(d), b$2(1);
      throw d;
    } finally {
      n && this.dispose();
    }
  }
  async runCommand(e, n = {}) {
    const { argv: s = [], ...i } = n;
    ve$1(e, "Command name");
    const o = e.split(" ").filter(Boolean), l = z$1(o), u = this.#s.get(l) ? this.#o.get(l) : this.#n.get(e);
    if (!u) {
      const m = this.#a(), g = R$2(l || e, m);
      throw new B$2(e, g);
    }
    if (typeof u.execute != "function" && typeof u.loader != "function") throw new n$1(`Command "${u.name}" has no function to execute`, "INVALID_COMMAND", { commandName: u.name });
    const c = [...qe$1(s, { maxArguments: this.#C })];
    this.#c() === E$1 && this.#t.debug(`running command '${e}' programmatically with args: ${c.join(", ")}`);
    const { commandArgs: p, toolbox: h } = this.#S(u, c, i, l || e);
    return this.#T(u, h, p);
  }
  clone(e) {
    const n = { ...this.#e, ...e }, s = new at(this.#f, n);
    for (const [i, o] of this.#n) s.#n.set(i, o);
    for (const [i, o] of this.#s) s.#s.set(i, [...o]);
    for (const [i, o] of this.#o) s.#o.set(i, o);
    for (const i of this.#l) s.#l.push(i);
    return s.#i = this.#i, s.#r = { ...this.#r }, s.#U(), s;
  }
  async getAction(e) {
    ve$1(e, "Command name");
    const n = e.split(" ").filter(Boolean), s = z$1(n), o = this.#s.get(s) ? this.#o.get(s) : this.#n.get(e);
    if (!o) {
      const l = this.#a(), a = R$2(s || e, l);
      throw new B$2(e, a);
    }
    if (typeof o.execute == "function") return o.execute;
    if (typeof o.loader == "function") return tt$2(o);
    throw new n$1(`Command "${o.name}" has no execute or loader defined`, "INVALID_COMMAND", { commandName: o.name });
  }
};

const a$1 = (r, e) => new at$2(r, e);

const TRUSTED_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/usr/share/omarchy/bin"];
function resolveTool(name) {
  for (const dir of TRUSTED_DIRS) {
    const candidate = join(dir, name);
    try {
      if (statSync(candidate).isFile()) {
        accessSync(candidate, constants.X_OK);
        return candidate;
      }
    } catch {
    }
  }
  return void 0;
}
function capture(binary, args, env = []) {
  const result = spawnSync(binary, [...args], {
    env: commandEnv(env),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}
function commandEnv(extra) {
  const base = {
    HOME: process.env["HOME"] ?? "",
    PATH: TRUSTED_DIRS.join(":"),
    LANG: "C.UTF-8"
  };
  for (const entry of extra) {
    const eq = entry.indexOf("=");
    if (eq > 0) {
      base[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
  }
  return base;
}
function run(binary, args, extra) {
  const result = spawnSync(binary, [...args], {
    stdio: "inherit",
    env: extra === void 0 ? process.env : commandEnv(extra)
  });
  return result.status === 0;
}
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
function isDir(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
function exists(path) {
  return existsSync(path);
}
function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
function realpath$1(path) {
  try {
    return realpathSync(path);
  } catch {
    return void 0;
  }
}
function mktempDir() {
  return mkdtempSync(join(tmpdir(), "omarsync-"));
}
function rmrf(path) {
  try {
    rmSync(path, { force: true, recursive: true });
  } catch {
  }
}

let bt$1;
const $t$1 = (e) => (bt$1 ??= createRequire(import.meta.url))(e);
const z = typeof globalThis < "u" && typeof globalThis.process < "u" ? globalThis.process : I;
const fe = (e) => {
  if (typeof z < "u" && z.versions && z.versions.node) {
    const [t, n] = z.versions.node.split(".").map(Number);
    if (t > 22 || t === 22 && n >= 3 || t === 20 && n >= 16) return z.getBuiltinModule(e);
  }
  return $t$1(e);
};
const I = z;
const { execFileSync: wt$1 } = fe("node:child_process");
const P$1 = fe("node:fs");
const vt$1 = fe("node:tty");
const qr = { alert: 7, critical: 6, debug: 1, emergency: 8, error: 5, informational: 2, notice: 3, trace: 2, warning: 4 };
const St$1 = { alert: { color: "red", label: "alert", logLevel: "alert" }, await: { color: "blue", label: "awaiting", logLevel: "informational" }, complete: { color: "cyan", label: "complete", logLevel: "informational" }, critical: { color: "redBright", label: "critical", logLevel: "critical" }, debug: { color: "gray", label: "debug", logLevel: "debug" }, emergency: { color: "redBright", label: "emergency", logLevel: "emergency" }, error: { color: "red", label: "error", logLevel: "error" }, info: { color: "blueBright", label: "info", logLevel: "informational" }, log: { label: "", logLevel: "informational" }, notice: { color: "magentaBright", label: "notice", logLevel: "notice" }, pending: { color: "magenta", label: "pending", logLevel: "informational" }, start: { color: "greenBright", label: "start", logLevel: "informational" }, stop: { color: "red", label: "stop", logLevel: "informational" }, success: { color: "green", label: "success", logLevel: "informational" }, trace: { color: "cyanBright", label: "trace", logLevel: "trace" }, wait: { color: "blue", label: "waiting", logLevel: "informational" }, warn: { color: "yellow", label: "warning", logLevel: "warning" }, warning: { color: "yellow", label: "warning", logLevel: "warning" }, watch: { color: "yellowBright", label: "watching", logLevel: "informational" } };
const Yr = /* @__PURE__ */ Symbol("EMPTY");
const Jr = (e) => {
  const t = Object.keys(e).map((n) => e[n].label ?? "");
  return t.length === 0 ? "" : t.reduce((n, r) => n.length > r.length ? n : r, "");
};
const E = "[Inspection threw]";
const b$1 = (e, t, n, r, o, s = ", ", i = Number.POSITIVE_INFINITY) => {
  const l = e.length;
  if (l === 0) return "";
  const c = Number.isFinite(i) && l > i, a = c ? Math.max(0, Math.floor(i)) : l;
  if (a === 0) return `…(${String(l)})`;
  let u = r;
  o !== void 0 && (u = o);
  const d = n.truncate, g = Number.isFinite(d);
  let f = "", h = "", p = "";
  for (let m = 0; m < a; m += 1) {
    const y = m + 1 === a, $ = m + 2 === a;
    g && (p = `…(${String(a - m)})`);
    let v = e[m];
    n.truncate = d - f.length - (y ? 0 : s.length);
    const x = h || u(v, t, n, r) + (y ? "" : s), w = f.length + x.length, L = w + p.length;
    if (y && w > d && f.length + p.length <= d || !y && !$ && L > d) break;
    v = e[m + 1];
    const T = $ ? "" : s;
    if (y ? h = "" : h = u(v, t, n, r) + T, !y && $ && L > d && w + h.length > d) break;
    if (f += x, !y && !$ && w + h.length >= d) {
      p = `…(${String(a - m - 1)})`;
      break;
    }
    p = "";
  }
  return c && p === "" && (p = `${s}… ${String(l - a)} more`), `${f}${p}`;
};
const At$1 = ([e, t], n, r) => (r.truncate -= 3, t ? `${r.stylize(String(e), "yellow")}=${r.stylize(`"${t}"`, "string")}` : r.stylize(String(e), "yellow"));
const Ce = (e) => {
  try {
    return Object.create(e, { length: { value: e.length } });
  } catch {
    return;
  }
};
const Et$1 = (e, t, n, r) => {
  let o;
  try {
    o = e.nodeType;
  } catch {
    return E;
  }
  if (o === 1) return De(e, e, n, r);
  if (o === 3) {
    let s;
    try {
      s = e.data;
    } catch {
      return E;
    }
    return r(s, void 0, n);
  }
  return r(e, void 0, n);
};
const ce$1 = (e, t, n, r) => {
  const o = Ce(e);
  return o === void 0 ? E : b$1(o, e, t, n, Et$1, `
`);
};
const De = (e, t, n, r) => {
  let o, s;
  try {
    o = e.getAttributeNames().map((f) => [f, e.getAttribute(f)]), s = e.tagName.toLowerCase();
  } catch {
    return E;
  }
  const i = n.stylize(`<${s}`, "special"), l = n.stylize(">", "special"), c = n.stylize(`</${s}>`, "special");
  n.truncate -= s.length * 2 + 5;
  let a = "";
  o.length > 0 && (a += " ", a += b$1(o, t, n, r, At$1, " ")), n.truncate -= a.length;
  const { truncate: u } = n;
  let d;
  try {
    d = Ce(e.children);
  } catch {
    d = void 0;
  }
  let g;
  return d === void 0 ? g = E : (g = ce$1(d, n, r), g && g.length > u && (g = `…(${String(d.length)})`)), `${i}${a}${l}${g}${c}`;
};
const xt$1 = (e, t, n) => e.length === 0 ? "Arguments []" : (t.truncate -= 13, `Arguments [ ${b$1(e, e, t, n, void 0, ", ", t.maxArrayLength)} ]`);
const Nt$1 = (e, t) => {
  let n;
  if (e === "	") n = "	";
  else if (typeof e == "number" && e > 0) n = Array.from({ length: e + 1 }).join(" ");
  else return;
  return { base: n, prev: `
${Array.from({ length: t + 1 }).join(n)}` };
};
const Q$1 = (e, t) => {
  if (e.length === 0) return "";
  const n = t.prev + t.base;
  return n + e.split("\0\0").join(`,${n}`) + t.prev;
};
const It = /^[a-z_]\w*$/i;
const Ot$1 = /^"|"$/g;
const kt$1 = (e, t) => {
  if (It.test(e)) return e;
  const n = JSON.stringify(e);
  return t.quoteStyle === "double" ? n.replaceAll('"', String.raw`\"`) : n.replaceAll("'", String.raw`\'`).replaceAll(String.raw`\"`, '"').replaceAll(Ot$1, "'");
};
const C = ([e, t], n, r, o) => {
  r.truncate -= 2;
  let s;
  typeof e == "string" ? s = kt$1(e, r) : typeof e == "number" ? s = String(e) : s = `[${o(e, n, r)}]`, r.truncate -= s.length;
  const i = o(t, n, r);
  return `${s}: ${i}`;
};
const Bt$1 = /* @__PURE__ */ Symbol.for("chai/inspect");
const ne$2 = (e) => ({ [Bt$1]: () => e });
const D = (e, t) => {
  let n;
  try {
    n = Object.getOwnPropertyDescriptor(e, t);
  } catch {
    n = void 0;
  }
  if (n === void 0 || "value" in n) try {
    return e[t];
  } catch {
    return ne$2(E);
  }
  if (n.get === void 0) return ne$2("[Setter]");
  try {
    return e[t];
  } catch {
    return ne$2(E);
  }
};
const Lt$1 = (e) => {
  for (const t of e) if (Array.isArray(t) || typeof t == "object" && t !== null) return true;
  return false;
};
const Tt$1 = (e) => {
  const t = [];
  for (const n of Object.keys(e)) {
    const r = Number(n);
    Number.isInteger(r) && r >= 0 && String(r) === n && r < 4294967295 || t.push(n);
  }
  return t;
};
const jt$1 = (e, t, n, r) => {
  const o = Tt$1(e);
  if (e.length === 0 && o.length === 0) return "[]";
  t.truncate -= 4;
  const s = !!r && Lt$1(e);
  let i = b$1(e, e, t, n, void 0, s ? "\0\0" : ", ", t.maxArrayLength);
  t.truncate -= i.length;
  let l = "";
  return o.length > 0 && (l = b$1(o.map((c) => [c, D(e, c)]), e, t, n, C)), s && r && (i = Q$1(i, r)), `[${s ? "" : " "}${i}${l ? `, ${l}` : ""}${s ? "" : " "}]`;
};
const Ft = 50;
const pe$1 = (e, t) => {
  const n = new Uint8Array(e), r = Math.min(n.length, Ft);
  let o = "", s = false;
  for (let a = 0; a < r; a += 1) {
    const u = n[a];
    u !== 0 && (s = true), o += (a === 0 ? "" : " ") + u.toString(16).padStart(2, "0");
  }
  n.length > r && (o += ` ... ${String(n.length - r)} more byte${n.length - r === 1 ? "" : "s"}`);
  const i = e instanceof ArrayBuffer ? "ArrayBuffer" : "SharedArrayBuffer", l = s || n.length > r, c = o !== "" && l ? `[Uint8Contents]: <${o}>, ` : "";
  return `${t.stylize(i, "special")} { ${c}byteLength: ${t.stylize(String(e.byteLength), "number")} }`;
};
const me$1 = /\d(?=(?:\d{3})+(?!\d))/g;
const Wt = /\d{3}/g;
const Mt$1 = /_$/;
const Ve = (e, t) => {
  if (t.length < 4 || t.length === 4 && t.codePointAt(0) === 45 || e === Number.POSITIVE_INFINITY || e === Number.NEGATIVE_INFINITY || t.includes("e")) return t;
  if (typeof e == "number") {
    const n = e < 0 ? -Math.floor(-e) : Math.floor(e);
    if (n !== e) {
      const r = String(n), o = t.slice(r.length + 1);
      return `${r.replace(me$1, "$&_")}.${o.replace(Wt, "$&_").replace(Mt$1, "")}`;
    }
  }
  return t.replace(me$1, "$&_");
};
const _t = (e) => e >= "\uD800" && e <= "\uDBFF";
const B$1 = (e, t, n = "…") => {
  e = String(e);
  const r = n.length, o = e.length;
  if (r > t && o > r) return n;
  if (o > t && o > r) {
    let s = t - r;
    return s > 0 && _t(e[s - 1]) && (s -= 1), `${e.slice(0, s)}${n}`;
  }
  return e;
};
const ye = (e, t) => {
  let n = B$1(e.toString(), t.truncate - 1);
  return n !== "…" && (n += "n"), t.stylize(t.numericSeparator ? Ve(e, n) : n, "bigint");
};
const Ge$1 = (e) => {
  try {
    return Array.isArray(e);
  } catch {
    return false;
  }
};
const F = (e, t) => {
  try {
    return e[t];
  } catch {
    return;
  }
};
const zt = (e, t) => {
  try {
    return e instanceof t;
  } catch {
    return false;
  }
};
const be$1 = (e, t) => {
  try {
    return Object.getOwnPropertyDescriptor(e, t)?.enumerable ?? false;
  } catch {
    return true;
  }
};
const Rt$1 = (typeof Reflect == "function" ? Reflect.getPrototypeOf : Object.getPrototypeOf) || ([].__proto__ === Array.prototype ? function(e) {
  return e.__proto__;
} : void 0);
const K$2 = (e, t, n, r) => {
  if ("window" in globalThis && e === globalThis) return "{ [object Window] }";
  if (e === globalThis) return "{ [object globalThis] }";
  let o, s;
  try {
    o = Object.getOwnPropertyNames(e), s = Object.getOwnPropertySymbols(e);
  } catch {
    return E;
  }
  let i, l;
  try {
    i = t.showHidden ? o : o.filter((f) => Object.getOwnPropertyDescriptor(e, f)?.enumerable);
  } catch {
    i = o.filter((f) => be$1(e, f));
  }
  try {
    l = s.filter((f) => t.showHidden || Object.getOwnPropertyDescriptor(e, f)?.enumerable);
  } catch {
    l = s.filter((f) => be$1(e, f));
  }
  let c;
  try {
    const f = Rt$1(e) === Object.prototype || e.constructor === Object, h = e instanceof Object ? "" : "null prototype";
    let p;
    !f && Symbol.toStringTag in e ? p = e[Symbol.toStringTag] : p = h ? "Object" : "", c = p || h ? `[${[p, h].filter(Boolean).join(": ")}] ` : "";
  } catch {
    c = "";
  }
  if (i.length === 0 && l.length === 0) return `${c}{}`;
  t.truncate -= 4;
  const a = r ? "\0\0" : ", ", u = b$1(i.map((f) => [f, D(e, f)]), e, t, n, C, a), d = b$1(l.map((f) => [f, D(e, f)]), e, t, n, C, a);
  let g = "";
  return u && d && (g = a), r ? `${c}{${Q$1(u + g + d, r)}}` : `${c}{ ${u}${g}${d} }`;
};
const Pt = (e, t, n, r) => {
  let o;
  try {
    o = typeof e.constructor == "function" ? e.constructor.name : "";
  } catch {
    o = "";
  }
  return (!o || o === "_class") && (o = "<Anonymous Class>"), t.truncate -= o.length, `${o} ${K$2(e, t, n, r)}`;
};
const Ct = (e, t) => {
  const n = t.stylize(String(e.byteLength), "number"), r = t.stylize(String(e.byteOffset), "number"), o = t.stylize(String(e.buffer.byteLength), "number");
  return `${t.stylize("DataView", "special")} { byteLength: ${n}, byteOffset: ${r}, buffer: ArrayBuffer { byteLength: ${o} } }`;
};
const Dt = (e, t) => {
  const n = e.toJSON();
  if (n === null) return "Invalid Date";
  const r = n.split("T"), o = r[0];
  return t.stylize(`${o}T${B$1(r[1], t.truncate - o.length - 1)}`, "date");
};
const Vt = /* @__PURE__ */ new Set(["column", "columnNumber", "description", "fileName", "line", "lineNumber", "message", "name", "number", "stack"]);
const Gt = (e, t, n) => {
  const r = Object.getOwnPropertyNames(e).filter((l) => !Vt.has(l)), { name: o } = e;
  t.truncate -= o.length;
  let s = "";
  typeof e.message == "string" ? s = B$1(e.message, t.truncate) : r.unshift("message"), s = s ? `: ${s}` : "", t.truncate -= s.length + 5;
  const i = b$1(r.map((l) => [l, D(e, l)]), e, t, n, C);
  return `${o}${s}${i ? ` { ${i} }` : ""}`;
};
const $e$1 = (e, t) => {
  let n, r, o;
  try {
    n = e[Symbol.toStringTag] || "Function", r = e.toString(), { name: o } = e;
  } catch {
    return t.stylize(E, "special");
  }
  return r.length < t.truncate - 12 ? t.stylize(`[${n}: ${r}]`, "special") : o ? t.stylize(`[${n} ${B$1(o, t.truncate - 11)}]`, "special") : t.stylize(`[${n}]`, "special");
};
const we$1 = (e, t) => {
  const n = F(e, Symbol.toStringTag), r = typeof n == "string" ? n : "Generator";
  return `${t.stylize(`Object [${r}]`, "special")} {}`;
};
const Ht = ([e, t], n, r, o) => (r.truncate -= 4, e = o(e, n, r), r.truncate -= e.length, `${e} => ${o(t, n, r)}`);
const Ut = (e, t, n, r) => {
  if (e.size <= 0) return "Map (0) {}";
  t.truncate -= 7;
  let o = b$1([...e.entries()], e, t, n, Ht, r ? "\0\0" : ", ", t.maxArrayLength);
  return r && (o = Q$1(o, r)), `Map (${String(e.size)}) {${r ? "" : " "}${o}${r ? "" : " "}}`;
};
function ve(e, t) {
  return Number.isNaN(e) ? t.stylize("NaN", "number") : e === Number.POSITIVE_INFINITY ? t.stylize("Infinity", "number") : e === Number.NEGATIVE_INFINITY ? t.stylize("-Infinity", "number") : e === 0 ? t.stylize(1 / e === Number.POSITIVE_INFINITY ? "+0" : "-0", "number") : t.stylize(B$1(t.numericSeparator ? Ve(e, e.toString()) : e.toString(), t.truncate), "number");
}
const qt = () => "Promise{…}";
const Yt = (e, t) => {
  const n = t.truncate - (2 + e.flags.length);
  return t.stylize(`/${B$1(e.source, n)}/${e.flags}`, "regexp");
};
const Jt = (e, t, n, r) => {
  if (e.size === 0) return "Set (0) {}";
  t.truncate -= 7;
  let o = b$1([...e], e, t, n, void 0, r ? "\0\0" : ", ", t.maxArrayLength);
  return r && (o = Q$1(o, r)), `Set (${String(e.size)}) {${r ? "" : " "}${o}${r ? "" : " "}}`;
};
const Kt = (e, t) => {
  const n = t.quoteStyle === "double" ? '"' : "'";
  return n + e + n;
};
const Se$1 = new RegExp(String.raw`['\0-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5` + String.raw`\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]`, "g");
const Zt = { "	": String.raw`\t`, "\n": String.raw`\n`, "\f": String.raw`\f`, "\r": String.raw`\r`, "\b": String.raw`\b`, "'": String.raw`\'`, "\\": "\\\\" };
const Xt = 16;
const Qt = (e) => Zt[e] || String.raw`\u${`0000${e.codePointAt(0).toString(Xt)}`.slice(-4)}`;
const Ae = (e, t) => (Se$1.test(e) && (e = e.replaceAll(Se$1, Qt)), t.stylize(Kt(B$1(e, t.truncate - 2), t), "string"));
const Ee = (e) => "description" in Symbol.prototype ? e.description ? `Symbol(${e.description})` : "Symbol()" : e.toString();
const en = (e) => typeof Buffer == "function" && e instanceof Buffer ? "Buffer" : e[Symbol.toStringTag];
const S = (e, t, n) => {
  const r = en(e);
  t.truncate -= r.length + 4;
  const o = Object.keys(e).slice(e.length);
  if (e.length === 0 && o.length === 0) return `${r}[]`;
  let s = "";
  const i = Number.isFinite(t.maxArrayLength) ? Math.min(e.length, Math.max(0, Math.floor(t.maxArrayLength))) : e.length;
  for (let c = 0; c < i; c++) {
    const a = `${t.stylize(B$1(e[c], t.truncate), "number")}${c === i - 1 ? "" : ", "}`;
    if (t.truncate -= a.length, c !== i - 1 && t.truncate <= 3) {
      s += `…(${String(e.length - c)})`;
      break;
    }
    s += a;
  }
  i < e.length && (s += `${s ? ", " : ""}… ${String(e.length - i)} more`);
  let l = "";
  return o.length > 0 && (l = b$1(o.map((c) => [c, D(e, c)]), e, t, n, C)), `${r}[ ${s}${l ? `, ${l}` : ""} ]`;
};
const xe$1 = (e) => typeof F(e, Symbol.toStringTag) != "string";
const tn = (e) => typeof e == "function";
const He$1 = (e, t, n) => {
  if (e == null) return;
  const r = Object.getOwnPropertyDescriptor(e, t);
  if (r === void 0) return;
  const o = n === "get" ? r.get : r.value;
  return typeof o == "function" ? o : void 0;
};
const Ue$1 = (e, t) => {
  if (e !== void 0) return (n) => {
    try {
      return e.call(n, t), true;
    } catch {
      return false;
    }
  };
};
const j = (e, t) => Ue$1(He$1(e, t, "get"));
const N$1 = (e, t, n) => Ue$1(He$1(e, t, "value"), n);
const Ne = Object.freeze({});
const A = j(Reflect.getPrototypeOf(Int8Array.prototype), "length");
const nn = typeof SharedArrayBuffer == "function" ? SharedArrayBuffer.prototype : void 0;
const rn = Object.assign(/* @__PURE__ */ Object.create(null), { Arguments: xe$1, Array: Ge$1, ArrayBuffer: j(ArrayBuffer.prototype, "byteLength"), BigInt: N$1(BigInt.prototype, "valueOf"), Boolean: N$1(Boolean.prototype, "valueOf"), DataView: j(DataView.prototype, "byteLength"), Date: N$1(Date.prototype, "valueOf"), Error: xe$1, Float32Array: A, Float64Array: A, Function: tn, Int8Array: A, Int16Array: A, Int32Array: A, Map: j(Map.prototype, "size"), Number: N$1(Number.prototype, "valueOf"), RegExp: j(RegExp.prototype, "source"), Set: j(Set.prototype, "size"), SharedArrayBuffer: j(nn, "byteLength"), String: N$1(String.prototype, "valueOf"), Symbol: N$1(Symbol.prototype, "valueOf"), Uint8Array: A, Uint8ClampedArray: A, Uint16Array: A, Uint32Array: A, WeakMap: N$1(WeakMap.prototype, "has", Ne), WeakSet: N$1(WeakSet.prototype, "has", Ne) });
const on = (e, t) => {
  const n = rn[t];
  return n === void 0 || n(e);
};
const Ie = /* @__PURE__ */ new WeakMap();
const Oe$1 = /* @__PURE__ */ Object.create(null);
const sn = Object.assign(/* @__PURE__ */ Object.create(null), { Arguments: xt$1, Array: jt$1, ArrayBuffer: pe$1, AsyncGenerator: we$1, BigInt: ye, bigint: ye, Boolean: (e, t) => t.stylize(String(e), "boolean"), boolean: (e, t) => t.stylize(String(e), "boolean"), DataView: Ct, Date: Dt, Error: Gt, Float32Array: S, Float64Array: S, Function: $e$1, function: $e$1, Generator: we$1, HTMLCollection: ce$1, Int8Array: S, Int16Array: S, Int32Array: S, Map: Ut, NodeList: ce$1, null: (e, t) => t.stylize("null", "null"), Number: ve, number: ve, Promise: qt, RegExp: Yt, Set: Jt, SharedArrayBuffer: pe$1, String: Ae, string: Ae, Symbol: Ee, symbol: Ee, Uint8Array: S, Uint8ClampedArray: S, Uint16Array: S, Uint32Array: S, undefined: (e, t) => t.stylize("undefined", "undefined"), WeakMap: (e, t) => t.stylize("WeakMap{…}", "special"), WeakSet: (e, t) => t.stylize("WeakSet{…}", "special") });
const ln = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
const cn = /* @__PURE__ */ Symbol.for("chai/inspect");
const an = (e, t, n, r) => {
  const o = F(e, cn);
  if (typeof o == "function") return o.call(e, t);
  if (!("window" in globalThis)) {
    const c = F(e, ln);
    if (typeof c == "function") return c.call(e, r, t);
  }
  const s = F(e, "inspect");
  if (typeof s == "function") return s.call(e, r, t);
  const i = F(e, "constructor");
  if (typeof i == "function" && Ie.has(i)) return Ie.get(i)?.(e, t) ?? "unknown";
  const l = Object.hasOwn(Oe$1, n) ? Oe$1[n] : void 0;
  return l ? l(e, t) : "";
};
const re = (e, t, n) => {
  const { depth: r, inspect: o, seen: s } = n;
  if (s.includes(e)) return "[Circular]";
  if (r >= t.depth && t.depth > 0 && typeof e == "object" && e !== null) return Ge$1(e) ? "[Array]" : "[Object]";
  const i = t.indent ? Nt$1(t.indent, r) : void 0;
  let l = e === null ? "null" : typeof e;
  if (l === "object") try {
    l = Object.prototype.toString.call(e).slice(8, -1);
  } catch {
    l = "Object";
  }
  let c = sn[l];
  if (c !== void 0 && typeof e == "object" && e !== null && !on(e, l) && (c = void 0), c !== void 0) return c(e, t, o, i);
  if (t.customInspect && e) {
    const d = an(e, t, l, t.depth - r);
    if (d) return typeof d == "string" ? d : o(d, e, t);
  }
  let a = false;
  if (e) try {
    a = Object.getPrototypeOf(e);
  } catch {
    a = Object.prototype;
  }
  if (a === Object.prototype || a === null) return K$2(e, t, o, i);
  if (e && typeof HTMLElement == "function" && zt(e, HTMLElement)) return De(e, e, t, o);
  const u = F(e, "constructor");
  return u !== void 0 ? u !== Object ? Pt(e, t, o, i) : K$2(e, t, o, i) : e === Object(e) ? K$2(e, t, o, i) : t.stylize(String(e), l);
};
const Kr = (e, t = {}) => {
  const n = { customInspect: true, depth: 5, indent: void 0, maxArrayLength: Number.POSITIVE_INFINITY, numericSeparator: true, quoteStyle: "single", showHidden: false, stylize: (o) => o, truncate: Number.POSITIVE_INFINITY, ...t };
  if (n.indent !== void 0 && n.indent !== "	" && !(Number.parseInt(n.indent, 10) === n.indent && n.indent > 0)) throw new TypeError('option "indent" must be "\\t", an integer > 0, or `undefined`');
  const r = { depth: 0, inspect: void 0, seen: [] };
  return r.inspect = (o, s, i) => {
    if (s == null) {
      r.depth += 1;
      const c = re(o, i, r);
      return r.depth -= 1, c;
    }
    r.seen.push(s), r.depth += 1;
    const l = re(o, i, r);
    return r.depth -= 1, r.seen.pop(), l;
  }, re(e, n, r);
};
const un = /* @__PURE__ */ new Set(["alert", "critical", "emergency", "error", "trace", "warning"]);
const Zr = (e) => un.has(e);
const Xr = (e, t) => t ? (t.__write ?? t.write.bind(t)).call(t, e) : false;
const fn = globalThis.process ?? /* @__PURE__ */ Object.create(null);
const ke$1 = { versions: {} };
const V$2 = /* @__PURE__ */ new Proxy(fn, { get(e, t) {
  if (t in e) return e[t];
  if (t in ke$1) return ke$1[t];
} });
const ee$1 = (e) => {
  let t;
  return () => {
    if (t === void 0) {
      if (typeof V$2.getBuiltinModule != "function") throw new TypeError(`[@visulima/error] Cannot load ${e}: this runtime implements no process.getBuiltinModule(). Requires Node ^22.14.0 || >=24.10.0, or another runtime providing process.getBuiltinModule().`);
      t = V$2.getBuiltinModule(e);
    }
    return t;
  };
};
const dn = (e) => e.replaceAll(/\r\n|\r(?!\n)|\n/gu, `
`);
const gn = (e, t, n, r) => {
  const o = { column: 0, line: -1, ...e.start }, s = { ...o, ...e.end }, i = o.line, l = o.column, c = s.line, a = s.column;
  let u = Math.max(i - (n + 1), 0), d = Math.min(t.length, c + r);
  i === -1 && (u = 0), c === -1 && (d = t.length);
  const g = c - i, f = {};
  if (g) for (let h = 0; h <= g; h++) {
    const p = h + i;
    if (!l) f[p] = true;
    else if (h === 0) {
      const m = t[p - 1]?.length;
      f[p] = [l, (m ?? 0) - l + 1];
    } else if (h === g) f[p] = [0, a];
    else {
      const m = t[p - h]?.length;
      f[p] = [0, m];
    }
  }
  else l === a ? f[i] = l ? [l, 0] : true : f[i] = [l, (a ?? 0) - (l ?? 0)];
  return { end: d, markerLines: f, start: u };
};
const hn = V$2.platform === "win32" && !V$2.env?.WT_SESSION ? ">" : "❯";
const pn = (e, t, n) => {
  const r = { linesAbove: 2, linesBelow: 3, prefix: "", showGutter: true, tabWidth: 4, ...n, color: { gutter: (h) => h, marker: (h) => h, message: (h) => h, ...n?.color } }, o = typeof t.start.column == "number";
  let s = (e.includes("\r") ? dn(e) : e).split(`
`);
  typeof r.tabWidth == "number" && e.includes("	") && (s = s.map((h) => h.replaceAll("	", " ".repeat(r.tabWidth))));
  const { end: i, markerLines: l, start: c } = gn(t, s, r.linesAbove, r.linesBelow), a = String(i).length, { gutter: u, marker: d, message: g } = r.color;
  let f = s.slice(c, i).map((h, p) => {
    const m = c + 1 + p, y = l[m], $ = String(m).padStart(a), v = !l[m + 1], x = ` ${$}${r.showGutter ? " |" : ""}`;
    if (y) {
      let w = "";
      if (Array.isArray(y)) {
        const L = h.replaceAll(/[^\t]/g, " ").slice(0, Math.max(y[0] - 1, 0)), T = y[1] || 1;
        w = [`
 `, r.prefix + u(x.replaceAll(/\d/g, " ")), " ", L, d("^").repeat(T)].join(""), v && r.message && (w += ` ${g(r.message)}`);
      }
      return [r.prefix + d(hn), u(x), h.length > 0 ? ` ${h}` : "", w].join("");
    }
    return `${r.prefix} ${u(x)}${h.length > 0 ? ` ${h}` : ""}`;
  }).join(`
`);
  return r.message && !o && (f = `${r.prefix + " ".repeat(a + 1) + r.message}
${f}`), f;
};
const mn = () => V$2.env?.DEBUG === "true";
const M = (e, ...t) => {
  if (mn()) {
    const n = t.map((r) => typeof r == "function" ? r() : r);
    console.debug(`error:parse-stacktrace: ${e}`, ...n);
  }
};
const _ = "<unknown>";
const yn = /^(?:node:internal\/|node:|internal\/)/;
const bn = (e) => e !== void 0 && yn.test(e);
const $n = /^.*?\s*at\s(?:(.+?\)(?:\s\[.+\])?|\(?.*?)\s?\((?:address\sat\s)?)?(?:async\s)?((?:<anonymous>|[-a-z]+:|.*bundle|\/)?.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
const wn = /\((\S+)\),\s(<[^>]+>)?:(\d+)?:(\d+)?\)?/;
const vn = /(.*?):(\d+):(\d+)(?:\s<-\s.+:\d+:\d+)?/;
const Sn = /eval\sat\s(<anonymous>)\s\((.*)\)?:(\d+)?:(\d+)\),\s*<anonymous>?:(\d+)?:(\d+)/;
const An = /^\s*in\s(?:([^\\/]+(?:\s\[as\s\S+\])?)\s\(?)?\(at?\s?(.*?):(\d+)(?::(\d+))?\)?\s*$/;
const En = /in\s(.*)\s\(at\s(.+)\)\sat/;
const xn = /^(?:.*@)?(.*):(\d+):(\d+)$/;
const Nn = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:[-a-z]+)?:\/.*?|\[native code\]|[^@]*(?:bundle|\d+\.js)|\/[\w\-. \/=]+)(?::(\d+))?(?::(\d+))?\s*$/i;
const In = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
const On = /(\S[^\s[]*\[.*\]|.*?)@(.*):(\d+):(\d+)/;
const Be$1 = /\(error: ([^)]*)\)/;
const kn = /at\s/;
const Bn = /^(\S+):(\d+):(\d+)$|^(\S+):(\d+)$/;
const Ln = /Error: |AggregateError:/;
const qe = /^Anonymous function$/;
const Tn = /^\s*in\s.*/;
const jn = /^.*?\s*at\s.*/;
const Fn = /^.*?\s*@.*|\[native code\]/;
const Ye$1 = (e, t) => {
  const n = e.includes("safari-extension"), r = e.includes("safari-web-extension");
  return n || r ? [e.includes("@") ? e.split("@")[0] : _, n ? `safari-extension:${t}` : `safari-web-extension:${t}`] : [e, t];
};
const Je$1 = (e, t) => {
  const n = vn.exec(t);
  n && (e.file = n[1], e.line = +n[2], e.column = +n[3]);
};
const Wn = (e) => {
  const t = En.exec(e);
  if (t) {
    M(`parse nested node error stack line: "${e}"`, () => `found: ${JSON.stringify(t)}`);
    const r = t[2].split(":");
    return { column: r[2] ? +r[2] : void 0, file: r[0], line: r[1] ? +r[1] : void 0, methodName: t[1] ?? _, raw: e, type: void 0 };
  }
  const n = An.exec(e);
  if (n) {
    M(`parse node error stack line: "${e}"`, () => `found: ${JSON.stringify(n)}`);
    const r = { column: n[4] ? +n[4] : void 0, file: n[2] ? n[2].replace(kn, "") : void 0, line: n[3] ? +n[3] : void 0, methodName: n[1] ?? _, raw: e, type: e.startsWith("internal") ? "internal" : void 0 };
    return Je$1(r, `${n[2]}:${n[3]}:${n[4]}`), r;
  }
};
const Mn = (e) => {
  const t = $n.exec(e);
  if (t) {
    M(`parse chrome error stack line: "${e}"`, () => `found: ${JSON.stringify(t)}`);
    const n = t[2]?.startsWith("native"), r = t[2]?.startsWith("eval") || t[1]?.startsWith("eval");
    let o, s;
    if (r) {
      const a = wn.exec(e);
      if (a) {
        const u = Bn.exec(a[1]);
        u ? (t[2] = u[4] ?? u[1], t[3] = u[5] ?? u[2], t[4] = u[3]) : a[2] && (t[2] = a[1]), a[2] && (o = { column: a[4] ? +a[4] : void 0, file: a[2], line: a[3] ? +a[3] : void 0, methodName: "eval", raw: e, type: "eval" });
      } else {
        const u = Sn.exec(e);
        u && (s = { column: u[4] ? +u[4] : void 0, file: u[2], line: u[3] ? +u[3] : void 0 }, o = { column: u[6] ? +u[6] : void 0, file: u[1], line: u[5] ? +u[5] : void 0, methodName: "eval", raw: u[0], type: "eval" });
      }
    }
    const [i, l] = Ye$1(t[1] ? t[1].replace(qe, "<anonymous>") : _, t[2]), c = { column: t[4] ? +t[4] : void 0, evalOrigin: o, file: l, line: t[3] ? +t[3] : void 0, methodName: i, raw: e, type: r ? "eval" : n ? "native" : bn(l) ? "internal" : void 0 };
    return s ? (c.column = s.column, c.file = s.file, c.line = s.line) : Je$1(c, `${l}:${t[3]}:${t[4]}`), c;
  }
};
const _n = (e, t) => {
  const n = Nn.exec(e);
  if (n) {
    M(`parse gecko error stack line: "${e}"`, () => `found: ${JSON.stringify(n)}`);
    const r = n[3]?.includes(" > eval"), o = r && n[3] && In.exec(n[3]);
    let s;
    r && o && (n[3] = o[1], s = { column: n[5] ? +n[5] : void 0, file: n[3], line: n[4] ? +n[4] : void 0, methodName: "eval", raw: e, type: "eval" }, n[4] = o[2]);
    const [i, l] = Ye$1(n[1] ? n[1].replace(qe, "<anonymous>") : _, n[3]);
    let c;
    (t?.type === "safari" || !r && t?.type === "firefox") && t.column ? c = t.column : !r && n[5] && (c = +n[5]);
    let a;
    return (t?.type === "safari" || !r && t?.type === "firefox") && t.line ? a = t.line : n[4] && (a = +n[4]), { column: c, evalOrigin: s, file: l, line: a, methodName: i, raw: e, type: r ? "eval" : l.includes("[native code]") ? "native" : void 0 };
  }
};
const zn = (e, t) => {
  const n = On.exec(e);
  if (!(n && n[2].includes(" > eval")) && n) return M(`parse firefox error stack line: "${e}"`, () => `found: ${JSON.stringify(n)}`), { column: n[4] ? +n[4] : t?.column ?? void 0, file: n[2], line: n[3] ? +n[3] : t?.line ?? void 0, methodName: n[1] || _, raw: e, type: void 0 };
};
const Rn = (e) => {
  const t = xn.exec(e);
  if (t) return M(`parse react android native error stack line: "${e}"`, () => `found: ${JSON.stringify(t)}`), { column: t[3] ? +t[3] : void 0, file: t[1], line: t[2] ? +t[2] : void 0, methodName: _, raw: e, type: void 0 };
};
const Ke$1 = (e, { filter: t, frameLimit: n = 50 } = {}) => {
  const r = e;
  let o = (typeof r.stacktrace == "string" ? r.stacktrace : e.stack ?? "").split(`
`).map((s) => (Be$1.test(s) ? s.replace(Be$1, "$1") : s).trim()).filter((s) => !Ln.test(s) && s !== "eval code");
  return t && (o = o.filter((s) => t(s))), o = o.slice(0, n), o.reduce((s, i, l) => {
    if (!i || i.length > 1024) return s;
    let c;
    if (Tn.test(i)) c = Wn(i);
    else if (jn.test(i)) c = Mn(i);
    else if (Fn.test(i)) {
      let a;
      if (l === 0) {
        const u = e, d = u.columnNumber, g = u.lineNumber, f = u.line, h = u.column;
        d || g ? a = { column: d, line: g, type: "firefox" } : (f || h) && (a = { column: h, line: f, type: "safari" });
      }
      c = zn(i, a) ?? _n(i, a);
    } else c = Rn(i);
    return c ? s.push(c) : M(`parse error stack line: "${i}"`, "not parser found"), s;
  }, []);
};
const Le$1 = ee$1("node:fs");
const Z = ee$1("node:path");
const Pn = ee$1("node:process");
const Cn = ee$1("node:url");
const O = (e, t, n) => n === 0 ? e : t === "	" ? e + "	".repeat(n) : e + " ".repeat(t * n);
const Ze$1 = (e) => e.replaceAll("\\", "/");
const Dn = (e) => {
  if (!e.startsWith("file:")) return e;
  try {
    return Cn().fileURLToPath(e);
  } catch {
    return e;
  }
};
const Vn = (e, t) => {
  const n = e.replace("async file:", "file:");
  return Ze$1(Z().relative(t, Dn(n)));
};
const Gn = (e, t, n) => {
  if (t) return n.title(e.message);
  const r = e.message ? `: ${e.message}` : "";
  return n.title(e.name + r);
};
const Xe$1 = (e, { color: t, hideErrorTitle: n, indentation: r, prefix: o }, s) => `${O(o, r, s)}${Gn(e, n, t)}
`;
const Qe$1 = (e, { color: t, indentation: n, prefix: r }, o) => {
  if (e.hint === void 0) return;
  const s = O(r, n, o);
  let i = "";
  if (Array.isArray(e.hint)) for (const l of e.hint) i += `${s + l}
`;
  else i += s + e.hint;
  return t.hint(i);
};
const de$1 = (e, t) => {
  if (!t || e.file === void 0 || e.line === void 0) return { trace: e };
  try {
    const n = t({ column: e.column, file: e.file, line: e.line });
    return n ? { source: n.source, trace: { ...e, column: n.column ?? e.column, file: n.file ?? e.file, line: n.line ?? e.line } } : { trace: e };
  } catch {
    return { trace: e };
  }
};
const ge$1 = (e, t, n = 0) => {
  const { color: r, cwd: o, displayShortPath: s, indentation: i, prefix: l } = t, { trace: c } = e;
  let a;
  c.file === void 0 ? a = "<unknown>" : a = s ? Vn(c.file, o) : Ze$1(c.file);
  const { fileLine: u, method: d } = r;
  return `${O(l, i, n)}at ${c.methodName ? `${d(c.methodName)} ` : ""}${u(a)}:${u(c.line?.toString() ?? "")}`;
};
const Hn = (e, t) => {
  if (t.allowAllFilePaths) return true;
  const n = Z().resolve(t.cwd), r = Z().resolve(n, e);
  return r === n || r.startsWith(n + Z().sep);
};
const Un = (e) => {
  try {
    return Le$1().existsSync(e) ? Le$1().readFileSync(e, "utf8") : void 0;
  } catch {
    return;
  }
};
const et$1 = (e, t, n) => {
  const { color: r, indentation: o, linesAbove: s, linesBelow: i, prefix: l, showGutter: c, showLineNumbers: a, tabWidth: u } = t, { source: d, trace: g } = e;
  if (g.file === void 0) return;
  let f;
  if (d === void 0) {
    const h = g.file.replace("file://", "");
    if (!Hn(h, t)) return;
    const p = Un(h);
    if (p === void 0) return;
    f = p;
  } else f = d;
  return pn(f, { start: { column: g.column, line: g.line } }, { color: r, linesAbove: s, linesBelow: i, prefix: O(l, o, n), showGutter: c, showLineNumbers: a, tabWidth: u });
};
const tt$1 = (e, t, n) => {
  if (e.errors.length === 0) return;
  let r = `${O(t.prefix, t.indentation, n)}Errors:

`, o = true;
  for (const s of e.errors) o ? o = false : r += `

`, r += rt$1(s, { ...t, framesMaxLimit: 1, hideErrorCodeView: t.hideErrorErrorsCodeView }, n + 1);
  return `
${r}`;
};
const qn = (e) => {
  if (typeof e == "object" && e !== null) try {
    return JSON.stringify(e);
  } catch {
    return Object.prototype.toString.call(e);
  }
  return String(e);
};
const nt$1 = (e, t, n, r = /* @__PURE__ */ new Set()) => {
  r.add(e);
  let o = `${O(t.prefix, t.indentation, n)}Caused by:

`;
  const { cause: s } = e;
  if (!(s instanceof Error)) {
    const c = qn(s);
    return o += `${O(t.prefix, t.indentation, n)}${t.color.title(c)}
`, `
${o}`;
  }
  o += Xe$1(s, t, n);
  const i = Ke$1(s).shift(), l = Qe$1(s, t, n);
  if (l && (o += `${l}
`), i) {
    const c = de$1(i, t.sourceMap);
    if (o += ge$1(c, t, n), !t.hideErrorCauseCodeView) {
      const a = et$1(c, t, n);
      a !== void 0 && (o += `
${a}`);
    }
  }
  if (s instanceof AggregateError) {
    const c = tt$1(s, t, n);
    c !== void 0 && (o += `
${c}`);
  }
  return s.cause && (o += r.has(s) ? `
${O(t.prefix, t.indentation, n + 1)}Caused by: [Circular]` : `
${nt$1(s, t, n + 1, r)}`), `
${o}`;
};
const Yn = (e, t) => (e.length > 0 ? `
` : "") + e.map((n) => ge$1(de$1(n, t.sourceMap), t)).join(`
`);
const rt$1 = (e, t, n) => {
  const r = { allowAllFilePaths: false, cwd: Pn().cwd(), displayShortPath: false, filterStacktrace: void 0, framesMaxLimit: Number.POSITIVE_INFINITY, hideErrorCauseCodeView: false, hideErrorCodeView: false, hideErrorErrorsCodeView: false, hideErrorTitle: false, hideMessage: false, indentation: 4, linesAbove: 2, linesBelow: 3, prefix: "", showGutter: true, showLineNumbers: true, tabWidth: 4, ...t, color: { fileLine: (l) => l, gutter: (l) => l, hint: (l) => l, marker: (l) => l, message: (l) => l, method: (l) => l, title: (l) => l, ...t.color } }, o = Ke$1(e, { filter: t.filterStacktrace, frameLimit: r.framesMaxLimit }), s = o.shift(), i = s ? de$1(s, r.sourceMap) : void 0;
  return [t.hideMessage ? void 0 : Xe$1(e, r, n), Qe$1(e, r, n), i ? ge$1(i, r, n) : void 0, i && !r.hideErrorCodeView ? et$1(i, r, n) : void 0, e instanceof AggregateError ? tt$1(e, r, n) : void 0, e.cause === void 0 || e.cause === null ? void 0 : nt$1(e, r, n), o.length > 0 ? Yn(o, r) : void 0].filter(Boolean).join(`
`);
};
const Qr = (e, t = {}) => {
  if (t.framesMaxLimit !== void 0 && t.framesMaxLimit <= 0) throw new RangeError("The 'framesMaxLimit' option must be a positive number");
  return rt$1(e, t, 0);
};
const Jn = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
const Kn = 12288;
const Zn = 65510;
const Xn = [12288, 12288, 65281, 65376, 65504, 65510];
const Qn = 8361;
const er = 65518;
const tr = [8361, 8361, 65377, 65470, 65474, 65479, 65482, 65487, 65490, 65495, 65498, 65500, 65512, 65518];
const nr = 32;
const rr = 10630;
const or = [32, 126, 162, 163, 165, 166, 172, 172, 175, 175, 10214, 10221, 10629, 10630];
const sr = 4352;
const ir = 262141;
const ot$1 = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];
const H = (e, t) => {
  let n = 0, r = Math.floor(e.length / 2) - 1;
  for (; n <= r; ) {
    const o = Math.floor((n + r) / 2), s = o * 2;
    if (t < e[s]) r = o - 1;
    else if (t > e[s + 1]) n = o + 1;
    else return true;
  }
  return false;
};
const Te$1 = 19968;
const [lr, cr] = ar(ot$1);
function ar(e) {
  let t = e[0], n = e[1];
  for (let r = 0; r < e.length; r += 2) {
    const o = e[r], s = e[r + 1];
    if (Te$1 >= o && Te$1 <= s) return [o, s];
    s - o > n - t && (t = o, n = s);
  }
  return [t, n];
}
const ur = (e) => e < 161 || e > 1114109 ? false : H(Jn, e);
const fr = (e) => e < Kn || e > Zn ? false : H(Xn, e);
const dr = (e) => e < Qn || e > er ? false : H(tr, e);
const gr = (e) => e < nr || e > rr ? false : H(or, e);
const hr = (e) => e >= lr && e <= cr ? true : e < sr || e > ir ? false : H(ot$1, e);
function pr(e) {
  return ur(e) ? "ambiguous" : fr(e) ? "fullwidth" : dr(e) ? "halfwidth" : gr(e) ? "narrow" : hr(e) ? "wide" : "neutral";
}
function mr(e) {
  if (!Number.isSafeInteger(e)) throw new TypeError(`Expected a code point, got \`${typeof e}\`.`);
}
function st$1(e) {
  return mr(e), pr(e);
}
const it$1 = String.raw;
const je = it$1`\p{Emoji}(?:\p{EMod}|[\u{E0020}-\u{E007E}]+\u{E007F}|\uFE0F?\u20E3?)`;
const yr = () => new RegExp(it$1`\p{RI}{2}|(?![#*\d](?!\uFE0F?\u20E3))${je}(?:\u200D${je})*`, "gu");
const R$1 = /* @__PURE__ */ new Set(["\x1B", ""]);
const te$2 = "\x07";
const lt$1 = "[";
const he$1 = "m";
const G = "]8;;";
const br = 39;
const $r = /[\u200B\uFEFF\u2060-\u2064]/g;
const wr = new RegExp(`(?:\\${lt$1}(?<code>\\d+)m|\\${G}(?<uri>.*)${te$2})`);
const vr = Object.freeze(/* @__PURE__ */ new Map([[0, 0], [1, 22], [2, 22], [3, 23], [4, 24], [7, 27], [8, 28], [9, 29], [30, 39], [31, 39], [32, 39], [33, 39], [34, 39], [35, 39], [36, 39], [37, 39], [40, 49], [41, 49], [42, 49], [43, 49], [44, 49], [45, 49], [46, 49], [47, 49], [90, 39]]));
const ct$1 = /[\u001B\u009B](?:[[()#;?]{0,10}(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><]|\]8;;[^\u0007\u001B]{0,100}(?:\u0007|\u001B\\))/g;
const U$2 = /[\u0000-\u0008\n-\u001F\u007F-\u009F]{1,1000}/y;
const Sr = yr();
const Fe = /* @__PURE__ */ new Map();
const Ar = (e) => [e.ambiguousIsNarrow ? 1 : 0, e.control, e.fullWidth, e.regular, e.wide].join("|");
const Er = (e) => {
  const t = Ar(e.width);
  let n = Fe.get(t);
  return n || (n = /* @__PURE__ */ new Map(), Fe.set(t, n)), n;
};
const q = new RegExp(ct$1.source, "y");
const oe$1 = new RegExp(Sr.source, "uy");
const Y = /(?:[\u0020-\u007E\u00A0-\u00FF](?!\uFE0F)){1,1000}/y;
const at$1 = (e) => e >= 32 && e <= 126 ? "latin" : e === 8203 || e === 8204 || e === 8205 || e === 8288 ? "zero" : e <= 31 || e >= 127 && e <= 159 ? "control" : e >= 160 && e <= 255 || e >= 9472 && e <= 9599 ? "latin" : e >= 4352 && e <= 4607 || e >= 11904 && e <= 40959 || e >= 44032 && e <= 55215 || e >= 63744 && e <= 64255 || e >= 65280 && e <= 65519 && !(e >= 65377 && e <= 65439) || e >= 12352 && e <= 12543 ? "wide" : e === 8230 ? "latin" : "other";
const xr = (e, t) => {
  const n = Er(t), r = Math.floor(e / 65536), o = e % 65536;
  let s = n.get(r);
  if (s || (s = /* @__PURE__ */ new Map(), n.set(r, s)), s.has(o)) return s.get(o);
  let i;
  switch (at$1(e)) {
    case "control": {
      i = t.width.control;
      break;
    }
    case "latin": {
      i = t.width.regular;
      break;
    }
    case "wide": {
      i = t.width.wide;
      break;
    }
    case "zero": {
      i = 0;
      break;
    }
    default:
      switch (st$1(e)) {
        case "ambiguous": {
          i = t.width.ambiguousIsNarrow ? t.width.regular : t.width.wide;
          break;
        }
        case "fullwidth": {
          i = t.width.fullWidth;
          break;
        }
        case "wide": {
          i = t.width.wide;
          break;
        }
        default:
          i = t.width.regular;
      }
  }
  return s.set(o, i), i;
};
const Nr = (e) => e >= 768 && e <= 879 || e >= 6832 && e <= 6911 || e >= 7616 && e <= 7679 || e >= 8400 && e <= 8447 || e >= 65056 && e <= 65071 || e >= 917760 && e <= 917999 || e >= 65024 && e <= 65039 || e >= 3633 && e <= 3642 || e >= 3655 && e <= 3662 || e >= 3761 && e <= 3769 || e >= 3771 && e <= 3772 || e >= 3784 && e <= 3789 || e >= 2304 && e <= 2307 || e >= 2362 && e <= 2383 || e >= 2385 && e <= 2391 || e >= 2402 && e <= 2403 || e >= 2433 && e <= 2435 || e >= 2492 && e <= 2500 || e >= 2509 && e <= 2509 || e >= 2561 && e <= 2563 || e >= 2620 && e <= 2637 || e >= 1611 && e <= 1631 || e >= 1648 && e <= 1648 || e >= 1750 && e <= 1773 || e >= 2276 && e <= 2302 || e >= 1425 && e <= 1469 || e >= 1471 && e <= 1471 || e >= 1473 && e <= 1474 || e >= 1476 && e <= 1477 || e >= 1479 && e <= 1479 || e >= 3893 && e <= 3893 || e >= 3895 && e <= 3895 || e >= 3897 && e <= 3897 || e >= 3953 && e <= 3966 || e >= 3968 && e <= 3972 || e >= 3974 && e <= 3975 ? true : e >= 768 && e <= 777 || e >= 803 && e <= 803;
const ae$1 = (e, t = {}) => {
  if (!e || e.length === 0) return { ellipsed: false, index: 0, truncated: false, width: 0 };
  const n = { truncation: { countAnsiEscapeCodes: t.countAnsiEscapeCodes ?? false, ellipsis: t.ellipsis ?? "", ellipsisWidth: t.ellipsisWidth ?? (t.ellipsis ? ae$1(t.ellipsis, { ...t, ellipsis: "", ellipsisWidth: 0, limit: Number.POSITIVE_INFINITY }).width : 0), limit: t.limit ?? Number.POSITIVE_INFINITY }, width: { ambiguousIsNarrow: t.ambiguousIsNarrow ?? false, ansi: t.ansiWidth ?? 0, control: t.controlWidth ?? 0, emoji: t.emojiWidth ?? 2, fullWidth: t.fullWidth ?? 2, halfWidth: t.halfWidth ?? 1, regular: t.regularWidth ?? 1, tab: t.tabWidth ?? 8, wide: t.wideWidth ?? 2 } }, r = Math.max(0, n.truncation.limit - n.truncation.ellipsisWidth), { length: o } = e, s = o > 1e4;
  let i = 0, l = 0, c = o, a = false;
  const u = e.includes("\x1B") || e.includes("");
  for (; i < o; ) {
    if (u && (e[i] === "\x1B" || e[i] === "")) {
      if (e.startsWith("\x1B]8;;", i)) {
        const m = "\x1B]8;;\x07", y = m.length, $ = e.indexOf("\x07", i + 5);
        if ($ !== -1) {
          const v = e.indexOf(m, $ + 1);
          if (v !== -1) {
            const x = v + y, w = e.slice($ + 1, v).replace(ct$1, ""), L = ae$1(w, { ambiguousIsNarrow: n.width.ambiguousIsNarrow, ansiWidth: n.width.ansi, controlWidth: n.width.control, countAnsiEscapeCodes: false, ellipsis: n.truncation.ellipsis, ellipsisWidth: n.truncation.ellipsisWidth, emojiWidth: n.width.emoji, fullWidth: n.width.fullWidth, halfWidth: n.width.halfWidth, limit: Math.max(0, r - l), regularWidth: n.width.regular, tabWidth: n.width.tab, wideWidth: n.width.wide }), T = L.width;
            if (L.truncated) a = true, c = Math.min(c, i);
            else if (l + T > r && (c = Math.min(c, i), a = true, l + T > n.truncation.limit)) break;
            if (l += T, i = x, a && l >= n.truncation.limit) break;
            continue;
          }
        }
      }
      if (q.lastIndex = i, q.test(e)) {
        const m = q.lastIndex - i, y = n.truncation.countAnsiEscapeCodes ? m : n.width.ansi;
        if (l + y > r && (c = Math.min(c, i), l + y > n.truncation.limit)) {
          a = true;
          break;
        }
        l += y, i = q.lastIndex;
        continue;
      }
    }
    const f = e.codePointAt(i);
    if (f === 8203 || f === 65279 || f >= 8288 && f <= 8292) {
      i += 1;
      continue;
    }
    if (f === 9) {
      if (l + n.width.tab > r && (c = Math.min(c, i), l + n.width.tab > n.truncation.limit)) {
        a = true;
        break;
      }
      l += n.width.tab, i += 1;
      continue;
    }
    if (Y.lastIndex = i, Y.test(e)) {
      const m = (Y.lastIndex - i) * n.width.regular;
      if (l + m > r) {
        const y = n.width.regular > 0 ? Math.floor((r - l) / n.width.regular) : 0;
        if (c = Math.min(c, i + y), l + m > n.truncation.limit) {
          a = true;
          break;
        }
      }
      l += m, i = Y.lastIndex;
      continue;
    }
    if ((f <= 31 || f >= 127 && f <= 159) && (U$2.lastIndex = i, U$2.test(e))) {
      const m = (U$2.lastIndex - i) * n.width.control;
      if (l + m > r) {
        const y = n.width.control > 0 ? Math.floor((r - l) / n.width.control) : 0;
        if (c = Math.min(c, i + y), l + m > n.truncation.limit) {
          a = true;
          break;
        }
      }
      l += m, i = U$2.lastIndex;
      continue;
    }
    if (oe$1.lastIndex = i, oe$1.test(e)) {
      if (l + n.width.emoji > r && (c = Math.min(c, i), l + n.width.emoji > n.truncation.limit)) {
        a = true;
        break;
      }
      l += n.width.emoji, i = oe$1.lastIndex;
      continue;
    }
    const h = e.codePointAt(i) ?? 0;
    if (Nr(h)) {
      i += h > 65535 ? 2 : 1;
      continue;
    }
    let p;
    if (s) p = xr(h, n);
    else switch (at$1(h)) {
      case "control": {
        p = n.width.control;
        break;
      }
      case "latin": {
        p = n.width.regular;
        break;
      }
      case "wide": {
        p = n.width.wide;
        break;
      }
      case "zero": {
        p = 0;
        break;
      }
      default:
        switch (st$1(h)) {
          case "ambiguous": {
            p = n.width.ambiguousIsNarrow ? n.width.regular : n.width.wide;
            break;
          }
          case "fullwidth": {
            p = n.width.fullWidth;
            break;
          }
          case "wide": {
            p = n.width.wide;
            break;
          }
          default:
            p = n.width.regular;
        }
    }
    if (l + p > r && (c = Math.min(c, i), l + p > n.truncation.limit)) {
      a = true;
      break;
    }
    l += p, i += h > 65535 ? 2 : 1;
  }
  let d = l, g = false;
  return a && n.truncation.limit >= n.truncation.ellipsisWidth && (d = n.truncation.limit, g = true), { ellipsed: g, index: a ? c : o, truncated: a, width: d };
};
const k = (e, t = {}) => ae$1(e, { ...t, ellipsis: "", ellipsisWidth: 0, limit: Number.POSITIVE_INFINITY }).width;
const Ir = /\x1B\[(\d+)m/;
let ut$1 = class ut {
  activeForeground = void 0;
  activeBackground = void 0;
  activeFormatting = [];
  processEscape(t) {
    const n = Ir.exec(t);
    if (!n) return;
    const r = Number.parseInt(n[1], 10);
    switch (r) {
      case 0: {
        this.activeForeground = void 0, this.activeBackground = void 0, this.activeFormatting = [];
        break;
      }
      case 39: {
        this.activeForeground = void 0;
        break;
      }
      case 49: {
        this.activeBackground = void 0;
        break;
      }
      default:
        if (r >= 30 && r <= 37 || r >= 90 && r <= 97) this.activeForeground = t;
        else if (r >= 40 && r <= 47 || r >= 100 && r <= 107) this.activeBackground = t;
        else if ([1, 2, 3, 4, 7, 8, 9].includes(r)) this.activeFormatting.push(t);
        else if ([22, 23, 24, 27, 28, 29].includes(r)) {
          const o = { 22: "[1m", 23: "[3m", 24: "[4m", 27: "[7m", 28: "[8m", 29: "[9m" }[r];
          o && (this.activeFormatting = this.activeFormatting.filter((s) => !s.includes(o)));
        }
    }
  }
  getStartEscapesForAllActiveAttributes() {
    return [this.activeBackground, this.activeForeground, ...this.activeFormatting].filter(Boolean).join("");
  }
  getEndEscapesForAllActiveAttributes() {
    const t = [];
    if (this.activeFormatting.length > 0) {
      const n = { "\x1B[1m": "\x1B[22m", "\x1B[2m": "\x1B[22m", "\x1B[3m": "\x1B[23m", "\x1B[4m": "\x1B[24m", "\x1B[7m": "\x1B[27m", "\x1B[8m": "\x1B[28m", "\x1B[9m": "\x1B[29m" };
      [...this.activeFormatting].toReversed().forEach((r) => {
        const o = n[r];
        o && t.push(o);
      });
    }
    return this.activeForeground && t.push("\x1B[39m"), this.activeBackground && t.push("\x1B[49m"), t.join("");
  }
};
const Or = (e, t) => {
  if (!R$1.has(e[t])) return { isInsideEscape: false, isInsideLinkEscape: false };
  const n = true, r = e.slice(t + 1, t + 1 + G.length).join("") === G;
  return { isInsideEscape: n, isInsideLinkEscape: r };
};
const kr = (e, t = {}) => {
  const n = new ut$1();
  let r = "", o = false, s = "", i = "", l = false;
  const c = [...e];
  for (let a = 0; a < c.length; a++) {
    const u = c[a];
    if (u && R$1.has(u)) {
      if (r) {
        const p = t.getWidth?.(r) ?? 0, m = { isEscapeSequence: false, isGrapheme: true, text: r, width: p };
        if (l && (m.isHyperlink = true, m.hyperlinkUrl = i), t.onSegment?.(m, n) === false) return;
        r = "";
      }
      o = true, s = u;
      const f = Or(c, a), { isInsideLinkEscape: h } = f;
      if (h) {
        let p = a + 1;
        for (i = ""; p < c.length; ) {
          const y = c[p];
          if (y === te$2) break;
          i += y, p += 1;
        }
        i = i.slice(4);
        const m = { hyperlinkUrl: i, isEscapeSequence: true, isGrapheme: false, isHyperlink: true, isHyperlinkStart: true, width: 0 };
        if (t.onSegment?.(m, n) === false) return;
        a = p, l = true, o = false, s = "";
        continue;
      }
      if (a + 1 < c.length && c[a + 1] === "\\" && l) {
        const p = { isEscapeSequence: true, isGrapheme: false, isHyperlink: true, isHyperlinkEnd: true, width: 0 };
        if (t.onSegment?.(p, n) === false) return;
        l = false, i = "", a += 1, o = false, s = "";
        continue;
      }
    }
    if (o) {
      if (s !== u && (s += u), u === he$1) {
        o = false, n.processEscape(s);
        const f = { isEscapeSequence: true, isGrapheme: false, text: s, width: 0 };
        if (t.onSegment?.(f, n) === false) return;
        s = "";
      }
      continue;
    }
    r += u;
    const d = t.getWidth?.(r) ?? 0, g = { isEscapeSequence: false, isGrapheme: true, text: r, width: d };
    if (l && (g.isHyperlink = true, g.hyperlinkUrl = i), t.onSegment?.(g, n) === false) return;
    r = "";
  }
  if (r) {
    const a = t.getWidth?.(r) ?? 0, u = { isEscapeSequence: false, isGrapheme: true, text: r, width: a };
    l && (u.isHyperlink = true, u.hyperlinkUrl = i), t.onSegment?.(u, n);
  }
  if (s) {
    const a = { isEscapeSequence: true, isGrapheme: false, text: s, width: 0 };
    t.onSegment?.(a, n);
  }
};
const We$1 = (e) => `${R$1.values().next().value}${lt$1}${String(e)}${he$1}`;
const Me$1 = (e) => `${R$1.values().next().value}${G}${e}${te$2}`;
const Br = (e) => {
  if (e.length === 0) return "";
  if (e.length === 1) return e[0];
  let t = "", n, r;
  const o = e.join(`
`), s = [...o];
  let i = 0;
  for (const [l, c] of s.entries()) {
    if (t += c, R$1.has(c)) {
      const u = wr.exec(o.slice(i))?.groups ?? {};
      if (u.code !== void 0) {
        const d = Number.parseFloat(u.code);
        n = d === br ? void 0 : d;
      } else u.uri !== void 0 && (r = u.uri.length === 0 ? void 0 : u.uri);
    }
    const a = vr.get(Number(n));
    s[l + 1] === `
` ? (r && (t += Me$1("")), n && a && (t += We$1(a))) : c === `
` && (n && a && (t += We$1(n)), r && (t += Me$1(r))), i += c.length;
  }
  return t;
};
const ft$1 = /(?=\s)|(?<=\s)/;
const dt$1 = /^\s+$/;
const _e = /* @__PURE__ */ new Map();
const Lr = (e) => {
  const t = _e.get(e);
  if (t !== void 0) return t;
  const n = k(e);
  return _e.set(e, n), n;
};
const se$1 = (e) => {
  if (!e.includes("\x1B")) return e;
  let t = e;
  return e.includes("\x1B[30m") && (t += "\x1B[39m"), e.includes("\x1B[42m") && (t += "\x1B[49m"), t;
};
const W$1 = (e) => {
  const t = e.split(" ");
  let n = t.length;
  for (; n > 0 && k(t[n - 1]) === 0; ) n--;
  return n === t.length ? e : t.slice(0, n).join(" ") + t.slice(n).join("");
};
const gt$1 = (e, t, n) => {
  if (e.length === 0) return [""];
  if (t <= 0) return [e];
  const r = [], o = new ut$1();
  let s = "", i = 0, l = false, c = false, a = "", u = 0;
  for (; u < e.length; ) {
    const d = e.codePointAt(u), g = String.fromCodePoint(d), f = g.length;
    if (R$1.has(g)) {
      l = true, a = g, s += g, c = e.startsWith(G, u + 1), u += 1;
      continue;
    }
    if (l) {
      a += g, s += g, c ? g === te$2 && (l = c = false) : g === he$1 && (l = false, o.processEscape(a)), u += 1;
      continue;
    }
    const h = Lr(g), p = g === " ";
    if (h === 0) {
      s += g, u += f;
      continue;
    }
    if (i + h > t && (s && r.push(s + o.getEndEscapesForAllActiveAttributes()), s = o.getStartEscapesForAllActiveAttributes(), i = k(s), p && n)) {
      for (; u < e.length && e[u] === " "; ) u += 1;
      continue;
    }
    if (s += g, i += h, i === t && u + f < e.length && (r.push(s + o.getEndEscapesForAllActiveAttributes()), s = o.getStartEscapesForAllActiveAttributes(), i = k(s), u + f < e.length && e[u + f] === " " && n)) {
      for (u += f; u < e.length && e[u] === " "; ) u += 1;
      continue;
    }
    u += f;
  }
  return s && r.push(s + o.getEndEscapesForAllActiveAttributes()), n ? r.map((d) => W$1(d)) : r;
};
const Tr = (e, t, n) => {
  if (e.length === 0) return [];
  const r = n ? e.trim() : e;
  if (r.length === 0) return [];
  const o = [];
  let s = "", i = 0;
  return kr(r, { getWidth: k, onSegment: (l, c) => {
    const a = l.text ?? "";
    if (l.isEscapeSequence) s += a;
    else {
      const u = a === " ";
      if (l.width === 0) return s += a, true;
      if (i + l.width > t && (s && o.push(s), s = c.getStartEscapesForAllActiveAttributes(), i = 0, u)) return n || o.push(c.getStartEscapesForAllActiveAttributes() + a), true;
      s += a, i += l.width;
    }
    return true;
  } }), s && o.push(s), n ? o.map((l) => W$1(l)) : o;
};
const jr = (e, t, n) => {
  if (e.length === 0) return [];
  const r = n ? e.trim() : e;
  if (r.length === 0) return [];
  const o = r.split(ft$1), s = [];
  let i = "", l = 0, c = 0;
  for (; c < o.length; ) {
    const a = o[c], u = dt$1.test(a), d = k(a);
    if (a.length === 0) {
      c += 1;
      continue;
    }
    if (n && u && l === 0) {
      c += 1;
      continue;
    }
    if (l + d > t && l > 0) {
      n ? s.push(W$1(i)) : s.push(i), i = "", l = 0;
      continue;
    }
    i += a, l += d, c += 1;
  }
  return i && (n ? s.push(W$1(i)) : s.push(i)), s;
};
const Fr = (e, t, n) => {
  if (e.length === 0) return [];
  const r = n ? e.trim() : e;
  if (r.length === 0) return [];
  const o = r.split(ft$1), s = [];
  let i = "", l = 0, c = 0;
  for (; c < o.length; ) {
    const a = o[c], u = dt$1.test(a), d = k(a);
    if (a.length === 0) {
      c += 1;
      continue;
    }
    if (n && u && l === 0) {
      c += 1;
      continue;
    }
    if (d > t) {
      i && s.push(se$1(n ? W$1(i) : i));
      const g = gt$1(a, t, n);
      if (g.length > 0) {
        for (let f = 0; f < g.length - 1; f += 1) s.push(g[f]);
        i = g.at(-1), l = k(i);
      } else i = "", l = 0;
      c += 1;
      continue;
    }
    if (l + d > t && l > 0 && (s.push(se$1(n ? W$1(i) : i)), i = "", l = 0, n && u)) {
      c += 1;
      continue;
    }
    i += a, l += d, c += 1;
  }
  return i && s.push(se$1(n ? W$1(i) : i)), s;
};
const J$1 = { BREAK_AT_CHARACTERS: "BREAK_AT_CHARACTERS", BREAK_WORDS: "BREAK_WORDS", PRESERVE_WORDS: "PRESERVE_WORDS", STRICT_WIDTH: "STRICT_WIDTH" };
const eo = (e, t = {}) => {
  const { removeZeroWidthCharacters: n = true, trim: r = true, width: o = 80, wrapMode: s = J$1.PRESERVE_WORDS } = t;
  if (r && e.trim() === "") return "";
  let i = e.normalize("NFC").replaceAll(`\r
`, `
`);
  return n && (i = i.replaceAll($r, "")), i.split(`
`).map((l) => {
    if (r && l.trim() === "") return "";
    let c;
    switch (s) {
      case J$1.BREAK_AT_CHARACTERS: {
        c = Tr(l, o, r);
        break;
      }
      case J$1.BREAK_WORDS: {
        c = Fr(l, o, r);
        break;
      }
      case J$1.STRICT_WIDTH: {
        c = gt$1(l, o, r);
        break;
      }
      default:
        c = jr(l, o, r);
    }
    return Br(c);
  }).join(`
`);
};
const ht$1 = 80;
const pt$1 = 24;
const ue = (e, t, { shell: n, env: r } = {}) => wt$1(e, t, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 500, shell: n, env: r }).trim();
const X = (e, t) => ({ columns: Number.parseInt(e, 10), rows: Number.parseInt(t, 10) });
const mt$1 = (e, t) => {
  const { columns: n, rows: r } = X(e, t);
  if (!(Number.isNaN(n) || Number.isNaN(r)) && !(n === ht$1 && r === pt$1)) return { columns: n, rows: r };
};
const Wr = () => {
  if (I.platform !== "linux") return true;
  try {
    const e = P$1.readFileSync("/proc/self/stat", "utf8"), t = e.lastIndexOf(") ");
    if (t === -1) return false;
    const n = e.slice(t + 2).trim().split(/\s+/), r = Number.parseInt(n[2], 10), o = Number.parseInt(n[5], 10);
    return Number.isNaN(r) || Number.isNaN(o) || o <= 0 ? false : r === o;
  } catch {
    return false;
  }
};
function to() {
  const { env: e, stdout: t, stderr: n } = I;
  if (t?.columns && t?.rows) return X(t.columns, t.rows);
  if (n?.columns && n?.rows) return X(n.columns, n.rows);
  if (e.COLUMNS && e.LINES) return X(e.COLUMNS, e.LINES);
  const r = { columns: ht$1, rows: pt$1 };
  return I.platform === "win32" ? ie() ?? r : I.platform === "darwin" ? ze() ?? ie() ?? r : ze() ?? ie() ?? Mr() ?? r;
}
const ze = () => {
  try {
    const e = I.platform === "darwin" ? P$1.constants.O_EVTONLY | P$1.constants.O_NONBLOCK : P$1.constants.O_NONBLOCK, { columns: t, rows: n } = vt$1.WriteStream(P$1.openSync("/dev/tty", e));
    return { columns: t, rows: n };
  } catch {
  }
};
const ie = () => {
  try {
    const e = ue("tput", ["cols"], { env: { TERM: "dumb", ...I.env } }), t = ue("tput", ["lines"], { env: { TERM: "dumb", ...I.env } });
    if (e && t) return mt$1(e, t);
  } catch {
  }
};
const Mr = () => {
  try {
    if (!Wr()) return;
    const e = ue("resize", ["-u"]).match(/\d+/g);
    if (e.length === 2) return mt$1(e[0], e[1]);
  } catch {
  }
};
const no = (e) => {
  const t = Object.keys(e).map((n) => e[n].badge ?? "");
  return t.length === 0 ? "" : t.reduce((n, r) => n.length > r.length ? n : r, "");
};
const { bold: _r, cyan: zr, green: Re$1, grey: Rr, magenta: Pr, red: Cr, yellow: le$1 } = t$1;
const ro = { indent: 2, quoteStyle: "single", stylize: (e, t) => {
  const n = { bigint: le$1, boolean: le$1, date: Pr, null: _r, number: le$1, regexp: Cr, special: zr, string: Re$1, symbol: Re$1, undefined: Rr };
  return Object.hasOwn(n, t) ? n[t](e) : e;
} };
const { bold: Dr, underline: Vr } = t$1;
const oo = (e, t) => {
  let n = t.uppercase.label ? e.toUpperCase() : e;
  return n = t.underline.label ? Vr(n) : n, t.bold.label && (n = Dr(n)), n;
};
const Gr = (e) => [e.getHours(), e.getMinutes(), e.getSeconds()].map((t) => String(t).padStart(2, "0")).join(":");
class so {
  styles;
  loggerTypes;
  constructor(t) {
    this.styles = { bold: { label: false }, dateFormatter: Gr, underline: { label: false, message: false, prefix: false, suffix: false }, uppercase: { label: false }, ...t }, this.loggerTypes = St$1;
  }
  setLoggerTypes(t) {
    this.loggerTypes = t;
  }
}

const Re = typeof globalThis < "u" && typeof globalThis.process < "u" ? globalThis.process : process;
const { stdout: he, stderr: de, env: K$1 } = Re;
const Je = "\x1B";
const J = "\x1B[";
const Ge = ";";
const Oe = typeof globalThis < "u" && typeof globalThis.window == "object" && globalThis.window.document !== void 0;
const We = /^(?:msys|cygwin)$/;
const ke = process;
const ce = ke?.env ?? {};
!Oe && ce.TERM_PROGRAM;
const Ye = !Oe && (ke?.platform === "win32" || ce.OSTYPE !== void 0 && We.test(ce.OSTYPE));
const He = (r, e) => `${J}${String(e + 1)}${Ge}${String(r + 1)}H`;
var Ke = ((r) => (r[r.Default = 0] = "Default", r[r.BlinkingBlock = 1] = "BlinkingBlock", r[r.SteadyBlock = 2] = "SteadyBlock", r[r.BlinkingUnderline = 3] = "BlinkingUnderline", r[r.SteadyUnderline = 4] = "SteadyUnderline", r[r.BlinkingBar = 5] = "BlinkingBar", r[r.SteadyBar = 6] = "SteadyBar", r))(Ke || {});
var W = ((r) => (r[r.ToEnd = 0] = "ToEnd", r[r.ToBeginning = 1] = "ToBeginning", r[r.EntireScreen = 2] = "EntireScreen", r[r.EntireScreenAndScrollback = 3] = "EntireScreenAndScrollback", r))(W || {});
const U$1 = (r) => {
  const e = r >= 0 && r <= 3 ? r : 0;
  return `${J}${e === 0 ? "" : String(e)}J`;
};
var Be = ((r) => (r[r.ToEnd = 0] = "ToEnd", r[r.ToBeginning = 1] = "ToBeginning", r[r.EntireLine = 2] = "EntireLine", r))(Be || {});
const Ue = (r) => {
  const e = r >= 0 && r <= 2 ? r : 0;
  return `${J}${e === 0 ? "" : String(e)}K`;
};
He(0, 0) + U$1(W.ToEnd);
`${Ue(Be.EntireLine)}${J}`;
`${J}${U$1(W.EntireScreen)}`;
const be = Ye ? `${U$1(W.EntireScreen)}${J}0f` : `${U$1(W.EntireScreen)}${U$1(W.EntireScreenAndScrollback)}${J}H${Je}c`;
var te$1 = { exports: {} };
var Se;
function Qe() {
  return Se || (Se = 1, (function(r, e) {
    const { hasOwnProperty: t } = Object.prototype, s = C();
    s.configure = C, s.stringify = s, s.default = s, e.stringify = s, e.configure = C, r.exports = s;
    const n = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
    function l(c) {
      return c.length < 5e3 && !n.test(c) ? `"${c}"` : JSON.stringify(c);
    }
    function a(c, g) {
      if (c.length > 200 || g) return c.sort(g);
      for (let h = 1; h < c.length; h++) {
        const N = c[h];
        let B = h;
        for (; B !== 0 && c[B - 1] > N; ) c[B] = c[B - 1], B--;
        c[B] = N;
      }
      return c;
    }
    const o = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object.getPrototypeOf(new Int8Array())), Symbol.toStringTag).get;
    function d(c) {
      return o.call(c) !== void 0 && c.length !== 0;
    }
    function m(c, g, h) {
      c.length < h && (h = c.length);
      const N = g === "," ? "" : " ";
      let B = `"0":${N}${c[0]}`;
      for (let A = 1; A < h; A++) B += `${g}"${A}":${N}${c[A]}`;
      return B;
    }
    function b(c) {
      if (t.call(c, "circularValue")) {
        const g = c.circularValue;
        if (typeof g == "string") return `"${g}"`;
        if (g == null) return g;
        if (g === Error || g === TypeError) return { toString() {
          throw new TypeError("Converting circular structure to JSON");
        } };
        throw new TypeError('The "circularValue" argument must be of type string or the value null or undefined');
      }
      return '"[Circular]"';
    }
    function f(c) {
      let g;
      if (t.call(c, "deterministic") && (g = c.deterministic, typeof g != "boolean" && typeof g != "function")) throw new TypeError('The "deterministic" argument must be of type boolean or comparator function');
      return g === void 0 ? true : g;
    }
    function $(c, g) {
      let h;
      if (t.call(c, g) && (h = c[g], typeof h != "boolean")) throw new TypeError(`The "${g}" argument must be of type boolean`);
      return h === void 0 ? true : h;
    }
    function u(c, g) {
      let h;
      if (t.call(c, g)) {
        if (h = c[g], typeof h != "number") throw new TypeError(`The "${g}" argument must be of type number`);
        if (!Number.isInteger(h)) throw new TypeError(`The "${g}" argument must be an integer`);
        if (h < 1) throw new RangeError(`The "${g}" argument must be >= 1`);
      }
      return h === void 0 ? 1 / 0 : h;
    }
    function L(c) {
      return c === 1 ? "1 item" : `${c} items`;
    }
    function I(c) {
      const g = /* @__PURE__ */ new Set();
      for (const h of c) (typeof h == "string" || typeof h == "number") && g.add(String(h));
      return g;
    }
    function G(c) {
      if (t.call(c, "strict")) {
        const g = c.strict;
        if (typeof g != "boolean") throw new TypeError('The "strict" argument must be of type boolean');
        if (g) return (h) => {
          let N = `Object can not safely be stringified. Received type ${typeof h}`;
          throw typeof h != "function" && (N += ` (${h.toString()})`), new Error(N);
        };
      }
    }
    function C(c) {
      c = { ...c };
      const g = G(c);
      g && (c.bigint === void 0 && (c.bigint = false), "circularValue" in c || (c.circularValue = Error));
      const h = b(c), N = $(c, "bigint"), B = f(c), A = typeof B == "function" ? B : void 0, R = u(c, "maximumDepth"), E = u(c, "maximumBreadth");
      function Q(P, i, p, x, S, T) {
        let y = i[P];
        switch (typeof y == "object" && y !== null && typeof y.toJSON == "function" && (y = y.toJSON(P)), y = x.call(i, P, y), typeof y) {
          case "string":
            return l(y);
          case "object": {
            if (y === null) return "null";
            if (p.indexOf(y) !== -1) return h;
            let w = "", O = ",";
            const k = T;
            if (Array.isArray(y)) {
              if (y.length === 0) return "[]";
              if (R < p.length + 1) return '"[Array]"';
              p.push(y), S !== "" && (T += S, w += `
${T}`, O = `,
${T}`);
              const D = Math.min(y.length, E);
              let q = 0;
              for (; q < D - 1; q++) {
                const Z = Q(String(q), y, p, x, S, T);
                w += Z !== void 0 ? Z : "null", w += O;
              }
              const z = Q(String(q), y, p, x, S, T);
              if (w += z !== void 0 ? z : "null", y.length - 1 > E) {
                const Z = y.length - E - 1;
                w += `${O}"... ${L(Z)} not stringified"`;
              }
              return S !== "" && (w += `
${k}`), p.pop(), `[${w}]`;
            }
            let v = Object.keys(y);
            const j = v.length;
            if (j === 0) return "{}";
            if (R < p.length + 1) return '"[Object]"';
            let M = "", _ = "";
            S !== "" && (T += S, O = `,
${T}`, M = " ");
            const F = Math.min(j, E);
            B && !d(y) && (v = a(v, A)), p.push(y);
            for (let D = 0; D < F; D++) {
              const q = v[D], z = Q(q, y, p, x, S, T);
              z !== void 0 && (w += `${_}${l(q)}:${M}${z}`, _ = O);
            }
            if (j > E) {
              const D = j - E;
              w += `${_}"...":${M}"${L(D)} not stringified"`, _ = O;
            }
            return S !== "" && _.length > 1 && (w = `
${T}${w}
${k}`), p.pop(), `{${w}}`;
          }
          case "number":
            return isFinite(y) ? String(y) : g ? g(y) : "null";
          case "boolean":
            return y === true ? "true" : "false";
          case "undefined":
            return;
          case "bigint":
            if (N) return String(y);
          default:
            return g ? g(y) : void 0;
        }
      }
      function X(P, i, p, x, S, T) {
        switch (typeof i == "object" && i !== null && typeof i.toJSON == "function" && (i = i.toJSON(P)), typeof i) {
          case "string":
            return l(i);
          case "object": {
            if (i === null) return "null";
            if (p.indexOf(i) !== -1) return h;
            const y = T;
            let w = "", O = ",";
            if (Array.isArray(i)) {
              if (i.length === 0) return "[]";
              if (R < p.length + 1) return '"[Array]"';
              p.push(i), S !== "" && (T += S, w += `
${T}`, O = `,
${T}`);
              const j = Math.min(i.length, E);
              let M = 0;
              for (; M < j - 1; M++) {
                const F = X(String(M), i[M], p, x, S, T);
                w += F !== void 0 ? F : "null", w += O;
              }
              const _ = X(String(M), i[M], p, x, S, T);
              if (w += _ !== void 0 ? _ : "null", i.length - 1 > E) {
                const F = i.length - E - 1;
                w += `${O}"... ${L(F)} not stringified"`;
              }
              return S !== "" && (w += `
${y}`), p.pop(), `[${w}]`;
            }
            p.push(i);
            let k = "";
            S !== "" && (T += S, O = `,
${T}`, k = " ");
            let v = "";
            for (const j of x) {
              const M = X(j, i[j], p, x, S, T);
              M !== void 0 && (w += `${v}${l(j)}:${k}${M}`, v = O);
            }
            return S !== "" && v.length > 1 && (w = `
${T}${w}
${y}`), p.pop(), `{${w}}`;
          }
          case "number":
            return isFinite(i) ? String(i) : g ? g(i) : "null";
          case "boolean":
            return i === true ? "true" : "false";
          case "undefined":
            return;
          case "bigint":
            if (N) return String(i);
          default:
            return g ? g(i) : void 0;
        }
      }
      function Y(P, i, p, x, S) {
        switch (typeof i) {
          case "string":
            return l(i);
          case "object": {
            if (i === null) return "null";
            if (typeof i.toJSON == "function") {
              if (i = i.toJSON(P), typeof i != "object") return Y(P, i, p, x, S);
              if (i === null) return "null";
            }
            if (p.indexOf(i) !== -1) return h;
            const T = S;
            if (Array.isArray(i)) {
              if (i.length === 0) return "[]";
              if (R < p.length + 1) return '"[Array]"';
              p.push(i), S += x;
              let M = `
${S}`;
              const _ = `,
${S}`, F = Math.min(i.length, E);
              let D = 0;
              for (; D < F - 1; D++) {
                const z = Y(String(D), i[D], p, x, S);
                M += z !== void 0 ? z : "null", M += _;
              }
              const q = Y(String(D), i[D], p, x, S);
              if (M += q !== void 0 ? q : "null", i.length - 1 > E) {
                const z = i.length - E - 1;
                M += `${_}"... ${L(z)} not stringified"`;
              }
              return M += `
${T}`, p.pop(), `[${M}]`;
            }
            let y = Object.keys(i);
            const w = y.length;
            if (w === 0) return "{}";
            if (R < p.length + 1) return '"[Object]"';
            S += x;
            const O = `,
${S}`;
            let k = "", v = "", j = Math.min(w, E);
            d(i) && (k += m(i, O, E), y = y.slice(i.length), j -= i.length, v = O), B && (y = a(y, A)), p.push(i);
            for (let M = 0; M < j; M++) {
              const _ = y[M], F = Y(_, i[_], p, x, S);
              F !== void 0 && (k += `${v}${l(_)}: ${F}`, v = O);
            }
            if (w > E) {
              const M = w - E;
              k += `${v}"...": "${L(M)} not stringified"`, v = O;
            }
            return v !== "" && (k = `
${S}${k}
${T}`), p.pop(), `{${k}}`;
          }
          case "number":
            return isFinite(i) ? String(i) : g ? g(i) : "null";
          case "boolean":
            return i === true ? "true" : "false";
          case "undefined":
            return;
          case "bigint":
            if (N) return String(i);
          default:
            return g ? g(i) : void 0;
        }
      }
      function H(P, i, p) {
        switch (typeof i) {
          case "string":
            return l(i);
          case "object": {
            if (i === null) return "null";
            if (typeof i.toJSON == "function") {
              if (i = i.toJSON(P), typeof i != "object") return H(P, i, p);
              if (i === null) return "null";
            }
            if (p.indexOf(i) !== -1) return h;
            let x = "";
            const S = i.length !== void 0;
            if (S && Array.isArray(i)) {
              if (i.length === 0) return "[]";
              if (R < p.length + 1) return '"[Array]"';
              p.push(i);
              const k = Math.min(i.length, E);
              let v = 0;
              for (; v < k - 1; v++) {
                const M = H(String(v), i[v], p);
                x += M !== void 0 ? M : "null", x += ",";
              }
              const j = H(String(v), i[v], p);
              if (x += j !== void 0 ? j : "null", i.length - 1 > E) {
                const M = i.length - E - 1;
                x += `,"... ${L(M)} not stringified"`;
              }
              return p.pop(), `[${x}]`;
            }
            let T = Object.keys(i);
            const y = T.length;
            if (y === 0) return "{}";
            if (R < p.length + 1) return '"[Object]"';
            let w = "", O = Math.min(y, E);
            S && d(i) && (x += m(i, ",", E), T = T.slice(i.length), O -= i.length, w = ","), B && (T = a(T, A)), p.push(i);
            for (let k = 0; k < O; k++) {
              const v = T[k], j = H(v, i[v], p);
              j !== void 0 && (x += `${w}${l(v)}:${j}`, w = ",");
            }
            if (y > E) {
              const k = y - E;
              x += `${w}"...":"${L(k)} not stringified"`;
            }
            return p.pop(), `{${x}}`;
          }
          case "number":
            return isFinite(i) ? String(i) : g ? g(i) : "null";
          case "boolean":
            return i === true ? "true" : "false";
          case "undefined":
            return;
          case "bigint":
            if (N) return String(i);
          default:
            return g ? g(i) : void 0;
        }
      }
      function je(P, i, p) {
        if (arguments.length > 1) {
          let x = "";
          if (typeof p == "number" ? x = " ".repeat(Math.min(p, 10)) : typeof p == "string" && (x = p.slice(0, 10)), i != null) {
            if (typeof i == "function") return Q("", { "": P }, [], i, x, "");
            if (Array.isArray(i)) return X("", P, [], I(i), x, "");
          }
          if (x.length !== 0) return Y("", P, [], x, "");
        }
        return H("", P, []);
      }
      return je;
    }
  })(te$1, te$1.exports)), te$1.exports;
}
var Xe = Qe();
class Ze {
  #t = /* @__PURE__ */ new Map();
  #e;
  constructor(e) {
    this.#e = e;
  }
  count(e = "default") {
    const t = this.#t.get(e) ?? 0;
    this.#t.set(e, t + 1), this.#e("log", false, false, { message: `${e}: ${String(t + 1)}`, prefix: e });
  }
  countReset(e = "default") {
    this.#t.has(e) ? this.#t.delete(e) : this.#e("warn", false, false, { message: `Count for ${e} does not exist`, prefix: e });
  }
}
const et = /* @__PURE__ */ new Set(["alert", "critical", "emergency", "error"]);
const tt = (r) => {
  const e = console;
  return et.has(r) ? e.__error ?? console.error : r === "warning" ? e.__warn ?? console.warn : r === "trace" ? e.__trace ?? console.trace : e.__log ?? console.log;
};
let rt = class {
  log(e) {
    const { context: t = [], message: s, type: n } = e;
    tt(n.level)(s, ...t);
  }
};
class st {
  #t = /* @__PURE__ */ new Map();
  #e = /* @__PURE__ */ new Set();
  #r;
  #i;
  #s;
  constructor(e, t, s) {
    this.#s = e, this.#r = t, this.#i = s;
  }
  time(e = "default") {
    this.#e.has(e) ? this.#s("warn", false, false, { message: `Timer '${e}' already exists`, prefix: e }) : (this.#e.add(e), this.#t.set(e, Date.now()), this.#s("start", false, false, { message: this.#r, prefix: e }));
  }
  timeLog(e, ...t) {
    if (!e && this.#e.size > 0 && (e = [...this.#e].pop()), e && this.#t.has(e)) {
      const s = Date.now() - this.#t.get(e);
      this.#s("info", false, false, { context: t, message: s < 1e3 ? `${String(s)} ms` : `${(s / 1e3).toFixed(2)} s`, prefix: e });
    } else this.#s("warn", false, false, { context: t, message: "Timer not found", prefix: e });
  }
  timeEnd(e) {
    if (!e && this.#e.size > 0 && (e = [...this.#e].pop()), e && this.#t.has(e)) {
      const t = Date.now() - this.#t.get(e);
      this.#t.delete(e), this.#e.delete(e), this.#s("stop", false, false, { message: `${this.#i} ${t < 1e3 ? `${String(t)} ms` : `${(t / 1e3).toFixed(2)} s`}`, prefix: e });
    } else this.#s("warn", false, false, { message: "Timer not found", prefix: e });
  }
}
const we = (r) => r === void 0 ? [] : Array.isArray(r) ? r : [r];
const $e = (r, e) => {
  const t = { ...r };
  return Object.keys(e).forEach((s) => {
    t[s] = { ...t[s], ...e[s] };
  }), t;
};
const it = (r) => {
  let e = false;
  return function(...t) {
    if (!e) {
      e = true;
      try {
        const s = r.apply(this, t);
        return e = false, s;
      } catch (s) {
        throw e = false, s;
      }
    }
  };
};
class pe {
  timerManager;
  counterManager;
  lastLog;
  logLevels;
  disabled;
  paused;
  messageQueue;
  scopeName;
  types;
  longestLabel;
  processors;
  generalLogLevel;
  reporters;
  throttle;
  throttleMin;
  stringify;
  groups;
  startTimerMessage;
  endTimerMessage;
  rawReporter;
  force = {};
  #t = /* @__PURE__ */ new Set();
  #e;
  #r;
  constructor(e) {
    this.throttle = e.throttle ?? 1e3, this.throttleMin = e.throttleMin ?? 5;
    const t = e.parentLongestLabel, s = e.parentTypes, n = e.parentStringify, l = e.parentLogLevels;
    this.stringify = n ?? Xe.configure({ strict: true }), this.startTimerMessage = e.messages?.timerStart ?? "Initialized timer...", this.endTimerMessage = e.messages?.timerEnd ?? "Timer run for:", s && t ? (this.types = s, this.longestLabel = t) : (this.types = $e(St$1, e.types ?? {}), this.longestLabel = Jr(this.types)), this.logLevels = l && !e.logLevels ? l : { ...qr, ...e.logLevels }, this.generalLogLevel = this.#n(e.logLevel), this.reporters = /* @__PURE__ */ new Set(), this.processors = /* @__PURE__ */ new Set(), this.disabled = e.disabled ?? false, this.paused = false, this.messageQueue = [], this.scopeName = we(e.scope).filter(Boolean), this.timerManager = new st((a, o, d, ...m) => {
      this.logger(a, o, d, ...m);
    }, this.startTimerMessage, this.endTimerMessage), this.counterManager = new Ze((a, o, d, ...m) => {
      this.logger(a, o, d, ...m);
    }), this.groups = [], this.lastLog = {}, this.logger = it(this.logger.bind(this)), this.#i(), Array.isArray(e.reporters) && this.registerReporters(e.reporters), this.rawReporter = this.extendReporter(e.rawReporter ?? new rt()), Array.isArray(e.processors) && this.registerProcessors(e.processors);
  }
  #i() {
    for (const e in this.types) this[e] = this.logger.bind(this, e, false, false);
    for (const e in this.types) this.force[e] = this.logger.bind(this, e, false, true);
    this.raw = this.raw.bind(this);
  }
  wrapConsole() {
    for (const e in this.types) Object.hasOwn(console, `__${e}`) || (console[`__${e}`] = console[e]), console[e] = this[e];
  }
  restoreConsole() {
    for (const e in this.types) if (Object.hasOwn(console, `__${e}`)) {
      const t = console[`__${e}`];
      t === void 0 ? delete console[e] : console[e] = t, delete console[`__${e}`];
    }
  }
  wrapException() {
    this.#e || this.#r || (this.#e = (e) => {
      this.error(e);
    }, this.#r = (e) => {
      this.error(e);
    }, process.on("uncaughtException", this.#e), process.on("unhandledRejection", this.#r));
  }
  restoreException() {
    this.#e && (process.off("uncaughtException", this.#e), this.#e = void 0), this.#r && (process.off("unhandledRejection", this.#r), this.#r = void 0);
  }
  disable() {
    this.disabled = true;
  }
  enable() {
    this.disabled = false;
  }
  isEnabled() {
    return !this.disabled;
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    const e = this.messageQueue.splice(0);
    for (let t = 0; t < e.length; t += 1) {
      const { messageObject: s, raw: n, type: l } = e[t];
      this.logger(l, n, false, ...s);
    }
  }
  scope(...e) {
    if (e.length === 0) throw new Error("No scope name was defined.");
    return this.child({ scope: e });
  }
  unscope() {
    this.scopeName = [];
  }
  child(e) {
    return new pe(this.buildChildOptions(e));
  }
  time(e = "default") {
    this.timerManager.time(e);
  }
  timeLog(e, ...t) {
    this.timerManager.timeLog(e, ...t);
  }
  timeEnd(e) {
    this.timerManager.timeEnd(e);
  }
  group(e = "console.group") {
    globalThis.window === void 0 ? this.groups.push(e) : console.group(e);
  }
  groupEnd() {
    globalThis.window === void 0 ? this.groups.pop() : console.groupEnd();
  }
  count(e = "default") {
    this.counterManager.count(e);
  }
  countReset(e = "default") {
    this.counterManager.countReset(e);
  }
  clear() {
    console.clear();
  }
  raw(e, ...t) {
    this.disabled || this.logger("log", true, false, { context: t, message: e });
  }
  buildChildOptions(e) {
    const t = e?.types !== void 0, s = t ? $e(this.types, e.types) : this.types, n = e?.reporters ?? [], l = n.length > 0 ? [...this.reporters, ...n] : [...this.reporters], a = e?.processors ?? [], o = a.length > 0 ? [...this.processors, ...a] : [...this.processors], d = e?.logLevels ? { ...this.logLevels, ...e.logLevels } : this.logLevels;
    let m;
    if (e?.scope) {
      const $ = we(e.scope).filter(Boolean);
      m = this.scopeName.length > 0 ? [...this.scopeName, ...$] : $;
    } else m = this.scopeName.length > 0 ? this.scopeName : [];
    const b = e?.messages ? { timerEnd: this.endTimerMessage, timerStart: this.startTimerMessage, ...e.messages } : { timerEnd: this.endTimerMessage, timerStart: this.startTimerMessage }, f = { disabled: e?.disabled ?? this.disabled, logLevel: e?.logLevel ?? this.generalLogLevel, logLevels: d, messages: b, processors: o, rawReporter: e?.rawReporter ?? this.rawReporter, reporters: l, scope: m, throttle: e?.throttle ?? this.throttle, throttleMin: e?.throttleMin ?? this.throttleMin };
    return t ? (f.parentTypes = s, f.parentLongestLabel = Jr(s)) : (f.parentTypes = this.types, f.parentLongestLabel = this.longestLabel), e?.logLevels || (f.parentLogLevels = this.logLevels), e?.messages || (f.parentMessages = { timerEnd: this.endTimerMessage, timerStart: this.startTimerMessage }), f.parentStringify = this.stringify, f;
  }
  extendReporter(e) {
    return typeof e.setLoggerTypes == "function" && e.setLoggerTypes(this.types), typeof e.setStringify == "function" && e.setStringify(this.stringify), e;
  }
  registerReporters(e) {
    for (let t = 0; t < e.length; t += 1) this.reporters.add(this.extendReporter(e[t]));
  }
  registerProcessors(e) {
    for (let t = 0; t < e.length; t += 1) {
      const s = e[t];
      typeof s.setStringify == "function" && s.setStringify(this.stringify), this.processors.add(s);
    }
  }
  #s(e, t) {
    if (t) this.rawReporter.log(Object.freeze(e));
    else for (const s of this.reporters) s.log(Object.freeze(e));
  }
  #n(e) {
    let t = "debug";
    return e !== void 0 && Object.hasOwn(this.logLevels, e) ? t = e : e !== void 0 && !this.#t.has(e) && (this.#t.add(e), console.warn(`[pail] Unknown log level "${String(e)}". Valid levels: ${Object.keys(this.logLevels).join(", ")}. Falling back to "debug".`)), t;
  }
  #o(e, t, ...s) {
    const n = { badge: void 0, context: void 0, error: void 0, label: void 0, message: Yr, prefix: void 0, repeated: void 0, scope: void 0, suffix: void 0 };
    if (n.type = { level: t.logLevel, name: e }, n.groups = this.groups, n.scope = this.scopeName, n.date = /* @__PURE__ */ new Date(), s.length > 0 && s[0] instanceof Error) n.error = s[0], s.length > 1 && (n.context = s.slice(1));
    else if (s.length > 0 && typeof s[0] == "object" && s[0] !== null && "message" in s[0]) {
      const { context: l, message: a, prefix: o, suffix: d } = s[0];
      if (l && (n.context = l), o && (n.prefix = o), d && (n.suffix = d), n.message = a, s.length > 1) {
        const m = s.slice(1);
        n.context ? n.context = Array.isArray(n.context) ? [...n.context, ...m] : [n.context, ...m] : n.context = m;
      }
    } else s.length > 1 ? (n.message = s[0], n.context = s.slice(1)) : s.length === 1 ? n.message = s[0] : n.message = void 0;
    return t.logLevel === "trace" && (n.traceError = new Error("Trace")), t.badge && (n.badge = t.badge), t.label && (n.label = t.label), n;
  }
  logger(e, t, s, ...n) {
    if (this.disabled) return;
    if (this.paused) {
      this.messageQueue.push({ messageObject: n, raw: t, type: e });
      return;
    }
    const l = this.types[e], a = this.#n(l.logLevel);
    if (s || this.logLevels[a] >= this.logLevels[this.generalLogLevel]) {
      let o = this.#o(e, l, ...n), d;
      try {
        d = JSON.stringify([o.label, o.scope, o.type, o.message, o.prefix, o.suffix, o.context]);
      } catch {
        d = void 0;
      }
      const m = this.processors.size > 0, b = (u = false) => {
        const L = (this.lastLog.count ?? 0) - this.throttleMin;
        if (this.lastLog.object && L > 0) {
          const I = { ...this.lastLog.object };
          L > 1 && (I.repeated = L), this.#s(I, t), this.lastLog.count = 1;
        }
        if (u) {
          for (const I of this.processors) o = I.process(o);
          if (o.dropped === true) return;
          if (this.lastLog.object = o, m) try {
            this.lastLog.signature = JSON.stringify([o.label, o.scope, o.type, o.message, o.prefix, o.suffix, o.context]);
          } catch {
            this.lastLog.signature = void 0;
          }
          else this.lastLog.signature = d;
          this.#s(o, t);
        }
      };
      clearTimeout(this.lastLog.timeout);
      const f = o.date instanceof Date ? o.date : new Date(o.date), $ = this.lastLog.time ? f.getTime() - this.lastLog.time.getTime() : 0;
      if (this.lastLog.time = f, $ < this.throttle) try {
        const u = d;
        if (this.lastLog.object && u !== void 0 && u === this.lastLog.signature && (this.lastLog.count = (this.lastLog.count ?? 0) + 1, this.lastLog.count > this.throttleMin)) {
          this.lastLog.timeout = setTimeout(b, this.throttle);
          return;
        }
      } catch {
      }
      b(true);
    }
  }
}
class nt {
  #t;
  #e;
  #r;
  #i = false;
  #s;
  constructor(e = {}) {
    this.#t = he, this.#e = de, this.#s = e;
  }
  setStdout(e) {
    this.#t = e;
  }
  setStderr(e) {
    this.#e = e;
  }
  setInteractiveManager(e) {
    this.#r = e;
  }
  setIsInteractive(e) {
    this.#i = e;
  }
  log(e) {
    const { context: t, groups: s, message: n, type: l } = e, a = [];
    if (n !== Yr) {
      const b = typeof n == "string" ? n : Kr(n, this.#s);
      a.push(b);
    }
    t && a.push(...t.map((b) => typeof b == "object" ? ` ${Kr(b, this.#s)}` : ` ${String(b)}`));
    const o = Zr(l.level) ? "stderr" : "stdout", d = o === "stderr" ? this.#e : this.#t, m = s.map(() => "    ").join("");
    this.#i && this.#r !== void 0 && d.isTTY ? this.#r.update(o, (m + a.join("")).split(`
`), 0) : Xr(m + a.join(""), d);
  }
}
class me extends pe {
  constructor(e) {
    const t = e.parentStderr, s = e.parentStdout, { interactive: n, processors: l, rawReporter: a, reporters: o, stderr: d, stdout: m } = e, b = t ?? d, f = s ?? m, $ = e.parentLongestLabel, u = e.parentTypes, { parentLogLevels: L, parentMessages: I, parentStringify: G } = e, C = { disabled: e.disabled, logLevel: e.logLevel, logLevels: e.logLevels, messages: e.messages, processors: [], rawReporter: e.rawReporter, reporters: [], scope: e.scope, throttle: e.throttle, throttleMin: e.throttleMin }, c = "types" in e;
    u && $ && !c ? (C.parentTypes = u, C.parentLongestLabel = $) : c && e.types !== void 0 && (C.types = e.types), G && (C.parentStringify = G), L && !e.logLevels && (C.parentLogLevels = L), I && !e.messages && (C.parentMessages = I), super(C), this.options = e, this.interactive = n ?? false, this.stdout = f, this.stderr = b, this.interactive && this.stdout && this.stderr && (this.interactiveManager = new yC(new W$3(this.stdout), new W$3(this.stderr))), Array.isArray(o) && this.registerReporters(o), this.rawReporter = this.extendReporter(a ?? new nt()), Array.isArray(l) && this.registerProcessors(l);
  }
  options;
  stdout;
  stderr;
  interactiveManager;
  interactive;
  scope(...e) {
    if (e.length === 0) throw new Error("No scope name was defined.");
    return this.child({ scope: e });
  }
  child(e) {
    const t = this.buildChildOptions(e);
    return t.interactive = e?.interactive ?? this.interactive, t.stderr = e?.stderr ?? this.stderr, t.stdout = e?.stdout ?? this.stdout, e?.stdout || (t.parentStdout = this.stdout), e?.stderr || (t.parentStderr = this.stderr), new me(t);
  }
  getInteractiveManager() {
    return this.interactiveManager;
  }
  wrapStd() {
    this.#t(this.stdout, "log"), this.#t(this.stderr, "error");
  }
  restoreStd() {
    this.#e(this.stdout), this.#e(this.stderr);
  }
  wrapAll() {
    this.wrapConsole(), this.wrapStd();
  }
  restoreAll() {
    this.restoreConsole(), this.restoreStd();
  }
  clear() {
    this.stdout?.write(be), this.stderr?.write(be);
  }
  extendReporter(e) {
    return typeof e.setStdout == "function" && e.setStdout(this.stdout), typeof e.setStderr == "function" && e.setStderr(this.stderr), typeof e.setLoggerTypes == "function" && e.setLoggerTypes(this.types), typeof e.setStringify == "function" && e.setStringify(this.stringify), typeof e.setIsInteractive == "function" && e.setIsInteractive(this.interactive), this.interactive && typeof e.setInteractiveManager == "function" && e.setInteractiveManager(this.interactiveManager), e;
  }
  #t(e, t) {
    e && (e.__write || (e.__write = e.write), e.write = (s) => {
      this[t](String(s).trim());
    });
  }
  #e(e) {
    e && e.__write && (e.write = e.__write, delete e.__write);
  }
}
const ot = me;
let ne$1;
const lt = () => (ne$1 !== void 0 || (ne$1 = /* @__PURE__ */ new Map([["aliceblue", "#f0f8ff"], ["antiquewhite", "#faebd7"], ["aqua", "#00ffff"], ["aquamarine", "#7fffd4"], ["azure", "#f0ffff"], ["beige", "#f5f5dc"], ["bisque", "#ffe4c4"], ["black", "#000000"], ["blanchedalmond", "#ffebcd"], ["blue", "#0000ff"], ["blueviolet", "#8a2be2"], ["brown", "#a52a2a"], ["burlywood", "#deb887"], ["cadetblue", "#5f9ea0"], ["chartreuse", "#7fff00"], ["chocolate", "#d2691e"], ["coral", "#ff7f50"], ["cornflowerblue", "#6495ed"], ["cornsilk", "#fff8dc"], ["crimson", "#dc143c"], ["cyan", "#00ffff"], ["darkblue", "#00008b"], ["darkcyan", "#008b8b"], ["darkgoldenrod", "#b8860b"], ["darkgray", "#a9a9a9"], ["darkgreen", "#006400"], ["darkgrey", "#a9a9a9"], ["darkkhaki", "#bdb76b"], ["darkmagenta", "#8b008b"], ["darkolivegreen", "#556b2f"], ["darkorange", "#ff8c00"], ["darkorchid", "#9932cc"], ["darkred", "#8b0000"], ["darksalmon", "#e9967a"], ["darkseagreen", "#8fbc8f"], ["darkslateblue", "#483d8b"], ["darkslategray", "#2f4f4f"], ["darkslategrey", "#2f4f4f"], ["darkturquoise", "#00ced1"], ["darkviolet", "#9400d3"], ["deeppink", "#ff1493"], ["deepskyblue", "#00bfff"], ["dimgray", "#696969"], ["dimgrey", "#696969"], ["dodgerblue", "#1e90ff"], ["firebrick", "#b22222"], ["floralwhite", "#fffaf0"], ["forestgreen", "#228b22"], ["fuchsia", "#ff00ff"], ["gainsboro", "#dcdcdc"], ["ghostwhite", "#f8f8ff"], ["gold", "#ffd700"], ["goldenrod", "#daa520"], ["gray", "#808080"], ["green", "#008000"], ["greenyellow", "#adff2f"], ["grey", "#808080"], ["honeydew", "#f0fff0"], ["hotpink", "#ff69b4"], ["indianred", "#cd5c5c"], ["indigo", "#4b0082"], ["ivory", "#fffff0"], ["khaki", "#f0e68c"], ["lavender", "#e6e6fa"], ["lavenderblush", "#fff0f5"], ["lawngreen", "#7cfc00"], ["lemonchiffon", "#fffacd"], ["lightblue", "#add8e6"], ["lightcoral", "#f08080"], ["lightcyan", "#e0ffff"], ["lightgoldenrodyellow", "#fafad2"], ["lightgray", "#d3d3d3"], ["lightgreen", "#90ee90"], ["lightgrey", "#d3d3d3"], ["lightpink", "#ffb6c1"], ["lightsalmon", "#ffa07a"], ["lightseagreen", "#20b2aa"], ["lightskyblue", "#87cefa"], ["lightslategray", "#778899"], ["lightslategrey", "#778899"], ["lightsteelblue", "#b0c4de"], ["lightyellow", "#ffffe0"], ["lime", "#00ff00"], ["limegreen", "#32cd32"], ["linen", "#faf0e6"], ["magenta", "#ff00ff"], ["maroon", "#800000"], ["mediumaquamarine", "#66cdaa"], ["mediumblue", "#0000cd"], ["mediumorchid", "#ba55d3"], ["mediumpurple", "#9370db"], ["mediumseagreen", "#3cb371"], ["mediumslateblue", "#7b68ee"], ["mediumspringgreen", "#00fa9a"], ["mediumturquoise", "#48d1cc"], ["mediumvioletred", "#c71585"], ["midnightblue", "#191970"], ["mintcream", "#f5fffa"], ["mistyrose", "#ffe4e1"], ["moccasin", "#ffe4b5"], ["navajowhite", "#ffdead"], ["navy", "#000080"], ["oldlace", "#fdf5e6"], ["olive", "#808000"], ["olivedrab", "#6b8e23"], ["orange", "#ffa500"], ["orangered", "#ff4500"], ["orchid", "#da70d6"], ["palegoldenrod", "#eee8aa"], ["palegreen", "#98fb98"], ["paleturquoise", "#afeeee"], ["palevioletred", "#db7093"], ["papayawhip", "#ffefd5"], ["peachpuff", "#ffdab9"], ["peru", "#cd853f"], ["pink", "#ffc0cb"], ["plum", "#dda0dd"], ["powderblue", "#b0e0e6"], ["purple", "#800080"], ["rebeccapurple", "#663399"], ["red", "#ff0000"], ["rosybrown", "#bc8f8f"], ["royalblue", "#4169e1"], ["saddlebrown", "#8b4513"], ["salmon", "#fa8072"], ["sandybrown", "#f4a460"], ["seagreen", "#2e8b57"], ["seashell", "#fff5ee"], ["sienna", "#a0522d"], ["silver", "#c0c0c0"], ["skyblue", "#87ceeb"], ["slateblue", "#6a5acd"], ["slategray", "#708090"], ["slategrey", "#708090"], ["snow", "#fffafa"], ["springgreen", "#00ff7f"], ["steelblue", "#4682b4"], ["tan", "#d2b48c"], ["teal", "#008080"], ["thistle", "#d8bfd8"], ["tomato", "#ff6347"], ["turquoise", "#40e0d0"], ["violet", "#ee82ee"], ["wheat", "#f5deb3"], ["white", "#ffffff"], ["whitesmoke", "#f5f5f5"], ["yellow", "#ffff00"], ["yellowgreen", "#9acd32"]])), ne$1);
const at = /^#([\dA-F]{2})([\dA-F]{2})([\dA-F]{2})([\dA-F]{2})?$/i;
const ft = /^#([\dA-F])([\dA-F])([\dA-F])([\dA-F])?$/i;
const ct = /^rgba?\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*)?\)$/;
const gt = /^hsla?\(\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))%\s*(,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*)?\)$/;
const ge = () => ({ __proto__: null, backgroundColor: null, color: null, fontStyle: null, fontWeight: null, textDecorationColor: null, textDecorationLine: [] });
const Le = /\s+/;
const se = (r) => {
  const e = lt();
  e.has(r) && (r = e.get(r));
  const t = at.exec(r);
  if (t) return [Number.parseInt(t[1], 16), Number.parseInt(t[2], 16), Number.parseInt(t[3], 16)];
  const s = ft.exec(r);
  if (s) return [Number.parseInt(`${s[1]}${s[1]}`, 16), Number.parseInt(`${s[2]}${s[2]}`, 16), Number.parseInt(`${s[3]}${s[3]}`, 16)];
  const n = ct.exec(r);
  if (n) return [Math.round(Math.max(0, Math.min(255, Number(n[1])))), Math.round(Math.max(0, Math.min(255, Number(n[2])))), Math.round(Math.max(0, Math.min(255, Number(n[3]))))];
  const l = gt.exec(r);
  if (l) {
    let a = Number(l[1]) % 360;
    a < 0 && (a += 360);
    const o = Math.max(0, Math.min(100, Number(l[2]))) / 100, d = Math.max(0, Math.min(100, Number(l[3]))) / 100, m = (1 - Math.abs(2 * d - 1)) * o, b = m * (1 - Math.abs(a / 60 % 2 - 1)), f = d - m / 2;
    let $, u, L;
    return a < 60 ? { 0: $, 1: u, 2: L } = [m, b, 0] : a < 120 ? { 0: $, 1: u, 2: L } = [b, m, 0] : a < 180 ? { 0: $, 1: u, 2: L } = [0, m, b] : a < 240 ? { 0: $, 1: u, 2: L } = [0, b, m] : a < 300 ? { 0: $, 1: u, 2: L } = [b, 0, m] : { 0: $, 1: u, 2: L } = [m, 0, b], [Math.round(($ + f) * 255), Math.round((u + f) * 255), Math.round((L + f) * 255)];
  }
  return null;
};
const oe = (r, e) => typeof r == "string" || typeof e == "string" ? r === e : r?.[0] === e?.[0] && r?.[1] === e?.[1] && r?.[2] === e?.[2];
const ht = (r) => {
  if (typeof r != "string") return ge();
  const e = ge(), t = [];
  let s = false, n = null, l = 0, a = "";
  for (const o of r) {
    if (o === "(") l += 1;
    else if (l > 0) o === ")" && (l -= 1);
    else if (s) {
      if (o === ";") {
        const d = a.trim();
        d !== "" && t.push([n, d]), n = null, a = "", s = false;
        continue;
      }
    } else if (o === ":") {
      n = a.trim(), a = "", s = true;
      continue;
    }
    a += o;
  }
  if (s && l === 0) {
    const o = a.trim();
    o !== "" && t.push([n, o]), n = null, a = "";
  }
  for (const { 0: o, 1: d } of t) switch (o) {
    case "background-color": {
      d != null && (e.backgroundColor = d);
      break;
    }
    case "color": {
      d != null && (e.color = d);
      break;
    }
    case "font-style": {
      ["italic", "oblique", "oblique 14deg"].includes(d) && (e.fontStyle = "italic");
      break;
    }
    case "font-weight": {
      d === "bold" && (e.fontWeight = d);
      break;
    }
    case "text-decoration": {
      e.textDecorationColor = null, e.textDecorationLine = [];
      const m = d.split(Le);
      for (const b of m) {
        const f = se(b);
        f != null ? e.textDecorationColor = f : ["line-through", "overline", "underline"].includes(b) && e.textDecorationLine.push(b);
      }
      break;
    }
    case "text-decoration-color": {
      const m = se(d);
      m != null && (e.textDecorationColor = m);
      break;
    }
    case "text-decoration-line": {
      e.textDecorationLine = [];
      const m = d.split(Le);
      for (const b of m) ["line-through", "overline", "underline"].includes(b) && e.textDecorationLine.push(b);
      break;
    }
  }
  return e;
};
const dt = (r, e) => {
  e = e ?? ge();
  let t = "";
  if (!oe(r.backgroundColor, e.backgroundColor)) if (r.backgroundColor == null) t += "\x1B[49m";
  else switch (r.backgroundColor) {
    case "black": {
      t += "\x1B[40m";
      break;
    }
    case "blue": {
      t += "\x1B[44m";
      break;
    }
    case "cyan": {
      t += "\x1B[46m";
      break;
    }
    case "green": {
      t += "\x1B[42m";
      break;
    }
    case "magenta": {
      t += "\x1B[45m";
      break;
    }
    case "red": {
      t += "\x1B[41m";
      break;
    }
    case "white": {
      t += "\x1B[47m";
      break;
    }
    case "yellow": {
      t += "\x1B[43m";
      break;
    }
    default:
      if (Array.isArray(r.backgroundColor)) {
        const { 0: s, 1: n, 2: l } = r.backgroundColor;
        t += `\x1B[48;2;${String(s)};${String(n)};${String(l)}m`;
      } else {
        const s = se(r.backgroundColor);
        if (s === null) t += "\x1B[49m";
        else {
          const { 0: n, 1: l, 2: a } = s;
          t += `\x1B[48;2;${String(n)};${String(l)};${String(a)}m`;
        }
      }
  }
  if (!oe(r.color, e.color)) if (r.color == null) t += "\x1B[39m";
  else switch (r.color) {
    case "black": {
      t += "\x1B[30m";
      break;
    }
    case "blue": {
      t += "\x1B[34m";
      break;
    }
    case "cyan": {
      t += "\x1B[36m";
      break;
    }
    case "green": {
      t += "\x1B[32m";
      break;
    }
    case "magenta": {
      t += "\x1B[35m";
      break;
    }
    case "red": {
      t += "\x1B[31m";
      break;
    }
    case "white": {
      t += "\x1B[37m";
      break;
    }
    case "yellow": {
      t += "\x1B[33m";
      break;
    }
    default:
      if (Array.isArray(r.color)) {
        const { 0: s, 1: n, 2: l } = r.color;
        t += `\x1B[38;2;${String(s)};${String(n)};${String(l)}m`;
      } else {
        const s = se(r.color);
        if (s === null) t += "\x1B[39m";
        else {
          const { 0: n, 1: l, 2: a } = s;
          t += `\x1B[38;2;${String(n)};${String(l)};${String(a)}m`;
        }
      }
  }
  if (r.fontWeight !== e.fontWeight && (t += r.fontWeight === "bold" ? "\x1B[1m" : "\x1B[22m"), r.fontStyle !== e.fontStyle && (t += r.fontStyle === "italic" ? "\x1B[3m" : "\x1B[23m"), !oe(r.textDecorationColor, e.textDecorationColor)) if (r.textDecorationColor == null) t += "\x1B[59m";
  else {
    const { 0: s, 1: n, 2: l } = r.textDecorationColor;
    t += `\x1B[58;2;${String(s)};${String(n)};${String(l)}m`;
  }
  return r.textDecorationLine.includes("line-through") !== e.textDecorationLine.includes("line-through") && (t += r.textDecorationLine.includes("line-through") ? "\x1B[9m" : "\x1B[29m"), r.textDecorationLine.includes("overline") !== e.textDecorationLine.includes("overline") && (t += r.textDecorationLine.includes("overline") ? "\x1B[53m" : "\x1B[55m"), r.textDecorationLine.includes("underline") !== e.textDecorationLine.includes("underline") && (t += r.textDecorationLine.includes("underline") ? "\x1B[4m" : "\x1B[24m"), t;
};
const ut = (r) => {
  try {
    return JSON.stringify(r);
  } catch {
    return '"[Circular]"';
  }
};
const xe = "%".codePointAt(0);
const pt = "s".codePointAt(0);
const mt = "d".codePointAt(0);
const yt = "f".codePointAt(0);
const bt = "i".codePointAt(0);
const St = "O".codePointAt(0);
const wt = "o".codePointAt(0);
const $t = "j".codePointAt(0);
const Lt = "c".codePointAt(0);
const Te = (r, e = [], t = {}) => {
  if (typeof r != "string" && typeof r != "object" || r === null) throw new TypeError(`fmt must be a string or object, got ${r === null ? "null" : typeof r}`);
  const s = t.stringify ?? ut, n = 1;
  if (typeof r == "object") {
    const f = e.length + n;
    if (f === 1) return "{}";
    const $ = Array.from({ length: f });
    $[0] = s(r);
    for (let u = 1; u < f; u += 1) $[u] = s(e[u - n]);
    return $.join(" ");
  }
  if (e.length === 0) return r;
  let l = "", a = 1 - n, o = -1, d = false, m;
  const b = t.colors ?? globalThis.window === void 0;
  for (let f = 0; f < r.length; ) {
    if (r.codePointAt(f) === xe && f + 1 < r.length) {
      o = o > -1 ? o : 0;
      const $ = r.codePointAt(f + 1);
      switch ($) {
        case Lt: {
          if (o < f && (l += r.slice(o, f)), b) {
            const u = ht(e[a]), L = dt(u, m);
            l += L, L !== "" && (d = true, m = u);
          }
          o = f + 2, f += 1;
          break;
        }
        case mt:
        case yt: {
          const u = e[a];
          if (a >= e.length || u == null) break;
          o < f && (l += r.slice(o, f)), l += (typeof u == "symbol" ? Number.NaN : Number(u)).toString(), o = f + 2, f += 1;
          break;
        }
        case bt: {
          const u = e[a];
          if (a >= e.length || u == null) break;
          o < f && (l += r.slice(o, f)), l += Math.floor(typeof u == "symbol" ? Number.NaN : Number(u)).toString(), o = f + 2, f += 1;
          break;
        }
        case $t:
        case St:
        case wt: {
          if (a >= e.length || e[a] === void 0) break;
          o < f && (l += r.slice(o, f));
          const u = e[a], L = typeof u;
          if (L === "string") {
            l += `'${u}'`, o = f + 2, f += 1;
            break;
          }
          if (L === "function") {
            l += u.name ? `[Function: ${u.name}]` : "[Function: <anonymous>]", o = f + 2, f += 1;
            break;
          }
          l += s(u), o = f + 2, f += 1;
          break;
        }
        case xe: {
          o < f && (l += r.slice(o, f)), l += "%", o = f + 2, f += 1, a -= 1;
          break;
        }
        case pt: {
          if (a >= e.length) break;
          o < f && (l += r.slice(o, f));
          const u = e[a];
          l += typeof u == "object" && u !== null ? s(u) : String(u), o = f + 2, f += 1;
          break;
        }
        default:
          typeof t.formatters?.[$] == "function" ? (o < f && (l += r.slice(o, f)), l += t.formatters[$](e[a]), o = f + 2, f += 1) : a -= 1;
      }
      a += 1;
    }
    f += 1;
  }
  if (o === -1 && !(t.appendExtraArguments && a < e.length)) return r;
  if (o === -1 ? l = r : o < r.length && (l += r.slice(o)), o !== -1 && d && (l += "\x1B[0m"), t.appendExtraArguments && a < e.length) for (let f = Math.max(a, 0); f < e.length; f += 1) {
    const $ = e[f];
    l += ` ${typeof $ == "object" && $ !== null ? s($) : String($)}`;
  }
  return l;
};
const xt = (r = {}) => {
  const e = {};
  typeof r.formatters == "object" && Object.entries(r.formatters).forEach(([n, l]) => {
    if (n.length === 0) throw new Error(`Formatter %${n} has no characters`);
    if (n.length > 1) throw new Error(`Formatter %${n} has more than one character`);
    if (typeof l != "function") throw new TypeError(`Formatter for %${n} is not a function`);
    const a = n.codePointAt(0);
    if (a === void 0) throw new Error(`${n}.codePointAt(0) failed to return a value, please report this issue`);
    e[a] = l;
  });
  const t = { ...r };
  delete t.formatters;
  const s = Object.freeze({ ...t, formatters: e });
  return (n, l = [], a) => a === void 0 ? Te(n, l, s) : Te(n, l, { ...t, ...a, formatters: e });
};
const Tt = '"[Circular]"';
class Mt {
  #t;
  #e;
  #r;
  constructor(e = {}) {
    this.#e = e.formatters;
  }
  setStringify(e) {
    this.#t = e;
  }
  process(e) {
    this.#r === void 0 && (this.#r = xt({ formatters: this.#e, stringify: (s) => this.#i(s) }));
    const t = this.#r;
    return e.message !== void 0 && (e.message = this.#s(t, e.message, e.context ?? [])), e;
  }
  #i(e) {
    if (this.#t === void 0) try {
      return JSON.stringify(e);
    } catch {
      return Tt;
    }
    try {
      return this.#t(e);
    } catch (t) {
      return JSON.stringify(`[unserializable: ${t instanceof Error ? t.message : String(t)}]`);
    }
  }
  #s(e, t, s = []) {
    if (typeof t == "string") return e(t, s);
    if (typeof t == "object" && t !== null) {
      const n = t, l = Object.keys(n);
      for (let a = 0; a < l.length; a += 1) {
        const o = l[a], d = n[o];
        (typeof d == "string" || Array.isArray(d) || typeof d == "object") && (n[o] = this.#s(e, d, s));
      }
    }
    return t;
  }
}
const { bgGrey: Et, cyan: vt, green: At, greenBright: Ot, grey: V$1, red: le, underline: Me, white: kt } = t$1;
const Bt = /[\\/]pail[\\/]dist/;
const ae = (r) => !Bt.test(r);
class jt extends so {
  #t;
  #e;
  #r;
  #i = false;
  #s;
  #n;
  #o;
  #l = false;
  #a = "";
  #f = "";
  constructor(e = {}) {
    const { error: t, inspect: s, ...n } = e;
    super({ uppercase: { label: true, ...n.uppercase }, ...n }), this.#s = { ...ro, ...s }, this.#n = { ...t, color: { fileLine: At, hint: vt, marker: le, message: le, method: Ot, title: le } }, this.#t = he, this.#e = de, this.#c();
  }
  setLoggerTypes(e) {
    super.setLoggerTypes(e), this.#c();
  }
  setStdout(e) {
    this.#t = e, this.#o = void 0, this.#l = false;
  }
  setStderr(e) {
    this.#e = e;
  }
  setInteractiveManager(e) {
    this.#r = e;
  }
  setIsInteractive(e) {
    this.#i = e;
  }
  log(e) {
    this._log(this._formatMessage(e), e.type.level);
  }
  #c() {
    this.#a = no(this.loggerTypes), this.#f = Jr(this.loggerTypes);
  }
  #g() {
    return !this.#l && typeof this.#t.on == "function" && (this.#l = true, this.#t.on("resize", () => {
      this.#o = void 0;
    })), this.#o === void 0 && (this.#o = to().columns), this.#o;
  }
  _formatMessage(e) {
    let t = this.#g();
    typeof this.styles.messageLength == "number" && (t = this.styles.messageLength);
    const { badge: s, context: n, date: l, error: a, file: o, groups: d, label: m, message: b, prefix: f, repeated: $, scope: u, suffix: L, traceError: I, type: G } = e, { color: C } = this.loggerTypes[G.name], c = C ? t$1[C] : kt, g = d.map(() => "    ").join(""), h = [];
    if (d.length > 0 && h.push(`${g + V$1(`[${d.at(-1) ?? ""}]`)} `), l && h.push(`${V$1(this.styles.dateFormatter(typeof l == "string" ? new Date(l) : l))} `), s) h.push(c(s));
    else {
      const A = this.#a;
      A.length > 0 && h.push(`${V$1(".".repeat(A.length))} `);
    }
    const N = this.#f;
    if (m) {
      const A = k(N), R = k(m);
      h.push(`${c(oo(m, this.styles))} `, V$1(".".repeat(Math.max(0, A - R))));
    } else h.push(V$1(".".repeat(N.length + 2)));
    $ && h.push(`${Et.white(`[${String($)}x]`)} `), Array.isArray(u) && u.length > 0 && h.push(` ${V$1(`[${u.join(" > ")}]`)} `), f && h.push(`${V$1(`${Array.isArray(u) && u.length > 0 ? ". " : " "}[${this.styles.underline.prefix ? Me(f) : f}]`)} `);
    const B = k(h.join(" "));
    if (o) {
      const A = (o.name ?? "") + (o.line ? `:${String(o.line)}` : ""), R = k(A);
      if (R + B + 2 > t) h.push(V$1(` ${A}`));
      else {
        const E = Math.max(0, t - B - R - 2);
        h.push(V$1(`${".".repeat(E)} ${A}`));
      }
    } else h.push(V$1(".".repeat(Math.max(0, t - B - 1))));
    if (h.length > 0 && h.push(`

`), b !== Yr) {
      const A = typeof b == "string" ? b : Kr(b, this.#s);
      h.push(g + eo(A, { trim: false, width: t - 3, wrapMode: J$1.PRESERVE_WORDS }));
    }
    if (n) {
      let A = false;
      h.push(...n.map((R) => {
        if (R instanceof Error) return A = true, `

${Qr(R, { ...this.#n, filterStacktrace: ae, prefix: g })}`;
        if (typeof R == "object") return ` ${Kr(R, this.#s)}`;
        const E = (A ? `

` : " ") + String(R);
        return A = false, E;
      }));
    }
    return a && h.push(Qr(a, { ...this.#n, filterStacktrace: ae, prefix: g })), I && h.push(`

${Qr(I, { ...this.#n, filterStacktrace: ae, hideErrorCauseCodeView: true, hideErrorCodeView: true, hideErrorErrorsCodeView: true, hideMessage: true, prefix: g })}`), L && h.push(`
`, g + V$1(this.styles.underline.suffix ? Me(L) : L)), h.join("");
  }
  _log(e, t) {
    const s = Zr(t) ? "stderr" : "stdout", n = s === "stderr" ? this.#e : this.#t;
    this.#i && this.#r !== void 0 && n.isTTY ? this.#r.update(s, e.split(`
`), 0) : Xr(`${e}
`, n);
  }
}
const Rt = () => K$1.NODE_ENV === "debug" || K$1.DEBUG !== void 0 ? "debug" : K$1.NODE_ENV === "test" ? "warning" : "informational";
const Nt = (r) => {
  let e = Rt();
  return K$1.PAIL_LOG_LEVEL !== void 0 && (e = K$1.PAIL_LOG_LEVEL), new ot({ logLevel: e, processors: [new Mt()], reporters: [new jt()], stderr: de, stdout: he, ...r });
};
Nt();

const P = typeof globalThis < "u" && typeof globalThis.process < "u" ? globalThis.process : process;
const { stdout: B, stderr: V } = P;
const { bgGrey: K, bold: v, cyan: N, green: Q, greenBright: U, grey: a, red: b, underline: R, white: ee } = t$1;
const te = /[\\/]pail[\\/]dist/;
const L = ($) => !te.test($);
class ne extends so {
  #e;
  #r;
  #i;
  #a = false;
  #o;
  #s;
  #t;
  #n = false;
  #h = "";
  #l = "";
  constructor(t = {}) {
    const { error: o, inspect: h, ...i } = t;
    super({ uppercase: { label: true, ...i.uppercase }, ...i }), this.#o = { ...ro, indent: void 0, ...h }, this.#s = { ...o, color: { fileLine: Q, hint: N, marker: b, message: b, method: U, title: b } }, this.#e = B, this.#r = V, this.#p();
  }
  setLoggerTypes(t) {
    super.setLoggerTypes(t), this.#p();
  }
  setStdout(t) {
    this.#e = t, this.#t = void 0, this.#n = false;
  }
  setStderr(t) {
    this.#r = t;
  }
  setInteractiveManager(t) {
    this.#i = t;
  }
  setIsInteractive(t) {
    this.#a = t;
  }
  log(t) {
    const o = this.formatMessage(t), h = t.type.level, i = Zr(h) ? "stderr" : "stdout", n = i === "stderr" ? this.#r : this.#e;
    this.#a && this.#i !== void 0 && n.isTTY ? this.#i.update(i, o.split(`
`), 0) : Xr(`${o}
`, n);
  }
  #p() {
    this.#h = no(this.loggerTypes), this.#l = Jr(this.loggerTypes);
  }
  #c() {
    return !this.#n && typeof this.#e.on == "function" && (this.#n = true, this.#e.on("resize", () => {
      this.#t = void 0;
    })), this.#t === void 0 && (this.#t = to().columns), this.#t;
  }
  formatMessage(t) {
    let o = this.#c();
    typeof this.styles.messageLength == "number" && (o = this.styles.messageLength);
    const { badge: h, context: i, date: n, error: _, file: p, groups: g, label: d, message: c, prefix: u, repeated: x, scope: m, suffix: y, traceError: E, type: C } = t, { color: T } = this.loggerTypes[C.name], M = T ? t$1[T] : ee, l = g.map(() => "    ").join(""), e = [];
    if (g.length > 0 && e.push(`${l + a(`[${g.at(-1) ?? ""}]`)} `), n && e.push(`${a(this.styles.dateFormatter(typeof n == "string" ? new Date(n) : n))} `), h) e.push(v(M(h)));
    else {
      const s = this.#h;
      s.length > 0 && e.push(a(" ".repeat(s.length)));
    }
    const A = this.#l, w = k(A);
    if (d) {
      const s = k(d), r = Math.max(0, w - s);
      e.push(`${v(M(oo(d, this.styles)))} `, " ".repeat(r));
    } else e.push(" ".repeat(w + 1));
    x && e.push(`${K.white(`[${String(x)}x]`)} `), Array.isArray(m) && m.length > 0 && e.push(`${a(`[${m.join(" > ")}]`)} `), u && e.push(`${a(`[${this.styles.underline.prefix ? R(u) : u}]`)} `);
    const I = k(e.join(""));
    if (c !== Yr) {
      const s = typeof c == "string" ? c : Kr(c, this.#o);
      e.push(l + eo(s, { trim: false, width: o - 3, wrapMode: J$1.PRESERVE_WORDS }));
    }
    if (i) {
      let s = false;
      e.push(...i.map((r) => {
        if (r instanceof Error) return s = true, `

${Qr(r, { ...this.#s, filterStacktrace: L, prefix: l })}`;
        if (typeof r == "object") return ` ${Kr(r, this.#o)}`;
        const O = (s ? `

` : " ") + String(r);
        return s = false, O;
      }));
    }
    if (_ && e.push(Qr(_, { ...this.#s, filterStacktrace: L, prefix: l })), E && e.push(`

${Qr(E, { ...this.#s, filterStacktrace: L, hideErrorCauseCodeView: true, hideErrorCodeView: true, hideErrorErrorsCodeView: true, hideMessage: true, prefix: l })}`), y && e.push(` ${l}${a(this.styles.underline.suffix ? R(y) : y)}`), p) {
      const s = (p.name ?? "") + (p.line ? `:${String(p.line)}` : ""), r = Math.max(0, I - k("Caller: "));
      e.push(`
`, a("Caller: "), " ".repeat(r), s, `
`);
    }
    return e.join("");
  }
}

const HOME$4 = homedir();
const paths = {
  /** 本机配置目录(信任文件、scope、plugins-skip 都在这,永不上传) */
  configDir: join(HOME$4, ".config", "omarsync"),
  configFile: join(HOME$4, ".config", "omarsync", "config"),
  /** 状态目录(镜像、备份、applied 印章、last.log) */
  stateDir: join(HOME$4, ".local", "state", "omarsync"),
  mirrorDir: join(HOME$4, ".local", "state", "omarsync", "repo"),
  backupDir: join(HOME$4, ".local", "state", "omarsync", "backup"),
  scopeFile: join(HOME$4, ".config", "omarsync", "scope"),
  pluginsSkipFile: join(HOME$4, ".config", "omarsync", "plugins-skip"),
  trustedKeysFile: join(HOME$4, ".config", "omarsync", "trusted-keys"),
  appliedStamp: join(HOME$4, ".local", "state", "omarsync", "applied"),
  lastLog: join(HOME$4, ".local", "state", "omarsync", "last.log"),
  lockFile: join(HOME$4, ".local", "state", "omarsync", "omarsync.lock"),
  statusJson: join(HOME$4, ".local", "state", "omarsync", "status.json")
};
function configGet(key, readFile) {
  const data = readFile(paths.configFile);
  if (data === void 0) {
    return void 0;
  }
  let value;
  for (const line of data.split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (match && match[1] === key) {
      value = match[2];
    }
  }
  return value;
}

const logger = Nt({
  logLevel: "informational",
  reporters: [
    new ne({
      // 只留时分秒
      dateFormatter: (date) => date.toTimeString().slice(0, 8),
      uppercase: { label: false }
    })
  ],
  stderr: process.stderr,
  stdout: process.stdout
});
function appendLog(level, message) {
  try {
    mkdirSync(dirname(paths.lastLog), { recursive: true });
    appendFileSync(paths.lastLog, `${(/* @__PURE__ */ new Date()).toISOString()} omarsync[${level}]: ${message}
`);
  } catch {
  }
}
function die(message) {
  appendLog("error", message);
  logger.error(`omarsync: ${message}`);
  process.exit(1);
}
const log = {
  info(message) {
    appendLog("info", message);
    logger.info(`omarsync: ${message}`);
  },
  warn(message) {
    appendLog("warn", message);
    logger.warn(`omarsync: ${message}`);
  },
  die
};
function readTextFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return void 0;
  }
}

function editorCommand() {
  const fromEnv = process.env["OMARSYNC_EDITOR"] ?? process.env["VISUAL"] ?? process.env["EDITOR"];
  if (fromEnv && fromEnv.trim() !== "") {
    return fromEnv.trim();
  }
  const launcher = resolveTool("omarchy-launch-editor");
  if (launcher) {
    return launcher;
  }
  return resolveTool("code");
}
function openInEditor(files) {
  if (files.length === 0) {
    return;
  }
  const editor = editorCommand();
  const quoted = files.map((f) => `'${f.replaceAll("'", "'\\''")}'`).join(" ");
  if (!editor) {
    log.warn(`找不到可用的编辑器;手动查看: cat ${quoted}`);
    return;
  }
  const child = spawn(`${editor} ${quoted}`, {
    detached: true,
    shell: true,
    stdio: "ignore"
  });
  child.unref();
  log.info(`已用编辑器打开审阅: ${editor}`);
  log.info(`没弹出来?复制这条手动打开: ${editor} ${quoted}`);
  log.info("想换编辑器(比如 VS Code): export OMARSYNC_EDITOR=code");
}

const PROXY_NAMES = [
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY"
];
function hasForbidden(value) {
  return value.includes("$") || value.includes("`") || value.includes('"') || value.includes("'") || value.includes("\n") || value.includes("\r") || value.includes(" ") || value.includes("..");
}
function bodyOk(rest) {
  if (rest === "") {
    return false;
  }
  return /^[\][A-Za-z0-9._~:/?#@%+-]+$/.test(rest);
}
function urlOk(value) {
  if (value === "" || value.length > 256 || hasForbidden(value)) {
    return false;
  }
  const rest = /^(?:https?|socks5h?|socks4):\/\/(.*)$/.exec(value)?.[1];
  return rest !== void 0 && bodyOk(rest);
}
function bypassOk(value) {
  if (value === "" || value.length > 512) {
    return false;
  }
  if (value.includes("\n") || value.includes("\r") || value.includes(" ")) {
    return false;
  }
  return /^[A-Za-z0-9.*:,_/-]+$/.test(value);
}
function valueOk(name, value) {
  if (name === "no_proxy" || name === "NO_PROXY") {
    return bypassOk(value);
  }
  if (name === "http_proxy" || name === "https_proxy" || name === "all_proxy" || name === "HTTP_PROXY" || name === "HTTPS_PROXY" || name === "ALL_PROXY") {
    return urlOk(value);
  }
  return false;
}
function assignments() {
  const out = [];
  for (const name of PROXY_NAMES) {
    const value = process.env[name];
    if (value && valueOk(name, value)) {
      out.push(`${name}=${value}`);
    }
  }
  return out;
}

function gitBin() {
  const bin = resolveTool("git");
  if (!bin) {
    die("git 不可用");
  }
  return bin;
}
function baseArgs() {
  const keygen = resolveTool("ssh-keygen");
  if (!keygen) {
    die("ssh-keygen 不可用");
  }
  return ["-c", "core.hooksPath=/dev/null", "-c", `gpg.ssh.program=${keygen}`];
}
function git(args) {
  return run(gitBin(), [...baseArgs(), ...args], assignments());
}
function gitCapture(args) {
  const result = capture(gitBin(), [...baseArgs(), ...args], assignments());
  return { ok: result.code === 0, code: result.code, out: result.stdout };
}
function gitOut(args) {
  const { ok, out } = gitCapture(args);
  if (!ok) {
    return void 0;
  }
  return out.trimEnd();
}

function displayToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  const cleaned = value.replaceAll(/[^A-Za-z0-9._-]/g, "");
  return cleaned.length > 64 ? cleaned.slice(0, 64) : cleaned;
}
function displayTime(value) {
  if (typeof value !== "string") {
    return "";
  }
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value) ? value : "";
}
function hostnameSafe() {
  let name = "";
  try {
    name = readFileSync("/etc/hostname", "utf8").split("\n")[0] ?? "";
  } catch {
  }
  name = name.replaceAll(/[^A-Za-z0-9._-]/g, "");
  return name === "" ? "unknown" : name;
}
function iso8601() {
  const date = /* @__PURE__ */ new Date();
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const pad = (n) => String(n).padStart(2, "0");
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
function stdinIsTty() {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}
async function confirm(prompt) {
  if (!stdinIsTty()) {
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      resolve(answer === "y" || answer === "Y");
    });
  });
}
function configSet(key, value) {
  let lines = [];
  try {
    lines = readFileSync(paths.configFile, "utf8").split("\n").filter((line) => line !== "" && !line.startsWith(`${key}=`));
  } catch {
  }
  lines.push(`${key}=${value}`);
  writeFileSync(paths.configFile, `${lines.join("\n")}
`);
}

function isFullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}
function realpath(path) {
  try {
    return realpathSync(path);
  } catch {
    return void 0;
  }
}
function pathWithin(a, b) {
  return a === b || a.startsWith(`${b}/`);
}
function refuseInsideMirror(path) {
  if (!isDir(paths.mirrorDir)) {
    return;
  }
  const realPath = realpath(path);
  const realMirror = realpath(paths.mirrorDir);
  if (realPath && realMirror && pathWithin(realPath, realMirror)) {
    die(`拒绝使用同步镜像内的信任文件: ${path}`);
  }
}
function resolveRemoteSha(mirror, branch) {
  git(["-C", mirror, "fetch", "--quiet", "origin", branch]);
  const sha = gitOut(["-C", mirror, "rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]);
  if (!isFullSha(sha)) {
    die(`origin/${branch} 没有解析出完整提交: ${sha ?? "<空>"}`);
  }
  return sha;
}
function checkoutPinnedCommit(mirror, sha) {
  if (!isFullSha(sha)) {
    die(`拒绝检出非提交: ${sha}`);
  }
  git(["-C", mirror, "checkout", "--quiet", "--force", "--detach", sha]);
  const head = gitOut(["-C", mirror, "rev-parse", "--verify", "HEAD"]);
  if (head !== sha) {
    die(`镜像 HEAD ${head ?? "?"} 不是钉住的提交 ${sha}`);
  }
  if (gitCapture(["-C", mirror, "symbolic-ref", "-q", "HEAD"]).ok) {
    die(`钉住 ${sha} 后镜像仍挂在分支上`);
  }
}
function commitIsTrusted(mirror, sha) {
  const keys = paths.trustedKeysFile;
  if (!isFile(keys)) {
    return false;
  }
  const data = readTextFile(keys) ?? "";
  if (!/\S/.test(data)) {
    return false;
  }
  refuseInsideMirror(keys);
  return gitCapture(["-C", mirror, "-c", `gpg.ssh.allowedSignersFile=${keys}`, "verify-commit", sha]).ok;
}
function trustedKeysPresent() {
  if (!isFile(paths.trustedKeysFile)) {
    return false;
  }
  return /\S/.test(readTextFile(paths.trustedKeysFile) ?? "");
}
function extractArmor(commitText) {
  const lines = [];
  let on = false;
  for (const line of commitText.split("\n")) {
    if (!on) {
      const rest = /^gpgsig (.*)$/.exec(line)?.[1];
      if (rest !== void 0) {
        on = true;
        lines.push(rest);
        if (rest.includes("END SSH SIGNATURE")) {
          break;
        }
      }
    } else {
      const rest = /^ (.*)$/.exec(line)?.[1];
      if (rest === void 0) {
        break;
      }
      lines.push(rest);
      if (rest.includes("END SSH SIGNATURE")) {
        break;
      }
    }
  }
  const armor = lines.join("\n");
  if (!armor.includes("BEGIN SSH SIGNATURE") || !armor.includes("END SSH SIGNATURE")) {
    return void 0;
  }
  return armor;
}
function signaturePubkeyLine(mirror, sha) {
  const commit = gitOut(["-C", mirror, "cat-file", "commit", sha]);
  if (!commit) {
    return void 0;
  }
  const armor = extractArmor(commit);
  if (!armor) {
    return void 0;
  }
  const body = armor.replace("-----BEGIN SSH SIGNATURE-----", "").replace("-----END SSH SIGNATURE-----", "");
  const sig = Buffer.from(body.replaceAll(/\s/g, ""), "base64");
  if (sig.length < 14 || sig.subarray(0, 6).toString("ascii") !== "SSHSIG") {
    return void 0;
  }
  if (sig.readUInt32BE(6) !== 1) {
    return void 0;
  }
  const keyLength = sig.readUInt32BE(10);
  if (keyLength < 16 || keyLength > 4096 || sig.length < 14 + keyLength) {
    return void 0;
  }
  const key = sig.subarray(14, 14 + keyLength);
  const typeLength = key.readUInt32BE(0);
  if (typeLength < 4 || typeLength > 64 || key.length < 4 + typeLength) {
    return void 0;
  }
  const keyType = key.subarray(4, 4 + typeLength).toString("ascii");
  if (!/^ssh-[a-z0-9-]+$/.test(keyType)) {
    return void 0;
  }
  return `${keyType} ${key.toString("base64")}`;
}
function fingerprintOfPubkeyLine(pub) {
  const mktemp = resolveTool("mktemp");
  if (!mktemp) {
    return void 0;
  }
  const tmp = capture(mktemp, []).stdout.trim();
  if (tmp === "") {
    return void 0;
  }
  writeFileSync(tmp, `${pub}
`);
  const keygen = resolveTool("ssh-keygen");
  const out = keygen ? capture(keygen, ["-lf", tmp]).stdout : "";
  try {
    unlinkSync(tmp);
  } catch {
  }
  return /\S+\s+(SHA256:[A-Za-z0-9+/]+=*)/.exec(out)?.[1];
}
function pubkeyVerifiesCommit(mirror, sha, pub) {
  const mktemp = resolveTool("mktemp");
  if (!mktemp) {
    return false;
  }
  const tmp = capture(mktemp, []).stdout.trim();
  if (tmp === "") {
    return false;
  }
  writeFileSync(tmp, `* namespaces="git" ${pub}
`);
  const ok = gitCapture(["-C", mirror, "-c", `gpg.ssh.allowedSignersFile=${tmp}`, "verify-commit", sha]).ok;
  try {
    unlinkSync(tmp);
  } catch {
  }
  return ok;
}
function appliedStampFile() {
  return paths.appliedStamp;
}
function firstApplyAvailable() {
  if (trustedKeysPresent()) {
    return false;
  }
  return !isFile(appliedStampFile());
}
function markApplied(sha) {
  mkdirSync(dirname(appliedStampFile()), { recursive: true });
  writeFileSync(appliedStampFile(), `${sha}
`);
}
function rememberSigner(pub) {
  const keys = paths.trustedKeysFile;
  refuseInsideMirror(keys);
  mkdirSync(dirname(keys), { recursive: true });
  if (!isFile(keys)) {
    writeFileSync(keys, "");
  }
  chmodSync(keys, 420);
  const entry = `* namespaces="git" ${pub}`;
  const data = readTextFile(keys) ?? "";
  if (!data.split("\n").includes(entry)) {
    appendFileSync(keys, `${entry}
`);
  }
}
function acceptFirstApply(mirror, sha) {
  const pub = signaturePubkeyLine(mirror, sha);
  const fp = pub ? fingerprintOfPubkeyLine(pub) : void 0;
  if (pub && fp && pubkeyVerifiesCommit(mirror, sha, pub)) {
    rememberSigner(pub);
    log.info(`已信任签名者 ${fp}`);
    return;
  }
  log.info(`本机首次应用;提交 ${sha} 未签名`);
  log.info("之后的 apply 需要可信签名");
}
async function trustSignerOfCommit(mirror, sha, allowPrompt) {
  const pub = signaturePubkeyLine(mirror, sha);
  const fp = pub ? fingerprintOfPubkeyLine(pub) : void 0;
  if (trustedKeysPresent()) {
    if (fp) {
      die(`提交 ${sha} 由 ${fp} 签名,不在 ${paths.trustedKeysFile} 里。拒绝应用。`);
    }
    die(`提交 ${sha} 不是由 ${paths.trustedKeysFile} 里的密钥签名的。拒绝应用。`);
  }
  if (!pub || !fp || !pubkeyVerifiesCommit(mirror, sha, pub)) {
    die(`提交 ${sha} 未签名。拒绝应用。`);
  }
  if (!allowPrompt) {
    if (stdinIsTty()) {
      log.info("这台机器还没有信任过签名密钥");
      log.info(`提交 ${sha} 由 ${fp} 签名`);
      if (!await confirm("信任这把密钥并应用?")) {
        die("未信任该签名密钥");
      }
    } else {
      die(`提交 ${sha} 由 ${fp} 签名,而本机还没信任过签名密钥。在终端里运行 apply 并确认,或加 --trust-signer。`);
    }
  }
  rememberSigner(pub);
  log.info(`已信任签名者 ${fp}`);
}
function requireTrustedCommit(mirror, sha) {
  if (!isFullSha(sha)) {
    die(`拒绝未钉住的版本: ${sha}`);
  }
  if (!commitIsTrusted(mirror, sha)) {
    die(`提交 ${sha} 不是由 ${paths.trustedKeysFile} 里的密钥签名的。拒绝应用。`);
  }
}
function commitSignatureState(mirror, sha) {
  let state = "none";
  if (commitIsTrusted(mirror, sha)) {
    state = "trusted";
  }
  const pub = signaturePubkeyLine(mirror, sha);
  const fp = (pub ? fingerprintOfPubkeyLine(pub) : void 0) ?? "";
  if (state === "none" && pub && fp !== "" && pubkeyVerifiesCommit(mirror, sha, pub)) {
    state = "untrusted";
  }
  return { state, fingerprint: fp };
}
function preparePushBranch(mirror, branch) {
  git(["-C", mirror, "checkout", "-q", "-B", branch]);
}
function recordTrustedSigner(keyType, keyData, priv) {
  if (!keyType.startsWith("ssh-")) {
    die("不是 ssh 公钥");
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(keyData)) {
    die("ssh 公钥格式不对");
  }
  if (priv) {
    if (!isFile(priv)) {
      die(`私钥不存在: ${priv}`);
    }
    refuseInsideMirror(priv);
  }
  let email = configGet("SIGNING_EMAIL", readTextFile);
  if (!email) {
    email = "omarsync@localhost";
    configSet("SIGNING_EMAIL", email);
  }
  const keys = paths.trustedKeysFile;
  refuseInsideMirror(keys);
  mkdirSync(dirname(keys), { recursive: true });
  if (!isFile(keys)) {
    writeFileSync(keys, "");
  }
  chmodSync(keys, 420);
  const entry = `${email} namespaces="git" ${keyType} ${keyData}`;
  const data = readTextFile(keys) ?? "";
  if (!data.split("\n").includes(entry)) {
    appendFileSync(keys, `${entry}
`);
  }
  if (priv) {
    configSet("SIGNING_KEY", priv);
  }
  log.info(`已为 ${email} 信任 ${keyType} 密钥`);
}
function privateKeyPub(priv) {
  if (!priv || !isFile(priv)) {
    return void 0;
  }
  if (isDir(paths.mirrorDir)) {
    const realPath = realpath(priv);
    const realMirror = realpath(paths.mirrorDir);
    if (!realPath || !realMirror || pathWithin(realPath, realMirror)) {
      return void 0;
    }
  }
  if ((statSync(priv).mode & 18) !== 0) {
    return void 0;
  }
  const keygen = resolveTool("ssh-keygen");
  if (!keygen) {
    return void 0;
  }
  const { code, stdout } = capture(keygen, ["-y", "-f", priv, "-P", ""]);
  if (code !== 0) {
    return void 0;
  }
  const pub = stdout.trim();
  return /^ssh-[a-z0-9-]+\s+[A-Za-z0-9+/=]+/.test(pub) ? pub : void 0;
}
function dedicatedSigningKey() {
  return `${dirname(paths.trustedKeysFile)}/signing_key`;
}
function createDedicatedSigningKey(priv) {
  if (exists(priv) || exists(`${priv}.pub`)) {
    die(`无法在 ${priv} 创建签名密钥`);
  }
  refuseInsideMirror(priv);
  mkdirSync(dirname(priv), { recursive: true });
  const keygen = resolveTool("ssh-keygen");
  if (!keygen) {
    die("ssh-keygen 不可用");
  }
  if (!run(keygen, ["-q", "-t", "ed25519", "-f", priv, "-N", "", "-C", `omarsync@${hostnameSafe()}`])) {
    die("创建签名密钥失败");
  }
  chmodSync(priv, 384);
}
function ensurePushSigner() {
  const home = dirname(dirname(paths.trustedKeysFile));
  let priv;
  let pub;
  const configured = configGet("SIGNING_KEY", readTextFile);
  if (configured) {
    pub = privateKeyPub(configured);
    if (!pub) {
      die(`SIGNING_KEY 无法免密签名: ${configured}`);
    }
    priv = configured;
  } else {
    const defaultKey = `${home}/.ssh/id_ed25519`;
    pub = privateKeyPub(defaultKey);
    if (pub) {
      priv = defaultKey;
      log.info("使用 ~/.ssh/id_ed25519 签名");
    } else {
      priv = dedicatedSigningKey();
      pub = privateKeyPub(priv);
      if (!pub) {
        createDedicatedSigningKey(priv);
        pub = privateKeyPub(priv);
        if (!pub) {
          die("创建签名密钥失败");
        }
      }
      log.info(`使用 ${priv} 签名`);
    }
  }
  const [keyType, keyData] = pub.split(/\s+/);
  recordTrustedSigner(keyType, keyData, priv);
}
function requireTrustedRemoteTip(mirror, sha) {
  if (!commitIsTrusted(mirror, sha)) {
    die(`远程提交 ${sha} 不是可信签名。拒绝合并,也不会为它签名。`);
  }
}
function signReviewedTip(mirror, reviewedTree) {
  if (!isFullSha(reviewedTree)) {
    die("拒绝为未经审阅的树签名");
  }
  const tree = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
  if (tree !== reviewedTree) {
    die("拒绝为未经审阅的树签名");
  }
  const sha = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  if (sha && commitIsTrusted(mirror, sha)) {
    return;
  }
  log.info("为已审阅的快照补签名");
  if (!git(["-C", mirror, "commit", "-S", "--allow-empty", "-m", `sign snapshot from ${hostnameSafe()} @ ${iso8601()}`])) {
    die("签名失败,未推送");
  }
  const signedTree = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
  const signed = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  if (signedTree !== reviewedTree || !signed || !commitIsTrusted(mirror, signed)) {
    die("签名没有覆盖已审阅的树,未推送");
  }
}
function cmdTrustKey(pubFile, priv) {
  if (!pubFile || !isFile(pubFile)) {
    die("用法: omarsync trust-key --pubkey <ssh公钥> [--privkey 私钥]");
  }
  refuseInsideMirror(pubFile);
  if (priv && !isFile(priv)) {
    die(`私钥不存在: ${priv}`);
  }
  if (priv) {
    refuseInsideMirror(priv);
  }
  const [keyType, keyData] = (readTextFile(pubFile) ?? "").trim().split(/\s+/);
  if (!keyType) {
    die("不是 ssh 公钥");
  }
  recordTrustedSigner(keyType, keyData ?? "", priv);
}

function available() {
  return resolveTool("mise") !== void 0;
}
function miseBin() {
  const bin = resolveTool("mise");
  if (!bin) {
    die("mise 未安装。运行: omarchy pkg add mise");
  }
  return bin;
}
function miseCapture(args, mergeStderr = false) {
  const result = capture(miseBin(), ["dot", ...args], assignments());
  return { ok: result.code === 0, out: mergeStderr ? result.stdout + result.stderr : result.stdout };
}
function featureOk() {
  return miseCapture(["status", "-J"]).ok;
}
function status() {
  const { ok, out } = miseCapture(["status", "-J"]);
  if (!ok) {
    return void 0;
  }
  try {
    return JSON.parse(out);
  } catch {
    return void 0;
  }
}
function pathsJson() {
  const { ok, out } = miseCapture(["paths", "-J"]);
  if (!ok) {
    return void 0;
  }
  try {
    return JSON.parse(out);
  } catch {
    return void 0;
  }
}
function trackedRels() {
  const result = /* @__PURE__ */ new Set();
  const data = pathsJson();
  for (const entry of data?.entries ?? []) {
    if (typeof entry.path === "string") {
      result.add(entry.path.replace(/^~\//, ""));
    }
  }
  return result;
}
function currentExcludes() {
  return [...pathsJson()?.exclude ?? []];
}
function track(rel) {
  return miseCapture(["track", "-y", `~/${rel}`]).ok;
}
function untrack(rel) {
  return miseCapture(["untrack", `~/${rel}`]).ok;
}
function excludeAdd(glob) {
  return miseCapture(["exclude", glob]).ok;
}
function excludeDel(glob) {
  return miseCapture(["include", glob]).ok;
}
function save() {
  const { ok, out } = miseCapture(["save"], true);
  if (!ok) {
    return void 0;
  }
  return !out.includes("nothing changed");
}
function headSnapshot() {
  const { ok, out } = miseCapture(["history", "ls", "-J"]);
  if (!ok) {
    return void 0;
  }
  try {
    const data = JSON.parse(out);
    const snapshot = data[0]?.tree?.snapshot;
    return typeof snapshot === "string" ? snapshot : void 0;
  } catch {
    return void 0;
  }
}
function normOrigin(url) {
  return url.replace(/\/+$/, "").replace(/\.git$/, "");
}
function historySync() {
  const data = status();
  const syncInfo = data?.history?.sync;
  return syncInfo && typeof syncInfo === "object" ? syncInfo : void 0;
}
function originUrl() {
  const syncInfo = historySync();
  if (syncInfo) {
    return typeof syncInfo.origin === "string" ? syncInfo.origin : "";
  }
  const { out } = miseCapture(["status"], true);
  const line = /Setup repository: ([^\n]+)/.exec(out)?.[1]?.trim();
  if (line && !line.startsWith("none")) {
    return line;
  }
  const repo = /Repository\n\s*([^\n]+)/.exec(out)?.[1]?.trim();
  if (repo && !repo.startsWith("none")) {
    return repo;
  }
  return "";
}
function originBranch() {
  const syncInfo = historySync();
  const branch = syncInfo?.branch;
  return typeof branch === "string" ? branch : "";
}
function originConnected() {
  return originUrl() !== "";
}
function originMatches(url, branch) {
  const got = normOrigin(originUrl());
  if (got === "" || got !== normOrigin(url)) {
    return false;
  }
  const gotBranch = originBranch();
  return gotBranch === "" || gotBranch === branch;
}
function connect(url, branch) {
  if (url === "") {
    return { ok: false, out: "metadata repository is not configured" };
  }
  if (originMatches(url, branch)) {
    return { ok: true, out: "" };
  }
  return originSet(url, branch);
}
function originSet(url, branch = "main") {
  return miseCapture(["origin", "set", url, "--branch", branch, "--sync", "manual", "-y"], true);
}
function sync(fetchOnly) {
  const args = ["sync"];
  if (fetchOnly) {
    args.push("--fetch-only");
  }
  const first = miseCapture(args, true);
  if (first.ok || fetchOnly || !first.out.includes("allow-plaintext-history")) {
    return first;
  }
  log.warn("mise 因某次保存看起来像密钥而拒绝发布;私有历史仍然发布");
  return miseCapture([...args, "--allow-plaintext-history"], true);
}
function historyRepo() {
  return join(homedir(), ".local", "state", "mise", "history", "repo.git");
}
function commitForSnapshot(snapshot) {
  if (!isFullSha(snapshot) || !isDir(historyRepo())) {
    return void 0;
  }
  const out = gitOut(["--git-dir", historyRepo(), "log", "--all", "--format=%H %T"]);
  if (!out) {
    return void 0;
  }
  for (const line of out.split("\n")) {
    const [commit, tree] = line.split(" ");
    if (tree === snapshot && isFullSha(commit)) {
      return commit;
    }
  }
  return void 0;
}
function rollbackTo(commit, dryRun = false) {
  const args = ["rollback", "--to", `commit:${commit}`, "--all", "-y"];
  if (dryRun) {
    args.push("--dry-run");
  }
  return miseCapture(args, true);
}
function pull(options = {}) {
  const args = ["pull", "-y"];
  if (options.takeRemoteAll) {
    args.push("--take-remote-all");
  }
  if (options.dryRun) {
    args.push("--dry-run");
  }
  return miseCapture(args, true);
}
function conflicts() {
  return miseCapture(["conflicts"], true);
}
function diff() {
  return miseCapture(["diff"], true);
}
function incomingPending() {
  if (!available()) {
    return false;
  }
  const { out } = miseCapture(["status"], true);
  if (/incoming change\(s\) pending/.test(out)) {
    return true;
  }
  const n = /(\d+)\s+incoming/.exec(out)?.[1];
  return n !== void 0 && n !== "0";
}

const BANNED_PATHS = [
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
  // mise 自身的配置与状态:同步它们会循环
  ".config/mise",
  ".local/share/mise",
  ".local/state/mise"
];
const PLUGINS_REL = ".config/omarchy/plugins";
function bannedBasename(base) {
  return base.startsWith("id_rsa") || base.startsWith("id_ecdsa") || base.startsWith("id_ed25519") || base === "credentials" || base === "credentials.json" || base.endsWith(".pem") || base.endsWith(".key");
}
function assertSafeRel(rel) {
  if (rel === "" || rel === "." || rel === "..") {
    die(`非法 scope 路径: '${rel}'`);
  }
  if (rel.startsWith("/")) {
    die(`scope 路径必须相对于 $HOME: '${rel}'`);
  }
  if (rel.includes("..")) {
    die(`scope 路径不允许包含 '..': '${rel}'`);
  }
  if (rel.includes("\n")) {
    die("scope 路径不允许包含换行");
  }
  if (rel.includes("*") || rel.includes("?")) {
    die(`scope 路径不允许包含通配符: '${rel}'`);
  }
  if (rel === PLUGINS_REL || rel.startsWith(`${PLUGINS_REL}/`)) {
    die(`scope 路径 '${rel}' 指向插件目录;插件只通过签名快照同步`);
  }
  for (const banned of BANNED_PATHS) {
    if (rel === banned || rel.startsWith(`${banned}/`) || banned.startsWith(`${rel}/`)) {
      die(`scope 路径 '${rel}' 涉及秘密位置 ${banned}`);
    }
  }
  const base = rel.split("/").pop() ?? "";
  if (bannedBasename(base)) {
    die(`scope 路径 '${rel}' 指向凭证文件`);
  }
}
function ensureLocalScope(root) {
  if (isFile(paths.scopeFile)) {
    return;
  }
  mkdirSync(dirname(paths.scopeFile), { recursive: true });
  copyFileSync(`${root}/omarsync.scope.example`, paths.scopeFile);
  chmodSync(paths.scopeFile, 420);
}
function readScope(file) {
  const data = readTextFile(file);
  if (data === void 0) {
    return [];
  }
  const entries = [];
  for (const raw of data.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const pipe = line.indexOf("|");
    const rel = (pipe === -1 ? line : line.slice(0, pipe)).trim();
    const csv = pipe === -1 ? "" : line.slice(pipe + 1);
    assertSafeRel(rel);
    const excludes = csv.split(",").map((part) => part.trim()).filter((part) => part !== "");
    entries.push({ rel, excludes });
  }
  return entries;
}
const CONST_EXCLUDES = [
  "**/.git/**",
  "**/.git",
  "**/node_modules/**",
  "**/node_modules",
  // 应用把 API key 放在配置旁边的 .env 里。任何 scope 都不同步。
  "**/.env",
  "**/.env.*",
  "~/.config/omarsync/**",
  "~/.config/omarsync",
  "~/.config/omarchy/plugins/**",
  "~/.config/omarchy/plugins",
  // 各机器本地备份文件(形如 xxx.<主机名>-bak.<时间戳>),永不随同步走
  "**/*-bak.*"
];
function patternToGlobs(root, pattern) {
  const globs = [];
  const base = `~/${root}`;
  if (pattern.endsWith("/")) {
    const dir = pattern.slice(0, -1);
    globs.push(`${base}/${dir}/**`, `${base}/${dir}`);
    if (!dir.includes("/")) {
      globs.push(`${base}/**/${dir}/**`, `${base}/**/${dir}`);
    }
  } else if (pattern.includes("/")) {
    globs.push(`${base}/${pattern}`);
  } else {
    globs.push(`${base}/${pattern}`, `${base}/**/${pattern}`);
  }
  return globs;
}
function desiredExcludes(entries) {
  const set = new Set(CONST_EXCLUDES);
  for (const entry of entries) {
    for (const pattern of entry.excludes) {
      for (const glob of patternToGlobs(entry.rel, pattern)) {
        set.add(glob);
      }
    }
  }
  return set;
}
function reconcile(entries) {
  if (!available()) {
    die("mise 未安装。运行: omarchy pkg add mise");
  }
  if (!featureOk()) {
    die("mise dot 在这台机器上不工作;检查 `mise dot status`");
  }
  const desired = desiredExcludes(entries);
  const have = new Set(currentExcludes());
  for (const glob of desired) {
    if (!have.has(glob) && !excludeAdd(glob)) {
      log.warn(`添加排除规则失败 ${glob}`);
    }
  }
  const wanted = new Set(entries.map((entry) => entry.rel));
  const trackedNow = trackedRels();
  for (const rel of wanted) {
    if (!trackedNow.has(rel)) {
      if (track(rel)) {
        log.info(`tracking ${rel}`);
      } else {
        log.warn(`track 失败 ${rel}`);
      }
    }
  }
  for (const rel of trackedRels()) {
    if (!wanted.has(rel)) {
      if (untrack(rel)) {
        log.info(`untracked ${rel}(不在 scope 里)`);
      } else {
        log.warn(`untrack 失败 ${rel}`);
      }
    }
  }
  for (const glob of currentExcludes()) {
    if (!desired.has(glob) && !excludeDel(glob)) {
      log.warn(`移除排除规则失败 ${glob}`);
    }
  }
}

const HOME$3 = homedir();
function hooksSourceDir() {
  return `${HOME$3}/.config/omarsync-hooks/post-apply.d`;
}
function hookNames(dir) {
  if (!isDir(dir)) {
    return [];
  }
  const names = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) {
      names.push(entry.name);
    }
  }
  return names.sort();
}
function exportHooks(dest) {
  rmrf(`${dest}/hooks`);
  const src = hooksSourceDir();
  if (!isDir(src)) {
    return;
  }
  mkdirSync(`${dest}/hooks/post-apply.d`, { recursive: true });
  for (const name of hookNames(src)) {
    if (/^[A-Za-z0-9._-]+$/.test(name)) {
      copyFileSync(`${src}/${name}`, `${dest}/hooks/post-apply.d/${name}`);
      chmodSync(`${dest}/hooks/post-apply.d/${name}`, statSync(`${src}/${name}`).mode);
    }
  }
}
function listHooks(mirror) {
  return hookNames(`${mirror}/hooks/post-apply.d`);
}
function isExec(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function runHooks(mirror, allowExec) {
  const dir = `${mirror}/hooks/post-apply.d`;
  if (!allowExec) {
    if (isDir(dir)) {
      log.warn("跳过 post-apply hooks;可执行内容恢复需要可信签名");
    }
    return true;
  }
  if (!isDir(dir)) {
    return true;
  }
  let failed = false;
  for (const name of hookNames(dir)) {
    const path = `${dir}/${name}`;
    if (!isExec(path)) {
      chmodSync(path, 493);
    }
    log.info(`运行 hook ${name}`);
    if (!run("/usr/bin/bash", [path], assignments())) {
      log.warn(`hook ${name} 失败`);
      failed = true;
    }
  }
  return !failed;
}
function refreshUserServices() {
  const systemctl = resolveTool("systemctl");
  if (!systemctl) {
    return true;
  }
  const wanted = readScope(paths.scopeFile).some(
    (entry) => entry.rel === ".config/systemd/user" || entry.rel.startsWith(".config/systemd/user/") || entry.rel === ".config/systemd"
  );
  if (!wanted || !isDir(`${HOME$3}/.config/systemd/user`)) {
    return true;
  }
  const runtime = process.env["XDG_RUNTIME_DIR"];
  if (!runtime || runtime === "" || !exists(`${runtime}/systemd/private`)) {
    return true;
  }
  let okAll = true;
  if (!run(systemctl, ["--user", "daemon-reload"])) {
    log.warn("systemctl --user daemon-reload 失败");
    okAll = false;
  }
  const find = resolveTool("find");
  const out = find ? capture(find, [`${HOME$3}/.config/systemd/user`, "-type", "l", "-path", "*.target.wants/*", "-printf", "%f\n"]).stdout : "";
  for (const unit of out.split("\n")) {
    if (unit.endsWith(".service")) {
      if (!run(systemctl, ["--user", "start", unit])) {
        log.warn(`无法启动 ${unit}`);
        okAll = false;
      }
    }
  }
  return okAll;
}

function ghInstalled() {
  return resolveTool("gh") !== void 0;
}
function ghBin() {
  const bin = resolveTool("gh");
  if (!bin) {
    die("GitHub CLI 未安装。运行: omarchy pkg add github-cli");
  }
  return bin;
}
function gh(args) {
  return run(ghBin(), args, assignments());
}
function ghCapture(args) {
  const result = capture(ghBin(), args, assignments());
  return { ok: result.code === 0, out: result.stdout };
}
function ghLoggedIn() {
  return ghInstalled() && ghCapture(["auth", "status"]).ok;
}
function githubUser() {
  if (!ghLoggedIn()) {
    return void 0;
  }
  const { ok, out } = ghCapture(["api", "user", "--jq", ".login"]);
  const user = out.trim();
  return ok && user !== "" ? user : void 0;
}

const PLUGIN_ID = "io.github.lukebest.omarsync";
const MAX_FILE_SIZE = "50m";
const BACKUP_KEEP = 5;
function omarchy(args) {
  const bin = resolveTool("omarchy");
  if (!bin) {
    die("omarchy 不在可信目录里");
  }
  return run(bin, args);
}
function omarchyShell(args) {
  const bin = resolveTool("omarchy-shell");
  if (!bin) {
    die("omarchy-shell 不在可信目录里");
  }
  return run(bin, args);
}
function rsync(args) {
  const bin = resolveTool("rsync");
  if (!bin) {
    die("rsync 不可用");
  }
  return run(bin, args);
}
function notify(headline, body) {
  if (process.env["OMARSYNC_NOTIFY"] !== "1") {
    return;
  }
  const bin = resolveTool("omarchy-notification-send");
  if (!bin) {
    return;
  }
  const args = ["--app-name", "omarsync", headline];
  if (body !== "") {
    args.push(body);
  }
  run(bin, args);
}
function dotBranch() {
  return "dotfiles";
}
function dotRepoName() {
  return configGet("REPO", readTextFile) ?? "";
}
function dotOriginUrl() {
  const override = process.env["OMARSYNC_DOT_ORIGIN"];
  if (override && override !== "") {
    return override;
  }
  const repo = dotRepoName();
  if (repo === "") {
    return "";
  }
  return `https://github.com/${repo}.git`;
}
function discardRemoteScope(mirror) {
  if (!isDir(mirror)) {
    return;
  }
  const file = `${mirror}/omarsync.scope`;
  if (exists(file) || isLink(file)) {
    try {
      unlinkSync(file);
    } catch {
    }
  }
  if (isDir(`${mirror}/.git`) && gitOut(["-C", mirror, "ls-files", "--error-unmatch", "--", "omarsync.scope"])) {
    git(["-C", mirror, "rm", "-q", "--ignore-unmatch", "--", "omarsync.scope"]);
  }
}
function ensureIdentity(mirror) {
  let email = configGet("SIGNING_EMAIL", readTextFile);
  let name = configGet("SIGNING_NAME", readTextFile);
  if (!email) {
    if (ghLoggedIn()) {
      if (!name) {
        const { ok, out } = ghCapture(["api", "user", "--jq", ".name // .login"]);
        if (ok) {
          name = out.trimEnd();
        }
      }
      const login = ghCapture(["api", "user", "--jq", ".login"]).out.trim();
      const id = ghCapture(["api", "user", "--jq", ".id"]).out.trim();
      if (login !== "" && id !== "") {
        email = `${id}+${login}@users.noreply.github.com`;
      }
    }
    email ??= "omarsync@localhost";
  }
  git(["-C", mirror, "config", "user.name", name && name !== "" ? name : "omarsync"]);
  git(["-C", mirror, "config", "user.email", email]);
  const signingKey = configGet("SIGNING_KEY", readTextFile);
  if (signingKey && isFile(signingKey)) {
    git(["-C", mirror, "config", "gpg.format", "ssh"]);
    git(["-C", mirror, "config", "user.signingkey", signingKey]);
    git(["-C", mirror, "config", "commit.gpgsign", "true"]);
  }
}

function pacmanBin() {
  return resolveTool("pacman");
}
function flatpakBin() {
  return resolveTool("flatpak");
}
function flatpak(args) {
  const bin = flatpakBin();
  if (!bin) {
    die("flatpak 不在可信目录里");
  }
  return run(bin, args);
}
function flatpakCapture(args) {
  const bin = flatpakBin();
  if (!bin) {
    die("flatpak 不在可信目录里");
  }
  const result = capture(bin, args);
  return { ok: result.code === 0, out: result.stdout };
}
function exportPackages(dest) {
  mkdirSync(`${dest}/packages`, { recursive: true });
  const pacman = pacmanBin();
  if (pacman) {
    writeFileSync(`${dest}/packages/pacman.txt`, capture(pacman, ["-Qqen"]).stdout);
    writeFileSync(`${dest}/packages/aur.txt`, capture(pacman, ["-Qqem"]).stdout);
  } else {
    writeFileSync(`${dest}/packages/pacman.txt`, "");
    writeFileSync(`${dest}/packages/aur.txt`, "");
  }
  exportFlatpaks(dest);
}
function flatpakRemoteUrlOk(url) {
  return url.length <= 300 && /^https:\/\/[A-Za-z0-9._~:/?#&=%+-]+$/.test(url) && !url.includes("..");
}
function exportFlatpaks(dest) {
  const outPath = `${dest}/packages/flatpak.txt`;
  if (!flatpakBin()) {
    writeFileSync(outPath, "");
    return;
  }
  const remoteUrls = /* @__PURE__ */ new Map();
  for (const line of flatpakCapture(["remotes", "--user", "--columns=name,url"]).out.split("\n")) {
    const match = /^(\S+)\s+(\S+)/.exec(line);
    if (match && /^[A-Za-z0-9._-]+$/.test(match[1])) {
      remoteUrls.set(match[1], flatpakRemoteUrlOk(match[2]) ? match[2] : "");
    }
  }
  const lines = [];
  for (const line of flatpakCapture(["list", "--user", "--app", "--columns=application,origin,branch,active"]).out.split("\n")) {
    const match = /^(\S+)\s+(\S+)\s+(\S+)/.exec(line);
    if (!match) {
      continue;
    }
    const [, app, origin, branch] = match;
    if (!/^[A-Za-z0-9._-]+$/.test(app) || !/^[A-Za-z0-9._-]+$/.test(origin) || !/^[A-Za-z0-9._-]+$/.test(branch)) {
      continue;
    }
    let commit = flatpakCapture(["info", "--user", "--show-commit", app]).out.trimEnd();
    if (!/^[0-9a-f]{64}$/.test(commit)) {
      commit = "";
    }
    lines.push([app, origin, branch, commit, remoteUrls.get(origin) ?? ""].join("	"));
  }
  writeFileSync(outPath, lines.length > 0 ? `${lines.join("\n")}
` : "");
}
function userFlatpakRemoteExists(name) {
  return flatpakCapture(["remotes", "--user", "--columns=name"]).out.split("\n").some((line) => line.trim() === name);
}
function ensureUserFlatpakRemote(name, url) {
  if (userFlatpakRemoteExists(name)) {
    return true;
  }
  if (name === "flathub") {
    url = "https://dl.flathub.org/repo/flathub.flatpakrepo";
  }
  if (!flatpakRemoteUrlOk(url)) {
    return false;
  }
  return flatpak(["remote-add", "--user", "--if-not-exists", name, url]);
}
function validPkgName(name) {
  return /^[A-Za-z0-9@._+%-]+$/.test(name);
}
function pkgInstalled(pkg) {
  const pacman = pacmanBin();
  return pacman !== void 0 && capture(pacman, ["-Q", pkg]).code === 0;
}
function readPkgList(path) {
  const data = readTextFile(path);
  const pkgs = [];
  if (!data) {
    return pkgs;
  }
  for (const line of data.split("\n")) {
    const pkg = line.trim();
    if (pkg === "" || pkg.startsWith("#")) {
      continue;
    }
    if (!validPkgName(pkg)) {
      die(`拒绝异常的包名: ${pkg}`);
    }
    if (!pkgInstalled(pkg)) {
      pkgs.push(pkg);
    }
  }
  return pkgs;
}
function installMissingPackages(mirror) {
  let failed = false;
  const official = readPkgList(`${mirror}/packages/pacman.txt`);
  if (official.length > 0) {
    log.info(`安装 ${official.length} 个官方包`);
    if (!omarchy(["pkg", "add", ...official])) {
      log.warn("官方包安装失败");
      failed = true;
    }
  } else {
    log.info("官方包已全部安装");
  }
  const aur = readPkgList(`${mirror}/packages/aur.txt`);
  if (aur.length > 0) {
    log.warn(`不安装 AUR 包(未钉住的构建配方): ${aur.join(" ")}`);
    log.warn("如需安装,请自己找钉住 commit 的 PKGBUILD");
  }
  if (!installMissingFlatpaks(mirror)) {
    failed = true;
  }
  return !failed;
}
function installMissingFlatpaks(mirror) {
  const listPath = `${mirror}/packages/flatpak.txt`;
  if (!flatpakBin() || !isFile(listPath)) {
    return true;
  }
  let failed = false;
  for (const line of (readTextFile(listPath) ?? "").split("\n")) {
    const match = /^([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t?([^\t]*)/.exec(line);
    if (!match || match[1] === "") {
      continue;
    }
    const [, app, origin, branch, commit, url] = match;
    if (!/^[A-Za-z0-9._-]+$/.test(app)) {
      die(`拒绝异常的 flatpak id: ${app}`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(origin)) {
      die(`拒绝异常的 flatpak origin: ${origin}`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(branch)) {
      die(`拒绝异常的 flatpak branch: ${branch}`);
    }
    if (commit !== "" && !/^[0-9a-f]{64}$/.test(commit)) {
      die(`拒绝异常的 flatpak commit: ${commit}`);
    }
    if (url !== "" && !flatpakRemoteUrlOk(url)) {
      die(`拒绝异常的 flatpak remote URL(origin ${origin})`);
    }
    if (!flatpakCapture(["info", "--user", app]).ok) {
      if (!ensureUserFlatpakRemote(origin, url)) {
        log.warn(`跳过 flatpak ${app};这台机器没有 remote ${origin} 且没有下载 URL`);
        continue;
      }
      log.info(`安装 flatpak ${app}(来自 ${origin})`);
      if (!flatpak(["install", "--user", "--noninteractive", "--app", origin, app])) {
        log.warn(`安装 flatpak ${app} 失败`);
        failed = true;
        continue;
      }
    }
    if (commit !== "") {
      log.info(`钉住 flatpak ${app} 到 ${commit}`);
      if (!flatpak(["update", "--user", "--noninteractive", `--commit=${commit}`, app])) {
        log.warn(`钉住 flatpak ${app} 到 ${commit} 失败`);
        failed = true;
      }
    }
  }
  return !failed;
}

const HOME$2 = homedir();
function pluginDir(id) {
  return `${HOME$2}/.config/omarchy/plugins/${id}`;
}
function validPluginId(id) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !id.includes("..") && !id.startsWith("omarchy.");
}
function httpsPluginUrl(url) {
  return !url.includes("..") && /^https:\/\/[A-Za-z0-9._~:/?#%+-]+$/.test(url);
}
function localPluginUrl(url) {
  return url.startsWith("file:///") && !url.includes("..") && !url.includes("\n");
}
function skipSet() {
  const set = /* @__PURE__ */ new Set();
  for (const line of (readTextFile(paths.pluginsSkipFile) ?? "").split("\n")) {
    const id = line.trim();
    if (id !== "" && !id.startsWith("#")) {
      set.add(id);
    }
  }
  return set;
}
function listPlugins() {
  const bin = resolveTool("omarchy");
  if (!bin) {
    return void 0;
  }
  const result = capture(bin, ["plugin", "list", "--json"]);
  if (result.code !== 0) {
    return void 0;
  }
  try {
    const data = JSON.parse(result.stdout);
    return Array.isArray(data) ? data : void 0;
  } catch {
    return void 0;
  }
}
function exportPlugins(dest, mode) {
  const listing = listPlugins();
  if (!listing) {
    if (mode === "check") {
      return false;
    }
    if (isFile(`${dest}/plugins.json`)) {
      log.warn("插件清单不可用;保留现有 plugins.json");
      return true;
    }
    writeFileSync(`${dest}/plugins.json`, "[]\n");
    log.warn("插件清单不可用;写入了空的 plugins.json");
    return true;
  }
  if (mode === "apply") {
    rmrf(`${dest}/plugins-local`);
  }
  const skip = skipSet();
  const records = [];
  for (const row of listing) {
    if (row.firstParty === true || typeof row.id !== "string") {
      continue;
    }
    const id = row.id;
    if (skip.has(id)) {
      log.info(`插件 ${id} 在 plugins-skip 里;不导出`);
      continue;
    }
    if (!validPluginId(id) || id === PLUGIN_ID) {
      continue;
    }
    const enabled = row.enabled === true;
    const dir = pluginDir(id);
    let url;
    let rev;
    if (isDir(`${dir}/.git`)) {
      url = gitOut(["-C", dir, "remote", "get-url", "origin"]);
      rev = gitOut(["-C", dir, "rev-parse", "--verify", "HEAD"]);
      if (!isFullSha(rev)) {
        rev = void 0;
      }
    }
    if (url && httpsPluginUrl(url) && rev) {
      records.push({ id, url, commit: rev, enabled, local: false });
    } else if (isDir(dir)) {
      copyLocalPlugin(dir, `${dest}/plugins-local/${id}`);
      records.push({ id, url: "", commit: "", enabled, local: true });
    }
  }
  records.sort((a, b) => a.id < b.id ? -1 : 1);
  writeFileSync(`${dest}/plugins.json`, `${JSON.stringify(records, void 0, 2)}
`);
  return true;
}
function copyLocalPlugin(src, dest) {
  mkdirSync(dest, { recursive: true });
  rsync([
    "-a",
    "--delete",
    `--max-size=${MAX_FILE_SIZE}`,
    "--exclude",
    ".git/",
    "--exclude",
    "node_modules/",
    // 解释器缓存是机器生成的,每次跑都变,同步只会制造噪音
    "--exclude",
    "__pycache__/",
    "--exclude",
    "*.pyc",
    `${src}/`,
    `${dest}/`
  ]);
  const find = resolveTool("find");
  const out = find ? capture(find, [dest, "-type", "l", "-print"]).stdout : "";
  for (const line of out.split("\n")) {
    if (line !== "") {
      try {
        unlinkSync(line);
        log.warn(`从插件快照移除符号链接: ${line.slice(dest.length + 1)}`);
      } catch {
      }
    }
  }
}
function installMissingPlugins(mirror, allowExec) {
  const file = `${mirror}/plugins.json`;
  if (!isFile(file)) {
    return true;
  }
  if (!allowExec) {
    log.warn("跳过插件安装;可执行内容恢复需要可信签名");
    return true;
  }
  let data;
  try {
    data = JSON.parse(readTextFile(file) ?? "[]");
  } catch {
    die("plugins.json 不是合法 JSON");
  }
  if (!Array.isArray(data)) {
    die("plugins.json 必须是数组");
  }
  const skip = skipSet();
  let failed = false;
  let installedAny = false;
  for (const row of data) {
    const id = typeof row["id"] === "string" ? row["id"] : "";
    const url = typeof row["url"] === "string" ? row["url"] : "";
    const rev = typeof row["commit"] === "string" ? row["commit"] : "";
    const enabled = row["enabled"] === true;
    if (!validPluginId(id)) {
      log.warn("跳过 id 非法的插件");
      continue;
    }
    if (id === PLUGIN_ID) {
      continue;
    }
    if (skip.has(id)) {
      log.info(`插件 ${id} 在 plugins-skip 里;不安装`);
      continue;
    }
    const dest = pluginDir(id);
    if (isDir(dest)) {
      if (rev !== "" && isDir(`${dest}/.git`)) {
        const head = gitOut(["-C", dest, "rev-parse", "--verify", "HEAD"]);
        if (head !== rev) {
          log.warn(`插件 ${id} 当前在 ${head ?? "unknown"},快照记录 ${rev};保持不动`);
        }
      }
      continue;
    }
    const tmp = `${mktempDir()}`;
    let okToInstall = false;
    if ((httpsPluginUrl(url) || localPluginUrl(url)) && isFullSha(rev)) {
      if (!git(["clone", "--quiet", "--no-checkout", url, `${tmp}/plugin`])) {
        log.warn(`克隆插件 ${id} 失败(${url})`);
        rmrf(tmp);
        failed = true;
        continue;
      }
      if (!git(["-C", `${tmp}/plugin`, "checkout", "--quiet", "--detach", rev])) {
        log.warn(`插件 ${id} 不含 commit ${rev}`);
        rmrf(tmp);
        failed = true;
        continue;
      }
      if (gitOut(["-C", `${tmp}/plugin`, "rev-parse", "--verify", "HEAD"]) !== rev) {
        log.warn(`插件 ${id} 检出的不是 ${rev}`);
        rmrf(tmp);
        failed = true;
        continue;
      }
      okToInstall = true;
    } else if (row["local"] === true && isDir(`${mirror}/plugins-local/${id}`)) {
      mkdirSync(`${tmp}/plugin`, { recursive: true });
      rsync(["-a", `${mirror}/plugins-local/${id}/`, `${tmp}/plugin/`]);
      okToInstall = true;
    } else {
      log.warn(`不安装插件 ${id};既没有钉住的 https commit 也没有本地快照`);
      rmrf(tmp);
      continue;
    }
    if (okToInstall) {
      if (!omarchy(["plugin", "validate", `${tmp}/plugin`])) {
        log.warn(`插件 ${id} 校验失败;不安装`);
        rmrf(tmp);
        failed = true;
        continue;
      }
      mkdirSync(`${HOME$2}/.config/omarchy/plugins`, { recursive: true });
      rmrf(dest);
      const mv = resolveTool("mv");
      if (!mv || capture(mv, [`${tmp}/plugin`, dest]).code !== 0) {
        log.warn(`移动插件 ${id} 到 ${dest} 失败`);
        rmrf(tmp);
        failed = true;
        continue;
      }
      rmrf(tmp);
      log.info(`已安装插件 ${id}`);
      installedAny = true;
      if (enabled && process.env["OMARSYNC_SKIP_LIVE"] !== "1" && !omarchy(["plugin", "enable", id])) {
        log.warn(`启用插件 ${id} 失败`);
      }
    }
  }
  if (installedAny && process.env["OMARSYNC_SKIP_LIVE"] !== "1" && resolveTool("omarchy-shell")) {
    if (!omarchyShell(["shell", "rescanPlugins"])) {
      log.warn("shell 插件重扫失败");
    }
  }
  return !failed;
}

const HOME$1 = homedir();
function pruneBackups() {
  const root = paths.backupDir;
  if (!isDir(root)) {
    return;
  }
  const names = readdirSync(root).sort();
  for (const name of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
    rmrf(`${root}/${name}`);
  }
}
function backupTree() {
  const date = resolveTool("date");
  const stamp = (date ? capture(date, ["+%Y%m%d-%H%M%S"]).stdout.trim() : "") || "unknown";
  const dest = `${paths.backupDir}/${stamp}`;
  for (const entry of readScope(paths.scopeFile)) {
    const src = `${HOME$1}/${entry.rel}`;
    if (exists(src) || isLink(src)) {
      const parent = `${dest}/home/${dirname(entry.rel)}`;
      mkdirSync(parent, { recursive: true });
      rsync(["-a", src, `${parent}/`]);
    }
  }
  const state = `${HOME$1}/.local/state/omarchy/current`;
  if (isDir(state)) {
    mkdirSync(`${dest}/current`, { recursive: true });
    const theme = readTextFile(`${state}/theme.name`);
    if (theme) {
      writeFileSync(`${dest}/current/theme.name`, theme);
    }
    const bg = `${state}/background`;
    if (isLink(bg) || exists(bg)) {
      const target = realpath$1(bg);
      if (target) {
        writeFileSync(`${dest}/current/background.path`, `${target}
`);
      }
    }
  }
  return dest;
}
function applyCurrent(mirror, withExec) {
  const theme = (readTextFile(`${mirror}/current/theme.name`) ?? "").replaceAll(/\s+/g, "");
  const background = (readTextFile(`${mirror}/current/background`) ?? "").replaceAll(/\s+/g, "");
  const state = `${HOME$1}/.local/state/omarchy/current`;
  let target = "";
  if (background.startsWith("rel:")) {
    target = `${HOME$1}/.config/omarchy/backgrounds/${background.slice(4)}`;
  } else if (background.startsWith("abs:")) {
    target = background.slice(4);
  }
  if (process.env["OMARSYNC_SKIP_LIVE"] === "1") {
    mkdirSync(state, { recursive: true });
    if (theme !== "") {
      writeFileSync(`${state}/theme.name`, `${theme}
`);
    }
    if (target !== "" && exists(target)) {
      rmrf(`${state}/background`);
      symlinkSync(target, `${state}/background`);
    }
    return true;
  }
  if (!withExec) {
    if (theme !== "" || background !== "") {
      log.info("已跳过主题切换;可执行内容恢复需要可信签名");
    }
    return true;
  }
  let failed = false;
  if (theme !== "") {
    log.info(`设置主题 ${theme}`);
    if (!omarchy(["theme", "set", theme])) {
      log.warn(`设置主题 ${theme} 失败`);
      failed = true;
    }
  }
  if (target !== "") {
    if (exists(target)) {
      log.info(`设置壁纸 ${target}`);
      if (!omarchy(["theme", "bg", "set", target])) {
        log.warn("设置壁纸失败");
        failed = true;
      }
    } else {
      log.warn(`壁纸文件不存在: ${target}`);
      failed = true;
    }
  }
  return !failed;
}
function hyprInstanceSignature() {
  const runtime = process.env["XDG_RUNTIME_DIR"] ?? "";
  if (!/^\/run\/user\/\d+/.test(runtime) || !isDir(`${runtime}/hypr`)) {
    return void 0;
  }
  const found = [];
  for (const name of readdirSync(`${runtime}/hypr`)) {
    if (/^[0-9a-f]+_[0-9]+_[0-9]+$/.test(name) && isDir(`${runtime}/hypr/${name}`) && isFile(`${runtime}/hypr/${name}/hyprland.lock`)) {
      found.push(name);
    }
  }
  return found.length === 1 ? found[0] : void 0;
}
function reloadDesktop() {
  if (process.env["OMARSYNC_SKIP_LIVE"] === "1") {
    return;
  }
  if (resolveTool("omarchy-shell")) {
    if (!omarchyShell(["shell", "reloadConfig"])) {
      log.warn("shell reload 失败");
    }
  }
  const hyprctl = resolveTool("hyprctl");
  if (!hyprctl) {
    return;
  }
  const sig = hyprInstanceSignature();
  if (!sig) {
    log.warn("跳过 hyprctl reload;这个用户没有唯一的 Hyprland 会话");
    return;
  }
  const result = capture(hyprctl, ["reload"], [
    `XDG_RUNTIME_DIR=${process.env["XDG_RUNTIME_DIR"] ?? ""}`,
    `HYPRLAND_INSTANCE_SIGNATURE=${sig}`
  ]);
  if (result.code !== 0) {
    log.warn("hyprctl reload 失败");
  }
}
function assertPinned(mirror, sha) {
  if (!isFullSha(sha)) {
    die("拒绝激活未钉住的版本");
  }
  const head = gitOut(["-C", mirror, "rev-parse", "--verify", "HEAD"]);
  if (head !== sha) {
    die(`镜像 HEAD ${head ?? "?"} 不是审阅过的 commit ${sha}`);
  }
  if (gitCapture(["-C", mirror, "symbolic-ref", "-q", "HEAD"]).ok) {
    die("镜像挂在分支上,拒绝应用");
  }
}
const HOOKS_REL = ".config/omarchy/hooks";
function stashOmarchyHooks() {
  const src = `${HOME$1}/${HOOKS_REL}`;
  const existed = exists(src) || isLink(src);
  const tmp = mktempDir();
  if (existed && !rsync(["-a", src, `${tmp}/`])) {
    die("无法在不可信的 apply 之前保留 ~/.config/omarchy/hooks");
  }
  return { tmp, existed };
}
function restoreOmarchyHooks(stash) {
  const dst = `${HOME$1}/${HOOKS_REL}`;
  rmrf(dst);
  if (stash.existed && stash.tmp !== "") {
    const saved = `${stash.tmp}/hooks`;
    if (exists(saved) || isLink(saved)) {
      mkdirSync(`${HOME$1}/.config/omarchy`, { recursive: true });
      rsync(["-a", saved, `${HOME$1}/.config/omarchy/`]);
    }
  }
  if (stash.tmp !== "") {
    rmrf(stash.tmp);
  }
  log.info("已跳过 Omarchy hooks,保留本机原样");
}
function prepareDotfiles() {
  if (!available()) {
    log.warn("mise 未安装;跳过 dotfiles。运行: omarchy pkg add mise");
    return false;
  }
  const url = dotOriginUrl();
  const branch = dotBranch();
  const already = originMatches(url, branch);
  const connected = connect(url, branch);
  if (!connected.ok) {
    log.warn(`无法连接 mise dot origin ${url === "" ? "(未配置)" : url}`);
    if (connected.out.trim() !== "") {
      log.warn(connected.out);
    }
    return false;
  }
  if (!already) {
    log.info(`已连接 mise dot origin ${url} 分支 ${branch}`);
  }
  const fetch = sync(true);
  if (!fetch.ok) {
    log.warn(`mise fetch 失败: ${fetch.out}`);
    return false;
  }
  return true;
}
function signedMiseHead(mirror) {
  const raw = readTextFile(`${mirror}/omarsync.json`);
  if (!raw) {
    return void 0;
  }
  try {
    const data = JSON.parse(raw);
    const head = data.miseHead;
    return isFullSha(typeof head === "string" ? head : void 0) ? head : void 0;
  } catch {
    return void 0;
  }
}
function syncDotfiles(mirror) {
  if (!prepareDotfiles()) {
    return false;
  }
  const snapshot = signedMiseHead(mirror);
  if (!snapshot) {
    log.warn("签名提交没有 miseHead;拒绝应用可变的 dotfiles 分支");
    return false;
  }
  const commit = commitForSnapshot(snapshot);
  if (!commit) {
    log.warn(`已抓取的历史里没有签名的 miseHead ${snapshot};拒绝应用分支尖端`);
    return false;
  }
  log.info(`按签名的 miseHead ${snapshot} 恢复文件`);
  const rolled = rollbackTo(commit);
  if (!rolled.ok) {
    log.warn(`mise rollback 失败: ${rolled.out}`);
    return false;
  }
  return true;
}
function applyMirror(mirror, withPackages, sha, withExec) {
  assertPinned(mirror, sha);
  log.info(`激活 commit ${sha}`);
  const backup = backupTree();
  log.info(`已备份现有文件到 ${backup}`);
  let failed = false;
  const hooksStash = withExec ? void 0 : stashOmarchyHooks();
  const filesOk = syncDotfiles(mirror);
  if (!filesOk) {
    failed = true;
  }
  if (hooksStash) {
    restoreOmarchyHooks(hooksStash);
  }
  if (filesOk) {
    if (!applyCurrent(mirror, withExec)) {
      failed = true;
    }
  } else {
    log.info("已跳过主题切换;文件没有对上签名的 miseHead");
  }
  reloadDesktop();
  if (withPackages) {
    if (!installMissingPackages(mirror)) {
      failed = true;
    }
  } else {
    log.info("跳过官方包安装");
  }
  if (!installMissingPlugins(mirror, withExec)) {
    failed = true;
  }
  if (withExec) {
    if (!refreshUserServices()) {
      failed = true;
    }
  } else {
    log.info("已跳过用户服务启动");
  }
  if (!runHooks(mirror, withExec)) {
    failed = true;
  }
  assertPinned(mirror, sha);
  pruneBackups();
  return !failed;
}
function showChanges(mirror, sha) {
  const applied = (readTextFile(appliedStampFile()) ?? "").trim();
  if (!isFullSha(applied)) {
    log.info("没有应用过的 commit;这份快照将整体应用");
    return;
  }
  if (applied === sha) {
    log.info("这台机器已经应用过这个 commit");
    return;
  }
  if (!gitCapture(["-C", mirror, "cat-file", "-e", `${applied}^{commit}`]).ok) {
    log.info(`上次应用的 commit ${applied} 不在镜像里;无法 diff`);
    return;
  }
  log.info(`自上次应用的 commit ${applied.slice(0, 12)} 以来的更改:`);
  const logOut = gitOut(["-C", mirror, "log", "--oneline", "--no-decorate", `${applied}..${sha}`]);
  if (logOut && /\S/.test(logOut)) {
    for (const line of logOut.split("\n")) {
      log.info(`  commit ${line}`);
    }
  }
  const stat = gitOut(["-C", mirror, "diff", "--stat", applied, sha]);
  if (stat && /\S/.test(stat)) {
    for (const line of stat.split("\n")) {
      log.info(`  ${line}`);
    }
  } else {
    log.info("  (元数据无变化)");
  }
  let review = "";
  for (const file of ["plugins.json", "packages/pacman.txt", "packages/flatpak.txt", "current/theme.name", "current/background"]) {
    const d = gitOut(["-C", mirror, "diff", "--color=never", applied, sha, "--", file]);
    if (d && /\S/.test(d)) {
      process.stdout.write(`${d}
`);
      review += `${d}
`;
    }
  }
  if (review !== "") {
    const reviewFile = `${paths.stateDir}/pending-apply.diff`;
    writeFileSync(reviewFile, `自 ${applied} 到 ${sha} 的元数据更改

${review}`);
    log.info(`完整 diff 已写入 ${reviewFile}`);
    openInEditor([reviewFile]);
  }
}
function previewApply(mirror, sha, withExec) {
  log.info(`commit ${sha}`);
  log.info("文件(mise dot 跟踪):");
  for (const entry of readScope(paths.scopeFile)) {
    log.info(`  ${entry.rel}`);
  }
  const snapshot = signedMiseHead(mirror);
  const pinned = snapshot ? commitForSnapshot(snapshot) : void 0;
  if (pinned && snapshot) {
    log.info(`文件将恢复到签名的 miseHead ${snapshot}`);
    const { out } = rollbackTo(pinned, true);
    if (/\S/.test(out)) {
      for (const line of out.split("\n")) {
        log.info(`  ${line}`);
      }
    }
  } else {
    log.info("没有签名的 miseHead;不会应用 dotfiles 分支");
  }
  const pac = readTextFile(`${mirror}/packages/pacman.txt`);
  if (pac) {
    const n = pac.split("\n").filter((line) => line.trim() !== "").length;
    log.info(`官方包清单: ${n} 个`);
  }
  const fp = readTextFile(`${mirror}/packages/flatpak.txt`);
  if (fp) {
    log.info("flatpak:");
    for (const line of fp.split("\n")) {
      const app = /^([^\t]+)/.exec(line)?.[1];
      if (app && app !== "") {
        log.info(`  ${app}`);
      }
    }
  }
  const pj = readTextFile(`${mirror}/plugins.json`);
  if (pj) {
    try {
      const data = JSON.parse(pj);
      if (Array.isArray(data)) {
        log.info("插件:");
        for (const row of data) {
          const note = row["local"] === true ? "(本地快照)" : typeof row["commit"] === "string" ? row["commit"] : "";
          log.info(`  ${String(row["id"])} ${note}`);
        }
      }
    } catch {
    }
  }
  for (const name of listHooks(mirror)) {
    log.info(`hook ${name}`);
  }
  if (!withExec) {
    log.info("插件与 hooks 不会执行");
    log.info("主题切换和 Omarchy hooks 会被跳过");
  }
}

function requireMirror$2() {
  if (!isDir(`${paths.mirrorDir}/.git`)) {
    die("未初始化。运行: omarsync init");
  }
  return paths.mirrorDir;
}
async function executeApply(options) {
  const expected = options.commit ?? "";
  if (!isFullSha(expected)) {
    die("apply 需要 --commit <40位sha>(你审阅过的那个 commit)");
  }
  const mirror = requireMirror$2();
  const branch = configGet("BRANCH", readTextFile) ?? "main";
  const sha = resolveRemoteSha(mirror, branch);
  if (sha !== expected) {
    die(`origin/${branch} 现在是 ${sha},不是你审阅的 ${expected}`);
  }
  let force = options.force === true;
  if (force) {
    log.warn(`强制应用 ${sha};跳过了签名检查`);
  } else {
    const first = firstApplyAvailable();
    if (!commitIsTrusted(mirror, sha)) {
      if (first) {
        acceptFirstApply(mirror, sha);
      } else if (await confirm(`commit ${sha} 不可信。仍要应用吗?只应用配置;插件与 hooks 保持关闭。`)) {
        force = true;
        log.warn(`强制应用 ${sha};跳过了签名检查`);
      } else {
        await trustSignerOfCommit(mirror, sha, options.trustSigner === true);
      }
    }
    if (!commitIsTrusted(mirror, sha) && !first && !force) {
      requireTrustedCommit(mirror, sha);
    }
  }
  checkoutPinnedCommit(mirror, sha);
  let withExec = false;
  if (force || options.noExec === true) {
    log.info("插件与 hooks 将被跳过");
  } else if (commitIsTrusted(mirror, sha)) {
    withExec = true;
    log.info(`已审阅签名 commit ${sha}`);
  } else {
    log.info(`已审阅首个 commit ${sha};签名之前插件与 hooks 保持关闭`);
  }
  if (available() && !prepareDotfiles()) {
    die("mise 抓不到 dotfiles 分支,未应用任何内容");
  }
  showChanges(mirror, sha);
  previewApply(mirror, sha, withExec);
  if (!await confirm("应用这份快照?")) {
    die("快照未应用");
  }
  if (applyMirror(mirror, options.noPackages !== true, sha, withExec)) {
    markApplied(sha);
    log.info(`已应用 ${sha}`);
    return;
  }
  log.warn(`应用 ${sha} 完成但有错误;配置已写入,备份已保留`);
  process.exitCode = 1;
}

function executeConflicts() {
  if (!available()) {
    die("mise 未安装。运行: omarchy pkg add mise");
  }
  const { out } = conflicts();
  if (!/\S/.test(out)) {
    log.info("没有同步冲突");
    return;
  }
  for (const line of out.split("\n")) {
    log.info(`  ${line}`);
  }
  log.info("解决方式:编辑对应文件后运行 mise dot save;或整体采用远程: mise dot pull --take-remote-all");
  const editor = process.env["VISUAL"] ?? process.env["EDITOR"];
  if (!editor || !stdinIsTty()) {
    return;
  }
  const home = process.env["HOME"] ?? "";
  const files = out.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("~/") || line.startsWith(`${home}/`));
  if (files.length === 0) {
    return;
  }
  log.info(`用 ${editor} 打开 ${files.length} 个冲突文件`);
  const quoted = files.map((f) => `'${(f.startsWith("~/") ? `${home}/${f.slice(2)}` : f).replaceAll("'", "'\\''")}'`).join(" ");
  spawnSync(`${editor} ${quoted}`, { shell: true, stdio: "inherit" });
}

function executeDoctor() {
  let missing = false;
  for (const tool of ["git", "rsync", "node", "mise"]) {
    if (resolveTool(tool)) {
      log.info(`ok  ${tool}`);
    } else {
      log.warn(`missing ${tool}${tool === "mise" ? "。运行: omarchy pkg add mise" : ""}`);
      missing = true;
    }
  }
  if (ghInstalled()) {
    if (ghLoggedIn()) {
      log.info(`ok  gh (${githubUser() ?? "?"})`);
    } else {
      log.warn("gh 已安装但未登录。运行: omarsync login");
    }
  } else {
    log.warn("missing gh。运行: omarchy pkg add github-cli");
    missing = true;
  }
  if (available()) {
    if (featureOk()) {
      log.info("ok  mise dot");
    } else {
      log.warn("mise dot 不工作;检查 `mise dot status`");
      missing = true;
    }
    if (originConnected()) {
      log.info("ok  mise dot origin 已连接");
    } else {
      log.warn("mise dot origin 未连接。运行: omarsync init");
    }
  }
  if (isDir(`${paths.mirrorDir}/.git`)) {
    const repo = configGet("REPO", readTextFile) ?? "";
    const branch = configGet("BRANCH", readTextFile) ?? "main";
    log.info(`ok  镜像 ${paths.mirrorDir}(${repo} ${branch})`);
  } else {
    log.warn("镜像未初始化。运行: omarsync init");
  }
  return missing ? 1 : 0;
}

function validRepoName(name) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name);
}
function ensureDotfilesRepo() {
  if (!available()) {
    log.warn("mise 未安装;跳过 dotfiles 分支。运行: omarchy pkg add mise");
    return;
  }
  const url = dotOriginUrl();
  const branch = dotBranch();
  if (url === "") {
    log.warn("元数据仓库未配置;跳过 dotfiles 分支");
    return;
  }
  if (originMatches(url, branch)) {
    return;
  }
  let connected = originSet(url, branch);
  if (!connected.ok && connected.out.includes("has no branch")) {
    const history = join(homedir(), ".local/state/mise/history/repo.git");
    if (isDir(history)) {
      log.info(`从本机 mise 历史创建分支 ${branch}`);
      if (git(["--git-dir", history, "push", url, `HEAD:refs/heads/${branch}`])) {
        connected = originSet(url, branch);
      }
    }
  }
  if (!connected.ok) {
    log.warn(`无法连接 mise dot origin ${url}`);
    if (connected.out.trim() !== "") {
      log.warn(connected.out);
    }
    return;
  }
  log.info(`已连接 mise dot origin ${url} 分支 ${branch}`);
  if (incomingPending()) {
    const pull$1 = pull({ takeRemoteAll: true });
    if (!pull$1.ok) {
      log.warn(`mise adopt pull 失败: ${pull$1.out}`);
    }
  } else {
    reconcile(readScope(paths.scopeFile));
  }
}
function executeInit(repoArg) {
  let repo = repoArg ?? "";
  const user = githubUser();
  if (!process.env["OMARSYNC_ORIGIN"]) {
    if (!ghInstalled()) {
      die("GitHub CLI 未安装。运行: omarchy pkg add github-cli");
    }
    if (!ghLoggedIn()) {
      die("未登录 GitHub。运行: omarsync login");
    }
    if (!user) {
      die("读取不到 GitHub 用户");
    }
    if (repo === "") {
      repo = `${user}/omarchy-config`;
    }
    if (!validRepoName(repo)) {
      die(`仓库名必须形如 owner/name: ${repo}`);
    }
    if (!ghCapture(["repo", "view", repo]).ok) {
      const [owner, name] = repo.split("/");
      if (owner !== user) {
        die(`仓库 ${repo} 不存在,也不属于 ${user}`);
      }
      log.info(`创建私有仓库 ${repo}`);
      gh(["repo", "create", name, "--private", "--description", "Omarchy configuration synced by omarsync"]);
    }
  } else {
    if (repo === "") {
      repo = "local/omarchy-config";
    }
    if (!validRepoName(repo)) {
      die(`仓库名必须形如 owner/name: ${repo}`);
    }
  }
  const branch = "main";
  const url = process.env["OMARSYNC_ORIGIN"] || `https://github.com/${repo}.git`;
  const mirror = paths.mirrorDir;
  mkdirSync(paths.stateDir, { recursive: true });
  if (isDir(`${mirror}/.git`)) {
    if (gitOut(["-C", mirror, "remote", "get-url", "origin"])) {
      git(["-C", mirror, "remote", "set-url", "origin", url]);
    } else {
      git(["-C", mirror, "remote", "add", "origin", url]);
    }
  } else {
    mkdirSync(mirror, { recursive: true });
    git(["-C", mirror, "init", "-b", branch]);
    git(["-C", mirror, "remote", "add", "origin", url]);
    if (git(["-C", mirror, "fetch", "--quiet", "origin", branch]) && gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}^{commit}`])) {
      const sha = gitOut(["-C", mirror, "rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]);
      checkoutPinnedCommit(mirror, sha);
      log.info(`已钉住 ${sha}`);
    } else {
      log.info(`远程分支 ${branch} 是空的`);
    }
  }
  ensureLocalScope(new URL("../..", import.meta.url).pathname);
  ensureIdentity(mirror);
  configSet("REPO", repo);
  configSet("BRANCH", branch);
  log.info(`已初始化 ${repo} 于 ${mirror}`);
  ensureDotfilesRepo();
}

function executeLogin() {
  if (!ghInstalled()) {
    die("GitHub CLI 未安装。运行: omarchy pkg add github-cli");
  }
  if (ghLoggedIn()) {
    log.info(`已登录 ${githubUser() ?? "?"}`);
    gh(["auth", "setup-git"]);
    return;
  }
  if (!stdinIsTty()) {
    die("GitHub 登录需要终端。运行: omarsync login");
  }
  gh(["auth", "login", "-h", "github.com", "-p", "https", "-w"]);
  gh(["auth", "setup-git"]);
  log.info(`已登录 ${githubUser() ?? "?"}`);
}

function treePaths(mirror, rev) {
  const listed = gitCapture(["-C", mirror, "ls-tree", "-r", "--name-only", rev]);
  if (!listed.ok) {
    return void 0;
  }
  return listed.out.split("\n").filter((line) => line !== "");
}
function withoutHome(pathsInTree) {
  return pathsInTree.filter((name) => name !== "home" && !name.startsWith("home/")).sort();
}
function samePaths(left, right) {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}
function worktreeClean(mirror) {
  const status = gitCapture(["-C", mirror, "status", "--porcelain", "--untracked-files=all"]);
  return status.ok && status.out.trim() === "";
}
function onlyHomeRemoved(mirror, before, after) {
  const diff = gitCapture(["-C", mirror, "diff", "--name-only", "--no-renames", before, after]);
  if (!diff.ok) {
    return false;
  }
  const names = diff.out.split("\n").filter((line) => line !== "");
  return names.length > 0 && names.every((name) => name === "home" || name.startsWith("home/"));
}
async function dropLegacyHome(mirror, branch) {
  if (!isDir(`${mirror}/home`)) {
    return;
  }
  const head = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  if (!isFullSha(head)) {
    die("镜像没有完整提交,拒绝签名也未推送");
  }
  requireTrustedRemoteTip(mirror, head);
  if (!worktreeClean(mirror)) {
    die("镜像有未提交的改动,拒绝在迁移时签名");
  }
  const before = treePaths(mirror, head);
  if (!before) {
    die("读不到当前树,未签名也未推送");
  }
  const kept = withoutHome(before);
  log.info(`可信提交 ${head}。删除 home/ 之后会留下这些文件:`);
  if (kept.length === 0) {
    log.info("  (没有其他文件)");
  } else {
    for (const name of kept) {
      log.info(`  ${name}`);
    }
  }
  if (!await confirm("签名并发布去掉 home/ 之后的这棵树?")) {
    die("已取消,未签名也未推送");
  }
  const again = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  const againPaths = isFullSha(again) ? treePaths(mirror, again) : void 0;
  if (again !== head || !commitIsTrusted(mirror, head) || !againPaths || !samePaths(withoutHome(againPaths), kept) || !worktreeClean(mirror)) {
    die("审阅期间树变了,未签名也未推送");
  }
  if (!git(["-C", mirror, "rm", "-rq", "home"])) {
    git(["-C", mirror, "reset", "--hard", head]);
    die("移除 home/ 失败,未签名也未推送");
  }
  if (!git(["-C", mirror, "commit", "-S", "-m", "drop file mirror; dotfiles moved to mise history"])) {
    git(["-C", mirror, "reset", "--hard", head]);
    die("迁移提交签名失败,未推送");
  }
  const signed = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  const parent = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^"]);
  const after = isFullSha(signed) ? treePaths(mirror, signed) : void 0;
  if (parent !== head || !isFullSha(signed) || !commitIsTrusted(mirror, signed) || !after || !samePaths([...after].sort(), kept) || !onlyHomeRemoved(mirror, head, signed)) {
    git(["-C", mirror, "reset", "--hard", head]);
    die("签名没有覆盖已审阅的迁移,未推送");
  }
  if (!git(["-C", mirror, "push", "--quiet", "-u", "origin", `HEAD:${branch}`])) {
    die("git push 失败,迁移提交未发布");
  }
  log.info("已移除旧文件镜像(仍可从 git 历史找回)");
}
async function executeMigrate() {
  if (!isDir(`${paths.mirrorDir}/.git`)) {
    die("未初始化。运行: omarsync init");
  }
  const mirror = paths.mirrorDir;
  const branch = configGet("BRANCH", readTextFile) ?? "main";
  log.info("迁移到 mise dot 布局");
  ensureDotfilesRepo();
  if (available() && originConnected()) {
    reconcile(readScope(paths.scopeFile));
    if (save() === void 0) {
      die("迁移过程中 mise dot save 失败");
    }
    const { ok, out } = sync(false);
    if (!ok) {
      die(`迁移过程中 mise dot sync 失败: ${out}`);
    }
  } else {
    log.warn("mise dot origin 未连接;dotfiles 未迁移");
  }
  await dropLegacyHome(mirror, branch);
  log.info(`迁移完成;旧备份在 ${paths.backupDir},可手动删除`);
}

function requireMirror$1() {
  if (!isDir(`${paths.mirrorDir}/.git`)) {
    die("未初始化。运行: omarsync init");
  }
  return paths.mirrorDir;
}
function executePull() {
  const mirror = requireMirror$1();
  const branch = configGet("BRANCH", readTextFile) ?? "main";
  const sha = resolveRemoteSha(mirror, branch);
  requireTrustedRemoteTip(mirror, sha);
  checkoutPinnedCommit(mirror, sha);
  if (available()) {
    sync(true);
  }
  log.info(`已钉住 ${sha}`);
  log.info("下一步: omarsync apply --commit " + sha + "(会先展示更改再请你确认)");
}

const HOME = homedir();
function exportCurrent(dest) {
  const state = `${HOME}/.local/state/omarchy/current`;
  mkdirSync(`${dest}/current`, { recursive: true });
  writeFileSync(`${dest}/current/theme.name`, readTextFile(`${state}/theme.name`) ?? "");
  let record = "";
  const bg = `${state}/background`;
  const target = isLink(bg) || exists(bg) ? realpath$1(bg) : void 0;
  const base = `${HOME}/.config/omarchy/backgrounds`;
  if (target?.startsWith(`${base}/`)) {
    record = `rel:${target.slice(base.length + 1)}`;
  } else if (target) {
    record = `abs:${target}`;
  }
  writeFileSync(`${dest}/current/background`, `${record}
`);
}
function writeMeta(dest, miseHead) {
  let version = "unknown";
  const vf = `${process.env["OMARCHY_PATH"] ?? "/usr/share/omarchy"}/version`;
  const v = readTextFile(vf);
  if (v) {
    version = v.replaceAll(/\s+/g, "");
  }
  const data = {
    schemaVersion: 2,
    host: hostnameSafe(),
    omarchyVersion: version,
    pushedAt: iso8601(),
    miseHead: miseHead ?? null
  };
  writeFileSync(`${dest}/omarsync.json`, `${JSON.stringify(data)}
`);
}
function collectInto(dest, miseHead) {
  discardRemoteScope(dest);
  exportCurrent(dest);
  exportPackages(dest);
  exportPlugins(dest, "apply");
  exportHooks(dest);
  writeMeta(dest, miseHead);
}
function treesDiffer(left, right) {
  if (isDir(left) || isDir(right)) {
    const diff = resolveTool("diff");
    if (!diff) {
      return true;
    }
    return capture(diff, ["-rq", left, right]).code !== 0;
  }
  if (!isFile(left) && !isFile(right)) {
    return false;
  }
  const cmp = resolveTool("cmp");
  if (!cmp) {
    return true;
  }
  return capture(cmp, ["-s", left, right]).code !== 0;
}
function mirrorDirty(mirror) {
  const tmp = mktempDir();
  try {
    exportCurrent(tmp);
    exportPackages(tmp);
    const pluginsKnown = exportPlugins(tmp, "check");
    let dirty = treesDiffer(`${mirror}/current`, `${tmp}/current`);
    if (!dirty && treesDiffer(`${mirror}/packages`, `${tmp}/packages`)) {
      dirty = true;
    }
    if (!dirty && pluginsKnown) {
      if (treesDiffer(`${mirror}/plugins.json`, `${tmp}/plugins.json`)) {
        dirty = true;
      }
      if (!dirty && (isDir(`${mirror}/plugins-local`) || isDir(`${tmp}/plugins-local`))) {
        if (treesDiffer(`${mirror}/plugins-local`, `${tmp}/plugins-local`)) {
          dirty = true;
        }
      }
    }
    if (!dirty) {
      const out = gitOut(["-C", mirror, "status", "--porcelain"]);
      if (out && /\S/.test(out)) {
        dirty = true;
      }
    }
    return dirty;
  } finally {
    rmrf(tmp);
  }
}

function readCounts(mirror, branch) {
  const ls = gitCapture(["-C", mirror, "ls-remote", "--exit-code", "--heads", "origin", branch]);
  if (ls.code === 2) {
    return [0, 0, ""];
  }
  if (!ls.ok || !gitCapture(["-C", mirror, "fetch", "--quiet", "origin", branch]).ok) {
    return void 0;
  }
  let sha = gitOut(["-C", mirror, "rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]);
  if (!isFullSha(sha)) {
    sha = void 0;
  }
  const head = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  if (!head) {
    const remoteCount = sha ? Number(gitOut(["-C", mirror, "rev-list", "--count", sha]) ?? 0) : 0;
    return [remoteCount, 0, sha ?? ""];
  }
  if (!sha) {
    return [0, 0, ""];
  }
  const behind = Number(gitOut(["-C", mirror, "rev-list", "--count", `HEAD..${sha}`]) ?? 0);
  const ahead = Number(gitOut(["-C", mirror, "rev-list", "--count", `${sha}..HEAD`]) ?? 0);
  return [behind, ahead, sha];
}
function isRunning() {
  const flock = resolveTool("flock");
  if (!flock) {
    return false;
  }
  mkdirSync(dirname(paths.lockFile), { recursive: true });
  return !run(flock, ["-n", paths.lockFile, "-c", "true"]);
}
function miseDirty() {
  if (!available() || !featureOk()) {
    return false;
  }
  return save() === true;
}
function changedFiles() {
  const repo = join(homedir(), ".local", "state", "mise", "history", "repo.git");
  if (!isDir(repo)) {
    return [];
  }
  const out = gitOut([`--git-dir=${repo}`, "show", "--name-only", "--format=", "HEAD"]) ?? "";
  const files = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of out.split("\n")) {
    const rel = line.replace(/^home\//, "");
    if (rel !== "" && !seen.has(rel)) {
      seen.add(rel);
      files.push(rel);
      if (files.length >= 30) {
        break;
      }
    }
  }
  return files;
}
function collect() {
  const st = {
    ghInstalled: false,
    loggedIn: false,
    user: "",
    repo: configGet("REPO", readTextFile) ?? "",
    dotRepo: dotRepoName(),
    dotBranch: dotBranch(),
    branch: configGet("BRANCH", readTextFile) ?? "main",
    initialized: false,
    dirty: false,
    behind: null,
    ahead: null,
    remoteCommit: "",
    pinnedCommit: "",
    remoteSigned: false,
    remoteSignature: "none",
    signerFingerprint: "",
    hasTrustedKeys: false,
    firstApply: false,
    lastPush: { host: "", time: "", omarchyVersion: "" },
    running: false,
    error: "",
    miseConnected: false,
    changedFiles: []
  };
  if (ghInstalled()) {
    st.ghInstalled = true;
    if (ghLoggedIn()) {
      st.loggedIn = true;
      st.user = githubUser() ?? "";
    }
  }
  if (isRunning()) {
    st.running = true;
  }
  if (available()) {
    st.miseConnected = originConnected();
  }
  if (isDir(`${paths.mirrorDir}/.git`)) {
    st.initialized = true;
    const mirror = paths.mirrorDir;
    if (!st.running) {
      let dirty = mirrorDirty(mirror);
      if (!dirty) {
        dirty = miseDirty();
        if (dirty) {
          st.changedFiles = changedFiles();
        }
      }
      st.dirty = dirty;
      const counts = readCounts(mirror, st.branch);
      if (counts) {
        const [behind, ahead, tip] = counts;
        st.behind = behind;
        st.ahead = ahead;
        if (isFullSha(tip)) {
          st.remoteCommit = tip;
          st.hasTrustedKeys = trustedKeysPresent();
          const { state, fingerprint } = commitSignatureState(mirror, tip);
          st.remoteSignature = state;
          st.signerFingerprint = fingerprint;
          st.remoteSigned = state === "trusted";
          st.firstApply = firstApplyAvailable();
        }
      } else {
        st.error = "could not fetch origin";
      }
      if (!gitCapture(["-C", mirror, "symbolic-ref", "-q", "HEAD"]).ok) {
        const head = gitOut(["-C", mirror, "rev-parse", "--verify", "HEAD"]);
        if (isFullSha(head)) {
          st.pinnedCommit = head;
        }
      }
    }
    const metaRaw = readTextFile(join(mirror, "omarsync.json"));
    if (metaRaw) {
      try {
        const data = JSON.parse(metaRaw);
        st.lastPush.host = displayToken(data.host);
        st.lastPush.time = displayTime(data.pushedAt);
        st.lastPush.omarchyVersion = displayToken(data.omarchyVersion);
      } catch {
      }
    }
  }
  return st;
}
function writeJson(st) {
  const text = JSON.stringify(st);
  mkdirSync(paths.stateDir, { recursive: true });
  writeFileSync(paths.statusJson, `${text}
`);
  return text;
}
function executeStatus(json) {
  const st = collect();
  const text = writeJson(st);
  if (json) {
    process.stdout.write(`${text}
`);
    return;
  }
  const githubState = st.loggedIn ? st.user : st.ghInstalled ? "signed out" : "cli missing";
  log.info(`github: ${githubState}`);
  log.info(`repo: ${st.repo === "" ? "<unset>" : st.repo} (${st.branch})`);
  log.info(`mirror: ${st.initialized ? "ready" : "not initialized"}`);
  log.info(`mise dot: ${st.miseConnected ? "connected" : "not connected"}`);
  log.info(`local changes: ${st.dirty ? "yes" : "no"}`);
  log.info(`behind: ${String(st.behind)}  ahead: ${String(st.ahead)}`);
  if (st.remoteCommit !== "") {
    log.info(`signature: ${st.remoteSignature}${st.signerFingerprint === "" ? "" : ` ${st.signerFingerprint}`}`);
  }
  if (st.lastPush.time !== "") {
    log.info(`last push: ${st.lastPush.time} from ${st.lastPush.host}`);
  }
  if (st.error !== "") {
    log.warn(st.error);
  }
}

function requireMirror() {
  if (!isDir(`${paths.mirrorDir}/.git`)) {
    die("未初始化。运行: omarsync init");
  }
  return paths.mirrorDir;
}
function remoteHasBranch(mirror, branch) {
  return gitCapture(["-C", mirror, "ls-remote", "--exit-code", "--heads", "origin", branch]).ok;
}
function headTree(mirror) {
  return gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
}
async function reviewMergedTree(mirror, reviewedCommit, reviewedTree, skipConfirm) {
  const finalTree = headTree(mirror);
  if (!finalTree) {
    die("无法读取合并后的树");
  }
  if (finalTree === reviewedTree) {
    return reviewedTree;
  }
  const finalDiff = gitCapture(["-C", mirror, "diff", "--color=never", reviewedTree, "HEAD"]).out;
  if (skipConfirm) {
    git(["-C", mirror, "reset", "--hard", reviewedCommit]);
    die("合并后的树和已确认的不一样,自动推送不会签名");
  }
  if (/\S/.test(finalDiff)) {
    mkdirSync(paths.stateDir, { recursive: true });
    const reviewFile = `${paths.stateDir}/pending-push.diff`;
    writeFileSync(reviewFile, `===== 合并后的最终 diff =====
${finalDiff}
`);
    log.info(`合并改写了已确认的树。最终 diff 已写入 ${reviewFile}`);
    openInEditor([reviewFile]);
  } else {
    log.info("合并改写了已确认的树");
  }
  if (!await confirm("签名并发布这份合并后的树?")) {
    git(["-C", mirror, "reset", "--hard", reviewedCommit]);
    die("已取消,未签名也未推送");
  }
  const accepted = headTree(mirror);
  if (accepted !== finalTree) {
    git(["-C", mirror, "reset", "--hard", reviewedCommit]);
    die("审阅期间树又变了,未签名也未推送");
  }
  return finalTree;
}
async function executePush(skipConfirm = false) {
  const mirror = requireMirror();
  const branch = configGet("BRANCH", readTextFile) ?? "main";
  ensurePushSigner();
  ensureIdentity(mirror);
  preparePushBranch(mirror, branch);
  let miseHead;
  if (available()) {
    ensureDotfilesRepo();
    if (!originConnected()) {
      die("mise dot origin 未连接,所以 dotfiles 分支没有更新");
    }
    reconcile(readScope(paths.scopeFile));
    const saved = save();
    if (saved === void 0) {
      die("mise dot save 失败");
    }
    if (saved) {
      log.info("mise dot 检查点已保存");
    }
    miseHead = headSnapshot();
  } else {
    log.warn("mise 未安装;只推元数据。运行: omarchy pkg add mise");
  }
  collectInto(mirror, miseHead);
  git(["-C", mirror, "add", "-A"]);
  const metaStat = gitCapture(["-C", mirror, "diff", "--cached", "--stat"]).out;
  const metaDiff = gitCapture(["-C", mirror, "diff", "--cached", "--color=never"]).out;
  const miseDiff = available() ? diff().out : "";
  if (/\S/.test(metaStat)) {
    log.info("元数据变化:");
    for (const line of metaStat.split("\n")) {
      log.info(`  ${line}`);
    }
  } else {
    log.info("元数据无变化");
  }
  let review = "";
  if (/\S/.test(metaDiff)) {
    review += `===== 元数据 diff(omarchy-config)=====
${metaDiff}
`;
  }
  if (/\S/.test(miseDiff)) {
    log.info("文件差异(mise dot diff):");
    for (const line of miseDiff.split("\n")) {
      log.info(`  ${line}`);
    }
    review += `===== 文件 diff(dotfiles 分支)=====
${miseDiff}
`;
  }
  if (review !== "") {
    mkdirSync(paths.stateDir, { recursive: true });
    const reviewFile = `${paths.stateDir}/pending-push.diff`;
    writeFileSync(reviewFile, review);
    log.info(`完整 diff 已写入 ${reviewFile}`);
    openInEditor([reviewFile]);
  }
  if (!skipConfirm && !await confirm("发布这份快照到远程仓库?")) {
    die("已取消,未推送");
  }
  if (gitCapture(["-C", mirror, "diff", "--cached", "--quiet"]).ok) {
    log.info("没有要提交的本地变化");
  } else {
    if (!git(["-C", mirror, "commit", "-S", "-m", `sync from ${hostnameSafe()} @ ${iso8601()}`])) {
      die("本地提交签名失败,未推送");
    }
    log.info("已提交本地变化");
  }
  const reviewedCommit = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
  const reviewedTree = headTree(mirror);
  if (!reviewedCommit || !reviewedTree) {
    die("无法读取已审阅的提交");
  }
  if (remoteHasBranch(mirror, branch)) {
    if (!git(["-C", mirror, "fetch", "--quiet", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`])) {
      die("fetch 失败,未合并也未签名");
    }
    const remoteTip = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", `origin/${branch}`]);
    if (!remoteTip) {
      die("fetch 之后读不到远程提交,未合并也未签名");
    }
    requireTrustedRemoteTip(mirror, remoteTip);
    if (!git(["-C", mirror, "merge-base", "--is-ancestor", remoteTip, "HEAD"])) {
      if (!git(["-C", mirror, "rebase", "--quiet", "-X", "theirs", remoteTip])) {
        git(["-C", mirror, "rebase", "--abort"]);
        die(`rebase 到 origin/${branch} 失败,未签名`);
      }
    }
  }
  discardRemoteScope(mirror);
  if (!gitCapture(["-C", mirror, "diff", "--cached", "--quiet"]).ok) {
    if (!git(["-C", mirror, "commit", "-S", "-m", "drop untrusted remote scope file"])) {
      git(["-C", mirror, "reset", "--hard", reviewedCommit]);
      die("去掉远程 scope 的签名提交失败,未推送");
    }
  }
  const treeToSign = await reviewMergedTree(mirror, reviewedCommit, reviewedTree, skipConfirm);
  signReviewedTip(mirror, treeToSign);
  if (!git(["-C", mirror, "push", "--quiet", "-u", "origin", `HEAD:${branch}`])) {
    die("git push 失败");
  }
  log.info(`已推送 ${branch}`);
  if (available()) {
    const { ok, out } = sync(false);
    if (!ok) {
      log.warn(`mise dot sync 失败: ${out}`);
      log.warn("解决冲突: mise dot conflicts / mise dot pull --take-remote <path>");
      process.exitCode = 1;
      executeStatus(false);
      return;
    }
    log.info("mise dot 历史已发布");
  }
  notify("omarsync", `已推送 ${configGet("REPO", readTextFile) ?? ""}`);
  executeStatus(false);
}

function executeSetup() {
  if (!stdinIsTty()) {
    die("setup 需要终端。运行: omarsync setup");
  }
  if (!available()) {
    log.info("安装 mise");
    if (!omarchy(["pkg", "add", "mise"])) {
      die("安装 mise 失败");
    }
  }
  if (!ghInstalled()) {
    log.info("安装 GitHub CLI");
    if (!omarchy(["pkg", "add", "github-cli"])) {
      die("安装 github-cli 失败");
    }
  }
  if (!ghLoggedIn()) {
    executeLogin();
  }
  if (!isDir(`${paths.mirrorDir}/.git`)) {
    executeInit(void 0);
  } else {
    ensureDotfilesRepo();
  }
  const sha = gitOut(["-C", paths.mirrorDir, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main^{commit}"]);
  if (sha) {
    log.info(`仓库已有 commit ${sha}`);
    log.info("打开面板选择 apply(先审阅再应用)");
  } else {
    log.info("仓库是空的");
    log.info("打开面板选择 push");
  }
}

const cli = a$1("omarsync", {
  packageName: "omarsync",
  packageVersion: "2.0.0"
});
cli.addCommand({
  name: "status",
  description: "显示同步状态(仓库、镜像、本机策略)",
  options: [
    {
      name: "json",
      type: Boolean,
      description: "以 JSON 输出(供状态栏面板读取)"
    }
  ],
  execute: ({ options }) => {
    executeStatus(options["json"] === true);
  }
});
cli.addCommand({
  name: "doctor",
  description: "依赖体检(git/rsync/node/mise/gh、镜像与 dotfiles 仓库)",
  execute: () => {
    process.exitCode = executeDoctor();
  }
});
cli.addCommand({
  name: "pull",
  description: "只抓取远程快照;可信签名的提交才钉住,不写任何活文件(下一步用 apply 审阅)",
  execute: () => {
    executePull();
  }
});
cli.addCommand({
  name: "push",
  description: "手动存检查点,展示元数据与文件 diff,确认后签名并发布",
  options: [
    {
      name: "yes",
      type: Boolean,
      description: "跳过发布确认(供面板自动推送使用)"
    },
    {
      name: "notify",
      type: Boolean,
      description: "推送完成后弹出桌面通知"
    }
  ],
  execute: async ({ options }) => {
    if (options["notify"] === true) {
      process.env["OMARSYNC_NOTIFY"] = "1";
    }
    await executePush(options["yes"] === true);
  }
});
cli.addCommand({
  name: "login",
  description: "登录 GitHub(浏览器流程)",
  execute: () => {
    executeLogin();
  }
});
cli.addCommand({
  name: "init",
  description: "初始化:创建/连接元数据仓库,并把 mise 连到同一仓库的 dotfiles 分支",
  options: [
    {
      name: "repo",
      type: String,
      description: "仓库名,形如 owner/name(默认 <你>/omarchy-config)"
    }
  ],
  execute: ({ options }) => {
    executeInit(typeof options["repo"] === "string" ? options["repo"] : void 0);
  }
});
cli.addCommand({
  name: "setup",
  description: "一键装机引导:装依赖、登录 GitHub、初始化仓库",
  execute: () => {
    executeSetup();
  }
});
cli.addCommand({
  name: "migrate",
  description: "老格式迁移:当前提交须已可信签名,确认剩余文件后才删除 home/ 并签名推送",
  execute: async () => {
    await executeMigrate();
  }
});
cli.addCommand({
  name: "apply",
  description: "审阅自上次应用以来的全部更改,确认后才写入(需要 --commit)。不可信时跳过插件、钩子、主题和用户服务",
  options: [
    {
      name: "commit",
      type: String,
      description: "你审阅过的 40 位 commit sha(必填)"
    },
    {
      name: "no-packages",
      type: Boolean,
      description: "跳过官方包安装"
    },
    {
      name: "no-exec",
      type: Boolean,
      description: "跳过插件与 hooks"
    },
    {
      name: "trust-signer",
      type: Boolean,
      description: "信任这个 commit 的签名者(免确认)"
    },
    {
      name: "force",
      type: Boolean,
      description: "跳过签名检查,只应用配置(插件与 hooks 关闭)"
    }
  ],
  execute: async ({ options }) => {
    await executeApply({
      commit: typeof options["commit"] === "string" ? options["commit"] : void 0,
      noPackages: options["no-packages"] === true,
      noExec: options["no-exec"] === true,
      trustSigner: options["trust-signer"] === true,
      force: options["force"] === true
    });
  }
});
cli.addCommand({
  name: "conflicts",
  description: "列出 mise dot 同步冲突,用本机编辑器打开审阅",
  execute: () => {
    executeConflicts();
  }
});
cli.addCommand({
  name: "trust-key",
  description: "把一把 ssh 公钥加入信任名单(可附私钥作为签名密钥)",
  options: [
    {
      name: "pubkey",
      type: String,
      description: "ssh 公钥文件路径(必填)"
    },
    {
      name: "privkey",
      type: String,
      description: "对应私钥路径(可选)"
    }
  ],
  execute: ({ options }) => {
    cmdTrustKey(
      typeof options["pubkey"] === "string" ? options["pubkey"] : void 0,
      typeof options["privkey"] === "string" ? options["privkey"] : void 0
    );
  }
});
cli.addCommand({
  name: "scope-path",
  description: "打印本机 scope 文件路径(不存在则从示例复制一份)",
  execute: () => {
    const root = new URL("../..", import.meta.url).pathname;
    try {
      ensureLocalScope(root);
    } catch {
      die(`scope 示例不存在: ${root}/omarsync.scope.example`);
    }
    process.stdout.write(`${paths.scopeFile}
`);
  }
});
await cli.run();
