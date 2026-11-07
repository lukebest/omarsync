import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { capture, isDir, resolveTool } from "./exec";
import { gitCapture, gitOut } from "./git";
import { die, log, readTextFile } from "./log";
import { assignments } from "./proxy";
import { isFullSha } from "./trust";

// mise dot 的封装:track/untrack/exclude/save/sync/pull/status/history。
// 文件同步的全部传输都由 mise 负责(track 模式,原地跟踪,不建符号链接)。
// 1:1 移植自 src/mise.lua。

export function available(): boolean {
    return resolveTool("mise") !== undefined;
}

function miseBin(): string {
    const bin = resolveTool("mise");

    if (!bin) {
        die("mise 未安装。运行: omarchy pkg add mise");
    }

    return bin;
}

function miseCapture(args: readonly string[], mergeStderr = false): { ok: boolean; out: string } {
    const result = capture(miseBin(), ["dot", ...args], assignments());

    return { ok: result.code === 0, out: mergeStderr ? result.stdout + result.stderr : result.stdout };
}

/** mise dot 功能探测:status -J 能跑通即可 */
export function featureOk(): boolean {
    return miseCapture(["status", "-J"]).ok;
}

export interface MiseStatus {
    readonly edits?: readonly unknown[];
    readonly history?: {
        readonly sync?: {
            readonly origin?: unknown;
            readonly branch?: unknown;
        };
        readonly unsaved?: unknown;
    };
    readonly [key: string]: unknown;
}

/** status -J;失败返回 undefined */
export function status(): MiseStatus | undefined {
    const { ok, out } = miseCapture(["status", "-J"]);

    if (!ok) {
        return undefined;
    }

    try {
        return JSON.parse(out) as MiseStatus;
    } catch {
        return undefined;
    }
}

interface MisePaths {
    readonly entries?: readonly { readonly path?: string }[];
    readonly exclude?: readonly string[];
}

function pathsJson(): MisePaths | undefined {
    const { ok, out } = miseCapture(["paths", "-J"]);

    if (!ok) {
        return undefined;
    }

    try {
        return JSON.parse(out) as MisePaths;
    } catch {
        return undefined;
    }
}

