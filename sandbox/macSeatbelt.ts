/**
 * macOS Seatbelt — SBPL ポリシー生成 + sandbox-exec spawn wrapper。
 *
 * Design principles:
 *   - danger_full_access 以外は default deny
 *   - sandbox-exec は絶対パス /usr/bin/sandbox-exec 固定（PATH 探索回避）
 *   - /bin/bash を明示的に使用（Homebrew bash 依存を回避）
 *
 * Security hardening (v4):
 *   - /usr を細分化: /usr/bin, /usr/sbin, /usr/lib, /usr/libexec, /usr/share のみ
 *   - per-run isolated temp directory（command ごとに作成・終了後に削除）
 *   - per-run isolated HOME directory（workspace/cwd にしない）
 *   - /bin/bash --noprofile --norc -c で startup files を読み込まない
 *   - PATH は固定値（process.env.PATH をそのまま渡さない）
 *   - process group kill（detached + process.kill(-pgid)）
 *   - idempotent cleanup（複数回 kill が安全）
 *   - AbortSignal を tool から伝播
 *   - maxOutputBytes は stdout + stderr の合計で制限
 *   - API: runSandboxedShellMac(command: string, ...) で shell string runner を明示
 */

import { spawn } from "node:child_process";
import { access, constants, realpath, readFile, mkdir } from "node:fs/promises";
import { relative, isAbsolute, resolve, dirname, join as pathJoin } from "node:path";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import type { SandboxPolicy } from "./permissions.js";
import { resolveSafeRealPath, checkUnsafeRoot } from "./pathPolicy.js";

