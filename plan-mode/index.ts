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
	updateThinkingConfig,
	updateConfigField,
	createDefaultConfig,
	isThinkingLevel,
	formatThinkingLevel,
	compactOldProposedPlansInText,
	type ModelRef,
	type PlanModeConfig,
	type ThinkingLevel,
} from "./utils.js";

export default function planModeExtension(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	const state = createInitialState();
	let suppressModelSelectPersist = false;
	let suppressThinkingSelectPersist = false;

	/** Run an async callback with a suppress flag set, restoring it afterward. */
	async function withModelSuppressed<T>(fn: () => Promise<T>): Promise<T> {
		suppressModelSelectPersist = true;
		try { return await fn(); } finally { suppressModelSelectPersist = false; }
	}

	/** Run a callback with thinking-select persistence suppressed. */
	function withThinkingSuppressed(fn: () => void): void {
		suppressThinkingSelectPersist = true;
		try { fn(); } finally { suppressThinkingSelectPersist = false; }
	}

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
		return withModelSuppressed(async () => {
			const ok = await pi.setModel(model);
			if (!ok) {
				ctx.ui.notify(`${label}: ${formatModelRef(ref)} の API key がありません`, "warning");
				return false;
			}
			return true;
		});
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
			const mainThinking = pi.getThinkingLevel();
			state.savedMainThinking = mainThinking;
			updateThinkingConfig(state.modelConfig, "main", mainThinking, configPath);
		}

		// 2. Enter plan mode (restrict tools)
		if (!state.savedActiveTools) {
			state.savedActiveTools = pi.getActiveTools();
		}
		state.mode = "plan";
		Object.assign(state, { pendingPlan: undefined, implementationPlan: undefined, planPromptDelivered: false, planPromptHash: undefined });
		pi.setActiveTools([...SAFE_PLAN_TOOLS]);

		// 3. Switch to plan model if configured
		const planRef = state.modelConfig.models.plan;
		if (planRef) {
			await trySetModel(planRef, ctx, "Plan model");
		}

		// 4. Switch to plan thinking level if configured
		const planThinking = state.modelConfig.thinking.plan;
		if (planThinking) {
			withThinkingSuppressed(() => pi.setThinkingLevel(planThinking));
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

		// 4. Restore main thinking level
		const mainThinking = state.modelConfig.thinking.main ?? state.savedMainThinking;
		if (mainThinking) {
			withThinkingSuppressed(() => pi.setThinkingLevel(mainThinking));
		}

		// 5. Clean up state
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined, savedMainModel: undefined, savedMainThinking: undefined });

		if (plan) {
			state.implementationPlan = plan;
			pi.sendUserMessage("保存された plan に従って実装してください。");
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
				const mainThinking = formatThinkingLevel(state.modelConfig.thinking.main);
				const planThinking = formatThinkingLevel(state.modelConfig.thinking.plan);
				const currentThinking = pi.getThinkingLevel();
				ctx.ui.notify(
					`Mode: ${state.mode} | Current: ${current} [${currentThinking}] | Main: ${main} [${mainThinking}] | Plan: ${plan} [${planThinking}]`,
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
			// /plan-model plan [provider/modelId]
			if (parts[0] === "main" || parts[0] === "plan") {
				const target = parts[0] as "main" | "plan";
				const label = `${target === "main" ? "Main" : "Plan"} model`;
				if (parts[1]) {
					const ref = parseModelRef(parts.slice(1).join(" "));
					if (!ref) {
						ctx.ui.notify("Invalid model reference. Use provider/modelId format.", "error");
						return;
					}
					updateModelConfig(state.modelConfig, target, ref, configPath);
					ctx.ui.notify(`${label} set to ${formatModelRef(ref)}`, "info");
					if (state.mode === target) {
						await trySetModel(ref, ctx, label);
					}
				} else {
					const ref = currentModelRef(ctx);
					if (ref) {
						updateModelConfig(state.modelConfig, target, ref, configPath);
						ctx.ui.notify(`${label} saved: ${formatModelRef(ref)}`, "info");
					} else {
						ctx.ui.notify("No current model to save", "warning");
					}
				}
				return;
			}

			ctx.ui.notify("Usage: /plan-model status | main [provider/modelId] | plan [provider/modelId] | clear main|plan|all", "warning");
		},
	});

	// ─── /plan-thinking command ───────────────────────────────────────

	const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

	pi.registerCommand("plan-thinking", {
		description: "main/plan モード別 thinking effort 設定",
		getArgumentCompletions(prefix: string) {
			const subs = [
				{ value: "status", label: "status", description: "現在の thinking 設定を表示" },
				...THINKING_LEVELS.map((l) => ({
					value: `main ${l}`, label: `main ${l}`, description: `main mode 用 thinking: ${l}`,
				})),
				...THINKING_LEVELS.map((l) => ({
					value: `plan ${l}`, label: `plan ${l}`, description: `plan mode 用 thinking: ${l}`,
				})),
				{ value: "clear main", label: "clear main", description: "main thinking 設定を削除" },
				{ value: "clear plan", label: "clear plan", description: "plan thinking 設定を削除" },
				{ value: "clear all", label: "clear all", description: "全 thinking 設定を削除" },
				];
			return subs.filter((s) => s.value.startsWith(prefix));
		},
		handler: async (args, ctx) => {
			const parts = args?.trim().split(/\s+/) ?? [];

			// /plan-thinking status
			if (parts[0] === "status" || parts.length === 0) {
				const current = pi.getThinkingLevel();
				const mainThinking = formatThinkingLevel(state.modelConfig.thinking.main);
				const planThinking = formatThinkingLevel(state.modelConfig.thinking.plan);
				ctx.ui.notify(
					`Mode: ${state.mode} | Current: ${current} | Main thinking: ${mainThinking} | Plan thinking: ${planThinking}`,
					"info",
				);
				return;
			}

			// /plan-thinking clear <main|plan|all>
			if (parts[0] === "clear") {
				const target = parts[1];
				if (target === "main") {
					updateThinkingConfig(state.modelConfig, "main", undefined, configPath);
					ctx.ui.notify("Main thinking setting cleared", "info");
				} else if (target === "plan") {
					updateThinkingConfig(state.modelConfig, "plan", undefined, configPath);
					ctx.ui.notify("Plan thinking setting cleared", "info");
				} else if (target === "all") {
					state.modelConfig.thinking = {};
					saveModelConfig(state.modelConfig, configPath);
					ctx.ui.notify("All thinking settings cleared", "info");
				} else {
					ctx.ui.notify("Usage: /plan-thinking clear main|plan|all", "warning");
				}
				return;
			}

			// /plan-thinking main [level]
			// /plan-thinking plan [level]
			if (parts[0] === "main" || parts[0] === "plan") {
				const target = parts[0] as "main" | "plan";
				const label = target === "main" ? "Main" : "Plan";
				if (parts[1]) {
					if (!isThinkingLevel(parts[1])) {
						ctx.ui.notify(`Invalid thinking level: ${parts[1]}. Use: ${THINKING_LEVELS.join(", ")}`, "error");
						return;
					}
					const level = parts[1] as ThinkingLevel;
					updateThinkingConfig(state.modelConfig, target, level, configPath);
					ctx.ui.notify(`${label} thinking set to ${level}`, "info");
					if (state.mode === target) {
						withThinkingSuppressed(() => pi.setThinkingLevel(level));
					}
				} else {
					const level = pi.getThinkingLevel();
					updateThinkingConfig(state.modelConfig, target, level, configPath);
					ctx.ui.notify(`${label} thinking saved: ${level}`, "info");
				}
				return;
			}

			ctx.ui.notify("Usage: /plan-thinking status | main [level] | plan [level] | clear main|plan|all", "warning");
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

	pi.on("context", async (event) => {
		const messages = event.messages;
		// Scan messages from end (most recent) to find the latest <proposed_plan>
		let foundLatest = false;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role !== "assistant") continue;

			const textParts = (msg as { content?: unknown }).content;
			if (!Array.isArray(textParts)) continue;

			for (let j = 0; j < textParts.length; j++) {
				const part = textParts[j] as { type?: string; text?: string };
				if (part.type !== "text" || typeof part.text !== "string") continue;
				if (!/<proposed_plan>[\s\S]*?<\/proposed_plan>/.test(part.text)) continue;

				if (!foundLatest) {
					foundLatest = true; // keep the latest one intact
				} else {
					// older plan — compact it
					textParts[j] = { ...part, text: compactOldProposedPlansInText(part.text, false) };
				}
			}
		}

		return { messages };
	});

	pi.on("before_agent_start", async (event) => {
		// Inject implementation plan once into main mode system prompt, then clear it
		if (state.mode === "main" && state.implementationPlan) {
			const plan = state.implementationPlan;
			state.implementationPlan = undefined;

			return {
				systemPrompt: `${event.systemPrompt}

Implementation plan for this turn:
<plan>
${plan}
</plan>`,
			};
		}

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

	// Track config changes per-mode
	function persistIfChanged<T>(
		section: "models" | "thinking",
		mode: "main" | "plan",
		value: T | undefined,
		isEqual: (a: T | undefined, b: T | undefined) => boolean,
	): void {
		const current = (state.modelConfig[section] as Record<string, T | undefined>)[mode];
		if (!isEqual(current, value)) {
			updateConfigField(state.modelConfig, section, mode, value, configPath);
		}
	}

	// Track model changes per-mode
	pi.on("model_select", async (event) => {
		if (event.source === "restore") return;
		if (suppressModelSelectPersist) return;

		const ref: ModelRef = { provider: event.model.provider, modelId: event.model.id };
		persistIfChanged("models", state.mode, ref, sameModelRef);
	});

	// Track thinking level changes per-mode
	pi.on("thinking_level_select", async (event) => {
		if (suppressThinkingSelectPersist) return;

		const level = event.level;
		persistIfChanged("thinking", state.mode, level, (a, b) => a === b);
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
			// Apply configured main thinking level if set
			if (state.modelConfig.thinking.main) {
				withThinkingSuppressed(() => pi.setThinkingLevel(state.modelConfig.thinking.main));
			}
		}
	});
}
