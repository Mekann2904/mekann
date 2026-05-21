/**
 * Plan Mode Extension — 読み取り専用モードと実行モードのトグル。
 * /plan で main ↔ plan を切り替え。--plan フラグで plan モード起動。
 * main / plan それぞれにモデルを設定・永続化可能。
 */

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createInitialState, isReadOnlyMode, modeLabel, isPlanReadOnlyCommandIntent, classifyCommandIntent, buildBlockReason, loadPrompt, hashContent, extractProposedPlan, PLAN_MODE_TOOLS, formatModelRef, sameModelRef, loadModelConfig, saveModelConfig, updateConfigField, compactOldProposedPlansInText, type ModelRef, type PlanModeConfig, type ThinkingLevel } from "./utils.js";
import { SANDBOX_PUSH_PROFILE_EVENT, SANDBOX_POP_PROFILE_EVENT, PLAN_MODE_STATUS_EVENT, type SandboxPushProfileEvent, type SandboxPopProfileEvent, type PlanModeStatusEvent } from "../policy-core/modes.js";
import { registerPromptProvider, type PromptFragment } from "../../core/prompt-core/index.js";

type PlanPromptStrategy = "cache_friendly" | "token_minimal";
let PLAN_PROMPT_STRATEGY: PlanPromptStrategy = "token_minimal";

