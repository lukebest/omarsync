import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

import { capture, isDir, isFile, mktempDir, resolveTool, rmrf } from "./exec";
import { git, gitOut } from "./git";
import { die, log, readTextFile } from "./log";
import { MAX_FILE_SIZE, omarchy, omarchyShell, PLUGIN_ID, rsync } from "./omarchy";
import { paths } from "./paths";
import { loadPushIgnore } from "./push-ignore";
import { isFullSha } from "./trust";

// 第三方 Omarchy shell 插件的导出与安装。1:1 移植自 src/plugins.lua。
// https 插件按 commit 钉住;无远程的插件整体复制进快照(符号链接被剥掉)。

const HOME = homedir();

function pluginDir(id: string): string {
    return `${HOME}/.config/omarchy/plugins/${id}`;
}

function validPluginId(id: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !id.includes("..") && !id.startsWith("omarchy.");
}

function httpsPluginUrl(url: string): boolean {
    return !url.includes("..") && /^https:\/\/[A-Za-z0-9._~:/?#%+-]+$/.test(url);
}

function localPluginUrl(url: string): boolean {
    return url.startsWith("file:///") && !url.includes("..") && !url.includes("\n");
}

/** 本机排除名单:一行一个插件 id(# 为注释)。名单里的插件不导出也不安装 */
export function skipSet(): Set<string> {
    const set = new Set<string>();

    for (const line of (readTextFile(paths.pluginsSkipFile) ?? "").split("\n")) {
        const id = line.trim();

        if (id !== "" && !id.startsWith("#")) {
            set.add(id);
        }
    }

    for (const id of loadPushIgnore().plugins) {
        set.add(id);
    }

    return set;
}

interface PluginRow {
    id?: unknown;
    enabled?: unknown;
    firstParty?: unknown;
}

/** 读取 omarchy plugin list --json;失败返回 undefined */
function listPlugins(): PluginRow[] | undefined {
    const bin = resolveTool("omarchy");

    if (!bin) {
        return undefined;
    }

    const result = capture(bin, ["plugin", "list", "--json"]);

    if (result.code !== 0) {
        return undefined;
    }

    try {
        const data = JSON.parse(result.stdout) as unknown;

        return Array.isArray(data) ? (data as PluginRow[]) : undefined;
    } catch {
        return undefined;
    }
}

interface PluginRecord {
    id: string;
    url: string;
    commit: string;
    enabled: boolean;
    local: boolean;
}

/** mode "apply" 写快照;"check" 只探测(清单不可用时返回 false,不动现有快照) */
export function exportPlugins(dest: string, mode: "apply" | "check"): boolean {
    const listing = listPlugins();

    if (!listing) {
        if (mode === "check") {
            return false;
        }

        if (isFile(`${dest}/plugins.json`)) {
            log.warn("插件清单不可用;保留现有 plugins.json");

            return true;
        }

        writeFileSync(`${dest}/plugins.json`, "[]\n");
        log.warn("插件清单不可用;写入了空的 plugins.json");

        return true;
    }

    if (mode === "apply") {
        rmrf(`${dest}/plugins-local`);
    }

    const skip = skipSet();
    const records: PluginRecord[] = [];

    for (const row of listing) {
        if (row.firstParty === true || typeof row.id !== "string") {
            continue;
        }

        const id = row.id;

        if (skip.has(id)) {
            log.info(`插件 ${id} 在 plugins-skip 里;不导出`);
            continue;
        }

        if (!validPluginId(id) || id === PLUGIN_ID) {
            continue;
        }

        const enabled = row.enabled === true;
        const dir = pluginDir(id);
        let url: string | undefined;
        let rev: string | undefined;

        if (isDir(`${dir}/.git`)) {
            url = gitOut(["-C", dir, "remote", "get-url", "origin"]);
            rev = gitOut(["-C", dir, "rev-parse", "--verify", "HEAD"]);

            if (!isFullSha(rev)) {
                rev = undefined;
            }
        }

        if (url && httpsPluginUrl(url) && rev) {
            records.push({ id, url, commit: rev, enabled, local: false });
        } else if (isDir(dir)) {
            // check 与 apply 都要记录本地插件。check 写到临时目录;
            // 漏记的话,每次 status 都会把镜像看成脏的,状态栏一直提示 push。
            copyLocalPlugin(dir, `${dest}/plugins-local/${id}`);
            records.push({ id, url: "", commit: "", enabled, local: true });
        }
    }

    // 按 id 排序,保证输出稳定
    records.sort((a, b) => (a.id < b.id ? -1 : 1));
    writeFileSync(`${dest}/plugins.json`, `${JSON.stringify(records, undefined, 2)}\n`);

    return true;
}

export function copyLocalPlugin(src: string, dest: string): void {
    mkdirSync(dest, { recursive: true });
    rsync([
        "-a",
        "--delete",
        `--max-size=${MAX_FILE_SIZE}`,
        "--exclude",
        ".git/",
        "--exclude",
        "node_modules/",
        // 解释器缓存是机器生成的,每次跑都变,同步只会制造噪音
        "--exclude",
        "__pycache__/",
        "--exclude",
        "*.pyc",
        `${src}/`,
        `${dest}/`,
    ]);

    // 剥掉快照里的所有符号链接(插件目录不允许符号链接)
    const find = resolveTool("find");
    const out = find ? capture(find, [dest, "-type", "l", "-print"]).stdout : "";

    for (const line of out.split("\n")) {
        if (line !== "") {
            try {
                unlinkSync(line);
                log.warn(`从插件快照移除符号链接: ${line.slice(dest.length + 1)}`);
            } catch {
                // 忽略
            }
        }
    }
}

export function installMissingPlugins(mirror: string, allowExec: boolean): boolean {
    const file = `${mirror}/plugins.json`;

    if (!isFile(file)) {
        return true;
    }

    if (!allowExec) {
        log.warn("跳过插件安装;可执行内容恢复需要可信签名");

        return true;
    }

    let data: unknown;

    try {
        data = JSON.parse(readTextFile(file) ?? "[]");
    } catch {
        die("plugins.json 不是合法 JSON");
    }

    if (!Array.isArray(data)) {
        die("plugins.json 必须是数组");
    }

    const skip = skipSet();
    const currentEnabled = new Set(
        (listPlugins() ?? []).filter((row) => row.enabled === true && typeof row.id === "string").map((row) => row.id as string),
    );
    const toEnable = new Set<string>();
    let failed = false;
    let installedAny = false;

    for (const row of data as Record<string, unknown>[]) {
        const id = typeof row["id"] === "string" ? row["id"] : "";
        const url = typeof row["url"] === "string" ? row["url"] : "";
        const rev = typeof row["commit"] === "string" ? row["commit"] : "";
        const enabled = row["enabled"] === true;

        if (!validPluginId(id)) {
            log.warn("跳过 id 非法的插件");
            continue;
        }

        if (id === PLUGIN_ID) {
            continue;
        }

        if (skip.has(id)) {
            log.info(`插件 ${id} 在 plugins-skip 里;不安装`);
            continue;
        }

        const dest = pluginDir(id);

        if (isDir(dest)) {
            if (rev !== "" && isDir(`${dest}/.git`)) {
                const head = gitOut(["-C", dest, "rev-parse", "--verify", "HEAD"]);

                if (head !== rev) {
                    log.warn(`插件 ${id} 当前在 ${head ?? "unknown"},快照记录 ${rev};保持不动`);
                }
            }

            if (enabled && !currentEnabled.has(id)) {
                toEnable.add(id);
            }

            continue;
        }

        const tmp = `${mktempDir()}`;
        let okToInstall = false;

        if ((httpsPluginUrl(url) || localPluginUrl(url)) && isFullSha(rev)) {
            if (!git(["clone", "--quiet", "--no-checkout", url, `${tmp}/plugin`])) {
                log.warn(`克隆插件 ${id} 失败(${url})`);
                rmrf(tmp);
                failed = true;
                continue;
            }

            if (!git(["-C", `${tmp}/plugin`, "checkout", "--quiet", "--detach", rev])) {
                log.warn(`插件 ${id} 不含 commit ${rev}`);
                rmrf(tmp);
                failed = true;
                continue;
            }

            if (gitOut(["-C", `${tmp}/plugin`, "rev-parse", "--verify", "HEAD"]) !== rev) {
                log.warn(`插件 ${id} 检出的不是 ${rev}`);
                rmrf(tmp);
                failed = true;
                continue;
            }

            okToInstall = true;
        } else if (row["local"] === true && isDir(`${mirror}/plugins-local/${id}`)) {
            mkdirSync(`${tmp}/plugin`, { recursive: true });
            rsync(["-a", `${mirror}/plugins-local/${id}/`, `${tmp}/plugin/`]);
            okToInstall = true;
        } else {
            log.warn(`不安装插件 ${id};既没有钉住的 https commit 也没有本地快照`);
            rmrf(tmp);
            continue;
        }

        if (okToInstall) {
            if (!omarchy(["plugin", "validate", `${tmp}/plugin`])) {
                log.warn(`插件 ${id} 校验失败;不安装`);
                rmrf(tmp);
                failed = true;
                continue;
            }

            mkdirSync(`${HOME}/.config/omarchy/plugins`, { recursive: true });
            rmrf(dest);

            const mv = resolveTool("mv");

            if (!mv || capture(mv, [`${tmp}/plugin`, dest]).code !== 0) {
                log.warn(`移动插件 ${id} 到 ${dest} 失败`);
                rmrf(tmp);
                failed = true;
                continue;
            }

            rmrf(tmp);
            log.info(`已安装插件 ${id}`);
            installedAny = true;

            if (enabled) {
                toEnable.add(id);
            }
        }
    }

    if (installedAny && process.env["OMARSYNC_SKIP_LIVE"] !== "1" && resolveTool("omarchy-shell")) {
        if (!omarchyShell(["shell", "rescanPlugins"])) {
            log.warn("shell 插件重扫失败");
        }
    }

    // 必须在重扫之后启用,否则刚安装的插件还没被 shell 发现。
    if (process.env["OMARSYNC_SKIP_LIVE"] !== "1") {
        for (const id of toEnable) {
            if (!omarchy(["plugin", "enable", id])) {
                log.warn(`启用插件 ${id} 失败`);
            }
        }
    }

    return !failed;
}
