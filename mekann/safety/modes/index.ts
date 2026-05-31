/**
 * Modes Extension — コラボレーションモードのトグル。
 * main / read_only / auto / sub を管理。各モードでモデルを設定・永続化可能。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { createInitialState, isReadOnlyMode, isReadOnlyCommandIntent, classifyCommandIntent, buildBlockReason, loadPrompt, READ_ONLY_MODE_TOOLS, sameModelRef, loadModelConfig, updateConfigField, type ModelRef, type ThinkingLevel, type MekannMode, type ModeName } from "./utils.js";
import { createModelManager, registerModeModelPersistence } from "../../core/model-manager.js";
import {
	SANDBOX_PUSH_PROFILE_EVENT, SANDBOX_POP_PROFILE_EVENT, MODE_STATUS_EVENT,
	MEKANN_AUTORESEARCH_MODE_EVENT,
	type SandboxPushProfileEvent, type SandboxPopProfileEvent, type ModeStatusEvent,
	type AutoresearchModeEvent,
} from "../policy-core/modes.js";
import { registerPromptProvider, type PromptFragment } from "../../core/prompt-core/index.js";

export default function modesExtension(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	const state = createInitialState();
	let suppressModelSelectPersist = false;
	let suppressThinkingSelectPersist = false;

	/** Token for sandbox profile override (set on plan entry, cleared on exit). */
	let readOnlySandboxOverrideToken: string | undefined;

	function safeEmit(event: string, data: unknown): void {
		try { pi.events.emit(event, data); } catch { /* sandbox / autoresearch extension not loaded */ }
	}

	/** Pop sandbox profile override (best-effort; no-op if not active). */
	function popSandboxOverride(): void {
		if (!readOnlySandboxOverrideToken) return;
		safeEmit(SANDBOX_POP_PROFILE_EVENT, { owner: "read-only-mode", token: readOnlySandboxOverrideToken } satisfies SandboxPopProfileEvent);
		readOnlySandboxOverrideToken = undefined;
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

	// ─── Model helpers ──────────────────────────────────────────────

	const modelManager = createModelManager({
		pi,
		withModelSuppressed,
		onResolvedRef: (_requested, resolved) => updateConfigField(state.modelConfig, "models", state.mode, resolved, configPath),
	});
	const { trySetModel } = modelManager;

	function logBlockedTool(extra: Record<string, unknown>) {
		pi.appendEntry("modes-blocked-tool", { at: Date.now(), mode: state.mode, ...extra });
	}

	// ─── Status bar ────────────────────────────────────────────────────

	/** Notify sandbox extension of current mode so it can render a combined status line. */
	function updateModeStatus(_ctx: ExtensionContext): void {
		safeEmit(MODE_STATUS_EVENT, { mode: state.mode } satisfies ModeStatusEvent);
	}

	// ─── Common helpers for mode transitions ───────────────────────

	/** Snapshot current main model/thinking before leaving main. Do not persist here; user selections are persisted by model/thinking events. */
	function snapshotMain(ctx: ExtensionContext): void {
		const _m = ctx.model;
		const mainRef = _m ? { provider: _m.provider, modelId: _m.id } as ModelRef : undefined;
		if (mainRef) state.savedMainModel = mainRef;
		state.savedMainThinking = pi.getThinkingLevel();
	}

	/** Save active tools on first transition away from main. */
	function saveActiveToolsIfFirst(): void {
		if (!state.savedActiveTools) state.savedActiveTools = pi.getActiveTools();
	}

	/** Restore main model, thinking, and tools from any non-main mode. */
	async function restoreMainModelAndThinking(ctx: ExtensionContext): Promise<void> {
		const mainRef = state.modelConfig.models.main;
		if (mainRef) {
			await trySetModel(mainRef, ctx, "Main model");
		} else if (state.savedMainModel) {
			await trySetModel(state.savedMainModel, ctx, "Main model (fallback)");
		}
		applyThinking(state.modelConfig.thinking.main ?? state.savedMainThinking);
	}

	// ─── Mode transitions ───────────────────────────────────────────

	/** Transition to a target mode from any current mode. */
	async function transitionToMode(target: MekannMode, ctx: ExtensionContext, _opts?: { persistCurrentMain?: boolean; purpose?: string }): Promise<void> {
		const previous = state.mode;
		if (previous === target) return;

		// ── Leave the current mode ──
		if (previous === "read_only") {
			if (target === "auto") state.modeBeforeAuto = previous;
			state.mode = target;
			updateModeStatus(ctx);
			popSandboxOverride();
			if (state.savedActiveTools) { pi.setActiveTools(state.savedActiveTools); state.savedActiveTools = undefined; }
		} else if (previous === "auto") {
			if (state.mode !== target) state.mode = target;
			state.modeBeforeAuto = undefined;
		} else {
			// main/sub → other
			if (target === "auto" && (previous === "main" || previous === "sub")) state.modeBeforeAuto = previous;
			if (state.mode !== target) state.mode = target;
		}

		// ── Snapshot main model/thinking if leaving main ──
		if (previous === "main") {
			snapshotMain(ctx);
		}

		// ── Enter the target mode ──
		if (target === "read_only") {
			saveActiveToolsIfFirst();
			pi.setActiveTools([...READ_ONLY_MODE_TOOLS]);
			readOnlySandboxOverrideToken = `read-only-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
			safeEmit(SANDBOX_PUSH_PROFILE_EVENT, { owner: "read-only-mode", token: readOnlySandboxOverrideToken, profile: "read_only" } satisfies SandboxPushProfileEvent);
			const readOnlyRef = state.modelConfig.models.read_only;
			if (readOnlyRef) await trySetModel(readOnlyRef, ctx, "Read-only model");
			applyThinking(state.modelConfig.thinking.read_only);
		} else if (target === "auto") {
			const autoRef = state.modelConfig.models.auto;
			if (autoRef) await trySetModel(autoRef, ctx, "Auto model");
			applyThinking(state.modelConfig.thinking.auto);
		} else if (target === "sub") {
			const subRef = state.modelConfig.models.sub;
			if (subRef) await trySetModel(subRef, ctx, "Sub model");
			applyThinking(state.modelConfig.thinking.sub);
		} else {
			// target === "main"
			await restoreMainModelAndThinking(ctx);
			Object.assign(state, { savedMainModel: undefined, savedMainThinking: undefined });
		}

		updateModeStatus(ctx);
	}

	/** Toggle read-only mode on/off. */
	async function toggleReadOnlyMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "read_only") await transitionToMode("main", ctx);
		else await transitionToMode("read_only", ctx);
	}

	/** Toggle sub mode on/off. */
	async function toggleSubMode(ctx: ExtensionContext): Promise<void> {
		if (state.mode === "sub") await transitionToMode("main", ctx);
		else await transitionToMode("sub", ctx);
	}

	// ─── Commands ───────────────────────────────────────────────────

	pi.registerShortcut(Key.super("s"), { description: "Sub mode 切替", handler: (ctx) => toggleSubMode(ctx) });

	registerPromptProvider({
		id: "modes",
		getFragments() {
			const fragments: PromptFragment[] = [];

			if (state.mode === "read_only") {
				fragments.push({
					id: "modes:read-only-policy",
					source: "modes",
					kind: "mode_policy",
					stability: "stable",
					scope: "mode",
					priority: 200,
					version: "v1",
					cacheIntent: "prefer_cache",
					content: loadPrompt("read-only-mode"),
				});
			}
			if (state.mode === "sub") {
				fragments.push({
					id: "modes:sub-mode-policy",
					source: "modes",
					kind: "mode_policy",
					stability: "stable",
					scope: "mode",
					priority: 200,
					version: "v1",
					cacheIntent: "prefer_cache",
					content: "Sub mode: prefer independent subagents for separable investigation, verification, or parallel exploration; keep parent-verifiable results compact.",
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

		if (READ_ONLY_MODE_TOOLS.has(toolName) && toolName !== "bash") return;

		if (toolName === "bash") {
			const command = String(input.command ?? "");
			// UX guard: classify command intent for read-only mode.
			// Security boundary is the sandbox extension's OS-level policy.
			if (!isReadOnlyCommandIntent(command)) {
				const intent = classifyCommandIntent(command);
				logBlockedTool({ toolName: "bash", command, blockCount: 1, reason: `not-read-only-intent:${intent.kind}` });
				return { block: true, reason: `Read-only mode is active. Command intent "${intent.kind}" is not allowed:\n${command}\n理由: ${intent.reason}` };
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
				if (state.mode === "main" || state.mode === "sub" || state.mode === "read_only") state.modeBeforeAuto = state.mode;
				const ctx = lastCtx;
				if (ctx) {
					return transitionToMode("auto", ctx, { purpose: evt.purpose });
				} else {
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
	pi.registerFlag("plan", { description: "read-only mode で起動（旧 plan mode 互換）", type: "boolean", default: false });
	pi.registerFlag("sub", { description: "sub mode で起動（subagent 並列活用）", type: "boolean", default: false });

	pi.on("session_start", async (_event, ctx) => {
		lastCtx = ctx;
		configPath = undefined;
		const loaded = loadModelConfig();
		state.modelConfig = loaded;

		if (pi.getFlag("auto") === true) {
			await transitionToMode("auto", ctx, { persistCurrentMain: false });
		} else if (pi.getFlag("plan") === true) {
			await transitionToMode("read_only", ctx, { persistCurrentMain: false });
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

	const origReadOnlyHandler = (_args: string, ctx: ExtensionContext) => { lastCtx = ctx; return toggleReadOnlyMode(ctx); };
	pi.registerCommand("read-only", { description: "Read-only mode 切替", handler: origReadOnlyHandler });
	pi.registerCommand("plan", { description: "Read-only mode 切替（旧 plan mode 互換）", handler: origReadOnlyHandler });
	const origSubHandler = (_args: string, ctx: ExtensionContext) => { lastCtx = ctx; return toggleSubMode(ctx); };
	pi.registerCommand("sub", { description: "Sub mode 切替", handler: origSubHandler });

	// Clean up sandbox override on session shutdown
	 pi.on("session_shutdown", async () => { popSandboxOverride(); });
}
