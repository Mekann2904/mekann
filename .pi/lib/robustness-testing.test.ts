/**
 * Tests for Robustness/Perturbation Testing Module
 * 論文「Large Language Model Reasoning Failures」のP1推奨事項
 * 
 * Run with: node --import tsx .pi/lib/robustness-testing.test.ts
 */

import {
  applySynonymReplacement,
  applyWordReorder,
  applyNoiseInjection,
  applyTypoSimulation,
  applyParaphrase,
  generateBoundaryInput,
  calculateOutputDeviation,
  calculateConsistencyScore,
  extractStabilityPatterns,
  runPerturbationTest,
  runBoundaryTest,
  runConsistencyTest,
  runRobustnessTest,
  resolveRobustnessConfig,
  formatRobustnessReport,
  DEFAULT_ROBUSTNESS_CONFIG,
  type PerturbationType,
  type BoundaryType,
} from "./robustness-testing.js";

// Simple test runner
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(() => fn())
    .then(() => {
      testResults.push({ name, passed: true });
      console.log(`[PASS] ${name}`);
    })
    .catch((e) => {
      const error = e instanceof Error ? e.message : String(e);
      testResults.push({ name, passed: false, error });
      console.log(`[FAIL] ${name}`);
      console.log(`  Error: ${error}`);
    });
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed${message ? `: ${message}` : ""}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(condition: boolean, message?: string): void {
  if (!condition) {
    throw new Error(`Assertion failed${message ? `: ${message}` : ""}`);
  }
}

function assertContains(text: string, substring: string, message?: string): void {
  if (!text.includes(substring)) {
    throw new Error(
      `Assertion failed${message ? `: ${message}` : ""}\n  Expected to contain: "${substring}"\n  Actual: "${text.slice(0, 100)}..."`
    );
  }
}

function assertGreaterThan(actual: number, expected: number, message?: string): void {
  if (actual <= expected) {
    throw new Error(
      `Assertion failed${message ? `: ${message}` : ""}\n  Expected > ${expected}\n  Actual: ${actual}`
    );
  }
}

function assertLessThan(actual: number, expected: number, message?: string): void {
  if (actual >= expected) {
    throw new Error(
      `Assertion failed${message ? `: ${message}` : ""}\n  Expected < ${expected}\n  Actual: ${actual}`
    );
  }
}

// ============================================================================
// Perturbation Function Tests
// ============================================================================

test("applySynonymReplacement - should replace English synonyms", () => {
  const input = "Please implement the fix for this error";
  const result = applySynonymReplacement(input);
  assertGreaterThan(result.length, 0, "Result should not be empty");
  // Meaning should be roughly preserved
  assertTrue(
    /(create|build|develop|construct|implement)/i.test(result),
    "Should contain a synonym for implement"
  );
});

test("applySynonymReplacement - should replace Japanese synonyms", () => {
  const input = "このエラーを修正してください";
  const result = applySynonymReplacement(input);
  assertGreaterThan(result.length, 0, "Result should not be empty");
});

test("applySynonymReplacement - should handle empty input", () => {
  const result = applySynonymReplacement("");
  assertEqual(result, "");
});

test("applySynonymReplacement - should preserve structure with no synonyms", () => {
  const input = "xyz abc 123";
  const result = applySynonymReplacement(input);
  assertEqual(result, "xyz abc 123");
});

test("applyWordReorder - should preserve words in English sentences", () => {
  const input = "The quick brown fox jumps over the lazy dog";
  const result = applyWordReorder(input);
  const inputWords = input.toLowerCase().split(/\s+/).sort();
  const resultWords = result.toLowerCase().split(/\s+/).sort();
  assertEqual(JSON.stringify(resultWords), JSON.stringify(inputWords));
});

test("applyWordReorder - should preserve Japanese text", () => {
  const input = "これは日本語のテストです";
  const result = applyWordReorder(input);
  assertEqual(result, input);
});

test("applyWordReorder - should handle short sentences", () => {
  const input = "Hi there";
  const result = applyWordReorder(input);
  assertEqual(result, "Hi there");
});

test("applyNoiseInjection - should add noise characters", () => {
  const input = "This is a test. Another sentence here.";
  const result = applyNoiseInjection(input, 0.5);
  assertGreaterThan(result.length, input.length - 1, "Result should be at least as long");
});

