import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { isFile } from "./exec";
import { die, log, readTextFile } from "./log";
import * as mise from "./mise";
import { paths } from "./paths";
import { loadPushIgnore, pushIgnoreExcludes } from "./push-ignore";

// scope 解析、安全校验,以及 scope → mise dot 跟踪条目的幂等对齐(reconcile)。
// scope(~/.config/omarsync/scope)是唯一事实来源,且只信本机这份;
// 同步仓库里的同名文件永远被丢弃。1:1 移植自 common.lua 与 scopemap.lua。

export interface ScopeEntry {
    readonly rel: string;
    readonly excludes: string[];
}

/** 禁用的相对路径:秘密目录与循环依赖目录 */
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
    ".local/state/mise",
] as const;

/** 插件目录含可执行代码,只能走签名快照路径,不允许被 scope 直接命名 */
const PLUGINS_REL = ".config/omarchy/plugins";

/** 凭证类文件名(按 basename 拦) */
function bannedBasename(base: string): boolean {
    return (
        base.startsWith("id_rsa") ||
        base.startsWith("id_ecdsa") ||
        base.startsWith("id_ed25519") ||
        base === "credentials" ||
        base === "credentials.json" ||
        base.endsWith(".pem") ||
        base.endsWith(".key")
    );
}

export function assertSafeRel(rel: string): void {
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

/** 确保本机 scope 文件存在;不存在则从仓库自带示例复制 */
export function ensureLocalScope(root: string): void {
    if (isFile(paths.scopeFile)) {
        return;
    }

    mkdirSync(dirname(paths.scopeFile), { recursive: true });
    copyFileSync(`${root}/omarsync.scope.example`, paths.scopeFile);
    chmodSync(paths.scopeFile, 0o644);
}

/** 解析 scope 文件;非法路径直接 die */
export function readScope(file: string): ScopeEntry[] {
    const data = readTextFile(file);

    if (data === undefined) {
        return [];
    }

    const entries: ScopeEntry[] = [];

    for (const raw of data.split("\n")) {
        const line = raw.trim();

        if (line === "" || line.startsWith("#")) {
            continue;
        }

        const pipe = line.indexOf("|");
        const rel = (pipe === -1 ? line : line.slice(0, pipe)).trim();
        const csv = pipe === -1 ? "" : line.slice(pipe + 1);

        assertSafeRel(rel);

        const excludes = csv
            .split(",")
            .map((part) => part.trim())
            .filter((part) => part !== "");

        entries.push({ rel, excludes });
    }

    return entries;
}

// ===== reconcile:scope → mise dot 跟踪条目 =====

/** 恒排除:.git、node_modules、信任目录、插件目录(兜底,scope 排除可能丢失) */
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
    "**/*-bak.*",
] as const;

/** rsync 风格排除模式 → 路径限定的 glob 列表 */
function patternToGlobs(root: string, pattern: string): string[] {
    const globs: string[] = [];
    const base = `~/${root}`;

    if (pattern.endsWith("/")) {
        // 目录模式:plugins/
        const dir = pattern.slice(0, -1);

        globs.push(`${base}/${dir}/**`, `${base}/${dir}`);

        if (!dir.includes("/")) {
            globs.push(`${base}/**/${dir}/**`, `${base}/**/${dir}`);
        }
    } else if (pattern.includes("/")) {
        // 带路径的模式只匹配根部
        globs.push(`${base}/${pattern}`);
    } else {
        // 裸名字匹配任意层级
        globs.push(`${base}/${pattern}`, `${base}/**/${pattern}`);
    }

    return globs;
}

/** reconcile 之后应当存在的全部排除 glob(集合) */
export function desiredExcludes(entries: readonly ScopeEntry[]): Set<string> {
    const set = new Set<string>(CONST_EXCLUDES);

    for (const entry of entries) {
        for (const pattern of entry.excludes) {
            for (const glob of patternToGlobs(entry.rel, pattern)) {
                set.add(glob);
            }
        }
    }

    for (const glob of pushIgnoreExcludes(loadPushIgnore())) {
        set.add(glob);
    }

    return set;
}

/** 幂等对齐:track 集合 = scope 条目;排除集合 = desiredExcludes。
 *  omarsync 拥有这台机器的 mise dot 配置;scope 之外的手动 track 会被 untrack。 */
export function reconcile(entries: readonly ScopeEntry[]): void {
    if (!mise.available()) {
        die("mise 未安装。运行: omarchy pkg add mise");
    }

    if (!mise.featureOk()) {
        die("mise dot 在这台机器上不工作;检查 `mise dot status`");
    }

    const desired = desiredExcludes(entries);
    // 先落下排除规则再 track。mise track 会立刻写基线检查点,
    // 晚加的 .env / .git 排除来不及挡住第一次保存。
    const have = new Set(mise.currentExcludes());

    for (const glob of desired) {
        if (!have.has(glob) && !mise.excludeAdd(glob)) {
            log.warn(`添加排除规则失败 ${glob}`);
        }
    }

    const wanted = new Set(entries.map((entry) => entry.rel));
    const trackedNow = mise.trackedRels();

    for (const rel of wanted) {
        if (!trackedNow.has(rel)) {
            if (mise.track(rel)) {
                log.info(`tracking ${rel}`);
            } else {
                log.warn(`track 失败 ${rel}`);
            }
        }
    }

    // untrack scope 之外的条目
    for (const rel of mise.trackedRels()) {
        if (!wanted.has(rel)) {
            if (mise.untrack(rel)) {
                log.info(`untracked ${rel}(不在 scope 里)`);
            } else {
                log.warn(`untrack 失败 ${rel}`);
            }
        }
    }

    // 不再需要的排除规则最后再删,避免 track 期间少一层保护
    for (const glob of mise.currentExcludes()) {
        if (!desired.has(glob) && !mise.excludeDel(glob)) {
            log.warn(`移除排除规则失败 ${glob}`);
        }
    }
}
