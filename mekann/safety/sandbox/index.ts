/**
 * Sandbox Extension — macOS Seatbelt によるコマンドサンドボックス化。
 * SECURITY SCOPE: Only the bash tool is sandboxed. Other tools are NOT sandboxed.
 * Fail-closed: sandbox-exec unavailable → command REFUSED (no silent fallback).
 * Usage: pi -e ./sandbox [--sandbox-mode read_only|workspace_write|yolo] [--no-sandbox] | /sandbox [mode]
 */

import type { BashOperations, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import type { SandboxMode, SandboxPolicy } from "./permissions.js";
import { isMacSandboxAvailable, runSandboxedShellMac } from "./macSeatbelt.js";
import { resolveRealPaths, validateWorkspaceRoot } from "./permissions.js";
import { shouldRequestApproval, yoloApprovalMessage, type YoloApprovalState, readOnlyPolicy, workspaceWritePolicy, yoloPolicy } from "./permissions.js";
import { DEFAULT_SANDBOX_MODE, parseSandboxMode, modeLabel, SANDBOX_PUSH_PROFILE_EVENT, SANDBOX_POP_PROFILE_EVENT, MODE_STATUS_EVENT, type SandboxPushProfileEvent, type SandboxPopProfileEvent, type ModeStatusEvent } from "../policy-core/modes.js";
import { SafetyProfileState } from "../policy-core/safetyProfile.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { MEKANN_SANDBOX_DEFAULTS, MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";
import { gateTextForLlm, redactSecrets } from "../../context/tool-output/index.js";

// ─── LLM output truncation ─────────────────────────────────────────

export const DEFAULT_LLM_OUTPUT_MAX_BYTES = MEKANN_SANDBOX_DEFAULTS.llmOutputMaxBytes;
export const DEFAULT_LLM_OUTPUT_MAX_LINES = MEKANN_SANDBOX_DEFAULTS.llmOutputMaxLines;
export function getEffectiveLlmOutputMaxBytes(): number { return Number(featureConfig("sandbox").llmOutputMaxBytes) || DEFAULT_LLM_OUTPUT_MAX_BYTES; }
export function getEffectiveLlmOutputMaxLines(): number { return Number(featureConfig("sandbox").llmOutputMaxLines) || DEFAULT_LLM_OUTPUT_MAX_LINES; }

const SANDBOX_PROMPT_POLICY = [
	"Sandbox policy:",
	"- The bash tool may be sandboxed depending on the active mode: read_only, workspace_write, or yolo.",
	"- In read_only or workspace_write mode, if a legitimate command is blocked by the sandbox, use request_elevation instead of repeatedly retrying the same command.",
	"- Do not use request_elevation in yolo mode; the sandbox is already disabled there, so use bash directly.",
	"- Never use request_elevation for dangerous, destructive, or unnecessary operations.",
	"- When requesting elevation, explain why the command must run outside the sandbox.",
].join("\n");

export interface TruncateForLlmOptions {
	maxBytes: number;
	maxLines: number;
}

export function truncateForLlm(
	text: string,
	opts: TruncateForLlmOptions = { maxBytes: getEffectiveLlmOutputMaxBytes(), maxLines: getEffectiveLlmOutputMaxLines() },
): { text: string; truncated: boolean; originalBytes: number; originalLines: number } {
	const originalBytes = Buffer.byteLength(text, "utf8");
	let lines = text.split(/\r?\n/);
	const originalLines = text.length === 0 ? 0 : lines.length;
	let truncated = false;

	if (lines.length > opts.maxLines) { lines = lines.slice(0, opts.maxLines); truncated = true; }
	let out = lines.join("\n");
	if (Buffer.byteLength(out, "utf8") > opts.maxBytes) { out = Buffer.from(out, "utf8").subarray(0, opts.maxBytes).toString("utf8").replace(/\uFFFD$/u, ""); truncated = true; }

	if (truncated) out += `\n\n[...出力が切り詰められました: 元の ${originalBytes} バイト、${originalLines} 行; 最大 ${opts.maxBytes} バイト / ${opts.maxLines} 行...]`;

	return { text: out, truncated, originalBytes, originalLines };
}

export default function sandboxExtension(pi: ExtensionAPI): void {
	// ─── State ───────────────────────────────────────────────────────

	let sandboxEnabled = false;
	const safetyProfile = new SafetyProfileState(DEFAULT_SANDBOX_MODE);
	let sandboxAvailable = false;
	let resolvedWorkspaceRoots: string[] = [];
	let resolvedWritableRoots: string[] = [];
	let currentCwd = "";
	// SECURITY: true only when user explicitly opted out via --no-sandbox
	let explicitlyDisabled = false; safetyProfile.setExplicitlyDisabled(false);

	// SECURITY: When set, bash execute() always refuses (unless --no-sandbox).
	// Set on unsafe workspace root or sandbox-init failure.
	let startupBlockedReason: string | undefined;

	// Last UI context for updating status bar after profile override push/pop.
	let lastCtx: any | undefined;

	// ─── Safety profile state (modes coordination) ─────────────────

	/** Compute the effective sandbox mode, respecting safety profile overrides. */
	function effectiveMode(): SandboxMode { return safetyProfile.effectiveMode(); }

	// SECURITY: yolo の承認状態
	const yoloState: YoloApprovalState = { yoloApproved: false };

	function resetYoloApproval(): void {
		Object.assign(yoloState, { yoloApproved: false, yoloApprovedAt: undefined, yoloApprovedReason: undefined });
	}

	function logProfileRejection(event: { owner?: string; token?: string; profile?: string }, reason: string, extra?: Record<string, unknown>) {
		pi.appendEntry("sandbox-profile-override-rejected", { at: Date.now(), owner: event.owner, token: event.token, profile: event.profile, ...extra, reason });
	}

	function disableSandbox(reason: string, level: "error" | "warning" = "error") {
		sandboxEnabled = false;
		resetYoloApproval();
		if (lastCtx) { lastCtx.ui.setWidget("sandbox", undefined); lastCtx.ui.notify(reason, level); }
	}

	// ─── Flags ───────────────────────────────────────────────────────

	pi.registerFlag("no-sandbox", { description: "sandbox を無効化する（明示的 opt-out）", type: "boolean", default: false });
	pi.registerFlag("sandbox-mode", { description: "初期 sandbox モード (read_only | workspace_write | yolo)", type: "string", default: DEFAULT_SANDBOX_MODE });
	pi.registerFlag("sandbox-allow-homebrew-paths", { description: "Homebrew paths (/opt/homebrew/bin, /usr/local/bin) を sandbox PATH に追加する。便利だが、sandbox 内から Homebrew 管理バイナリを実行可能にするため信頼境界が広がる", type: "boolean", default: false });

	// ─── Prompt fragments ───────────────────────────────────────────

	registerPromptProvider({
		id: "sandbox",
		getFragments() {
			return [{
				id: "sandbox:policy",
				source: "sandbox",
				kind: "sandbox_policy",
				stability: "stable",
				scope: "global",
				priority: 250,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: SANDBOX_PROMPT_POLICY,
			}];
		},
	});

	// ─── Policy builder ──────────────────────────────────────────────

	function buildCurrentPolicy(): SandboxPolicy {
		const mode = effectiveMode();
		const homebrew = Boolean(pi.getFlag("sandbox-allow-homebrew-paths"));
		switch (mode) {
			case "read_only":
				return readOnlyPolicy(currentCwd, resolvedWorkspaceRoots, homebrew);
			case "workspace_write":
				return workspaceWritePolicy(currentCwd, resolvedWorkspaceRoots, resolvedWritableRoots, false /* network は独立制御 */, homebrew);
			case "yolo":
				return yoloPolicy();
		}
	}

	// ─── Elevation hint for error messages ─────────────────────────

	const SANDBOX_BLOCK_HINT = " このコマンドの実行が必要な場合は、request_elevation ツールを使ってユーザーに許可を求めてください。";

	// ─── Bash tool override ──────────────────────────────────────────

	// NOTE: localBash is created lazily on session_start with the correct ctx.cwd.
	type LocalBashWithCwd = ReturnType<typeof createBashTool> & { _cwd: string };
	let localBash: LocalBashWithCwd | null = null;

	/** Get or create localBash with current session cwd. */
	function getLocalBash(): LocalBashWithCwd {
		const cwd = currentCwd || process.cwd(); if (!localBash || localBash._cwd !== cwd) localBash = Object.assign(createBashTool(cwd), { _cwd: cwd }); return localBash;
	}

	// Dummy initial localBash for registerTool spread (will be replaced on session_start)
	const initialBash = createBashTool(process.cwd());

	pi.registerTool({
		...initialBash,
		label: "bash (サンドボックス)",
		async execute(id, params, signal, onUpdate, ctx) {
			const command = String(params.command ?? "");

			// ── Case 1: Explicitly disabled via --no-sandbox ─────────
			if (explicitlyDisabled) return getLocalBash().execute(id, params, signal, onUpdate);

			// ── Hard block: startup failure (unsafe root / sandbox unavailable) ──
			if (startupBlockedReason) throw new Error(`${startupBlockedReason}${SANDBOX_BLOCK_HINT}`);

			// ── Case 2: yolo (unsandboxed) ────
			if (effectiveMode() === "yolo") return getLocalBash().execute(id, params, signal, onUpdate);

			// ── Case 3: sandbox-exec unavailable → REFUSE (fail-closed) ─
			if (!sandboxAvailable) throw new Error("サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。サンドボックス強制なしではコマンドを実行できません。--no-sandbox で明示的に無効化してください（非推奨）。" + SANDBOX_BLOCK_HINT);

			// ── Case 4: Normal sandboxed execution (read_only / workspace_write) ──
			const approval = shouldRequestApproval(effectiveMode(), command);
			if (approval.needsApproval && approval.reason) {
				const ok = await ctx.ui.confirm("[!] コマンドの承認が必要です", `サンドボックスモード: ${modeLabel(effectiveMode())}\nコマンド: ${command}\n理由: ${approval.reason}\n\nこのコマンドを許可しますか？`);
				if (!ok) throw new Error(`コマンドがブロックされました: ${approval.reason}`);
			}

			// Execute via sandbox (runSandboxedShellMac takes shell string, not argv)
			const policy = buildCurrentPolicy();
			const result = await runSandboxedShellMac(command, policy, { signal });
			const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
			const gated = await gateTextForLlm({
				cwd: currentCwd || process.cwd(),
				toolName: "bash",
				text: output,
				source: { kind: "sandboxed_bash", command: redactSecrets(command).text.slice(0, 2000) },
				maxInlineBytes: Number(featureConfig("output-gate").maxInlineBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes,
				previewBytes: Number(featureConfig("output-gate").previewBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes,
			});
			const shown = gated.handled ? {
				text: gated.text,
				truncated: true,
				originalBytes: gated.originalBytes,
				originalLines: gated.originalLines,
			} : truncateForLlm(output);
			const outputGate = gated.handled ? (gated.gated ? {
				stored: true,
				artifactId: gated.artifactId,
				bytes: gated.originalBytes,
				lines: gated.originalLines,
				sha256: gated.sha256,
				redacted: true,
			} : {
				stored: false,
				bytes: gated.originalBytes,
				lines: gated.originalLines,
				redacted: true,
				storageError: gated.storageError,
			}) : undefined;

			// Detect sandbox permission errors and add elevation hint
			if (result.code !== 0) {
				const isPermissionError = /Operation not permitted|Permission denied|EPERM|EACCES/.test(shown.text);
				const hint = isPermissionError ? SANDBOX_BLOCK_HINT : "";
				throw new Error(`サンドボックスコマンドが終了コード ${result.code} で終了しました${shown.text ? `:\n${shown.text}` : ""}${hint}`);
			}

			return {
				content: [{ type: "text", text: shown.text || "(出力なし)" }],
				details: {
					sandboxed: true,
					mode: effectiveMode(),
					exitCode: result.code,
					outputTruncated: shown.truncated,
					originalOutputBytes: shown.originalBytes,
					originalOutputLines: shown.originalLines,
					...(outputGate ? { outputGate } : {}),
				},
			};
		},
	});

	// ─── Elevation tool (LLM → user permission request) ─────────────

	pi.registerTool({
		name: "request_elevation",
		label: "サンドボックス権限昇格リクエスト",
		description: "Request user-approved temporary elevation for a legitimate command blocked by the active sandbox.",
		promptSnippet: "Request temporary sandbox elevation for a blocked command.",
		promptGuidelines: [
			"Use only when read_only or workspace_write sandbox blocks a necessary command.",
			"Do not use in yolo mode; use bash directly.",
			"Explain why the command must run outside the sandbox; never elevate dangerous or destructive commands.",
		],
		parameters: Type.Object({ command: Type.String({ description: "Command to run outside the sandbox." }), reason: Type.String({ description: "Why this command needs sandbox bypass." }) }),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { command, reason } = params;
			if (explicitlyDisabled) return { content: [{ type: "text", text: "サンドボックスは既に無効化されています (--no-sandbox)。bash ツールを直接使用してください。" }], details: {} };
			if (startupBlockedReason) return { content: [{ type: "text", text: `${startupBlockedReason}。権限昇格では回避できません。明示的に --no-sandbox で起動し直す必要があります。` }], details: {} };

			if (!sandboxEnabled) return { content: [{ type: "text", text: "サンドボックスはアクティブではありません。bash ツールを直接使用してください。" }], details: {} };
			const ok = await ctx.ui.confirm(
				"[>>] サンドボックス権限昇格リクエスト",
				[
					`エージェントが一時的なサンドボックス権限昇格を要求しています:`,
					"",
					`コマンド: ${command}`,
					`理由: ${reason}`,
					"",
					`現在のモード: ${modeLabel(effectiveMode())}`,
					"",
					"このコマンドをサンドボックス外で実行しますか？",
				].join("\n"),
			);

			if (!ok) return { content: [{ type: "text", text: "権限昇格がユーザーによって拒否されました。コマンドは実行されませんでした。サンドボックス制約内で動作する別の方法を検討するか、ユーザーに `/sandbox yolo` の手動実行を依頼してください。" }], details: {} };

			// Execute the command unsandboxed
			const result = await getLocalBash().execute(`elevated-${Date.now()}`, { command }, undefined, _onUpdate);

			return {
				content: result.content,
				details: {
					...result.details,
					elevated: true,
					originalMode: effectiveMode(),
					reason,
				},
			};
		},
	});

	function blockedUserBashResult(message: string) {
		return { result: { output: message, exitCode: 1, cancelled: false, truncated: false } };
	}

	function sandboxedUserBashOperations(): BashOperations {
		return {
			async exec(command, _cwd, options) {
				if (!sandboxAvailable) {
					const msg = "サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。サンドボックス強制なしではコマンドを実行できません。--no-sandbox で明示的に無効化してください（非推奨）。";
					options.onData(Buffer.from(msg));
					return { exitCode: 1 };
				}
				const result = await runSandboxedShellMac(command, buildCurrentPolicy(), { signal: options.signal });
				const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
				if (output) options.onData(Buffer.from(output));
				return { exitCode: result.code };
			},
		};
	}

	// SECURITY: When sandbox is active, returning undefined = bypass. Provide
	// sandboxed operations for direct `!`/`!!` user bash instead of throwing an
	// extension error into the UI.
	pi.on("user_bash", () => {
		if (explicitlyDisabled || effectiveMode() === "yolo") return undefined;
		if (startupBlockedReason) return blockedUserBashResult(`${startupBlockedReason}。--no-sandbox で明示的に無効化しない限り、直接 bash 実行は拒否されます。`);
		return { operations: sandboxedUserBashOperations() };
	});

	// ─── Commands ────────────────────────────────────────────────────
	function changeMode(args: string | undefined, ctx: any): Promise<void> {
		return (async () => {
			lastCtx = ctx;
			const modeStr = args?.trim();
			if (!modeStr) {
				if (startupBlockedReason) { ctx.ui.notify(`blocked: ${startupBlockedReason}`, "error"); return; }
				ctx.ui.notify(effectiveMode(), "info");
				return;
			}
			const newMode = parseSandboxMode(modeStr);
			if (!newMode) {
				ctx.ui.notify(`無効なモード: ${modeStr}。指定可能: read_only, workspace_write, yolo`, "error");
				return;
			}

			// SECURITY: yolo requires explicit approval
			if (newMode === "yolo") {
				// If override is active, effective mode won't be yolo even after base change.
				// Save the base mode but defer approval until yolo actually becomes effective.
				if (safetyProfile.overrideCount() > 0) {
					// Override active — save base, defer approval
					safetyProfile.setBaseMode(newMode);
					resetYoloApproval();
					refreshStatusBar();
					ctx.ui.notify("base モードを yolo に設定しました。override 終了後、bash tool 実行時に yolo 承認を求めます。direct bash は承認済みになるまで拒否されます。", "info");
					return;
				}
				const ok = await ctx.ui.confirm("[!] サンドボックスを無効化しますか？", yoloApprovalMessage());
				if (!ok) { ctx.ui.notify("モード変更はキャンセルされました", "info"); return; }
				yoloState.yoloApproved = true;
				yoloState.yoloApprovedAt = new Date();
				yoloState.yoloApprovedReason = "コマンド /sandbox で承認";
			} else {
				resetYoloApproval();
			}

			safetyProfile.setBaseMode(newMode);
			refreshStatusBar();
			ctx.ui.notify(`サンドボックスモードを変更しました: ${effectiveMode()}`, "info");
		})();
	}

	pi.registerCommand("sandbox", {
		description: "サンドボックスモードを表示・変更",
		getArgumentCompletions(prefix: string) {
			const f = ["read_only", "workspace_write", "yolo"].filter((m) => m.startsWith(prefix)).map((m) => ({ value: m, label: m }));
			return f.length ? f : null;
		},
		handler: changeMode,
	});

	// ─── Status bar ──────────────────────────────────────────────────
	function updateStatusBar(ctx: any): void {
		if (explicitlyDisabled || !sandboxEnabled) { ctx.ui.setWidget("sandbox", undefined); return; }
		let label = "";
		if (safetyProfile.modeStatus) {
			const modeStatusLabel = safetyProfile.modeStatus === "read_only" ? "plan" : safetyProfile.modeStatus;
			label = ctx.ui.theme.fg(safetyProfile.modeStatus === "read_only" || safetyProfile.modeStatus === "plan" ? "warning" : "dim", modeStatusLabel) + " ";
		}
		label += ctx.ui.theme.fg("dim", effectiveMode());
		ctx.ui.setWidget("sandbox", (_tui: unknown, theme: any) => ({
			invalidate() {},
			render(w: number): string[] {
				if (!safetyProfile.rightStatus) return [truncateToWidth(label, w)];
				const right = theme.fg("dim", safetyProfile.rightStatus);
				const lw = visibleWidth(label);
				const rw = visibleWidth(right);
				if (lw + rw + 1 > w) return [truncateToWidth(label, w)];
				const padding = " ".repeat(Math.max(1, w - lw - rw));
				return [truncateToWidth(label + padding + right, w)];
			},
		}), { placement: "belowEditor" });
	}
	function refreshStatusBar() { if (lastCtx) updateStatusBar(lastCtx); }

	// ─── Events ──────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;
		startupBlockedReason = undefined;
		lastCtx = ctx;

		// --no-sandbox: explicit opt-out
		const noSandbox = pi.getFlag("no-sandbox") as boolean;
		if (noSandbox) {
			explicitlyDisabled = true; safetyProfile.setExplicitlyDisabled(true);
			sandboxAvailable = false;
			disableSandbox("--no-sandbox によりサンドボックスは明示的に無効化されました", "warning");
			return;
		}

		sandboxAvailable = await isMacSandboxAvailable();
		const modeFlag = pi.getFlag("sandbox-mode") as string;
		if (modeFlag) {
			const parsed = parseSandboxMode(modeFlag);
			if (parsed) safetyProfile.setBaseMode(parsed); else { safetyProfile.setBaseMode(DEFAULT_SANDBOX_MODE); ctx.ui.notify(`無効な --sandbox-mode: ${modeFlag}。デフォルトの ${DEFAULT_SANDBOX_MODE} を使用します`, "warning"); }
		}

		// SECURITY: FAIL-CLOSED on unsafe workspace root (all modes)
		// Validate BEFORE yolo approval — no point asking for approval if we'll hard-block anyway.
		try {
			await validateWorkspaceRoot(ctx.cwd);
		} catch (e) {
			startupBlockedReason = `安全でない workspace root: ${(e as Error).message}`;
			disableSandbox(`セキュリティ: ${startupBlockedReason}。安全のためサンドボックスを無効化しました。コマンドは拒否されます。`);
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

		// yolo approval is deferred to first bash execution (inline approval).
		// No prompt at session_start — avoids bothering the user on every startup.

		if (!sandboxAvailable && effectiveMode() !== "yolo") {
			startupBlockedReason = "サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。サンドボックス強制なしではコマンドを実行できません。--no-sandbox で明式的に無効化してください（非推奨）。";
			disableSandbox(`[!] ${startupBlockedReason}`);
			return;
		}

		sandboxEnabled = true;
		refreshStatusBar();
		ctx.ui.notify(`サンドボックス有効: ${modeLabel(effectiveMode())}`, "info");
	});

	// ─── Profile override events (modes coordination) ───────────────

	pi.events.on(SANDBOX_PUSH_PROFILE_EVENT, (data: unknown) => {
		const event = data as SandboxPushProfileEvent;
		if (!event.token || !event.profile) return;
		const decision = safetyProfile.pushProfile(event.owner, event.token, event.profile);
		if (!decision.ok) {
			logProfileRejection(event, decision.reason, { requestedMode: decision.requestedMode, baseMode: safetyProfile.getBaseMode() });
			return;
		}
		refreshStatusBar();
	});
	pi.events.on(SANDBOX_POP_PROFILE_EVENT, (data: unknown) => {
		const event = data as SandboxPopProfileEvent;
		if (!event.token) return;
		safetyProfile.popProfile(event.owner, event.token);
		refreshStatusBar();
	});
	// Listen for modes status updates to render a combined status line
	pi.events.on(MODE_STATUS_EVENT, (data: unknown) => {
		if (data == null || typeof data !== "object") return;
		const event = data as Partial<ModeStatusEvent>;
		if (event.mode !== "main" && event.mode !== "read_only" && event.mode !== "plan" && event.mode !== "sub") return;
		safetyProfile.modeStatus = event.mode;
		refreshStatusBar();
	});
	pi.events.on("mekann:codex-usage:status", (data: unknown) => {
		if (data != null && typeof data !== "object") return;
		const event = data as { text?: unknown } | undefined;
		safetyProfile.rightStatus = typeof event?.text === "string" && event.text.trim() ? event.text : undefined;
		refreshStatusBar();
	});

	pi.on("session_shutdown", async () => {
		sandboxEnabled = false;
		sandboxAvailable = false;
		explicitlyDisabled = false; safetyProfile.setExplicitlyDisabled(false);
		startupBlockedReason = undefined;
		safetyProfile.clearProfiles();
		safetyProfile.modeStatus = undefined;
		safetyProfile.rightStatus = undefined;
		lastCtx = undefined;
		resetYoloApproval();
	});
}
