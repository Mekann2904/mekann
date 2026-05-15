/**
 * Sandbox Extension — macOS Seatbelt によるコマンドサンドボックス化。
 * SECURITY SCOPE: Only the bash tool is sandboxed. Other tools are NOT sandboxed.
 * Fail-closed: sandbox-exec unavailable → command REFUSED (no silent fallback).
 * Usage: pi -e ./sandbox [--sandbox-mode read_only] [--no-sandbox] | /sandbox | /sandbox-mode <mode>
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SandboxMode, SandboxPolicy } from "./permissions.js";
import {
	parseSandboxMode,
	modeLabel,
	readOnlyPolicy,
	workspaceWritePolicy,
	yoloPolicy,
} from "./permissions.js";
import { isMacSandboxAvailable, runSandboxedShellMac } from "./macSeatbelt.js";
import { resolveRealPaths, validateWorkspaceRoot } from "./pathPolicy.js";
import { shouldRequestApproval, yoloApprovalMessage, type YoloApprovalState } from "./approvals.js";

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

	// SECURITY: yolo の承認状態
	const yoloState: YoloApprovalState = {
		yoloApproved: false,
	};

	function approveYolo(reason: string): void {
		yoloState.yoloApproved = true;
		yoloState.yoloApprovedAt = new Date();
		yoloState.yoloApprovedReason = reason;
	}

	function resetYoloApproval(): void {
		yoloState.yoloApproved = false;
		yoloState.yoloApprovedAt = undefined;
		yoloState.yoloApprovedReason = undefined;
	}

	// ─── Flags ───────────────────────────────────────────────────────

	pi.registerFlag("no-sandbox", {
		description: "sandbox を無効化する（明示的 opt-out）",
		type: "boolean",
		default: false,
	});

	pi.registerFlag("sandbox-mode", {
		description: "初期 sandbox モード (read_only | workspace_write | yolo)",
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
			case "yolo":
				return yoloPolicy();
		}
	}

	// ─── Elevation hint for error messages ─────────────────────────

	const SANDBOX_BLOCK_HINT =
		" If you believe this command should be allowed, use the request_elevation tool to ask the user for permission.";

	// ─── Bash tool override ──────────────────────────────────────────

	// NOTE: localBash is created lazily on session_start with the correct ctx.cwd.
	type LocalBashWithCwd = ReturnType<typeof createBashTool> & { _cwd: string };
	let localBash: LocalBashWithCwd | null = null;

	/** Get or create localBash with current session cwd. */
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

			// ── Case 2: yolo with explicit approval ────
			if (currentMode === "yolo") {
				if (!yoloState.yoloApproved) {
					const ok = await ctx.ui.confirm(
						"⚠️ Full Access Required",
						yoloApprovalMessage(),
					);
					if (!ok) {
						throw new Error(
							"yolo requires explicit user approval. Use /sandbox-mode yolo to approve.",
						);
					}
										approveYolo("approved via tool execution prompt");
				}
				// Approved yolo: unsandboxed execution
				return getLocalBash().execute(id, params, signal, onUpdate);
			}

			// ── Case 3: sandbox-exec unavailable → REFUSE (fail-closed) ─
			if (!sandboxAvailable) {
				throw new Error(
					"Sandbox is required but /usr/bin/sandbox-exec is not available. " +
					"Commands cannot be executed without sandbox enforcement. " +
					"Use --no-sandbox to explicitly disable sandbox (not recommended)." +
					SANDBOX_BLOCK_HINT,
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
				{ signal },
			);

			const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
			const shown = truncateForLlm(output);

			// Detect sandbox permission errors and add elevation hint
			if (result.code !== 0) {
				const isPermissionError = /Operation not permitted|Permission denied|EPERM|EACCES/.test(shown.text);
				const hint = isPermissionError ? SANDBOX_BLOCK_HINT : "";
				throw new Error(
					`Sandboxed command exited with code ${result.code}${shown.text ? `:\n${shown.text}` : ""}${hint}`,
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

	// ─── Elevation tool (LLM → user permission request) ─────────────

	pi.registerTool({
		name: "request_elevation",
		label: "Request Sandbox Elevation",
		description:
			"Request temporary sandbox elevation to run a command that is blocked by the current sandbox policy. " +
			"The user will be shown the reason and command, and must explicitly approve. " +
			"Use this ONLY when the sandbox blocks a legitimate operation (e.g., installing dependencies, accessing system paths).",
		promptSnippet: "Request temporary sandbox bypass for a blocked command",
		promptGuidelines: [
			"Use request_elevation when sandbox blocks a legitimate command that requires access outside the workspace (e.g., npm install, brew, system tooling).",
			"Always explain why the command needs to run outside the sandbox.",
			"Do NOT use request_elevation for dangerous or destructive operations.",
		],
		parameters: Type.Object({
			command: Type.String({ description: "The command that needs to run outside the sandbox" }),
			reason: Type.String({ description: "Why this command needs to bypass the sandbox" }),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { command, reason } = params;

			if (explicitlyDisabled) {
				return {
					content: [{ type: "text", text: "Sandbox is already disabled (--no-sandbox). Use the bash tool directly." }],
				};
			}

			if (!sandboxEnabled) {
				return {
					content: [{ type: "text", text: "Sandbox is not active. Use the bash tool directly." }],
				};
			}

			const ok = await ctx.ui.confirm(
				"🔓 Sandbox Elevation Request",
				[
					`The agent is requesting temporary sandbox elevation:`,
					"",
					`Command: ${command}`,
					`Reason: ${reason}`,
					"",
					`Current mode: ${modeLabel(currentMode)}`,
					"",
					"Allow this command to run outside the sandbox?",
				].join("\n"),
			);

			if (!ok) {
				return {
					content: [{
						type: "text",
						text: "Elevation denied by user. The command was not executed. " +
							"Consider an alternative approach that works within sandbox constraints, " +
							"or ask the user to run `/sandbox-mode yolo` manually.",
					}],
				};
			}

			// Execute the command unsandboxed
			const result = await getLocalBash().execute(
				`elevated-${Date.now()}`,
				{ command },
				undefined,
				_onUpdate,
			);

			return {
				content: result.content,
				details: {
					...result.details,
					elevated: true,
					originalMode: currentMode,
					reason,
				},
			};
		},
	});

	// SECURITY: When sandbox is active, returning undefined = bypass. Block instead.
	pi.on("user_bash", () => {
		if (explicitlyDisabled) return undefined;
		if (currentMode === "yolo" && yoloState.yoloApproved) return undefined;
		throw new Error(
			"Direct bash execution is blocked when sandbox is active. " +
			"Commands must go through the sandboxed bash tool.",
		);
	});

	// ─── Commands ────────────────────────────────────────────────────

	pi.registerCommand("sandbox", {
		description: "現在の sandbox 設定を表示",
		handler: async (_args, ctx) => {
			const ck = (b: boolean) => b ? "✓" : "✗";
			const roots = (r: string[]) => r.length > 0 ? r.join(", ") : "(cwd)";
			ctx.ui.notify(`Sandbox Status:
  Enabled: ${ck(sandboxEnabled)} | Available: ${ck(sandboxAvailable)} | Explicitly Disabled: ${ck(explicitlyDisabled)}
  Mode: ${currentMode} (${modeLabel(currentMode)}) | CWD: ${currentCwd || "(not initialized)"}
  Workspace Roots: ${roots(resolvedWorkspaceRoots)} | Writable Roots: ${roots(resolvedWritableRoots)}
  Full Access Approved: ${ck(yoloState.yoloApproved)}

NOTE: Only the bash tool is sandboxed. Other tools are NOT sandboxed.`, "info");
		},
	});

	pi.registerCommand("sandbox-mode", {
		description: "sandbox モードを変更",
		getArgumentCompletions(prefix: string) {
			return ["read_only", "workspace_write", "yolo"]
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
					`Invalid mode: ${modeStr}. Use: read_only, workspace_write, yolo`,
					"error",
				);
				return;
			}

			// SECURITY: yolo requires explicit approval
			if (newMode === "yolo") {
				const ok = await ctx.ui.confirm(
					"⚠️ Disable Sandbox?",
					yoloApprovalMessage(),
				);
				if (!ok) {
					ctx.ui.notify("Mode change cancelled", "info");
					return;
				}
								approveYolo("approved via /sandbox-mode command");
			} else {
				resetYoloApproval();
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

		const icon = currentMode === "yolo" ? "⚠️" : "🔒";
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

		sandboxAvailable = await isMacSandboxAvailable();

		const modeFlag = pi.getFlag("sandbox-mode") as string;
		if (modeFlag) {
			const parsed = parseSandboxMode(modeFlag);
			if (parsed) currentMode = parsed;
			else ctx.ui.notify(`Invalid --sandbox-mode: ${modeFlag}. Using default: workspace_write`, "warning");
		}

		// SECURITY: yolo requires approval even at startup
		if (currentMode === "yolo") {
			const ok = await ctx.ui.confirm(
				"⚠️ Sandbox Mode: Full Access",
				`The sandbox mode is set to yolo.\n\n${yoloApprovalMessage()}`,
			);
			if (ok) {
								approveYolo("approved at session_start");
			} else {
				currentMode = "workspace_write";
				resetYoloApproval();
				ctx.ui.notify(
					"yolo not approved. Falling back to workspace_write.",
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

		try {
			const resolved = await resolveRealPaths([ctx.cwd]);
			resolvedWorkspaceRoots = resolved;
			resolvedWritableRoots = resolved;
		} catch {
			resolvedWorkspaceRoots = [ctx.cwd];
			resolvedWritableRoots = [ctx.cwd];
		}

		if (!sandboxAvailable && currentMode !== "yolo") {
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
				resetYoloApproval();
	});
}
