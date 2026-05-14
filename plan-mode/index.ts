/**
 * Plan Mode Extension — 読み取り専用モードと実行モードのトグル。
 * /plan で main ↔ plan を切り替え。--plan フラグで plan モード起動。
 * main / plan それぞれにモデルを設定・永続化可能。
 */

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createInitialState, isReadOnlyMode, modeLabel } from "./state.js";
import {
	isSafeCommand,
	buildBlockReason,
	loadPrompt,
	hashContent,
	extractProposedPlan,
	SAFE_PLAN_TOOLS,
	parseModelRef,
	formatModelRef,
	sameModelRef,
	loadModelConfig,
	saveModelConfig,
	updateModelConfig,
	createDefaultConfig,
	type ModelRef,
	type PlanModeConfig,
} from "./utils.js";

export default function planModeExtension(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	const state = createInitialState();
	let suppressModelSelectPersist = false;

	pi.registerFlag("plan", {
		description: "プランモードで起動（読み取り専用探索）",
		type: "boolean",
		default: false,
	});

	// ─── Model helpers ──────────────────────────────────────────────

	/** Try to switch to the model identified by `ref`. Returns true on success. */
	async function trySetModel(ref: ModelRef | undefined, ctx: ExtensionContext, label: string): Promise<boolean> {
		if (!ref) return false;
		const model = ctx.modelRegistry.find(ref.provider, ref.modelId);
		if (!model) {
			ctx.ui.notify(`${label}: モデル ${formatModelRef(ref)} が見つかりません`, "warning");
			return false;
		}
		try {
			suppressModelSelectPersist = true;
			const ok = await pi.setModel(model);
			if (!ok) {
				ctx.ui.notify(`${label}: ${formatModelRef(ref)} の API key がありません`, "warning");
				return false;
			}
			return true;
		} finally {
			suppressModelSelectPersist = false;
		}
	}

	/** Extract ModelRef from the current ctx.model. */
	function currentModelRef(ctx: ExtensionContext): ModelRef | undefined {
		const m = ctx.model;
		if (!m) return undefined;
		return { provider: m.provider, modelId: m.id };
	}

	// ─── Mode transitions ───────────────────────────────────────────

	async function enterPlanMode(ctx: ExtensionContext, opts?: { persistCurrentMain?: boolean }): Promise<void> {
		const persistCurrentMain = opts?.persistCurrentMain !== false;

		// 1. Snapshot & persist current main model (only when explicitly toggling, not --plan startup)
		if (persistCurrentMain) {
			const mainRef = currentModelRef(ctx);
			if (mainRef) {
				state.savedMainModel = mainRef;
				updateModelConfig(state.modelConfig, "main", mainRef, configPath);
			}
		}

		// 2. Enter plan mode (restrict tools)
		if (!state.savedActiveTools) {
			state.savedActiveTools = pi.getActiveTools();
		}
		state.mode = "plan";
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined });
		pi.setActiveTools([...SAFE_PLAN_TOOLS]);

		// 3. Switch to plan model if configured
		const planRef = state.modelConfig.models.plan;
		if (planRef) {
			await trySetModel(planRef, ctx, "Plan model");
		}

		ctx.ui.notify(modeLabel(state.mode));
	}

	async function exitPlanMode(ctx: ExtensionContext): Promise<void> {
		// 1. Restore tools
		if (state.savedActiveTools) {
			pi.setActiveTools(state.savedActiveTools);
			state.savedActiveTools = undefined;
		}

		// 2. Switch state to main BEFORE restoring model so model_select hook updates the correct mode
		const plan = state.pendingPlan;
		state.mode = "main";

		// 3. Restore main model
		const mainRef = state.modelConfig.models.main;
		const restored = await trySetModel(mainRef, ctx, "Main model");
		if (!restored && state.savedMainModel && !sameModelRef(mainRef, state.savedMainModel)) {
			await trySetModel(state.savedMainModel, ctx, "Main model (fallback)");
		}

		// 4. Clean up state
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined, savedMainModel: undefined });

		if (plan) {
			pi.sendUserMessage(`以下の plan に従って実装してください。\n\n<plan>\n${plan}\n</plan>`);
		}
		ctx.ui.notify(modeLabel(state.mode));
	}

	async function togglePlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "main") {
			await enterPlanMode(ctx);
		} else {
			await exitPlanMode(ctx);
		}
	}

	// ─── Commands ───────────────────────────────────────────────────

	pi.registerCommand("plan", {
		description: "プランモード切替",
		handler: (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("plan-model", {
		description: "main/plan モード別モデル設定",
		getArgumentCompletions(prefix: string) {
			const subs = [
				{ value: "status", label: "status", description: "現在の設定を表示" },
				{ value: "main", label: "main", description: "main mode 用モデルを設定" },
				{ value: "plan", label: "plan", description: "plan mode 用モデルを設定" },
				{ value: "clear", label: "clear", description: "設定を削除 (main/plan/all)" },
			];
			return subs.filter((s) => s.value.startsWith(prefix));
		},
		handler: async (args, ctx) => {
			const parts = args?.trim().split(/\s+/) ?? [];

			// /plan-model status
			if (parts[0] === "status" || parts.length === 0) {
				const mainRef = state.modelConfig.models.main;
				const planRef = state.modelConfig.models.plan;
				const current = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(none)";
				const mainAvail = mainRef ? (ctx.modelRegistry.find(mainRef.provider, mainRef.modelId) ? "✓" : "✗") : "";
				const planAvail = planRef ? (ctx.modelRegistry.find(planRef.provider, planRef.modelId) ? "✓" : "✗") : "";
				const main = mainRef ? `${formatModelRef(mainRef)} ${mainAvail}` : "(unset)";
				const plan = planRef ? `${formatModelRef(planRef)} ${planAvail}` : "(unset)";
				ctx.ui.notify(
					`Mode: ${state.mode} | Current: ${current} | Main: ${main} | Plan: ${plan}`,
					"info",
				);
				return;
			}

			// /plan-model clear <main|plan|all>
			if (parts[0] === "clear") {
				const target = parts[1];
				if (target === "main") {
					updateModelConfig(state.modelConfig, "main", undefined, configPath);
					ctx.ui.notify("Main model setting cleared", "info");
				} else if (target === "plan") {
					updateModelConfig(state.modelConfig, "plan", undefined, configPath);
					ctx.ui.notify("Plan model setting cleared", "info");
				} else if (target === "all") {
					state.modelConfig = createDefaultConfig();
					saveModelConfig(state.modelConfig, configPath);
					ctx.ui.notify("All model settings cleared", "info");
				} else {
					ctx.ui.notify("Usage: /plan-model clear main|plan|all", "warning");
				}
				return;
			}

			// /plan-model main [provider/modelId]
			if (parts[0] === "main") {
				if (parts[1]) {
					const ref = parseModelRef(parts.slice(1).join(" "));
					if (!ref) {
						ctx.ui.notify("Invalid model reference. Use provider/modelId format.", "error");
						return;
					}
					updateModelConfig(state.modelConfig, "main", ref, configPath);
					ctx.ui.notify(`Main model set to ${formatModelRef(ref)}`, "info");
					if (state.mode === "main") {
						await trySetModel(ref, ctx, "Main model");
					}
				} else {
					// Save current model as main
					const ref = currentModelRef(ctx);
					if (ref) {
						updateModelConfig(state.modelConfig, "main", ref, configPath);
						ctx.ui.notify(`Main model saved: ${formatModelRef(ref)}`, "info");
					} else {
						ctx.ui.notify("No current model to save", "warning");
					}
				}
				return;
			}

			// /plan-model plan [provider/modelId]
			if (parts[0] === "plan") {
				if (parts[1]) {
					const ref = parseModelRef(parts.slice(1).join(" "));
					if (!ref) {
						ctx.ui.notify("Invalid model reference. Use provider/modelId format.", "error");
						return;
					}
					updateModelConfig(state.modelConfig, "plan", ref, configPath);
					ctx.ui.notify(`Plan model set to ${formatModelRef(ref)}`, "info");
					if (state.mode === "plan") {
						await trySetModel(ref, ctx, "Plan model");
					}
				} else {
					// Save current model as plan
					const ref = currentModelRef(ctx);
					if (ref) {
						updateModelConfig(state.modelConfig, "plan", ref, configPath);
						ctx.ui.notify(`Plan model saved: ${formatModelRef(ref)}`, "info");
					} else {
						ctx.ui.notify("No current model to save", "warning");
					}
				}
				return;
			}

			ctx.ui.notify("Usage: /plan-model status | main [provider/modelId] | plan [provider/modelId] | clear main|plan|all", "warning");
		},
	});

	pi.registerShortcut(Key.super("p"), {
		description: "プランモード切替",
		handler: (ctx) => togglePlanMode(ctx),
	});

	// ─── Hooks ──────────────────────────────────────────────────────

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
			ctx.ui.notify(modeLabel(state.mode));
		}
	});

	pi.on("turn_end", async () => {
		blockCount = 0;
		lastBlockedTool = "";
		lastBlockedInput = "";
	});

	// Track model changes per-mode
	pi.on("model_select", async (event) => {
		if (event.source === "restore") return;
		if (suppressModelSelectPersist) return;

		const ref: ModelRef = { provider: event.model.provider, modelId: event.model.id };
		if (state.mode === "main") {
			if (!sameModelRef(state.modelConfig.models.main, ref)) {
				updateModelConfig(state.modelConfig, "main", ref, configPath);
			}
		} else {
			if (!sameModelRef(state.modelConfig.models.plan, ref)) {
				updateModelConfig(state.modelConfig, "plan", ref, configPath);
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		// Load config
		configPath = undefined; // use default path
		const loaded = loadModelConfig();
		state.modelConfig = loaded;

		if (pi.getFlag("plan") === true) {
			// --plan startup: enter plan mode without overwriting hand-written config
			await enterPlanMode(ctx, { persistCurrentMain: false });
		} else {
			// Normal startup: apply configured main model if set
			if (state.modelConfig.models.main) {
				await trySetModel(state.modelConfig.models.main, ctx, "Main model");
			}
		}
	});
}
