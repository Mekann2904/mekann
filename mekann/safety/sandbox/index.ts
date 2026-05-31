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
import { yoloApprovalMessage, type YoloApprovalState, readOnlyPolicy, workspaceWritePolicy, yoloPolicy } from "./permissions.js";
import { DEFAULT_SANDBOX_MODE, parseSandboxMode, modeLabel, SANDBOX_PUSH_PROFILE_EVENT, SANDBOX_POP_PROFILE_EVENT, MODE_STATUS_EVENT, type SandboxPushProfileEvent, type SandboxPopProfileEvent, type ModeStatusEvent } from "../policy-core/modes.js";
import { SafetyProfileState } from "../policy-core/safetyProfile.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { featureValue } from "../../settings/featureConfig.js";
import { SandboxExecutionControl, SANDBOX_BLOCK_HINT } from "./executionControl.js";
import { formatSandboxRuntimeStatus, type SandboxRuntimeStatus } from "./runtimeStatus.js";
import { appendWorkspaceBashAllowlistCommand, getBashAllowlist, getBashMode, isBashCommandAllowed, setWorkspaceBashMode, type BashMode } from "./bashPolicy.js";

export { DEFAULT_LLM_OUTPUT_MAX_BYTES, DEFAULT_LLM_OUTPUT_MAX_LINES, getEffectiveLlmOutputMaxBytes, getEffectiveLlmOutputMaxLines, truncateForLlm } from "./truncation.js";
export type { TruncateForLlmOptions } from "./truncation.js";

const SANDBOX_PROMPT_POLICY = [
	"Sandbox policy:",
	"- The bash tool may be sandboxed depending on the active mode: read_only, workspace_write, or yolo.",
	"- In read_only or workspace_write mode, if a legitimate command is blocked by the sandbox, use request_elevation instead of repeatedly retrying the same command.",
	"- Do not use request_elevation in yolo mode; the sandbox is already disabled there, so use bash directly.",
	"- Never use request_elevation for dangerous, destructive, or unnecessary operations.",
	"- When requesting elevation, explain why the command must run outside the sandbox.",
].join("\n");

