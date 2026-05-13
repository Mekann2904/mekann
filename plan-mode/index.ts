/**
 * Plan Mode Extension — 読み取り専用モードと実行モードのトグル。
 * /plan で main ↔ plan を切り替え。--plan フラグで plan モード起動。
 */

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import {
	createInitialState,
	isReadOnlyMode,
} from "./state.js";
import {
	isSafeCommand,
	buildBlockReason,
	loadPrompt,
	hashContent,
	extractProposedPlan,
} from "./utils.js";

const SAFE_PLAN_TOOLS = new Set(["read", "grep", "find", "ls"]);

export default function planModeExtension(pi: ExtensionAPI): void {
	const state = createInitialState();

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
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined });
		pi.setActiveTools([...SAFE_PLAN_TOOLS]);
		ctx.ui.notify("plan");
	}

	async function exitPlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.savedActiveTools) {
			pi.setActiveTools(state.savedActiveTools);
			state.savedActiveTools = undefined;
		}

		const plan = state.pendingPlan;
		state.mode = "main";
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined });
		if (plan) {
			pi.sendUserMessage(
				`以下の plan に従って実装してください。\n\n<plan>\n${plan}\n</plan>`,
			);
		}
		ctx.ui.notify("main");
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
		const useFull = !state.planPromptDelivered || state.planPromptHash !== currentHash;
		if (useFull) { state.planPromptHash = currentHash; state.planPromptDelivered = true; }

		return {
			systemPrompt: `${event.systemPrompt}\n\n${useFull ? fullPrompt : loadPrompt("plan-mode-reminder")}`,
		};
	});
	pi.on("agent_end", async (event, ctx) => {
		if (state.mode !== "plan") return;

		const lastAssistant = [...event.messages].reverse().find(
			(m): m is AssistantMessage => m.role === "assistant" && Array.isArray(m.content),
		);
		if (!lastAssistant) return;

		const plan = extractProposedPlan(
			lastAssistant.content.filter((b): b is TextContent => b.type === "text").map(b => b.text).join("\n"),
		);

		if (plan) {
			state.pendingPlan = plan;
			ctx.ui.notify("plan");
		}
	});
	pi.on("turn_end", async () => {
		blockCount = 0;
		lastBlockedTool = "";
		lastBlockedInput = "";
	});
	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			await enterPlanMode(ctx);
		}
	});
}
