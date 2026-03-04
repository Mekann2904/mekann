/**
 * Security tests for semantic-repetition module.
 * Migrated from .pi/tests/legacy/security-test.ts
 */

import { describe, it, expect } from "vitest";
import {
	TrajectoryTracker,
	DEFAULT_MAX_TRAJECTORY_STEPS,
} from "../../lib/storage/semantic-repetition.js";

describe("TrajectoryTracker Security", () => {
	it("default maxSteps is 100", () => {
		expect(DEFAULT_MAX_TRAJECTORY_STEPS).toBe(100);
	});

	it("respects maxSteps limit", async () => {
		const maxSteps = 5;
		const tracker = new TrajectoryTracker(maxSteps);

		for (let i = 0; i < 10; i++) {
			await tracker.recordStep(`Output ${i}`);
		}

		expect(tracker.stepCount).toBe(maxSteps);
	});

	it("custom maxSteps of 1 works", async () => {
		const tracker = new TrajectoryTracker(1);
		await tracker.recordStep("First");
		await tracker.recordStep("Second");

		expect(tracker.stepCount).toBe(1);
	});

	it("memory is bounded", async () => {
		const maxSteps = 10;
		const tracker = new TrajectoryTracker(maxSteps);

		for (let i = 0; i < 50; i++) {
			await tracker.recordStep(`Output ${i}`);
		}

		expect(tracker.stepCount).toBeLessThanOrEqual(maxSteps);

		const summary = tracker.getSummary();
		expect(summary.totalSteps).toBe(maxSteps);
	}, 10000);

	it("summary reflects recent steps", async () => {
		const tracker = new TrajectoryTracker(5);

		for (let i = 0; i < 10; i++) {
			await tracker.recordStep(`Step ${i}`);
		}

		const summary = tracker.getSummary();
		expect(summary.totalSteps).toBe(5);
	});
});
