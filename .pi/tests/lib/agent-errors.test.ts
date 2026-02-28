/**
 * @abdd.meta
 * path: .pi/tests/lib/agent-errors.test.ts
 * role: agent-errors.tsの単体テスト
 * why: エラー分類、再試行判定、結果解決ロジックの正確性を保証するため
 * related: .pi/lib/agent-errors.ts, .pi/lib/agent-common.ts, .pi/lib/error-utils.ts
 * public_api: テストケースの実行
 * invariants: テストは独立して実行可能で、外部依存を持たない
 * side_effects: なし（テストのみ）
 * failure_modes: テスト失敗は実装の不具合を示す
 * @abdd.explain
 * overview: エラー分類および再試行判定ロジックの単体テスト
 * what_it_does:
 *   - セマンティックエラー分類のテスト
 *   - 再試行可否判定のテスト
 *   - 失敗結果解決のテスト
 *   - 集計結果解決のテスト
 *   - エラーメッセージ整形のテスト
 * why_it_exists:
 *   - エラー処理の正確性を保証し、リグレッションを防ぐため
 * scope:
 *   in: .pi/lib/agent-errors.ts
 *   out: テスト結果とカバレッジレポート
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  classifySemanticError,
  resolveExtendedFailureOutcome,
  isRetryableEntityError,
  isRetryableSubagentError,
  isRetryableTeamMemberError,
  resolveFailureOutcome,
  resolveSubagentFailureOutcome,
  resolveTeamFailureOutcome,
  resolveAggregateOutcome,
  resolveSubagentParallelOutcome,
  resolveTeamMemberAggregateOutcome,
  trimErrorMessage,
  buildDiagnosticContext,
  classifyFailureType,
  getRetryablePatterns,
  resetRetryablePatternsCache,
  addRetryablePatterns,
  RETRY_POLICY,
  type EntityResultItem,
  type FailureClassification,
} from "../../lib/agent/agent-errors.js";
import { SUBAGENT_CONFIG, TEAM_MEMBER_CONFIG } from "../../lib/agent/agent-common.js";

describe("agent-errors", () => {
  describe("classifySemanticError", () => {
    it("スキーマ違反を正しく分類する", () => {
      // Arrange & Act
      const result = classifySemanticError(undefined, new Error("Schema violation detected"));

      // Assert
      expect(result.code).toBe("SCHEMA_VIOLATION");
      expect(result.details).toContain("output_format_mismatch");
    });

    it("低品質出力を正しく分類する", () => {
      // Arrange & Act
      const result = classifySemanticError(undefined, new Error("Intent-only output detected"));

      // Assert
      expect(result.code).toBe("LOW_SUBSTANCE");
      expect(result.details).toContain("intent_only_output");
    });

    it("空出力を正しく分類する", () => {
      // Arrange & Act
      const result = classifySemanticError("", undefined);

      // Assert
      expect(result.code).toBe("EMPTY_OUTPUT");
      expect(result.details).toContain("no_content");
    });

    it("パースエラーを正しく分類する", () => {
      // Arrange & Act - outputがundefinedの場合はEMPTY_OUTPUTが先に判定されるため、
      // 空でないoutputを渡してパースエラーを判定する
      const result = classifySemanticError("invalid json", new Error("JSON parse error"));

      // Assert
      expect(result.code).toBe("PARSE_ERROR");
      expect(result.details).toContain("parsing_failed");
    });

    it("不明なエラーはnullを返す", () => {
      // Arrange & Act
      const result = classifySemanticError("valid output", new Error("Unknown error"));

      // Assert
      expect(result.code).toBeNull();
    });
  });

  describe("resolveExtendedFailureOutcome", () => {
    it("スキーマ違反は再試行可能と判定する", () => {
      // Arrange & Act
      const result = resolveExtendedFailureOutcome(new Error("Schema violation"));

      // Assert
      expect(result.outcomeCode).toBe("SCHEMA_VIOLATION");
      expect(result.retryRecommended).toBe(true);
    });

    it("キャンセルは再試行不可と判定する", () => {
      // Arrange & Act - outputを渡してclassifySemanticErrorがEMPTY_OUTPUTを返さないようにする
      const result = resolveExtendedFailureOutcome(new Error("Operation was cancelled"), "some output");

      // Assert
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });

    it("タイムアウトは再試行可能と判定する", () => {
      // Arrange & Act - outputを渡してclassifySemanticErrorがEMPTY_OUTPUTを返さないようにする
      const result = resolveExtendedFailureOutcome(new Error("Request timed out"), "some output");

      // Assert
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe("isRetryableEntityError", () => {
    it("HTTP 429は再試行可能", () => {
      // Arrange & Act
      const result = isRetryableEntityError(new Error("Error"), 429, SUBAGENT_CONFIG);

      // Assert
      expect(result).toBe(true);
    });

    it("HTTP 5xxは再試行可能", () => {
      // Arrange & Act
      const result = isRetryableEntityError(new Error("Server error"), 503, SUBAGENT_CONFIG);

      // Assert
      expect(result).toBe(true);
    });

    it("HTTP 4xxは再試行不可（429以外）", () => {
      // Arrange & Act
      const result = isRetryableEntityError(new Error("Bad request"), 400, SUBAGENT_CONFIG);

      // Assert
      expect(result).toBe(false);
    });

    it("レートリミットメッセージは再試行可能", () => {
      // Arrange & Act
      const result = isRetryableEntityError(new Error("Rate limit exceeded"), undefined, SUBAGENT_CONFIG);

      // Assert
      expect(result).toBe(true);
    });

    it("タイムアウトメッセージは再試行可能", () => {
      // Arrange & Act
      const result = isRetryableEntityError(new Error("Connection timeout"), undefined, SUBAGENT_CONFIG);

      // Assert
      expect(result).toBe(true);
    });

    it("エンティティ固有の空出力メッセージは再試行可能", () => {
      // Arrange & Act
      const result = isRetryableEntityError(
        new Error(SUBAGENT_CONFIG.emptyOutputMessage),
        undefined,
        SUBAGENT_CONFIG
      );

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("isRetryableSubagentError / isRetryableTeamMemberError", () => {
    it("サブエージェントのレートリミットは再試行可能", () => {
      // Arrange & Act
      const result = isRetryableSubagentError(new Error("Rate limit"), 429);

      // Assert
      expect(result).toBe(true);
    });

    it("チームメンバーのレートリミットは再試行可能", () => {
      // Arrange & Act
      const result = isRetryableTeamMemberError(new Error("Rate limit"), 429);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("resolveFailureOutcome", () => {
    it("キャンセルは再試行不可", () => {
      // Arrange & Act
      const result = resolveFailureOutcome(new Error("Operation cancelled"));

      // Assert
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });

    it("タイムアウトは再試行可能", () => {
      // Arrange & Act
      const result = resolveFailureOutcome(new Error("Request timeout"));

      // Assert
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });

    it("レートリミットは再試行可能", () => {
      // Arrange & Act
      const result = resolveFailureOutcome(new Error("Rate limit exceeded"), SUBAGENT_CONFIG);

      // Assert
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("不明なエラーは再試行不可", () => {
      // Arrange & Act
      const result = resolveFailureOutcome(new Error("Unknown error"));

      // Assert
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("resolveSubagentFailureOutcome / resolveTeamFailureOutcome", () => {
    it("サブエージェントのタイムアウトは再試行可能", () => {
      // Arrange & Act
      const result = resolveSubagentFailureOutcome(new Error("Timeout"));

      // Assert
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });

    it("チームメンバーのタイムアウトは再試行可能", () => {
      // Arrange & Act
      const result = resolveTeamFailureOutcome(new Error("Timeout"));

      // Assert
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe("resolveAggregateOutcome", () => {
    it("全て成功の場合はSUCCESS", () => {
      // Arrange
      const results: EntityResultItem[] = [
        { status: "completed", entityId: "agent-1" },
        { status: "completed", entityId: "agent-2" },
      ];

      // Act
      const result = resolveAggregateOutcome(results, resolveSubagentFailureOutcome);

      // Assert
      expect(result.outcomeCode).toBe("SUCCESS");
      expect(result.failedEntityIds).toHaveLength(0);
    });

    it("一部失敗の場合はPARTIAL_SUCCESS", () => {
      // Arrange
      const results: EntityResultItem[] = [
        { status: "completed", entityId: "agent-1" },
        { status: "failed", error: "Timeout", entityId: "agent-2" },
      ];

      // Act
      const result = resolveAggregateOutcome(results, resolveSubagentFailureOutcome);

      // Assert
      expect(result.outcomeCode).toBe("PARTIAL_SUCCESS");
      expect(result.failedEntityIds).toContain("agent-2");
      expect(result.retryRecommended).toBe(true);
    });

    it("全て失敗（再試行可能）の場合はRETRYABLE_FAILURE", () => {
      // Arrange
      const results: EntityResultItem[] = [
        { status: "failed", error: "Timeout", entityId: "agent-1" },
        { status: "failed", error: "Rate limit", entityId: "agent-2" },
      ];

      // Act
      const result = resolveAggregateOutcome(results, resolveSubagentFailureOutcome);

      // Assert
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.failedEntityIds).toHaveLength(2);
    });

    it("全て失敗（再試行不可）の場合はNONRETRYABLE_FAILURE", () => {
      // Arrange
      const results: EntityResultItem[] = [
        { status: "failed", error: "Cancelled", entityId: "agent-1" },
        { status: "failed", error: "Unknown error", entityId: "agent-2" },
      ];

      // Act
      const result = resolveAggregateOutcome(results, resolveSubagentFailureOutcome);

      // Assert
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("resolveSubagentParallelOutcome", () => {
    it("サブエージェント並列結果を正しく解決する", () => {
      // Arrange
      const results = [
        { runRecord: { status: "completed" as const, agentId: "sub-1" } },
        { runRecord: { status: "failed" as const, error: "Timeout", agentId: "sub-2" } },
      ];

      // Act
      const result = resolveSubagentParallelOutcome(results);

      // Assert
      expect(result.outcomeCode).toBe("PARTIAL_SUCCESS");
      expect(result.failedSubagentIds).toContain("sub-2");
    });
  });

  describe("resolveTeamMemberAggregateOutcome", () => {
    it("チームメンバー結果を正しく解決する", () => {
      // Arrange
      const results = [
        { status: "completed" as const, memberId: "member-1" },
        { status: "failed" as const, error: "Timeout", memberId: "member-2" },
      ];

      // Act
      const result = resolveTeamMemberAggregateOutcome(results);

      // Assert
      expect(result.outcomeCode).toBe("PARTIAL_SUCCESS");
      expect(result.failedMemberIds).toContain("member-2");
    });
  });

  describe("trimErrorMessage", () => {
    it("短いメッセージはそのまま返す", () => {
      // Arrange & Act
      const result = trimErrorMessage("Short error");

      // Assert
      expect(result).toBe("Short error");
    });

    it("長いメッセージは切り詰める", () => {
      // Arrange
      const longMessage = "A".repeat(300);

      // Act
      const result = trimErrorMessage(longMessage, 200);

      // Assert
      expect(result.length).toBe(200);
      expect(result.endsWith("...")).toBe(true);
    });

    it("カスタム最大長を適用する", () => {
      // Arrange
      const message = "A".repeat(100);

      // Act
      const result = trimErrorMessage(message, 50);

      // Assert
      expect(result.length).toBe(50);
    });
  });

  describe("buildDiagnosticContext", () => {
    it("全てのコンテキスト情報を含む", () => {
      // Arrange & Act
      const result = buildDiagnosticContext({
        provider: "openai",
        model: "gpt-4",
        retries: 3,
        lastStatusCode: 429,
        lastRetryMessage: "Rate limit exceeded",
        rateLimitWaitMs: 1000,
        rateLimitHits: 5,
        gateWaitMs: 500,
        gateHits: 2,
      });

      // Assert
      expect(result).toContain("provider=openai");
      expect(result).toContain("model=gpt-4");
      expect(result).toContain("retries=3");
      expect(result).toContain("last_status=429");
      expect(result).toContain("gate_wait_ms=500");
      expect(result).toContain("gate_hits=2");
    });

    it("未指定のフィールドは含まない", () => {
      // Arrange & Act
      const result = buildDiagnosticContext({
        provider: "anthropic",
      });

      // Assert
      expect(result).toBe("provider=anthropic");
    });

    it("ゼロ値の待機時間は含まない", () => {
      // Arrange & Act
      const result = buildDiagnosticContext({
        rateLimitWaitMs: 0,
        rateLimitHits: 0,
      });

      // Assert
      expect(result).not.toContain("last_gate_wait_ms");
      expect(result).not.toContain("last_gate_hits");
    });
  });

  describe("classifyFailureType", () => {
    it("HTTP 429はrate_limit", () => {
      // Arrange & Act
      const result = classifyFailureType(new Error("Error"), 429);

      // Assert
      expect(result).toBe("rate_limit");
    });

    it("タイムアウトメッセージはtimeout", () => {
      // Arrange & Act
      const result = classifyFailureType(new Error("Request timed out"));

      // Assert
      expect(result).toBe("timeout");
    });

    it("空出力はquality", () => {
      // Arrange & Act
      const result = classifyFailureType(new Error("Empty output from subagent"));

      // Assert
      expect(result).toBe("quality");
    });

    it("ネットワークエラーはpermanent（ECONNREFUSEDはtransientパターンに含まれない）", () => {
      // Arrange & Act
      const result = classifyFailureType(new Error("ECONNREFUSED"));

      // Assert - ECONNREFUSEDはclassifyFailureTypeのtransientパターンに含まれないためpermanent
      expect(result).toBe("permanent");
    });

    it("キャンセルはpermanent", () => {
      // Arrange & Act
      const result = classifyFailureType(new Error("Operation was cancelled"));

      // Assert
      expect(result).toBe("permanent");
    });
  });

  describe("RETRY_POLICY", () => {
    it("rate_limitは再試行不可", () => {
      // Assert
      expect(RETRY_POLICY.rate_limit.retryable).toBe(false);
    });

    it("timeoutは再試行可能", () => {
      // Assert
      expect(RETRY_POLICY.timeout.retryable).toBe(true);
      expect(RETRY_POLICY.timeout.maxRounds).toBe(2);
    });

    it("permanentは再試行不可", () => {
      // Assert
      expect(RETRY_POLICY.permanent.retryable).toBe(false);
    });
  });

  describe("getRetryablePatterns / resetRetryablePatternsCache / addRetryablePatterns", () => {
    beforeEach(() => {
      resetRetryablePatternsCache();
    });

    afterEach(() => {
      resetRetryablePatternsCache();
    });

    it("デフォルトパターンを取得できる", () => {
      // Arrange & Act
      const patterns = getRetryablePatterns();

      // Assert
      expect(patterns).toContain("rate limit");
      expect(patterns).toContain("timeout");
      expect(patterns).toContain("network");
    });

    it("パターンを追加できる", () => {
      // Arrange
      addRetryablePatterns(["custom_error"]);

      // Act
      const patterns = getRetryablePatterns();

      // Assert
      expect(patterns).toContain("custom_error");
    });

    it("キャッシュをリセットできる", () => {
      // Arrange
      addRetryablePatterns(["temp_pattern"]);
      resetRetryablePatternsCache();

      // Act
      const patterns = getRetryablePatterns();

      // Assert
      expect(patterns).not.toContain("temp_pattern");
    });
  });
});
