import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 可信子进程封装:只从固定系统目录解析工具,挡住 PATH 投毒(影子二进制)。
// 对应旧版 src/exec.lua。

/** 可信目录,按优先级排列 */
const TRUSTED_DIRS = ["/usr/bin", "/bin", "/usr/sbin", "/usr/share/omarchy/bin"];

/** 解析工具到可信目录下的真实路径;找不到返回 undefined */
export function resolveTool(name: string): string | undefined {
    for (const dir of TRUSTED_DIRS) {
        const candidate = join(dir, name);

        try {
            // 必须是常规文件且可执行(符号链接解析后检查)
            if (statSync(candidate).isFile()) {
                accessSync(candidate, constants.X_OK);

                return candidate;
            }
        } catch {
            // 不存在或不可执行,试下一个目录
        }
    }

    return undefined;
}

export interface ExecResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}

/** 执行并捕获输出;env 以 KEY=VALUE 形式附加(默认清空环境再加白名单) */
export function capture(binary: string, args: readonly string[], env: readonly string[] = [], input?: string): ExecResult {
    const result = spawnSync(binary, [...args], {
        env: commandEnv(env),
        encoding: "utf8",
        input,
        maxBuffer: 64 * 1024 * 1024,
    });

    return {
        code: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

function commandEnv(extra: readonly string[]): Record<string, string> {
    const base: Record<string, string> = {
        HOME: process.env["HOME"] ?? "",
        PATH: TRUSTED_DIRS.join(":"),
        LANG: "C.UTF-8",
        OMARCHY_PATH: process.env["OMARCHY_PATH"] ?? "/usr/share/omarchy",
    };

    // 图形会话变量:VS Code 等 GUI 工具需要靠它们连到当前 Wayland/X11 会话。
    for (const name of [
        "XDG_CONFIG_HOME",
        "XDG_STATE_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
        "XDG_RUNTIME_DIR",
        "WAYLAND_DISPLAY",
        "DISPLAY",
        "DBUS_SESSION_BUS_ADDRESS",
    ]) {
        const value = process.env[name];

        if (value) {
            base[name] = value;
        }
    }

    for (const entry of extra) {
        const eq = entry.indexOf("=");

        if (eq > 0) {
            base[entry.slice(0, eq)] = entry.slice(eq + 1);
        }
    }

    return base;
}

/** 执行并把输出直接透传到终端(交互/长输出用);成功返回 true。
 *  extra 以 KEY=VALUE 附加到与 capture 相同的最小环境。不传则继承当前进程环境。 */
export function run(binary: string, args: readonly string[], extra?: readonly string[]): boolean {
    const result = spawnSync(binary, [...args], {
        stdio: "inherit",
        env: extra === undefined ? process.env : commandEnv(extra),
    });

    return result.status === 0;
}

export function isFile(path: string): boolean {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

export function isDir(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

export function exists(path: string): boolean {
    return existsSync(path);
}

/** 是否为符号链接(不跟随) */
export function isLink(path: string): boolean {
    try {
        return lstatSync(path).isSymbolicLink();
    } catch {
        return false;
    }
}

/** 解析符号链接后的真实路径;失败返回 undefined */
export function realpath(path: string): string | undefined {
    try {
        return realpathSync(path);
    } catch {
        return undefined;
    }
}

/** 创建临时目录(等价 mktemp -d) */
export function mktempDir(): string {
    return mkdtempSync(join(tmpdir(), "omarsync-"));
}

/** 递归删除;不存在静默忽略 */
export function rmrf(path: string): void {
    try {
        rmSync(path, { force: true, recursive: true });
    } catch {
        // 忽略
    }
}
