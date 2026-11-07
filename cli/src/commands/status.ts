import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { isDir, resolveTool, run } from "../lib/exec";
import { ghInstalled, ghLoggedIn, githubUser } from "../lib/gh";
import { gitCapture, gitOut } from "../lib/git";
import { log, readTextFile } from "../lib/log";
import { mirrorDirty } from "../lib/meta";
import * as mise from "../lib/mise";
import { configGet, paths } from "../lib/paths";
import { loadPushIgnore, pathIgnored } from "../lib/push-ignore";
import { dotBranch, dotRepoName } from "../lib/omarchy";
import { commitSignatureState, firstApplyAvailable, isFullSha, trustedKeysPresent } from "../lib/trust";
import { displayTime, displayToken } from "../lib/util";

// status --json 聚合与 status.json 落盘。
// JSON schema 与旧版完全一致(面板 Panel.qml/Model.js 依赖)。
// dirty 判定:mise 有未保存的改动(元数据镜像 dirty 随 push/apply 阶段的 meta.ts 一起接)。

interface Status {
    ghInstalled: boolean;
    loggedIn: boolean;
    user: string;
    repo: string;
    dotRepo: string;
    dotBranch: string;
    branch: string;
    initialized: boolean;
    dirty: boolean;
    behind: number | null;
    ahead: number | null;
    remoteCommit: string;
    pinnedCommit: string;
    remoteSigned: boolean;
    remoteSignature: string;
    signerFingerprint: string;
    hasTrustedKeys: boolean;
    firstApply: boolean;
    lastPush: { host: string; time: string; omarchyVersion: string };
    running: boolean;
    error: string;
    miseConnected: boolean;
    changedFiles: string[];
}

/** 与旧版 read_counts 等价:返回 [behind, ahead, remoteSha];无法联系远程返回 undefined */
function readCounts(mirror: string, branch: string): [number, number, string] | undefined {
    const ls = gitCapture(["-C", mirror, "ls-remote", "--exit-code", "--heads", "origin", branch]);

    if (ls.code === 2) {
        return [0, 0, ""];
    }

    if (!ls.ok || !gitCapture(["-C", mirror, "fetch", "--quiet", "origin", branch]).ok) {
        return undefined;
    }

    let sha = gitOut(["-C", mirror, "rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]);

    if (!isFullSha(sha)) {
        sha = undefined;
    }

    const head = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);

    if (!head) {
        const remoteCount = sha ? Number(gitOut(["-C", mirror, "rev-list", "--count", sha]) ?? 0) : 0;

        return [remoteCount, 0, sha ?? ""];
    }

    if (!sha) {
        return [0, 0, ""];
    }

    // 签名修复或空提交会改变提交 id,但文件树没变;这种差异不需要 apply 或 push。
    const headTree = gitOut(["-C", mirror, "rev-parse", "--verify", `${head}^{tree}`]);
    const remoteTree = gitOut(["-C", mirror, "rev-parse", "--verify", `${sha}^{tree}`]);

    if (headTree && remoteTree && headTree === remoteTree) {
        return [0, 0, sha];
    }

    const behind = Number(gitOut(["-C", mirror, "rev-list", "--count", `HEAD..${sha}`]) ?? 0);
    const ahead = Number(gitOut(["-C", mirror, "rev-list", "--count", `${sha}..HEAD`]) ?? 0);

    return [behind, ahead, sha];
}

/** 是否有其他 omarsync 进程在跑(flock 探测);持锁进程刷新自身状态时不算其他进程 */
function isRunning(): boolean {
    if (process.env["OMARSYNC_LOCK_HELD"] === "1") {
        return false;
    }

    const flock = resolveTool("flock");

    if (!flock) {
        return false;
    }

    mkdirSync(dirname(paths.lockFile), { recursive: true });

    return !run(flock, ["-n", paths.lockFile, "-c", "true"]);
}

/** mise 侧是否有未保存改动。只读查询,绝不能在 status 里调用 save。 */
function miseDirty(): boolean {
    if (!mise.available() || !mise.featureOk()) {
        return false;
    }

    const unsaved = mise.unsavedFiles();

    if (unsaved !== undefined) {
        const ignored = loadPushIgnore();

        return unsaved.some((name) => !pathIgnored(ignored, name));
    }

    // 旧版 mise 没有 history.unsaved 字段时退回只读 diff。
    return /\S/.test(mise.diff().out.replace(/^mise files: all files are applied\s*$/m, ""));
}

/** 最近一次 mise 检查点改动的文件(历史仓库里路径带 home/ 前缀,剥掉) */
function changedFiles(): string[] {
    const repo = join(homedir(), ".local", "state", "mise", "history", "repo.git");

    if (!isDir(repo)) {
        return [];
    }

    const out = gitOut([`--git-dir=${repo}`, "show", "--name-only", "--format=", "HEAD"]) ?? "";
    const files: string[] = [];
    const seen = new Set<string>();

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

function collect(): Status {
    const st: Status = {
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
        changedFiles: [],
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

    if (mise.available()) {
        st.miseConnected = mise.originConnected();
    }

    if (isDir(`${paths.mirrorDir}/.git`)) {
        st.initialized = true;
        const mirror = paths.mirrorDir;

        if (!st.running) {
            let dirty = mirrorDirty(mirror);

            if (!dirty) {
                dirty = miseDirty();

                if (dirty) {
                    const unsaved = mise.unsavedFiles();
                    const ignored = loadPushIgnore();
                    const visible = (unsaved ?? []).filter((name) => !pathIgnored(ignored, name));

                    st.changedFiles = visible.length > 0
                        ? visible.map((name) => name.replace(/^~\//, "")).slice(0, 30)
                        : changedFiles();
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
                const data = JSON.parse(metaRaw) as Record<string, unknown>;

                st.lastPush.host = displayToken(data.host);
                st.lastPush.time = displayTime(data.pushedAt);
                st.lastPush.omarchyVersion = displayToken(data.omarchyVersion);
            } catch {
                // 元数据损坏不算致命
            }
        }
    }

    return st;
}

/** 落盘 status.json 并返回文本(两种模式都落盘,避免二次采集时 save 已消费改动) */
function writeJson(st: Status): string {
    const text = JSON.stringify(st);

    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(paths.statusJson, `${text}\n`);

    return text;
}

export function executeStatus(json: boolean): void {
    const st = collect();
    const text = writeJson(st);

    if (json) {
        process.stdout.write(`${text}\n`);

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