export default function planModeExtension(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	const state = createInitialState();
	let suppressModelSelectPersist = false;
	let suppressThinkingSelectPersist = false;

	/** Token for sandbox profile override (set on plan entry, cleared on exit). */
	let sandboxOverrideToken: string | undefined;

	function safeEmit(event: string, data: unknown): void {
		try { pi.events.emit(event, data); } catch { /* sandbox extension not loaded */ }
	}

	/** Pop sandbox profile override (best-effort; no-op if not active). */
	function popSandboxOverride(): void {
		if (!sandboxOverrideToken) return;
		safeEmit(SANDBOX_POP_PROFILE_EVENT, { owner: "plan-mode", token: sandboxOverrideToken } satisfies SandboxPopProfileEvent);
		sandboxOverrideToken = undefined;
	}

	/** Run an async callback with a suppress flag set, restoring it afterward. */
	async function withModelSuppressed<T>(fn: () => Promise<T>): Promise<T> {
		suppressModelSelectPersist = true;
		try { return await fn(); } finally { suppressModelSelectPersist = false; }
	}

	/** Apply a thinking level with suppress guard (safe to call when level is undefined). */
	function applyThinking(level?: ThinkingLevel): void {
		if (level) { suppressThinkingSelectPersist = true; try { pi.setThinkingLevel(level); } finally { suppressThinkingSelectPersist = false; } }
	}

	pi.registerFlag("plan", { description: "プランモードで起動（読み取り専用探索）", type: "boolean", default: false });

	// ─── Model helpers ──────────────────────────────────────────────

	/** Result of attempting to set a model via trySetModel. */
	type ModelLookupResult = "ok" | "not_found" | "no_key";

	/** Try to switch to the model identified by `ref`. Returns the outcome. */
	async function trySetModel(ref: ModelRef | undefined, ctx: ExtensionContext, label: string): Promise<ModelLookupResult> {
		if (!ref) return "not_found";
		const model = ctx.modelRegistry.find(ref.provider, ref.modelId);
		if (!model) { ctx.ui.notify(`${label}: モデル ${formatModelRef(ref)} が見つかりません。コンフィグをクリアします`, "warning"); return "not_found"; }
		return withModelSuppressed(async () => {
			const ok = await pi.setModel(model); if (!ok) { ctx.ui.notify(`${label}: ${formatModelRef(ref)} の API key がありません`, "warning"); return "no_key"; } return "ok";
		});
	}



	function logBlockedTool(extra: Record<string, unknown>) {
		pi.appendEntry("plan-mode-blocked-tool", { at: Date.now(), mode: state.mode, ...extra });
	}

	// ─── Status bar ────────────────────────────────────────────────────

	/** Notify sandbox extension of current mode so it can render a combined status line. */
	function updateModeStatus(_ctx: ExtensionContext): void {
		safeEmit(PLAN_MODE_STATUS_EVENT, { mode: state.mode } satisfies PlanModeStatusEvent);
	}

	// ─── Mode transitions ───────────────────────────────────────────

	async function enterPlanMode(ctx: ExtensionContext, opts?: { persistCurrentMain?: boolean }): Promise<void> {
		const persistCurrentMain = opts?.persistCurrentMain !== false;

		// 1. Snapshot & persist current main model (only when explicitly toggling, not --plan startup)
		if (persistCurrentMain) {
			const _m = ctx.model;
			const mainRef = _m ? { provider: _m.provider, modelId: _m.id } as ModelRef : undefined;
			// Only persist if the model actually exists in the registry (skip fallback models from failed restores)
			if (mainRef && ctx.modelRegistry.find(mainRef.provider, mainRef.modelId)) {
				state.savedMainModel = mainRef;
				updateConfigField(state.modelConfig, "models", "main", mainRef, configPath);
			}
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
		safeEmit(SANDBOX_PUSH_PROFILE_EVENT, { owner: "plan-mode", token: sandboxOverrideToken, profile: "plan_read_only" } satisfies SandboxPushProfileEvent);

		// 4. Switch to plan model if configured
		const planRef = state.modelConfig.models.plan;
		if (planRef) await trySetModel(planRef, ctx, "Plan model");

		// 5. Switch to plan thinking level if configured
		applyThinking(state.modelConfig.thinking.plan);
		updateModeStatus(ctx);
	}

	async function exitPlanMode(ctx: ExtensionContext): Promise<void> {
		// 1. Switch state to main BEFORE restoring model so model_select hook updates the correct mode
		const plan = state.pendingPlan;
		state.mode = "main";

		// 2. Notify sandbox of mode change BEFORE popping override to avoid stale display
		updateModeStatus(ctx);

		// 3. Pop sandbox profile override
		popSandboxOverride();

		// 4. Restore tools
		if (state.savedActiveTools) { pi.setActiveTools(state.savedActiveTools); state.savedActiveTools = undefined; }

		// 5. Restore main model
		const mainRef = state.modelConfig.models.main;
		const result = await trySetModel(mainRef, ctx, "Main model");
		if (result === "not_found") updateConfigField(state.modelConfig, "models", "main", undefined, configPath);
		if (result !== "ok" && state.savedMainModel && !sameModelRef(mainRef, state.savedMainModel)) {
			const fbResult = await trySetModel(state.savedMainModel, ctx, "Main model (fallback)");
			if (fbResult === "not_found") updateConfigField(state.modelConfig, "models", "main", undefined, configPath);
		}

		// 5. Restore main thinking level
		applyThinking(state.modelConfig.thinking.main ?? state.savedMainThinking);

		// 6. Clean up state
		Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined, savedMainModel: undefined, savedMainThinking: undefined });

		if (plan) { state.implementationPlan = plan; pi.sendUserMessage("保存された plan に従って実装してください。"); }
	}

	async function togglePlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "main") await enterPlanMode(ctx); else await exitPlanMode(ctx);
	}

	// ─── Commands ───────────────────────────────────────────────────

	pi.registerCommand("plan", { description: "プランモード切替", handler: (_args, ctx) => togglePlanMode(ctx) });

	pi.registerShortcut(Key.super("p"), { description: "プランモード切替", handler: (ctx) => togglePlanMode(ctx) });

	try {
		pi.events.on("cache-friendly-prompt:dynamic-tail-sent", (data: unknown) => {
			const ids = (data as { fragmentIds?: unknown }).fragmentIds;
			if (Array.isArray(ids) && ids.includes("plan-mode:implementation-plan")) state.implementationPlan = undefined;
		});
	} catch {
		// cache-friendly-prompt extension not loaded
	}

	registerPromptProvider({
		id: "plan-mode",
		getFragments() {
			const fragments: PromptFragment[] = [];
			if (isReadOnlyMode(state.mode)) {
				const fullPrompt = loadPrompt("plan-mode");
				let content = fullPrompt;
				if (PLAN_PROMPT_STRATEGY === "token_minimal") {
					const currentHash = hashContent(fullPrompt);
					const useFull = !state.planPromptDelivered || state.planPromptHash !== currentHash;
					if (useFull) { state.planPromptHash = currentHash; state.planPromptDelivered = true; }
					content = useFull ? fullPrompt : loadPrompt("plan-mode-reminder");
				}
				fragments.push({
					id: "plan-mode:mode-policy",
					source: "plan-mode",
					kind: "mode_policy",
					stability: "stable",
					scope: "mode",
					priority: 200,
					version: "v1",
					cacheIntent: "prefer_cache",
					content,
				});
				fragments.push({
					id: "plan-mode:turn-reminder",
					source: "plan-mode",
					kind: "current_context",
					stability: "dynamic",
					scope: "turn",
					priority: 650,
					version: "v1",
					cacheIntent: "avoid_cache",
					content: loadPrompt("plan-mode-reminder"),
				});
			}
			if (state.mode === "main" && state.implementationPlan) {
				const plan = state.implementationPlan;
				state.implementationPlan = undefined;
				fragments.push({
					id: "plan-mode:implementation-plan",
					source: "plan-mode",
					kind: "implementation_plan",
					stability: "dynamic",
					scope: "turn",
					priority: 600,
					version: "v1",
					cacheIntent: "avoid_cache",
					content: `Implementation plan for this turn:\n<plan>\n${plan}\n</plan>`,
				});
			}
			return fragments;
		},
	});

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
			if (!isPlanReadOnlyCommandIntent(command)) {
				const intent = classifyCommandIntent(command);
				logBlockedTool({ toolName: "bash", command, blockCount: 1, reason: `not-read-only-intent:${intent.kind}` });
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
		logBlockedTool({ toolName, path: typeof input?.path === "string" ? input.path : undefined, command: typeof input?.command === "string" ? input.command : undefined, blockCount });

		return { block: true, reason };
	});
	pi.on("context", async (event) => {
		const messages = event.messages;
		// Scan messages from end (most recent) to find the latest <proposed_plan>.
		// Compact older plans for both string content and text content blocks.
		let foundLatest = false;
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg.role !== "assistant") continue;

			const content = (msg as { content?: unknown }).content;
			if (typeof content === "string") {
				if (!/<proposed_plan>[\s\S]*?<\/proposed_plan>/.test(content)) continue;
				if (!foundLatest) foundLatest = true;
				else (msg as { content?: unknown }).content = compactOldProposedPlansInText(content);
				continue;
			}
			if (!Array.isArray(content)) continue;

			for (let j = content.length - 1; j >= 0; j--) {
				const part = content[j] as { type?: string; text?: string };
				if (part.type !== "text" || typeof part.text !== "string") continue;
				if (!/<proposed_plan>[\s\S]*?<\/proposed_plan>/.test(part.text)) continue;

				if (!foundLatest) foundLatest = true; else content[j] = { ...part, text: compactOldProposedPlansInText(part.text) };
			}
		}

		return { messages };
	});
	pi.on("agent_end", async (event, ctx) => {
		if (state.mode !== "plan") return;
		const lastAssistant = [...event.messages].reverse().find((m): m is AssistantMessage => m.role === "assistant" && Array.isArray(m.content));
		if (!lastAssistant) return;
		const plan = extractProposedPlan(lastAssistant.content.filter((b): b is TextContent => b.type === "text").map(b => b.text).join("\n"));

		if (plan) { state.pendingPlan = plan; }
	});
	pi.on("turn_end", async () => { blockCount = 0; lastBlockedTool = ""; lastBlockedInput = ""; });

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
	pi.on("model_select", async (event, ctx) => {
		if (event.source === "restore") return;
		if (suppressModelSelectPersist) return;
		const ref: ModelRef = { provider: event.model.provider, modelId: event.model.id };
		// model_select is emitted after pi has selected a concrete model. Persist it
		// directly instead of re-validating through modelRegistry.find(): some
		// providers/selector paths can expose a selected model that does not round-trip
		// through find() in this hook context, which made plan-mode changes fail to
		// persist. restore events are still ignored above to avoid saving fallback IDs.
		persistIfChanged("models", state.mode, ref, sameModelRef);
	});

	// Track thinking level changes per-mode
	pi.on("thinking_level_select", async (event) => {
		if (suppressThinkingSelectPersist) return;
		const level = event.level; persistIfChanged("thinking", state.mode, level, (a, b) => a === b);
	});
	pi.on("session_start", async (_event, ctx) => {
		// Load config
		configPath = undefined; // use default path
		const loaded = loadModelConfig();
		state.modelConfig = loaded;

		if (pi.getFlag("plan") === true) {
			await enterPlanMode(ctx, { persistCurrentMain: false });
		} else {
			if (state.modelConfig.models.main) {
				const result = await trySetModel(state.modelConfig.models.main, ctx, "Main model");
				if (result === "not_found") updateConfigField(state.modelConfig, "models", "main", undefined, configPath);
			}
			applyThinking(state.modelConfig.thinking.main);
		}
		updateModeStatus(ctx);
	});

	// Clean up sandbox override on session shutdown
	 pi.on("session_shutdown", async () => { popSandboxOverride(); });
}
