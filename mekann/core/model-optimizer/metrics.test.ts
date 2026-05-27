/**
 * model-optimizer — metrics + command unit tests.
 */

import { describe, it, expect } from "vitest";
import { createMetrics, type ActiveOptimizationState } from "./types.js";
import { createActiveOptimizationState } from "./activeProfile.js";
import { registerMetrics } from "./metrics.js";
import { registerOverflowRecovery } from "./overflow.js";
import { getOptimizationProfile } from "./profiles.js";
import { registerCommands } from "./command.js";

// ---------------------------------------------------------------------------
// Metrics factory
// ---------------------------------------------------------------------------

describe("createMetrics", () => {
	it("returns zeroed metrics", () => {
		const m = createMetrics();
		expect(m.requestsObserved).toBe(0);
		expect(m.totalLatencyMs).toBe(0);
		expect(m.totalInputTokens).toBe(0);
		expect(m.totalOutputTokens).toBe(0);
		expect(m.overflowRecoveries).toBe(0);
		expect(m.byProvider).toEqual({});
		expect(m.byModel).toEqual({});
	});
});

// ---------------------------------------------------------------------------
// Metrics collection — drive message_start / message_end
// ---------------------------------------------------------------------------

interface FakeMessage {
	role: string;
	stopReason?: string;
	errorMessage?: string;
	usage?: { input?: number; output?: number; cacheRead?: number };
}

/** Drive a message_start → message_end pair through the metrics hooks. */
function drivePair(state: ActiveOptimizationState, provider: string, modelId: string, usage: FakeMessage["usage"] = {}): void {
	state.provider = provider;
	state.modelId = modelId;
	state.enabled = true;
	state.metricsEnabled = true;

	const handlers: Record<string, Array<(...a: unknown[]) => unknown>> = {};
	const pi = {
		on(event: string, handler: (...a: unknown[]) => unknown) {
			(handlers[event] ??= []).push(handler);
		},
	};

	registerMetrics(pi as never, state);

	// message_start (assistant)
	const startMsg: FakeMessage = { role: "assistant" };
	for (const h of handlers["message_start"] ?? []) {
		h({ message: startMsg });
	}

	// Allow a tiny delay so latency > 0
	// (we don't actually need real time, just verify the path)

	// message_end (assistant)
	const endMsg: FakeMessage = {
		role: "assistant",
		usage: {
			input: usage?.input ?? 100,
			output: usage?.output ?? 50,
			cacheRead: usage?.cacheRead ?? 0,
		},
	};
	for (const h of handlers["message_end"] ?? []) {
		h({ message: endMsg });
	}
}

describe("registerMetrics", () => {
	it("records one request for openai", () => {
		const state = createActiveOptimizationState();
		state.metrics = createMetrics();
		drivePair(state, "openai", "gpt-5.5", { input: 200, output: 100 });
		expect(state.metrics.requestsObserved).toBe(1);
		expect(state.metrics.byProvider["openai"]?.requests).toBe(1);
	});

	it("does not record when metricsEnabled is false", () => {
		const state = createActiveOptimizationState();
		state.metrics = createMetrics();
		state.enabled = true;
		state.metricsEnabled = false;
		state.provider = "openai";
		state.modelId = "gpt-5.5";

		const handlers: Record<string, Array<(...a: unknown[]) => unknown>> = {};
		const pi = {
			on(event: string, handler: (...a: unknown[]) => unknown) {
				(handlers[event] ??= []).push(handler);
			},
		};
		registerMetrics(pi as never, state);
		for (const h of handlers["message_end"] ?? []) {
			h({ message: { role: "assistant", usage: { input: 10, output: 10 } } });
		}
		expect(state.metrics.requestsObserved).toBe(0);
	});

	it("does not record when state.enabled is false", () => {
		const state = createActiveOptimizationState();
		state.metrics = createMetrics();
		state.enabled = false;
		state.metricsEnabled = true;
		state.provider = "openai";
		state.modelId = "gpt-5.5";

		const handlers: Record<string, Array<(...a: unknown[]) => unknown>> = {};
		const pi = {
			on(event: string, handler: (...a: unknown[]) => unknown) {
				(handlers[event] ??= []).push(handler);
			},
		};
		registerMetrics(pi as never, state);
		for (const h of handlers["message_end"] ?? []) {
			h({ message: { role: "assistant", usage: { input: 10, output: 10 } } });
		}
		expect(state.metrics.requestsObserved).toBe(0);
	});

	it("does not record non-assistant messages", () => {
		const state = createActiveOptimizationState();
		state.metrics = createMetrics();
		state.enabled = true;
		state.metricsEnabled = true;

		const handlers: Record<string, Array<(...a: unknown[]) => unknown>> = {};
		const pi = {
			on(event: string, handler: (...a: unknown[]) => unknown) {
				(handlers[event] ??= []).push(handler);
			},
		};
		registerMetrics(pi as never, state);
		for (const h of handlers["message_end"] ?? []) {
			h({ message: { role: "user" } });
		}
		expect(state.metrics.requestsObserved).toBe(0);
	});

	it("accumulates per-provider and per-model breakdowns", () => {
		const state = createActiveOptimizationState();
		state.metrics = createMetrics();

		// Two requests: openai + openai-codex
		drivePair(state, "openai", "gpt-5.5", { input: 100, output: 50 });
		drivePair(state, "openai-codex", "gpt-5.5-codex", { input: 200, output: 100 });

		expect(state.metrics.requestsObserved).toBe(2);
		expect(state.metrics.byProvider["openai"]?.requests).toBe(1);
		expect(state.metrics.byProvider["openai-codex"]?.requests).toBe(1);
		expect(state.metrics.byModel["gpt-5.5"]?.requests).toBe(1);
		expect(state.metrics.byModel["gpt-5.5-codex"]?.requests).toBe(1);
		expect(state.metrics.totalInputTokens).toBe(300);
		expect(state.metrics.totalOutputTokens).toBe(150);
	});
});

