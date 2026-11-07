import { mkdirSync, writeFileSync } from "node:fs";

import { reviewWithVsCode } from "../lib/diff-review";
import { isDir } from "../lib/exec";
import { git, gitCapture, gitOut } from "../lib/git";
import { openInEditor } from "../lib/editor";
import { die, log, readTextFile } from "../lib/log";
import { configGet, paths } from "../lib/paths";
import { commitIsTrusted, ensurePushSigner, isFullSha } from "../lib/trust";
import { confirm, hostnameSafe, iso8601 } from "../lib/util";
import { executeStatus } from "./status";

// 只恢复远程信任链:签一个与原快照完全相同的空差异提交。
// 不 checkout 未验证的远程内容,也不移动本地 HEAD 或丢弃待推送提交。
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function fetchRemoteTip(mirror: string, branch: string): string {
    if (!git(["-C", mirror, "fetch", "--quiet", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`])) {
        die("fetch 失败,未签名也未推送");
    }

    const tip = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", `origin/${branch}^{commit}`]);

    if (!isFullSha(tip)) {
        die("远程分支没有完整提交,未签名也未推送");
    }

    return tip;
}

/** 从最近的可信祖先展示到远程尖端的完整变化;没有可信祖先则展示整棵树。 */
function reviewSnapshot(mirror: string, sha: string): void {
    const history = gitOut(["-C", mirror, "rev-list", sha]);

    if (history === undefined) {
        die("读不到远程历史,未签名也未推送");
    }

    const ancestors = history.split("\n").filter((line) => line !== "");
    const base = ancestors.find((commit) => commitIsTrusted(mirror, commit)) ?? EMPTY_TREE;
    const range = base === EMPTY_TREE ? sha : `${base}..${sha}`;
    const commits = gitCapture(["-C", mirror, "log", "--format=%H %s", range]);

    if (!commits.ok) {
        die("无法读取远程提交历史,未签名也未推送");
    }

    // Diff Editor 只展示文件差异;提交清单先在终端给出。
    if (/\S/.test(commits.out)) {
        log.info("待审阅的远程提交:");

        for (const line of commits.out.trimEnd().split("\n")) {
            log.info(`  ${line}`);
        }
    }

    if (reviewWithVsCode(["-C", mirror, base, sha])) {
        return;
    }

    // 无图形环境(如纯 SSH)的兜底:写完整文本 diff 用默认编辑器打开。
    const diff = gitCapture(["-C", mirror, "diff", "--full-index", "--stat", "--patch", "--no-color", base, sha]);

    if (!diff.ok) {
        die("无法生成远程快照审阅 diff,未签名也未推送");
    }

    mkdirSync(paths.stateDir, { recursive: true });
    const reviewFile = `${paths.stateDir}/repair-remote.diff`;
    const origin = base === EMPTY_TREE ? "没有可信祖先;以下 diff 覆盖完整快照" : `可信祖先: ${base}`;
    writeFileSync(reviewFile, `===== 待审阅的远程提交 =====\n${commits.out}\n\n===== ${origin} =====\n${diff.out}`);
    log.info(`完整远程快照 diff 已写入 ${reviewFile}`);
    openInEditor([reviewFile]);
}

export async function executeRepairRemote(commit: string | undefined): Promise<void> {
    if (!isDir(`${paths.mirrorDir}/.git`)) {
        die("未初始化。运行: omarsync init");
    }

    if (!isFullSha(commit)) {
        die("用法: omarsync repair-remote --commit <远程尖端的40位sha>");
    }

    const mirror = paths.mirrorDir;
    const branch = configGet("BRANCH", readTextFile) ?? "main";
    const remoteTip = fetchRemoteTip(mirror, branch);

    if (commit !== remoteTip) {
        die(`指定提交不是当前远程尖端 ${remoteTip};拒绝为旧提交或其他提交签名`);
    }

    if (commitIsTrusted(mirror, commit)) {
        log.info("远程尖端已是可信签名,无需修复");

        return;
    }

    reviewSnapshot(mirror, commit);

    if (!(await confirm("确认你已审阅这份完整远程快照,用本机密钥补签名并推送?"))) {
        die("已取消,未签名也未推送");
    }

    // 审阅可能耗时;只给仍然是同一个远程尖端的同一棵树签名。
    if (fetchRemoteTip(mirror, branch) !== commit) {
        die("审阅期间远程尖端变了,未签名也未推送");
    }

    ensurePushSigner();
    const tree = gitOut(["-C", mirror, "rev-parse", "--verify", `${commit}^{tree}`]);

    if (!isFullSha(tree)) {
        die("读不到已审阅的树,未签名也未推送");
    }

    const signed = gitOut([
        "-C",
        mirror,
        "commit-tree",
        "-S",
        tree,
        "-p",
        commit,
        "-m",
        `trust reviewed remote snapshot from ${hostnameSafe()} @ ${iso8601()}`,
    ]);

    if (!isFullSha(signed) || !commitIsTrusted(mirror, signed)) {
        die("签名提交创建或校验失败,未推送");
    }

    if (
        gitOut(["-C", mirror, "rev-parse", "--verify", `${signed}^{tree}`]) !== tree ||
        gitOut(["-C", mirror, "rev-parse", "--verify", `${signed}^`]) !== commit
    ) {
        die("签名没有覆盖已审阅的远程快照,未推送");
    }

    // 不使用 force:若远程刚刚前进,推送会失败而不是覆盖别人的提交。
    if (!git(["-C", mirror, "push", "--quiet", "origin", `${signed}:refs/heads/${branch}`])) {
        die("git push 失败,远程可能已变化;未覆盖远程");
    }

    fetchRemoteTip(mirror, branch);
    log.info("已为审阅过的远程快照补签名;现在运行 omarsync push 发布本地提交");
    executeStatus(false);
}
