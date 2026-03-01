/**
 * @abdd.meta
 * @path .pi/tests/lib/intent-aware-limits.test.ts
 * @role Test suite for intent-based resource allocation
 * @why Verify intent classification, budget application, and threshold calculation
 * @related ../../lib/intent-aware-limits.ts
 * @public_api Tests for classifyIntent and related functions
 * @invariants Tests should not depend on external state
 * @side_effects None expected
 * @failure_modes None expected
 */

import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  getIntentBudget,
  applyIntentLimits,
  getEffectiveRepetitionThreshold,
  isIntentClassificationAvailable,
  getAllIntentBudgets,
  summarizeIntentClassification,
  INTENT_BUDGETS,
  type TaskIntent,
  type IntentClassificationInput,
  type IntentBudget,
} from "../../lib/intent-aware-limits";

describe("intent-aware-limits", () => {
  describe("INTENT_BUDGETS", () => {
    it("INTENT_BUDGETS_hasAllIntents", () => {
      expect(INTENT_BUDGETS.declarative).toBeDefined();
      expect(INTENT_BUDGETS.procedural).toBeDefined();
      expect(INTENT_BUDGETS.reasoning).toBeDefined();
    });

    it("INTENT_BUDGETS_declarative_hasExpectedValues", () => {
      const budget = INTENT_BUDGETS.declarative;

      expect(budget.intent).toBe("declarative");
      expect(budget.maxIterations).toBe(6);
      expect(budget.timeoutMultiplier).toBe(1.0);
      expect(budget.repetitionTolerance).toBe(0.6);
    });

    it("INTENT_BUDGETS_procedural_hasExpectedValues", () => {
      const budget = INTENT_BUDGETS.procedural;

      expect(budget.intent).toBe("procedural");
      expect(budget.maxIterations).toBe(10);
      expect(budget.timeoutMultiplier).toBe(1.5);
      expect(budget.repetitionTolerance).toBe(0.4);
    });

    it("INTENT_BUDGETS_reasoning_hasExpectedValues", () => {
      const budget = INTENT_BUDGETS.reasoning;

      expect(budget.intent).toBe("reasoning");
      expect(budget.maxIterations).toBe(12);
      expect(budget.timeoutMultiplier).toBe(2.0);
      expect(budget.repetitionTolerance).toBe(0.3);
    });
  });

  describe("classifyIntent", () => {
    it("classifyIntent_declarativePatterns_classifiesCorrectly", () => {
      const inputs: IntentClassificationInput[] = [
        { task: "What is the purpose of this function?" },
        { task: "Find all files matching the pattern" },
        { task: "Search for the configuration file" },
        { task: "Check if the service is running" },
        { task: "Verify that the test passes" },
        { task: "Show me the error logs" },
        { task: "List all available commands" },
      ];

      inputs.forEach((input) => {
        const result = classifyIntent(input);
        expect(result.intent).toBe("declarative");
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("classifyIntent_proceduralPatterns_classifiesCorrectly", () => {
      const inputs: IntentClassificationInput[] = [
        { task: "How to deploy the application" },
        { task: "Steps to configure the database" },
        { task: "Implement the new feature" },
        { task: "Create a new component" },
        { task: "Update the configuration file" },
        { task: "Fix the bug in the login flow" },
        { task: "Migrate the data to the new schema" },
      ];

      inputs.forEach((input) => {
        const result = classifyIntent(input);
        expect(result.intent).toBe("procedural");
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("classifyIntent_reasoningPatterns_classifiesCorrectly", () => {
      const inputs: IntentClassificationInput[] = [
        { task: "Analyze the performance bottlenecks" },
        { task: "Compare the two architectures" },
        { task: "Evaluate the trade-offs" },
        { task: "Design a new system architecture" },
        { task: "Why is the application slow?" },
        { task: "Plan the migration strategy" },
        { task: "Synthesize the findings into a report" },
      ];

      inputs.forEach((input) => {
        const result = classifyIntent(input);
        expect(result.intent).toBe("reasoning");
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("classifyIntent_noMatches_defaultsToDeclarative", () => {
      const input: IntentClassificationInput = {
        task: "Random text with no matching patterns",
      };

      const result = classifyIntent(input);

      // Declarative is the default (88.64% in paper)
      expect(result.intent).toBe("declarative");
      expect(result.confidence).toBeLessThan(0.5);
    });

    it("classifyIntent_withGoal_usesCombinedText", () => {
      const input: IntentClassificationInput = {
        task: "Help me",
        goal: "Analyze the system performance",
      };

      const result = classifyIntent(input);

      // Should detect "analyze" in the goal
      expect(result.intent).toBe("reasoning");
    });

    it("classifyIntent_returnsMatchedPatterns", () => {
      const input: IntentClassificationInput = {
        task: "Find and analyze the configuration files",
      };

      const result = classifyIntent(input);

      expect(result.matchedPatterns.length).toBeGreaterThan(0);
    });

    it("classifyIntent_returnsRecommendedBudget", () => {
      const input: IntentClassificationInput = {
        task: "What is the current status?",
      };

      const result = classifyIntent(input);

      expect(result.recommendedBudget).toBeDefined();
      expect(result.recommendedBudget.intent).toBe(result.intent);
    });

    it("classifyIntent_calculatesConfidence", () => {
      const clearInput: IntentClassificationInput = {
        task: "Find the file, search for the pattern, check if it exists",
      };

      const ambiguousInput: IntentClassificationInput = {
        task: "Do something",
      };

      const clearResult = classifyIntent(clearInput);
      const ambiguousResult = classifyIntent(ambiguousInput);

      expect(clearResult.confidence).toBeGreaterThan(ambiguousResult.confidence);
    });
  });

  describe("getIntentBudget", () => {
    it("getIntentBudget_returnsCorrectBudget", () => {
      expect(getIntentBudget("declarative")).toBe(INTENT_BUDGETS.declarative);
      expect(getIntentBudget("procedural")).toBe(INTENT_BUDGETS.procedural);
      expect(getIntentBudget("reasoning")).toBe(INTENT_BUDGETS.reasoning);
    });
  });

  describe("applyIntentLimits", () => {
    it("applyIntentLimits_appliesMaxIterations", () => {
      const baseLimits = { maxIterations: 20, timeoutMs: 10000, parallelism: 4 };

      const declarativeResult = applyIntentLimits(baseLimits, "declarative");
      const reasoningResult = applyIntentLimits(baseLimits, "reasoning");

      // Declarative: max 6 iterations (budget limit)
      expect(declarativeResult.maxIterations).toBe(6);
      // Reasoning: max 12 iterations (budget limit)
      expect(reasoningResult.maxIterations).toBe(12);
    });

    it("applyIntentLimits_appliesTimeoutMultiplier", () => {
      const baseLimits = { maxIterations: 5, timeoutMs: 10000, parallelism: 4 };

      const declarativeResult = applyIntentLimits(baseLimits, "declarative");
      const proceduralResult = applyIntentLimits(baseLimits, "procedural");
      const reasoningResult = applyIntentLimits(baseLimits, "reasoning");

      // Declarative: 1.0x timeout
      expect(declarativeResult.timeoutMs).toBe(10000);
      // Procedural: 1.5x timeout
      expect(proceduralResult.timeoutMs).toBe(15000);
      // Reasoning: 2.0x timeout
      expect(reasoningResult.timeoutMs).toBe(20000);
    });

    it("applyIntentLimits_appliesParallelismMultiplier", () => {
      const baseLimits = { maxIterations: 5, timeoutMs: 10000, parallelism: 10 };

      const declarativeResult = applyIntentLimits(baseLimits, "declarative");
      const proceduralResult = applyIntentLimits(baseLimits, "procedural");
      const reasoningResult = applyIntentLimits(baseLimits, "reasoning");

      // Declarative: 1.0x parallelism
      expect(declarativeResult.parallelism).toBe(10);
      // Procedural: 0.8x parallelism
      expect(proceduralResult.parallelism).toBe(8);
      // Reasoning: 1.2x parallelism
      expect(reasoningResult.parallelism).toBe(12);
    });

    it("applyIntentLimits_preservesUnspecifiedFields", () => {
      const baseLimits = { custom: "value", maxIterations: 5 };

      const result = applyIntentLimits(baseLimits, "declarative");

      expect((result as any).custom).toBe("value");
    });
  });

  describe("getEffectiveRepetitionThreshold", () => {
    it("getEffectiveRepetitionThreshold_declarative_higherTolerance", () => {
      const baseThreshold = 0.5;

      const declarativeThreshold = getEffectiveRepetitionThreshold(baseThreshold, "declarative");
      const reasoningThreshold = getEffectiveRepetitionThreshold(baseThreshold, "reasoning");

      // Declarative has higher tolerance, so threshold is higher
      expect(declarativeThreshold).toBeGreaterThan(reasoningThreshold);
    });

    it("getEffectiveRepetitionThreshold_handlesNaN", () => {
      const threshold = getEffectiveRepetitionThreshold(Number.NaN, "declarative");

      // Should handle NaN gracefully
      expect(Number.isFinite(threshold)).toBe(true);
    });

    it("getEffectiveRepetitionThreshold_handlesInfinity", () => {
      const threshold = getEffectiveRepetitionThreshold(Number.POSITIVE_INFINITY, "declarative");

      // Should handle Infinity gracefully
      expect(Number.isFinite(threshold)).toBe(true);
    });
  });

  describe("isIntentClassificationAvailable", () => {
    it("isIntentClassificationAvailable_returnsTrue", () => {
      expect(isIntentClassificationAvailable()).toBe(true);
    });
  });

  describe("getAllIntentBudgets", () => {
    it("getAllIntentBudgets_returnsCopy", () => {
      const budgets1 = getAllIntentBudgets();
      const budgets2 = getAllIntentBudgets();

      expect(budgets1).not.toBe(budgets2);
      expect(budgets1).toEqual(budgets2);
    });

    it("getAllIntentBudgets_containsAllIntents", () => {
      const budgets = getAllIntentBudgets();

      expect(budgets.declarative).toBeDefined();
      expect(budgets.procedural).toBeDefined();
      expect(budgets.reasoning).toBeDefined();
    });
  });

  describe("summarizeIntentClassification", () => {
    it("summarizeIntentClassification_formatsResult", () => {
      const result = {
        intent: "reasoning" as TaskIntent,
        confidence: 0.85,
        matchedPatterns: ["analyze", "compare", "evaluate", "assess"],
        recommendedBudget: INTENT_BUDGETS.reasoning,
      };

      const summary = summarizeIntentClassification(result);

      expect(summary).toContain("reasoning");
      expect(summary).toContain("85%");
      expect(summary).toContain("12 steps");
      expect(summary).toContain("2x timeout");
    });

    it("summarizeIntentClassification_limitsPatterns", () => {
      const result = {
        intent: "procedural" as TaskIntent,
        confidence: 0.9,
        matchedPatterns: ["implement", "create", "build", "configure", "deploy"],
        recommendedBudget: INTENT_BUDGETS.procedural,
      };

      const summary = summarizeIntentClassification(result);

      // Should only include first 3 patterns
      expect(summary).toContain("implement");
      expect(summary).toContain("create");
      expect(summary).toContain("build");
    });
  });

  describe("integration tests", () => {
    it("full intent classification workflow", () => {
      // Step 1: Classify task intent
      const input: IntentClassificationInput = {
        task: "Analyze the codebase structure and design a refactoring plan",
        goal: "Improve maintainability",
      };

      const classification = classifyIntent(input);

      // Step 2: Get budget for classified intent
      const budget = getIntentBudget(classification.intent);

      // Step 3: Apply limits to base configuration
      const baseConfig = {
        maxIterations: 20,
        timeoutMs: 60000,
        parallelism: 8,
      };

      const adjustedConfig = applyIntentLimits(baseConfig, classification.intent);

      // Step 4: Calculate effective repetition threshold
      const baseThreshold = 0.5;
      const effectiveThreshold = getEffectiveRepetitionThreshold(
        baseThreshold,
        classification.intent
      );

      // Verify workflow
      expect(classification.intent).toBe("reasoning");
      expect(budget.intent).toBe("reasoning");
      expect(adjustedConfig.maxIterations).toBeLessThanOrEqual(budget.maxIterations);
      expect(effectiveThreshold).toBeDefined();
    });

    it("different intents produce different limits", () => {
      const baseConfig = {
        maxIterations: 20,
        timeoutMs: 60000,
        parallelism: 10,
      };

      const declarativeConfig = applyIntentLimits(baseConfig, "declarative");
      const proceduralConfig = applyIntentLimits(baseConfig, "procedural");
      const reasoningConfig = applyIntentLimits(baseConfig, "reasoning");

      // Different intents should produce different timeout values
      expect(declarativeConfig.timeoutMs).not.toBe(proceduralConfig.timeoutMs);
      expect(proceduralConfig.timeoutMs).not.toBe(reasoningConfig.timeoutMs);

      // Different intents should produce different iteration limits
      expect(declarativeConfig.maxIterations).not.toBe(reasoningConfig.maxIterations);
    });

    it("pattern matching for mixed content", () => {
      const input: IntentClassificationInput = {
        task: "Find the configuration file and analyze its impact on performance",
      };

      const result = classifyIntent(input);

      // Should have at least one matched pattern
      expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(1);

      // Should classify to one of the intents
      expect(["declarative", "procedural", "reasoning"]).toContain(result.intent);
    });
  });
});
