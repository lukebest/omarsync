import { mkdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { reviewWithVsCode, vsCodeDiffAvailable } from "../lib/diff-review";
import { openInEditor } from "../lib/editor";
import { isDir, mktempDir, rmrf } from "../lib/exec";
import { git, gitCapture, gitOut } from "../lib/git";
import { die, log, readTextFile } from "../lib/log";
import { collectSelectedInto, exportLocalInto } from "../lib/meta";
import * as mise from "../lib/mise";
import { dotBranch, dotOriginUrl, ensureIdentity, notify } from "../lib/omarchy";
import { executeStatus } from "./status";
import { configGet, paths } from "../lib/paths";
import { ensurePushIgnore, loadPushIgnore } from "../lib/push-ignore";
import { readScope, reconcile } from "../lib/scope";
import {
    assertMiseHead,
    buildSelectedDotfiles,
    fetchRemoteDotfiles,
    importDotfilesCommit,
    pendingExcludeAdds,
    remoteMiseHead,
    selectedPaths,
} from "../lib/selective-push";
import { createPlan, readSelectionFile, writeSelectionFile } from "../lib/selection";
import { ensurePushSigner, isFullSha, preparePushBranch, requireTrustedRemoteTip, signReviewedTip } from "../lib/trust";
import { confirm, hostnameSafe, iso8601, stdinIsTty } from "../lib/util";

// push:对齐 track → 保存本地快照 → 选择要发布的文件/插件/包组 →
// 以远程签名树为 base 构造选择性 dotfiles 树 → 原子推送 metadata + dotfiles。

function requireMirror(): string {
    if (!isDir(`${paths.mirrorDir}/.git`)) {
        die("未初始化。运行: omarsync init");
    }

    return paths.mirrorDir;
}

function remoteHasBranch(mirror: string, branch: string): boolean {
    return gitCapture(["-C", mirror, "ls-remote", "--exit-code", "--heads", "origin", branch]).ok;
}

function headTree(mirror: string): string | undefined {
    return gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
}

/** 暂存区只有 pushedAt 变化时还原元数据,避免每次 push 都制造一个提交。 */
function discardTimestampOnlyChange(mirror: string): void {
    const names = gitOut(["-C", mirror, "diff", "--cached", "--name-only"]);

    if (names !== "omarsync.json") {
        return;
    }

    const parse = (raw: string | undefined): Record<string, unknown> | undefined => {
        if (!raw) {
            return undefined;
        }

        try {
            const data = JSON.parse(raw) as Record<string, unknown>;
            const { pushedAt: _pushedAt, ...content } = data;

            return content;
        } catch {
            return undefined;
        }
    };

    const previous = parse(gitOut(["-C", mirror, "show", "HEAD:omarsync.json"]));
    const staged = parse(gitOut(["-C", mirror, "show", ":omarsync.json"]));

    if (previous && staged && isDeepStrictEqual(previous, staged)) {
        git(["-C", mirror, "restore", "--staged", "--worktree", "--source=HEAD", "--", "omarsync.json"]);
        log.info("仅推送时间变化,未创建新快照");
    }
}

/** 合并结果和已确认的树不同时,自动推送退回;手动推送必须再审一遍才允许签名。 */
async function reviewMergedTree(mirror: string, reviewedCommit: string, reviewedTree: string, skipConfirm: boolean): Promise<string> {
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

        writeFileSync(reviewFile, `===== 合并后的最终 diff =====\n${finalDiff}\n`);

        if (reviewWithVsCode(["-C", mirror, reviewedTree, "HEAD"])) {
            log.info("合并改写了已确认的树,已在 VS Code 左右对比中展示最终 diff");
        } else {
            log.info(`合并改写了已确认的树。最终 diff 已写入 ${reviewFile}`);
            openInEditor([reviewFile]);
        }
    } else {
        log.info("合并改写了已确认的树");
    }

    if (!(await confirm("签名并发布这份合并后的树?"))) {
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

function normalizedRemote(url: string): string {
    return url.replace(/\/+$/, "").replace(/\.git$/, "");
}

/** 用 VS Code 原生左右视图逐个审阅文件;关闭当前标签后继续下一个。 */
function reviewPushDiff(mirror: string, baseTree: string, selectedTree: string, hasMetaChanges: boolean): boolean {
    if (!vsCodeDiffAvailable()) {
        return false;
    }

    log.info("正在用 VS Code 左右对比;关闭当前 diff 标签可继续下一个文件");

    if (hasMetaChanges && !reviewWithVsCode(["-C", mirror, "--cached"])) {
        return false;
    }

    if (baseTree !== selectedTree) {
        return reviewWithVsCode([
            "--git-dir",
            mise.historyRepo(),
            baseTree,
            selectedTree,
            "--",
            "home",
        ]);
    }

    return true;
}

function planHasCandidates(plan: ReturnType<typeof createPlan>): boolean {
    return (
        plan.files.length > 0
        || plan.plugins.length > 0
        || plan.hooks.length > 0
        || plan.packages.length > 0
        || plan.current.candidate
    );
}

function planHasSelection(plan: ReturnType<typeof createPlan>): boolean {
    return (
        plan.files.some((item) => item.selected)
        || plan.plugins.some((item) => item.selected)
        || plan.hooks.some((item) => item.selected)
        || plan.packages.some((item) => item.selected)
        || plan.current.selected
    );
}

function refreshRemoteMain(mirror: string, branch: string): string | undefined {
    if (!remoteHasBranch(mirror, branch)) {
        return undefined;
    }

    if (!git(["-C", mirror, "fetch", "--quiet", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`])) {
        die("fetch 远程 metadata 失败");
    }

    const tip = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", `origin/${branch}`]);

    if (!isFullSha(tip)) {
        die("fetch 后读不到远程 metadata 尖端");
    }

    requireTrustedRemoteTip(mirror, tip);

    return tip;
}

export async function executePush(skipConfirm = false): Promise<void> {
    const mirror = requireMirror();
    const branch = configGet("BRANCH", readTextFile) ?? "main";

    ensurePushSigner();
    ensureIdentity(mirror);

    // 先确定远程基线;选择性发布不做自动 rebase,远程在构建期间前进就直接失败。
    const remoteMain = refreshRemoteMain(mirror, branch);
    const localTip = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);

    if (remoteMain) {
        if (localTip && localTip !== remoteMain) {
            log.warn("丢弃本地未发布的 metadata 镜像,从远程基线重新构造");
        }

        if (!git(["-C", mirror, "reset", "--hard", remoteMain])) {
            die("无法切到远程 metadata 基线");
        }

        // 取消过的 push 可能留下 staged 的 plugins-local;不能带进下一次发布。
        git(["-C", mirror, "clean", "-fd"]);
    }

    preparePushBranch(mirror, branch);

    if (dotOriginUrl() === "") {
        die("dotfiles origin 未配置;先运行 omarsync setup");
    }

    const remoteHead = remoteMain ? remoteMiseHead(mirror) : undefined;
    const dot = fetchRemoteDotfiles(dotOriginUrl(), dotBranch());

    if (remoteMain && remoteHead && dot.tree !== remoteHead) {
        die("远程 dotfiles 尖端与签名 miseHead 不一致;先修复远程再 push");
    }

    if (!remoteMain && dot.commit) {
        die("远程已有 dotfiles 分支但没有签名的 metadata 基线;拒绝自动发布");
    }

    const baseTree = remoteHead ?? dot.tree;

    if (!mise.available()) {
        die("选择性 push 需要 mise;运行: omarchy pkg add mise");
    }

    if (!mise.originConnected()) {
        log.warn("mise dot origin 未连接;本次仍按配置 URL 选择性发布,但 pull/apply 前需要 setup");
    }

    ensurePushIgnore();
    reconcile(readScope(paths.scopeFile));

    const saved = mise.save();

    if (saved === undefined) {
        die("mise dot save 失败");
    }

    if (saved) {
        log.info("mise dot 检查点已保存");
    }

    const localTree = mise.headSnapshot();

    if (!isFullSha(localTree)) {
        die("读取不到本机 mise 快照");
    }

    const localTmp = mktempDir();

    try {
        exportLocalInto(localTmp);

        const ignored = loadPushIgnore();
        const plan = createPlan(mirror, baseTree, localTree, localTmp, ignored);
        const excludeAdds = pendingExcludeAdds(baseTree, localTree, ignored);

        if (excludeAdds.length > 0) {
            log.info(`将发布 ${excludeAdds.length} 条本机 exclude 规则(与远程并集,规避 mise 整字段合并冲突):`);

            for (const glob of excludeAdds) {
                log.info(`  ${glob}`);
            }
        }

        if (!planHasCandidates(plan) && excludeAdds.length === 0) {
            log.info("没有需要推送的变化");
            executeStatus(false);

            return;
        }

        // 默认选择下没有任何可发布项(候选全是 D,即远程有、本机 scope 未跟踪)
        // 且没有 manifest 增量时,不开编辑器:用户没有东西可勾,弹清单只会以错误收场。
        if (!planHasSelection(plan) && excludeAdds.length === 0) {
            log.info("没有需要发布的新增/修改;远程有而本机未跟踪的路径默认保留远程,本次不推送");
            executeStatus(false);

            return;
        }

        if (!skipConfirm && stdinIsTty() && planHasCandidates(plan)) {
            const selectionFile = writeSelectionFile(plan);

            log.info(`选择清单已写入 ${selectionFile}`);
            openInEditor([selectionFile]);

            if (!(await confirm("选择完成并继续?"))) {
                die("已取消,未推送");
            }

            readSelectionFile(plan);

            if (!planHasSelection(plan) && excludeAdds.length === 0) {
                die("没有勾选任何内容,已取消");
            }
        } else if (!planHasSelection(plan) && excludeAdds.length === 0) {
            log.info("没有需要发布的变化(删除项默认不选)");
            executeStatus(false);

            return;
        }

        const { writes, deletes } = selectedPaths(plan);
        const built = buildSelectedDotfiles(dot, localTree, writes, deletes, ignored);

        collectSelectedInto(mirror, built.tree, plan, localTmp);
        git(["-C", mirror, "add", "-A"]);
        discardTimestampOnlyChange(mirror);

        const metaStat = gitCapture(["-C", mirror, "diff", "--cached", "--stat"]).out;
        const metaDiff = gitCapture(["-C", mirror, "diff", "--cached", "--color=never"]).out;
        const fileDiff = built.tree === baseTree ? "" : mise.snapshotDiff(baseTree, built.tree);
        let review = "";

        if (/\S/.test(metaDiff)) {
            review += `===== 元数据 diff(omarchy-config)=====\n${metaDiff}\n`;
        }

        if (/\S/.test(fileDiff)) {
            review += `===== 文件 diff(dotfiles 分支)=====\n${fileDiff}\n`;
        }

        if (review !== "") {
            mkdirSync(paths.stateDir, { recursive: true });
            const reviewFile = `${paths.stateDir}/pending-push.diff`;

            writeFileSync(reviewFile, review);
            log.info(`完整 diff 已写入 ${reviewFile}`);

            if (!skipConfirm && !reviewPushDiff(mirror, baseTree, built.tree, /\S/.test(metaDiff))) {
                openInEditor([reviewFile]);
            }
        }

        if (/\S/.test(metaStat)) {
            log.info("元数据变化:");

            for (const line of metaStat.split("\n")) {
                log.info(`  ${line}`);
            }
        }

        if (!skipConfirm && !(await confirm("发布这份选择后的快照到远程仓库?"))) {
            die("已取消,未推送");
        }

        const hasMetaChanges = !gitCapture(["-C", mirror, "diff", "--cached", "--quiet"]).ok;

        if (!built.commit && built.tree === baseTree && !hasMetaChanges) {
            log.info("没有实际变化,未推送");
            executeStatus(false);

            return;
        }

        if (hasMetaChanges) {
            if (!git(["-C", mirror, "commit", "-S", "-m", `sync selected from ${hostnameSafe()} @ ${iso8601()}`])) {
                die("本地提交签名失败,未推送");
            }
        } else {
            log.info("没有新的元数据变化;只发布已构造的 dotfiles 提交");
        }

        const reviewedCommit = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
        const reviewedTree = headTree(mirror);

        if (!reviewedCommit || !reviewedTree) {
            die("无法读取已审阅的提交");
        }

        // 选择发布不做 rebase;远程必须在确认后仍是同一个基线。
        const currentMain = refreshRemoteMain(mirror, branch);

        if (remoteMain !== currentMain) {
            die("远程 metadata 在审阅期间变化;请重新运行 push");
        }

        const currentDot = fetchRemoteDotfiles(dotOriginUrl(), dotBranch());

        if (currentDot.commit !== dot.commit || currentDot.tree !== dot.tree) {
            die("远程 dotfiles 在审阅期间变化;请重新运行 push");
        }

        const treeToSign = await reviewMergedTree(mirror, reviewedCommit, reviewedTree, skipConfirm);

        signReviewedTip(mirror, treeToSign);
        assertMiseHead(mirror, built.tree);

        if (built.commit) {
            if (!importDotfilesCommit(mirror, built.commit)) {
                die("无法把 dotfiles 提交导入 metadata 镜像");
            }
        }

        const mirrorUrl = gitOut(["-C", mirror, "remote", "get-url", "origin"]) ?? "";

        if (built.commit && normalizedRemote(mirrorUrl) !== normalizedRemote(dotOriginUrl())) {
            die("选择性 push 目前要求 metadata 与 dotfiles 在同一个远程仓库");
        }

        const pushArgs = ["-C", mirror, "push", "--quiet", "--atomic"];

        if (remoteMain) {
            pushArgs.push(`--force-with-lease=refs/heads/${branch}:${remoteMain}`);
        }

        if (dot.commit) {
            pushArgs.push(`--force-with-lease=refs/heads/${dotBranch()}:${dot.commit}`);
        }

        pushArgs.push("origin", `HEAD:${branch}`);

        if (built.commit) {
            pushArgs.push(`refs/omarsync/dotfiles-publish:refs/heads/${dotBranch()}`);
        }

        if (!git(pushArgs)) {
            die("atomic push 失败;远程未改变");
        }

        log.info(`已原子推送 ${branch}${built.commit ? ` 和 ${dotBranch()}` : ""}`);

        if (!mise.originConnected()) {
            const connected = mise.connect(dotOriginUrl(), dotBranch());

            if (connected.ok) {
                log.info(`已连接 mise dot origin 分支 ${dotBranch()}`);
            } else {
                log.warn("dotfiles 已发布,但 mise origin 仍未连接;重新运行 setup 即可");
            }
        }

        notify("omarsync", `已推送 ${configGet("REPO", readTextFile) ?? ""}`);
        executeStatus(false);
    } finally {
        rmrf(localTmp);
    }
}
