import { chmodSync, copyFileSync, lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

import { isDir, mktempDir, rmrf } from "./exec";
import * as mise from "./mise";
import { paths } from "./paths";
import { loadPushIgnore, pathIgnored } from "./push-ignore";
import { readScope } from "./scope";

// push-ignore 是双向忽略:apply/pull 前收走本机文件,回滚后恢复;
// 远程有而本机没有的 ignored 路径要删掉,避免被创建。

const HOME = homedir();

export interface IgnoredStash {
    readonly root: string;
    readonly paths: Set<string>;
}

function walkIgnored(dir: string, rel: string, ignored: ReturnType<typeof loadPushIgnore>, out: Set<string>): void {
    let entries;

    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") {
            continue;
        }

        const child = rel === "" ? entry.name : `${rel}/${entry.name}`;

        if (entry.isDirectory()) {
            walkIgnored(`${dir}/${entry.name}`, child, ignored, out);
        } else if (pathIgnored(ignored, child)) {
            out.add(child);
        }
    }
}

export function stashIgnoredPaths(): IgnoredStash {
    const ignored = loadPushIgnore();
    const root = mktempDir();
    const ignoredFiles = new Set<string>();
    const roots = new Set(mise.trackedRels());

    for (const entry of readScope(paths.scopeFile)) {
        roots.add(entry.rel);
    }

    for (const relRoot of roots) {
        const dir = `${HOME}/${relRoot}`;

        if (isDir(dir)) {
            walkIgnored(dir, relRoot, ignored, ignoredFiles);
        }
    }

    for (const rel of ignoredFiles) {
        const source = `${HOME}/${rel}`;
        const target = `${root}/${rel}`;

        try {
            const stat = lstatSync(source);

            mkdirSync(dirname(target), { recursive: true });
            rmrf(target);

            if (stat.isSymbolicLink()) {
                symlinkSync(readlinkSync(source), target);
            } else if (stat.isFile()) {
                copyFileSync(source, target);
                chmodSync(target, stat.mode);
            }
        } catch {
            // 文件在收集后消失,忽略
        }
    }

    return { root, paths: ignoredFiles };
}

export function restoreIgnoredPaths(stash: IgnoredStash): void {
    for (const rel of stash.paths) {
        const source = `${stash.root}/${rel}`;
        const target = `${HOME}/${rel}`;

        try {
            const stat = lstatSync(source);

            mkdirSync(dirname(target), { recursive: true });
            rmrf(target);

            if (stat.isSymbolicLink()) {
                symlinkSync(readlinkSync(source), target);
            } else if (stat.isFile()) {
                copyFileSync(source, target);
                chmodSync(target, stat.mode);
            }
        } catch {
            // 备份项不存在时保留当前文件
        }
    }

    rmrf(stash.root);
}

export function removeRemoteIgnoredPaths(stash: IgnoredStash, snapshot: string): void {
    const ignored = loadPushIgnore();

    for (const path of mise.snapshotPaths(snapshot)) {
        if (!path.startsWith("home/")) {
            continue;
        }

        const rel = path.slice(5);

        if (pathIgnored(ignored, rel) && !stash.paths.has(rel)) {
            rmrf(`${HOME}/${rel}`);
        }
    }
}
