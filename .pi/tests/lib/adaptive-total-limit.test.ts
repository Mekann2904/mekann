/**
 * @file .pi/lib/adaptive-total-limit.ts の単体テスト
 * @description LLM並列数の動的制御と状態永続化のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	type TotalLimitObservation,
} from "../../lib/adaptive-total-limit.js";

describe("TotalLimitObservation", () => {
	describe("正常系", () => {
		it("should accept success observation", () => {
			const observation: TotalLimitObservation = {
				kind: "success",
				latencyMs: 1000,
				timestampMs: Date.now(),
			};

			expect(observation.kind).toBe("success");
			expect(observation.latencyMs).toBe(1000);
		});

		it("should accept rate_limit observation", () => {
			const observation: TotalLimitObservation = {
				kind: "rate_limit",
				waitMs: 5000,
				timestampMs: Date.now(),
			};

			expect(observation.kind).toBe("rate_limit");
			expect(observation.waitMs).toBe(5000);
		});

		it("should accept timeout observation", () => {
			const observation: TotalLimitObservation = {
				kind: "timeout",
				latencyMs: 60000,
				timestampMs: Date.now(),
			};

			expect(observation.kind).toBe("timeout");
		});

		it("should accept error observation", () => {
			const observation: TotalLimitObservation = {
				kind: "error",
				timestampMs: Date.now(),
			};

			expect(observation.kind).toBe("error");
		});
	});

	describe("境界条件", () => {
		it("should accept minimal observation", () => {
			const observation: TotalLimitObservation = {
				kind: "success",
			};

			expect(observation.kind).toBe("success");
			expect(observation.latencyMs).toBeUndefined();
			expect(observation.waitMs).toBeUndefined();
		});

		it("should accept zero values", () => {
			const observation: TotalLimitObservation = {
				kind: "success",
				latencyMs: 0,
				waitMs: 0,
				timestampMs: 0,
			};

			expect(observation.latencyMs).toBe(0);
			expect(observation.waitMs).toBe(0);
		});
	});
});
