import { isDir } from "../lib/exec";
import { ghInstalled, ghLoggedIn } from "../lib/gh";
import { git, gitOut } from "../lib/git";
import { die, log, readTextFile } from "../lib/log";
import * as mise from "../lib/mise";
import { omarchy } from "../lib/omarchy";
import { configGet, paths } from "../lib/paths";
import { ensurePushIgnore } from "../lib/push-ignore";
import { stdinIsTty } from "../lib/util";
import { ensureDotfilesRepo, executeInit } from "./init";
import { executeLogin } from "./login";
import { executeStatus } from "./status";

// setup:一键装机引导——装依赖、登录 GitHub、初始化,最后提示 push 还是 apply。
// 对应旧版 cmd_setup。

export function executeSetup(): void {
    if (!stdinIsTty()) {
        die("setup 需要终端。运行: omarsync setup");
    }

    if (!mise.available()) {
        log.info("安装 mise");

        if (!omarchy(["pkg", "add", "mise"])) {
            die("安装 mise 失败");
        }
    }

    if (!ghInstalled()) {
        log.info("安装 GitHub CLI");

        if (!omarchy(["pkg", "add", "github-cli"])) {
            die("安装 github-cli 失败");
        }
    }

    if (!ghLoggedIn()) {
        executeLogin();
    }

    ensurePushIgnore();

    if (!isDir(`${paths.mirrorDir}/.git`)) {
        executeInit(undefined);
    } else {
        ensureDotfilesRepo();
    }

    // 未登录时 init 可能建了空镜像;登录后必须重新 fetch 才能看到远程已有提交。
    const branch = configGet("BRANCH", readTextFile) ?? "main";

    if (isDir(`${paths.mirrorDir}/.git`) && !git(["-C", paths.mirrorDir, "fetch", "--quiet", "origin", branch])) {
        log.warn(`无法刷新远程分支 ${branch};当前提示可能仍是旧状态`);
    }

    // 空仓库 rev-parse 会失败,这里只探测不致命
    const sha = gitOut(["-C", paths.mirrorDir, "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}^{commit}`]);

    if (sha) {
        log.info(`仓库已有 commit ${sha}`);
        log.info("打开面板选择 apply(先审阅再应用)");
    } else {
        log.info("仓库是空的");
        log.info("打开面板选择 push");
    }

    // setup 在独立终端里运行,面板收不到进程退出回调;回写状态文件触发 FileView 刷新。
    executeStatus(false);
}
