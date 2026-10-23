import { isDir } from "../lib/exec";
import { die, log } from "../lib/log";
import * as mise from "../lib/mise";
import { configGet, paths } from "../lib/paths";
import { readTextFile } from "../lib/log";
import { checkoutPinnedCommit, requireTrustedRemoteTip, resolveRemoteSha } from "../lib/trust";

// pull:只抓取,一个字节都不写进活配置。
// 远程尖端必须先通过和 push 相同的可信密钥门,才 detached 钉住;
// 未签名或别的密钥签的提交留在远程跟踪引用上,不进入工作区。
// 下一步是 apply 的"先审阅再应用"。对应旧版 cmd_pull。

function requireMirror(): string {
    if (!isDir(`${paths.mirrorDir}/.git`)) {
        die("未初始化。运行: omarsync init");
    }

    return paths.mirrorDir;
}

export function executePull(): void {
    const mirror = requireMirror();
    const branch = configGet("BRANCH", readTextFile) ?? "main";

    const sha = resolveRemoteSha(mirror, branch);

    // 不可信的元数据不能成为镜像里的当前树。migrate 会删掉 home/ 再签名,
    // 工作区里多出来的 post-apply 钩子会因此变成可信快照。
    requireTrustedRemoteTip(mirror, sha);

    checkoutPinnedCommit(mirror, sha);

    if (mise.available()) {
        mise.sync(true); // 只抓取,不写活文件
    }

    log.info(`已钉住 ${sha}`);
    log.info("下一步: omarsync apply --commit " + sha + "(会先展示更改再请你确认)");
}
