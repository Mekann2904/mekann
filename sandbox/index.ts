/**
 * Sandbox Extension — macOS Seatbelt によるコマンドサンドボックス化。
 * SECURITY SCOPE: Only the bash tool is sandboxed. Other tools are NOT sandboxed.
 * Fail-closed: sandbox-exec unavailable → command REFUSED (no silent fallback).
 * Usage: pi -e ./sandbox [--sandbox-mode read_only] [--no-sandbox] | /sandbox | /sandbox-mode <mode>
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import type { SandboxMode, SandboxPolicy } from "./permissions.js";
import {
	parseSandboxMode,
	modeLabel,
	readOnlyPolicy,
	workspaceWritePolicy,
	dangerFullAccessPolicy,
} from "./permissions.js";
import { isMacSandboxAvailable, runSandboxedShellMac } from "./macSeatbelt.js";
import { resolveRealPaths, validateWorkspaceRoot } from "./pathPolicy.js";
import { shouldRequestApproval, fullAccessApprovalMessage, type FullAccessApprovalState } from "./approvals.js";

// ─── LLM output truncation ─────────────────────────────────────────

export const DEFAULT_LLM_OUTPUT_MAX_BYTES = 50 * 1024;
export const DEFAULT_LLM_OUTPUT_MAX_LINES = 2000;

export function truncateForLlm(
	text: string,
	opts = {
		maxBytes: DEFAULT_LLM_OUTPUT_MAX_BYTES,
		maxLines: DEFAULT_LLM_OUTPUT_MAX_LINES,
	},
): { text: string; truncated: boolean; originalBytes: number; originalLines: number } {
	const originalBytes = Buffer.byteLength(text, "utf8");
	let lines = text.split(/\r?\n/);
	const originalLines = text.length === 0 ? 0 : lines.length;
	let truncated = false;

	if (lines.length > opts.maxLines) {
		lines = lines.slice(0, opts.maxLines);
		truncated = true;
	}

	let out = lines.join("\n");
	if (Buffer.byteLength(out, "utf8") > opts.maxBytes) {
		out = Buffer.from(out, "utf8").subarray(0, opts.maxBytes).toString("utf8").replace(/\uFFFD$/u, "");
		truncated = true;
	}

	if (truncated) {
		out += `\n\n[...output truncated: original ${originalBytes} bytes, ${originalLines} lines; shown at most ${opts.maxBytes} bytes / ${opts.maxLines} lines...]`;
	}

	return { text: out, truncated, originalBytes, originalLines };
}

export default function sandboxExtension(pi: ExtensionAPI): void {
	// ─── State ───────────────────────────────────────────────────────

	let sandboxEnabled = false;
	let currentMode: SandboxMode = "workspace_write";
	let sandboxAvailable = false;
	let resolvedWorkspaceRoots: string[] = [];
	let resolvedWritableRoots: string[] = [];
	let currentCwd = "";
	// SECURITY: true only when user explicitly opted out via --no-sandbox
	let explicitlyDisabled = false;

	// SECURITY: danger_full_access の承認状態
	const fullAccessState: FullAccessApprovalState = {
		fullAccessApproved: false,
	};

	function approveFullAccess(reason: string): void {
		fullAccessState.fullAccessApproved = true;
		fullAccessState.fullAccessApprovedAt = new Date();
		fullAccessState.fullAccessApprovedReason = reason;
	}

	function resetFullAccessApproval(): void {
		fullAccessState.fullAccessApproved = false;
		fullAccessState.fullAccessApprovedAt = undefined;
		fullAccessState.fullAccessApprovedReason = undefined;
	}

	// ─── Flags ───────────────────────────────────────────────────────

	pi.registerFlag("no-sandbox", {
		description: "sandbox を無効化する（明示的 opt-out）",
		type: "boolean",
		default: false,
	});

	pi.registerFlag("sandbox-mode", {
		description: "初期 sandbox モード (read_only | workspace_write | danger_full_access)",
		type: "string",
		default: "workspace_write",
	});

	// ─── Policy builder ──────────────────────────────────────────────

	function buildCurrentPolicy(): SandboxPolicy {
		switch (currentMode) {
			case "read_only":
				return readOnlyPolicy(currentCwd, resolvedWorkspaceRoots);
			case "workspace_write":
				return workspaceWritePolicy(
					currentCwd,
					resolvedWorkspaceRoots,
					resolvedWritableRoots,
					false, // network は独立制御（デフォルト false）
				);
			case "danger_full_access":
				return dangerFullAccessPolicy();
		}
	}

	// ─── Bash tool override ──────────────────────────────────────────

	// NOTE: localBash is created lazily on session_start with the correct ctx.cwd.
	type LocalBashWithCwd = ReturnType<typeof createBashTool> & { _cwd: string };
	let localBash: LocalBashWithCwd | null = null;

	/**
	 * Get or create localBash with current session cwd.
	 * Ensures unsandboxed execution uses the correct working directory.
	 */
	function getLocalBash(): LocalBashWithCwd {
		const cwd = currentCwd || process.cwd();
		if (!localBash || localBash._cwd !== cwd) {
			localBash = Object.assign(createBashTool(cwd), { _cwd: cwd });
		}
		return localBash;
	}

	// Dummy initial localBash for registerTool spread (will be replaced on session_start)
	const initialBash = createBashTool(process.cwd());

	pi.registerTool({
		...initialBash,
		label: "bash (sandboxed)",
		async execute(id, params, signal, onUpdate, ctx) {
			const command = String(params.command ?? "");

			// ── Case 1: Explicitly disabled via --no-sandbox ─────────
			if (explicitlyDisabled) {
				return getLocalBash().execute(id, params, signal, onUpdate);
			}

			// ── Case 2: danger_full_access with explicit approval ────
			if (currentMode === "danger_full_access") {
				if (!fullAccessState.fullAccessApproved) {
					const ok = await ctx.ui.confirm(
						"⚠️ Full Access Required",
						fullAccessApprovalMessage(),
					);
					if (!ok) {
						throw new Error(
							"danger_full_access requires explicit user approval. Use /sandbox-mode danger_full_access to approve.",
						);
					}
										approveFullAccess("approved via tool execution prompt");
				}
				// Approved danger_full_access: unsandboxed execution
				return getLocalBash().execute(id, params, signal, onUpdate);
			}

			// ── Case 3: sandbox-exec unavailable → REFUSE (fail-closed) ─
			if (!sandboxAvailable) {
				throw new Error(
					"Sandbox is required but /usr/bin/sandbox-exec is not available. " +
					"Commands cannot be executed without sandbox enforcement. " +
					"Use --no-sandbox to explicitly disable sandbox (not recommended).",
				);
			}

			// ── Case 4: Normal sandboxed execution (read_only / workspace_write) ──
			const approval = shouldRequestApproval(currentMode, command);
			if (approval.needsApproval && approval.reason) {
				const ok = await ctx.ui.confirm(
					"⚠️ Command requires approval",
					`Sandbox mode: ${modeLabel(currentMode)}\nCommand: ${command}\nReason: ${approval.reason}\n\nAllow this command?`,
				);
				if (!ok) {
					throw new Error(`Command blocked: ${approval.reason}`);
				}
			}

			// Execute via sandbox (runSandboxedShellMac takes shell string, not argv)
			const policy = buildCurrentPolicy();
			const result = await runSandboxedShellMac(
				command,
				policy,
				{ signal }, // Propagate AbortSignal from tool execution
			);

			const output: string[] = [];
			if (result.stdout) output.push(result.stdout);
			if (result.stderr) output.push(result.stderr);
			const outputText = output.join("\n");
			const shown = truncateForLlm(outputText);

			if (result.code !== 0) {
				throw new Error(
					`Sandboxed command exited with code ${result.code}${shown.text ? `:\n${shown.text}` : ""}`,
				);
			}

			return {
				content: [{ type: "text", text: shown.text || "(no output)" }],
				details: {
					sandboxed: true,
					mode: currentMode,
					exitCode: result.code,
					outputTruncated: shown.truncated,
					originalOutputBytes: shown.originalBytes,
					originalOutputLines: shown.originalLines,
				},
			};
		},
	});

	// SECURITY: When sandbox is active, returning undefined = bypass. Block instead.
	pi.on("user_bash", () => {
		if (explicitlyDisabled) return undefined;
		if (currentMode === "danger_full_access" && fullAccessState.fullAccessApproved) return undefined;
		throw new Error(
			"Direct bash execution is blocked when sandbox is active. " +
			"Commands must go through the sandboxed bash tool.",
		);
	});

	// ─── Commands ────────────────────────────────────────────────────

	pi.registerCommand("sandbox", {
		description: "現在の sandbox 設定を表示",
		handler: async (_args, ctx) => {
			const lines = [
				"Sandbox Status:",
				`  Enabled: ${sandboxEnabled ? "✓" : "✗"}`,
				`  Available: ${sandboxAvailable ? "✓" : "✗"}`,
				`  Explicitly Disabled: ${explicitlyDisabled ? "✓" : "✗"}`,
				`  Mode: ${currentMode} (${modeLabel(currentMode)})`,
				`  CWD: ${currentCwd || "(not initialized)"}`,
				`  Workspace Roots: ${resolvedWorkspaceRoots.length > 0 ? resolvedWorkspaceRoots.join(", ") : "(cwd)"}`,
				`  Writable Roots: ${resolvedWritableRoots.length > 0 ? resolvedWritableRoots.join(", ") : "(cwd)"}`,
				`  Full Access Approved: ${fullAccessState.fullAccessApproved ? "✓" : "✗"}`,
				"",
				"NOTE: Only the bash tool is sandboxed. Other tools are NOT sandboxed.",
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	pi.registerCommand("sandbox-mode", {
		description: "sandbox モードを変更",
		getArgumentCompletions(prefix: string) {
			return ["read_only", "workspace_write", "danger_full_access"]
				.filter((m) => m.startsWith(prefix))
				.map((m) => ({ value: m, label: m }));
		},
		handler: async (args, ctx) => {
			const modeStr = args?.trim();
			if (!modeStr) {
				ctx.ui.notify(
					`Current mode: ${currentMode} (${modeLabel(currentMode)})`,
					"info",
				);
				return;
			}

			const newMode = parseSandboxMode(modeStr);
			if (!newMode) {
				ctx.ui.notify(
					`Invalid mode: ${modeStr}. Use: read_only, workspace_write, danger_full_access`,
					"error",
				);
				return;
			}

			// SECURITY: danger_full_access requires explicit approval
			if (newMode === "danger_full_access") {
				const ok = await ctx.ui.confirm(
					"⚠️ Disable Sandbox?",
					fullAccessApprovalMessage(),
				);
				if (!ok) {
					ctx.ui.notify("Mode change cancelled", "info");
					return;
				}
								approveFullAccess("approved via /sandbox-mode command");
			} else {
				resetFullAccessApproval();
			}

			currentMode = newMode;
			updateStatusBar(ctx);
			ctx.ui.notify(
				`Sandbox mode changed to: ${modeLabel(currentMode)}`,
				"info",
			);
		},
	});

	// ─── Status bar ──────────────────────────────────────────────────

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function updateStatusBar(ctx: any): void {
		if (explicitlyDisabled || !sandboxEnabled) {
			ctx.ui.setStatus("sandbox", undefined);
			return;
		}

		const icon = currentMode === "danger_full_access" ? "⚠️" : "🔒";
		const label = modeLabel(currentMode);
		ctx.ui.setStatus(
			"sandbox",
			ctx.ui.theme.fg("accent", `${icon} Sandbox: ${label}`),
		);
	}

	// ─── Events ──────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;

		// --no-sandbox: explicit opt-out
		const noSandbox = pi.getFlag("no-sandbox") as boolean;
		if (noSandbox) {
			explicitlyDisabled = true;
			sandboxEnabled = false;
			sandboxAvailable = false;
			ctx.ui.notify("Sandbox explicitly disabled via --no-sandbox", "warning");
			return;
		}

		// Check sandbox-exec availability
		sandboxAvailable = await isMacSandboxAvailable();

		// Read initial mode from flag
		const modeFlag = pi.getFlag("sandbox-mode") as string;
		if (modeFlag) {
			const parsed = parseSandboxMode(modeFlag);
			if (parsed) {
				currentMode = parsed;
			} else {
				ctx.ui.notify(
					`Invalid --sandbox-mode: ${modeFlag}. Using default: workspace_write`,
					"warning",
				);
			}
		}

		// SECURITY: danger_full_access requires approval even at startup
		if (currentMode === "danger_full_access") {
			const ok = await ctx.ui.confirm(
				"⚠️ Sandbox Mode: Full Access",
				`The sandbox mode is set to danger_full_access.\n\n${fullAccessApprovalMessage()}`,
			);
			if (ok) {
								approveFullAccess("approved at session_start");
			} else {
				currentMode = "workspace_write";
				resetFullAccessApproval();
				ctx.ui.notify(
					"danger_full_access not approved. Falling back to workspace_write.",
					"warning",
				);
			}
		}

		// SECURITY: FAIL-CLOSED on unsafe workspace root (all modes)
		try {
			await validateWorkspaceRoot(ctx.cwd);
		} catch (e) {
			sandboxEnabled = false;
			ctx.ui.notify(
				`SECURITY: Unsafe workspace root: ${(e as Error).message}. Sandbox disabled for safety. Commands will be REFUSED.`,
				"error",
			);
			return;
		}

		// Resolve paths through realpath
		try {
			resolvedWorkspaceRoots = await resolveRealPaths([ctx.cwd]);
			resolvedWritableRoots = await resolveRealPaths([ctx.cwd]);
		} catch {
			resolvedWorkspaceRoots = [ctx.cwd];
			resolvedWritableRoots = [ctx.cwd];
		}

		if (!sandboxAvailable && currentMode !== "danger_full_access") {
			sandboxEnabled = false;
			ctx.ui.notify(
				"⚠️ Sandbox unavailable on this system. " +
				"Bash commands will be REFUSED. " +
				"Use --no-sandbox to explicitly disable sandbox (not recommended).",
				"error",
			);
			return;
		}

		sandboxEnabled = true;
		updateStatusBar(ctx);
		ctx.ui.notify(
			`Sandbox enabled: ${modeLabel(currentMode)}`,
			"info",
		);
	});

	pi.on("session_shutdown", async () => {
		sandboxEnabled = false;
		sandboxAvailable = false;
		explicitlyDisabled = false;
				resetFullAccessApproval();
	});
}
