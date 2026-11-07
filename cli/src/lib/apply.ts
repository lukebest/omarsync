import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

import { reviewWithVsCode } from "./diff-review";
import { openInEditor } from "./editor";
import { capture, exists, isDir, isFile, isLink, mktempDir, realpath, resolveTool, rmrf } from "./exec";
import { gitCapture, gitOut } from "./git";
import { refreshUserServices, listHooks, runHooks } from "./hooks";
import { die, log, readTextFile } from "./log";
import * as mise from "./mise";
import { omarchy, omarchyShell, rsync, BACKUP_KEEP, dotBranch, dotOriginUrl } from "./omarchy";
import { installMissingPackages } from "./packages";
import { paths } from "./paths";
import { installMissingPlugins } from "./plugins";
import { removeRemoteIgnoredPaths, restoreIgnoredPaths, stashIgnoredPaths } from "./ignored-files";
import { readScope } from "./scope";
import { appliedStampFile, isFullSha } from "./trust";

// apply 编排:备份 → mise dot pull(文件)→ 主题/壁纸 → 包/插件/hooks。
// 文件的写入由 mise 负责(自带保护检查点与 undo);这里保留本机备份作为第二道保险。
// 1:1 移植自 src/apply.lua。

const HOME = homedir();

export function pruneBackups(): void {
    const root = paths.backupDir;

    if (!isDir(root)) {
        return;
    }

    const names = readdirSync(root).sort();

    for (const name of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
        rmrf(`${root}/${name}`);
    }
}

/** 按 scope 备份 $HOME 的现有文件(在 mise pull 覆盖之前) */
export function backupTree(): string {
    const date = resolveTool("date");
    const stamp = (date ? capture(date, ["+%Y%m%d-%H%M%S"]).stdout.trim() : "") || "unknown";
    const dest = `${paths.backupDir}/${stamp}`;

    for (const entry of readScope(paths.scopeFile)) {
        const src = `${HOME}/${entry.rel}`;

        if (exists(src) || isLink(src)) {
            const parent = `${dest}/home/${dirname(entry.rel)}`;

            mkdirSync(parent, { recursive: true });
            rsync(["-a", src, `${parent}/`]);
        }
    }

    const state = `${HOME}/.local/state/omarchy/current`;

    if (isDir(state)) {
        mkdirSync(`${dest}/current`, { recursive: true });

        const theme = readTextFile(`${state}/theme.name`);

        if (theme) {
            writeFileSync(`${dest}/current/theme.name`, theme);
        }

        const bg = `${state}/background`;

        if (isLink(bg) || exists(bg)) {
            const target = realpath(bg);

            if (target) {
                writeFileSync(`${dest}/current/background.path`, `${target}\n`);
            }
        }
    }

    return dest;
}

/** 壁纸记录里的路径都相对于主题、共享背景目录或远端绝对路径。
 *  `abs:` 可能来自另一台机器;主机名不同的绝对路径优先回退到当前主题里的同名文件。 */
function themeBackgroundCandidates(theme: string, rel: string): string[] {
    if (theme === "") {
        return [];
    }

    return [
        `${HOME}/.local/state/omarchy/current/theme/${rel}`,
        `${HOME}/.config/omarchy/themes/${theme}/${rel}`,
        `${process.env["OMARCHY_PATH"] ?? "/usr/share/omarchy"}/themes/${theme}/${rel}`,
    ];
}

/** 从外部机器的绝对路径里提取主题内相对路径,例如 backgrounds/1.jpg */
function foreignThemeRelative(path: string): string | undefined {
    for (const marker of ["/.local/state/omarchy/current/theme/", "/.local/share/omarchy/themes/"]) {
        const index = path.indexOf(marker);

        if (index !== -1) {
            const rest = path.slice(index + marker.length);
            const slash = rest.indexOf("/");

            // current/theme 后面的整段就是主题相对路径;
            // themes/<name>/ 要跳过第一段主题名。
            return marker.includes("/current/theme/") ? rest : (slash === -1 ? undefined : rest.slice(slash + 1));
        }
    }

    return undefined;
}

