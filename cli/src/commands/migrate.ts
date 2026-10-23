import { isDir } from "../lib/exec";
import { git, gitCapture, gitOut } from "../lib/git";
import { die, log, readTextFile } from "../lib/log";
import * as mise from "../lib/mise";
import { configGet, paths } from "../lib/paths";
import { readScope, reconcile } from "../lib/scope";
import { commitIsTrusted, isFullSha, requireTrustedRemoteTip } from "../lib/trust";
import { confirm } from "../lib/util";
import { ensureDotfilesRepo } from "./init";

// migrate:老格式迁移——镜像里还有 home/ 目录,或已配置但 mise 未连接。
// 删掉 home/ 并签名推送之前,当前提交必须已经由可信密钥签名,且终端确认过留下的文件。
// 对应旧版 needs_migrate 与 cmd_migrate。

export function needsMigrate(): boolean {
    const mirror = paths.mirrorDir;

    if (!isDir(`${mirror}/.git`)) {
        return false;
    }

    if (isDir(`${mirror}/home`)) {
        return true;
    }

    return configGet("REPO", readTextFile) !== undefined && mise.available() && !mise.originConnected();
}

function treePaths(mirror: string, rev: string): string[] | undefined {
    const listed = gitCapture(["-C", mirror, "ls-tree", "-r", "--name-only", rev]);

    if (!listed.ok) {
        return undefined;
    }

    return listed.out.split("\n").filter((line) => line !== "");
}

function withoutHome(pathsInTree: readonly string[]): string[] {
    return pathsInTree.filter((name) => name !== "home" && !name.startsWith("home/")).sort();
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((name, index) => name === right[index]);
}

function worktreeClean(mirror: string): boolean {
    const status = gitCapture(["-C", mirror, "status", "--porcelain", "--untracked-files=all"]);

    return status.ok && status.out.trim() === "";
}

function onlyHomeRemoved(mirror: string, before: string, after: string): boolean {
    const diff = gitCapture(["-C", mirror, "diff", "--name-only", "--no-renames", before, after]);

    if (!diff.ok) {
        return false;
    }

    const names = diff.out.split("\n").filter((line) => line !== "");

    return names.length > 0 && names.every((name) => name === "home" || name.startsWith("home/"));
}

/** 只签名“已可信的树减去 home/”。来源不可信、没有确认,或结果多出文件,都不推送。 */
async function dropLegacyHome(mirror: string, branch: string): Promise<void> {
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

    if (!(await confirm("签名并发布去掉 home/ 之后的这棵树?"))) {
        die("已取消,未签名也未推送");
    }

    const again = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);
    const againPaths = isFullSha(again) ? treePaths(mirror, again) : undefined;

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
    const after = isFullSha(signed) ? treePaths(mirror, signed) : undefined;

    if (
        parent !== head ||
        !isFullSha(signed) ||
        !commitIsTrusted(mirror, signed) ||
        !after ||
        !samePaths([...after].sort(), kept) ||
        !onlyHomeRemoved(mirror, head, signed)
    ) {
        git(["-C", mirror, "reset", "--hard", head]);
        die("签名没有覆盖已审阅的迁移,未推送");
    }

    if (!git(["-C", mirror, "push", "--quiet", "-u", "origin", `HEAD:${branch}`])) {
        die("git push 失败,迁移提交未发布");
    }

    log.info("已移除旧文件镜像(仍可从 git 历史找回)");
}

export async function executeMigrate(): Promise<void> {
    if (!isDir(`${paths.mirrorDir}/.git`)) {
        die("未初始化。运行: omarsync init");
    }

    const mirror = paths.mirrorDir;
    const branch = configGet("BRANCH", readTextFile) ?? "main";

    log.info("迁移到 mise dot 布局");

    // 1. 建立 dotfiles 仓库并发布当前文件
    ensureDotfilesRepo();

    if (mise.available() && mise.originConnected()) {
        reconcile(readScope(paths.scopeFile));

        if (mise.save() === undefined) {
            die("迁移过程中 mise dot save 失败");
        }

        const { ok, out } = mise.sync(false);

        if (!ok) {
            die(`迁移过程中 mise dot sync 失败: ${out}`);
        }
    } else {
        log.warn("mise dot origin 未连接;dotfiles 未迁移");
    }

    // 2. 元数据仓库移除旧的 home/ 镜像。只签名已经可信、并且刚刚确认过的那棵树。
    await dropLegacyHome(mirror, branch);

    log.info(`迁移完成;旧备份在 ${paths.backupDir},可手动删除`);
}
