import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { state, type ContextMonitorSample } from "./state.js";
import { computeHealthScore, topMessageItems } from "./analysis.js";
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

function push(summary: Record<string, unknown>, phase: ContextMonitorSample["phase"] = "provider_request"): void {
	state.samples.push({ id: state.nextId++, at: Date.now(), phase, summary });
}

describe("computeHealthScore — config-driven penalties (issue #166)", () => {
	it("applies the configured pressure penalty and risk band", () => {
		push({ contextPercent: 86 });
		// Default critical threshold is 85 → 45-point penalty → score 55 (medium).
		const def = computeHealthScore(undefined, config());
		expect(def.score).toBe(55);
		expect(def.risk).toBe("medium");
		// Raising the critical threshold to 90 drops 86 into the high band (30 pts).
		const raised = computeHealthScore(undefined, config({ pressureCriticalPct: 90 }));
		expect(raised.score).toBe(70);
	});
});

describe("topMessageItems — shared summarize knob (IC-175)", () => {
	it("switches policy when messageSummarizeBytes is overridden", () => {
		push({ messageCount: 1, messageBytes: 30_000, messageBreakdown: [{ bytes: 30_000, source: "big" }] }, "context");
		// 30 KB exceeds the 24 KB default summarize threshold.
		expect(topMessageItems(1, undefined, config())[0].policy).toBe("SUMMARIZE");
		// Raising the threshold past 30 KB demotes it to RETRIEVE.
		expect(topMessageItems(1, undefined, config({ messageSummarizeBytes: 100_000 }))[0].policy).toBe("RETRIEVE");
		// Raising the retrieve threshold too demotes it to KEEP.
		expect(topMessageItems(1, undefined, config({ messageSummarizeBytes: 100_000, messageRetrieveBytes: 100_000 }))[0].policy).toBe("KEEP");
	});
});
