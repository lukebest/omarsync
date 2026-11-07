import { chmodSync, copyFileSync, cpSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

import { capture, exists, isDir, isFile, isLink, mktempDir, realpath, resolveTool, rmrf } from "./exec";
import { gitOut } from "./git";
import { readTextFile } from "./log";
import { discardRemoteScope } from "./omarchy";
import { exportHooks } from "./hooks";
import { exportPackages } from "./packages";
import { exportPlugins } from "./plugins";
import { loadPushIgnore } from "./push-ignore";
import type { PackageGroup, SelectionPlan } from "./selection";
import { hostnameSafe, iso8601 } from "./util";

// 元数据导出:当前主题/壁纸、包清单、插件清单、hooks、omarsync.json。
// 文件本体同步已由 mise dot 接管,这里只处理"非文件"的机器状态。1:1 移植自 src/meta.lua。

const HOME = homedir();

/** 导出当前主题名与壁纸记录(rel:/theme:/abs: 形式) */
export function exportCurrent(dest: string): void {
    const state = `${HOME}/.local/state/omarchy/current`;

    mkdirSync(`${dest}/current`, { recursive: true });
    const theme = (readTextFile(`${state}/theme.name`) ?? "").replaceAll(/\s+/g, "");

    writeFileSync(`${dest}/current/theme.name`, `${theme}\n`);

    let record = "";
    const bg = `${state}/background`;
    const target = isLink(bg) || exists(bg) ? realpath(bg) : undefined;
    const base = `${HOME}/.config/omarchy/backgrounds`;
    const themeBases = [
        `${state}/theme/`,
        `${HOME}/.config/omarchy/themes/${theme}/`,
        `${process.env["OMARCHY_PATH"] ?? "/usr/share/omarchy"}/themes/${theme}/`,
    ];
    const themeBase = theme === "" ? undefined : themeBases.find((path) => target?.startsWith(path));

    if (target?.startsWith(`${base}/`)) {
        record = `rel:${target.slice(base.length + 1)}`;
    } else if (target && themeBase) {
        record = `theme:${target.slice(themeBase.length)}`;
    } else if (target) {
        record = `abs:${target}`;
    }

    writeFileSync(`${dest}/current/background`, `${record}\n`);
}

/** omarsync.json:主机、Omarchy 版本、推送时间、mise 历史头(tree.snapshot) */
export function writeMeta(dest: string, miseHead: string | undefined): void {
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
        miseHead: miseHead ?? null,
    };

    writeFileSync(`${dest}/omarsync.json`, `${JSON.stringify(data)}\n`);
}

/** 采集元数据到镜像(不再含 home/ 目录;dotfiles 走 mise) */
export function collectInto(dest: string, miseHead: string | undefined): void {
    discardRemoteScope(dest);
    exportCurrent(dest);
    exportPackages(dest);
    exportPlugins(dest, "apply");
    exportHooks(dest);
    writeMeta(dest, miseHead);
}

/** 只导出本机候选,不写 omarsync.json;供选择清单和选择性合并使用 */
export function exportLocalInto(dest: string): void {
    exportCurrent(dest);
    exportPackages(dest);
    exportPlugins(dest, "apply");
    exportHooks(dest);
}

interface PluginRow {
    id?: unknown;
    local?: unknown;
    [key: string]: unknown;
}

function readRemotePlugins(dest: string): PluginRow[] {
    const raw = gitOut(["-C", dest, "show", "HEAD:plugins.json"]);

    if (!raw) {
        return [];
    }

    try {
        const data = JSON.parse(raw) as unknown;

        return Array.isArray(data) ? (data as PluginRow[]) : [];
    } catch {
        return [];
    }
}

function mergePackageText(group: PackageGroup, remote: string, local: string): string {
    if (group === "flatpak") {
        const rows = new Map<string, string>();

        for (const line of remote.split("\n")) {
            const app = line.split("\t")[0]?.trim();

            if (app) {
                rows.set(app, line);
            }
        }

        for (const line of local.split("\n")) {
            const app = line.split("\t")[0]?.trim();

            if (app) {
                rows.set(app, line);
            }
        }

        return [...rows.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([, line]) => line)
            .join("\n") + (rows.size > 0 ? "\n" : "");
    }

    const names = new Set<string>();

    for (const line of remote.split("\n")) {
        const name = line.trim();

        if (name !== "" && !name.startsWith("#")) {
            names.add(name);
        }
    }

    for (const line of local.split("\n")) {
        const name = line.trim();

        if (name !== "" && !name.startsWith("#")) {
            names.add(name);
        }
    }

    return [...names].sort().join("\n") + (names.size > 0 ? "\n" : "");
}

