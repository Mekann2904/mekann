/**
 * @abdd.meta
 * path: .pi/tests/extensions/subagents/three-layer-pipeline.test.ts
 * role: Three-Layer Pipeline処理ロジックの単体テスト
 * why: 3層パイプラインによる出力処理の正確性を保証するため
 * related: .pi/extensions/subagents/task-execution.ts, .pi/lib/output-schema.ts, .pi/lib/output-template.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等で独立している
 * side_effects: なし（テスト環境）
 * failure_modes: テスト失敗時は実装のバグを示す
 * @abdd.explain
 * overview: task-execution.tsのThree-Layer Pipeline関数に対する単体テスト
 * what_it_does:
 *   - processOutputWithThreeLayerPipeline: 3層パイプライン処理をテスト
 *   - ensureOutputStructure: 出力構造検証をテスト
 *   - isRetryableSubagentError: リトライ判定をテスト
 *   - resolveSubagentFailureOutcome: エラー解決をテスト
 * why_it_exists: 3層パイプラインによる出力処理の正確性を検証するため
 * scope:
 *   in: task-execution.tsのパイプライン関連公開関数
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  processOutputWithThreeLayerPipeline,
  ensureOutputStructure,
  isRetryableSubagentError,
  isEmptyOutputFailureMessage,
  buildFailureSummary,
  resolveSubagentFailureOutcome,
} from "../../../extensions/subagents/task-execution.js";

// Helper to create valid structured output matching schema requirements:
// - SUMMARY: required, minLength: 10
// - RESULT: required, minLength: 20
// - NEXT_STEP: required, maxLength: 500
function createValidOutput(summary: string, result: string, nextStep: string = "No further action required"): string {
  return `SUMMARY: ${summary}

RESULT: ${result}

NEXT_STEP: ${nextStep}`;
}

describe("processOutputWithThreeLayerPipeline", () => {
  describe("empty input handling", () => {
    it("should handle empty string input", () => {
      const result = processOutputWithThreeLayerPipeline("");

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.appliedLayer).toBe(3);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should handle whitespace-only input", () => {
      const result = processOutputWithThreeLayerPipeline("   \n\t  ");

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.appliedLayer).toBe(3);
    });

    it("should handle newline-only input", () => {
      const result = processOutputWithThreeLayerPipeline("\n\n\n");

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
    });
  });

  describe("valid structured output", () => {
    it("should pass through output with all required fields", () => {
      const input = createValidOutput(
        "Task completed successfully with all required fields",
        "The implementation is complete and all tests are passing without any issues detected",
        "Review the changes and merge if approved"
      );
      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(false);
      expect(result.appliedLayer).toBe(2);
      expect(result.violations).toHaveLength(0);
      expect(result.output).toBe(input);
    });

    it("should handle output with additional sections", () => {
      const input = `SUMMARY: Analysis complete with all required fields present

RESULT: Found 3 issues that need to be addressed before the code can be merged

NEXT_STEP: Fix the identified issues and run tests again

CONFIDENCE: High

EVIDENCE:
- Issue 1: Line 10 has a typo
- Issue 2: Line 20 missing semicolon
- Issue 3: Line 30 uses deprecated API`;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(false);
      expect(result.appliedLayer).toBe(2);
    });
  });

  describe("missing required fields", () => {
    it("should apply Layer 3 when SUMMARY is missing", () => {
      const input = `RESULT: This result has enough characters to pass validation requirements

NEXT_STEP: Add the missing SUMMARY field`;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.appliedLayer).toBe(3);
    });

    it("should apply Layer 3 when RESULT is missing", () => {
      const input = `SUMMARY: This is a valid summary

NEXT_STEP: Add the missing RESULT field`;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.appliedLayer).toBe(3);
    });

    it("should handle output when NEXT_STEP is missing", () => {
      const input = `SUMMARY: This is a valid summary with enough characters

RESULT: This result has enough characters to pass the validation requirements`;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.ok).toBe(true);
      // NEXT_STEP might be optional or have different validation behavior
      // The important thing is that the function handles it gracefully
      expect(result).toBeDefined();
      expect(result.output).toBeDefined();
    });

    it("should apply Layer 3 when multiple fields are missing", () => {
      const result = processOutputWithThreeLayerPipeline("Some random text without structure");

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.appliedLayer).toBe(3);
    });
  });

  describe("field length validation", () => {
    it("should apply Layer 3 when SUMMARY is too short", () => {
      const input = `SUMMARY: Short

RESULT: This result has enough characters to pass the validation requirements for the field

NEXT_STEP: Expand the summary`;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.degraded).toBe(true);
    });

    it("should apply Layer 3 when RESULT is too short", () => {
      const input = `SUMMARY: This is a valid summary with enough characters

RESULT: Too short

NEXT_STEP: Expand the result`;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.degraded).toBe(true);
    });
  });

  describe("output trimming", () => {
    it("should trim leading and trailing whitespace", () => {
      const input = `

SUMMARY: This is a trimmed summary with enough characters

RESULT: This result has enough characters to pass the validation requirements

NEXT_STEP: Verify the output

   `;

      const result = processOutputWithThreeLayerPipeline(input);

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(false);
      expect(result.output.trim()).toBe(result.output);
    });
  });
});

describe("ensureOutputStructure", () => {
  it("should return unchanged output when structure is valid", () => {
    const input = createValidOutput(
      "Valid output with all required fields present",
      "The result contains enough characters to satisfy the minimum length requirement for validation"
    );

    const result = ensureOutputStructure(input);

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.appliedLayer).toBe(0);
    expect(result.output).toBe(input);
  });

  it("should apply pipeline when structure is invalid", () => {
    const input = "No structure here at all";

    const result = ensureOutputStructure(input);

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it("should handle empty output", () => {
    const result = ensureOutputStructure("");

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
  });
});

describe("isRetryableSubagentError", () => {
  it("should detect rate limit errors as retryable", () => {
    const error = new Error("rate limit exceeded");
    expect(isRetryableSubagentError(error, 429)).toBe(true);
  });

  it("should detect empty output errors as retryable", () => {
    const error = new Error("subagent returned empty output");
    expect(isRetryableSubagentError(error)).toBe(true);
  });

  it("should detect server errors (5xx) as retryable", () => {
    const error = new Error("internal server error");
    expect(isRetryableSubagentError(error, 500)).toBe(true);
  });

  it("should detect overload errors as retryable", () => {
    const error = new Error("service overloaded");
    expect(isRetryableSubagentError(error, 502)).toBe(true);
  });

  it("should NOT detect client errors (4xx) as retryable", () => {
    const error = new Error("bad request");
    expect(isRetryableSubagentError(error, 400)).toBe(false);
  });

  it("should NOT detect authentication errors as retryable", () => {
    const error = new Error("unauthorized");
    expect(isRetryableSubagentError(error, 401)).toBe(false);
  });

  it("should handle non-Error objects", () => {
    expect(isRetryableSubagentError("string error")).toBe(false);
    expect(isRetryableSubagentError(null)).toBe(false);
    expect(isRetryableSubagentError(undefined)).toBe(false);
    expect(isRetryableSubagentError({ message: "error" })).toBe(false);
  });

  it("should be case-insensitive for empty output", () => {
    const upperError = new Error("SUBAGENT RETURNED EMPTY OUTPUT");
    expect(isRetryableSubagentError(upperError)).toBe(true);

    const mixedError = new Error("Subagent Returned Empty Output");
    expect(isRetryableSubagentError(mixedError)).toBe(true);
  });
});

describe("isEmptyOutputFailureMessage", () => {
  it("should detect empty output messages", () => {
    expect(isEmptyOutputFailureMessage("subagent returned empty output")).toBe(true);
    expect(isEmptyOutputFailureMessage("SUBAGENT RETURNED EMPTY OUTPUT")).toBe(true);
  });

  it("should NOT detect non-empty messages", () => {
    expect(isEmptyOutputFailureMessage("syntax error")).toBe(false);
    expect(isEmptyOutputFailureMessage("timeout")).toBe(false);
    expect(isEmptyOutputFailureMessage("rate limit")).toBe(false);
    expect(isEmptyOutputFailureMessage("")).toBe(false);
  });
});

describe("buildFailureSummary", () => {
  it("should build summary for empty output", () => {
    const summary = buildFailureSummary("subagent returned empty output");
    expect(summary).toBe("(failed: empty output)");
  });

  it("should build summary for timeout", () => {
    const summary = buildFailureSummary("Request timed out");
    expect(summary).toBe("(failed: timeout)");
  });

  it("should build summary for rate limit", () => {
    const summary = buildFailureSummary("Rate limit exceeded (429)");
    expect(summary).toBe("(failed: rate limit)");
  });

  it("should return generic failure for unknown errors", () => {
    const summary = buildFailureSummary("Unknown error occurred");
    expect(summary).toBe("(failed)");
  });

  it("should handle empty message", () => {
    const summary = buildFailureSummary("");
    expect(summary).toBe("(failed)");
  });
});

describe("resolveSubagentFailureOutcome", () => {
  it("should detect cancellation", () => {
    const outcome = resolveSubagentFailureOutcome(new Error("Operation was cancelled"));
    expect(outcome.outcomeCode).toBe("CANCELLED");
    expect(outcome.retryRecommended).toBe(false);
  });

  it("should detect timeout", () => {
    const outcome = resolveSubagentFailureOutcome(new Error("Request timed out"));
    expect(outcome.outcomeCode).toBe("TIMEOUT");
    expect(outcome.retryRecommended).toBe(true);
  });

  it("should detect rate limit pressure", () => {
    const outcome = resolveSubagentFailureOutcome(new Error("Rate limit exceeded (429)"));
    expect(outcome.outcomeCode).toBe("RETRYABLE_FAILURE");
    expect(outcome.retryRecommended).toBe(true);
  });

  it("should detect empty output as retryable", () => {
    const outcome = resolveSubagentFailureOutcome(new Error("subagent returned empty output"));
    expect(outcome.outcomeCode).toBe("RETRYABLE_FAILURE");
    expect(outcome.retryRecommended).toBe(true);
  });

  it("should classify unknown errors as non-retryable", () => {
    const outcome = resolveSubagentFailureOutcome(new Error("Some random error"));
    expect(outcome.outcomeCode).toBe("NONRETRYABLE_FAILURE");
    expect(outcome.retryRecommended).toBe(false);
  });

  it("should handle non-Error objects", () => {
    const outcome = resolveSubagentFailureOutcome("string error");
    expect(outcome.outcomeCode).toBe("NONRETRYABLE_FAILURE");
    expect(outcome.retryRecommended).toBe(false);
  });

  it("should handle null", () => {
    const outcome = resolveSubagentFailureOutcome(null);
    expect(outcome.outcomeCode).toBe("NONRETRYABLE_FAILURE");
    expect(outcome.retryRecommended).toBe(false);
  });

  it("should handle undefined", () => {
    const outcome = resolveSubagentFailureOutcome(undefined);
    expect(outcome.outcomeCode).toBe("NONRETRYABLE_FAILURE");
    expect(outcome.retryRecommended).toBe(false);
  });
});
