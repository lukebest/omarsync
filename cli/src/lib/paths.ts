import { homedir } from "node:os";
import { join } from "node:path";

// 公共路径与配置读写(~/.config/omarsync/config,KEY=VALUE 格式)。
// 对应旧版 src/common.lua 的路径与配置部分。
// 插件身份保持 Omarsync:配置和状态仍在 omarsync 目录,不迁移到别的名字。

const HOME = homedir();

export const paths = {
    /** 本机配置目录(信任文件、scope、plugins-skip 都在这,永不上传) */
    configDir: join(HOME, ".config", "omarsync"),
    configFile: join(HOME, ".config", "omarsync", "config"),
    /** 状态目录(镜像、备份、applied 印章、last.log) */
    stateDir: join(HOME, ".local", "state", "omarsync"),
    mirrorDir: join(HOME, ".local", "state", "omarsync", "repo"),
    backupDir: join(HOME, ".local", "state", "omarsync", "backup"),
    scopeFile: join(HOME, ".config", "omarsync", "scope"),
    pluginsSkipFile: join(HOME, ".config", "omarsync", "plugins-skip"),
    pushIgnoreFile: join(HOME, ".config", "omarsync", "push-ignore"),
    trustedKeysFile: join(HOME, ".config", "omarsync", "trusted-keys"),
    appliedStamp: join(HOME, ".local", "state", "omarsync", "applied"),
    lastLog: join(HOME, ".local", "state", "omarsync", "last.log"),
    lockFile: join(HOME, ".local", "state", "omarsync", "omarsync.lock"),
    statusJson: join(HOME, ".local", "state", "omarsync", "status.json"),
} as const;

/** 读配置项(KEY=VALUE,取最后一处出现,与旧版一致);不存在返回 undefined */
export function configGet(key: string, readFile: (path: string) => string | undefined): string | undefined {
    const data = readFile(paths.configFile);

    if (data === undefined) {
        return undefined;
    }

    let value: string | undefined;

    for (const line of data.split("\n")) {
        const match = /^([A-Z_]+)=(.*)$/.exec(line);

        if (match && match[1] === key) {
            value = match[2];
        }
    }

    return value;
}
