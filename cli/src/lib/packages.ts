import { mkdirSync, writeFileSync } from "node:fs";

import { capture, isFile, resolveTool, run } from "./exec";
import { die, log, readTextFile } from "./log";
import { omarchy } from "./omarchy";
import { loadPushIgnore } from "./push-ignore";

// pacman / AUR / Flatpak 清单的导出与安装。1:1 移植自 src/packages.lua。

function pacmanBin(): string | undefined {
    return resolveTool("pacman");
}

function flatpakBin(): string | undefined {
    return resolveTool("flatpak");
}

function flatpak(args: readonly string[]): boolean {
    const bin = flatpakBin();

    if (!bin) {
        die("flatpak 不在可信目录里");
    }

    return run(bin, args);
}

function flatpakCapture(args: readonly string[]): { ok: boolean; out: string } {
    const bin = flatpakBin();

    if (!bin) {
        die("flatpak 不在可信目录里");
    }

    const result = capture(bin, args);

    return { ok: result.code === 0, out: result.stdout };
}

function filterIgnoredPackages(text: string, ignored: ReadonlySet<string>): string {
    return text
        .split("\n")
        .filter((line) => !ignored.has(line.trim()))
        .join("\n");
}

export function exportPackages(dest: string): void {
    mkdirSync(`${dest}/packages`, { recursive: true });

    const pacman = pacmanBin();
    const ignored = loadPushIgnore().packages;

    if (pacman) {
        writeFileSync(`${dest}/packages/pacman.txt`, filterIgnoredPackages(capture(pacman, ["-Qqen"]).stdout, ignored));
        writeFileSync(`${dest}/packages/aur.txt`, filterIgnoredPackages(capture(pacman, ["-Qqem"]).stdout, ignored));
    } else {
        writeFileSync(`${dest}/packages/pacman.txt`, "");
        writeFileSync(`${dest}/packages/aur.txt`, "");
    }

    exportFlatpaks(dest);
}

