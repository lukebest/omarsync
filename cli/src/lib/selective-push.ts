import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { isFullSha } from "./trust";
import { mktempDir, rmrf } from "./exec";
import { git, gitCapture, gitCaptureEnv, gitCaptureInputEnv, gitOut, gitOutEnv } from "./git";
import { die, log } from "./log";
import * as mise from "./mise";
import { pushIgnoreExcludes, type PushIgnore } from "./push-ignore";
import { assertSafeRel } from "./scope";
import { hostnameSafe, iso8601 } from "./util";

// 选择性 dotfiles 发布:以远程签名快照树为 base,只覆盖勾选的文件。
// 未勾选/ignored 的路径保持远程;不写本机活文件。

export const DOTFILES_SHADOW = "refs/omarsync/dotfiles-tip";
const REMOTE_REF = "refs/omarsync/remote-dotfiles";

export interface RemoteDotfiles {
    readonly commit?: string;
    readonly tree: string;
}

interface Manifest {
    enrollment?: unknown[];
    exclude?: unknown[];
    permissions?: Record<string, unknown>;
    [key: string]: unknown;
}

function history(args: readonly string[]): string[] {
    return ["--git-dir", mise.historyRepo(), ...args];
}

function showFromTree(tree: string, path: string): string | undefined {
    return gitOut(history(["show", `${tree}:${path}`]));
}

function readManifest(tree: string): Manifest | undefined {
    const raw = showFromTree(tree, ".mise-history/manifest.json");

    if (!raw) {
        return undefined;
    }

    try {
        return JSON.parse(raw) as Manifest;
    } catch {
        die(`mise 清单不是合法 JSON: ${tree}:.mise-history/manifest.json`);
    }
}

function mergeManifest(
    base: Manifest | undefined,
    local: Manifest | undefined,
    selected: readonly string[],
    deleted: readonly string[],
    ignored: PushIgnore,
): Manifest {
    const merged: Manifest = base
        ? { ...base }
        : (local ? { ...local } : { enrollment: [], exclude: [], permissions: {} });
    const basePermissions = { ...(merged.permissions ?? {}) };
    const localPermissions = { ...(local?.permissions ?? {}) };
    const baseEnrollment = [...(merged.enrollment ?? [])];
    const localEnrollment = [...(local?.enrollment ?? [])];
    const excluded = new Set(pushIgnoreExcludes(ignored));

    if (!base && Array.isArray(merged.exclude)) {
        merged.exclude = merged.exclude.filter((item) => typeof item !== "string" || !excluded.has(item));
    }

    // exclude 取远程与本机的单调并集。mise 对该字段只做整字段三方合并:
    // 两台机器各自加过规则就 bail("enrollment conflict in exclusions")。
    // 发布端并集后,接收端相对共同祖先只有一侧变化,合并永远可解。
    // push-ignore 派生的规则只留在本机,不发布。
    const excludeGlobs = new Set(
        Array.isArray(merged.exclude)
            ? merged.exclude.filter((item): item is string => typeof item === "string")
            : [],
    );

    if (Array.isArray(local?.exclude)) {
        for (const item of local.exclude) {
            if (typeof item === "string" && !excluded.has(item)) {
                excludeGlobs.add(item);
            }
        }
    }

    merged.exclude = [...excludeGlobs];

    // 选中文件若属于远程未 enrollment 的根,把本地 enrollment 条目补进来。
    for (const path of selected) {
        const already = baseEnrollment.some((entry) => {
            const root = entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string"
                ? (entry as { path: string }).path
                : "";

            return root !== "" && (path === root || path.startsWith(`${root}/`));
        });

        if (!already) {
            const source = localEnrollment.find((entry) => {
                const root = entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string"
                    ? (entry as { path: string }).path
                    : "";

                return root !== "" && (path === root || path.startsWith(`${root}/`));
            });

            if (source) {
                baseEnrollment.push(source);
            }
        }

        const localPermission = localPermissions[path];

        if (localPermission === undefined) {
            delete basePermissions[path];
        } else if (basePermissions[path] !== localPermission) {
            basePermissions[path] = localPermission;
        }
    }

    for (const path of deleted) {
        delete basePermissions[path];
    }

    merged.enrollment = baseEnrollment;
    merged.permissions = basePermissions;

    return merged;
}