/** 按记录解析壁纸路径;优先使用本机存在的文件,失败时返回首个候选供日志展示 */
function resolveBackgroundTarget(theme: string, background: string): string {
    const candidates: string[] = [];

    if (background.startsWith("rel:")) {
        candidates.push(`${HOME}/.config/omarchy/backgrounds/${background.slice(5)}`);
    } else if (background.startsWith("theme:")) {
        candidates.push(...themeBackgroundCandidates(theme, background.slice(6)));
    } else if (background.startsWith("abs:")) {
        const absolute = background.slice(4);

        candidates.push(absolute);

        const rel = foreignThemeRelative(absolute);

        if (rel !== undefined && !isFile(absolute)) {
            candidates.push(...themeBackgroundCandidates(theme, rel));
        }
    }

    return candidates.find((path) => isFile(path)) ?? candidates[0] ?? "";
}

/** 应用主题与壁纸(在线模式调用 omarchy;OMARSYNC_SKIP_LIVE=1 时只写状态文件)。
 *  在线的 `omarchy theme set` 会跑 ~/.config/omarchy/hooks,所以不可信的 apply 跳过它。 */
export function applyCurrent(mirror: string, withExec: boolean): boolean {
    const theme = (readTextFile(`${mirror}/current/theme.name`) ?? "").replaceAll(/\s+/g, "");
    const background = (readTextFile(`${mirror}/current/background`) ?? "").replaceAll(/\s+/g, "");

    const state = `${HOME}/.local/state/omarchy/current`;

    if (process.env["OMARSYNC_SKIP_LIVE"] === "1") {
        mkdirSync(state, { recursive: true });

        if (theme !== "") {
            writeFileSync(`${state}/theme.name`, `${theme}\n`);
        }

        const target = resolveBackgroundTarget(theme, background);

        if (target !== "" && isFile(target)) {
            rmrf(`${state}/background`);
            symlinkSync(target, `${state}/background`);
        }

        return true;
    }

    if (!withExec) {
        if (theme !== "" || background !== "") {
            log.info("已跳过主题切换;可执行内容恢复需要可信签名");
        }

        return true;
    }

    let failed = false;

    if (theme !== "") {
        log.info(`设置主题 ${theme}`);

        if (!omarchy(["theme", "set", theme])) {
            log.warn(`设置主题 ${theme} 失败`);
            failed = true;
        }
    }

    // 主题设置会重建 current/theme,所以壁纸必须在这之后解析。
    if (background !== "") {
        const target = resolveBackgroundTarget(theme, background);

        if (target !== "" && exists(target)) {
            log.info(`设置壁纸 ${target}`);

            if (!omarchy(["theme", "bg", "set", target])) {
                log.warn("设置壁纸失败");
                failed = true;
            }
        } else {
            log.warn(`壁纸文件不存在,保留当前壁纸: ${target}`);
        }
    }

    return !failed;
}

/** 清洗后的进程不携带 HYPRLAND_INSTANCE_SIGNATURE;从 /run/user/<uid>/hypr 下唯一的会话目录推导 */
function hyprInstanceSignature(): string | undefined {
    const runtime = process.env["XDG_RUNTIME_DIR"] ?? "";

    if (!/^\/run\/user\/\d+/.test(runtime) || !isDir(`${runtime}/hypr`)) {
        return undefined;
    }

    const found: string[] = [];

    for (const name of readdirSync(`${runtime}/hypr`)) {
        if (
            /^[0-9a-f]+_[0-9]+_[0-9]+$/.test(name) &&
            isDir(`${runtime}/hypr/${name}`) &&
            isFile(`${runtime}/hypr/${name}/hyprland.lock`)
        ) {
            found.push(name);
        }
    }

    return found.length === 1 ? found[0] : undefined;
}