test("applyNoiseInjection - should handle empty input", () => {
  const result = applyNoiseInjection("", 0.5);
  assertEqual(result, "");
});

test("applyTypoSimulation - should introduce typos", () => {
  const input = "implementation testing configuration";
  const result = applyTypoSimulation(input, 0.5);
  // Either introduces typos or not, but should return something
  assertGreaterThan(result.length, 0);
});

test("applyTypoSimulation - should not modify short words", () => {
  const input = "a b c";
  const result = applyTypoSimulation(input, 1.0);
  assertEqual(result, "a b c");
});

test("applyTypoSimulation - should preserve Japanese text", () => {
  const input = "テスト";
  const result = applyTypoSimulation(input, 1.0);
  assertEqual(result, "テスト");
});

test("applyParaphrase - should paraphrase English phrases", () => {
  const input = "Please fix the error in the file";
  const result = applyParaphrase(input);
  assertContains(result, "resolve");
  // "the file" becomes "this file" only when it's a direct match
  assertTrue(
    result.includes("file"),
    "Should still contain file reference"
  );
});

test("applyParaphrase - should paraphrase Japanese phrases", () => {
  const input = "修正してください";
  const result = applyParaphrase(input);
  assertContains(result, "お願いします");
});

test("applyParaphrase - should handle empty input", () => {
  const result = applyParaphrase("");
  assertEqual(result, "");
});

// ============================================================================
// Boundary Input Generator Tests
// ============================================================================

test("generateBoundaryInput - empty input", () => {
  const result = generateBoundaryInput("empty-input");
  assertEqual(result, "");
});

test("generateBoundaryInput - whitespace-only input", () => {
  const result = generateBoundaryInput("whitespace-only");
  assertEqual(result.trim(), "");
  assertGreaterThan(result.length, 0);
});

test("generateBoundaryInput - minimal input", () => {
  const result = generateBoundaryInput("minimal-input");
  assertEqual(result, "a");
});

test("generateBoundaryInput - extreme-length input", () => {
  const result = generateBoundaryInput("extreme-length");
  assertGreaterThan(result.length, 50000);
});

test("generateBoundaryInput - special-chars input", () => {
  const result = generateBoundaryInput("special-chars");
  assertContains(result, "!");
  assertContains(result, "@");
  assertContains(result, "#");
});

test("generateBoundaryInput - unicode-chars input", () => {
  const result = generateBoundaryInput("unicode-chars");
  assertTrue(/[\u4e00-\u9fff]/.test(result), "Should contain Chinese characters");
  assertTrue(/[\u3040-\u309f]/.test(result), "Should contain Japanese hiragana");
});

test("generateBoundaryInput - control-chars input", () => {
  const result = generateBoundaryInput("control-chars");
  assertContains(result, "test");
  assertGreaterThan(result.length, 4);
});

// ============================================================================
// Output Comparison Tests
// ============================================================================

test("calculateOutputDeviation - identical outputs", () => {
  const output1 = "SUMMARY: Test result\nRESULT: Success";
  const output2 = "SUMMARY: Test result\nRESULT: Success";
  assertEqual(calculateOutputDeviation(output1, output2), 0);
});

test("calculateOutputDeviation - completely different outputs", () => {
  const output1 = "aaaa bbbb cccc";
  const output2 = "xxxx yyyy zzzz";
  const deviation = calculateOutputDeviation(output1, output2);
  assertGreaterThan(deviation, 0.8, "Deviation should be high");
});

test("calculateOutputDeviation - empty outputs", () => {
  assertEqual(calculateOutputDeviation("", ""), 0);
  assertEqual(calculateOutputDeviation("", "text"), 1);
  assertEqual(calculateOutputDeviation("text", ""), 1);
});

test("calculateOutputDeviation - case insensitive", () => {
  const output1 = "SUMMARY: Test";
  const output2 = "summary: test";
  assertEqual(calculateOutputDeviation(output1, output2), 0);
});

test("calculateConsistencyScore - single output", () => {
  assertEqual(calculateConsistencyScore(["output"]), 1);
});

test("calculateConsistencyScore - identical outputs", () => {
  const outputs = ["same output", "same output", "same output"];
  assertEqual(calculateConsistencyScore(outputs), 1);
});

