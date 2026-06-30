import { describe, expect, it } from "vitest";
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
