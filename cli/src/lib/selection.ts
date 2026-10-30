import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { isDir, isFile } from "./exec";
import { gitOut } from "./git";
import { die, log, readTextFile } from "./log";
import * as mise from "./mise";
import { paths } from "./paths";
import { pathIgnored, type PushIgnore } from "./push-ignore";

// push 选择清单:相对远程签名快照的真实差异,文件/插件/hooks 逐项,包按组。
// 删除项默认不选;push-ignore 的路径和 id 不进入候选。

export type FileStatus = "A" | "M" | "D";

export interface FileItem {
    readonly path: string;
    readonly status: FileStatus;
    selected: boolean;
}

export interface PluginItem {
    readonly id: string;
    readonly status: FileStatus;
    selected: boolean;
}

export interface HookItem {
    readonly name: string;
    readonly status: FileStatus;
    selected: boolean;
}

export type PackageGroup = "pacman" | "aur" | "flatpak";

export interface PackageItem {
    readonly group: PackageGroup;
    readonly status: "A" | "M";
    selected: boolean;
}

export interface SelectionPlan {
    readonly files: FileItem[];
    readonly plugins: PluginItem[];
    readonly hooks: HookItem[];
    readonly packages: PackageItem[];
    current: { selected: boolean; status: "A" | "M"; candidate: boolean };
    readonly ignored: PushIgnore;
}

export interface PluginRecord {
    id?: unknown;
    url?: unknown;
    commit?: unknown;
    enabled?: unknown;
    local?: unknown;
}

function show(mirror: string, path: string): string | undefined {
    return gitOut(["-C", mirror, "show", `HEAD:${path}`]);
}

function blobOf(mirror: string, file: string): string | undefined {
    return gitOut(["-C", mirror, "hash-object", "--", file]);
}

function remoteHooks(mirror: string): string[] {
    const out = gitOut(["-C", mirror, "ls-tree", "-r", "--name-only", "HEAD", "hooks/post-apply.d"]);

    if (!out) {
        return [];
    }

    return out
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => line.slice("hooks/post-apply.d/".length));
}

function localHooks(localTmp: string): string[] {
    const dir = `${localTmp}/hooks/post-apply.d`;

    if (!isDir(dir)) {
        return [];
    }

    return readdirSync(dir).sort();
}

function sameFile(localFile: string, mirror: string, remotePath: string): boolean {
    if (!isFile(localFile)) {
        return false;
    }

    const remoteBlob = gitOut(["-C", mirror, "rev-parse", `HEAD:${remotePath}`]);
    const localBlob = blobOf(mirror, localFile);

    return remoteBlob !== undefined && localBlob !== undefined && remoteBlob === localBlob;
}

function localPlugins(localTmp: string): Map<string, PluginRecord> {
    const map = new Map<string, PluginRecord>();

    try {
        const rows = JSON.parse(readTextFile(`${localTmp}/plugins.json`) ?? "[]") as PluginRecord[];

        for (const row of rows) {
            if (typeof row.id === "string" && row.id !== "") {
                map.set(row.id, row);
            }
        }
    } catch {
        // 清单不可用时没有插件候选
    }

    return map;
}

function remotePlugins(mirror: string): Map<string, PluginRecord> {
    const map = new Map<string, PluginRecord>();
    const raw = show(mirror, "plugins.json");

    if (!raw) {
        return map;
    }

    try {
        const rows = JSON.parse(raw) as PluginRecord[];

        for (const row of rows) {
            if (typeof row.id === "string" && row.id !== "") {
                map.set(row.id, row);
            }
        }
    } catch {
        // 远程清单坏掉时不在 push 阶段猜;现有 apply 会拒绝
    }

    return map;
}

function packageText(mirror: string, group: PackageGroup): string {
    return show(mirror, `packages/${group}.txt`) ?? "";
}

function localPackageText(localTmp: string, group: PackageGroup): string {
    return readTextFile(`${localTmp}/packages/${group}.txt`) ?? "";
}

function packageId(line: string, group: PackageGroup): string {
    return group === "flatpak" ? (line.split("\t")[0] ?? "").trim() : line.trim();
}

function packageMap(text: string, group: PackageGroup, ignored: ReadonlySet<string>): Map<string, string> {
    const map = new Map<string, string>();

    for (const line of text.split("\n")) {
        const id = packageId(line, group);

        if (id !== "" && !ignored.has(id) && !line.startsWith("#")) {
            map.set(id, line);
        }
    }

    return map;
}

