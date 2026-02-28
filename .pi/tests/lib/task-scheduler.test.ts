/**
 * @file .pi/lib/task-scheduler.ts の単体テスト
 * @description 優先度ベースのタスクスケジューラおよびプリエンプション制御のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
	PREEMPTION_MATRIX,
	shouldPreempt,
	type ScheduledTask,
} from "../../lib/task-scheduler.js";
import { TaskPriority } from "../../lib/priority-scheduler.js";

describe("PREEMPTION_MATRIX", () => {
	describe("正常系", () => {
		it("should define preemption rules for all priorities", () => {
			expect(PREEMPTION_MATRIX.critical).toBeDefined();
			expect(PREEMPTION_MATRIX.high).toBeDefined();
			expect(PREEMPTION_MATRIX.normal).toBeDefined();
			expect(PREEMPTION_MATRIX.low).toBeDefined();
			expect(PREEMPTION_MATRIX.background).toBeDefined();
		});

		it("should allow critical to preempt all lower priorities", () => {
			expect(PREEMPTION_MATRIX.critical).toContain("high");
			expect(PREEMPTION_MATRIX.critical).toContain("normal");
			expect(PREEMPTION_MATRIX.critical).toContain("low");
			expect(PREEMPTION_MATRIX.critical).toContain("background");
		});

		it("should allow high to preempt normal/low/background", () => {
			expect(PREEMPTION_MATRIX.high).toContain("normal");
			expect(PREEMPTION_MATRIX.high).toContain("low");
			expect(PREEMPTION_MATRIX.high).toContain("background");
			expect(PREEMPTION_MATRIX.high).not.toContain("critical");
		});

		it("should not allow normal/low/background to preempt", () => {
			expect(PREEMPTION_MATRIX.normal).toEqual([]);
			expect(PREEMPTION_MATRIX.low).toEqual([]);
			expect(PREEMPTION_MATRIX.background).toEqual([]);
		});
	});
});

describe("shouldPreempt", () => {
	const originalEnv = process.env.PI_ENABLE_PREEMPTION;

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.PI_ENABLE_PREEMPTION;
		} else {
			process.env.PI_ENABLE_PREEMPTION = originalEnv;
		}
	});

	describe("正常系", () => {
		it("should return true when critical preempts low", () => {
			process.env.PI_ENABLE_PREEMPTION = "true";
			const runningTask = {
				id: "task-1",
				priority: "low" as TaskPriority,
			} as ScheduledTask;
			const incomingTask = {
				id: "task-2",
				priority: "critical" as TaskPriority,
			} as ScheduledTask;

			expect(shouldPreempt(runningTask, incomingTask)).toBe(true);
		});

		it("should return false when priorities are equal", () => {
			process.env.PI_ENABLE_PREEMPTION = "true";
			const runningTask = {
				id: "task-1",
				priority: "high" as TaskPriority,
			} as ScheduledTask;
			const incomingTask = {
				id: "task-2",
				priority: "high" as TaskPriority,
			} as ScheduledTask;

			expect(shouldPreempt(runningTask, incomingTask)).toBe(false);
		});

		it("should return false when lower priority tries to preempt", () => {
			process.env.PI_ENABLE_PREEMPTION = "true";
			const runningTask = {
				id: "task-1",
				priority: "critical" as TaskPriority,
			} as ScheduledTask;
			const incomingTask = {
				id: "task-2",
				priority: "low" as TaskPriority,
			} as ScheduledTask;

			expect(shouldPreempt(runningTask, incomingTask)).toBe(false);
		});
	});

	describe("境界条件", () => {
		it("should return false when preemption is disabled", () => {
			process.env.PI_ENABLE_PREEMPTION = "false";
			const runningTask = {
				id: "task-1",
				priority: "low" as TaskPriority,
			} as ScheduledTask;
			const incomingTask = {
				id: "task-2",
				priority: "critical" as TaskPriority,
			} as ScheduledTask;

			expect(shouldPreempt(runningTask, incomingTask)).toBe(false);
		});
	});
});