/** 已跟踪的根路径集合(rel 相对 $HOME,不带 ~/ 前缀) */
export function trackedRels(): Set<string> {
    const result = new Set<string>();
    const data = pathsJson();

    for (const entry of data?.entries ?? []) {
        if (typeof entry.path === "string") {
            result.add(entry.path.replace(/^~\//, ""));
        }
    }

    return result;
}

/** 当前全局排除 glob 列表 */
export function currentExcludes(): string[] {
    return [...(pathsJson()?.exclude ?? [])];
}

/** track 一个路径(幂等;不存在的位置也能 track) */
export function track(rel: string): boolean {
    return miseCapture(["track", "-y", `~/${rel}`]).ok;
}

export function untrack(rel: string): boolean {
    return miseCapture(["untrack", `~/${rel}`]).ok;
}

export function excludeAdd(glob: string): boolean {
    return miseCapture(["exclude", glob]).ok;
}

/** include 即移除一条排除规则 */
export function excludeDel(glob: string): boolean {
    return miseCapture(["include", glob]).ok;
}

/** 保存检查点。返回 true(有新检查点)/false(无变化);失败返回 undefined */
export function save(): boolean | undefined {
    const { ok, out } = miseCapture(["save"], true);

    if (!ok) {
        return undefined;
    }

    return !out.includes("nothing changed");
}

/** 自最新检查点以来尚未保存的路径;只读,绝不创建检查点。字段不可用时返回 undefined */
export function unsavedFiles(): string[] | undefined {
    const unsaved = status()?.history?.unsaved;

    if (!Array.isArray(unsaved)) {
        return undefined;
    }

    const files: string[] = [];

    for (const item of unsaved) {
        if (typeof item === "string") {
            files.push(item);
        } else if (item && typeof item === "object" && "path" in item && typeof item.path === "string") {
            files.push(item.path);
        }
    }

    return files;
}

/** 两个已保存快照之间的完整文件差异;任一不是对象 id 时返回空串 */
export function snapshotDiff(from: string, to: string): string {
    if (!isFullSha(from) || !isFullSha(to) || !isDir(historyRepo())) {
        return "";
    }

    return gitCapture(["--git-dir", historyRepo(), "diff", "--stat", "--patch", "--no-color", from, to]).out;
}

/** 最新检查点的 tree.snapshot(git 树哈希,跨机稳定);失败返回 undefined */
export function headSnapshot(): string | undefined {
    const { ok, out } = miseCapture(["history", "ls", "-J"]);

    if (!ok) {
        return undefined;
    }

    try {
        const data = JSON.parse(out) as { tree?: { snapshot?: string } }[];
        const snapshot = data[0]?.tree?.snapshot;

        return typeof snapshot === "string" ? snapshot : undefined;
    } catch {
        return undefined;
    }
}

function normOrigin(url: string): string {
    return url.replace(/\/+$/, "").replace(/\.git$/, "");
}

function historySync(): { readonly origin?: unknown; readonly branch?: unknown } | undefined {
    const data = status();
    const syncInfo = data?.history?.sync;

    return syncInfo && typeof syncInfo === "object" ? syncInfo : undefined;
}

/** 已连接的 origin。新版 mise 放在 status -J 的 history.sync.origin;旧版只在文本里写。 */
export function originUrl(): string {
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

export function originBranch(): string {
    const syncInfo = historySync();
    const branch = syncInfo?.branch;

    return typeof branch === "string" ? branch : "";
}

/** 是否已连接 origin */
export function originConnected(): boolean {
    return originUrl() !== "";
}

/** 地址和分支都对上才算已经连好。换仓库或换分支时要重连。 */
export function originMatches(url: string, branch: string): boolean {
    const got = normOrigin(originUrl());

    if (got === "" || got !== normOrigin(url)) {
        return false;
    }

    const gotBranch = originBranch();

    return branch === "" || gotBranch === "" || gotBranch === branch;
}

/** 接收机在 fetch 之前调用。已经连到同一地址和分支时什么都不做。 */
export function connect(url: string, branch: string): { ok: boolean; out: string } {
    if (url === "") {
        return { ok: false, out: "metadata repository is not configured" };
    }

    if (originMatches(url, branch)) {
        return { ok: true, out: "" };
    }

    return originSet(url, branch);
}

/** 连接 origin(非交互)。用 manual,避免第一次发布失败时连连接记录都不留下。 */
export function originSet(url: string, branch = "main"): { ok: boolean; out: string } {
    return miseCapture(["origin", "set", url, "--branch", branch, "--sync", "manual", "-y"], true);
}

/** 发布 + 抓取;fetchOnly=true 时只抓取。
 *  mise 会把快捷键一类的字符串当成密钥而拒绝整次发布;私有仓库仍要发出去。 */
export function sync(fetchOnly: boolean): { ok: boolean; out: string } {
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

export interface PullOptions {
    readonly dryRun?: boolean;
    readonly takeRemoteAll?: boolean;
}

export function historyRepo(): string {
    return join(homedir(), ".local", "state", "mise", "history", "repo.git");
}

export interface SnapshotEntry {
    readonly mode: string;
    readonly blob: string;
}

/** 根树里一个路径的 mode/blob;路径使用 home/... 形式 */
export function snapshotEntry(tree: string, path: string): SnapshotEntry | undefined {
    if (!isFullSha(tree)) {
        return undefined;
    }

    const out = gitOut(["--git-dir", historyRepo(), "ls-tree", "-z", tree, "--", path]);

    if (!out) {
        return undefined;
    }

    const match = /^(\d+) \w+ ([0-9a-f]{40})\t(.+)$/.exec(out.replace(/\0$/, ""));

    if (!match || match[3] !== path) {
        return undefined;
    }

    return { mode: match[1]!, blob: match[2]! };
}

export interface SnapshotChange {
    readonly path: string;
    readonly status: "A" | "M" | "D";
}

/** 两棵 mise 根树之间的文件差异;路径为 home/... */
export function snapshotChangedPaths(baseTree: string, localTree: string): SnapshotChange[] {
    if (!isFullSha(baseTree) || !isFullSha(localTree)) {
        return [];
    }

    const out = gitOut([
        "--git-dir",
        historyRepo(),
        "diff",
        "--name-status",
        "--no-renames",
        baseTree,
        localTree,
        "--",
        "home",
    ]);

    if (!out) {
        return [];
    }

    const changes: SnapshotChange[] = [];

    for (const line of out.split("\n")) {
        const [status, path] = line.split("\t");

        if (!status || !path || !path.startsWith("home/")) {
            continue;
        }

        changes.push({ path, status: status === "A" ? "A" : status === "D" ? "D" : "M" });
    }

    return changes;
}

/** 空根树(不需要写对象;git 能直接给出哈希) */
export function emptySnapshot(): string | undefined {
    return gitOut(["--git-dir", historyRepo(), "hash-object", "-t", "tree", "/dev/null"]);
}

/** 根树里的全部路径(home/... 与 .mise-history/...) */
export function snapshotPaths(tree: string): string[] {
    if (!isFullSha(tree)) {
        return [];
    }

    const out = gitOut(["--git-dir", historyRepo(), "ls-tree", "-r", "--name-only", tree]);

    return out ? out.split("\n").filter((line) => line !== "") : [];
}

/** 签名提交里的 miseHead 是检查点的 tree。找到对应的 commit,供 rollback 钉住。 */
export function commitForSnapshot(snapshot: string): string | undefined {
    if (!isFullSha(snapshot) || !isDir(historyRepo())) {
        return undefined;
    }

    const out = gitOut(["--git-dir", historyRepo(), "log", "--all", "--format=%H %T"]);

    if (!out) {
        return undefined;
    }

    for (const line of out.split("\n")) {
        const [commit, tree] = line.split(" ");

        if (tree === snapshot && isFullSha(commit)) {
            return commit;
        }
    }

    return undefined;
}

/** 该提交是否已经作为 checkpoint 导入 mise 本地索引。
 *  只 fetch 到 Git 对象库还不够,rollback 只认索引里的检查点。 */
export function checkpointIndexed(commit: string): boolean {
    if (!isFullSha(commit)) {
        return false;
    }

    const { ok, out } = miseCapture(["history", "ls", "-J", "-n", "0"]);

    if (!ok) {
        return false;
    }

    try {
        const rows = JSON.parse(out) as { commit?: unknown }[];

        return Array.isArray(rows) && rows.some((row) => row.commit === commit);
    } catch {
        return false;
    }
}

/** 最近一次 fetch 得到的远程 dotfiles 尖端对应的文件树 */
export function upstreamSnapshot(): string | undefined {
    const raw = readTextFile(`${dirname(historyRepo())}/sync.json`);

    if (!raw) {
        return undefined;
    }

    try {
        const data = JSON.parse(raw) as { upstream_commit?: unknown };
        const commit = typeof data.upstream_commit === "string" ? data.upstream_commit : undefined;

        if (!isFullSha(commit)) {
            return undefined;
        }

        return gitOut(["--git-dir", historyRepo(), "rev-parse", "--verify", "--quiet", `${commit}^{tree}`]);
    } catch {
        return undefined;
    }
}

/** 把跟踪文件恢复成某个检查点。dryRun 只打印计划。 */
export function rollbackTo(commit: string, dryRun = false): { ok: boolean; out: string } {
    const args = ["rollback", "--to", `commit:${commit}`, "--all", "-y"];

    if (dryRun) {
        args.push("--dry-run");
    }

    return miseCapture(args, true);
}

/** pull:把远程共享内容写进活文件 */
export function pull(options: PullOptions = {}): { ok: boolean; out: string } {
    const args = ["pull", "-y"];

    if (options.takeRemoteAll) {
        args.push("--take-remote-all");
    }

    if (options.dryRun) {
        args.push("--dry-run");
    }

    return miseCapture(args, true);
}

/** conflicts:列出同步冲突 */
export function conflicts(): { ok: boolean; out: string } {
    return miseCapture(["conflicts"], true);
}

/** diff:本地与已保存检查点的差异(push 前的预览) */
export function diff(): { ok: boolean; out: string } {
    return miseCapture(["diff"], true);
}

/** 是否有待应用的远程变更(status 文本的 "N incoming" 或旧版提示语) */
export function incomingPending(): boolean {
    if (!available()) {
        return false;
    }

    const { out } = miseCapture(["status"], true);

    if (/incoming change\(s\) pending/.test(out)) {
        return true;
    }

    const n = /(\d+)\s+incoming/.exec(out)?.[1];

    return n !== undefined && n !== "0";
}