function packageChanged(remote: Map<string, string>, local: Map<string, string>): boolean {
    for (const [id, line] of local) {
        if (remote.get(id) !== line) {
            return true;
        }
    }

    return false;
}

function currentText(mirror: string, localTmp: string): { remote: string; local: string } {
    const names = ["current/theme.name", "current/background"];
    const remote = names.map((name) => (show(mirror, name) ?? "").trim()).join("\0");
    const local = names.map((name) => (readTextFile(`${localTmp}/${name}`) ?? "").trim()).join("\0");

    return { remote, local };
}

export function createPlan(
    mirror: string,
    baseTree: string,
    localTree: string,
    localTmp: string,
    ignored: PushIgnore,
): SelectionPlan {
    const files: FileItem[] = [];

    for (const change of mise.snapshotChangedPaths(baseTree, localTree)) {
        if (pathIgnored(ignored, change.path)) {
            continue;
        }

        files.push({
            path: change.path,
            status: change.status,
            selected: change.status !== "D",
        });
    }

    files.sort((a, b) => a.path.localeCompare(b.path));

    const local = localPlugins(localTmp);
    const remote = remotePlugins(mirror);
    const plugins: PluginItem[] = [];

    for (const [id, record] of local) {
        if (ignored.plugins.has(id)) {
            continue;
        }

        const previous = remote.get(id);
        const status: FileStatus = previous === undefined ? "A" : "M";
        const changed = previous === undefined || !isDeepStrictEqual(previous, record) || record.local === true;

        if (changed) {
            plugins.push({ id, status, selected: true });
        }
    }

    for (const id of remote.keys()) {
        if (ignored.plugins.has(id) || local.has(id)) {
            continue;
        }

        plugins.push({ id, status: "D", selected: false });
    }

    plugins.sort((a, b) => a.id.localeCompare(b.id));

    const remoteHookNames = remoteHooks(mirror);
    const localHookNames = localHooks(localTmp);
    const hookNames = new Set([...remoteHookNames, ...localHookNames]);
    const hooks: HookItem[] = [];

    for (const name of [...hookNames].sort()) {
        const remotePath = `hooks/post-apply.d/${name}`;
        const localFile = `${localTmp}/${remotePath}`;
        const inRemote = remoteHookNames.includes(name);
        const inLocal = localHookNames.includes(name);
        const same = inRemote && inLocal && sameFile(localFile, mirror, remotePath);

        if (same) {
            continue;
        }

        const status: FileStatus = !inRemote ? "A" : !inLocal ? "D" : "M";

        hooks.push({ name, status, selected: status !== "D" });
    }

    const packages: PackageItem[] = [];

    for (const group of ["pacman", "aur", "flatpak"] as const) {
        const remoteMap = packageMap(packageText(mirror, group), group, ignored.packages);
        const localMap = packageMap(localPackageText(localTmp, group), group, ignored.packages);

        if (packageChanged(remoteMap, localMap)) {
            packages.push({ group, status: remoteMap.size === 0 ? "A" : "M", selected: true });
        }
    }

    const current = currentText(mirror, localTmp);

    return {
        files,
        plugins,
        hooks,
        packages,
        current: {
            selected: current.remote !== current.local,
            status: current.remote === "" ? "A" : "M",
            candidate: current.remote !== current.local,
        },
        ignored,
    };
}

function fileLine(item: FileItem): string {
    return `- [${item.selected ? "x" : " "}] file | ${item.status} | ${item.path}`;
}

function pluginLine(item: PluginItem): string {
    return `- [${item.selected ? "x" : " "}] plugin | ${item.status} | ${item.id}`;
}

function hookLine(item: HookItem): string {
    return `- [${item.selected ? "x" : " "}] hook | ${item.status} | ${item.name}`;
}

function packageLine(item: PackageItem): string {
    return `- [${item.selected ? "x" : " "}] package | ${item.status} | ${item.group}`;
}

