/**
 * Sandbox Extension — macOS Seatbelt によるコマンドサンドボックス化。
 * SECURITY SCOPE: Only the bash tool is sandboxed. Other tools are NOT sandboxed.
 * Fail-closed: sandbox-exec unavailable → command REFUSED (no silent fallback).
 * Usage: pi -e ./sandbox [--sandbox-mode read_only|workspace_write|yolo] [--no-sandbox] | /sandbox [mode]
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { SandboxMode, SandboxPolicy } from "./permissions.js";
import {
	readOnlyPolicy,
	workspaceWritePolicy,
	yoloPolicy,
} from "./permissions.js";
import { isMacSandboxAvailable, runSandboxedShellMac } from "./macSeatbelt.js";
import { resolveRealPaths, validateWorkspaceRoot } from "./pathPolicy.js";
import { shouldRequestApproval, yoloApprovalMessage, type YoloApprovalState } from "./approvals.js";
import {
	DEFAULT_SANDBOX_MODE,
	parseSandboxMode,
	modeLabel,
	SANDBOX_PUSH_PROFILE_EVENT,
	SANDBOX_POP_PROFILE_EVENT,
	type SandboxPushProfileEvent,
	type SandboxPopProfileEvent,
} from "../policy-core/modes.js";

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
		out += `\n\n[...出力が切り詰められました: 元の ${originalBytes} バイト、${originalLines} 行; 最大 ${opts.maxBytes} バイト / ${opts.maxLines} 行...]`;
	}

	return { text: out, truncated, originalBytes, originalLines };
}

export default function sandboxExtension(pi: ExtensionAPI): void {
	// ─── State ───────────────────────────────────────────────────────

	let sandboxEnabled = false;
	let currentMode: SandboxMode = DEFAULT_SANDBOX_MODE;
	let sandboxAvailable = false;
	let resolvedWorkspaceRoots: string[] = [];
	let resolvedWritableRoots: string[] = [];
	let currentCwd = "";
	// SECURITY: true only when user explicitly opted out via --no-sandbox
	let explicitlyDisabled = false;

	// SECURITY: When set, bash execute() always refuses (unless --no-sandbox).
	// Set on unsafe workspace root or sandbox-init failure.
	let startupBlockedReason: string | undefined;

	// Last UI context for updating status bar after profile override push/pop.
	let lastCtx: any | undefined;

	// ─── Profile override stack (plan-mode coordination) ──────────

	/** Override entries pushed by other extensions (e.g. plan-mode). */
	const profileOverrideStack: { owner: string; token: string; mode: SandboxMode }[] = [];

	/** Compute the effective sandbox mode, respecting override stack. */
	function effectiveMode(): SandboxMode {
		if (explicitlyDisabled) return currentMode; // overrides don't apply when disabled
		if (profileOverrideStack.length > 0) {
			return profileOverrideStack[profileOverrideStack.length - 1].mode;
		}
		return currentMode;
	}

	// SECURITY: Mode ranking (lower = more restrictive). Used for restrict-only override policy.
	const MODE_RANK: Record<SandboxMode, number> = { read_only: 0, workspace_write: 1, yolo: 2 };

	// SECURITY: yolo の承認状態
	const yoloState: YoloApprovalState = {
		yoloApproved: false,
	};

	function resetYoloApproval(): void {
		Object.assign(yoloState, { yoloApproved: false, yoloApprovedAt: undefined, yoloApprovedReason: undefined });
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
		default: DEFAULT_SANDBOX_MODE,
	});

	// ─── Policy builder ──────────────────────────────────────────────

	function buildCurrentPolicy(): SandboxPolicy {
		const mode = effectiveMode();
		switch (mode) {
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
		" このコマンドの実行が必要な場合は、request_elevation ツールを使ってユーザーに許可を求めてください。";

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
		label: "bash (サンドボックス)",
		async execute(id, params, signal, onUpdate, ctx) {
			const command = String(params.command ?? "");

			// ── Case 1: Explicitly disabled via --no-sandbox ─────────
			if (explicitlyDisabled) {
				return getLocalBash().execute(id, params, signal, onUpdate);
			}

			// ── Hard block: startup failure (unsafe root / sandbox unavailable) ──
			if (startupBlockedReason) {
				throw new Error(`${startupBlockedReason}${SANDBOX_BLOCK_HINT}`);
			}

			// ── Case 2: yolo (unsandboxed) ────
			if (effectiveMode() === "yolo") {
				return getLocalBash().execute(id, params, signal, onUpdate);
			}

			// ── Case 3: sandbox-exec unavailable → REFUSE (fail-closed) ─
			if (!sandboxAvailable) {
				throw new Error(
					"サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。サンドボックス強制なしではコマンドを実行できません。--no-sandbox で明示的に無効化してください（非推奨）。" + SANDBOX_BLOCK_HINT,
				);
			}

			// ── Case 4: Normal sandboxed execution (read_only / workspace_write) ──
			const approval = shouldRequestApproval(effectiveMode(), command);
			if (approval.needsApproval && approval.reason) {
				const ok = await ctx.ui.confirm(
					"[!] コマンドの承認が必要です",
					`サンドボックスモード: ${modeLabel(effectiveMode())}\nコマンド: ${command}\n理由: ${approval.reason}\n\nこのコマンドを許可しますか？`,
				);
				if (!ok) {
					throw new Error(`コマンドがブロックされました: ${approval.reason}`);
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
					`サンドボックスコマンドが終了コード ${result.code} で終了しました${shown.text ? `:\n${shown.text}` : ""}${hint}`,
				);
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
				},
			};
		},
	});

	// ─── Elevation tool (LLM → user permission request) ─────────────

	pi.registerTool({
		name: "request_elevation",
		label: "サンドボックス権限昇格リクエスト",
		description: "現在のサンドボックスポリシーでブロックされたコマンドを実行するため、一時的な権限昇格をリクエストする。ユーザーに理由とコマンドが表示され、明示的な承認が必要。サンドボックスが正当な操作をブロックした場合にのみ使用すること（例: 依存関係のインストール、システムパスへのアクセス）。",
		promptSnippet: "ブロックされたコマンドの一時的なサンドボックスバイパスをリクエスト",
		promptGuidelines: [
			"request_elevation はサンドボックスがアクティブなモード（read_only または workspace_write）でコマンドがブロックされた場合にのみ使用する。",
			"yolo モードではサンドボックスが無効なため、request_elevation は不要。直接 bash ツールを使用すること。",
			"コマンドがサンドボックス外で実行されるべき理由を必ず説明すること。",
			"危険または破壊的な操作には request_elevation を使用しないこと。",
		],
		parameters: Type.Object({
			command: Type.String({ description: "サンドボックス外で実行する必要があるコマンド" }),
			reason: Type.String({ description: "このコマンドがサンドボックスをバイパスする必要がある理由" }),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const { command, reason } = params;

			if (explicitlyDisabled) {
				return {
					content: [{ type: "text", text: "サンドボックスは既に無効化されています (--no-sandbox)。bash ツールを直接使用してください。" }],
					details: {},
				};
			}

			if (startupBlockedReason) {
				return { content: [{ type: "text", text: `${startupBlockedReason}。権限昇格では回避できません。明示的に --no-sandbox で起動し直す必要があります。` }], details: {} };
			}

			if (!sandboxEnabled) {
				return {
					content: [{ type: "text", text: "サンドボックスはアクティブではありません。bash ツールを直接使用してください。" }],
					details: {},
				};
			}

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

			if (!ok) {
								return { content: [{ type: "text", text: "権限昇格がユーザーによって拒否されました。コマンドは実行されませんでした。サンドボックス制約内で動作する別の方法を検討するか、ユーザーに `/sandbox yolo` の手動実行を依頼してください。" }], details: {} };
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
					originalMode: effectiveMode(),
					reason,
				},
			};
		},
	});

	// SECURITY: When sandbox is active, returning undefined = bypass. Block instead.
	pi.on("user_bash", () => {
		if (explicitlyDisabled) return undefined;

		if (startupBlockedReason) {
			throw new Error(
				`${startupBlockedReason}。--no-sandbox で明示的に無効化しない限り、直接 bash 実行は拒否されます。`,
			);
		}

		if (effectiveMode() === "yolo") return undefined;
		throw new Error("サンドボックスがアクティブな場合、直接の bash 実行はブロックされます。コマンドはサンドボックス化された bash ツール経由で実行してください。");
	});

	// ─── Commands ────────────────────────────────────────────────────
	function changeMode(args: string | undefined, ctx: any): Promise<void> {
		return (async () => {
			lastCtx = ctx;
			const modeStr = args?.trim();
			if (!modeStr) {
				if (startupBlockedReason) {
					ctx.ui.notify(`blocked: ${startupBlockedReason}`, "error");
					return;
				}
				ctx.ui.notify(effectiveMode(), "info");
				return;
			}

			const newMode = parseSandboxMode(modeStr);
			if (!newMode) {
				ctx.ui.notify(
					`無効なモード: ${modeStr}。指定可能: read_only, workspace_write, yolo`,
					"error",
				);
				return;
			}

			// SECURITY: yolo requires explicit approval
			if (newMode === "yolo") {
				// If override is active, effective mode won't be yolo even after base change.
				// Save the base mode but defer approval until yolo actually becomes effective.
				if (profileOverrideStack.length > 0) {
					// Override active — save base, defer approval
					currentMode = newMode;
					resetYoloApproval();
					updateStatusBar(ctx);
					ctx.ui.notify(
						"base モードを yolo に設定しました。override 終了後、bash tool 実行時に yolo 承認を求めます。direct bash は承認済みになるまで拒否されます。",
						"info",
					);
					return;
				}

				const ok = await ctx.ui.confirm(
					"[!] サンドボックスを無効化しますか？",
					yoloApprovalMessage(),
				);
				if (!ok) {
					ctx.ui.notify("モード変更はキャンセルされました", "info");
					return;
				}
								yoloState.yoloApproved = true;
							yoloState.yoloApprovedAt = new Date();
							yoloState.yoloApprovedReason = "コマンド /sandbox で承認";
			} else {
				resetYoloApproval();
			}

			currentMode = newMode;
			updateStatusBar(ctx);
			ctx.ui.notify(
				`サンドボックスモードを変更しました: ${effectiveMode()}`,
				"info",
			);
		})();
	}

	pi.registerCommand("sandbox", {
		description: "サンドボックスモードを表示・変更",
		getArgumentCompletions(prefix: string) {
			const items = ["read_only", "workspace_write", "yolo"].map((m) => ({ value: m, label: m }));
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: changeMode,
	});

	// ─── Status bar ──────────────────────────────────────────────────
	function updateStatusBar(ctx: any): void {
		if (explicitlyDisabled || !sandboxEnabled) {
			ctx.ui.setWidget("sandbox", undefined);
			return;
		}

		ctx.ui.setWidget(
			"sandbox",
			[ctx.ui.theme.fg("dim", effectiveMode())],
			{ placement: "belowEditor" },
		);
	}

	// ─── Events ──────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		currentCwd = ctx.cwd;
		startupBlockedReason = undefined;
		lastCtx = ctx;

		// --no-sandbox: explicit opt-out
		const noSandbox = pi.getFlag("no-sandbox") as boolean;
		if (noSandbox) {
			explicitlyDisabled = true;
			sandboxEnabled = false;
			sandboxAvailable = false;
			ctx.ui.notify("--no-sandbox によりサンドボックスは明示的に無効化されました", "warning");
			return;
		}

		sandboxAvailable = await isMacSandboxAvailable();

		const modeFlag = pi.getFlag("sandbox-mode") as string;
		if (modeFlag) {
			const parsed = parseSandboxMode(modeFlag);
			if (parsed) {
				currentMode = parsed;
			} else {
				currentMode = DEFAULT_SANDBOX_MODE;
				ctx.ui.notify(
					`無効な --sandbox-mode: ${modeFlag}。デフォルトの ${DEFAULT_SANDBOX_MODE} を使用します`, "warning",
				);
			}
		}

		// SECURITY: FAIL-CLOSED on unsafe workspace root (all modes)
		// Validate BEFORE yolo approval — no point asking for approval if we'll hard-block anyway.
		try {
			await validateWorkspaceRoot(ctx.cwd);
		} catch (e) {
			startupBlockedReason = `安全でない workspace root: ${(e as Error).message}`;
			sandboxEnabled = false;
			resetYoloApproval();
			ctx.ui.notify(
				`セキュリティ: ${startupBlockedReason}。安全のためサンドボックスを無効化しました。コマンドは拒否されます。`,
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

		// yolo approval is deferred to first bash execution (inline approval).
		// No prompt at session_start — avoids bothering the user on every startup.

		if (!sandboxAvailable && effectiveMode() !== "yolo") {
			startupBlockedReason = "サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。サンドボックス強制なしではコマンドを実行できません。--no-sandbox で明示的に無効化してください（非推奨）。";
			sandboxEnabled = false;
			ctx.ui.notify(`[!] ${startupBlockedReason}`, "error");
			return;
		}

		sandboxEnabled = true;
		updateStatusBar(ctx);
		ctx.ui.notify(
			`サンドボックス有効: ${modeLabel(effectiveMode())}`,
			"info",
		);
	});

	// ─── Profile override events (plan-mode coordination) ───────────

	pi.events.on(SANDBOX_PUSH_PROFILE_EVENT, (data: unknown) => {
		const event = data as SandboxPushProfileEvent;
		if (!event.token || !event.profile) return;

		// SECURITY: Only accept restrict-only profiles via events.
		// workspace_write / yolo overrides must go through /sandbox command or approval flow.
		if (event.profile !== "plan_read_only" && event.profile !== "sandbox_read_only") {
			pi.appendEntry("sandbox-profile-override-rejected", {
				at: Date.now(),
				owner: event.owner,
				token: event.token,
				profile: event.profile,
				reason: "unsupported-profile-for-event-override",
			});
			return;
		}

		// Both plan_read_only and sandbox_read_only map to "read_only" mode.
		const mode: SandboxMode = "read_only";

		// SECURITY: Reject escalation — override must be equally or more restrictive.
		if (MODE_RANK[mode] > MODE_RANK[currentMode]) {
			pi.appendEntry("sandbox-profile-override-rejected", {
				at: Date.now(),
				owner: event.owner,
				token: event.token,
				profile: event.profile,
				requestedMode: mode,
				baseMode: currentMode,
				reason: "override-escalation-rejected",
			});
			return;
		}

		// Remove any existing entry with the same token to prevent duplicates
		const idx = profileOverrideStack.findIndex((e) => e.token === event.token);
		if (idx >= 0) profileOverrideStack.splice(idx, 1);

		profileOverrideStack.push({ owner: event.owner, token: event.token, mode });

		// Update status bar to reflect effective mode change
		if (lastCtx) updateStatusBar(lastCtx);
	});

	pi.events.on(SANDBOX_POP_PROFILE_EVENT, (data: unknown) => {
		const event = data as SandboxPopProfileEvent;
		if (!event.token) return;

		const idx = profileOverrideStack.findIndex(
			(e) => e.owner === event.owner && e.token === event.token,
		);
		if (idx >= 0) profileOverrideStack.splice(idx, 1);

		// Update status bar to reflect effective mode change
		if (lastCtx) updateStatusBar(lastCtx);
	});

	pi.on("session_shutdown", async () => {
		sandboxEnabled = false;
		sandboxAvailable = false;
		explicitlyDisabled = false;
		startupBlockedReason = undefined;
		profileOverrideStack.length = 0;
		lastCtx = undefined;
				resetYoloApproval();
	});
}