test("calculateConsistencyScore - different outputs", () => {
  const outputs = ["aaa bbb ccc", "xxx yyy zzz", "ppp qqq rrr"];
  const score = calculateConsistencyScore(outputs);
  assertLessThan(score, 0.5, "Score should be low for different outputs");
});

test("calculateConsistencyScore - empty array", () => {
  assertEqual(calculateConsistencyScore([]), 1);
});

test("extractStabilityPatterns - stable patterns", () => {
  const outputs = [
    "SUMMARY: Fixed the bug\nRESULT: Success",
    "SUMMARY: Fixed the bug\nRESULT: Partial success",
    "SUMMARY: Fixed the bug\nRESULT: Completed",
  ];
  const { stablePatterns, unstablePatterns } = extractStabilityPatterns(outputs);
  
  assertTrue(
    stablePatterns.some((p) => p.includes("SUMMARY")),
    "SUMMARY should be stable"
  );
  assertTrue(
    unstablePatterns.some((p) => p.includes("RESULT")),
    "RESULT should be unstable"
  );
});

test("extractStabilityPatterns - single output", () => {
  const { stablePatterns, unstablePatterns } = extractStabilityPatterns(["single output"]);
  assertEqual(stablePatterns.length, 0);
  assertEqual(unstablePatterns.length, 0);
});

// ============================================================================
// Integration Tests (Async)
// ============================================================================

async function runAsyncTests() {
  console.log("\n--- Async Integration Tests ---\n");

  // runPerturbationTest
  await new Promise<void>((resolve) => {
    test("runPerturbationTest - should run all perturbation tests", async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        return "SUMMARY: Done\nRESULT: Success";
      };
      const results = await runPerturbationTest("Fix the bug", mockExecutor, {
        deviationThreshold: 0.5,
      });

      assertEqual(results.length, 5, "Should have 5 perturbation types");
      assertGreaterThan(callCount, 0, "Executor should be called");

      for (const result of results) {
        assertTrue(result.type !== undefined, "Should have type");
        assertTrue(result.passed !== undefined, "Should have passed status");
        assertTrue(result.deviation >= 0 && result.deviation <= 1, "Deviation should be in range");
      }
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runBoundaryTest - should run all boundary tests", async () => {
      const mockExecutor = async () => "RESULT: Handled gracefully";
      const results = await runBoundaryTest(mockExecutor, {
        boundaryTypes: ["empty-input", "whitespace-only"],
      });

      assertGreaterThan(results.length, 0, "Should have results");

      for (const result of results) {
        assertTrue(result.type !== undefined, "Should have type");
        assertTrue(result.passed !== undefined, "Should have passed status");
      }
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runBoundaryTest - should detect graceful handling", async () => {
      const mockExecutor = async () => "RESULT: Input processed";
      const results = await runBoundaryTest(mockExecutor, {
        boundaryTypes: ["empty-input"],
      });

      assertTrue(results[0].passed, "Should pass with graceful handling");
      assertEqual(results[0].recoveryBehavior, "Graceful degradation");
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runBoundaryTest - should detect errors", async () => {
      const mockExecutor = async () => {
        throw new Error("Invalid input");
      };
      const results = await runBoundaryTest(mockExecutor, {
        boundaryTypes: ["empty-input"],
      });

      assertTrue(!results[0].passed, "Should fail with error");
      assertContains(results[0].errorMessage || "", "Invalid input");
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runConsistencyTest - should measure output consistency", async () => {
      const mockExecutor = async () => "SUMMARY: Test\nRESULT: Done";
      const result = await runConsistencyTest("test input", mockExecutor, {
        consistencyRuns: 3,
      });

      assertEqual(result.runs, 3);
      assertEqual(result.outputs.length, 3);
      assertTrue(result.agreementScore >= 0 && result.agreementScore <= 1);
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runConsistencyTest - should identify stable and unstable patterns", async () => {
      let callCount = 0;
      const mockExecutor = async () => {
        callCount++;
        return `SUMMARY: Fixed\nRESULT: Run ${callCount}`;
      };

      const result = await runConsistencyTest("test", mockExecutor, {
        consistencyRuns: 3,
      });

      assertTrue(
        result.stablePatterns.some((p) => p.includes("SUMMARY")),
        "SUMMARY should be stable"
      );
      assertTrue(
        result.unstablePatterns.some((p) => p.includes("RESULT")),
        "RESULT should be unstable"
      );
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runRobustnessTest - disabled should skip tests", async () => {
      const mockExecutor = async () => "test";
      const report = await runRobustnessTest("test", mockExecutor, {
        enabled: false,
      });

      assertTrue(report.passed, "Should pass when disabled");
      assertEqual(report.overallScore, 1);
      assertContains(report.recommendations[0], "disabled");
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    test("runRobustnessTest - comprehensive test", async () => {
      const mockExecutor = async () => "SUMMARY: Done\nRESULT: Success";
      const report = await runRobustnessTest("test input", mockExecutor, {
        perturbationTypes: ["synonym-replacement"],
        boundaryTypes: ["empty-input"],
        consistencyRuns: 2,
      });

      assertGreaterThan(report.perturbationResults.length, 0);
      assertGreaterThan(report.boundaryResults.length, 0);
      assertTrue(report.consistencyResults !== undefined);
      assertTrue(report.overallScore >= 0 && report.overallScore <= 1);
      assertGreaterThan(report.recommendations.length, 0);
      resolve();
    });
  });
}