export function reloadDesktop(): void {
    if (process.env["OMARSYNC_SKIP_LIVE"] === "1") {
        return;
    }

    if (resolveTool("omarchy-shell")) {
        if (!omarchyShell(["shell", "reloadConfig"])) {
            log.warn("shell reload 失败");
        }
    }

    const hyprctl = resolveTool("hyprctl");

    if (!hyprctl) {
        return;
    }

    const sig = hyprInstanceSignature();

    if (!sig) {
        log.warn("跳过 hyprctl reload;这个用户没有唯一的 Hyprland 会话");

        return;
    }

    const result = capture(hyprctl, ["reload"], [
        `XDG_RUNTIME_DIR=${process.env["XDG_RUNTIME_DIR"] ?? ""}`,
        `HYPRLAND_INSTANCE_SIGNATURE=${sig}`,
    ]);

    if (result.code !== 0) {
        log.warn("hyprctl reload 失败");
    }
}

export function assertPinned(mirror: string, sha: string): void {
    if (!isFullSha(sha)) {
        die("拒绝激活未钉住的版本");
    }

    const head = gitOut(["-C", mirror, "rev-parse", "--verify", "HEAD"]);

    if (head !== sha) {
        die(`镜像 HEAD ${head ?? "?"} 不是审阅过的 commit ${sha}`);
    }

    if (gitCapture(["-C", mirror, "symbolic-ref", "-q", "HEAD"]).ok) {
        die("镜像挂在分支上,拒绝应用");
    }
}

const HOOKS_REL = ".config/omarchy/hooks";

/** 不可信的 apply 不能把快照里的 Omarchy hooks 落到磁盘。先拷走本机原样,pull 之后放回去。 */
function stashOmarchyHooks(): { tmp: string; existed: boolean } {
    const src = `${HOME}/${HOOKS_REL}`;
    const existed = exists(src) || isLink(src);
    const tmp = mktempDir();

    if (existed && !rsync(["-a", src, `${tmp}/`])) {
        die("无法在不可信的 apply 之前保留 ~/.config/omarchy/hooks");
    }

    return { tmp, existed };
}

function restoreOmarchyHooks(stash: { tmp: string; existed: boolean }): void {
    const dst = `${HOME}/${HOOKS_REL}`;

    rmrf(dst);

    if (stash.existed && stash.tmp !== "") {
        const saved = `${stash.tmp}/hooks`;

        if (exists(saved) || isLink(saved)) {
            mkdirSync(`${HOME}/.config/omarchy`, { recursive: true });
            rsync(["-a", saved, `${HOME}/.config/omarchy/`]);
        }
    }

    if (stash.tmp !== "") {
        rmrf(stash.tmp);
    }

    log.info("已跳过 Omarchy hooks,保留本机原样");
}

/** 另一台机器往往还没跑过 setup,mise 没有 origin。先连上再抓取。连接用 manual,不在这里发布本机历史。 */
export function prepareDotfiles(): boolean {
    if (!mise.available()) {
        log.warn("mise 未安装;跳过 dotfiles。运行: omarchy pkg add mise");

        return false;
    }

    const url = dotOriginUrl();
    const branch = dotBranch();
    const already = mise.originMatches(url, branch);
    const connected = mise.connect(url, branch);

    if (!connected.ok) {
        log.warn(`无法连接 mise dot origin ${url === "" ? "(未配置)" : url}`);

        if (connected.out.trim() !== "") {
            log.warn(connected.out);
        }

        return false;
    }

    if (!already) {
        log.info(`已连接 mise dot origin ${url} 分支 ${branch}`);
    }

    const fetch = mise.sync(true);

    if (!fetch.ok) {
        log.warn(`mise fetch 失败: ${fetch.out}`);

        return false;
    }

    return true;
}

/** 签名提交记录的文件树。不是分支尖端。 */
function signedMiseHead(mirror: string): string | undefined {
    const raw = readTextFile(`${mirror}/omarsync.json`);

    if (!raw) {
        return undefined;
    }

    try {
        const data = JSON.parse(raw) as { miseHead?: unknown };
        const head = typeof data.miseHead === "string" ? data.miseHead : undefined;

        return isFullSha(head) ? head : undefined;
    } catch {
        return undefined;
    }
}

