/**
 * Plan Mode Extension — 読み取り専用モードと実行モードのトグル。
 * /plan で main ↔ plan を切り替え。--plan フラグで plan モード起動。
 * main / plan それぞれにモデルを設定・永続化可能。
 */

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createInitialState, isReadOnlyMode, modeLabel } from "./state.js";
import { isSafeCommand, classifyCommandIntent, buildBlockReason, loadPrompt, hashContent, extractProposedPlan, PLAN_MODE_TOOLS, formatModelRef, sameModelRef, loadModelConfig, saveModelConfig, updateConfigField, compactOldProposedPlansInText, type ModelRef, type PlanModeConfig, type ThinkingLevel } from "./utils.js";
import { SANDBOX_PUSH_PROFILE_EVENT, SANDBOX_POP_PROFILE_EVENT, type SandboxPushProfileEvent, type SandboxPopProfileEvent } from "../policy-core/modes.js";

export default function planModeExtension(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	const state = createInitialState();
	let suppressModelSelectPersist = false;
	let suppressThinkingSelectPersist = false;

	/** Token for sandbox profile override (set on plan entry, cleared on exit). */
	let sandboxOverrideToken: string | undefined;

	/** Pop sandbox profile override (best-effort; no-op if not active). */
	function popSandboxOverride(): void {
		if (!sandboxOverrideToken) return;
		try {
			 pi.events.emit(SANDBOX_POP_PROFILE_EVENT, { owner: "plan-mode", token: sandboxOverrideToken } satisfies SandboxPopProfileEvent);
		} catch { /* sandbox extension not loaded */ }
		sandboxOverrideToken = undefined;
	}

	/** Run an async callback with a suppress flag set, restoring it afterward. */
	async function withModelSuppressed<T>(fn: () => Promise<T>): Promise<T> {
		suppressModelSelectPersist = true;
		try { return await fn(); } finally { suppressModelSelectPersist = false; }
	}

	/** Apply a thinking level with suppress guard (safe to call when level is undefined). */
	function applyThinking(level?: ThinkingLevel): void {
		if (level) {
			suppressThinkingSelectPersist = true;
			try { pi.setThinkingLevel(level); } finally { suppressThinkingSelectPersist = false; }
		}
	}

	pi.registerFlag("plan", { description: "プランモードで起動（読み取り専用探索）", type: "boolean", default: false });

	// ─── Model helpers ──────────────────────────────────────────────

	/** Try to switch to the model identified by `ref`. Returns true on success. */
	async function trySetModel(ref: ModelRef | undefined, ctx: ExtensionContext, label: string): Promise<boolean> {
		if (!ref) return false;
		const model = ctx.modelRegistry.find(ref.provider, ref.modelId);
		if (!model) { ctx.ui.notify(`${label}: モデル ${formatModelRef(ref)} が見つかりません`, "warning"); return false; }
		return withModelSuppressed(async () => {
			const ok = await pi.setModel(model);
			if (!ok) { ctx.ui.notify(`${label}: ${formatModelRef(ref)} の API key がありません`, "warning"); return false; }
			return true;
		});
	}



	// ─── Mode transitions ───────────────────────────────────────────

	async function enterPlanMode(ctx: ExtensionContext, opts?: { persistCurrentMain?: boolean }): Promise<void> {
		const persistCurrentMain = opts?.persistCurrentMain !== false;

		// 1. Snapshot & persist current main model (only when explicitly toggling, not --plan startup)
		if (persistCurrentMain) {
			const _m = ctx.model;
				const mainRef = _m ? { provider: _m.provider, modelId: _m.id } as ModelRef : undefined;
			if (mainRef) { state.savedMainModel = mainRef; updateConfigField(state.modelConfig, "models", "main", mainRef, configPath); }
			const mainThinking = pi.getThinkingLevel();
			state.savedMainThinking = mainThinking;
			updateConfigField(state.modelConfig, "thinking", "main", mainThinking, configPath);
		}

		// 2. Enter plan mode (restrict tools)
		if (!state.savedActiveTools) state.savedActiveTools = pi.getActiveTools();
		state.mode = "plan";
		Object.assign(state, { pendingPlan: undefined, implementationPlan: undefined, planPromptDelivered: false, planPromptHash: undefined });
		pi.setActiveTools([...PLAN_MODE_TOOLS]);

		// 3. Push sandbox profile override (best-effort; no-op if sandbox extension is absent)
		sandboxOverrideToken = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		try {
			pi.events.emit(SANDBOX_PUSH_PROFILE_EVENT, { owner: "plan-mode", token: sandboxOverrideToken, profile: "plan_read_only" } satisfies SandboxPushProfileEvent);
		} catch {
			// sandbox extension not loaded — rely on UX guard only
		}

		// 4. Switch to plan model if configured
		const planRef = state.modelConfig.models.plan;
		if (planRef) await trySetModel(planRef, ctx, "Plan model");

		// 5. Switch to plan thinking level if configured
		applyThinking(state.modelConfig.thinking.plan);

		ctx.ui.notify(modeLabel(state.mode));
	}

	async function exitPlanMode(ctx: ExtensionContext): Promise<void> {
		// 1. Pop sandbox profile override
		popSandboxOverride();

		// 2. Restore tools
		if (state.savedActiveTools) { pi.setActiveTools(state.savedActiveTools); state.savedActiveTools = undefined; }

		// 3. Switch state to main BEFORE restoring model so model_select hook updates the correct mode
		const plan = state.pendingPlan;
		state.mode = "main";

		// 4. Restore main model
		const mainRef = state.modelConfig.models.main;
		const restored = await trySetModel(mainRef, ctx, "Main model");
		if (!restored && state.savedMainModel && !sameModelRef(mainRef, state.savedMainModel)) await trySetModel(state.savedMainModel, ctx, "Main model (fallback)");

		// 5. Restore main thinking level
		applyThinking(state.modelConfig.thinking.main ?? state.savedMainThinking);

		// 6. Clean up state
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined, savedMainModel: undefined, savedMainThinking: undefined });

		if (plan) { state.implementationPlan = plan; pi.sendUserMessage("保存された plan に従って実装してください。"); }
		ctx.ui.notify(modeLabel(state.mode));
	}

	async function togglePlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "main") await enterPlanMode(ctx); else await exitPlanMode(ctx);
	}

	// ─── Commands ───────────────────────────────────────────────────

	pi.registerCommand("plan", { description: "プランモード切替", handler: (_args, ctx) => togglePlanMode(ctx) });

	pi.registerShortcut(Key.super("p"), { description: "プランモード切替", handler: (ctx) => togglePlanMode(ctx) });

	// ─── Hooks ──────────────────────────────────────────────────────

	let blockCount = 0;
	let lastBlockedTool = "";
	let lastBlockedInput = "";

	pi.on("tool_call", async (event) => {
		if (!isReadOnlyMode(state.mode)) return;

		const { toolName } = event;
		const input = (event.input ?? {}) as Record<string, unknown>;

		if (PLAN_MODE_TOOLS.has(toolName) && toolName !== "bash") return;

		if (toolName === "bash") {
			const command = String(input.command ?? "");
			// UX guard: classify command intent for plan mode.
			// Security boundary is the sandbox extension's OS-level policy.
			if (!isSafeCommand(command)) {
				const intent = classifyCommandIntent(command);
				pi.appendEntry("plan-mode-blocked-tool", {
					at: Date.now(),
					mode: state.mode,
					toolName: "bash",
					command,
					blockCount: 1,
					reason: `not-read-only-intent:${intent.kind}`,
				});
				return { block: true, reason: `Plan mode is read-only. Command intent "${intent.kind}" is not allowed:\n${command}\n理由: ${intent.reason}` };
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

				if (!foundLatest) foundLatest = true; else textParts[j] = { ...part, text: compactOldProposedPlansInText(part.text) };
			}
		}

		return { messages };
	});

	pi.on("before_agent_start", async (event) => {
	// Inject implementation plan once into main mode system prompt, then clear it
		if (state.mode === "main" && state.implementationPlan) {
			const plan = state.implementationPlan;
			state.implementationPlan = undefined;
			return { systemPrompt: `${event.systemPrompt}\n\nImplementation plan for this turn:\n<plan>\n${plan}\n</plan>` };
		}

		if (!isReadOnlyMode(state.mode)) return;

		const fullPrompt = loadPrompt("plan-mode");
		const currentHash = hashContent(fullPrompt);
		const useFull = !state.planPromptDelivered || state.planPromptHash !== currentHash;
		if (useFull) { state.planPromptHash = currentHash; state.planPromptDelivered = true; }

		return { systemPrompt: `${event.systemPrompt}\n\n${useFull ? fullPrompt : loadPrompt("plan-mode-reminder")}` };
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

		if (plan) { state.pendingPlan = plan; ctx.ui.notify(modeLabel(state.mode)); }
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
		if (!isEqual(current, value)) updateConfigField(state.modelConfig, section, mode, value, configPath);
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
			await enterPlanMode(ctx, { persistCurrentMain: false });
		} else {
			if (state.modelConfig.models.main) await trySetModel(state.modelConfig.models.main, ctx, "Main model");
			applyThinking(state.modelConfig.thinking.main);
		}
	});

	// Clean up sandbox override on session shutdown
	 pi.on("session_shutdown", async () => { popSandboxOverride(); });
}
