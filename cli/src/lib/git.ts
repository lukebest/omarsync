import { capture, resolveTool, run } from "./exec";
import { die } from "./log";
import { assignments } from "./proxy";

// git 包装:禁用 hooks,指定 ssh-keygen 作为签名程序。
// 对应旧版 common.lua 的 git/git_out。

function gitBin(): string {
    const bin = resolveTool("git");

    if (!bin) {
        die("git 不可用");
    }

    return bin;
}

function baseArgs(): string[] {
    const keygen = resolveTool("ssh-keygen");

    if (!keygen) {
        die("ssh-keygen 不可用");
    }

    return ["-c", "core.hooksPath=/dev/null", "-c", `gpg.ssh.program=${keygen}`];
}

/** 执行并把输出透传到终端;成功返回 true */
export function git(args: readonly string[]): boolean {
    return run(gitBin(), [...baseArgs(), ...args], assignments());
}

/** 执行并捕获输出 */
export function gitCapture(args: readonly string[]): { ok: boolean; code: number; out: string } {
    const result = capture(gitBin(), [...baseArgs(), ...args], assignments());

    return { ok: result.code === 0, code: result.code, out: result.stdout };
}

/** 捕获完整输出(含 stderr);用于外部 diff 工具这类需要失败原因的场景 */
export function gitCaptureDetailed(args: readonly string[]): {
    ok: boolean;
    code: number;
    stdout: string;
    stderr: string;
} {
    const result = capture(gitBin(), [...baseArgs(), ...args], assignments());

    return { ok: result.code === 0, code: result.code, stdout: result.stdout, stderr: result.stderr };
}

/** 带额外环境变量捕获输出(GIT_INDEX_FILE 等 plumbing 用) */
export function gitCaptureEnv(args: readonly string[], extraEnv: readonly string[]): { ok: boolean; code: number; out: string } {
    const result = capture(gitBin(), [...baseArgs(), ...args], [...assignments(), ...extraEnv]);

    return { ok: result.code === 0, code: result.code, out: result.stdout };
}

/** 带额外环境变量和 stdin 捕获输出(index-info 删除条目) */
export function gitCaptureInputEnv(
    args: readonly string[],
    extraEnv: readonly string[],
    input: string,
): { ok: boolean; code: number; out: string } {
    const result = capture(gitBin(), [...baseArgs(), ...args], [...assignments(), ...extraEnv], input);

    return { ok: result.code === 0, code: result.code, out: result.stdout };
}

/** 带环境变量捕获输出并去掉尾部空白;失败返回 undefined */
export function gitOutEnv(args: readonly string[], extraEnv: readonly string[]): string | undefined {
    const { ok, out } = gitCaptureEnv(args, extraEnv);

    if (!ok) {
        return undefined;
    }

    return out.trimEnd();
}

/** 捕获输出并去掉尾部空白;失败返回 undefined */
export function gitOut(args: readonly string[]): string | undefined {
    const { ok, out } = gitCapture(args);

    if (!ok) {
        return undefined;
    }

    return out.trimEnd();
}