export function flatpakRemoteUrlOk(url: string): boolean {
    return url.length <= 300 && /^https:\/\/[A-Za-z0-9._~:/?#&=%+-]+$/.test(url) && !url.includes("..");
}

export function exportFlatpaks(dest: string): void {
    const outPath = `${dest}/packages/flatpak.txt`;

    if (!flatpakBin()) {
        writeFileSync(outPath, "");

        return;
    }

    // 先收集用户级 remote 的下载 URL
    const remoteUrls = new Map<string, string>();

    for (const line of flatpakCapture(["remotes", "--user", "--columns=name,url"]).out.split("\n")) {
        const match = /^(\S+)\s+(\S+)/.exec(line);

        if (match && /^[A-Za-z0-9._-]+$/.test(match[1]!)) {
            remoteUrls.set(match[1]!, flatpakRemoteUrlOk(match[2]!) ? match[2]! : "");
        }
    }

    const lines: string[] = [];
    const ignored = loadPushIgnore().packages;

    for (const line of flatpakCapture(["list", "--user", "--app", "--columns=application,origin,branch,active"]).out.split("\n")) {
        const match = /^(\S+)\s+(\S+)\s+(\S+)/.exec(line);

        if (!match) {
            continue;
        }

        const [, app, origin, branch] = match;

        if (!/^[A-Za-z0-9._-]+$/.test(app!) || !/^[A-Za-z0-9._-]+$/.test(origin!) || !/^[A-Za-z0-9._-]+$/.test(branch!)) {
            continue;
        }

        if (ignored.has(app!)) {
            continue;
        }

        let commit = flatpakCapture(["info", "--user", "--show-commit", app!]).out.trimEnd();

        if (!/^[0-9a-f]{64}$/.test(commit)) {
            commit = "";
        }

        lines.push([app, origin, branch, commit, remoteUrls.get(origin!) ?? ""].join("\t"));
    }

    writeFileSync(outPath, lines.length > 0 ? `${lines.join("\n")}\n` : "");
}

function userFlatpakRemoteExists(name: string): boolean {
    return flatpakCapture(["remotes", "--user", "--columns=name"]).out
        .split("\n")
        .some((line) => line.trim() === name);
}

/** Flathub 是唯一众所周知的 remote;其他 origin 需要导出端记录的 URL */
function ensureUserFlatpakRemote(name: string, url: string): boolean {
    if (userFlatpakRemoteExists(name)) {
        return true;
    }

    if (name === "flathub") {
        url = "https://dl.flathub.org/repo/flathub.flatpakrepo";
    }

    if (!flatpakRemoteUrlOk(url)) {
        return false;
    }

    return flatpak(["remote-add", "--user", "--if-not-exists", name, url]);
}

function validPkgName(name: string): boolean {
    return /^[A-Za-z0-9@._+%-]+$/.test(name);
}

function pkgInstalled(pkg: string): boolean {
    const pacman = pacmanBin();

    return pacman !== undefined && capture(pacman, ["-Q", pkg]).code === 0;
}

function readPkgList(path: string): string[] {
    const data = readTextFile(path);
    const pkgs: string[] = [];
    const ignored = loadPushIgnore().packages;

    if (!data) {
        return pkgs;
    }

    for (const line of data.split("\n")) {
        const pkg = line.trim();

        if (pkg === "" || pkg.startsWith("#") || ignored.has(pkg)) {
            continue;
        }

        if (!validPkgName(pkg)) {
            die(`拒绝异常的包名: ${pkg}`);
        }

        if (!pkgInstalled(pkg)) {
            pkgs.push(pkg);
        }
    }

    return pkgs;
}

export function installMissingPackages(mirror: string): boolean {
    let failed = false;

    const official = readPkgList(`${mirror}/packages/pacman.txt`);

    if (official.length > 0) {
        log.info(`安装 ${official.length} 个官方包`);

        if (!omarchy(["pkg", "add", ...official])) {
            log.warn("官方包安装失败");
            failed = true;
        }
    } else {
        log.info("官方包已全部安装");
    }

    const aur = readPkgList(`${mirror}/packages/aur.txt`);

    if (aur.length > 0) {
        log.warn(`不安装 AUR 包(未钉住的构建配方): ${aur.join(" ")}`);
        log.warn("如需安装,请自己找钉住 commit 的 PKGBUILD");
    }

    if (!installMissingFlatpaks(mirror)) {
        failed = true;
    }

    return !failed;
}

export function installMissingFlatpaks(mirror: string): boolean {
    const listPath = `${mirror}/packages/flatpak.txt`;

    if (!flatpakBin() || !isFile(listPath)) {
        return true;
    }

    let failed = false;

    for (const line of (readTextFile(listPath) ?? "").split("\n")) {
        const match = /^([^\t]*)\t([^\t]*)\t([^\t]*)\t([^\t]*)\t?([^\t]*)/.exec(line);

        if (!match || match[1] === "") {
            continue;
        }

        const [, app, origin, branch, commit, url] = match;

        if (!/^[A-Za-z0-9._-]+$/.test(app!)) {
            die(`拒绝异常的 flatpak id: ${app}`);
        }

        if (loadPushIgnore().packages.has(app!)) {
            continue;
        }

        if (!/^[A-Za-z0-9._-]+$/.test(origin!)) {
            die(`拒绝异常的 flatpak origin: ${origin}`);
        }

        if (!/^[A-Za-z0-9._-]+$/.test(branch!)) {
            die(`拒绝异常的 flatpak branch: ${branch}`);
        }

        if (commit !== "" && !/^[0-9a-f]{64}$/.test(commit!)) {
            die(`拒绝异常的 flatpak commit: ${commit}`);
        }

        if (url !== "" && !flatpakRemoteUrlOk(url!)) {
            die(`拒绝异常的 flatpak remote URL(origin ${origin})`);
        }

        // flatpak info 成功即已安装
        if (!flatpakCapture(["info", "--user", app!]).ok) {
            if (!ensureUserFlatpakRemote(origin!, url!)) {
                log.warn(`跳过 flatpak ${app};这台机器没有 remote ${origin} 且没有下载 URL`);
                continue;
            }

            log.info(`安装 flatpak ${app}(来自 ${origin})`);

            if (!flatpak(["install", "--user", "--noninteractive", "--app", origin!, app!])) {
                log.warn(`安装 flatpak ${app} 失败`);
                failed = true;
                continue;
            }
        }

        if (commit !== "") {
            log.info(`钉住 flatpak ${app} 到 ${commit}`);

            if (!flatpak(["update", "--user", "--noninteractive", `--commit=${commit}`, app!])) {
                log.warn(`钉住 flatpak ${app} 到 ${commit} 失败`);
                failed = true;
            }
        }
    }

    return !failed;
}
