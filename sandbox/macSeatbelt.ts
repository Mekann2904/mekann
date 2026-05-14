/**
 * macOS Seatbelt — SBPL ポリシー生成 + sandbox-exec spawn wrapper。
 *
 * Design principles:
 *   - danger_full_access 以外は default deny
 *   - sandbox-exec は絶対パス /usr/bin/sandbox-exec 固定（PATH 探索回避）
 *   - /bin/bash を明示的に使用（Homebrew bash 依存を回避）
 *
 * Security hardening (v3):
 *   - /usr を細分化: /usr/bin, /usr/sbin, /usr/lib, /usr/libexec, /usr/share のみ
 *   - per-run isolated temp directory（command ごとに作成・終了後に削除）
 *   - PATH は固定値（process.env.PATH をそのまま渡さない）
 *   - process group kill（detached + process.kill(-pgid)）
 *   - idempotent cleanup（複数回 kill が安全）
 *   - AbortSignal を tool から伝播
 */

import { spawn } from "node:child_process";
import { access, constants, realpath, readFile } from "node:fs/promises";
import { relative, isAbsolute, resolve, dirname } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import type { SandboxPolicy } from "./permissions.js";

export interface RunResult {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
}

/** runSandboxedMac のオプション。 */
export interface SandboxRunOptions {
	/** タイムアウト（ms）。デフォルト 120000。 */
	timeoutMs?: number;
	/** stdout+stderr の最大バイト数。超過したら kill してエラー。デフォルト 5 MB。 */
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
 * PATH は固定値。HOME は isolated temp home に設定。
 */
export function buildSandboxEnv(policy: SandboxPolicy): NodeJS.ProcessEnv {
	const allowHomebrew = policy.allowHomebrewPaths ?? false;

	const env: NodeJS.ProcessEnv = {
		PATH: buildSandboxPath(allowHomebrew),
		SHELL: "/bin/bash",
		TERM: process.env.TERM ?? "xterm-256color",
		LANG: process.env.LANG ?? "C.UTF-8",
		// HOME is set to sandbox cwd, sandboxHome, or isolated temp home.
		// This prevents child processes from reading user's $HOME config files.
		HOME: policy.sandboxHome ?? policy.cwd,
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

// ─── Policy validation ──────────────────────────────────────────

/**
 * SandboxPolicy のセキュリティ検証。
 *
 * - writableRoots が workspaceRoots 配下にあることを確認
 * - danger_full_access 以外で / や $HOME 全体を writableRoots にできないことを確認
 * - symlink 経由の脱出も検出する
 */
export async function validatePolicy(policy: SandboxPolicy): Promise<void> {
	// danger_full_access は sandbox なし（検証不要）
	if (policy.mode === "danger_full_access") return;

	// read_only は writableRoots が空であるべき
	if (policy.mode === "read_only" && policy.writableRoots.length > 0) {
		throw new Error(
			`read_only mode must not have writableRoots, got: ${policy.writableRoots.join(", ")}`,
		);
	}

	const resolvedWorkspaceRoots = await Promise.all(
		policy.workspaceRoots.map((p) => resolveSafeRealPath(p)),
	);

	for (const wr of policy.writableRoots) {
		const resolvedWr = await resolveSafeRealPath(wr);

		// / や $HOME 全体は不可
		if (resolvedWr === "/") {
			throw new Error("writable root cannot be /");
		}
		const home = process.env.HOME;
		if (home && resolvedWr === await resolveSafeRealPath(home)) {
			throw new Error("writable root cannot be $HOME");
		}

		// workspaceRoots 配下かチェック
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

/** realpath を試み、失敗したら resolve の結果を返す。 */
export async function resolveSafeRealPath(p: string): Promise<string> {
	try {
		return await realpath(resolve(p));
	} catch {
		return resolve(p);
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

	// readable roots: workspaceRoots があればそれ、なければ cwd
	const readableRoots =
		policy.workspaceRoots.length > 0 ? policy.workspaceRoots : [policy.cwd];

	// writable roots: workspace_write で writableRoots があればそれ、なければ cwd
	const writableRoots =
		policy.mode === "workspace_write"
			? policy.writableRoots.length > 0
				? policy.writableRoots
				: [policy.cwd]
			: [];

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
	const tmpDirSection = policy._isolatedTempDir
		? `
; Per-run isolated temp directory (not system TMPDIR)
; Created for this specific command invocation, cleaned up after exit
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

/**
 * macOS + sandbox-exec が利用可能かを検証する。
 * 実行前に呼び出すこと。
 */
export async function assertMacSandboxAvailable(): Promise<void> {
	if (process.platform !== "darwin") {
		throw new Error("macOS Seatbelt sandbox is only available on macOS");
	}
	try {
		await access("/usr/bin/sandbox-exec", constants.X_OK);
	} catch {
		throw new Error(
			"/usr/bin/sandbox-exec not found or not executable. macOS Seatbelt is required.",
		);
	}
}

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

async function resolveRealPath(p: string): Promise<string> {
	try {
		return await realpath(p);
	} catch {
		return resolve(p);
	}
}

async function resolvePolicyPaths(policy: SandboxPolicy): Promise<SandboxPolicy> {
	const cwd = await resolveRealPath(policy.cwd);
	const workspaceRoots = await Promise.all(policy.workspaceRoots.map(resolveRealPath));
	const writableRoots = await Promise.all(policy.writableRoots.map(resolveRealPath));

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
		// In production, this should be logged for visibility.
	}
}

// ─── Sandboxed execution ─────────────────────────────────────────

/**
 * sandbox-exec 経由でコマンドを実行する。
 *
 * - コマンドは argv 配列で渡すこと（文字列連結禁止）
 * - sandbox-exec は絶対パス固定
 * - stdout / stderr / exit code をキャプチャ
 * - timeout / abort / output cap 対応
 * - process group kill（孫/background プロセスも終了）
 * - SIGTERM 後、SIGKILL_GRACE_MS で SIGKILL
 * - per-run isolated temp directory を作成・終了後に cleanup
 */
export async function runSandboxedMac(
	command: string[],
	policy: SandboxPolicy,
	options?: SandboxRunOptions,
): Promise<RunResult> {
	if (command.length === 0) {
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

	const fullPolicy = buildMacSeatbeltPolicy(resolvedPolicy);
	const sandboxEnv = buildSandboxEnv(resolvedPolicy);

	// SECURITY: Always use /bin/bash explicitly.
	// On systems with Homebrew bash, PATH lookup resolves to
	// /opt/homebrew/bin/bash which requires blocked libraries.
	// /bin/bash (Apple system bash) only needs system paths.
	const bashCommand = command.length >= 3 ? command[2] : command.join(" ");

	// SECURITY: Use detached mode for process group management.
	// This allows us to kill the entire process group (including grandchildren
	// and background processes) using process.kill(-child.pid, signal).
	const child = spawn(SANDBOX_EXEC, ["-p", fullPolicy, "--", "/bin/bash", "-lc", bashCommand], {
		cwd: resolvedPolicy.cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: sandboxEnv,
		detached: true,
	});

	let stdout = "";
	let stderr = "";
	let outputExceeded = false;
	let killed = false;

	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");

	child.stdout.on("data", (chunk: string) => {
		stdout += chunk;
		if (Buffer.byteLength(stdout, "utf8") > maxOutputBytes) {
			outputExceeded = true;
			killProcessGroup(child);
		}
	});

	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
		if (Buffer.byteLength(stderr, "utf8") > maxOutputBytes) {
			outputExceeded = true;
			killProcessGroup(child);
		}
	});

	// ─── Idempotent process group kill ──────────────────────────

	function killProcessGroup(proc: ReturnType<typeof spawn>, sig: NodeJS.Signals = "SIGTERM"): void {
		if (killed) return;
		killed = true;
		try {
			// Kill entire process group (negative PID)
			process.kill(-proc.pid!, sig);
		} catch {
			// Process may already be dead — idempotent, ignore
		}
	}

	function killProcessGroupForce(proc: ReturnType<typeof spawn>): void {
		try {
			process.kill(-proc.pid!, "SIGKILL");
		} catch {
			// already dead
		}
	}

	// ─── Timeout handling ───────────────────────────────────────

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let timedOut = false;
	let sigkillTimeoutId: ReturnType<typeof setTimeout> | null = null;

	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeoutId = setTimeout(() => {
			timedOut = true;
			killProcessGroup(child, "SIGTERM");
			// Grace period then SIGKILL
			sigkillTimeoutId = setTimeout(() => {
				killProcessGroupForce(child);
			}, SIGKILL_GRACE_MS);
			reject(new Error(`command timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	// ─── AbortSignal handling ───────────────────────────────────

	let abortHandler: (() => void) | null = null;
	const abortPromise = new Promise<never>((_resolve, reject) => {
		if (abortSignal) {
			if (abortSignal.aborted) {
				killProcessGroup(child);
				cleanupTempDir(isolatedTemp);
				reject(new Error("command aborted before execution"));
				return;
			}
			abortHandler = () => {
				killProcessGroup(child);
				sigkillTimeoutId = setTimeout(() => {
					killProcessGroupForce(child);
				}, SIGKILL_GRACE_MS);
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
		child.on("close", (code, signal) => {
			cleanupTimers();
			cleanupTempDir(isolatedTemp);

			if (outputExceeded) {
				resolvePromise({
					code: 1,
					signal: null,
					stdout: stdout.slice(0, maxOutputBytes),
					stderr: stderr + `\n[ERROR] output limit exceeded (${maxOutputBytes} bytes)`,
				});
				return;
			}

			resolvePromise({ code, signal, stdout, stderr });
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
		// For timeout/abort, return a result object instead of throwing
		return {
			code: null,
			signal: "SIGTERM",
			stdout: stdout.slice(0, maxOutputBytes),
			stderr: stderr + `\n[ERROR] command ${(timedOut ? "timed out" : "aborted")}`,
		};
	}
}
