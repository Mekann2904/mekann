/**
 * @file .pi/lib/unified-limit-resolver.ts の単体テスト
 * @description 5層の並列数制限計算を統合するFacadeのテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	type UnifiedLimitInput,
	type UnifiedLimitResult,
	type LimitBreakdown,
} from "../../lib/unified-limit-resolver.js";

describe("UnifiedLimitInput", () => {
	describe("正常系", () => {
		it("should accept minimal input with provider and model", () => {
			const input: UnifiedLimitInput = {
				provider: "anthropic",
				model: "claude-3-opus",
			};

			expect(input.provider).toBe("anthropic");
			expect(input.model).toBe("claude-3-opus");
		});

		it("should accept full input with all fields", () => {
			const input: UnifiedLimitInput = {
				provider: "openai",
				model: "gpt-4",
				tier: "pro",
				operationType: "subagent",
				priority: "high",
			};

			expect(input.tier).toBe("pro");
			expect(input.operationType).toBe("subagent");
			expect(input.priority).toBe("high");
		});
	});

	describe("境界条件", () => {
		it("should accept all operation types", () => {
			const types: UnifiedLimitInput["operationType"][] = [
				"subagent",
				"team",
				"orchestration",
				"direct",
			];

			expect(types).toContain("subagent");
			expect(types).toContain("team");
		});

		it("should accept all priority levels", () => {
			const priorities: UnifiedLimitInput["priority"][] = [
				"critical",
				"high",
				"normal",
				"low",
				"background",
			];

			expect(priorities).toContain("critical");
			expect(priorities).toContain("background");
		});
	});
});

describe("UnifiedLimitResult", () => {
	describe("正常系", () => {
		it("should accept valid result object", () => {
			const result: UnifiedLimitResult = {
				effectiveParallel: 5,
				effectiveRpm: 100,
				breakdown: {
					presetLimit: 10,
					adaptiveFactor: 0.8,
					instanceShare: 0.5,
					runtimeConstraint: 4,
				},
				warnings: [],
			};

			expect(result.effectiveParallel).toBe(5);
			expect(result.effectiveRpm).toBe(100);
			expect(result.warnings).toEqual([]);
		});

		it("should accept result with warnings", () => {
			const result: UnifiedLimitResult = {
				effectiveParallel: 3,
				effectiveRpm: 50,
				breakdown: {
					presetLimit: 10,
				},
				warnings: ["Snapshot provider not available"],
			};

			expect(result.warnings).toHaveLength(1);
		});
	});
});

describe("LimitBreakdown", () => {
	describe("正常系", () => {
		it("should accept minimal breakdown", () => {
			const breakdown: LimitBreakdown = {
				presetLimit: 10,
			};

			expect(breakdown.presetLimit).toBe(10);
		});

		it("should accept full breakdown", () => {
			const breakdown: LimitBreakdown = {
				presetLimit: 10,
				adaptiveFactor: 0.7,
				instanceShare: 0.33,
				runtimeConstraint: 5,
				schedulingAdjustment: -1,
			};

			expect(breakdown.presetLimit).toBe(10);
			expect(breakdown.adaptiveFactor).toBe(0.7);
			expect(breakdown.instanceShare).toBe(0.33);
		});
	});

	describe("境界条件", () => {
		it("should accept zero and negative values", () => {
			const breakdown: LimitBreakdown = {
				presetLimit: 0,
				adaptiveFactor: 0,
				schedulingAdjustment: -5,
			};

			expect(breakdown.presetLimit).toBe(0);
			expect(breakdown.schedulingAdjustment).toBe(-5);
		});
	});
});
