import { isDir } from "../lib/exec";
import { git, gitOut } from "../lib/git";
import { die, readTextFile } from "../lib/log";
import { configGet, paths } from "../lib/paths";
import { isFullSha, trustRemoteSigner } from "../lib/trust";
import { executeStatus } from "./status";

// trust-signer:公钥就在远程提交的 gpgsig 头里,提取 → 验签 → 人工核对指纹 → 写入信任名单。
// 免去跨机器拷贝公钥文件;信任后重新采集 status.json,监听该文件的面板会自动刷出 apply 按钮。

export async function executeTrustSigner(commit: string | undefined, yes: boolean): Promise<void> {
    if (!isDir(`${paths.mirrorDir}/.git`)) {
        die("未初始化。运行: omarsync init");
    }

    if (!isFullSha(commit)) {
        die("用法: omarsync trust-signer --commit <远程尖端的40位sha>");
    }

    const mirror = paths.mirrorDir;
    const branch = configGet("BRANCH", readTextFile) ?? "main";

    if (!git(["-C", mirror, "fetch", "--quiet", "origin", branch])) {
        die("fetch 失败,未修改信任名单");
    }

    const tip = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", `origin/${branch}^{commit}`]);

    // 只信任当前远程尖端:防止面板展示的 sha 过期后误信任一个旧提交
    if (tip !== commit) {
        die(`指定提交不是当前远程尖端 ${tip ?? "?"};拒绝信任旧提交或其他提交`);
    }

    await trustRemoteSigner(mirror, commit, yes);

    // 落盘新的 status.json,面板的 FileView 监听到变化会自动刷新
    executeStatus(false);
}