/**
 * 文件同步钉在签名的 miseHead 上。
 * dotfiles 分支谁都能推,不能拿它的尖端覆盖文件后再跑 omarchy theme set。
 */
export function syncDotfiles(mirror: string): boolean {
    if (!prepareDotfiles()) {
        return false;
    }

    const snapshot = signedMiseHead(mirror);

    if (!snapshot) {
        log.warn("签名提交没有 miseHead;拒绝应用可变的 dotfiles 分支");

        return false;
    }

    let commit = mise.commitForSnapshot(snapshot);

    if (!commit) {
        log.warn(`已抓取的历史里没有签名的 miseHead ${snapshot};拒绝应用分支尖端`);

        return false;
    }

    // fetch 只会把远程提交放进 Git 对象库;mise 的 rollback 只认已导入索引的 checkpoint。
    // 仅当远程尖端与签名快照是同一棵树时,才采用远程版本完成导入,避免写入可变尖端。
    if (!mise.checkpointIndexed(commit)) {
        const upstream = mise.upstreamSnapshot();

        if (upstream !== snapshot) {
            log.warn("远程 dotfiles 尖端与签名快照不一致;拒绝导入可变的远端版本");

            return false;
        }

        log.info("签名快照尚未导入 mise 历史;采用远程版本并解决本机冲突");

        const pulled = mise.pull({ takeRemoteAll: true });

        if (!pulled.ok) {
            log.warn(`mise pull 导入快照失败: ${pulled.out}`);

            return false;
        }

        commit = mise.commitForSnapshot(snapshot);

        if (!commit || !mise.checkpointIndexed(commit)) {
            log.warn(`mise pull 后仍找不到 checkpoint ${snapshot}`);

            return false;
        }
    }

    log.info(`按签名的 miseHead ${snapshot} 恢复文件`);

    const rolled = mise.rollbackTo(commit);

    if (!rolled.ok) {
        log.warn(`mise rollback 失败: ${rolled.out}`);

        return false;
    }

    return true;
}

export function applyMirror(mirror: string, withPackages: boolean, sha: string, withExec: boolean): boolean {
    assertPinned(mirror, sha);
    log.info(`激活 commit ${sha}`);

    const backup = backupTree();

    log.info(`已备份现有文件到 ${backup}`);

    let failed = false;
    const hooksStash = withExec ? undefined : stashOmarchyHooks();
    const ignoredStash = stashIgnoredPaths();
    let filesOk = false;

    try {
        filesOk = syncDotfiles(mirror);

        if (filesOk) {
            const snapshot = signedMiseHead(mirror);

            if (snapshot) {
                removeRemoteIgnoredPaths(ignoredStash, snapshot);
            }
        }
    } finally {
        restoreIgnoredPaths(ignoredStash);
    }

    if (!filesOk) {
        failed = true;
    }

    if (hooksStash) {
        restoreOmarchyHooks(hooksStash);
    }

    if (filesOk) {
        if (!applyCurrent(mirror, withExec)) {
            failed = true;
        }
    } else {
        log.info("已跳过主题切换;文件没有对上签名的 miseHead");
    }

    reloadDesktop();

    if (withPackages) {
        if (!installMissingPackages(mirror)) {
            failed = true;
        }
    } else {
        log.info("跳过官方包安装");
    }

    if (!installMissingPlugins(mirror, withExec)) {
        failed = true;
    }

    if (withExec) {
        if (!refreshUserServices()) {
            failed = true;
        }
    } else {
        log.info("已跳过用户服务启动");
    }

    if (!runHooks(mirror, withExec)) {
        failed = true;
    }

    assertPinned(mirror, sha);
    pruneBackups();

    return !failed;
}