export interface RunResult {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

/** runSandboxedShellMac のオプション。 */
export interface SandboxRunOptions {
	/** タイムアウト（ms）。デフォルト 120000。 */
	timeoutMs?: number;
	/** stdout+stderr の合計最大バイト数。超過したら kill してエラー。デフォルト 5 MB。 */
	maxOutputBytes?: number;
	/** AbortSignal。tool execution から伝播させる。 */
	signal?: AbortSignal;
}

// ─── SBPL helpers ────────────────────────────────────────────────

/** SBPL 文字列リテラル内のエスケープ。 */
export function escapeSbplString(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** SBPL (literal "...") 形式のパス。 */
export function pathLiteral(p: string): string {
	return `(literal "${escapeSbplString(resolve(p))}")`;
}

/** SBPL (subpath "...") 形式のパス。 */
export function pathSubpath(p: string): string {
	return `(subpath "${escapeSbplString(resolve(p))}")`;
}

// ─── Environment allowlist ──────────────────────────────────────

/**
 * sandbox 用 PATH を構築する。
 *
 * SECURITY: process.env.PATH をそのまま渡さない。
 * allowHomebrewPaths=false では Homebrew 系パスを含めない。
 */
function buildSandboxPath(allowHomebrewPaths: boolean): string {
	const segments = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"];
	if (allowHomebrewPaths) {
		segments.push("/opt/homebrew/bin", "/usr/local/bin");
	}
	return segments.join(":");
}

/**
 * sandbox 用環境変数を構築する。
 *
 * SECURITY: process.env を spread せず、明示的に許可した変数だけを渡す。
 * secrets (OPENAI_API_KEY, GITHUB_TOKEN, AWS_*, etc.) はデフォルトで含まない。
 * PATH は固定値。HOME は isolated temp home に設定（workspace/cwd にはしない）。
 */
export function buildSandboxEnv(policy: SandboxPolicy, isolatedHome: string): NodeJS.ProcessEnv {
	const allowHomebrew = policy.allowHomebrewPaths ?? false;

	const env: NodeJS.ProcessEnv = {
		PATH: buildSandboxPath(allowHomebrew),
		SHELL: "/bin/bash",
		TERM: process.env.TERM ?? "xterm-256color",
		LANG: process.env.LANG ?? "C.UTF-8",
		// SECURITY: HOME is set to isolated temp home, NOT workspace/cwd.
		// This prevents child processes from reading user's $HOME config files
		// or workspace-controlled startup files (.bash_profile, .profile, etc.).
		HOME: isolatedHome,
		GIT_TERMINAL_PROMPT: "0",
	};

	// LC_ALL: only pass through if already set
	if (process.env.LC_ALL) {
		env.LC_ALL = process.env.LC_ALL;
	}

	// TMPDIR: set to per-run isolated temp directory if available.
	// This replaces broad system TMPDIR access with a dedicated directory.
	if (policy._isolatedTempDir) {
		env.TMPDIR = policy._isolatedTempDir;
	}

	return env;
}

// ─── .git pointer resolution ─────────────────────────────────────

/**
 * .git が file（pointer file）の場合、gitdir を解決する。
 * .git が directory の場合はそのまま返す。
 * 解決に失敗した場合は空配列を返す（安全側）。
 *
 * Supports:
 *   - `.git` file with `gitdir: /path/to/gitdir`
 *   - Regular `.git` directory (returns [".git"])
 */
export async function resolveGitdirPaths(
	workspaceRoot: string,
): Promise<string[]> {
	const gitPath = resolve(workspaceRoot, ".git");
	const results: string[] = [];

	try {
		const stat = await import("node:fs/promises").then((fs) => fs.stat(gitPath));
		if (stat.isDirectory()) {
			results.push(gitPath);
		} else if (stat.isFile()) {
			// pointer file: read and parse gitdir
			const content = await readFile(gitPath, "utf8");
			const match = content.match(/^gitdir:\s*(.+)$/m);
			if (match?.[1]) {
				let gitdir = match[1].trim();
				// Resolve relative paths against workspace root
				if (!isAbsolute(gitdir)) {
					gitdir = resolve(workspaceRoot, gitdir);
				}
				// Resolve through realpath
				try {
					gitdir = await realpath(gitdir);
				} catch {
					// If realpath fails, use the resolved path as-is
				}
				results.push(gitdir);
			}
			// Also protect the .git pointer file itself
			results.push(gitPath);
		}
	} catch {
		// .git doesn't exist or is inaccessible — safe side: no extra paths
	}

	return results;
}

// ─── Effective roots computation (shared by validatePolicy + buildMacSeatbeltPolicy) ──

function effectiveReadableRoots(policy: SandboxPolicy): string[] {
	return policy.workspaceRoots.length > 0 ? policy.workspaceRoots : [policy.cwd];
}

function effectiveWritableRoots(policy: SandboxPolicy): string[] {
	return policy.mode === "workspace_write"
		? policy.writableRoots.length > 0 ? policy.writableRoots : [policy.cwd]
		: [];
}

// ─── Policy validation ──────────────────────────────────────────

/**
 * SandboxPolicy のセキュリティ検証。
 *
 * - workspaceRoots が安全でないパス（/, $HOME, /Users）でないことを確認
 * - writableRoots が workspaceRoots 配下にあることを確認
 * - danger_full_access 以外で / や $HOME 全体を writableRoots にできないことを確認
 * - symlink 経由の脱出も検出する
 */
export async function validatePolicy(policy: SandboxPolicy): Promise<void> {
	// danger_full_access は sandbox なし（検証不要）
	if (policy.mode === "danger_full_access") return;

	// SECURITY: Compute effective roots the same way buildMacSeatbeltPolicy does.
	// If rRoots is empty, cwd becomes the effective workspace root.
	// If writableRoots is empty in workspace_write mode, cwd becomes the effective writable root.
	// We must validate ALL effective roots, not just the explicitly-provided ones.
	const rRoots = effectiveReadableRoots(policy);
	const wRoots = effectiveWritableRoots(policy);

	// Validate effective rRoots for unsafe paths
	for (const root of rRoots) {
		const unsafeReason = await checkUnsafeRoot(root);
		if (unsafeReason) {
			throw new Error(unsafeReason);
		}
	}

	// read_only は writableRoots が空であるべき
	if (policy.mode === "read_only" && policy.writableRoots.length > 0) {
		throw new Error(
			`read_only mode must not have writableRoots, got: ${policy.writableRoots.join(", ")}`,
		);
	}

	// Validate effective writableRoots for unsafe paths
	for (const wr of wRoots) {
		const unsafeReason = await checkUnsafeRoot(wr);
		if (unsafeReason) {
			throw new Error(`writable ${unsafeReason}`);
		}
	}

	const resolvedWorkspaceRoots = await Promise.all(
		rRoots.map((p) => resolveSafeRealPath(p)),
	);

	for (const wr of wRoots) {
		const resolvedWr = await resolveSafeRealPath(wr);

		// rRoots 配下かチェック
		const isInside = resolvedWorkspaceRoots.some((root) => {
			const rel = relative(root, resolvedWr);
			return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
		});

		if (!isInside) {
			throw new Error(
				`writable root "${wr}" (resolved: "${resolvedWr}") is outside workspace roots [${resolvedWorkspaceRoots.join(", ")}]`,
			);
		}
	}
}

// ─── SBPL policy builder ─────────────────────────────────────────

/**
 * SandboxPolicy から macOS Seatbelt SBPL を生成する。
 *
 * - danger_full_access: (allow default) のみ返す
 * - read_only / workspace_write: (deny default) から必要許可だけを戻す
 *
 * SECURITY: deny rules MUST come after all allow rules.
 * macOS Seatbelt evaluates rules in order — LAST matching rule wins.
 */
export function buildMacSeatbeltPolicy(policy: SandboxPolicy): string {
	// danger_full_access は sandbox なし
	if (policy.mode === "danger_full_access") {
		return `
(version 1)
(allow default)
`;
	}

	const readableRoots = effectiveReadableRoots(policy);

	// writable roots: workspace_write で writableRoots があればそれ、なければ cwd
	const writableRoots = effectiveWritableRoots(policy);

	const readRules = readableRoots.map((p) => `  ${pathSubpath(p)}`).join("\n");
	const writeRules = writableRoots.map((p) => `  ${pathSubpath(p)}`).join("\n");

	const networkRules = policy.network
		? `
; network access (explicitly opted in)
(allow network-outbound)
(allow network-inbound)
`
		: "";

	const writeSection =
		writeRules.length > 0
			? `
; user-selected writable roots
(allow file-write*
${writeRules}
)
`
			: "";

	// Optional: homebrew paths.
	// Only included when allowHomebrewPaths is explicitly set.
	// SECURITY: /usr is NOT granted as a whole — only specific subdirs.
	// /opt/homebrew and /usr/local are ONLY readable when this flag is true.
	const homebrewSection =
		policy.allowHomebrewPaths
			? `
; homebrew: needed for tools installed via brew (node, python, etc.)
; Only included when allowHomebrewPaths is explicitly set
(allow file-read*
  (subpath "/opt/homebrew")
  (subpath "/usr/local")
)
`
			: "";

	// Per-run isolated temp directory.
	// SECURITY: NOT the broad system TMPDIR. This is a dedicated directory
	// created for this specific command invocation, cleaned up after exit.
	// Includes the isolated HOME subdirectory.
	const tmpDirSection = policy._isolatedTempDir
		? `
; Per-run isolated temp directory (not system TMPDIR)
; Created for this specific command invocation, cleaned up after exit
; Includes isolated HOME directory to prevent workspace startup file injection
(allow file-read* file-write*
  ${pathSubpath(policy._isolatedTempDir)}
)
`
		: "";

	// SECURITY: In read_only mode, explicitly deny writes to all readable roots.
	// This is necessary because temp dir write access may overlap with
	// the workspace when the workspace is created inside temp.
	const readOnlyDenySection =
		policy.mode === "read_only"
			? `
; SECURITY: read_only mode — explicitly deny writes to workspace roots
${readableRoots.map((p) => `(deny file-write* ${pathSubpath(p)})`).join("\n")}
`
			: "";

	// Resolved .git directories (pointer files, worktrees)
	// These get write deny rules in addition to the regex pattern
	const gitdirDenyRules = (policy._resolvedGitdirs ?? [])
		.map((g) => `(deny file-write* ${pathSubpath(g)})`)
		.join("\n");
	const gitdirDenySection = gitdirDenyRules.length > 0
		? `
; Resolved .git directories (pointer files / worktrees / submodules)
${gitdirDenyRules}
`
		: "";

	return `
(version 1)

; closed by default
(deny default)

; allow command execution inside the same sandbox
(allow process-exec)
(allow process-fork)
; SECURITY: signal restricted to same-sandbox processes only
(allow signal (target same-sandbox))
; SECURITY: process-info restricted to same-sandbox processes only
(allow process-info* (target same-sandbox))

; basic devices / tty behavior
(allow file-read* file-write* file-ioctl ${pathLiteral("/dev/null")})
(allow file-read* file-write* file-ioctl ${pathLiteral("/dev/ptmx")})
(allow file-read* ${pathLiteral("/dev/tty")})
(allow file-read* ${pathLiteral("/dev/urandom")})
(allow pseudo-tty)

; macOS process initialization
; NOTE: sysctl-read is kept because many CLI tools require it.
; sysctl only exposes kernel state, not user data.
; Known limitation: could be restricted to specific sysctls in the future.
(allow sysctl-read)
(allow ipc-posix-shm)
; NOTE: mach-lookup is kept because restricting it breaks
; DNS resolution, IPC, and many system services.
; Known limitation: could be restricted to specific services.
(allow mach-lookup)
(allow file-read-metadata)

; ─── System read paths (minimum set) ──────────────────────────
; SECURITY: (literal "/") is required for bash to stat root during init.
; /Users, /Library, /opt, /var are NOT included.
; /usr is NOT included as a whole — only specific subdirectories.
; /usr/local is ONLY readable via allowHomebrewPaths.
(allow file-read*
  (literal "/")
  (subpath "/bin")
  (subpath "/sbin")
  (subpath "/usr/bin")
  (subpath "/usr/sbin")
  (subpath "/usr/lib")
  (subpath "/usr/libexec")
  (subpath "/usr/share")
  (subpath "/System")
  (literal "/etc")
  (subpath "/etc")
  (subpath "/dev")
)

; user-selected readable roots
(allow file-read*
${readRules}
)
${writeSection}
${networkRules}
${homebrewSection}
${tmpDirSection}

; ═══════════════════════════════════════════════════════════════
; SECURITY: Deny rules come LAST.
; macOS Seatbelt: LAST matching rule wins.
; ═══════════════════════════════════════════════════════════════

; protect repo metadata even when workspace is writable
(deny file-write*
  (regex #"(^|.*/)(\\.git|\\.codex|\\.agents)(/.*)?$")
)
${gitdirDenySection}
${readOnlyDenySection}
`;
}

// ─── Preflight ───────────────────────────────────────────────────

/** macOS で sandbox-exec が利用可能かを非例外で返す。 */
export async function isMacSandboxAvailable(): Promise<boolean> {
	if (process.platform !== "darwin") return false;
	try {
		await access("/usr/bin/sandbox-exec", constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

// ─── Path resolution ─────────────────────────────────────────────

async function resolvePolicyPaths(policy: SandboxPolicy): Promise<SandboxPolicy> {
	const cwd = await resolveSafeRealPath(policy.cwd);
	const workspaceRoots = await Promise.all(policy.workspaceRoots.map((p) => resolveSafeRealPath(p)));
	const writableRoots = await Promise.all(policy.writableRoots.map((p) => resolveSafeRealPath(p)));

	// Resolve .git pointer files for each workspace root
	const gitdirSets = await Promise.all(workspaceRoots.map(resolveGitdirPaths));
	const resolvedGitdirs = gitdirSets.flat();

	return {
		...policy,
		cwd,
		workspaceRoots,
		writableRoots,
		_resolvedGitdirs: resolvedGitdirs,
	};
}

// ─── Constants ───────────────────────────────────────────────────

/** sandbox-exec の絶対パス。PATH 探索は行わない。 */
const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** デフォルトのタイムアウト（ms）。 */
const DEFAULT_TIMEOUT_MS = 120_000;

/** デフォルトの最大出力バイト数。 */
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB

/** SIGTERM 後に SIGKILL するまでの猶予（ms）。 */
const SIGKILL_GRACE_MS = 5_000;

// ─── Per-run temp directory ──────────────────────────────────────

/**
 * per-run 専用の一時ディレクトリを作成する。
 * command の実行期間のみ存在し、終了後に cleanup する。
 *
 * SECURITY: system TMPDIR を広く許可せず、
 * 専用ディレクトリのみ read/write を許可する。
 */
function createIsolatedTempDir(): string {
	return mkdtempSync(resolve(tmpdir(), "sandbox-run-"));
}

/**
 * 一時ディレクトリを cleanup する。
 * 失敗しても例外を投げず、warning 扱いにする。
 * 複数回呼ばれても安全（idempotent）。
 */
function cleanupTempDir(dir: string): void {
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {
		// cleanup failure is a warning, not an error.
		// The temp dir will be cleaned up by the OS eventually.
	}
}

// ─── Process group cleanup helper ───────────────────────────────

/** Send SIGKILL to a process group (idempotent — ignores already-dead processes). */
function killPgSigkill(proc: ReturnType<typeof spawn>): void {
	try {
		if (proc.pid) process.kill(-proc.pid, "SIGKILL");
	} catch {
		// already dead — idempotent
	}
}

/**
 * Process group が完全に終了するのを待つ。
 * close handler の外（timeout/abort path）から呼ばれる。
 * SIGKILL safety net を送り、close event を待つ。
 */
function waitForProcessDeath(
	proc: ReturnType<typeof spawn>,
	timeoutMs: number,
): Promise<void> {
	return new Promise<void>((resolvePromise) => {
		let resolved = false;

		const done = () => {
			if (resolved) return;
			resolved = true;
			resolvePromise();
		};

		// Safety net: send SIGKILL to process group
		killPgSigkill(proc);

		// Wait for 'close' event (all stdio streams closed + process exited)
		proc.once("close", done);

		// Timeout fallback in case 'close' never fires
		setTimeout(() => {
			proc.removeListener("close", done);
			done();
		}, timeoutMs);
	});
}

// ─── Sandboxed execution ─────────────────────────────────────────

/**
 * sandbox-exec 経由で shell command string を実行する。
 *
 * - command は shell string として /bin/bash --noprofile --norc -c に渡される
 * - sandbox-exec は絶対パス固定
 * - stdout / stderr / exit code をキャプチャ
 * - timeout / abort / output cap 対応
 * - process group kill（孫/background プロセスも終了）
 * - SIGTERM 後、SIGKILL_GRACE_MS で SIGKILL、'close' event を待つ
 * - per-run isolated temp directory を作成・終了後に cleanup
 * - per-run isolated HOME directory（workspace/cwd にしない）
 * - maxOutputBytes は stdout + stderr の合計で制限
 *
 * API: This is a shell string runner. The command parameter is a shell command
 * string, NOT an argv array.
 */
export async function runSandboxedShellMac(
	command: string,
	policy: SandboxPolicy,
	options?: SandboxRunOptions,
): Promise<RunResult> {
	if (!command || command.trim().length === 0) {
		throw new Error("empty command");
	}

	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	const abortSignal = options?.signal;

	// Resolve paths through realpath to handle symlinks
	const resolvedPolicy = await resolvePolicyPaths(policy);

	// Validate policy before execution
	await validatePolicy(resolvedPolicy);

	// Create per-run isolated temp directory
	const rawIsolatedTemp = createIsolatedTempDir();
	// Resolve through realpath for macOS /var → /private/var handling
	const isolatedTemp = await resolveSafeRealPath(rawIsolatedTemp);
	resolvedPolicy._isolatedTempDir = isolatedTemp;

	// SECURITY: Create isolated HOME directory under per-run temp.
	// This prevents:
	//   1. workspace-controlled startup file injection (.bash_profile, .profile, etc.)
	//   2. $HOME pointing to user's real home directory
	const isolatedHome = pathJoin(isolatedTemp, "home");
	mkdirSync(isolatedHome, { recursive: true });

	const fullPolicy = buildMacSeatbeltPolicy(resolvedPolicy);
	const sandboxEnv = buildSandboxEnv(resolvedPolicy, isolatedHome);

	// SECURITY: Use /bin/bash --noprofile --norc to prevent loading
	// any startup files (.bash_profile, .bash_login, .profile, .bashrc).
	// This prevents workspace-controlled startup file injection.
	const child = spawn(SANDBOX_EXEC, [
		"-p",
		fullPolicy,
		"--",
		"/bin/bash",
		"--noprofile",
		"--norc",
		"-c",
		command,
	], {
		cwd: resolvedPolicy.cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: sandboxEnv,
		detached: true,
	});

	// SECURITY: Track total bytes across stdout + stderr combined.
	// Previous implementation tracked them separately, allowing 2x limit.
	// Uses Buffer-based tracking for byte-accurate truncation (no UTF-16 vs byte mismatch).
	const bufs = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
	let totalOutputBytes = 0;
	let outputExceeded = false;
	let killed = false;

	function onStreamData(stream: "stdout" | "stderr", chunk: Buffer | string): void {
		if (outputExceeded) return;
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
		totalOutputBytes += buf.byteLength;
		if (totalOutputBytes > maxOutputBytes) {
			outputExceeded = true;
			const overshoot = totalOutputBytes - maxOutputBytes;
			const keepBytes = buf.byteLength - overshoot;
			if (keepBytes > 0) {
				bufs[stream] = Buffer.concat([bufs[stream], buf.subarray(0, keepBytes)]);
			}
			requestTerminate("output_limit");
			return;
		}
		bufs[stream] = Buffer.concat([bufs[stream], buf]);
	}

	child.stdout.on("data", (chunk) => onStreamData("stdout", chunk));
	child.stderr.on("data", (chunk) => onStreamData("stderr", chunk));

	// ─── Idempotent process group kill ──────────────────────────

	let sigkillTimeoutId: ReturnType<typeof setTimeout> | null = null;
	let terminationRequested: "timeout" | "abort" | "output_limit" | null = null;

	/** Send signal to process group (idempotent — ignores already-dead processes). */
	function killPg(sig: NodeJS.Signals = "SIGKILL"): void {
		try {
			if (child.pid) process.kill(-child.pid, sig);
		} catch {
			// already dead — idempotent
		}
	}

	/**
	 * Unified termination path for timeout, abort, and output cap exceeded.
	 * SIGTERM → grace → SIGKILL.
	 * Idempotent: first call wins, subsequent calls are no-ops.
	 */
	function requestTerminate(reason: "timeout" | "abort" | "output_limit"): void {
		if (terminationRequested) return;
		terminationRequested = reason;
		killed = true;
		killPg("SIGTERM");
		sigkillTimeoutId = setTimeout(killPg, SIGKILL_GRACE_MS);
	}

	// ─── Timeout handling ───────────────────────────────────────

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let timedOut = false;

	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeoutId = setTimeout(() => {
			timedOut = true;
			requestTerminate("timeout");
			reject(new Error(`command timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	// ─── AbortSignal handling ───────────────────────────────────

	let abortHandler: (() => void) | null = null;

	const abortPromise = new Promise<never>((_resolve, reject) => {
		if (abortSignal) {
			if (abortSignal.aborted) {
				requestTerminate("abort");
				cleanupTempDir(isolatedTemp);
				reject(new Error("command aborted before execution"));
				return;
			}
			abortHandler = () => {
				requestTerminate("abort");
				reject(new Error("command aborted"));
			};
			abortSignal.addEventListener("abort", abortHandler);
		}
	});

	// ─── Main execution promise ─────────────────────────────────

	const execPromise = new Promise<RunResult>((resolvePromise) => {
		child.on("error", (err) => {
			cleanupTimers();
			cleanupTempDir(isolatedTemp);
			// Convert error to a result — don't throw
			resolvePromise({
				code: null,
				signal: null,
				stdout: "",
				stderr: err.message,
			});
		});
		child.on("close", async (code, signal) => {
			cleanupTimers();

			// SECURITY: If this close was triggered by output cap / timeout / abort,
			// requestTerminate already handled the kill sequence.
			// For normal exits (not forced kill), send SIGKILL to process group
			// as a safety net for any residual background processes.
			// Only do this for truly normal exits to avoid PID/PGID reuse risk.
			if (!killed && code !== null) {
				killPg();
				// Give OS a brief moment to clean up residual processes
				await new Promise<void>((r) => setTimeout(r, 200));
			}

			cleanupTempDir(isolatedTemp);

			if (outputExceeded) {
				resolvePromise({
					code: 1,
					signal: null,
					stdout: bufs.stdout.toString("utf8") + "\n[...output truncated...]",
					stderr: bufs.stderr.toString("utf8") + `\n[ERROR] output limit exceeded (${maxOutputBytes} bytes combined stdout+stderr)`,
				});
				return;
			}

			resolvePromise({ code, signal, stdout: bufs.stdout.toString("utf8"), stderr: bufs.stderr.toString("utf8") });
		});
	});

	function cleanupTimers(): void {
		if (timeoutId) clearTimeout(timeoutId);
		if (sigkillTimeoutId) clearTimeout(sigkillTimeoutId);
		if (abortSignal && abortHandler) {
			abortSignal.removeEventListener("abort", abortHandler);
		}
	}

	try {
		return await Promise.race([execPromise, timeoutPromise, abortPromise]);
	} catch (err) {
		// For timeout/abort, we need to wait for the process to actually die
		// before returning, to ensure cleanup is complete.

		// Wait for grace period + close event
		await waitForProcessDeath(child, SIGKILL_GRACE_MS + 1000);
		cleanupTempDir(isolatedTemp);

		// For timeout/abort, return a result object instead of throwing
		return {
			code: null,
			signal: "SIGTERM",
			stdout: bufs.stdout.toString("utf8") + (outputExceeded ? "\n[...output truncated...]" : ""),
			stderr: bufs.stderr.toString("utf8") + `\n[ERROR] command ${(timedOut ? "timed out" : "aborted")}`,
		};
	}
}
