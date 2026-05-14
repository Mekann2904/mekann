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

	// ─── Generic mode-config command factory ─────────────────────────

	interface ModeConfigOpts<T> {
		commandName: string;
		description: string;
		section: "models" | "thinking";
		itemLabel: string;
		formatValue: (value: T) => string;
		parseValue: (input: string) => T | undefined;
		getCurrentValue: (ctx: ExtensionContext) => T | undefined;
		applyIfActive: (target: "main" | "plan", value: T, ctx: ExtensionContext) => Promise<void> | void;
		clearAll: () => void;
		formatStatus: (ctx: ExtensionContext) => string;
		usage: string;
		completions: string[];
	}

	function registerModeConfigCommand<T>(opts: ModeConfigOpts<T>): void {
		pi.registerCommand(opts.commandName, {
			description: opts.description,
		getArgumentCompletions(prefix: string) {
			return opts.completions
				.filter((s) => s.startsWith(prefix))
				.map((s) => ({ value: s, label: s }));
		},
			handler: async (args, ctx) => {
				const parts = args?.trim().split(/\s+/) ?? [];

				// status
				if (parts[0] === "status" || parts.length === 0) {
					ctx.ui.notify(opts.formatStatus(ctx), "info");
					return;
				}

				// clear <main|plan|all>
				if (parts[0] === "clear") {
					const target = parts[1];
					if (target === "main" || target === "plan") {
						updateConfigField(state.modelConfig, opts.section, target, undefined, configPath);
						ctx.ui.notify(`${target === "main" ? "Main" : "Plan"} ${opts.itemLabel} setting cleared`, "info");
					} else if (target === "all") {
						opts.clearAll();
						saveModelConfig(state.modelConfig, configPath);
						ctx.ui.notify(`All ${opts.itemLabel} settings cleared`, "info");
					} else {
						ctx.ui.notify(`Usage: /${opts.commandName} clear main|plan|all`, "warning");
					}
					return;
				}

				// main [value] / plan [value]
				if (parts[0] === "main" || parts[0] === "plan") {
					const target = parts[0] as "main" | "plan";
					const label = target === "main" ? "Main" : "Plan";
					if (parts[1]) {
						const value = opts.parseValue(parts.slice(1).join(" "));
						if (!value) {
							ctx.ui.notify(`Invalid ${opts.itemLabel} format.`, "error");
							return;
						}
						updateConfigField(state.modelConfig, opts.section, target, value, configPath);
						ctx.ui.notify(`${label} ${opts.itemLabel} set to ${opts.formatValue(value)}`, "info");
						if (state.mode === target) {
							await opts.applyIfActive(target, value, ctx);
						}
					} else {
						const value = opts.getCurrentValue(ctx);
						if (value) {
							updateConfigField(state.modelConfig, opts.section, target, value, configPath);
							ctx.ui.notify(`${label} ${opts.itemLabel} saved: ${opts.formatValue(value)}`, "info");
						} else {
							ctx.ui.notify(`No current ${opts.itemLabel} to save`, "warning");
						}
					}
					return;
				}

				ctx.ui.notify(opts.usage, "warning");
			},
		});
	}

	// ─── Commands ───────────────────────────────────────────────────

	pi.registerCommand("plan", {
		description: "プランモード切替",
		handler: (_args, ctx) => togglePlanMode(ctx),
	});

	// ─── /plan-model command ─────────────────────────────────────────

	registerModeConfigCommand<ModelRef>({
		commandName: "plan-model",
		description: "main/plan モード別モデル設定",
		section: "models",
		itemLabel: "model",
		formatValue: formatModelRef,
		parseValue: (input) => parseModelRef(input),
		getCurrentValue: (ctx) => currentModelRef(ctx),
		applyIfActive: async (target, ref, ctx) => {
			await trySetModel(ref, ctx, `${target === "main" ? "Main" : "Plan"} model`);
		},
		clearAll: () => { state.modelConfig = createDefaultConfig(); },
		formatStatus: (ctx) => {
			const fmt = (ref: ModelRef | undefined) => {
				if (!ref) return "(unset)";
				const avail = ctx.modelRegistry.find(ref.provider, ref.modelId) ? "✓" : "✗";
				return `${formatModelRef(ref)} ${avail}`;
			};
			const current = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "(none)";
			const mainThinking = formatThinkingLevel(state.modelConfig.thinking.main);
			const planThinking = formatThinkingLevel(state.modelConfig.thinking.plan);
			return `Mode: ${state.mode} | Current: ${current} [${pi.getThinkingLevel()}] | Main: ${fmt(state.modelConfig.models.main)} [${mainThinking}] | Plan: ${fmt(state.modelConfig.models.plan)} [${planThinking}]`;
		},
		usage: "Usage: /plan-model status | main [provider/modelId] | plan [provider/modelId] | clear main|plan|all",
		completions: ["status", "main", "plan", "clear"],
	});

	// ─── /plan-thinking command ───────────────────────────────────────

	const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

	registerModeConfigCommand<ThinkingLevel>({
		commandName: "plan-thinking",
		description: "main/plan モード別 thinking effort 設定",
		section: "thinking",
		itemLabel: "thinking",
		formatValue: (v) => v,
		parseValue: (input) => isThinkingLevel(input) ? (input as ThinkingLevel) : undefined,
		getCurrentValue: () => pi.getThinkingLevel() as ThinkingLevel,
		applyIfActive: (_target, level) => {
			withThinkingSuppressed(() => pi.setThinkingLevel(level));
		},
		clearAll: () => { state.modelConfig.thinking = {}; },
		formatStatus: (_ctx) => {
			const current = pi.getThinkingLevel();
			const mainThinking = formatThinkingLevel(state.modelConfig.thinking.main);
			const planThinking = formatThinkingLevel(state.modelConfig.thinking.plan);
			return `Mode: ${state.mode} | Current: ${current} | Main thinking: ${mainThinking} | Plan thinking: ${planThinking}`;
		},
		usage: "Usage: /plan-thinking status | main [level] | plan [level] | clear main|plan|all",
		completions: [
			"status",
			...THINKING_LEVELS.map((l) => `main ${l}`),
			...THINKING_LEVELS.map((l) => `plan ${l}`),
			"clear main", "clear plan", "clear all",
		],
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
