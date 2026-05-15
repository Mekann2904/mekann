/**
 * macOS Seatbelt — SBPL ポリシー生成 + sandbox-exec spawn wrapper。
 * Design: default deny, fixed sandbox-exec/bash paths, per-run isolated temp+HOME,
 * PATH fixed, process group kill, idempotent cleanup, AbortSignal propagation,
 * stdout+stderr combined output limit, shell string runner API.
 */

import { spawn } from "node:child_process";
import { access, constants, realpath, readFile, mkdir, stat } from "node:fs/promises";
import { relative, isAbsolute, resolve, dirname, join as pathJoin } from "node:path";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import type { SandboxPolicy } from "./permissions.js";
import { resolveSafeRealPath, checkUnsafeRoot } from "./pathPolicy.js";

export interface RunResult { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; }

/** runSandboxedShellMac のオプション。 */
export interface SandboxRunOptions {
	/** タイムアウト（ms）。デフォルト 120000。 */
	timeoutMs?: number;
	/** stdout+stderr 合計最大バイト数。デフォルト 5 MB。 */
	maxOutputBytes?: number;
	/** AbortSignal。tool execution から伝播。 */
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

/** sandbox 用環境変数構築。SECURITY: process.env を spread せず、明示的に許可した変数だけを渡す。 */
export function buildSandboxEnv(policy: SandboxPolicy, isolatedHome: string): NodeJS.ProcessEnv {
	const allowHomebrew = policy.allowHomebrewPaths ?? false;

	const env: NodeJS.ProcessEnv = {
		PATH: ["/usr/bin", "/bin", "/usr/sbin", "/sbin", ...(allowHomebrew ? ["/opt/homebrew/bin", "/usr/local/bin"] : [])].join(":"),
		SHELL: "/bin/bash",
		TERM: process.env.TERM ?? "xterm-256color",
		LANG: process.env.LANG ?? "C.UTF-8",
		// SECURITY: HOME is set to isolated temp home, NOT workspace/cwd.
		HOME: isolatedHome,
		GIT_TERMINAL_PROMPT: "0",
	};
	if (process.env.LC_ALL) env.LC_ALL = process.env.LC_ALL;
	if (policy._isolatedTempDir) env.TMPDIR = policy._isolatedTempDir;
	return env;
}

// ─── .git pointer resolution ─────────────────────────────────────

/** .git ポインタファイル/ディレクトリを解決してパス群を返す。失敗時は空配列。 */
export async function resolveGitdirPaths(
	workspaceRoot: string,
): Promise<string[]> {
	const gitPath = resolve(workspaceRoot, ".git");
	const results: string[] = [];

	try {
		const st = await stat(gitPath);
		if (st.isDirectory()) {
			results.push(gitPath);
		} else if (st.isFile()) {
			const content = await readFile(gitPath, "utf8");
			const match = content.match(/^gitdir:\s*(.+)$/m);
			if (match?.[1]) {
				let gitdir = match[1].trim();
				if (!isAbsolute(gitdir)) gitdir = resolve(workspaceRoot, gitdir);
				try { gitdir = await realpath(gitdir); } catch { /* use resolved path as-is */ }
				results.push(gitdir);
			}
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
	return policy.mode === "workspace_write" ? (policy.writableRoots.length > 0 ? policy.writableRoots : [policy.cwd]) : [];
}

// ─── Policy validation ──────────────────────────────────────────

/** SandboxPolicy のセキュリティ検証。安全でないパス・symlink 脱出を検出。 */
export async function validatePolicy(policy: SandboxPolicy): Promise<void> {
	if (policy.mode === "yolo") return;

	// SECURITY: Validate effective roots (same computation as buildMacSeatbeltPolicy)
	const rRoots = effectiveReadableRoots(policy);
	const wRoots = effectiveWritableRoots(policy);

	for (const root of rRoots) { const reason = await checkUnsafeRoot(root); if (reason) throw new Error(reason); }

	if (policy.mode === "read_only" && policy.writableRoots.length > 0) throw new Error(`read_only mode must not have writableRoots, got: ${policy.writableRoots.join(", ")}`);

	for (const wr of wRoots) { const reason = await checkUnsafeRoot(wr); if (reason) throw new Error(`writable ${reason}`); }

	const resolvedWorkspaceRoots = await Promise.all(rRoots.map(resolveSafeRealPath));

	for (const wr of wRoots) {
		const resolvedWr = await resolveSafeRealPath(wr);
		const isInside = resolvedWorkspaceRoots.some((root) => { const rel = relative(root, resolvedWr); return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)); });
		if (!isInside) throw new Error(`writable root "${wr}" (resolved: "${resolvedWr}") is outside workspace roots [${resolvedWorkspaceRoots.join(", ")}]`);
	}
}

// ─── SBPL policy builder ─────────────────────────────────────────

/** SandboxPolicy から SBPL 生成。deny rules は LAST matching rule wins なので末尾に置く。 */
export function buildMacSeatbeltPolicy(policy: SandboxPolicy): string {
	if (policy.mode === "yolo") return `\n(version 1)\n(allow default)\n`;

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

	// Homebrew paths (only when allowHomebrewPaths set; /usr NOT granted as whole)
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

	// Per-run isolated temp directory (not broad system TMPDIR)
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

	// read_only mode: deny writes to readable roots (temp may overlap workspace)
	const readOnlyDenySection =
		policy.mode === "read_only"
			? `
; SECURITY: read_only mode — explicitly deny writes to workspace roots
${readableRoots.map((p) => `(deny file-write* ${pathSubpath(p)})`).join("\n")}
`
			: "";

	// Resolved .git directories get write deny rules
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
	return process.platform === "darwin" && access("/usr/bin/sandbox-exec", constants.X_OK).then(() => true, () => false);
}

// ─── Path resolution ─────────────────────────────────────────────

async function resolvePolicyPaths(policy: SandboxPolicy): Promise<SandboxPolicy> {
	const cwd = await resolveSafeRealPath(policy.cwd);
	const workspaceRoots = await Promise.all(policy.workspaceRoots.map(resolveSafeRealPath));
	const writableRoots = await Promise.all(policy.writableRoots.map(resolveSafeRealPath));
	const resolvedGitdirs = (await Promise.all(workspaceRoots.map(resolveGitdirPaths))).flat();

	return { ...policy, cwd, workspaceRoots, writableRoots, _resolvedGitdirs: resolvedGitdirs };
}

// ─── Constants ───────────────────────────────────────────────────

const SANDBOX_EXEC = "/usr/bin/sandbox-exec"; // PATH 探索回避
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB
const SIGKILL_GRACE_MS = 5_000;

// ─── Per-run temp directory ──────────────────────────────────────

function cleanupTempDir(dir: string): void {
	try { rmSync(dir, { recursive: true, force: true }); } catch { /* OS will clean up */ }
}

// ─── Process group cleanup helper ───────────────────────────────

/** Send SIGKILL to a process group (idempotent — ignores already-dead processes). */
function killProcessGroup(proc: ReturnType<typeof spawn>, sig: NodeJS.Signals = "SIGKILL"): void {
	try {
		if (proc.pid) process.kill(-proc.pid, sig);
	} catch {
		// already dead — idempotent
	}
}

/** Process group が完全に終了するのを待つ。SIGKILL safety net 付き。 */
function waitForProcessDeath(
	proc: ReturnType<typeof spawn>,
	timeoutMs: number,
): Promise<void> {
	return new Promise<void>((resolvePromise) => {
		let resolved = false;

		const done = () => { if (resolved) return; resolved = true; resolvePromise(); };

		killProcessGroup(proc);
		proc.once("close", done);
		setTimeout(() => { proc.removeListener("close", done); done(); }, timeoutMs);
	});
}

// ─── Sandboxed execution ─────────────────────────────────────────

/** sandbox-exec 経由で shell command string を実行。timeout/abort/output cap/process group kill 対応。 */
export async function runSandboxedShellMac(
	command: string,
	policy: SandboxPolicy,
	options?: SandboxRunOptions,
): Promise<RunResult> {
	if (!command?.trim()) throw new Error("empty command");
	const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	const abortSignal = options?.signal;
	const resolvedPolicy = await resolvePolicyPaths(policy);
	await validatePolicy(resolvedPolicy);
	const rawIsolatedTemp = mkdtempSync(resolve(tmpdir(), "sandbox-run-"));
	const isolatedTemp = await resolveSafeRealPath(rawIsolatedTemp);
	resolvedPolicy._isolatedTempDir = isolatedTemp;

	// SECURITY: isolated HOME prevents workspace-controlled startup file injection
	const isolatedHome = pathJoin(isolatedTemp, "home");
	mkdirSync(isolatedHome, { recursive: true });
	const fullPolicy = buildMacSeatbeltPolicy(resolvedPolicy);
	const sandboxEnv = buildSandboxEnv(resolvedPolicy, isolatedHome);

	// SECURITY: --noprofile --norc prevents workspace-controlled startup file injection
	const child = spawn(SANDBOX_EXEC, [
		"-p",
		fullPolicy,
		"--",
		"/bin/bash",
		"--noprofile",
		"--norc",
		"-c",
		command,
	], { cwd: resolvedPolicy.cwd, stdio: ["ignore", "pipe", "pipe"], env: sandboxEnv, detached: true });

	// SECURITY: Track total bytes across stdout + stderr combined (Buffer-based, byte-accurate)
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
			if (keepBytes > 0) bufs[stream] = Buffer.concat([bufs[stream], buf.subarray(0, keepBytes)]);
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

	/** Unified termination: SIGTERM → grace → SIGKILL. Idempotent. */
	function requestTerminate(reason: "timeout" | "abort" | "output_limit"): void {
		if (terminationRequested) return;
		terminationRequested = reason;
		killed = true;
		killProcessGroup(child, "SIGTERM");
		sigkillTimeoutId = setTimeout(() => killProcessGroup(child), SIGKILL_GRACE_MS);
	}

	// ─── Timeout handling ───────────────────────────────────────

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	let timedOut = false;
	const timeoutPromise = new Promise<never>((_resolve, reject) => { timeoutId = setTimeout(() => { timedOut = true; requestTerminate("timeout"); reject(new Error(`command timed out after ${timeoutMs}ms`)); }, timeoutMs); });

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
			abortHandler = () => { requestTerminate("abort"); reject(new Error("command aborted")); };
			abortSignal.addEventListener("abort", abortHandler);
		}
	});

	// ─── Main execution promise ─────────────────────────────────

	const execPromise = new Promise<RunResult>((resolvePromise) => {
		child.on("error", (err) => { cleanupTimers(); cleanupTempDir(isolatedTemp); resolvePromise({ code: null, signal: null, stdout: "", stderr: err.message }); });
		child.on("close", async (code, signal) => {
			cleanupTimers();

			// Safety net: kill residual background processes on normal exits
			if (!killed && code !== null) { killProcessGroup(child); await new Promise<void>((r) => setTimeout(r, 200)); }

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
		if (abortSignal && abortHandler) abortSignal.removeEventListener("abort", abortHandler);
	}

	try {
		return await Promise.race([execPromise, timeoutPromise, abortPromise]);
	} catch {
		await waitForProcessDeath(child, SIGKILL_GRACE_MS + 1000);
		cleanupTempDir(isolatedTemp);
		return { code: null, signal: "SIGTERM", stdout: bufs.stdout.toString("utf8") + (outputExceeded ? "\n[...output truncated...]" : ""), stderr: bufs.stderr.toString("utf8") + `\n[ERROR] command ${(timedOut ? "timed out" : "aborted")}` };
	}
}
