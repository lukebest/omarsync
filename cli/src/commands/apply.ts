import { isDir } from "../lib/exec";
import { applyMirror, prepareDotfiles, previewApply, showChanges } from "../lib/apply";
import { die, log, readTextFile } from "../lib/log";
import * as mise from "../lib/mise";
import { configGet, paths } from "../lib/paths";
import {
    acceptFirstApply,
    checkoutPinnedCommit,
    commitIsTrusted,
    firstApplyAvailable,
    isFullSha,
    markApplied,
    requireTrustedCommit,
    resolveRemoteSha,
    trustRemoteSigner,
} from "../lib/trust";
import { confirm } from "../lib/util";

// apply:审阅自上次应用以来的全部更改,人工 y 确认后才写入。
// 信任链:可信签名 → 全量(含插件/hooks);首次应用/force → 仅配置。对应旧版 cmd_apply。

export interface ApplyOptions {
    readonly commit?: string;
    readonly noPackages?: boolean;
    readonly noExec?: boolean;
    readonly trustSigner?: boolean;
    readonly force?: boolean;
}

function requireMirror(): string {
    if (!isDir(`${paths.mirrorDir}/.git`)) {
        die("未初始化。运行: omarsync init");
    }

    return paths.mirrorDir;
}

export async function executeApply(options: ApplyOptions): Promise<void> {
    const expected = options.commit ?? "";

    if (!isFullSha(expected)) {
        die("apply 需要 --commit <40位sha>(你审阅过的那个 commit)");
    }

    const mirror = requireMirror();
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
                // 非交互默认拒绝(未带 --trust-signer 则失败)
            } else if (await confirm(`commit ${sha} 不可信。仍要应用吗?只应用配置;插件与 hooks 保持关闭。`)) {
                force = true;
                log.warn(`强制应用 ${sha};跳过了签名检查`);
            } else {
                // 不走 force:核对指纹后把签名者加入信任名单,本次 apply 即可带插件与 hooks
                await trustRemoteSigner(mirror, sha, options.trustSigner === true);
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

    // 先连上 dotfiles 分支再抓取,让预览反映真实待应用内容。
    // 没跑过 setup 的机器这里才会第一次 origin set。
    if (mise.available() && !prepareDotfiles()) {
        die("mise 抓不到 dotfiles 分支,未应用任何内容");
    }

    // 合并前必须看到更改:元数据 diff(自上次应用以来)+ 文件 dry-run 计划
    showChanges(mirror, sha);
    previewApply(mirror, sha, withExec);

    // 必须人工确认;非交互(无终端)直接拒绝,绝不默认应用
    if (!(await confirm("应用这份快照?"))) {
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