/** 合并前审查:显示自上次应用以来元数据仓库里的全部更改(只读) */
export function showChanges(mirror: string, sha: string): void {
    const applied = (readTextFile(appliedStampFile()) ?? "").trim();

    if (!isFullSha(applied)) {
        log.info("没有应用过的 commit;这份快照将整体应用");

        return;
    }

    if (applied === sha) {
        log.info("这台机器已经应用过这个 commit");

        return;
    }

    if (!gitCapture(["-C", mirror, "cat-file", "-e", `${applied}^{commit}`]).ok) {
        log.info(`上次应用的 commit ${applied} 不在镜像里;无法 diff`);

        return;
    }

    log.info(`自上次应用的 commit ${applied.slice(0, 12)} 以来的更改:`);

    const logOut = gitOut(["-C", mirror, "log", "--oneline", "--no-decorate", `${applied}..${sha}`]);

    if (logOut && /\S/.test(logOut)) {
        for (const line of logOut.split("\n")) {
            log.info(`  commit ${line}`);
        }
    }

    const stat = gitOut(["-C", mirror, "diff", "--stat", applied, sha]);

    if (stat && /\S/.test(stat)) {
        for (const line of stat.split("\n")) {
            log.info(`  ${line}`);
        }
    } else {
        log.info("  (元数据无变化)");
    }

    // 关键文本文件给出完整 diff,必须能逐行看到改了什么。
    const reviewFiles = ["plugins.json", "packages/pacman.txt", "packages/flatpak.txt", "current/theme.name", "current/background"];
    let review = "";

    for (const file of reviewFiles) {
        const d = gitOut(["-C", mirror, "diff", "--color=never", applied, sha, "--", file]);

        if (d && /\S/.test(d)) {
            process.stdout.write(`${d}\n`);
            review += `${d}\n`;
        }
    }

    if (review !== "") {
        // 优先 VS Code 左右 Diff Editor;无图形环境(如纯 SSH)再回退文本 diff。
        if (reviewWithVsCode(["-C", mirror, applied, sha, "--", ...reviewFiles])) {
            return;
        }

        const reviewFile = `${paths.stateDir}/pending-apply.diff`;

        writeFileSync(reviewFile, `自 ${applied} 到 ${sha} 的元数据更改\n\n${review}`);
        log.info(`完整 diff 已写入 ${reviewFile}`);
        openInEditor([reviewFile]);
    }
}

export function previewApply(mirror: string, sha: string, withExec: boolean): void {
    log.info(`commit ${sha}`);
    log.info("文件(mise dot 跟踪):");

    for (const entry of readScope(paths.scopeFile)) {
        log.info(`  ${entry.rel}`);
    }

    const snapshot = signedMiseHead(mirror);
    const pinned = snapshot ? mise.commitForSnapshot(snapshot) : undefined;

    if (pinned && snapshot) {
        log.info(`文件将恢复到签名的 miseHead ${snapshot}`);

        const { out } = mise.rollbackTo(pinned, true);

        if (/\S/.test(out)) {
            for (const line of out.split("\n")) {
                log.info(`  ${line}`);
            }
        }
    } else {
        log.info("没有签名的 miseHead;不会应用 dotfiles 分支");
    }

    const pac = readTextFile(`${mirror}/packages/pacman.txt`);

    if (pac) {
        const n = pac.split("\n").filter((line) => line.trim() !== "").length;

        log.info(`官方包清单: ${n} 个`);
    }

    const fp = readTextFile(`${mirror}/packages/flatpak.txt`);

    if (fp) {
        log.info("flatpak:");

        for (const line of fp.split("\n")) {
            const app = /^([^\t]+)/.exec(line)?.[1];

            if (app && app !== "") {
                log.info(`  ${app}`);
            }
        }
    }

    const pj = readTextFile(`${mirror}/plugins.json`);

    if (pj) {
        try {
            const data = JSON.parse(pj) as Record<string, unknown>[];

            if (Array.isArray(data)) {
                log.info("插件:");

                for (const row of data) {
                    const note =
                        row["local"] === true ? "(本地快照)" : typeof row["commit"] === "string" ? row["commit"] : "";

                    log.info(`  ${String(row["id"])} ${note}`);
                }
            }
        } catch {
            // 预览阶段不致命
        }
    }

    for (const name of listHooks(mirror)) {
        log.info(`hook ${name}`);
    }

    if (!withExec) {
        log.info("插件与 hooks 不会执行");
        log.info("主题切换和 Omarchy hooks 会被跳过");
    }
}
