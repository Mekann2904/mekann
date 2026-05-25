/**
 * Plan Mode Extension — 読み取り専用モードと実行モードのトグル。
 * /plan で main ↔ plan を切り替え。--plan フラグで plan モード起動。
 * main / plan それぞれにモデルを設定・永続化可能。
 */

import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createInitialState, isReadOnlyMode, isPlanReadOnlyCommandIntent, classifyCommandIntent, buildBlockReason, loadPrompt, hashContent, extractProposedPlan, PLAN_MODE_TOOLS, sameModelRef, loadModelConfig, updateConfigField, compactOldProposedPlansInText, type ModelRef, type ThinkingLevel, type MekannMode, type ModeName } from "./utils.js";
import { createModelManager, registerModeModelPersistence } from "../../core/model-manager.js";
import {
	SANDBOX_PUSH_PROFILE_EVENT, SANDBOX_POP_PROFILE_EVENT, PLAN_MODE_STATUS_EVENT,
	MEKANN_AUTORESEARCH_MODE_EVENT,
	type SandboxPushProfileEvent, type SandboxPopProfileEvent, type PlanModeStatusEvent,
	type AutoresearchModeEvent,
} from "../policy-core/modes.js";
import { registerPromptProvider, type PromptFragment } from "../../core/prompt-core/index.js";