// ---------------------------------------------------------------------------
// Overflow recovery → metrics.overflowRecoveries
// ---------------------------------------------------------------------------

describe("overflow recovery increments metrics", () => {
	function stateFor(provider: string): ActiveOptimizationState {
		const s = createActiveOptimizationState();
		const profile = getOptimizationProfile(provider);
		s.profile = profile ?? undefined;
		s.provider = provider;
		s.enabled = !!(profile && s.featureEnabled);
		s.metrics = createMetrics();
		return s;
	}

	function driveOverflow(state: ActiveOptimizationState, errorMessage: string): void {
		const pi = {
			on(_event: string, handler: (...args: unknown[]) => unknown) {
				const ctx = {} as never;
				handler({ message: { role: "assistant", stopReason: "error", errorMessage } }, ctx);
			},
		} as never;

		registerOverflowRecovery(pi as Parameters<typeof registerOverflowRecovery>[0], state);
	}

	it("increments overflowRecoveries on normalization", () => {
		const s = stateFor("openai");
		expect(s.metrics.overflowRecoveries).toBe(0);
		driveOverflow(s, "exceeds the context window of 128000 tokens");
		expect(s.metrics.overflowRecoveries).toBe(1);
	});

	it("does not increment when already canonical", () => {
		const s = stateFor("openai");
		driveOverflow(s, "context_length_exceeded: prompt too long");
		expect(s.metrics.overflowRecoveries).toBe(0);
	});

	it("does not increment for rate limit errors", () => {
		const s = stateFor("openai");
		driveOverflow(s, "rate limit exceeded");
		expect(s.metrics.overflowRecoveries).toBe(0);
	});

	it("does not increment when disabled", () => {
		const s = stateFor("openai");
		s.overflowRecoveryEnabled = false;
		driveOverflow(s, "exceeds the context window");
		expect(s.metrics.overflowRecoveries).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Command registration + help behaviour
// ---------------------------------------------------------------------------

describe("registerCommands", () => {
	it("registers model-optimizer command", () => {
		const commands: Array<{ name: string; description: string }> = [];
		const pi = {
			registerCommand(name: string, opts: { description: string }) {
				commands.push({ name, description: opts.description });
			},
		};
		const state = createActiveOptimizationState();
		registerCommands(pi as never, state);
		expect(commands.length).toBe(1);
		expect(commands[0]?.name).toBe("model-optimizer");
	});

	it("empty args shows help", () => {
		const state = createActiveOptimizationState();
		let notified = "";
		const fakeCtx = { ui: { notify(msg: string) { notified = msg; } } };
		const pi = {
			registerCommand(
				_name: string,
				opts: { handler: (args: unknown, ctx: typeof fakeCtx) => void },
			) {
				opts.handler("", fakeCtx);
			},
		};
		registerCommands(pi as never, state);
		expect(notified).toContain("Subcommands");
	});

	it("unknown subcommand shows help", () => {
		const state = createActiveOptimizationState();
		let notified = "";
		const fakeCtx = { ui: { notify(msg: string) { notified = msg; } } };
		const pi = {
			registerCommand(
				_name: string,
				opts: { handler: (args: unknown, ctx: typeof fakeCtx) => void },
			) {
				opts.handler("unknown", fakeCtx);
			},
		};
		registerCommands(pi as never, state);
		expect(notified).toContain("Subcommands");
	});

	it("status shows status info", () => {
		const state = createActiveOptimizationState();
		let notified = "";
		const fakeCtx = { ui: { notify(msg: string) { notified = msg; } } };
		const pi = {
			registerCommand(
				_name: string,
				opts: { handler: (args: unknown, ctx: typeof fakeCtx) => void },
			) {
				opts.handler("status", fakeCtx);
			},
		};
		registerCommands(pi as never, state);
		expect(notified).toContain("Model Optimizer Status");
	});

	it("stats shows metrics", () => {
		const state = createActiveOptimizationState();
		let notified = "";
		const fakeCtx = { ui: { notify(msg: string) { notified = msg; } } };
		const pi = {
			registerCommand(
				_name: string,
				opts: { handler: (args: unknown, ctx: typeof fakeCtx) => void },
			) {
				opts.handler("stats", fakeCtx);
			},
		};
		registerCommands(pi as never, state);
		expect(notified).toContain("Model Optimizer Stats");
	});

	it("stats shows last compaction when available", () => {
		const state = createActiveOptimizationState();
		state.metrics.lastCompaction = {
			provider: "openai",
			modelId: "gpt-5.5",
			tokensBefore: 50000,
			firstKeptEntryId: "entry-abc",
			at: Date.now(),
		};
		let notified = "";
		const fakeCtx = { ui: { notify(msg: string) { notified = msg; } } };
		const pi = {
			registerCommand(
				_name: string,
				opts: { handler: (args: unknown, ctx: typeof fakeCtx) => void },
			) {
				opts.handler("stats", fakeCtx);
			},
		};
		registerCommands(pi as never, state);
		expect(notified).toContain("Last compaction");
		expect(notified).toContain("50,000");
		expect(notified).toContain("entry-abc");
	});
});