export function writeSelectionFile(plan: SelectionPlan): string {
    const lines = [
        "# Omarsync push selection",
        "# [x] 发布，[ ] 不发布。删除项(D)默认不选。改完保存,回终端确认。",
        "# 不要删除条目;只改方括号里的 x/空格。",
        "",
        "## Files",
        ...plan.files.map(fileLine),
        "",
        "## Plugins",
        ...plan.plugins.map(pluginLine),
        "",
        "## Package lists",
        ...plan.packages.map(packageLine),
        "",
        "## Hooks",
        ...plan.hooks.map(hookLine),
        "",
        "## Metadata",
        ...(plan.current.candidate
            ? [`- [${plan.current.selected ? "x" : " "}] current | ${plan.current.status} |`]
            : []),
        "",
    ];

    const file = `${paths.stateDir}/pending-push.selection`;

    try {
        // 这里只写状态目录;调用方决定是否打开编辑器
        mkdirSync(paths.stateDir, { recursive: true });
        writeFileSync(file, lines.join("\n"));
    } catch {
        die(`无法写选择清单 ${file}`);
    }

    return file;
}

interface ParsedLine {
    readonly selected: boolean;
    readonly kind: string;
    readonly status: string;
    readonly value: string;
}

function parseLine(raw: string, number: number): ParsedLine | undefined {
    const line = raw.trim();

    if (line === "" || line.startsWith("#")) {
        return undefined;
    }

    const match = /^- \[([ xX])\] ([a-z]+) \| ([AMD]) \| ?(.*)$/.exec(line);

    if (!match) {
        die(`选择清单第 ${number} 行无法解析;不要改动格式`);
    }

    return {
        selected: match[1]!.toLowerCase() === "x",
        kind: match[2]!,
        status: match[3]!,
        value: match[4]!.trim(),
    };
}

export function readSelectionFile(plan: SelectionPlan): SelectionPlan {
    const file = `${paths.stateDir}/pending-push.selection`;
    const text = readTextFile(file);

    if (text === undefined) {
        die(`选择清单不存在: ${file}`);
    }

    const seen = new Set<string>();
    const failure = (key: string, number: number): never => die(`选择清单第 ${number} 行重复或未知条目: ${key}`);

    for (const [index, raw] of text.split("\n").entries()) {
        const parsed = parseLine(raw, index + 1);

        if (!parsed) {
            continue;
        }

        const key = `${parsed.kind}:${parsed.value}`;

        if (seen.has(key)) {
            failure(key, index + 1);
        }

        seen.add(key);

        if (parsed.kind === "file") {
            const item = plan.files.find((candidate) => candidate.path === parsed.value);

            if (!item || item.status !== parsed.status) {
                failure(key, index + 1);
            }

            item!.selected = parsed.selected;
        } else if (parsed.kind === "plugin") {
            const item = plan.plugins.find((candidate) => candidate.id === parsed.value);

            if (!item || item.status !== parsed.status) {
                failure(key, index + 1);
            }

            item!.selected = parsed.selected;
        } else if (parsed.kind === "hook") {
            const item = plan.hooks.find((candidate) => candidate.name === parsed.value);

            if (!item || item.status !== parsed.status) {
                failure(key, index + 1);
            }

            item!.selected = parsed.selected;
        } else if (parsed.kind === "package") {
            const item = plan.packages.find((candidate) => candidate.group === parsed.value);

            if (!item || item.status !== parsed.status) {
                failure(key, index + 1);
            }

            item!.selected = parsed.selected;
        } else if (parsed.kind === "current") {
            if (!plan.current.candidate) {
                failure(key, index + 1);
            }

            if (parsed.value !== "" || parsed.status !== plan.current.status) {
                failure(key, index + 1);
            }

            plan.current.selected = parsed.selected;
        } else {
            failure(key, index + 1);
        }
    }

    for (const item of plan.files) {
        if (!seen.has(`file:${item.path}`)) {
            die(`选择清单缺少文件条目: ${item.path}`);
        }
    }

    for (const item of plan.plugins) {
        if (!seen.has(`plugin:${item.id}`)) {
            die(`选择清单缺少插件条目: ${item.id}`);
        }
    }

    for (const item of plan.hooks) {
        if (!seen.has(`hook:${item.name}`)) {
            die(`选择清单缺少 hook 条目: ${item.name}`);
        }
    }

    for (const item of plan.packages) {
        if (!seen.has(`package:${item.group}`)) {
            die(`选择清单缺少包清单条目: ${item.group}`);
        }
    }

    if (plan.current.candidate && !seen.has("current:")) {
        die("选择清单缺少 current 条目");
    }

    if (!plan.files.some((item) => item.selected)
        && !plan.plugins.some((item) => item.selected)
        && !plan.hooks.some((item) => item.selected)
        && !plan.packages.some((item) => item.selected)
        && !plan.current.selected) {
        log.warn("本次没有任何选择;不会发布变化");
    }

    return plan;
}
