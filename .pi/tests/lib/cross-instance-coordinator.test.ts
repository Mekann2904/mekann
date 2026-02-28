/**
 * @file .pi/lib/cross-instance-coordinator.ts の単体テスト
 * @description 複数piインスタンス間のLLM並列数制御コーディネータのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	type ActiveModelInfo,
	type InstanceInfo,
	type CoordinatorConfig,
	type CoordinatorInternalState,
} from "../../lib/cross-instance-coordinator.js";

describe("ActiveModelInfo", () => {
	describe("正常系", () => {
		it("should accept valid ActiveModelInfo", () => {
			const info: ActiveModelInfo = {
				provider: "anthropic",
				model: "claude-3-opus",
				since: "2026-02-28T12:00:00Z",
			};

			expect(info.provider).toBe("anthropic");
			expect(info.model).toBe("claude-3-opus");
			expect(info.since).toBe("2026-02-28T12:00:00Z");
		});
	});

	describe("境界条件", () => {
		it("should accept empty strings", () => {
			const info: ActiveModelInfo = {
				provider: "",
				model: "",
				since: "",
			};

			expect(info.provider).toBe("");
			expect(info.model).toBe("");
		});
	});
});

describe("InstanceInfo", () => {
	describe("正常系", () => {
		it("should accept valid InstanceInfo with required fields", () => {
			const info: InstanceInfo = {
				instanceId: "test-instance-123",
				pid: 12345,
				sessionId: "session-abc",
				startedAt: "2026-02-28T12:00:00Z",
				lastHeartbeat: "2026-02-28T12:01:00Z",
				cwd: "/home/user/project",
				activeModels: [],
			};

			expect(info.instanceId).toBe("test-instance-123");
			expect(info.pid).toBe(12345);
			expect(info.activeModels).toEqual([]);
		});

		it("should accept InstanceInfo with optional fields", () => {
			const info: InstanceInfo = {
				instanceId: "test-instance-123",
				pid: 12345,
				sessionId: "session-abc",
				startedAt: "2026-02-28T12:00:00Z",
				lastHeartbeat: "2026-02-28T12:01:00Z",
				cwd: "/home/user/project",
				activeModels: [
					{ provider: "anthropic", model: "claude-3-opus", since: "2026-02-28T12:00:00Z" },
				],
				activeRequestCount: 2,
				activeLlmCount: 1,
				pendingTaskCount: 5,
				avgLatencyMs: 1500,
				lastTaskCompletedAt: "2026-02-28T12:00:30Z",
			};

			expect(info.activeRequestCount).toBe(2);
			expect(info.activeLlmCount).toBe(1);
			expect(info.pendingTaskCount).toBe(5);
			expect(info.avgLatencyMs).toBe(1500);
		});
	});

	describe("境界条件", () => {
		it("should accept zero values for optional numeric fields", () => {
			const info: InstanceInfo = {
				instanceId: "test-instance-123",
				pid: 0,
				sessionId: "",
				startedAt: "",
				lastHeartbeat: "",
				cwd: "",
				activeModels: [],
				activeRequestCount: 0,
				activeLlmCount: 0,
				pendingTaskCount: 0,
				avgLatencyMs: 0,
			};

			expect(info.pid).toBe(0);
			expect(info.activeRequestCount).toBe(0);
		});
	});
});

describe("CoordinatorConfig", () => {
	describe("正常系", () => {
		it("should accept valid CoordinatorConfig", () => {
			const config: CoordinatorConfig = {
				totalMaxLlm: 10,
				heartbeatIntervalMs: 5000,
				heartbeatTimeoutMs: 30000,
			};

			expect(config.totalMaxLlm).toBe(10);
			expect(config.heartbeatIntervalMs).toBe(5000);
			expect(config.heartbeatTimeoutMs).toBe(30000);
		});
	});

	describe("境界条件", () => {
		it("should accept minimum values", () => {
			const config: CoordinatorConfig = {
				totalMaxLlm: 1,
				heartbeatIntervalMs: 1000,
				heartbeatTimeoutMs: 5000,
			};

			expect(config.totalMaxLlm).toBe(1);
		});

		it("should accept large values", () => {
			const config: CoordinatorConfig = {
				totalMaxLlm: 1000,
				heartbeatIntervalMs: 60000,
				heartbeatTimeoutMs: 300000,
			};

			expect(config.totalMaxLlm).toBe(1000);
		});
	});
});

describe("CoordinatorInternalState", () => {
	describe("正常系", () => {
		it("should accept valid CoordinatorInternalState", () => {
			const state: CoordinatorInternalState = {
				activeInstances: [],
				totalActiveLlm: 0,
				allocatedLlm: 0,
				lastUpdate: "2026-02-28T12:00:00Z",
			};

			expect(state.activeInstances).toEqual([]);
			expect(state.totalActiveLlm).toBe(0);
			expect(state.allocatedLlm).toBe(0);
		});

		it("should accept state with active instances", () => {
			const state: CoordinatorInternalState = {
				activeInstances: [
					{
						instanceId: "instance-1",
						pid: 12345,
						sessionId: "session-1",
						startedAt: "2026-02-28T12:00:00Z",
						lastHeartbeat: "2026-02-28T12:01:00Z",
						cwd: "/home/user",
						activeModels: [],
					},
				],
				totalActiveLlm: 5,
				allocatedLlm: 3,
				lastUpdate: "2026-02-28T12:01:00Z",
			};

			expect(state.activeInstances).toHaveLength(1);
			expect(state.totalActiveLlm).toBe(5);
			expect(state.allocatedLlm).toBe(3);
		});
	});
});
