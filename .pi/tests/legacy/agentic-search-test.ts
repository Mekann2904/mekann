/**
 * Test script for semantic-repetition and intent-aware-limits modules.
 * Tests the integration of "Agentic Search in the Wild" paper findings.
 */

import {
  classifyIntent,
  getIntentBudget,
  INTENT_BUDGETS,
  getAllIntentBudgets,
  summarizeIntentClassification,
  type TaskIntent,
} from "../lib/intent-aware-limits.js";

import {
  detectSemanticRepetition,
  detectSemanticRepetitionFromEmbeddings,
  getRecommendedAction,
  TrajectoryTracker,
  DEFAULT_REPETITION_THRESHOLD,
  isSemanticRepetitionAvailable,
} from "../lib/semantic-repetition.js";

import { cosineSimilarity } from "../lib/embeddings/index.js";

// ============================================================================
// Test Utilities
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void): void {
  Promise.resolve()
    .then(() => fn())
    .then(() => {
      console.log(`✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${err.message}`);
      failed++;
    });
}

async function runTests(): Promise<void> {
  console.log("\n=== Intent Classification Tests ===\n");

  test("classifyIntent - declarative patterns", () => {
    const result = classifyIntent({ task: "What is the current version of Node.js?" });
    if (result.intent !== "declarative") throw new Error(`Expected declarative, got ${result.intent}`);
  });

  test("classifyIntent - procedural patterns", () => {
    const result = classifyIntent({ task: "How to install TypeScript globally" });
    if (result.intent !== "procedural") throw new Error(`Expected procedural, got ${result.intent}`);
  });

  test("classifyIntent - reasoning patterns", () => {
    const result = classifyIntent({ task: "Analyze the trade-offs between REST and GraphQL APIs" });
    if (result.intent !== "reasoning") throw new Error(`Expected reasoning, got ${result.intent}`);
  });

  test("getIntentBudget - returns correct budgets", () => {
    const declarative = getIntentBudget("declarative");
    const procedural = getIntentBudget("procedural");
    const reasoning = getIntentBudget("reasoning");
    
    if (declarative.maxIterations !== 6) throw new Error("Declarative should have 6 max iterations");
    if (procedural.maxIterations !== 10) throw new Error("Procedural should have 10 max iterations");
    if (reasoning.maxIterations !== 12) throw new Error("Reasoning should have 12 max iterations");
  });

  test("INTENT_BUDGETS - all intents defined", () => {
    const budgets = getAllIntentBudgets();
    if (!budgets.declarative) throw new Error("Missing declarative");
    if (!budgets.procedural) throw new Error("Missing procedural");
    if (!budgets.reasoning) throw new Error("Missing reasoning");
  });

  test("summarizeIntentClassification - produces readable output", () => {
    const result = classifyIntent({ task: "Compare React and Vue performance" });
    const summary = summarizeIntentClassification(result);
    if (!summary.includes("reasoning")) throw new Error("Summary should contain intent type");
  });

  console.log("\n=== Semantic Repetition Tests ===\n");

  test("detectSemanticRepetition - exact match", async () => {
    const result = await detectSemanticRepetition("Hello world", "Hello world");
    if (!result.isRepeated) throw new Error("Exact match should be detected as repeated");
    if (result.method !== "exact") throw new Error("Method should be 'exact'");
    if (result.similarity !== 1.0) throw new Error("Similarity should be 1.0");
  });

  test("detectSemanticRepetition - different texts", async () => {
    const result = await detectSemanticRepetition("Hello world", "Goodbye moon", { useEmbedding: false });
    if (result.isRepeated) throw new Error("Different texts should not be repeated");
    if (result.method !== "exact") throw new Error("Method should be 'exact' when embedding disabled");
  });

  test("detectSemanticRepetition - empty inputs", async () => {
    const result = await detectSemanticRepetition("", "Some text");
    if (result.isRepeated) throw new Error("Empty input should not be repeated");
  });

  test("detectSemanticRepetition - useEmbedding=false", async () => {
    const result = await detectSemanticRepetition("abc", "def", { useEmbedding: false });
    if (result.method !== "exact") throw new Error("Should use exact method when embedding disabled");
  });

  test("detectSemanticRepetitionFromEmbeddings - similar vectors", () => {
    // Similar vectors (normalized)
    const v1 = [1, 0, 0];
    const v2 = [0.99, 0.1, 0.1];
    const result = detectSemanticRepetitionFromEmbeddings(v1, v2, 0.9);
    if (result.method !== "embedding") throw new Error("Method should be 'embedding'");
    console.log(`  Similarity: ${result.similarity.toFixed(4)}`);
  });

  test("detectSemanticRepetitionFromEmbeddings - identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    const result = detectSemanticRepetitionFromEmbeddings(v, v, 0.85);
    if (!result.isRepeated) throw new Error("Identical vectors should be repeated");
    if (result.similarity !== 1.0) throw new Error("Identical vectors should have similarity 1.0");
  });

  test("getRecommendedAction - stuck pattern", () => {
    const action = getRecommendedAction(5, 10, true);
    if (action !== "early_stop") throw new Error("Stuck pattern should recommend early_stop");
  });

  test("getRecommendedAction - high repetition rate", () => {
    const action = getRecommendedAction(5, 10, false); // 50% repetition
    if (action !== "pivot") throw new Error("High repetition rate should recommend pivot");
  });

  test("getRecommendedAction - low repetition", () => {
    const action = getRecommendedAction(1, 10, false); // 10% repetition
    if (action !== "continue") throw new Error("Low repetition should recommend continue");
  });

  test("TrajectoryTracker - records steps", async () => {
    const tracker = new TrajectoryTracker();
    await tracker.recordStep("First output");
    await tracker.recordStep("Second output");
    if (tracker.stepCount !== 2) throw new Error("Should have 2 steps");
  });

  test("TrajectoryTracker - detects repetition", async () => {
    const tracker = new TrajectoryTracker();
    await tracker.recordStep("Same output");
    await tracker.recordStep("Same output");
    const summary = tracker.getSummary();
    if (summary.repetitionCount < 1) throw new Error("Should detect repetition");
  });

  test("TrajectoryTracker - getSummary", async () => {
    const tracker = new TrajectoryTracker();
    await tracker.recordStep("Output A");
    await tracker.recordStep("Output B");
    await tracker.recordStep("Output C");
    const summary = tracker.getSummary();
    if (summary.totalSteps !== 3) throw new Error("Should have 3 total steps");
    console.log(`  Total steps: ${summary.totalSteps}, Repetitions: ${summary.repetitionCount}`);
  });

  test("isSemanticRepetitionAvailable - checks provider", async () => {
    const available = await isSemanticRepetitionAvailable();
    console.log(`  Provider available: ${available}`);
    // This will be false if no embedding provider is configured
  });

  console.log("\n=== Vector Operations Tests ===\n");

  test("cosineSimilarity - orthogonal vectors", () => {
    const sim = cosineSimilarity([1, 0, 0], [0, 1, 0]);
    if (Math.abs(sim) > 0.001) throw new Error(`Orthogonal vectors should have 0 similarity, got ${sim}`);
  });

  test("cosineSimilarity - identical vectors", () => {
    const sim = cosineSimilarity([1, 2, 3], [1, 2, 3]);
    if (Math.abs(sim - 1) > 0.001) throw new Error(`Identical vectors should have 1 similarity, got ${sim}`);
  });

  test("cosineSimilarity - opposite vectors", () => {
    const sim = cosineSimilarity([1, 0, 0], [-1, 0, 0]);
    if (Math.abs(sim + 1) > 0.001) throw new Error(`Opposite vectors should have -1 similarity, got ${sim}`);
  });

  test("cosineSimilarity - similar vectors", () => {
    const sim = cosineSimilarity([1, 1, 1], [1, 1, 0.9]);
    if (sim < 0.9) throw new Error(`Similar vectors should have high similarity, got ${sim}`);
    console.log(`  Similarity: ${sim.toFixed(4)}`);
  });

  // Wait for all async tests
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// Run tests
runTests()
  .then(() => {
    console.log("\n========================================");
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log("========================================\n");
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
  });
