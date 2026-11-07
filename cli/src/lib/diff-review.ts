import { resolveTool } from "./exec";
import { git } from "./git";

// 统一的差异审阅入口:优先 VS Code 原生左右 Diff Editor(中间 gutter 带箭头按钮)。
// 通过 -c 内联 difftool 定义,不依赖 git 版本是否内置 mergetools/vscode;
// 纯终端/无头环境(没有 code)或调用失败时返回 false,由调用方回退到文本 .diff。

/** 本机是否具备 VS Code 图形对比条件 */
export function vsCodeDiffAvailable(): boolean {
    return resolveTool("code") !== undefined;
}

/**
 * 以 VS Code Diff Editor 审阅 git 修订版之间的差异:
 * 逐文件打开,关闭当前 diff 标签后自动继续下一个。
 * args 是 difftool 之后的参数,如 ["-C", repo, "--cached"] 或 [base, head, "--", ...paths]。
 */
export function reviewWithVsCode(args: readonly string[]): boolean {
    const code = resolveTool("code");

    if (!code) {
        return false;
    }

    // $LOCAL/$REMOTE 必须字面传给 git,由 difftool 在调用时经 shell 展开。
    return git([
        "-c",
        `difftool.vscode.cmd=${code} --wait --diff $LOCAL $REMOTE`,
        "difftool",
        "--no-prompt",
        "--tool=vscode",
        ...args,
    ]);
}
