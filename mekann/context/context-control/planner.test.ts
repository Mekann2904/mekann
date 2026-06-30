import { describe, expect, it } from "vitest";
import { outputGateArtifactId } from "./planner.js";

describe("outputGateArtifactId (IC-177 regex sync with #144)", () => {
  it("matches legacy 2-segment og_ artifact ids (og_<time>_<counter>)", () => {
    expect(outputGateArtifactId("see og_8m2wz_z for details")).toBe("og_8m2wz_z");
  });

  it("matches 3-segment og_ artifact ids (og_<time>_<counter>_<rand>)", () => {
    expect(outputGateArtifactId("output-gate:og_8m2wz_z_a1b2c3")).toBe("og_8m2wz_z_a1b2c3");
  });

  it("extracts the id from a realistic message-breakdown target string", () => {
    const target = "[output-gate] bash og_abc123_7_9f8e7d (100000 bytes)";
    expect(outputGateArtifactId(target)).toBe("og_abc123_7_9f8e7d");
  });

  it("returns undefined when no artifact id is present", () => {
    expect(outputGateArtifactId("no artifact here")).toBeUndefined();
  });

  it("does not match a different prefix", () => {
    expect(outputGateArtifactId("ctx_8m2wz_z_a1b2c3")).toBeUndefined();
  });
});

import { buildContextBudgetPlan } from "./planner.js";
import { MEKANN_CONTEXT_CONTROL_DEFAULTS, type MekannContextControlConfig } from "../../config.js";

function config(overrides: Partial<MekannContextControlConfig> = {}): MekannContextControlConfig {
	return { ...MEKANN_CONTEXT_CONTROL_DEFAULTS, ...overrides };
}

// A provider_request sample carrying only contextPercent drives pressure
// classification without touching the global context-control state.
function sample(contextPercent: number) {
	return { id: 1, at: 0, phase: "provider_request" as const, summary: { contextPercent } };
}

describe("buildContextBudgetPlan — config-driven thresholds (issue #166)", () => {
	it("classifies pressure from the configured percent thresholds", () => {
		// Default thresholds: medium >= 45, high >= 70, critical >= 85.
		expect(buildContextBudgetPlan([sample(50)], {}, undefined, config()).pressure).toBe("medium");
		expect(buildContextBudgetPlan([sample(72)], {}, undefined, config()).pressure).toBe("high");
		expect(buildContextBudgetPlan([sample(86)], {}, undefined, config()).pressure).toBe("critical");
		expect(buildContextBudgetPlan([sample(10)], {}, undefined, config()).pressure).toBe("low");
	});

	it("moves pressure classification when thresholds are overridden", () => {
		// Lower every threshold by ~10pp: 50% now counts as high.
		const cfg = config({ pressureCriticalPct: 75, pressureHighPct: 45, pressureMediumPct: 30 });
		expect(buildContextBudgetPlan([sample(50)], {}, undefined, cfg).pressure).toBe("high");
		expect(buildContextBudgetPlan([sample(32)], {}, undefined, cfg).pressure).toBe("medium");
	});

	it("derives the per-pressure budgets from config", () => {
		const cfg = config({ budgetDynamicTailCriticalBytes: 1024, budgetDynamicTailLowBytes: 9999 });
		const critical = buildContextBudgetPlan([sample(95)], {}, undefined, cfg).budget;
		expect(critical.dynamicTailMaxBytes).toBe(1024);
		const low = buildContextBudgetPlan([sample(5)], {}, undefined, cfg).budget;
		expect(low.dynamicTailMaxBytes).toBe(9999);
	});

	it("uses messageSummarizeBytes as the normal-pressure message budget (IC-175 shared knob)", () => {
		// Under low/medium pressure the planner's message inline budget equals the
		// single summarize threshold that report/analysis also use, so one
		// override moves all three consumers in tandem.
		const cfg = config({ messageSummarizeBytes: 12345 });
		const plan = buildContextBudgetPlan([sample(10)], {}, undefined, cfg);
		expect(plan.budget.largestInlineMessageBytes).toBe(12345);
	});
});
