import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { state, type ContextMonitorSample } from "./state.js";
import { recommendations, topContributors } from "./report.js";
import { MEKANN_CONTEXT_CONTROL_DEFAULTS, type MekannContextControlConfig } from "../../config.js";

function config(overrides: Partial<MekannContextControlConfig> = {}): MekannContextControlConfig {
	return { ...MEKANN_CONTEXT_CONTROL_DEFAULTS, ...overrides };
}

let savedSamples: ContextMonitorSample[];
let nextId: number;

beforeEach(() => {
	savedSamples = state.samples.slice();
	nextId = state.nextId;
});

afterEach(() => {
	state.samples.length = 0;
	state.samples.push(...savedSamples);
	state.nextId = nextId;
});

function push(summary: Record<string, unknown>, phase: ContextMonitorSample["phase"]): void {
	state.samples.push({ id: state.nextId++, at: Date.now(), phase, summary });
}

describe("recommendations — config-driven thresholds (issue #166 / IC-175)", () => {
	it("emits summarize_largest_message_item based on messageSummarizeBytes", () => {
		push({ messageCount: 1, messageBytes: 30_000, messageBreakdown: [{ bytes: 30_000, source: "big" }] }, "context");
		push({ payloadBytes: 40_000, contextPercent: 50 }, "provider_request");

		const def = recommendations(undefined, config());
		expect(def.some((r) => r.action === "summarize_largest_message_item")).toBe(true);

		// Raising the shared threshold removes the summarize recommendation — the
		// same knob the planner/analysis read — proving the consumers move in tandem.
		const raised = recommendations(undefined, config({ messageSummarizeBytes: 100_000 }));
		expect(raised.some((r) => r.action === "summarize_largest_message_item")).toBe(false);
	});
});

describe("topContributors — config-driven tool warn threshold", () => {
	it("flags tool output via toolWarnBytes", () => {
		push({ toolName: "bash", resultBytes: 50_000 }, "tool_end");
		push({ payloadBytes: 1000 }, "provider_request");

		const def = topContributors(20, undefined, config());
		expect(def.some((c) => c.action === "store_raw_output_externally_and_retrieve_snippets")).toBe(true);

		const raised = topContributors(20, undefined, config({ toolWarnBytes: 100_000 }));
		expect(raised.some((c) => c.action === "store_raw_output_externally_and_retrieve_snippets")).toBe(false);
	});
});