export default function sandboxExtension(pi: ExtensionAPI): void {
	const enabledBySetting = featureValue("sandbox", "enabled") !== false;
	if (!enabledBySetting) return;

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
	function effectiveMode(): SandboxMode {
		return getBashMode(currentCwd || process.cwd()) === "yolo" ? "yolo" : safetyProfile.effectiveMode();
	}
	function effectiveBashMode(cwd = currentCwd || process.cwd()): BashMode {
		const mode = getBashMode(cwd);
		return mode === "sandboxed" && effectiveMode() === "yolo" ? "yolo" : mode;
	}

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

	// ─── Bash policy ───────────────────────────────────────────────

	async function enforceBashPolicy(command: string, ctx: any): Promise<void> {
		const cwd = currentCwd || ctx?.cwd || process.cwd();
		const bashMode = getBashMode(cwd);
		if (bashMode === "sandboxed" || bashMode === "yolo") return;
		if (bashMode === "off") throw new Error("bash は sandbox.bashMode=off により拒否されました。read/edit/write などの構造化 tool を使用してください。");
		if (isBashCommandAllowed(command, getBashAllowlist(cwd))) return;

		const ok = await ctx.ui.confirm(
			"[!] allowlist 外の bash command",
			`この bash command は sandbox.bashAllowlist にありません。\n\n${command}\n\n今回実行を許可しますか？`,
		);
		if (!ok) throw new Error("bash command はユーザーにより拒否されました。sandbox.bashAllowlist にありません。");

		if (featureValue("sandbox", "allowPersistentBashApprovals", cwd) === false) return;
		const persist = await ctx.ui.confirm(
			"bash command を永続許可しますか？",
			"この workspace の .pi/mekann.json に exact match として追加しますか？\n\nNo の場合は今回だけ許可します。",
		);
		if (!persist) return;
		appendWorkspaceBashAllowlistCommand(cwd, command);
		ctx.ui.notify("bash command を workspace mekann.json の sandbox.bashAllowlist に追加しました。", "info");
	}

	// ─── Bash tool override ──────────────────────────────────────────

	// NOTE: localBash is created lazily on session_start with the correct ctx.cwd.
	type LocalBashWithCwd = ReturnType<typeof createBashTool> & { _cwd: string };
	let localBash: LocalBashWithCwd | null = null;

	/** Get or create localBash with current session cwd. */
	function getLocalBash(): LocalBashWithCwd {
		const cwd = currentCwd || process.cwd(); if (!localBash || localBash._cwd !== cwd) localBash = Object.assign(createBashTool(cwd), { _cwd: cwd }); return localBash;
	}

	const executionControl = new SandboxExecutionControl({
		isExplicitlyDisabled: () => explicitlyDisabled,
		startupBlockedReason: () => startupBlockedReason,
		isSandboxAvailable: () => sandboxAvailable,
		effectiveMode,
		buildCurrentPolicy,
		cwd: () => currentCwd || process.cwd(),
		confirm: (title, message) => lastCtx.ui.confirm(title, message),
		runUnsandboxed: (id, params, signal, onUpdate) => getLocalBash().execute(id, params as any, signal, onUpdate as any),
	});

	// Dummy initial localBash for registerTool spread (will be replaced on session_start)
	const initialBash = createBashTool(process.cwd());

	pi.registerTool({
		...initialBash,
		label: "bash (サンドボックス)",
		async execute(id, params, signal, onUpdate, ctx) {
			lastCtx = ctx;
			const command = String(params.command ?? "");
			await enforceBashPolicy(command, ctx);
			return executionControl.executeBash(id, params, signal, onUpdate);
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
		const bashMode = getBashMode(currentCwd || process.cwd());
		if (bashMode === "off") return blockedUserBashResult("bash は sandbox.bashMode=off により拒否されました。");
		if (explicitlyDisabled || effectiveMode() === "yolo") return undefined;
		if (startupBlockedReason) return blockedUserBashResult(`${startupBlockedReason}。--no-sandbox で明示的に無効化しない限り、直接 bash 実行は拒否されます。`);
		return { operations: sandboxedUserBashOperations() };
	});

	// ─── Commands ────────────────────────────────────────────────────
	function currentRuntimeStatus(): SandboxRuntimeStatus {
		if (!enabledBySetting) return { kind: "disabled_by_setting" };
		if (explicitlyDisabled) return { kind: "disabled_by_flag", flag: "--no-sandbox" };
		if (startupBlockedReason) {
			const unavailable = /sandbox-exec|サンドボックスが必要/.test(startupBlockedReason);
			return {
				kind: unavailable ? "unavailable" : "blocked",
				reason: startupBlockedReason,
				recoverableBy: unavailable ? "change_mode_or_restart" : "restart_with_no_sandbox",
			} as SandboxRuntimeStatus;
		}
		if (!sandboxEnabled) return { kind: "blocked", reason: "session has not initialized sandbox yet", recoverableBy: "none" };
		const cwd = currentCwd || process.cwd();
		return { kind: "active", mode: effectiveMode(), sandboxAvailable, profileOverrides: safetyProfile.overrideCount(), workspaceRoots: resolvedWorkspaceRoots, bashMode: effectiveBashMode(cwd), allowlistCount: getBashAllowlist(cwd).length };
	}

	function parseBashMode(value: string | undefined): BashMode | undefined {
		return value === "off" || value === "ask" || value === "sandboxed" || value === "yolo" ? value : undefined;
	}

	function changeMode(args: string | undefined, ctx: any): Promise<void> {
		return (async () => {
			lastCtx = ctx;
			const modeStr = args?.trim();
			if (!modeStr || modeStr === "status") {
				ctx.ui.notify(formatSandboxRuntimeStatus(currentRuntimeStatus()), startupBlockedReason ? "error" : "info");
				return;
			}
			const parts = modeStr.split(/\s+/);
			if (parts[0] === "bash") {
				const newBashMode = parseBashMode(parts[1]);
				if (!newBashMode) {
					ctx.ui.notify("無効な bash mode: 指定可能: off, ask, sandboxed, yolo", "error");
					return;
				}
				if (newBashMode === "yolo") {
					const ok = await ctx.ui.confirm("[!] bash yolo を有効化しますか？", "bash:yolo は OS sandbox なしで bash を実行します。workspace の mekann.json に保存しますか？");
					if (!ok) { ctx.ui.notify("bash mode 変更はキャンセルされました", "info"); return; }
				}
				setWorkspaceBashMode(ctx.cwd ?? currentCwd ?? process.cwd(), newBashMode);
				refreshStatusBar();
				ctx.ui.notify(`bash mode を変更しました: ${newBashMode}`, "info");
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
			const candidates = ["status", "read_only", "workspace_write", "yolo", "bash off", "bash ask", "bash sandboxed", "bash yolo"];
			const f = candidates.filter((m) => m.startsWith(prefix)).map((m) => ({ value: m, label: m }));
			return f.length ? f : null;
		},
		handler: changeMode,
	});

	// ─── Status bar ──────────────────────────────────────────────────
	function updateStatusBar(ctx: any): void {
		if (explicitlyDisabled || !sandboxEnabled) { ctx.ui.setWidget("sandbox", undefined); return; }
		let label = "";
		if (safetyProfile.modeStatus) {
			label = ctx.ui.theme.fg(safetyProfile.modeStatus === "read_only" ? "warning" : "dim", safetyProfile.modeStatus) + " ";
		}
		label += ctx.ui.theme.fg("dim", `bash:${effectiveBashMode(currentCwd || ctx.cwd || process.cwd())}`);
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
		if (event.mode !== "main" && event.mode !== "read_only" && event.mode !== "sub") return;
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