/** 只把勾选的文件/插件/包组/hooks 合并进当前 metadata HEAD;未选保持远程 */
export function collectSelectedInto(dest: string, miseHead: string, plan: SelectionPlan, localTmp: string): void {
    discardRemoteScope(dest);

    if (plan.current.selected) {
        mkdirSync(`${dest}/current`, { recursive: true });

        for (const name of ["theme.name", "background"]) {
            const source = `${localTmp}/current/${name}`;

            if (isFile(source)) {
                copyFileSync(source, `${dest}/current/${name}`);
            }
        }
    }

    for (const item of plan.hooks) {
        if (!item.selected) {
            continue;
        }

        const relative = `hooks/post-apply.d/${item.name}`;
        const target = `${dest}/${relative}`;
        const source = `${localTmp}/${relative}`;

        if (item.status === "D") {
            rmrf(target);
            continue;
        }

        if (isFile(source)) {
            mkdirSync(`${dest}/hooks/post-apply.d`, { recursive: true });
            copyFileSync(source, target);
            chmodSync(target, statSync(source).mode);
        }
    }

    for (const item of plan.packages) {
        if (!item.selected) {
            continue;
        }

        const relative = `packages/${item.group}.txt`;
        const remote = gitOut(["-C", dest, "show", `HEAD:${relative}`]) ?? "";
        const local = readTextFile(`${localTmp}/${relative}`) ?? "";
        const merged = mergePackageText(item.group, remote, local);

        mkdirSync(`${dest}/packages`, { recursive: true });
        writeFileSync(`${dest}/${relative}`, merged);
    }

    const remotePlugins = readRemotePlugins(dest);
    const plugins = new Map<string, PluginRow>();

    for (const row of remotePlugins) {
        if (typeof row.id === "string") {
            plugins.set(row.id, row);
        }
    }

    let localPlugins: PluginRow[] = [];

    try {
        const parsed = JSON.parse(readTextFile(`${localTmp}/plugins.json`) ?? "[]") as unknown;

        if (Array.isArray(parsed)) {
            localPlugins = parsed as PluginRow[];
        }
    } catch {
        localPlugins = [];
    }

    const localById = new Map<string, PluginRow>();

    for (const row of localPlugins) {
        if (typeof row.id === "string") {
            localById.set(row.id, row);
        }
    }

    for (const item of plan.plugins) {
        if (!item.selected) {
            continue;
        }

        const target = `${dest}/plugins-local/${item.id}`;

        if (item.status === "D") {
            plugins.delete(item.id);
            rmrf(target);
            continue;
        }

        const row = localById.get(item.id);

        if (!row) {
            continue;
        }

        plugins.set(item.id, row);
        rmrf(target);

        if (row.local === true && isDir(`${localTmp}/plugins-local/${item.id}`)) {
            mkdirSync(`${dest}/plugins-local`, { recursive: true });
            cpSync(`${localTmp}/plugins-local/${item.id}`, target, { recursive: true });
        }
    }

    if (plan.plugins.some((item) => item.selected)) {
        mkdirSync(dest, { recursive: true });
        writeFileSync(
            `${dest}/plugins.json`,
            `${JSON.stringify([...plugins.values()].sort((a, b) => String(a.id).localeCompare(String(b.id))), undefined, 2)}\n`,
        );
    }

    writeMeta(dest, miseHead);
}

/** 比较两棵树(文件级,调 diff/cmp 这两个可信工具) */
function treesDiffer(left: string, right: string): boolean {
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

function packageLines(text: string | undefined, group: PackageGroup): Map<string, string> {
    const lines = new Map<string, string>();

    for (const line of (text ?? "").split("\n")) {
        if (line.trim() === "" || line.startsWith("#")) {
            continue;
        }

        const id = (group === "flatpak" ? line.split("\t")[0] : line.trim()) ?? "";

        if (id !== "") {
            lines.set(id, line);
        }
    }

    return lines;
}

function packagesDirty(mirror: string, tmp: string, ignoredPackages: ReadonlySet<string>): boolean {
    for (const group of ["pacman", "aur", "flatpak"] as const) {
        const relative = `packages/${group}.txt`;
        const remote = packageLines(readTextFile(`${mirror}/${relative}`), group);
        const local = packageLines(readTextFile(`${tmp}/${relative}`), group);

        // ignored 两边都过滤;只看本机相对远程的新增/修改。
        // 远程有、本机没装的包不是本机改动(并集发布时也不会删它们),
        // 否则一台机器少装几个包就会让 push 灯永久常亮。
        for (const id of ignoredPackages) {
            remote.delete(id);
            local.delete(id);
        }

        for (const [id, line] of local) {
            if (remote.get(id) !== line) {
                return true;
            }
        }
    }

    return false;
}

/** 稳定键序的 JSON:导出方与镜像里的同一记录字段排列可能不同,
 *  裸 JSON.stringify 会把纯键序差异误判成内容变化,让 push 灯常亮。 */
function canonicalStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalStringify).join(",")}]`;
    }

    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`);

        return `{${entries.join(",")}}`;
    }

    return JSON.stringify(value);
}

function pluginRecords(text: string | undefined, ignored: ReadonlySet<string>): Map<string, string> {
    const records = new Map<string, string>();

    try {
        const rows = JSON.parse(text ?? "[]") as { id?: unknown }[];

        for (const row of rows) {
            if (typeof row.id === "string" && !ignored.has(row.id)) {
                records.set(row.id, canonicalStringify(row));
            }
        }
    } catch {
        // 坏清单按现有逻辑交给 apply;这里不额外制造脏状态
    }

    return records;
}

/** 元数据是否脏(本机状态与镜像不一致)。dotfiles 的脏判定在 status 里由 mise 负责 */
export function mirrorDirty(mirror: string): boolean {
    const tmp = mktempDir();

    try {
        const ignored = loadPushIgnore();

        exportCurrent(tmp);
        exportPackages(tmp);
        const pluginsKnown = exportPlugins(tmp, "check");

        let dirty = treesDiffer(`${mirror}/current`, `${tmp}/current`);

        if (!dirty && packagesDirty(mirror, tmp, ignored.packages)) {
            dirty = true;
        }

        if (!dirty && pluginsKnown) {
            const remotePlugins = pluginRecords(readTextFile(`${mirror}/plugins.json`), ignored.plugins);
            const localPlugins = pluginRecords(readTextFile(`${tmp}/plugins.json`), ignored.plugins);

            if (remotePlugins.size !== localPlugins.size) {
                dirty = true;
            } else {
                for (const [id, record] of localPlugins) {
                    if (remotePlugins.get(id) !== record) {
                        dirty = true;
                        break;
                    }
                }
            }

            if (!dirty && ignored.plugins.size === 0
                && (isDir(`${mirror}/plugins-local`) || isDir(`${tmp}/plugins-local`))) {
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
