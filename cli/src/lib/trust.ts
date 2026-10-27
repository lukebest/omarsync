import { appendFileSync, chmodSync, mkdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { capture, exists, isDir, isFile, resolveTool, run } from "./exec";
import { git, gitCapture, gitOut } from "./git";
import { die, log, readTextFile } from "./log";
import { configGet, paths } from "./paths";
import { confirm, configSet, hostnameSafe, iso8601, stdinIsTty } from "./util";

// 签名信任链:SSH(ed25519)提交签名、trusted-keys、首次应用 TOFU。
// 信任策略是本机的,绝不从同步仓库读取。1:1 移植自 src/trust.lua。

export function isFullSha(value: string | undefined): value is string {
    return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

function realpath(path: string): string | undefined {
    try {
        return realpathSync(path);
    } catch {
        return undefined;
    }
}

function pathWithin(a: string, b: string): boolean {
    return a === b || a.startsWith(`${b}/`);
}

/** 信任文件/密钥不得位于镜像仓库内 */
export function refuseInsideMirror(path: string): void {
    if (!isDir(paths.mirrorDir)) {
        return;
    }

    const realPath = realpath(path);
    const realMirror = realpath(paths.mirrorDir);

    if (realPath && realMirror && pathWithin(realPath, realMirror)) {
        die(`拒绝使用同步镜像内的信任文件: ${path}`);
    }
}

/** 抓取一次分支并返回其完整提交 id;不切换工作区 */
export function resolveRemoteSha(mirror: string, branch: string): string {
    git(["-C", mirror, "fetch", "--quiet", "origin", branch]);

    const sha = gitOut(["-C", mirror, "rev-parse", "--verify", `refs/remotes/origin/${branch}^{commit}`]);

    if (!isFullSha(sha)) {
        die(`origin/${branch} 没有解析出完整提交: ${sha ?? "<空>"}`);
    }

    return sha;
}

/** 检出到唯一确定的提交(detached HEAD,分支移动不会影响本次读取) */
export function checkoutPinnedCommit(mirror: string, sha: string): void {
    if (!isFullSha(sha)) {
        die(`拒绝检出非提交: ${sha}`);
    }

    git(["-C", mirror, "checkout", "--quiet", "--force", "--detach", sha]);

    const head = gitOut(["-C", mirror, "rev-parse", "--verify", "HEAD"]);

    if (head !== sha) {
        die(`镜像 HEAD ${head ?? "?"} 不是钉住的提交 ${sha}`);
    }

    if (gitCapture(["-C", mirror, "symbolic-ref", "-q", "HEAD"]).ok) {
        die(`钉住 ${sha} 后镜像仍挂在分支上`);
    }
}

export function commitIsTrusted(mirror: string, sha: string): boolean {
    const keys = paths.trustedKeysFile;

    if (!isFile(keys)) {
        return false;
    }

    const data = readTextFile(keys) ?? "";

    if (!/\S/.test(data)) {
        return false;
    }

    refuseInsideMirror(keys);

    const pub = signaturePubkeyLine(mirror, sha);

    // OpenPGP 只靠本机 GPG 钥匙圈就能让 verify-commit 成功,那不是 SSH trusted-keys。
    if (!pub || !allowedSignersContain(data, pub)) {
        return false;
    }

    return sshKeyAccepted(mirror, sha, pub, keys);
}

export function trustedKeysPresent(): boolean {
    if (!isFile(paths.trustedKeysFile)) {
        return false;
    }

    return /\S/.test(readTextFile(paths.trustedKeysFile) ?? "");
}

// ===== SSHSIG 解析(Node Buffer 替代 Lua 的手写 base64)=====

/** 从提交的 gpgsig 头提取 SSH 签名 armor 文本 */
function extractArmor(commitText: string): string | undefined {
    const lines: string[] = [];
    let on = false;

    for (const line of commitText.split("\n")) {
        if (!on) {
            const rest = /^gpgsig (.*)$/.exec(line)?.[1];

            if (rest !== undefined) {
                on = true;
                lines.push(rest);

                if (rest.includes("END SSH SIGNATURE")) {
                    break;
                }
            }
        } else {
            const rest = /^ (.*)$/.exec(line)?.[1];

            if (rest === undefined) {
                break;
            }

            lines.push(rest);

            if (rest.includes("END SSH SIGNATURE")) {
                break;
            }
        }
    }

    const armor = lines.join("\n");

    if (!armor.includes("BEGIN SSH SIGNATURE") || !armor.includes("END SSH SIGNATURE")) {
        return undefined;
    }

    return armor;
}

/** 输出签名里嵌入的 SSH 公钥行 "type keydata";失败返回 undefined。
 *  这里只是文本提取,调用方仍须让 git 真正验签。 */
export function signaturePubkeyLine(mirror: string, sha: string): string | undefined {
    const commit = gitOut(["-C", mirror, "cat-file", "commit", sha]);

    if (!commit) {
        return undefined;
    }

    const armor = extractArmor(commit);

    if (!armor) {
        return undefined;
    }

    const body = armor
        .replace("-----BEGIN SSH SIGNATURE-----", "")
        .replace("-----END SSH SIGNATURE-----", "");
    const sig = Buffer.from(body.replaceAll(/\s/g, ""), "base64");

    if (sig.length < 14 || sig.subarray(0, 6).toString("ascii") !== "SSHSIG") {
        return undefined;
    }

    if (sig.readUInt32BE(6) !== 1) {
        return undefined;
    }

    const keyLength = sig.readUInt32BE(10);

    if (keyLength < 16 || keyLength > 4096 || sig.length < 14 + keyLength) {
        return undefined;
    }

    const key = sig.subarray(14, 14 + keyLength);
    const typeLength = key.readUInt32BE(0);

    if (typeLength < 4 || typeLength > 64 || key.length < 4 + typeLength) {
        return undefined;
    }

    const keyType = key.subarray(4, 4 + typeLength).toString("ascii");

    if (!/^ssh-[a-z0-9-]+$/.test(keyType)) {
        return undefined;
    }

    return `${keyType} ${key.toString("base64")}`;
}

export function fingerprintOfPubkeyLine(pub: string): string | undefined {
    const mktemp = resolveTool("mktemp");

    if (!mktemp) {
        return undefined;
    }

    const tmp = capture(mktemp, []).stdout.trim();

    if (tmp === "") {
        return undefined;
    }

    writeFileSync(tmp, `${pub}\n`);

    const keygen = resolveTool("ssh-keygen");
    const out = keygen ? capture(keygen, ["-lf", tmp]).stdout : "";

    try {
        unlinkSync(tmp);
    } catch {
        // 忽略
    }

    return /\S+\s+(SHA256:[A-Za-z0-9+/]+=*)/.exec(out)?.[1];
}

function sshPubkey(pub: string): { type: string; data: string } | undefined {
    const match = /^(ssh-[a-z0-9-]+)\s+([A-Za-z0-9+/=]+)$/.exec(pub.trim());

    if (!match?.[1] || !match[2]) {
        return undefined;
    }

    return { type: match[1], data: match[2] };
}

/** trusted-keys 里是否按 key type + key material 登记了这把公钥 */
function allowedSignersContain(data: string, pub: string): boolean {
    const key = sshPubkey(pub);

    if (!key) {
        return false;
    }

    for (const raw of data.split("\n")) {
        const line = raw.trim();

        if (line === "" || line.startsWith("#")) {
            continue;
        }

        const tokens = line.split(/\s+/);

        for (let index = 0; index < tokens.length - 1; index++) {
            if (tokens[index] === key.type && tokens[index + 1] === key.data) {
                return true;
            }
        }
    }

    return false;
}

/** 这份 allowed signers 下 git 报告的状态。%G? 为 G 只说明签名被接受;
 *  OpenPGP 走本机钥匙圈时同样是 G,调用方还要核对 %GK 是不是这把 SSH 密钥。 */
function signerVerdict(mirror: string, sha: string, allowedFile: string): { flag: string; fingerprint: string } | undefined {
    const out = gitOut([
        "-C",
        mirror,
        "-c",
        "log.showSignature=false",
        "-c",
        `gpg.ssh.allowedSignersFile=${allowedFile}`,
        "log",
        "-1",
        "--format=%G?|%GK",
        sha,
    ]);

    if (!out) {
        return undefined;
    }

    const separator = out.indexOf("|");

    if (separator <= 0) {
        return undefined;
    }

    return { flag: out.slice(0, separator), fingerprint: out.slice(separator + 1) };
}

function sshKeyAccepted(mirror: string, sha: string, pub: string, allowedFile: string): boolean {
    const fingerprint = fingerprintOfPubkeyLine(pub);
    const verdict = fingerprint ? signerVerdict(mirror, sha, allowedFile) : undefined;

    return verdict?.flag === "G" && verdict.fingerprint === fingerprint;
}

export function pubkeyVerifiesCommit(mirror: string, sha: string, pub: string): boolean {
    const want = sshPubkey(pub);
    const got = sshPubkey(signaturePubkeyLine(mirror, sha) ?? "");

    if (!want || !got || want.type !== got.type || want.data !== got.data) {
        return false;
    }

    const mktemp = resolveTool("mktemp");

    if (!mktemp) {
        return false;
    }

    const tmp = capture(mktemp, []).stdout.trim();

    if (tmp === "") {
        return false;
    }

    const normalized = `${want.type} ${want.data}`;

    writeFileSync(tmp, `* namespaces="git" ${normalized}\n`);

    const ok = sshKeyAccepted(mirror, sha, normalized, tmp);

    try {
        unlinkSync(tmp);
    } catch {
        // 忽略
    }

    return ok;
}

// ===== 首次应用(TOFU)=====

export function appliedStampFile(): string {
    return paths.appliedStamp;
}

/** 从未信任过任何密钥的机器,第一次 apply 可以用未签名的提交 */
export function firstApplyAvailable(): boolean {
    if (trustedKeysPresent()) {
        return false;
    }

    return !isFile(appliedStampFile());
}

export function markApplied(sha: string): void {
    mkdirSync(dirname(appliedStampFile()), { recursive: true });
    writeFileSync(appliedStampFile(), `${sha}\n`);
}

function rememberSigner(pub: string): void {
    const keys = paths.trustedKeysFile;

    refuseInsideMirror(keys);
    mkdirSync(dirname(keys), { recursive: true });

    if (!isFile(keys)) {
        writeFileSync(keys, "");
    }

    chmodSync(keys, 0o644);

    const entry = `* namespaces="git" ${pub}`;
    const data = readTextFile(keys) ?? "";

    if (!data.split("\n").includes(entry)) {
        appendFileSync(keys, `${entry}\n`);
    }
}

export function acceptFirstApply(mirror: string, sha: string): void {
    const pub = signaturePubkeyLine(mirror, sha);
    const fp = pub ? fingerprintOfPubkeyLine(pub) : undefined;

    if (pub && fp && pubkeyVerifiesCommit(mirror, sha, pub)) {
        rememberSigner(pub);
        log.info(`已信任签名者 ${fp}`);

        return;
    }

    log.info(`本机首次应用;提交 ${sha} 未签名`);
    log.info("之后的 apply 需要可信签名");
}

/** 没有信任密钥的机器可以钉住这一个提交的签名者;
 *  之后来自其他密钥的提交仍被拒绝。 */
export async function trustSignerOfCommit(mirror: string, sha: string, allowPrompt: boolean): Promise<void> {
    const pub = signaturePubkeyLine(mirror, sha);
    const fp = pub ? fingerprintOfPubkeyLine(pub) : undefined;

    if (trustedKeysPresent()) {
        if (fp) {
            die(`提交 ${sha} 由 ${fp} 签名,不在 ${paths.trustedKeysFile} 里。拒绝应用。`);
        }

        die(`提交 ${sha} 不是由 ${paths.trustedKeysFile} 里的密钥签名的。拒绝应用。`);
    }

    if (!pub || !fp || !pubkeyVerifiesCommit(mirror, sha, pub)) {
        die(`提交 ${sha} 未签名。拒绝应用。`);
    }

    if (!allowPrompt) {
        if (stdinIsTty()) {
            log.info("这台机器还没有信任过签名密钥");
            log.info(`提交 ${sha} 由 ${fp} 签名`);

            if (!(await confirm("信任这把密钥并应用?"))) {
                die("未信任该签名密钥");
            }
        } else {
            die(`提交 ${sha} 由 ${fp} 签名,而本机还没信任过签名密钥。在终端里运行 apply 并确认,或加 --trust-signer。`);
        }
    }

    rememberSigner(pub);
    log.info(`已信任签名者 ${fp}`);
}

export function requireTrustedCommit(mirror: string, sha: string): void {
    if (!isFullSha(sha)) {
        die(`拒绝未钉住的版本: ${sha}`);
    }

    if (!commitIsTrusted(mirror, sha)) {
        die(`提交 ${sha} 不是由 ${paths.trustedKeysFile} 里的密钥签名的。拒绝应用。`);
    }
}

export type SignatureState = "trusted" | "untrusted" | "none";

/** 返回签名状态与指纹(指纹可能为空串) */
export function commitSignatureState(mirror: string, sha: string): { state: SignatureState; fingerprint: string } {
    let state: SignatureState = "none";

    if (commitIsTrusted(mirror, sha)) {
        state = "trusted";
    }

    const pub = signaturePubkeyLine(mirror, sha);
    const fp = (pub ? fingerprintOfPubkeyLine(pub) : undefined) ?? "";

    if (state === "none" && pub && fp !== "" && pubkeyVerifiesCommit(mirror, sha, pub)) {
        state = "untrusted";
    }

    return { state, fingerprint: fp };
}

export function preparePushBranch(mirror: string, branch: string): void {
    git(["-C", mirror, "checkout", "-q", "-B", branch]);
}

// ===== 签名密钥管理 =====

export function recordTrustedSigner(keyType: string, keyData: string, priv?: string): void {
    if (!keyType.startsWith("ssh-")) {
        die("不是 ssh 公钥");
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(keyData)) {
        die("ssh 公钥格式不对");
    }

    if (priv) {
        if (!isFile(priv)) {
            die(`私钥不存在: ${priv}`);
        }

        refuseInsideMirror(priv);
    }

    let email = configGet("SIGNING_EMAIL", readTextFile);

    if (!email) {
        email = "omarsync@localhost";
        configSet("SIGNING_EMAIL", email);
    }

    const keys = paths.trustedKeysFile;

    refuseInsideMirror(keys);
    mkdirSync(dirname(keys), { recursive: true });

    if (!isFile(keys)) {
        writeFileSync(keys, "");
    }

    chmodSync(keys, 0o644);

    const entry = `${email} namespaces="git" ${keyType} ${keyData}`;
    const data = readTextFile(keys) ?? "";

    if (!data.split("\n").includes(entry)) {
        appendFileSync(keys, `${entry}\n`);
    }

    if (priv) {
        configSet("SIGNING_KEY", priv);
    }

    log.info(`已为 ${email} 信任 ${keyType} 密钥`);
}

/** 私钥可以无密码签名时,输出其公钥行;否则返回 undefined */
export function privateKeyPub(priv: string | undefined): string | undefined {
    if (!priv || !isFile(priv)) {
        return undefined;
    }

    if (isDir(paths.mirrorDir)) {
        const realPath = realpath(priv);
        const realMirror = realpath(paths.mirrorDir);

        if (!realPath || !realMirror || pathWithin(realPath, realMirror)) {
            return undefined;
        }
    }

    // 组/其他人可写则拒绝
    if ((statSync(priv).mode & 0o022) !== 0) {
        return undefined;
    }

    const keygen = resolveTool("ssh-keygen");

    if (!keygen) {
        return undefined;
    }

    const { code, stdout } = capture(keygen, ["-y", "-f", priv, "-P", ""]);

    if (code !== 0) {
        return undefined;
    }

    const pub = stdout.trim();

    return /^ssh-[a-z0-9-]+\s+[A-Za-z0-9+/=]+/.test(pub) ? pub : undefined;
}

export function dedicatedSigningKey(): string {
    return `${dirname(paths.trustedKeysFile)}/signing_key`;
}

export function createDedicatedSigningKey(priv: string): void {
    if (exists(priv) || exists(`${priv}.pub`)) {
        die(`无法在 ${priv} 创建签名密钥`);
    }

    refuseInsideMirror(priv);
    mkdirSync(dirname(priv), { recursive: true });

    const keygen = resolveTool("ssh-keygen");

    if (!keygen) {
        die("ssh-keygen 不可用");
    }

    if (!run(keygen, ["-q", "-t", "ed25519", "-f", priv, "-N", "", "-C", `omarsync@${hostnameSafe()}`])) {
        die("创建签名密钥失败");
    }

    chmodSync(priv, 0o600);
}

/** push 依次尝试:配置的密钥 → 无密码的 ~/.ssh/id_ed25519 → 专用密钥 */
export function ensurePushSigner(): void {
    const home = dirname(dirname(paths.trustedKeysFile));
    let priv: string;
    let pub: string | undefined;

    const configured = configGet("SIGNING_KEY", readTextFile);

    if (configured) {
        pub = privateKeyPub(configured);

        if (!pub) {
            die(`SIGNING_KEY 无法免密签名: ${configured}`);
        }

        priv = configured;
    } else {
        const defaultKey = `${home}/.ssh/id_ed25519`;

        pub = privateKeyPub(defaultKey);

        if (pub) {
            priv = defaultKey;
            log.info("使用 ~/.ssh/id_ed25519 签名");
        } else {
            priv = dedicatedSigningKey();
            pub = privateKeyPub(priv);

            if (!pub) {
                createDedicatedSigningKey(priv);
                pub = privateKeyPub(priv);

                if (!pub) {
                    die("创建签名密钥失败");
                }
            }

            log.info(`使用 ${priv} 签名`);
        }
    }

    const [keyType, keyData] = pub.split(/\s+/);

    recordTrustedSigner(keyType!, keyData!, priv);
}

/** 远程尖端必须已由可信密钥签名。没有这道检查就不能变基,也不能补签名。 */
export function requireTrustedRemoteTip(mirror: string, sha: string): void {
    if (!commitIsTrusted(mirror, sha)) {
        die(`远程提交 ${sha} 不是可信签名。拒绝合并,也不会为它签名。`);
    }
}

/** 只为调用方已经审阅过的那棵树补签名。树不一致就拒绝,空提交也不会改树。 */
export function signReviewedTip(mirror: string, reviewedTree: string): void {
    if (!isFullSha(reviewedTree)) {
        die("拒绝为未经审阅的树签名");
    }

    const tree = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);

    if (tree !== reviewedTree) {
        die("拒绝为未经审阅的树签名");
    }

    const sha = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);

    if (sha && commitIsTrusted(mirror, sha)) {
        return;
    }

    log.info("为已审阅的快照补签名");

    if (!git(["-C", mirror, "commit", "-S", "--allow-empty", "-m", `sign snapshot from ${hostnameSafe()} @ ${iso8601()}`])) {
        die("签名失败,未推送");
    }

    const signedTree = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
    const signed = gitOut(["-C", mirror, "rev-parse", "--verify", "--quiet", "HEAD"]);

    if (signedTree !== reviewedTree || !signed || !commitIsTrusted(mirror, signed)) {
        die("签名没有覆盖已审阅的树,未推送");
    }
}

/** trust-key 子命令 */
export function cmdTrustKey(pubFile: string | undefined, priv?: string): void {
    if (!pubFile || !isFile(pubFile)) {
        die("用法: omarsync trust-key --pubkey <ssh公钥> [--privkey 私钥]");
    }

    refuseInsideMirror(pubFile);

    if (priv && !isFile(priv)) {
        die(`私钥不存在: ${priv}`);
    }

    if (priv) {
        refuseInsideMirror(priv);
    }

    const [keyType, keyData] = (readTextFile(pubFile) ?? "").trim().split(/\s+/);

    if (!keyType) {
        die("不是 ssh 公钥");
    }

    recordTrustedSigner(keyType, keyData ?? "", priv);
}