function writeManifest(indexFile: string, manifest: Manifest): void {
    const tmp = mktempDir();
    const file = join(tmp, "manifest.json");

    try {
        mkdirSync(tmp, { recursive: true });
        writeFileSync(file, `${JSON.stringify(manifest, undefined, 2)}\n`);

        const blob = gitOut(history(["hash-object", "-w", "--", file]));

        if (!blob || !gitCaptureEnv(
            history(["update-index", "--add", "--cacheinfo", `100644,${blob},.mise-history/manifest.json`]),
            [`GIT_INDEX_FILE=${indexFile}`],
        ).ok) {
            die("无法写入合并后的 mise 清单");
        }
    } finally {
        rmrf(tmp);
    }
}

function forbiddenPath(path: string): boolean {
    const local = path.replace(/^home\//, "");
    const parts = local.split("/");

    return (
        parts.includes(".git")
        || parts.includes("node_modules")
        || /(^|\/)\.env(\.|$)/.test(local)
        || local.startsWith(".config/omarchy/plugins")
        || local.startsWith(".config/omarsync")
        || local.startsWith(".ssh")
        || local.startsWith(".gnupg")
    );
}

function validateTree(tree: string): void {
    const out = gitOut(history(["ls-tree", "-r", "--name-only", tree]));

    for (const path of (out ?? "").split("\n")) {
        if (path === "") {
            continue;
        }

        if (forbiddenPath(path)) {
            die(`选择性发布拒绝敏感/禁用路径: ${path}`);
        }

        if (path.startsWith("home/")) {
            assertSafeRel(path.slice(5));
        }
    }
}

/** 抓取远程 dotfiles;不存在时返回空树作为首次发布的 base */
export function fetchRemoteDotfiles(url: string, branch: string): RemoteDotfiles {
    const has = gitCapture(["ls-remote", "--exit-code", "--heads", url, branch]);

    if (has.code === 2) {
        const empty = mise.emptySnapshot();

        if (!empty) {
            die("无法取得空树对象");
        }

        return { tree: empty };
    }

    if (!has.ok) {
        die(`无法读取远程 dotfiles 分支 ${branch}`);
    }

    if (!git(history(["fetch", "--quiet", "--no-tags", url, `+refs/heads/${branch}:${REMOTE_REF}`]))) {
        die("抓取远程 dotfiles 失败");
    }

    const commit = gitOut(history(["rev-parse", "--verify", "--quiet", `${REMOTE_REF}^{commit}`]));
    const tree = commit ? gitOut(history(["rev-parse", "--verify", `${commit}^{tree}`])) : undefined;

    if (!isFullSha(commit) || !isFullSha(tree)) {
        die("远程 dotfiles 没有解析出树");
    }

    return { commit, tree };
}

export interface BuiltDotfiles {
    readonly tree: string;
    readonly commit?: string;
}

/** 本机将通过并集发布到远程的新增 exclude 规则(相对远程 manifest,已扣除 push-ignore)。
 *  没有文件勾选时,push 仍可能因为这批规则需要一次发布。 */
export function pendingExcludeAdds(
    remoteTree: string,
    localTree: string,
    ignored: PushIgnore,
): string[] {
    const localManifest = readManifest(localTree);

    if (!localManifest) {
        return [];
    }

    const baseManifest = readManifest(remoteTree);
    const merged = mergeManifest(baseManifest, localManifest, [], [], ignored);
    const baseSet = new Set(
        Array.isArray(baseManifest?.exclude)
            ? baseManifest.exclude.filter((item): item is string => typeof item === "string")
            : [],
    );

    return (Array.isArray(merged.exclude) ? merged.exclude : [])
        .filter((item): item is string => typeof item === "string")
        .filter((glob) => !baseSet.has(glob));
}

/** 构造 TM/M;没有勾选文件时直接返回远程树 */
export function buildSelectedDotfiles(
    remote: RemoteDotfiles,
    localTree: string,
    selectedPaths: readonly string[],
    selectedDeletes: readonly string[],
    ignored: PushIgnore,
): BuiltDotfiles {
    // manifest 先于 index 读取:即使没有勾选文件,exclude 的并集变化本身
    // 也是一次需要发布的 dotfiles 提交。
    const localManifest = readManifest(localTree);

    if (!localManifest) {
        die("本机 mise 快照没有 manifest.json");
    }

    const baseManifest = readManifest(remote.tree);
    const mergedManifest = mergeManifest(baseManifest, localManifest, selectedPaths, selectedDeletes, ignored);
    const manifestChanged = !baseManifest || !isDeepStrictEqual(baseManifest, mergedManifest);

    if (selectedPaths.length === 0 && selectedDeletes.length === 0 && !manifestChanged) {
        return { tree: remote.tree };
    }

    // Git 在某些文件系统组合下要求 index 与仓库同文件系统;/tmp 常是 tmpfs。
    const tmp = mkdtempSync(join(dirname(mise.historyRepo()), ".omarsync-index-"));
    const indexFile = join(tmp, "index");

    try {
        if (!gitCapture(history(["read-tree", `--index-output=${indexFile}`, remote.tree])).ok) {
            die("无法读取远程 dotfiles 树");
        }

        const deleteInput = selectedDeletes
            .map((path) => `0 ${"0".repeat(40)}\t${path}\n`)
            .join("");

        if (deleteInput !== "") {
            const result = gitCaptureInputEnv(history(["update-index", "--index-info"]), [
                `GIT_INDEX_FILE=${indexFile}`,
            ], deleteInput);

            if (!result.ok) {
                die("无法从树里删除勾选路径");
            }
        }

        for (const path of selectedPaths) {
            const entry = mise.snapshotEntry(localTree, path);

            if (!entry) {
                die(`本机快照里没有 ${path}`);
            }

            const result = gitCaptureEnv(
                history(["update-index", "--add", "--cacheinfo", `${entry.mode},${entry.blob},${path}`]),
                [`GIT_INDEX_FILE=${indexFile}`],
            );

            if (!result.ok) {
                die(`无法写入树路径 ${path}`);
            }
        }

        if (manifestChanged) {
            writeManifest(indexFile, mergedManifest);
        }

        const tree = gitOutEnv(history(["write-tree"]), [`GIT_INDEX_FILE=${indexFile}`]);

        if (!isFullSha(tree)) {
            die("无法写出选择性发布树");
        }

        validateTree(tree);

        const parent = remote.commit;
        const args = history(["-c", "user.name=mise", "-c", "user.email=mise@localhost", "commit-tree", tree]);

        if (parent) {
            args.push("-p", parent);
        }

        const message = [
            `sync selected from ${hostnameSafe()} @ ${iso8601()}`,
            "",
            `Mise-History: ${JSON.stringify({ trigger: "save", description_source: "computed", task: null, labels: [], omitted: [], incomplete: [], operation: null })}`,
            "Mise-History-Matcher: 2",
        ].join("\n");

        args.push("-m", message);

        const commit = gitOut(args);

        if (!isFullSha(commit)) {
            die("无法创建 dotfiles 提交");
        }

        if (!git(history(["update-ref", DOTFILES_SHADOW, commit]))) {
            die("无法更新本机 dotfiles shadow ref");
        }

        log.info(`已构造选择性快照 ${tree} (${commit.slice(0, 10)})`);

        return { tree, commit };
    } finally {
        rmrf(tmp);
    }
}

/** 把选择性提交对象搬进 metadata 镜像,供 atomic push 使用 */
export function importDotfilesCommit(mirror: string, commit: string): boolean {
    if (!isFullSha(commit)) {
        return false;
    }

    return git([
        "-C",
        mirror,
        "fetch",
        "--quiet",
        "--no-tags",
        mise.historyRepo(),
        `${DOTFILES_SHADOW}:refs/omarsync/dotfiles-publish`,
    ]);
}

export function selectedPaths(plan: { files: readonly { path: string; status: string; selected: boolean }[] }): {
    writes: string[];
    deletes: string[];
} {
    const writes: string[] = [];
    const deletes: string[] = [];

    for (const item of plan.files) {
        if (!item.selected) {
            continue;
        }

        if (item.status === "D") {
            deletes.push(item.path);
        } else {
            writes.push(item.path);
        }
    }

    return { writes, deletes };
}

/** 读取远程 metadata 里记录的 miseHead */
export function remoteMiseHead(mirror: string): string | undefined {
    const raw = gitOut(["-C", mirror, "show", "HEAD:omarsync.json"]);

    if (!raw) {
        return undefined;
    }

    try {
        const head = (JSON.parse(raw) as { miseHead?: unknown }).miseHead;

        const sha = typeof head === "string" ? head : undefined;

        return isFullSha(sha) ? sha : undefined;
    } catch {
        return undefined;
    }
}

/** 推送前重新读一次状态目录里的 omarsync.json,供签名断言 */
export function assertMiseHead(mirror: string, expected: string): void {
    const actual = remoteMiseHead(mirror);

    if (actual !== expected) {
        die(`签名前 miseHead 不一致:期望 ${expected},实际 ${actual ?? "<空>"}`);
    }
}
