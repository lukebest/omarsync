import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, matchesGlob } from "node:path";

import { isFile } from "./exec";
import { die, readTextFile } from "./log";
import { paths } from "./paths";

// 本机 push-ignore:一行一个路径/glob,或 plugin:<id> / package:<name>。
// 它同时是本机同步忽略:不发布,也不用远程版本覆盖本机。文件永不上传。

export interface PushIgnore {
    readonly patterns: readonly string[];
    readonly plugins: ReadonlySet<string>;
    readonly packages: ReadonlySet<string>;
}

const DEFAULT_PUSH_IGNORE = `# Omarsync push-ignore（本机文件，永不上传）
# 普通行：相对 $HOME 的路径或 glob
# plugin:<id> 忽略插件；package:<name> 忽略包
#
# 默认：输入法插件会按机器重新生成这些文件
.config/fcitx5/conf/classicui.conf
.config/fcitx5/conf/notifications.conf
.config/fcitx5/config
.config/fcitx5/profile
# 插件生成的绝对符号链接
.local/bin/omarchy.ime
.local/bin/ime-manager
# 应用写入本机绝对路径的启动器
.local/share/applications/claude-code-url-handler.desktop
# 硬件/内核包由每台机器自己决定
package:amd-ucode
package:intel-ucode
package:linux
package:linux-headers
package:linux-firmware
package:linux-omarchy
package:linux-omarchy-headers
`;

/** 首次运行时放入默认忽略项；文件存在就绝不覆盖 */
export function ensurePushIgnore(): void {
    const file = paths.pushIgnoreFile;

    if (isFile(file)) {
        return;
    }

    try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, DEFAULT_PUSH_IGNORE);
    } catch {
        // 读不到/写不了时按空名单继续
    }
}

const PLUGIN_ID = /^[A-Za-z0-9._-]+$/;
const PACKAGE_NAME = /^[A-Za-z0-9@._+:~-]+$/;

function normalizePath(raw: string, line: number): string {
    let path = raw.trim();
    const home = homedir();

    if (path.startsWith(`${home}/`)) {
        path = path.slice(home.length + 1);
    } else if (path.startsWith("/")) {
        die(`push-ignore 第 ${line} 行必须相对于 $HOME`);
    } else if (path.startsWith("~/")) {
        path = path.slice(2);
    } else if (path.startsWith("home/")) {
        path = path.slice(5);
    }

    path = path.replace(/\/+$/, "");

    if (path === "" || path.includes("\n") || path.includes("\0")) {
        die(`push-ignore 第 ${line} 行不是有效路径`);
    }

    if (path.split("/").includes("..")) {
        die(`push-ignore 第 ${line} 行不允许包含 '..'`);
    }

    return path;
}

export function parsePushIgnore(text: string): PushIgnore {
    const patterns: string[] = [];
    const plugins = new Set<string>();
    const packages = new Set<string>();

    const lines = text.split("\n");

    for (const [index, raw] of lines.entries()) {
        const line = raw.trim();

        if (line === "" || line.startsWith("#")) {
            continue;
        }

        const number = index + 1;

        if (line.startsWith("plugin:")) {
            const id = line.slice(7).trim();

            if (!PLUGIN_ID.test(id)) {
                die(`push-ignore 第 ${number} 行不是合法插件 id: ${id}`);
            }

            plugins.add(id);
            continue;
        }

        if (line.startsWith("package:")) {
            const name = line.slice(8).trim();

            if (!PACKAGE_NAME.test(name)) {
                die(`push-ignore 第 ${number} 行不是合法包名: ${name}`);
            }

            packages.add(name);
            continue;
        }

        patterns.push(normalizePath(line, number));
    }

    return { patterns, plugins, packages };
}

export function loadPushIgnore(): PushIgnore {
    const file = paths.pushIgnoreFile;

    if (!isFile(file)) {
        return { patterns: [], plugins: new Set(), packages: new Set() };
    }

    return parsePushIgnore(readTextFile(file) ?? "");
}

function normalizeCandidate(path: string): string {
    let value = path.trim();

    if (value.startsWith("~/")) {
        value = value.slice(2);
    } else if (value.startsWith("home/")) {
        value = value.slice(5);
    } else if (value.startsWith(`${homedir()}/`)) {
        value = value.slice(homedir().length + 1);
    }

    return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

function hasGlob(pattern: string): boolean {
    return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
}

/** 路径是否被本机忽略;接受 "home/..."、 "~/..." 或 home 相对路径 */
export function pathIgnored(ignore: PushIgnore, path: string): boolean {
    const rel = normalizeCandidate(path);

    for (const pattern of ignore.patterns) {
        if (matchesGlob(rel, pattern)) {
            return true;
        }

        if (!hasGlob(pattern) && (rel === pattern || rel.startsWith(`${pattern}/`))) {
            return true;
        }
    }

    return false;
}

/** ignored 路径转成 mise exclude glob;目录模式同时排除其内容 */
export function pushIgnoreExcludes(ignore: PushIgnore): string[] {
    const globs = new Set<string>();

    for (const pattern of ignore.patterns) {
        globs.add(`~/${pattern}`);

        if (!hasGlob(pattern)) {
            globs.add(`~/${pattern}/**`);
        }
    }

    return [...globs];
}
