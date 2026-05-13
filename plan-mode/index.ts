/**
 * Plan Mode Extension — 最小実装
 *
 * plan はテキストコンテキスト。Todo ではない。
 *
 *   main: 全ツール利用可能
 *   plan: 読み取り専用。調査と計画のみ。
 *
 * コマンド:
 *   /plan  — トグル (main → plan / plan → main)
 *
 * ショートカット:
 *   Cmd+P (super+p)  — /plan と同じ
 *
 * CLIフラグ:
 *   --plan  — プランモードで起動
 *
 * 挙動:
 *   main で /plan      → plan mode に入る (read-only tools)
 *   plan で /plan      → plan を実行して main に戻る
 *   plan で pendingPlan がない場合 → そのまま main に戻る
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import {
	createInitialState,
	type PlanState,
	isReadOnlyMode,
} from "./state.js";
import {
	isSafeCommand,
	buildBlockReason,
	loadPrompt,
	hashContent,
	sanitizePlanTools,
	extractProposedPlan,
} from "./utils.js";

const DEFAULT_PLAN_TOOLS = ["read", "grep", "find", "ls"];
const SAFE_PLAN_TOOLS = new Set(DEFAULT_PLAN_TOOLS);

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export default function planModeExtension(pi: ExtensionAPI): void {
	const state: PlanState = createInitialState();

	pi.registerFlag("plan", {
		description: "プランモードで起動（読み取り専用探索）",
		type: "boolean",
		default: false,
	});

	async function enterPlanMode(ctx: ExtensionContext): Promise<void> {
		if (!state.savedActiveTools) {
			state.savedActiveTools = pi.getActiveTools();
		}

		state.mode = "plan";
		state.pendingPlan = undefined;
		state.planPromptDelivered = false;
		state.planPromptHash = undefined;

		const safeTools = sanitizePlanTools(DEFAULT_PLAN_TOOLS);
		pi.setActiveTools(safeTools);

		ctx.ui.notify("plan");
	}

	async function exitPlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.savedActiveTools) {
			pi.setActiveTools(state.savedActiveTools);
			state.savedActiveTools = undefined;
		}

		const plan = state.pendingPlan;
		state.mode = "main";
		state.pendingPlan = undefined;
		state.planPromptDelivered = false;
		state.planPromptHash = undefined;

		if (plan) {
			ctx.ui.notify("main");
			pi.sendUserMessage(
				`以下の plan に従って実装してください。\n\n<plan>\n${plan}\n</plan>`,
			);
		} else {
			ctx.ui.notify("main");
		}
	}

	async function togglePlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "main") {
			await enterPlanMode(ctx);
		} else {
			await exitPlanMode(ctx);
		}
	}
	pi.registerCommand("plan", {
		description: "プランモード切替",
		handler: async (_args, ctx) => {
			await togglePlanMode(ctx);
		},
	});

	pi.registerShortcut(Key.super("p"), {
		description: "プランモード切替",
		handler: async (ctx) => {
			await togglePlanMode(ctx);
		},
	});

	let blockCount = 0;
	let lastBlockedTool = "";
	let lastBlockedInput = "";

	function resetBlockTracking(): void {
		blockCount = 0;
		lastBlockedTool = "";
		lastBlockedInput = "";
	}

	resetBlockTracking();

	pi.on("tool_call", async (event) => {
		if (!isReadOnlyMode(state.mode)) return;

		const { toolName } = event;
		const input = (event.input ?? {}) as Record<string, unknown>;

		if (SAFE_PLAN_TOOLS.has(toolName)) return;

		if (toolName === "bash") {
			const command = String(input.command ?? "");
			if (!isSafeCommand(command)) {
				pi.appendEntry("plan-mode-blocked-tool", {
					at: Date.now(),
					mode: state.mode,
					toolName: "bash",
					command,
					blockCount: 1,
					reason: "unsafe-bash",
				});
				return {
					block: true,
					reason: `Plan mode is read-only. Blocked unsafe bash command:\n${command}`,
				};
			}
			return;
		}

		const inputKey = String(input.path ?? "");
		if (toolName === lastBlockedTool && inputKey === lastBlockedInput) {
			blockCount++;
		} else {
			blockCount = 1;
			lastBlockedTool = toolName;
			lastBlockedInput = inputKey;
		}

		const reason = buildBlockReason(toolName, input, blockCount);

		pi.appendEntry("plan-mode-blocked-tool", {
			at: Date.now(),
			mode: state.mode,
			toolName,
			path: typeof input?.path === "string" ? input.path : undefined,
			command: typeof input?.command === "string" ? input.command : undefined,
			blockCount,
		});

		return { block: true, reason };
	});
	pi.on("before_agent_start", async (event) => {
		if (!isReadOnlyMode(state.mode)) return;

		const fullPrompt = loadPrompt("plan-mode");
		const currentHash = hashContent(fullPrompt);

		const shouldInjectFull =
			!state.planPromptDelivered ||
			state.planPromptHash !== currentHash;

		const prompt = shouldInjectFull
			? fullPrompt
			: loadPrompt("plan-mode-reminder");

		if (shouldInjectFull) {
			state.planPromptHash = currentHash;
			state.planPromptDelivered = true;
		}

		return {
			systemPrompt: `${event.systemPrompt}\n\n${prompt}`,
		};
	});
	pi.on("agent_end", async (event, ctx) => {
		if (state.mode !== "plan") return;

		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;

		const text = getTextContent(lastAssistant);
		const plan = extractProposedPlan(text);

		if (plan) {
			state.pendingPlan = plan;
			ctx.ui.notify("plan");
		}
	});
	pi.on("turn_end", async () => {
		resetBlockTracking();
	});
	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			if (!state.savedActiveTools) {
				state.savedActiveTools = pi.getActiveTools();
			}
			state.mode = "plan";
			const safeTools = sanitizePlanTools(DEFAULT_PLAN_TOOLS);
			pi.setActiveTools(safeTools);
			ctx.ui.notify("plan");
		}
	});
}
