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
		out += `\n\n[...出力が切り詰められました: 元の ${originalBytes} バイト、${originalLines} 行; 最大 ${opts.maxBytes} バイト / ${opts.maxLines} 行...]`;
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

			// ── Case 2: yolo with explicit approval ────
			if (currentMode === "yolo") {
				if (!yoloState.yoloApproved) {
					const ok = await ctx.ui.confirm(
						"[!] フルアクセスが必要です",
						yoloApprovalMessage(),
					);
					if (!ok) {
						throw new Error(
							"yolo モードにはユーザーの明示的な承認が必要です。/sandbox-mode yolo で承認してください。",
						);
					}
										approveYolo("ツール実行プロンプトで承認");
				}
				// Approved yolo: unsandboxed execution
				return getLocalBash().execute(id, params, signal, onUpdate);
			}

			// ── Case 3: sandbox-exec unavailable → REFUSE (fail-closed) ─
			if (!sandboxAvailable) {
				throw new Error(
					"サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。" +
					"サンドボックス強制なしではコマンドを実行できません。" +
					"--no-sandbox で明示的に無効化してください（非推奨）。" +
					SANDBOX_BLOCK_HINT,
				);
			}

			// ── Case 4: Normal sandboxed execution (read_only / workspace_write) ──
			const approval = shouldRequestApproval(currentMode, command);
			if (approval.needsApproval && approval.reason) {
				const ok = await ctx.ui.confirm(
					"[!] コマンドの承認が必要です",
					`サンドボックスモード: ${modeLabel(currentMode)}\nコマンド: ${command}\n理由: ${approval.reason}\n\nこのコマンドを許可しますか？`,
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
		label: "サンドボックス権限昇格リクエスト",
		description:
			"現在のサンドボックスポリシーでブロックされたコマンドを実行するため、一時的な権限昇格をリクエストする。" +
			"ユーザーに理由とコマンドが表示され、明示的な承認が必要。" +
			"サンドボックスが正当な操作をブロックした場合にのみ使用すること（例: 依存関係のインストール、システムパスへのアクセス）。",
		promptSnippet: "ブロックされたコマンドの一時的なサンドボックスバイパスをリクエスト",
		promptGuidelines: [
			"サンドボックスが workspace 外へのアクセスを必要とする正当なコマンドをブロックした場合に request_elevation を使用する（例: npm install, brew, システムツール）。",
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
				};
			}

			if (!sandboxEnabled) {
				return {
					content: [{ type: "text", text: "サンドボックスはアクティブではありません。bash ツールを直接使用してください。" }],
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
					`現在のモード: ${modeLabel(currentMode)}`,
					"",
					"このコマンドをサンドボックス外で実行しますか？",
				].join("\n"),
			);

			if (!ok) {
				return {
					content: [{
						type: "text",
						text: "権限昇格がユーザーによって拒否されました。コマンドは実行されませんでした。" +
							"サンドボックス制約内で動作する別の方法を検討するか、" +
							"ユーザーに `/sandbox-mode yolo` の手動実行を依頼してください。",
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
			"サンドボックスがアクティブな場合、直接の bash 実行はブロックされます。" +
			"コマンドはサンドボックス化された bash ツール経由で実行してください。",
		);
	});

	// ─── Commands ────────────────────────────────────────────────────

	pi.registerCommand("sandbox", {
		description: "現在の sandbox 設定を表示",
		handler: async (_args, ctx) => {
			const ck = (b: boolean) => b ? "ON" : "OFF";
			const roots = (r: string[]) => r.length > 0 ? r.join(", ") : "(cwd)";
			ctx.ui.notify(`サンドボックス状態:
  有効: ${ck(sandboxEnabled)} | 利用可能: ${ck(sandboxAvailable)} | 明示的無効化: ${ck(explicitlyDisabled)}
  モード: ${currentMode} (${modeLabel(currentMode)}) | CWD: ${currentCwd || "(未初期化)"}
  Workspace ルート: ${roots(resolvedWorkspaceRoots)} | 書き込み可能ルート: ${roots(resolvedWritableRoots)}
  フルアクセス承認済み: ${ck(yoloState.yoloApproved)}

注: bash ツールのみがサンドボックス化されます。他のツールはサンドボックス化されません。`, "info");
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
					`現在のモード: ${currentMode} (${modeLabel(currentMode)})`,
					"info",
				);
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
				const ok = await ctx.ui.confirm(
					"[!] サンドボックスを無効化しますか？",
					yoloApprovalMessage(),
				);
				if (!ok) {
					ctx.ui.notify("モード変更はキャンセルされました", "info");
					return;
				}
								approveYolo("コマンド /sandbox-mode で承認");
			} else {
				resetYoloApproval();
			}

			currentMode = newMode;
			updateStatusBar(ctx);
			ctx.ui.notify(
				`サンドボックスモードを変更しました: ${modeLabel(currentMode)}`,
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

		const icon = currentMode === "yolo" ? "[!]" : "[o]";
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
			ctx.ui.notify("--no-sandbox によりサンドボックスは明示的に無効化されました", "warning");
			return;
		}

		sandboxAvailable = await isMacSandboxAvailable();

		const modeFlag = pi.getFlag("sandbox-mode") as string;
		if (modeFlag) {
			const parsed = parseSandboxMode(modeFlag);
			if (parsed) currentMode = parsed;
			else ctx.ui.notify(`無効な --sandbox-mode: ${modeFlag}。デフォルトの workspace_write を使用します`, "warning");
		}

		// SECURITY: yolo requires approval even at startup
		if (currentMode === "yolo") {
			const ok = await ctx.ui.confirm(
				"[!] サンドボックスモード: フルアクセス",
				`サンドボックスモードが yolo に設定されています。\n\n${yoloApprovalMessage()}`,
			);
			if (ok) {
								approveYolo("セッション開始時に承認");
			} else {
				currentMode = "workspace_write";
				resetYoloApproval();
				ctx.ui.notify(
					"yolo が承認されませんでした。workspace_write にフォールバックします。",
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
				`セキュリティ: 安全でない workspace ルート: ${(e as Error).message}。安全のためサンドボックスを無効化しました。コマンドは拒否されます。`,
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
				"[!] このシステムではサンドボックスを利用できません。" +
				"bash コマンドは拒否されます。" +
				"--no-sandbox で明示的に無効化してください（非推奨）。",
				"error",
			);
			return;
		}

		sandboxEnabled = true;
		updateStatusBar(ctx);
		ctx.ui.notify(
			`サンドボックス有効: ${modeLabel(currentMode)}`,
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
