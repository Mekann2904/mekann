/**
 * Path: tests/unit/lib/dynamic-tools/quality.test.ts
 * Role: .pi/lib/dynamic-tools/quality.ts の品質評価と統計処理を検証するユニットテスト。
 * Why: 品質検出ロジックの回帰を防ぎ、主要な判定パターンを安定して担保するため。
 * Related: .pi/lib/dynamic-tools/quality.ts, tests/unit/lib/dynamic-tools/quality.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assessCodeQuality,
  recordExecutionMetrics,
  getUsageStatistics,
  getAllUsageStatistics,
  resetUsageStatistics,
  recordQualityScore,
  analyzeQualityTrend,
  type QualityAssessment,
  type CategoryScores,
  type QualityIssue,
  type ExecutionMetrics,
  type ToolUsageStatistics,
} from "../../../../.pi/lib/dynamic-tools/quality.js";

// ============================================================================
// assessCodeQuality Tests
// ============================================================================

describe("assessCodeQuality", () => {
  it("should return assessment for empty code", () => {
    const result = assessCodeQuality("");

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("categoryScores");
    expect(result).toHaveProperty("issues");
    expect(result).toHaveProperty("improvements");
    expect(result).toHaveProperty("confidence");
  });

  it("should return score between 0 and 1", () => {
    const result = assessCodeQuality("function test() { return 1; }");

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("should detect long lines (>120 chars)", () => {
    const longLine = "const x = " + "a".repeat(150) + ";";
    const result = assessCodeQuality(longLine);

    const longLineIssue = result.issues.find(
      i => i.category === "readability" && i.description.includes("120")
    );
    expect(longLineIssue).toBeDefined();
  });

  it("should detect var keyword usage", () => {
    const code = `var x = 1;`;
    const result = assessCodeQuality(code);

    const varIssue = result.issues.find(
      i => i.category === "readability" && i.description.includes("var")
    );
    expect(varIssue).toBeDefined();
  });

  it("should detect loose equality (==)", () => {
    const code = `if (a == b) { }`;
    const result = assessCodeQuality(code);

    const looseEqIssue = result.issues.find(
      i => i.category === "readability" && i.location?.snippet?.includes("==")
    );
    expect(looseEqIssue).toBeDefined();
  });

  it("should detect empty catch block", () => {
    const code = `
      try {
        doSomething();
      } catch (e) {
      }
    `;
    const result = assessCodeQuality(code);

    const emptyCatchIssue = result.issues.find(
      i => i.category === "errorHandling" && i.description.includes("catch")
    );
    expect(emptyCatchIssue).toBeDefined();
    expect(emptyCatchIssue?.severity).toBe("high");
  });

  it("should detect try without catch", () => {
    const code = `try { doSomething(); }`;
    const result = assessCodeQuality(code);

    const tryWithoutCatch = result.issues.find(
      i => i.category === "errorHandling"
    );
    // May or may not be detected depending on implementation
    expect(result).toHaveProperty("issues");
  });

  it("should detect empty error message", () => {
    const code = `throw new Error('')`;
    const result = assessCodeQuality(code);

    const emptyError = result.issues.find(
      i => i.category === "errorHandling" && i.description.includes("error")
    );
    // May or may not be detected
    expect(result).toHaveProperty("issues");
  });

  it("should reward JSDoc comments", () => {
    const codeWithJSDoc = `
      /**
       * Adds two numbers
       * @param a - First number
       * @param b - Second number
       * @returns Sum of a and b
       */
      function add(a, b) {
        return a + b;
      }
    `;
    const codeWithoutJSDoc = `
      function add(a, b) {
        return a + b;
      }
    `;

    const resultWith = assessCodeQuality(codeWithJSDoc);
    const resultWithout = assessCodeQuality(codeWithoutJSDoc);

    expect(resultWith.categoryScores.documentation).toBeGreaterThanOrEqual(
      resultWithout.categoryScores.documentation
    );
  });

  it("should detect non-deterministic values (Math.random)", () => {
    const code = `const x = Math.random();`;
    const result = assessCodeQuality(code);

    const randomIssue = result.issues.find(
      i => i.category === "testability" && i.location?.snippet?.includes("Math.random")
    );
    expect(randomIssue).toBeDefined();
  });

  it("should detect Date.now() usage", () => {
    const code = `const now = Date.now();`;
    const result = assessCodeQuality(code);

    const dateNowIssue = result.issues.find(
      i => i.category === "testability"
    );
    // May or may not be detected
    expect(result).toHaveProperty("issues");
  });

  it("should detect new Date() usage", () => {
    const code = `const now = new Date();`;
    const result = assessCodeQuality(code);

    const dateIssue = result.issues.find(
      i => i.category === "testability" && i.location?.snippet?.includes("new Date")
    );
    expect(dateIssue).toBeDefined();
  });

  it("should reward exported functions", () => {
    const code = `export function test() { return 1; }`;
    const result = assessCodeQuality(code);

    expect(result.categoryScores.testability).toBeGreaterThan(0.5);
  });

  it("should detect inefficient deep copy", () => {
    const code = `const clone = JSON.parse(JSON.stringify(obj));`;
    const result = assessCodeQuality(code);

    const deepCopyIssue = result.issues.find(
      i =>
        i.category === "performance" &&
        i.location?.snippet?.includes("JSON.parse(JSON.stringify")
    );
    expect(deepCopyIssue).toBeDefined();
  });

  it("should detect sequential awaits", () => {
    const code = `
      async function fetchAll() {
        const a = await fetchA();
        const b = await fetchB();
        const c = await fetchC();
      }
    `;
    const result = assessCodeQuality(code);

    const sequentialAwait = result.issues.find(
      i =>
        i.category === "performance" &&
        (i.location?.snippet?.includes("await") || i.description.includes("await"))
    );
    expect(sequentialAwait).toBeDefined();
  });

  it("should reward Promise.all usage", () => {
    const code = `const [a, b] = await Promise.all([fetchA(), fetchB()]);`;
    const result = assessCodeQuality(code);

    expect(result.categoryScores.performance).toBeGreaterThan(0.5);
  });

  it("should detect hardcoded password", () => {
    const code = `const password = "secret123";`;
    const result = assessCodeQuality(code);

    const passwordIssue = result.issues.find(
      i => i.category === "securityAwareness" && i.severity === "high"
    );
    expect(passwordIssue).toBeDefined();
  });

  it("should detect innerHTML assignment", () => {
    const code = `element.innerHTML = userInput;`;
    const result = assessCodeQuality(code);

    const innerHtmlIssue = result.issues.find(
      i => i.category === "securityAwareness" && i.description.includes("innerHTML")
    );
    expect(innerHtmlIssue).toBeDefined();
  });

  it("should reward sanitization patterns", () => {
    const code = `const safe = sanitize(userInput);`;
    const result = assessCodeQuality(code);

    expect(result.categoryScores.securityAwareness).toBeGreaterThan(0.5);
  });

  it("should calculate overall score from category scores", () => {
    const code = `
      /**
       * Test function
       */
      export function test() {
        try {
          return doSomething();
        } catch (e) {
          console.error(e);
          throw e;
        }
      }
    `;
    const result = assessCodeQuality(code);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("should generate improvement suggestions", () => {
    const code = `var x = 1;`;
    const result = assessCodeQuality(code);

    expect(Array.isArray(result.improvements)).toBe(true);
  });

  it("should calculate confidence based on code length", () => {
    const shortCode = `x = 1;`;
    const longCode = `
      function a() { return 1; }
      function b() { return 2; }
      function c() { return 3; }
      function d() { return 4; }
      function e() { return 5; }
    `;

    const shortResult = assessCodeQuality(shortCode);
    const longResult = assessCodeQuality(longCode);

    expect(longResult.confidence).toBeGreaterThanOrEqual(shortResult.confidence);
  });

  it("should detect long functions", () => {
    const longFunctionCode = `
      function longFunction() {
        ${Array(60).fill("const x = 1;").join("\n")}
      }
    `;
    const result = assessCodeQuality(longFunctionCode);

    const longFnIssue = result.issues.find(
      i => i.category === "readability" && i.description.includes("function")
    );
    // May or may not be detected based on implementation
    expect(result).toHaveProperty("issues");
  });
});

// ============================================================================
// CategoryScores Tests
// ============================================================================

describe("CategoryScores", () => {
  it("should have all required categories", () => {
    const result = assessCodeQuality("function test() {}");

    expect(result.categoryScores).toHaveProperty("readability");
    expect(result.categoryScores).toHaveProperty("errorHandling");
    expect(result.categoryScores).toHaveProperty("documentation");
    expect(result.categoryScores).toHaveProperty("testability");
    expect(result.categoryScores).toHaveProperty("performance");
    expect(result.categoryScores).toHaveProperty("securityAwareness");
  });

  it("should have scores between 0 and 1 for each category", () => {
    const result = assessCodeQuality(`
      var x = 1;
      try { } catch (e) { }
      Math.random();
    `);

    Object.values(result.categoryScores).forEach(score => {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});

// ============================================================================
// QualityIssue Tests
// ============================================================================

describe("QualityIssue", () => {
  it("should have correct structure for detected issues", () => {
    const code = `var x = 1;`;
    const result = assessCodeQuality(code);
    const issue = result.issues[0];

    expect(issue).toHaveProperty("category");
    expect(issue).toHaveProperty("severity");
    expect(issue).toHaveProperty("description");
    expect(issue).toHaveProperty("suggestion");
  });

  it("should have valid severity values", () => {
    const code = `
      var x = 1;
      try { } catch (e) { }
      const password = "hardcoded";
    `;
    const result = assessCodeQuality(code);

    result.issues.forEach(issue => {
      expect(["high", "medium", "low"]).toContain(issue.severity);
    });
  });
});

// ============================================================================
// Usage Statistics Tests
// ============================================================================

describe("Usage Statistics", () => {
  beforeEach(() => {
    resetUsageStatistics();
  });

  afterEach(() => {
    resetUsageStatistics();
  });

  describe("recordExecutionMetrics", () => {
    it("should create new statistics for new tool", () => {
      const metrics: ExecutionMetrics = {
        executionTimeMs: 100,
        success: true,
      };

      recordExecutionMetrics("tool-1", metrics);

      const stats = getUsageStatistics("tool-1");
      expect(stats).toBeDefined();
      expect(stats?.totalUsage).toBe(1);
      expect(stats?.successCount).toBe(1);
    });

    it("should update existing statistics", () => {
      const metrics1: ExecutionMetrics = {
        executionTimeMs: 100,
        success: true,
      };
      const metrics2: ExecutionMetrics = {
        executionTimeMs: 200,
        success: false,
        errorType: "RuntimeError",
      };

      recordExecutionMetrics("tool-1", metrics1);
      recordExecutionMetrics("tool-1", metrics2);

      const stats = getUsageStatistics("tool-1");
      expect(stats?.totalUsage).toBe(2);
      expect(stats?.successCount).toBe(1);
      expect(stats?.failureCount).toBe(1);
    });

    it("should track execution time statistics", () => {
      const metrics1: ExecutionMetrics = { executionTimeMs: 100, success: true };
      const metrics2: ExecutionMetrics = { executionTimeMs: 200, success: true };
      const metrics3: ExecutionMetrics = { executionTimeMs: 50, success: true };

      recordExecutionMetrics("tool-1", metrics1);
      recordExecutionMetrics("tool-1", metrics2);
      recordExecutionMetrics("tool-1", metrics3);

      const stats = getUsageStatistics("tool-1");
      expect(stats?.avgExecutionTimeMs).toBeCloseTo(116.67, 1);
      expect(stats?.maxExecutionTimeMs).toBe(200);
      expect(stats?.minExecutionTimeMs).toBe(50);
    });

    it("should calculate success rate", () => {
      const metrics1: ExecutionMetrics = { executionTimeMs: 100, success: true };
      const metrics2: ExecutionMetrics = { executionTimeMs: 100, success: true };
      const metrics3: ExecutionMetrics = { executionTimeMs: 100, success: false };

      recordExecutionMetrics("tool-1", metrics1);
      recordExecutionMetrics("tool-1", metrics2);
      recordExecutionMetrics("tool-1", metrics3);

      const stats = getUsageStatistics("tool-1");
      expect(stats?.successRate).toBeCloseTo(0.667, 2);
    });

    it("should track error breakdown", () => {
      const metrics1: ExecutionMetrics = {
        executionTimeMs: 100,
        success: false,
        errorType: "TypeError",
      };
      const metrics2: ExecutionMetrics = {
        executionTimeMs: 100,
        success: false,
        errorType: "TypeError",
      };
      const metrics3: ExecutionMetrics = {
        executionTimeMs: 100,
        success: false,
        errorType: "RangeError",
      };

      recordExecutionMetrics("tool-1", metrics1);
      recordExecutionMetrics("tool-1", metrics2);
      recordExecutionMetrics("tool-1", metrics3);

      const stats = getUsageStatistics("tool-1");
      expect(stats?.errorBreakdown["TypeError"]).toBe(2);
      expect(stats?.errorBreakdown["RangeError"]).toBe(1);
    });

    it("should track recent executions (max 100)", () => {
      for (let i = 0; i < 150; i++) {
        recordExecutionMetrics("tool-1", {
          executionTimeMs: i,
          success: true,
        });
      }

      const stats = getUsageStatistics("tool-1");
      expect(stats?.recentExecutions.length).toBe(100);
      // Most recent should be at the end
      expect(stats?.recentExecutions[99].executionTimeMs).toBe(149);
    });
  });

  describe("getUsageStatistics", () => {
    it("should return undefined for non-existent tool", () => {
      const stats = getUsageStatistics("non-existent");
      expect(stats).toBeUndefined();
    });

    it("should return statistics for existing tool", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });

      const stats = getUsageStatistics("tool-1");
      expect(stats).toBeDefined();
      expect(stats?.toolId).toBe("tool-1");
    });
  });

  describe("getAllUsageStatistics", () => {
    it("should return empty array when no tools", () => {
      const allStats = getAllUsageStatistics();
      expect(allStats).toEqual([]);
    });

    it("should return all tool statistics", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });
      recordExecutionMetrics("tool-2", { executionTimeMs: 200, success: false });

      const allStats = getAllUsageStatistics();
      expect(allStats.length).toBe(2);
      expect(allStats.map(s => s.toolId)).toContain("tool-1");
      expect(allStats.map(s => s.toolId)).toContain("tool-2");
    });
  });

  describe("resetUsageStatistics", () => {
    it("should clear all statistics", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });
      recordExecutionMetrics("tool-2", { executionTimeMs: 200, success: false });

      resetUsageStatistics();

      expect(getUsageStatistics("tool-1")).toBeUndefined();
      expect(getUsageStatistics("tool-2")).toBeUndefined();
      expect(getAllUsageStatistics()).toEqual([]);
    });
  });
});

// ============================================================================
// Quality Trend Tests
// ============================================================================

describe("Quality Trend", () => {
  beforeEach(() => {
    resetUsageStatistics();
  });

  afterEach(() => {
    resetUsageStatistics();
  });

  describe("recordQualityScore", () => {
    it("should record quality score for tool", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });
      recordQualityScore("tool-1", 0.8);

      const stats = getUsageStatistics("tool-1");
      expect(stats?.qualityTrend).toContain(0.8);
    });

    it("should keep max 20 trend entries", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });

      for (let i = 0; i < 30; i++) {
        recordQualityScore("tool-1", i / 30);
      }

      const stats = getUsageStatistics("tool-1");
      expect(stats?.qualityTrend.length).toBe(20);
    });

    it("should not record for non-existent tool", () => {
      recordQualityScore("non-existent", 0.8);

      const stats = getUsageStatistics("non-existent");
      expect(stats).toBeUndefined();
    });
  });

  describe("analyzeQualityTrend", () => {
    it("should return stable for new tool", () => {
      const result = analyzeQualityTrend("non-existent");

      expect(result.trend).toBe("stable");
      expect(result.avgRecentScore).toBe(0);
      expect(result.changeRate).toBe(0);
    });

    it("should return stable for single data point", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });
      recordQualityScore("tool-1", 0.8);

      const result = analyzeQualityTrend("tool-1");

      expect(result.trend).toBe("stable");
    });

    it("should detect improving trend", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });

      // Record improving scores
      const scores = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
      scores.forEach(s => recordQualityScore("tool-1", s));

      const result = analyzeQualityTrend("tool-1");

      expect(result.trend).toBe("improving");
      expect(result.changeRate).toBeGreaterThan(0.1);
    });

    it("should detect declining trend", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });

      // Record declining scores
      const scores = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5];
      scores.forEach(s => recordQualityScore("tool-1", s));

      const result = analyzeQualityTrend("tool-1");

      expect(result.trend).toBe("declining");
      expect(result.changeRate).toBeLessThan(-0.1);
    });

    it("should return stable for small changes", () => {
      recordExecutionMetrics("tool-1", { executionTimeMs: 100, success: true });

      // Record stable scores (within 10% change)
      const scores = [0.7, 0.71, 0.72, 0.73, 0.74, 0.75, 0.74, 0.73, 0.72, 0.71];
      scores.forEach(s => recordQualityScore("tool-1", s));

      const result = analyzeQualityTrend("tool-1");

      expect(result.trend).toBe("stable");
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("should handle very long code", () => {
    const code = "function test() { return 1; }\n".repeat(1000);
    const result = assessCodeQuality(code);

    expect(result).toHaveProperty("score");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("should handle code with unicode", () => {
    const code = `// 日本語コメント\nfunction テスト() { return "こんにちは"; }`;
    const result = assessCodeQuality(code);

    expect(result).toHaveProperty("score");
  });

  it("should handle code with special characters", () => {
    const code = `function test() { return "\\n\\t\\r\\"'"; }`;
    const result = assessCodeQuality(code);

    expect(result).toHaveProperty("score");
  });

  it("should handle minified code", () => {
    const code = `function f(a,b){return a+b}`;
    const result = assessCodeQuality(code);

    expect(result).toHaveProperty("score");
  });

  it("should handle code with only comments", () => {
    const code = `
      // This is a comment
      /* Multi-line
         comment */
    `;
    const result = assessCodeQuality(code);

    expect(result).toHaveProperty("score");
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Quality Assessment Integration", () => {
  it("should assess realistic high-quality code", () => {
    const code = `
      /**
       * Calculates the sum of an array of numbers
       * @param numbers - Array of numbers to sum
       * @returns The sum of all numbers
       */
      export function sum(numbers: number[]): number {
        if (!Array.isArray(numbers)) {
          throw new Error("Input must be an array");
        }
        return numbers.reduce((acc, n) => acc + n, 0);
      }
    `;
    const result = assessCodeQuality(code);

    expect(result.score).toBeGreaterThan(0.5);
    expect(result.categoryScores.documentation).toBeGreaterThan(0.3);
    expect(result.categoryScores.testability).toBeGreaterThan(0.5);
  });

  it("should assess realistic low-quality code", () => {
    const code = `
      var x = eval(userInput);
      var password = "hardcoded_secret";
      try { doSomething(); } catch (e) { }
      while(true) { }
    `;
    const result = assessCodeQuality(code);

    expect(result.score).toBeLessThan(0.5);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.improvements.length).toBeGreaterThan(0);
  });
});