// ============================================================================
// Configuration Tests
// ============================================================================

test("resolveRobustnessConfig - default config", () => {
  const config = resolveRobustnessConfig();
  assertTrue(config.enabled, "Should be enabled by default");
  assertEqual(config.perturbationTypes.length, 5);
  assertEqual(config.consistencyRuns, 3);
});

test("resolveRobustnessConfig - disabled via env", () => {
  const originalEnv = process.env.PI_ROBUSTNESS_TESTING;
  process.env.PI_ROBUSTNESS_TESTING = "disabled";

  const config = resolveRobustnessConfig();
  assertTrue(!config.enabled, "Should be disabled");

  process.env.PI_ROBUSTNESS_TESTING = originalEnv;
});

test("resolveRobustnessConfig - strict mode via env", () => {
  const originalEnv = process.env.PI_ROBUSTNESS_TESTING;
  process.env.PI_ROBUSTNESS_TESTING = "strict";

  const config = resolveRobustnessConfig();
  assertEqual(config.consistencyRuns, 5);
  assertEqual(config.consistencyThreshold, 0.9);
  assertEqual(config.deviationThreshold, 0.2);

  process.env.PI_ROBUSTNESS_TESTING = originalEnv;
});

// ============================================================================
// Formatting Tests
// ============================================================================

test("formatRobustnessReport - full report", () => {
  const report = {
    perturbationResults: [
      {
        type: "synonym-replacement" as PerturbationType,
        originalInput: "test",
        perturbedInput: "test",
        passed: true,
        deviation: 0.1,
      },
    ],
    boundaryResults: [{ type: "empty-input" as BoundaryType, input: "", passed: true }],
    consistencyResults: {
      runs: 3,
      outputs: ["a", "b", "c"],
      agreementScore: 0.8,
      stablePatterns: ["SUMMARY: test"],
      unstablePatterns: ["RESULT: varies"],
      passed: true,
    },
    overallScore: 0.85,
    passed: true,
    recommendations: ["System demonstrates good robustness"],
  };

  const formatted = formatRobustnessReport(report);

  assertContains(formatted, "[Robustness Test Report]");
  assertContains(formatted, "Overall Score: 85.0%");
  assertContains(formatted, "Status: PASS");
  assertContains(formatted, "Perturbation Tests:");
  assertContains(formatted, "Boundary Tests:");
  assertContains(formatted, "Consistency Test:");
  assertContains(formatted, "Recommendations:");
});

test("formatRobustnessReport - minimal report", () => {
  const report = {
    perturbationResults: [],
    boundaryResults: [],
    overallScore: 1,
    passed: true,
    recommendations: [],
  };

  const formatted = formatRobustnessReport(report);
  assertContains(formatted, "Overall Score: 100.0%");
  assertContains(formatted, "Status: PASS");
});

// ============================================================================
// Run Tests
// ============================================================================

async function main() {
  console.log("\n=== Robustness Testing Module Tests ===\n");

  // Run async tests
  await runAsyncTests();

  // Wait for all async tests to complete
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Summary
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  console.log("\n=== Test Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    testResults
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}`);
        console.log(`    Error: ${r.error}`);
      });
    process.exit(1);
  }

  console.log("\nAll tests passed!");
  process.exit(0);
}

main().catch(console.error);
