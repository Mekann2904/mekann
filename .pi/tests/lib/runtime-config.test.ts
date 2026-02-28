/**
 * @file .pi/lib/runtime-config.ts の単体テスト
 * @description 全レイヤー共通のランタイム設定のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	type RuntimeProfile,
	type RuntimeConfig,
	getRuntimeConfig,
	getRuntimeProfile,
	isStableProfile,
} from "../../lib/runtime-config.js";

describe("RuntimeProfile", () => {
	describe("正常系", () => {
		it("should accept valid profile values", () => {
			const stable: RuntimeProfile = "stable";
			const defaultProfile: RuntimeProfile = "default";

			expect(stable).toBe("stable");
			expect(defaultProfile).toBe("default");
		});
	});
});

describe("RuntimeConfig", () => {
	describe("正常系", () => {
		it("should have all required properties", () => {
			const config: RuntimeConfig = {
				profile: "default",
				totalMaxLlm: 10,
				totalMaxRequests: 100,
				maxParallelSubagents: 5,
				maxParallelTeams: 3,
				maxParallelTeammates: 4,
				maxConcurrentOrchestrations: 2,
				adaptiveEnabled: true,
				predictiveEnabled: true,
				heartbeatIntervalMs: 5000,
				heartbeatTimeoutMs: 30000,
				recoveryIntervalMs: 60000,
				reductionFactor: 0.7,
				recoveryFactor: 1.1,
				maxConcurrentPerModel: 5,
				maxTotalConcurrent: 10,
				capacityWaitMs: 5000,
			};

			expect(config.profile).toBe("default");
			expect(config.totalMaxLlm).toBe(10);
			expect(config.adaptiveEnabled).toBe(true);
		});
	});
});

describe("getRuntimeConfig", () => {
	describe("正常系", () => {
		it("should return RuntimeConfig object", () => {
			const config = getRuntimeConfig();

			expect(config).toBeDefined();
			expect(config.profile).toBeDefined();
			expect(typeof config.totalMaxLlm).toBe("number");
		});

		it("should return config with valid profile", () => {
			const config = getRuntimeConfig();

			expect(["stable", "default"]).toContain(config.profile);
		});

		it("should return config with positive numeric values", () => {
			const config = getRuntimeConfig();

			expect(config.totalMaxLlm).toBeGreaterThan(0);
			expect(config.totalMaxRequests).toBeGreaterThan(0);
			expect(config.heartbeatIntervalMs).toBeGreaterThan(0);
		});
	});
});

describe("getRuntimeProfile", () => {
	describe("正常系", () => {
		it("should return a valid profile", () => {
			const profile = getRuntimeProfile();

			expect(["stable", "default"]).toContain(profile);
		});
	});
});

describe("isStableProfile", () => {
	describe("正常系", () => {
		it("should return a boolean", () => {
			const result = isStableProfile();

			expect(typeof result).toBe("boolean");
		});

		it("should match getRuntimeProfile result", () => {
			const profile = getRuntimeProfile();
			const isStable = isStableProfile();

			expect(isStable).toBe(profile === "stable");
		});
	});
});
