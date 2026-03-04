/**
 * Tests for semantic-repetition and intent-aware-limits modules.
 * Migrated from .pi/tests/legacy/agentic-search-test.ts
 */

import { describe, it, expect } from "vitest";
import {
	classifyIntent,
	getIntentBudget,
	getAllIntentBudgets,
	summarizeIntentClassification,
} from "../../lib/intent-aware-limits.js";

import {
	detectSemanticRepetition,
	detectSemanticRepetitionFromEmbeddings,
	getRecommendedAction,
	TrajectoryTracker,
	isSemanticRepetitionAvailable,
} from "../../lib/storage/semantic-repetition.js";

import { cosineSimilarity } from "../../lib/storage/embeddings/index.js";

describe("Intent Classification", () => {
	it("classifies declarative patterns", () => {
		const result = classifyIntent({
			task: "What is the current version of Node.js?",
		});
		expect(result.intent).toBe("declarative");
	});

	it("classifies procedural patterns", () => {
		const result = classifyIntent({
			task: "How to install TypeScript globally",
		});
		expect(result.intent).toBe("procedural");
	});

	it("classifies reasoning patterns", () => {
		const result = classifyIntent({
			task: "Analyze the trade-offs between REST and GraphQL APIs",
		});
		expect(result.intent).toBe("reasoning");
	});

	it("returns correct budgets", () => {
		const declarative = getIntentBudget("declarative");
		const procedural = getIntentBudget("procedural");
		const reasoning = getIntentBudget("reasoning");

		expect(declarative.maxIterations).toBe(6);
		expect(procedural.maxIterations).toBe(10);
		expect(reasoning.maxIterations).toBe(12);
	});

	it("all intents defined in INTENT_BUDGETS", () => {
		const budgets = getAllIntentBudgets();
		expect(budgets.declarative).toBeDefined();
		expect(budgets.procedural).toBeDefined();
		expect(budgets.reasoning).toBeDefined();
	});

	it("summarizeIntentClassification produces readable output", () => {
		const result = classifyIntent({
			task: "Compare React and Vue performance",
		});
		const summary = summarizeIntentClassification(result);
		expect(summary).toContain("reasoning");
	});
});

describe("Semantic Repetition", () => {
	it("detects exact match", async () => {
		const result = await detectSemanticRepetition("Hello world", "Hello world");
		expect(result.isRepeated).toBe(true);
		expect(result.method).toBe("exact");
		expect(result.similarity).toBe(1.0);
	});

	it("detects different texts as not repeated", async () => {
		const result = await detectSemanticRepetition("Hello world", "Goodbye moon", {
			useEmbedding: false,
		});
		expect(result.isRepeated).toBe(false);
		expect(result.method).toBe("exact");
	});

	it("handles empty inputs", async () => {
		const result = await detectSemanticRepetition("", "Some text");
		expect(result.isRepeated).toBe(false);
	});

	it("uses exact method when embedding disabled", async () => {
		const result = await detectSemanticRepetition("abc", "def", {
			useEmbedding: false,
		});
		expect(result.method).toBe("exact");
	});

	it("detectSemanticRepetitionFromEmbeddings with similar vectors", () => {
		const v1 = [1, 0, 0];
		const v2 = [0.99, 0.1, 0.1];
		const result = detectSemanticRepetitionFromEmbeddings(v1, v2, 0.9);
		expect(result.method).toBe("embedding");
		expect(result.similarity).toBeGreaterThan(0.9);
	});

	it("detectSemanticRepetitionFromEmbeddings with identical vectors", () => {
		const v = [1, 2, 3, 4, 5];
		const result = detectSemanticRepetitionFromEmbeddings(v, v, 0.85);
		expect(result.isRepeated).toBe(true);
		expect(result.similarity).toBe(1.0);
	});

	it("getRecommendedAction returns early_stop for stuck pattern", () => {
		const action = getRecommendedAction(5, 10, true);
		expect(action).toBe("early_stop");
	});

	it("getRecommendedAction returns pivot for high repetition rate", () => {
		const action = getRecommendedAction(5, 10, false); // 50% repetition
		expect(action).toBe("pivot");
	});

	it("getRecommendedAction returns continue for low repetition", () => {
		const action = getRecommendedAction(1, 10, false); // 10% repetition
		expect(action).toBe("continue");
	});

	it("checks provider availability", async () => {
		const available = await isSemanticRepetitionAvailable();
		// Result depends on whether embedding provider is configured
		expect(typeof available).toBe("boolean");
	});
});

describe("TrajectoryTracker", () => {
	it("records steps", async () => {
		const tracker = new TrajectoryTracker();
		await tracker.recordStep("First output");
		await tracker.recordStep("Second output");
		expect(tracker.stepCount).toBe(2);
	});

	it("detects repetition", async () => {
		const tracker = new TrajectoryTracker();
		await tracker.recordStep("Same output");
		await tracker.recordStep("Same output");
		const summary = tracker.getSummary();
		expect(summary.repetitionCount).toBeGreaterThanOrEqual(1);
	});

	it("getSummary returns correct total steps", async () => {
		const tracker = new TrajectoryTracker();
		await tracker.recordStep("Output A");
		await tracker.recordStep("Output B");
		await tracker.recordStep("Output C");
		const summary = tracker.getSummary();
		expect(summary.totalSteps).toBe(3);
	});
});

describe("Vector Operations", () => {
	it("cosineSimilarity for orthogonal vectors", () => {
		const sim = cosineSimilarity([1, 0, 0], [0, 1, 0]);
		expect(Math.abs(sim)).toBeLessThan(0.001);
	});

	it("cosineSimilarity for identical vectors", () => {
		const sim = cosineSimilarity([1, 2, 3], [1, 2, 3]);
		expect(Math.abs(sim - 1)).toBeLessThan(0.001);
	});

	it("cosineSimilarity for opposite vectors", () => {
		const sim = cosineSimilarity([1, 0, 0], [-1, 0, 0]);
		expect(Math.abs(sim + 1)).toBeLessThan(0.001);
	});

	it("cosineSimilarity for similar vectors", () => {
		const sim = cosineSimilarity([1, 1, 1], [1, 1, 0.9]);
		expect(sim).toBeGreaterThan(0.9);
	});
});
