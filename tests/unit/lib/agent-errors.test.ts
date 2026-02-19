/**
 * agent-errors.ts 単体テスト
 * カバレッジ: ExtendedOutcomeCode, classifySemanticError, resolveExtendedFailureOutcome,
 * getRetryablePatterns, isRetryableEntityError, resolveFailureOutcome,
 * resolveAggregateOutcome, trimErrorMessage, buildDiagnosticContext,
 * classifyFailureType, shouldRetryByClassification
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import * as fc from "fast-check";
import {
  classifySemanticError,
  resolveExtendedFailureOutcome,
  getRetryablePatterns,
  resetRetryablePatternsCache,
  addRetryablePatterns,
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
  shouldRetryByClassification,
  RETRY_POLICY,
  type EntityResultItem,
} from "../../../.pi/lib/agent-errors.js";
import { SUBAGENT_CONFIG, TEAM_MEMBER_CONFIG } from "../../../.pi/lib/agent-common.js";

// ============================================================================
// classifySemanticError テスト
// ============================================================================

describe("classifySemanticError", () => {
  describe("SCHEMA_VIOLATION", () => {
    it("schema violation含む_検出する", () => {
      const error = new Error("Schema violation detected");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("SCHEMA_VIOLATION");
      expect(result.details).toContain("output_format_mismatch");
    });

    it("missing labels含む_検出する", () => {
      const error = new Error("Missing labels in output");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("SCHEMA_VIOLATION");
    });

    it("validation failed含む_検出する", () => {
      const error = new Error("Validation failed");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("SCHEMA_VIOLATION");
    });

    it("出力にschema violation含む_検出する", () => {
      const result = classifySemanticError("output has schema violation", undefined);
      expect(result.code).toBe("SCHEMA_VIOLATION");
    });
  });

  describe("LOW_SUBSTANCE", () => {
    it("intent-only含む_検出する", () => {
      const error = new Error("intent-only output");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("LOW_SUBSTANCE");
      expect(result.details).toContain("intent_only_output");
    });

    it("low-substance含む_検出する", () => {
      const error = new Error("low-substance content");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("LOW_SUBSTANCE");
    });

    it("insufficient content含む_検出する", () => {
      const error = new Error("insufficient content");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("LOW_SUBSTANCE");
    });
  });

  describe("EMPTY_OUTPUT", () => {
    it("empty output含む_検出する", () => {
      const error = new Error("empty output received");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("EMPTY_OUTPUT");
      expect(result.details).toContain("no_content");
    });

    it("empty result含む_検出する", () => {
      const error = new Error("empty result");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("EMPTY_OUTPUT");
    });

    it("出力が空_検出する", () => {
      const result = classifySemanticError("", undefined);
      expect(result.code).toBe("EMPTY_OUTPUT");
    });

    it("出力が空白のみ_検出する", () => {
      const result = classifySemanticError("   \n\t  ", undefined);
      expect(result.code).toBe("EMPTY_OUTPUT");
    });
  });

  describe("PARSE_ERROR", () => {
    it("parse error含む_検出する", () => {
      const error = new Error("parse error in response");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("PARSE_ERROR");
      expect(result.details).toContain("parsing_failed");
    });

    it("json parse含む_検出する", () => {
      const error = new Error("json parse failed");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("PARSE_ERROR");
    });

    it("syntax error含む_検出する", () => {
      const error = new Error("syntax error");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("PARSE_ERROR");
    });

    it("unexpected token含む_検出する", () => {
      const error = new Error("unexpected token");
      const result = classifySemanticError("output", error);
      expect(result.code).toBe("PARSE_ERROR");
    });
  });

  describe("分類なし", () => {
    it("該当しないエラー_nullを返す", () => {
      const error = new Error("unknown error type");
      const result = classifySemanticError("output", error);
      expect(result.code).toBeNull();
    });

    it("エラーなし_出力あり_nullを返す", () => {
      const result = classifySemanticError("valid output", undefined);
      expect(result.code).toBeNull();
    });
  });
});

// ============================================================================
// resolveExtendedFailureOutcome テスト
// ============================================================================

describe("resolveExtendedFailureOutcome", () => {
  describe("意味論的エラー", () => {
    it("SCHEMA_VIOLATION_retryableを返す", () => {
      const error = new Error("schema violation");
      const result = resolveExtendedFailureOutcome(error, "output", SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("SCHEMA_VIOLATION");
      expect(result.retryRecommended).toBe(true);
    });

    it("LOW_SUBSTANCE_retryableを返す", () => {
      const error = new Error("low-substance output");
      const result = resolveExtendedFailureOutcome(error, "output", SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("LOW_SUBSTANCE");
      expect(result.retryRecommended).toBe(true);
    });

    it("EMPTY_OUTPUT_non-retryableを返す", () => {
      const error = new Error("empty output");
      const result = resolveExtendedFailureOutcome(error, "", SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("EMPTY_OUTPUT");
      expect(result.retryRecommended).toBe(false);
    });

    it("PARSE_ERROR_non-retryableを返す", () => {
      const error = new Error("parse error");
      const result = resolveExtendedFailureOutcome(error, "output", SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("PARSE_ERROR");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("標準エラーへのフォールバック", () => {
    it("未知のエラー_標準分類を使用", () => {
      const error = new Error("unknown error");
      const result = resolveExtendedFailureOutcome(error, "output", SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
    });

    it("タイムアウト_再試行可能", () => {
      const error = new Error("operation timed out");
      const result = resolveExtendedFailureOutcome(error, "output", SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });
  });
});

// ============================================================================
// Retryable Patterns テスト
// ============================================================================

describe("getRetryablePatterns", () => {
  beforeEach(() => {
    resetRetryablePatternsCache();
  });

  afterEach(() => {
    resetRetryablePatternsCache();
  });

  it("デフォルトパターンを返す", () => {
    const patterns = getRetryablePatterns();
    expect(patterns).toContain("rate limit");
    expect(patterns).toContain("too many requests");
    expect(patterns).toContain("temporarily unavailable");
    expect(patterns).toContain("service unavailable");
    expect(patterns).toContain("try again");
  });

  it("キャッシュされる", () => {
    const patterns1 = getRetryablePatterns();
    const patterns2 = getRetryablePatterns();
    expect(patterns1).toBe(patterns2);
  });
});

describe("resetRetryablePatternsCache", () => {
  it("キャッシュをクリアする", () => {
    getRetryablePatterns();
    resetRetryablePatternsCache();
    // キャッシュがクリアされたことを確認するには、
    // 環境変数を変更して再度取得する必要がある
    expect(() => resetRetryablePatternsCache()).not.toThrow();
  });
});

describe("addRetryablePatterns", () => {
  beforeEach(() => {
    resetRetryablePatternsCache();
  });

  afterEach(() => {
    resetRetryablePatternsCache();
  });

  it("新しいパターンを追加する", () => {
    addRetryablePatterns(["custom error"]);
    const patterns = getRetryablePatterns();
    expect(patterns).toContain("custom error");
  });

  it("複数のパターンを追加する", () => {
    addRetryablePatterns(["error1", "error2"]);
    const patterns = getRetryablePatterns();
    expect(patterns).toContain("error1");
    expect(patterns).toContain("error2");
  });

  it("重複パターンは追加しない", () => {
    addRetryablePatterns(["rate limit"]);
    const patterns = getRetryablePatterns();
    const rateLimitCount = patterns.filter(p => p === "rate limit").length;
    expect(rateLimitCount).toBe(1);
  });

  it("空パターンは無視する", () => {
    const patternsBefore = getRetryablePatterns().length;
    addRetryablePatterns(["", "  "]);
    const patternsAfter = getRetryablePatterns().length;
    expect(patternsAfter).toBe(patternsBefore);
  });
});

// ============================================================================
// isRetryableEntityError テスト
// ============================================================================

describe("isRetryableEntityError", () => {
  describe("ステータスコードベース", () => {
    it("429_retryable", () => {
      expect(isRetryableEntityError(new Error("error"), 429, SUBAGENT_CONFIG)).toBe(true);
    });

    it("500_retryable", () => {
      expect(isRetryableEntityError(new Error("error"), 500, SUBAGENT_CONFIG)).toBe(true);
    });

    it("503_retryable", () => {
      expect(isRetryableEntityError(new Error("error"), 503, SUBAGENT_CONFIG)).toBe(true);
    });

    it("400_non-retryable", () => {
      expect(isRetryableEntityError(new Error("error"), 400, SUBAGENT_CONFIG)).toBe(false);
    });

    it("404_non-retryable", () => {
      expect(isRetryableEntityError(new Error("error"), 404, SUBAGENT_CONFIG)).toBe(false);
    });
  });

  describe("エンティティ固有", () => {
    it("empty output message_retryable", () => {
      const error = new Error("subagent returned empty output");
      expect(isRetryableEntityError(error, undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("チームメンバーempty output_retryable", () => {
      const error = new Error("agent team member returned empty output");
      expect(isRetryableEntityError(error, undefined, TEAM_MEMBER_CONFIG)).toBe(true);
    });
  });

  describe("パターンベース", () => {
    it("rate limit_retryable", () => {
      expect(isRetryableEntityError(new Error("rate limit exceeded"), undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("too many requests_retryable", () => {
      expect(isRetryableEntityError(new Error("too many requests"), undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("service unavailable_retryable", () => {
      expect(isRetryableEntityError(new Error("service unavailable"), undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("try again_retryable", () => {
      expect(isRetryableEntityError(new Error("please try again"), undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("overloaded_retryable", () => {
      expect(isRetryableEntityError(new Error("system overloaded"), undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("capacity exceeded_retryable", () => {
      expect(isRetryableEntityError(new Error("capacity exceeded"), undefined, SUBAGENT_CONFIG)).toBe(true);
    });

    it("unknown error_non-retryable", () => {
      expect(isRetryableEntityError(new Error("unknown error"), undefined, SUBAGENT_CONFIG)).toBe(false);
    });
  });
});

// ============================================================================
// isRetryableSubagentError / isRetryableTeamMemberError テスト
// ============================================================================

describe("isRetryableSubagentError", () => {
  it("429_retryable", () => {
    expect(isRetryableSubagentError(new Error("error"), 429)).toBe(true);
  });

  it("400_non-retryable", () => {
    expect(isRetryableSubagentError(new Error("error"), 400)).toBe(false);
  });

  it("empty output_retryable", () => {
    expect(isRetryableSubagentError(new Error("subagent returned empty output"))).toBe(true);
  });
});

describe("isRetryableTeamMemberError", () => {
  it("429_retryable", () => {
    expect(isRetryableTeamMemberError(new Error("error"), 429)).toBe(true);
  });

  it("400_non-retryable", () => {
    expect(isRetryableTeamMemberError(new Error("error"), 400)).toBe(false);
  });

  it("empty output_retryable", () => {
    expect(isRetryableTeamMemberError(new Error("agent team member returned empty output"))).toBe(true);
  });
});

// ============================================================================
// resolveFailureOutcome テスト
// ============================================================================

describe("resolveFailureOutcome", () => {
  describe("キャンセル", () => {
    it("キャンセルエラー_non-retryable", () => {
      const result = resolveFailureOutcome(new Error("operation was cancelled"), SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("CANCELLED");
      expect(result.retryRecommended).toBe(false);
    });
  });

  describe("タイムアウト", () => {
    it("タイムアウトエラー_retryable", () => {
      const result = resolveFailureOutcome(new Error("operation timed out"), SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("TIMEOUT");
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe("プレッシャーエラー", () => {
    it("rate limit_retryable", () => {
      const result = resolveFailureOutcome(new Error("rate limit exceeded"), SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });

    it("capacity_retryable", () => {
      const result = resolveFailureOutcome(new Error("capacity pressure"), SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });
  });

  describe("その他のエラー", () => {
    it("unknown error_設定なし_non-retryable", () => {
      const result = resolveFailureOutcome(new Error("unknown error"));
      expect(result.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(false);
    });

    it("empty output_設定あり_retryable", () => {
      const result = resolveFailureOutcome(new Error("subagent returned empty output"), SUBAGENT_CONFIG);
      expect(result.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(result.retryRecommended).toBe(true);
    });
  });
});

// ============================================================================
// resolveSubagentFailureOutcome / resolveTeamFailureOutcome テスト
// ============================================================================

describe("resolveSubagentFailureOutcome", () => {
  it("タイムアウト_retryable", () => {
    const result = resolveSubagentFailureOutcome(new Error("timed out"));
    expect(result.outcomeCode).toBe("TIMEOUT");
    expect(result.retryRecommended).toBe(true);
  });
});

describe("resolveTeamFailureOutcome", () => {
  it("タイムアウト_retryable", () => {
    const result = resolveTeamFailureOutcome(new Error("timed out"));
    expect(result.outcomeCode).toBe("TIMEOUT");
    expect(result.retryRecommended).toBe(true);
  });
});

// ============================================================================
// resolveAggregateOutcome テスト
// ============================================================================

describe("resolveAggregateOutcome", () => {
  const mockResolve = (error: unknown) => {
    const msg = String(error).toLowerCase();
    if (msg.includes("retryable")) {
      return { outcomeCode: "RETRYABLE_FAILURE" as const, retryRecommended: true };
    }
    return { outcomeCode: "NONRETRYABLE_FAILURE" as const, retryRecommended: false };
  };

  describe("全成功", () => {
    it("全完了_SUCCESS", () => {
      const results: EntityResultItem[] = [
        { status: "completed", entityId: "1" },
        { status: "completed", entityId: "2" },
      ];

      const outcome = resolveAggregateOutcome(results, mockResolve);

      expect(outcome.outcomeCode).toBe("SUCCESS");
      expect(outcome.failedEntityIds).toEqual([]);
    });
  });

  describe("一部失敗", () => {
    it("一部完了_PARTIAL_SUCCESS", () => {
      const results: EntityResultItem[] = [
        { status: "completed", entityId: "1" },
        { status: "failed", error: "error", entityId: "2" },
      ];

      const outcome = resolveAggregateOutcome(results, mockResolve);

      expect(outcome.outcomeCode).toBe("PARTIAL_SUCCESS");
      expect(outcome.failedEntityIds).toEqual(["2"]);
    });
  });

  describe("全失敗", () => {
    it("全失敗_retryable_RETRYABLE_FAILURE", () => {
      const results: EntityResultItem[] = [
        { status: "failed", error: "retryable error", entityId: "1" },
        { status: "failed", error: "retryable error", entityId: "2" },
      ];

      const outcome = resolveAggregateOutcome(results, mockResolve);

      expect(outcome.outcomeCode).toBe("RETRYABLE_FAILURE");
      expect(outcome.retryRecommended).toBe(true);
    });

    it("全失敗_non-retryable_NONRETRYABLE_FAILURE", () => {
      const results: EntityResultItem[] = [
        { status: "failed", error: "permanent error", entityId: "1" },
        { status: "failed", error: "permanent error", entityId: "2" },
      ];

      const outcome = resolveAggregateOutcome(results, mockResolve);

      expect(outcome.outcomeCode).toBe("NONRETRYABLE_FAILURE");
      expect(outcome.retryRecommended).toBe(false);
    });
  });
});

// ============================================================================
// resolveSubagentParallelOutcome テスト
// ============================================================================

describe("resolveSubagentParallelOutcome", () => {
  it("全成功_SUCCESS", () => {
    const results = [
      { runRecord: { status: "completed" as const, agentId: "agent-1" } },
      { runRecord: { status: "completed" as const, agentId: "agent-2" } },
    ];

    const outcome = resolveSubagentParallelOutcome(results);

    expect(outcome.outcomeCode).toBe("SUCCESS");
    expect(outcome.failedSubagentIds).toEqual([]);
  });

  it("一部失敗_PARTIAL_SUCCESS", () => {
    const results = [
      { runRecord: { status: "completed" as const, agentId: "agent-1" } },
      { runRecord: { status: "failed" as const, error: "error", agentId: "agent-2" } },
    ];

    const outcome = resolveSubagentParallelOutcome(results);

    expect(outcome.outcomeCode).toBe("PARTIAL_SUCCESS");
    expect(outcome.failedSubagentIds).toEqual(["agent-2"]);
  });
});

// ============================================================================
// resolveTeamMemberAggregateOutcome テスト
// ============================================================================

describe("resolveTeamMemberAggregateOutcome", () => {
  it("全成功_SUCCESS", () => {
    const results = [
      { status: "completed" as const, memberId: "member-1" },
      { status: "completed" as const, memberId: "member-2" },
    ];

    const outcome = resolveTeamMemberAggregateOutcome(results);

    expect(outcome.outcomeCode).toBe("SUCCESS");
    expect(outcome.failedMemberIds).toEqual([]);
  });

  it("一部失敗_PARTIAL_SUCCESS", () => {
    const results = [
      { status: "completed" as const, memberId: "member-1" },
      { status: "failed" as const, error: "error", memberId: "member-2" },
    ];

    const outcome = resolveTeamMemberAggregateOutcome(results);

    expect(outcome.outcomeCode).toBe("PARTIAL_SUCCESS");
    expect(outcome.failedMemberIds).toEqual(["member-2"]);
  });
});

// ============================================================================
// trimErrorMessage テスト
// ============================================================================

describe("trimErrorMessage", () => {
  it("短いメッセージ_そのまま返す", () => {
    expect(trimErrorMessage("short message")).toBe("short message");
  });

  it("長いメッセージ_切り詰める", () => {
    const longMsg = "x".repeat(250);
    const result = trimErrorMessage(longMsg);
    expect(result.length).toBe(200); // maxLength - 3 + "..." = maxLength
    expect(result.endsWith("...")).toBe(true);
  });

  it("カスタムmaxLength", () => {
    const msg = "x".repeat(100);
    const result = trimErrorMessage(msg, 50);
    expect(result.length).toBe(50); // maxLength - 3 + "..." = maxLength
  });

  it("maxLengthちょうど_そのまま返す", () => {
    const msg = "x".repeat(200);
    expect(trimErrorMessage(msg)).toBe(msg);
  });
});

// ============================================================================
// buildDiagnosticContext テスト
// ============================================================================

describe("buildDiagnosticContext", () => {
  it("空コンテキスト_空文字を返す", () => {
    expect(buildDiagnosticContext({})).toBe("");
  });

  it("provider含む", () => {
    const result = buildDiagnosticContext({ provider: "anthropic" });
    expect(result).toBe("provider=anthropic");
  });

  it("複数フィールド含む", () => {
    const result = buildDiagnosticContext({
      provider: "anthropic",
      model: "claude-3",
      retries: 3,
    });
    expect(result).toContain("provider=anthropic");
    expect(result).toContain("model=claude-3");
    expect(result).toContain("retries=3");
  });

  it("rate limit情報含む", () => {
    const result = buildDiagnosticContext({
      rateLimitWaitMs: 1000,
      rateLimitHits: 5,
    });
    expect(result).toContain("last_gate_wait_ms=1000");
    expect(result).toContain("last_gate_hits=5");
  });

  it("長いエラーメッセージ_切り詰め", () => {
    const longMsg = "x".repeat(100);
    const result = buildDiagnosticContext({ lastRetryMessage: longMsg });
    expect(result).toContain("last_retry_error=");
    // 60文字 + "..."に切り詰められる
    expect(result.length).toBeLessThan(100);
  });

  it("gate情報含む", () => {
    const result = buildDiagnosticContext({
      gateWaitMs: 500,
      gateHits: 2,
    });
    expect(result).toContain("gate_wait_ms=500");
    expect(result).toContain("gate_hits=2");
  });
});

// ============================================================================
// classifyFailureType テスト
// ============================================================================

describe("classifyFailureType", () => {
  describe("rate_limit", () => {
    it("429ステータス", () => {
      expect(classifyFailureType(new Error("error"), 429)).toBe("rate_limit");
    });

    it("rate limitメッセージ", () => {
      expect(classifyFailureType(new Error("rate limit exceeded"))).toBe("rate_limit");
    });

    it("too many requestsメッセージ", () => {
      expect(classifyFailureType(new Error("too many requests"))).toBe("rate_limit");
    });
  });

  describe("capacity", () => {
    it("capacity exceeded", () => {
      expect(classifyFailureType(new Error("capacity exceeded"))).toBe("capacity");
    });

    it("overloaded", () => {
      expect(classifyFailureType(new Error("system overloaded"))).toBe("capacity");
    });

    it("resource unavailable", () => {
      expect(classifyFailureType(new Error("resource unavailable"))).toBe("capacity");
    });
  });

  describe("timeout", () => {
    it("timeout", () => {
      expect(classifyFailureType(new Error("timeout"))).toBe("timeout");
    });

    it("timed out", () => {
      expect(classifyFailureType(new Error("timed out"))).toBe("timeout");
    });
  });

  describe("quality", () => {
    it("empty output", () => {
      expect(classifyFailureType(new Error("empty output"))).toBe("quality");
    });

    it("low-substance", () => {
      expect(classifyFailureType(new Error("low-substance"))).toBe("quality");
    });

    it("intent-only", () => {
      expect(classifyFailureType(new Error("intent-only"))).toBe("quality");
    });
  });

  describe("transient", () => {
    it("temporarily unavailable", () => {
      expect(classifyFailureType(new Error("temporarily unavailable"))).toBe("transient");
    });

    it("try again", () => {
      expect(classifyFailureType(new Error("try again"))).toBe("transient");
    });

    it("service unavailable", () => {
      expect(classifyFailureType(new Error("service unavailable"))).toBe("transient");
    });
  });

  describe("permanent", () => {
    it("unknown error", () => {
      expect(classifyFailureType(new Error("unknown error"))).toBe("permanent");
    });

    it("400ステータス", () => {
      expect(classifyFailureType(new Error("bad request"), 400)).toBe("permanent");
    });
  });
});

// ============================================================================
// shouldRetryByClassification テスト
// ============================================================================

describe("shouldRetryByClassification", () => {
  describe("RETRY_POLICY", () => {
    it("rate_limit_retryable=false", () => {
      expect(RETRY_POLICY.rate_limit.retryable).toBe(false);
    });

    it("capacity_retryable=false", () => {
      expect(RETRY_POLICY.capacity.retryable).toBe(false);
    });

    it("timeout_retryable=true", () => {
      expect(RETRY_POLICY.timeout.retryable).toBe(true);
      expect(RETRY_POLICY.timeout.maxRounds).toBe(2);
    });

    it("quality_retryable=true", () => {
      expect(RETRY_POLICY.quality.retryable).toBe(true);
    });

    it("transient_retryable=true", () => {
      expect(RETRY_POLICY.transient.retryable).toBe(true);
    });

    it("permanent_retryable=false", () => {
      expect(RETRY_POLICY.permanent.retryable).toBe(false);
    });
  });

  describe("shouldRetryByClassification", () => {
    it("non-retryable分類_false", () => {
      expect(shouldRetryByClassification("rate_limit", 0)).toBe(false);
      expect(shouldRetryByClassification("capacity", 0)).toBe(false);
      expect(shouldRetryByClassification("permanent", 0)).toBe(false);
    });

    it("retryable分類_round制限内_true", () => {
      expect(shouldRetryByClassification("timeout", 0)).toBe(true);
      expect(shouldRetryByClassification("timeout", 1)).toBe(true);
    });

    it("retryable分類_round制限超過_false", () => {
      expect(shouldRetryByClassification("timeout", 2)).toBe(false);
      expect(shouldRetryByClassification("timeout", 3)).toBe(false);
    });

    it("quality_round制限内_true", () => {
      expect(shouldRetryByClassification("quality", 0)).toBe(true);
      expect(shouldRetryByClassification("quality", 1)).toBe(true);
      expect(shouldRetryByClassification("quality", 2)).toBe(false);
    });

    it("transient_round制限内_true", () => {
      expect(shouldRetryByClassification("transient", 0)).toBe(true);
    });
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  describe("classifySemanticError", () => {
    it("任意の入力_codeまたはnullを返す", () => {
      fc.assert(
        fc.property(
          fc.option(fc.string(), { nil: undefined }),
          fc.option(fc.string().map(s => new Error(s)), { nil: undefined }),
          (output, error) => {
            const result = classifySemanticError(output, error);
            if (result.code !== null) {
              expect(["SCHEMA_VIOLATION", "LOW_SUBSTANCE", "EMPTY_OUTPUT", "PARSE_ERROR"]).toContain(result.code);
            }
          }
        )
      );
    });
  });

  describe("trimErrorMessage", () => {
    it("任意の入力_指定長以下を返す", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 500 }),
          fc.integer({ min: 10, max: 500 }),
          (message, maxLength) => {
            const result = trimErrorMessage(message, maxLength);
            expect(result.length).toBeLessThanOrEqual(maxLength + 3);
          }
        )
      );
    });
  });

  describe("buildDiagnosticContext", () => {
    it("任意のコンテキスト_文字列を返す", () => {
      fc.assert(
        fc.property(
          fc.record({
            provider: fc.option(fc.string()),
            model: fc.option(fc.string()),
            retries: fc.option(fc.integer({ min: 0, max: 100 })),
            lastStatusCode: fc.option(fc.integer({ min: 100, max: 599 })),
          }),
          (context) => {
            const result = buildDiagnosticContext(context);
            expect(typeof result).toBe("string");
          }
        )
      );
    });
  });

  describe("classifyFailureType", () => {
    it("任意のエラー_有効な分類を返す", () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.option(fc.integer({ min: 100, max: 599 })),
          (errorMsg, statusCode) => {
            const result = classifyFailureType(new Error(errorMsg), statusCode ?? undefined);
            expect(["rate_limit", "capacity", "timeout", "quality", "transient", "permanent"]).toContain(result);
          }
        )
      );
    });
  });
});