// Lazy import for best-effort context ledger recording
async function recordPlanEvent(input: { cwd: string; title: string; summary: string; kind: "plan" | "user_decision"; priority: 0 | 1 | 2 | 3 | 4; evidenceLevel: "agent_inferred" | "user_decided"; sessionId?: string; turnId?: string; branchId?: string }): Promise<void> {
	try {
		const { appendContextEvent } = await import("../../context/ledger/store.js");
		await appendContextEvent(input);
	} catch { /* best-effort: ledger not available */ }
}

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
		try { pi.events.emit(event, data); } catch { /* sandbox / autoresearch extension not loaded */ }
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

	const modelManager = createModelManager({
		pi,
		withModelSuppressed,
		onResolvedRef: (_requested, resolved) => updateConfigField(state.modelConfig, "models", state.mode, resolved, configPath),
		onUnavailableRef: () => updateConfigField(state.modelConfig, "models", state.mode, undefined, configPath),
	});
	const { trySetModel } = modelManager;

	function logBlockedTool(extra: Record<string, unknown>) {
		pi.appendEntry("plan-mode-blocked-tool", { at: Date.now(), mode: state.mode, ...extra });
	}

	// ─── Status bar ────────────────────────────────────────────────────

	/** Notify sandbox extension of current mode so it can render a combined status line. */
	function updateModeStatus(_ctx: ExtensionContext): void {
		safeEmit(PLAN_MODE_STATUS_EVENT, { mode: state.mode } satisfies PlanModeStatusEvent);
	}

	// ─── Common helpers for mode transitions ───────────────────────

	/** Snapshot & persist current main model/thinking (called before leaving main). */
	function snapshotMain(ctx: ExtensionContext): void {
		const _m = ctx.model;
		const mainRef = _m ? { provider: _m.provider, modelId: _m.id } as ModelRef : undefined;
		if (mainRef && ctx.modelRegistry.find(mainRef.provider, mainRef.modelId)) {
			state.savedMainModel = mainRef;
			updateConfigField(state.modelConfig, "models", "main", mainRef, configPath);
		}
		const mainThinking = pi.getThinkingLevel();
		state.savedMainThinking = mainThinking;
		updateConfigField(state.modelConfig, "thinking", "main", mainThinking, configPath);
	}

	/** Save active tools on first transition away from main. */
	function saveActiveToolsIfFirst(): void {
		if (!state.savedActiveTools) state.savedActiveTools = pi.getActiveTools();
	}

	/** Restore main model, thinking, and tools from any non-main mode. */
	async function restoreMainModelAndThinking(ctx: ExtensionContext): Promise<void> {
		const mainRef = state.modelConfig.models.main;
		const result = await trySetModel(mainRef, ctx, "Main model");
		if (result !== "ok" && state.savedMainModel && !sameModelRef(mainRef, state.savedMainModel)) {
			await trySetModel(state.savedMainModel, ctx, "Main model (fallback)");
		}
		applyThinking(state.modelConfig.thinking.main ?? state.savedMainThinking);
	}

	// ─── Mode transitions ───────────────────────────────────────────

	/** Transition to a target mode from any current mode. */
	async function transitionToMode(target: MekannMode, ctx: ExtensionContext, opts?: { persistCurrentMain?: boolean; purpose?: string }): Promise<void> {
		const previous = state.mode;
		if (previous === target) return;

		const persistCurrentMain = opts?.persistCurrentMain !== false;
		// ── Leave the current mode ──
		if (previous === "plan") {
			// Notify sandbox of mode change BEFORE popping override
			state.mode = target;
			updateModeStatus(ctx);
			popSandboxOverride();
			if (state.savedActiveTools) { pi.setActiveTools(state.savedActiveTools); state.savedActiveTools = undefined; }
			if ((target === "main" || target === "sub") && state.pendingPlan) {
				state.implementationPlan = state.pendingPlan;
				recordPlanEvent({ cwd: (ctx as any)?.cwd ?? process.cwd(), title: `Plan carried to ${target} mode`, summary: state.pendingPlan.slice(0, 300), kind: "plan", priority: 1, evidenceLevel: "agent_inferred", sessionId: (ctx as any)?.sessionId, turnId: (ctx as any)?.turnId, branchId: (ctx as any)?.branchId }).catch(() => {});
			}
			Object.assign(state, { pendingPlan: undefined, planPromptDelivered: false, planPromptHash: undefined, modeBeforePlan: undefined });
		} else if (previous === "auto") {
			// Leaving auto — just update mode
			if (state.mode !== target) state.mode = target;
			state.modeBeforeAuto = undefined;
		} else {
			// main/sub → other
			if (target === "plan" && (previous === "main" || previous === "sub")) state.modeBeforePlan = previous;
			if (target === "auto" && (previous === "main" || previous === "sub")) state.modeBeforeAuto = previous;
			if (state.mode !== target) state.mode = target;
		}

		// ── Snapshot main model/thinking if leaving main ──
		if (previous === "main" && persistCurrentMain) {
			snapshotMain(ctx);
		}

		// ── Enter the target mode ──
		if (target === "plan") {
			saveActiveToolsIfFirst();
			pi.setActiveTools([...PLAN_MODE_TOOLS]);
			sandboxOverrideToken = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			safeEmit(SANDBOX_PUSH_PROFILE_EVENT, { owner: "plan-mode", token: sandboxOverrideToken, profile: "plan_read_only" } satisfies SandboxPushProfileEvent);
			const planRef = state.modelConfig.models.plan;
			if (planRef) await trySetModel(planRef, ctx, "Plan model");
			applyThinking(state.modelConfig.thinking.plan);
		} else if (target === "auto") {
			// Auto mode: no tool restrictions, no sandbox override
			const autoRef = state.modelConfig.models.auto;
			if (autoRef) await trySetModel(autoRef, ctx, "Auto model");
			applyThinking(state.modelConfig.thinking.auto);
		} else if (target === "sub") {
			// Sub mode: main-like permissions, subagent-oriented prompt, per-mode model/thinking
			const subRef = state.modelConfig.models.sub;
			if (subRef) await trySetModel(subRef, ctx, "Sub model");
			applyThinking(state.modelConfig.thinking.sub);
			if (state.implementationPlan) {
				pi.sendUserMessage("保存された plan に従って実装してください。");
			}
		} else {
			// target === "main"
			await restoreMainModelAndThinking(ctx);
			Object.assign(state, { savedMainModel: undefined, savedMainThinking: undefined });
			if (state.implementationPlan) {
				pi.sendUserMessage("保存された plan に従って実装してください。");
			}
		}

		if (previous !== "plan") updateModeStatus(ctx);
	}

	/** Toggle plan mode on/off. */
	async function togglePlanMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "plan") await transitionToMode(state.modeBeforePlan ?? "main", ctx);
		else await transitionToMode("plan", ctx);
	}

	/** Toggle sub mode on/off. */
	async function toggleSubMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "sub") await transitionToMode("main", ctx);
		else await transitionToMode("sub", ctx);
	}

	// ─── Commands ───────────────────────────────────────────────────
	// Note: /plan command is registered below (after session_start) to capture lastCtx.

	pi.registerShortcut(Key.super("p"), { description: "プランモード切替", handler: (ctx) => togglePlanMode(ctx) });
	pi.registerShortcut(Key.super("s"), { description: "Sub mode 切替", handler: (ctx) => toggleSubMode(ctx) });

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
				if (PLAN_PROMPT_STRATEGY === "token_minimal") {
					const currentHash = hashContent(fullPrompt);
					if (!state.planPromptDelivered || state.planPromptHash !== currentHash) {
						state.planPromptHash = currentHash;
						state.planPromptDelivered = true;
					}
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
					content: fullPrompt,
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
			if ((state.mode === "main" || state.mode === "sub") && state.implementationPlan) {
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
			if (state.mode === "sub") {
				fragments.push({
					id: "plan-mode:sub-mode-policy",
					source: "plan-mode",
					kind: "mode_policy",
					stability: "stable",
					scope: "mode",
					priority: 210,
					version: "v1",
					cacheIntent: "prefer_cache",
					content: loadPrompt("sub-mode"),
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

		if (plan && plan !== state.pendingPlan) {
			state.pendingPlan = plan;
			recordPlanEvent({ cwd: (ctx as any)?.cwd ?? process.cwd(), title: "Plan proposed", summary: plan.slice(0, 300), kind: "plan", priority: 2, evidenceLevel: "agent_inferred", sessionId: (ctx as any)?.sessionId, turnId: (ctx as any)?.turnId, branchId: (ctx as any)?.branchId }).catch(() => {});
		} else if (plan && plan === state.pendingPlan) {
			state.pendingPlan = plan;
		}
	});
	pi.on("turn_end", async () => { blockCount = 0; lastBlockedTool = ""; lastBlockedInput = ""; });

	// Track config changes per-mode
	function persistIfChanged<T>(
		section: "models" | "thinking",
		mode: ModeName,
		value: T | undefined,
		isEqual: (a: T | undefined, b: T | undefined) => boolean,
	): void {
		const current = (state.modelConfig[section] as Record<string, T | undefined>)[mode];
		if (!isEqual(current, value)) updateConfigField(state.modelConfig, section, mode, value, configPath);
	}

	registerModeModelPersistence({
		pi,
		getMode: () => state.mode,
		isModelSuppressed: () => suppressModelSelectPersist,
		isThinkingSuppressed: () => suppressThinkingSelectPersist,
		persistModel: (mode, ref) => {
			// model_select is emitted after pi has selected a concrete model. Persist it
			// directly instead of re-validating through modelRegistry.find(): some
			// providers/selector paths can expose a selected model that does not round-trip
			// through find() in this hook context, which made changes fail to persist.
			persistIfChanged("models", mode, ref, sameModelRef);
		},
		persistThinking: (mode, level) => persistIfChanged("thinking", mode, level, (a, b) => a === b),
	});
	// ─── Autoresearch mode event listener ─────────────────────────

	/** Last known ctx for event-driven transitions (set on session_start / command hooks). */
	let lastCtx: ExtensionContext | undefined;

	try {
		pi.events.on(MEKANN_AUTORESEARCH_MODE_EVENT, (data: unknown) => {
			const evt = data as AutoresearchModeEvent;
			if (!evt) return;
			if (evt.active) {
				// autoresearch activated → switch to auto mode
				if (state.mode === "auto") return; // already there
				if (state.mode === "main" || state.mode === "sub") state.modeBeforeAuto = state.mode;
				const ctx = lastCtx;
				if (ctx) {
					return transitionToMode("auto", ctx, { purpose: evt.purpose });
				} else {
					// No ctx available yet — just set state. Model will be corrected on next ctx.
					state.mode = "auto";
				}
			} else {
				// autoresearch deactivated → return to main
				if (state.mode !== "auto") return;
				const ctx = lastCtx;
				const target = state.modeBeforeAuto ?? "main";
				if (ctx) {
					return transitionToMode(target, ctx);
				} else {
					state.mode = target;
					state.modeBeforeAuto = undefined;
				}
			}
		});
	} catch {
		// events not available
	}

	pi.registerFlag("auto", { description: "auto(autoresearch)モードで起動", type: "boolean", default: false });
	pi.registerFlag("sub", { description: "sub mode で起動（subagent 並列活用）", type: "boolean", default: false });

	pi.on("session_start", async (_event, ctx) => {
		lastCtx = ctx;
		// Load config
		configPath = undefined; // use default path
		const loaded = loadModelConfig();
		state.modelConfig = loaded;

		if (pi.getFlag("plan") === true) {
			await transitionToMode("plan", ctx, { persistCurrentMain: false });
		} else if (pi.getFlag("auto") === true) {
			await transitionToMode("auto", ctx, { persistCurrentMain: false });
		} else if (pi.getFlag("sub") === true) {
			await transitionToMode("sub", ctx, { persistCurrentMain: false });
		} else {
			if (state.modelConfig.models.main) {
				await trySetModel(state.modelConfig.models.main, ctx, "Main model");
			}
			applyThinking(state.modelConfig.thinking.main);
		}
		updateModeStatus(ctx);
	});

	// Update lastCtx on every command so event handlers have a fresh context
	const origPlanHandler = (_args: string, ctx: ExtensionContext) => { lastCtx = ctx; return togglePlanMode(ctx); };
	pi.registerCommand("plan", { description: "プランモード切替", handler: origPlanHandler });
	const origSubHandler = (_args: string, ctx: ExtensionContext) => { lastCtx = ctx; return toggleSubMode(ctx); };
	pi.registerCommand("sub", { description: "Sub mode 切替", handler: origSubHandler });

	// Clean up sandbox override on session shutdown
	 pi.on("session_shutdown", async () => { popSandboxOverride(); });
}
