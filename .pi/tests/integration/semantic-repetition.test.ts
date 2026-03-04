/**
 * Integration test for semantic repetition detection with actual embeddings.
 * Migrated from .pi/tests/legacy/integration-test.ts
 *
 * Requires embedding provider to be configured.
 * Run: /embedding openai <your-api-key>
 * Or: /embedding set mock (for testing)
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
	detectSemanticRepetition,
	isSemanticRepetitionAvailable,
} from "../../lib/storage/semantic-repetition.js";

import {
	classifyIntent,
	getIntentBudget,
} from "../../lib/intent-aware-limits.js";

describe("Semantic Repetition Integration", () => {
	let providerAvailable = false;

	beforeAll(async () => {
		providerAvailable = await isSemanticRepetitionAvailable();
	});

	it.skipIf(!process.env.OPENAI_API_KEY)(
		"semantically similar texts are detected",
		async () => {
			const text1a = "The quick brown fox jumps over the lazy dog.";
			const text1b = "A fast brown fox leaps over a sleepy dog.";

			const result = await detectSemanticRepetition(text1a, text1b, {
				threshold: 0.85,
				useEmbedding: true,
			});

			expect(result.isRepeated).toBe(true);
			expect(result.similarity).toBeGreaterThan(0.85);
			expect(result.method).toBe("embedding");
		}
	);

	it.skipIf(!process.env.OPENAI_API_KEY)(
		"semantically different texts are not detected as repeated",
		async () => {
			const text2a =
				"TypeScript is a programming language developed by Microsoft.";
			const text2b = "Mount Fuji is the highest mountain in Japan.";

			const result = await detectSemanticRepetition(text2a, text2b, {
				threshold: 0.85,
				useEmbedding: true,
			});

			expect(result.isRepeated).toBe(false);
			expect(result.similarity).toBeLessThan(0.85);
		}
	);

	it("exact match uses fast path", async () => {
		const text3 = "This is exactly the same text.";

		const result = await detectSemanticRepetition(text3, text3);

		expect(result.isRepeated).toBe(true);
		expect(result.similarity).toBe(1.0);
		expect(result.method).toBe("exact");
	});

	it("intent classification for coding tasks", () => {
		const tasks = [
			{
				task: "Find all TypeScript files that import React",
				expected: "declarative",
			},
			{
				task: "How to configure ESLint for a monorepo",
				expected: "procedural",
			},
			{
				task: "Analyze the performance impact of different state management approaches",
				expected: "reasoning",
			},
		];

		for (const { task, expected } of tasks) {
			const intent = classifyIntent({ task });
			expect(intent.intent).toBe(expected);
		}
	});

	it("intent budgets are appropriate for each type", () => {
		const declarative = getIntentBudget("declarative");
		const procedural = getIntentBudget("procedural");
		const reasoning = getIntentBudget("reasoning");

		// Declarative tasks should have fewer iterations
		expect(declarative.maxIterations).toBeLessThan(procedural.maxIterations);

		// Reasoning tasks should have the most iterations
		expect(reasoning.maxIterations).toBeGreaterThan(procedural.maxIterations);
	});
});
