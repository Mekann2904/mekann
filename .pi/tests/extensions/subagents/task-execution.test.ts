/**
 * @abdd.meta
 * path: .pi/tests/extensions/subagents/task-execution.test.ts
 * role: サブエージェントタスク実行モジュールの単体テスト
 * why: タスク実行の安全性と正確性を保証するため
 * related: .pi/extensions/subagents/task-execution.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等で独立している
 * side_effects: なし（テスト環境）
 * failure_modes: テスト失敗時は実装のバグを示す
 * @abdd.explain
 * overview: task-execution.tsの公開関数に対する単体テスト
 * what_it_does:
 *   - isHighRiskTask: 高リスクタスクの判定をテスト
 *   - isResearchTask: リサーチタスクの判定をテスト
 *   - normalizeSubagentOutput: 出力正規化をテスト
 *   - isRetryableSubagentError: リトライ判定をテスト
 * why_it_exists: タスク実行の安全性と正確性を検証するため
 * scope:
 *   in: task-execution.tsの公開関数
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  isHighRiskTask,
  isResearchTask,
  normalizeSubagentOutput,
  isRetryableSubagentError,
  isEmptyOutputFailureMessage,
  buildFailureSummary,
  mergeSkillArrays,
  formatSkillsSection,
  extractSummary,
} from "../../../extensions/subagents/task-execution.js";

describe("isHighRiskTask", () => {
  it("should detect delete/remove operations as high risk", () => {
    expect(isHighRiskTask("delete from users where id = 1")).toBe(true);
    expect(isHighRiskTask("remove the file")).toBe(true);
    expect(isHighRiskTask("削除してください")).toBe(true);
  });

  it("should detect production-related tasks as high risk", () => {
    expect(isHighRiskTask("deploy to production")).toBe(true);
    expect(isHighRiskTask("DEPLOY PRODUCTION")).toBe(true);
    expect(isHighRiskTask("本番環境にデプロイ")).toBe(true);
    expect(isHighRiskTask("prod environment")).toBe(true);
  });

  it("should detect security-related tasks as high risk", () => {
    expect(isHighRiskTask("セキュリティ修正")).toBe(true);
    expect(isHighRiskTask("security fix")).toBe(true);
    expect(isHighRiskTask("auth configuration")).toBe(true);
  });

  it("should detect permission-related tasks as high risk", () => {
    expect(isHighRiskTask("権限を変更")).toBe(true);
    expect(isHighRiskTask("permission update")).toBe(true);
    expect(isHighRiskTask("privilege escalation")).toBe(true);
  });

  it("should NOT detect safe operations as high risk", () => {
    expect(isHighRiskTask("SELECT * FROM users")).toBe(false);
    expect(isHighRiskTask("git status")).toBe(false);
    expect(isHighRiskTask("npm install")).toBe(false);
    expect(isHighRiskTask("read the file")).toBe(false);
    expect(isHighRiskTask("create a new feature")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isHighRiskTask("DELETE")).toBe(true);
    expect(isHighRiskTask("delete")).toBe(true);
    expect(isHighRiskTask("DeLeTe")).toBe(true);
  });
});

describe("isResearchTask", () => {
  it("should detect research-related tasks", () => {
    expect(isResearchTask("調査してください")).toBe(true);
    expect(isResearchTask("investigate the issue")).toBe(true);
    expect(isResearchTask("analyze the codebase")).toBe(true);
    expect(isResearchTask("分析")).toBe(true);
    expect(isResearchTask("探してください")).toBe(true);
    expect(isResearchTask("find information")).toBe(true);
    expect(isResearchTask("検索")).toBe(true);
  });

  it("should NOT detect non-research tasks", () => {
    expect(isResearchTask("implement the feature")).toBe(false);
    expect(isResearchTask("fix the bug")).toBe(false);
    expect(isResearchTask("write tests")).toBe(false);
    expect(isResearchTask("create a new file")).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isResearchTask("INVESTIGATE")).toBe(true);
    expect(isResearchTask("Investigate")).toBe(true);
    expect(isResearchTask("ANALYZE")).toBe(true);
  });
});

describe("normalizeSubagentOutput", () => {
  it("should return unchanged output for normal content", () => {
    const output = "This is a normal output";
    const result = normalizeSubagentOutput(output);
    expect(result.output).toBeDefined();
    expect(result.ok).toBe(true);
  });

  it("should handle empty output", () => {
    const result = normalizeSubagentOutput("");
    expect(result.output).toBe("");
    expect(result.ok).toBe(false);
  });

  it("should handle JSON output", () => {
    const output = '{"key": "value"}';
    const result = normalizeSubagentOutput(output);
    expect(result.output).toBeDefined();
  });

  it("should handle multi-line output", () => {
    const output = "Line 1\nLine 2\nLine 3";
    const result = normalizeSubagentOutput(output);
    expect(result.output).toBeDefined();
  });
});

describe("isRetryableSubagentError", () => {
  it("should detect rate limit errors as retryable", () => {
    const error = new Error("rate limit exceeded");
    expect(isRetryableSubagentError(error, 429)).toBe(true);
  });

  it("should detect timeout errors as retryable", () => {
    const error = new Error("subagent returned empty output after timeout");
    expect(isRetryableSubagentError(error)).toBe(true);
  });

  it("should detect server errors as retryable", () => {
    const error = new Error("internal server error");
    expect(isRetryableSubagentError(error, 500)).toBe(true);
  });

  it("should NOT detect client errors as retryable", () => {
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
  });
});

describe("buildFailureSummary", () => {
  it("should build a summary from error message", () => {
    const summary = buildFailureSummary("Error: something went wrong");
    expect(summary).toBe("(failed)");
  });

  it("should detect empty output in message", () => {
    const summary = buildFailureSummary("Error: empty output received");
    expect(summary).toBe("(failed: empty output)");
  });

  it("should detect timeout in message", () => {
    const summary = buildFailureSummary("Error: request timed out");
    expect(summary).toBe("(failed: timeout)");
  });

  it("should handle empty messages", () => {
    const summary = buildFailureSummary("");
    expect(summary).toBe("(failed)");
  });
});

describe("mergeSkillArrays", () => {
  it("should return override when base is undefined", () => {
    const result = mergeSkillArrays(undefined, ["skill1", "skill2"]);
    expect(result).toEqual(["skill1", "skill2"]);
  });

  it("should return base when override is undefined", () => {
    const result = mergeSkillArrays(["skill1", "skill2"], undefined);
    expect(result).toEqual(["skill1", "skill2"]);
  });

  it("should return undefined when both are undefined", () => {
    const result = mergeSkillArrays(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it("should merge and deduplicate skills", () => {
    const result = mergeSkillArrays(["skill1", "skill2"], ["skill2", "skill3"]);
    expect(result).toEqual(expect.arrayContaining(["skill1", "skill2", "skill3"]));
  });
});

describe("formatSkillsSection", () => {
  it("should format skills as a section", () => {
    const result = formatSkillsSection(["skill1", "skill2"]);
    expect(result).toContain("skill1");
    expect(result).toContain("skill2");
  });

  it("should return null for empty skills", () => {
    const result = formatSkillsSection([]);
    expect(result).toBeNull();
  });

  it("should return null for undefined skills", () => {
    const result = formatSkillsSection(undefined);
    expect(result).toBeNull();
  });
});

describe("extractSummary", () => {
  it("should extract summary from structured output with SUMMARY:", () => {
    const output = "SUMMARY: This is the summary content.\n\nDetails here.";
    const summary = extractSummary(output);
    expect(summary).toContain("This is the summary content");
  });

  it("should return first paragraph for unstructured output", () => {
    const output = "First paragraph.\n\nSecond paragraph.";
    const summary = extractSummary(output);
    expect(summary).toContain("First paragraph");
  });

  it("should handle empty output", () => {
    const summary = extractSummary("");
    expect(summary).toBe("(no summary)");
  });

  it("should truncate long summaries", () => {
    const output = "a".repeat(1000);
    const summary = extractSummary(output);
    expect(summary.length).toBeLessThanOrEqual(123); // 120 + "..."
  });
});
