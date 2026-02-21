/**
 * @file .pi/lib/agent.ts の単体テスト
 * @description エージェント関連ユーティリティのバレルエクスポート統合テスト
 * @testFramework vitest
 *
 * カバレッジ対象:
 * - エージェント型定義と定数の再エクスポート確認
 * - ID生成、ウィンドウ計算などのユーティリティ関数の統合テスト
 * - タイムアウト計算、ペナルティ制御の統合テスト
 * - 出力検証関数の統合テスト
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

// agent.tsから全てのエクスポートをインポート
import {
  // Agent types
  type ThinkingLevel,
  type RunOutcomeCode,
  type RunOutcomeSignal,
  DEFAULT_AGENT_TIMEOUT_MS,

  // Agent utilities
  createRunId,
  computeLiveWindow,

  // Agent common constants and utilities
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS,
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
  type EntityType,
  type EntityConfig,
  SUBAGENT_CONFIG,
  TEAM_MEMBER_CONFIG,
  type NormalizedEntityOutput,
  type PickFieldCandidateOptions,
  pickFieldCandidate,
  pickSummaryCandidate,
  pickClaimCandidate,
  type NormalizeEntityOutputOptions,
  normalizeEntityOutput,
  isEmptyOutputFailureMessage,
  buildFailureSummary,
  resolveTimeoutWithEnv,

  // Model timeout utilities
  MODEL_TIMEOUT_BASE_MS,
  THINKING_LEVEL_MULTIPLIERS,
  getModelBaseTimeoutMs,
  computeModelTimeoutMs,
  computeProgressiveTimeoutMs,
  type ComputeModelTimeoutOptions,

  // Adaptive penalty controller
  createAdaptivePenaltyController,
  type AdaptivePenaltyState,
  type AdaptivePenaltyOptions,
  type AdaptivePenaltyController,

  // Output validation utilities
  hasNonEmptyResultSection,
  validateSubagentOutput,
  validateTeamMemberOutput,
  type SubagentValidationOptions,
  type TeamMemberValidationOptions,
} from "../../../.pi/lib/agent.js";

// ============================================================================
// バレルエクスポート確認テスト
// ============================================================================

describe("agent.ts バレルエクスポート確認", () => {
  describe("エージェント型定数のエクスポート", () => {
    it("DEFAULT_AGENT_TIMEOUT_MSが正しい値", () => {
      expect(DEFAULT_AGENT_TIMEOUT_MS).toBe(10 * 60 * 1000); // 10分
    });
  });

  describe("エージェントユーティリティのエクスポート", () => {
    it("createRunIdが関数としてエクスポートされる", () => {
      expect(typeof createRunId).toBe("function");
    });

    it("computeLiveWindowが関数としてエクスポートされる", () => {
      expect(typeof computeLiveWindow).toBe("function");
    });
  });

  describe("エージェント共通定数のエクスポート", () => {
    it("STABLE_RUNTIME_PROFILEがブール値", () => {
      expect(typeof STABLE_RUNTIME_PROFILE).toBe("boolean");
    });

    it("ADAPTIVE_PARALLEL_MAX_PENALTYが数値", () => {
      expect(typeof ADAPTIVE_PARALLEL_MAX_PENALTY).toBe("number");
      expect(ADAPTIVE_PARALLEL_MAX_PENALTY).toBeGreaterThanOrEqual(0);
    });

    it("ADAPTIVE_PARALLEL_DECAY_MSが数値", () => {
      expect(typeof ADAPTIVE_PARALLEL_DECAY_MS).toBe("number");
      expect(ADAPTIVE_PARALLEL_DECAY_MS).toBeGreaterThan(0);
    });

    it("リトライ関連定数が正しい型", () => {
      expect(typeof STABLE_MAX_RETRIES).toBe("number");
      expect(typeof STABLE_INITIAL_DELAY_MS).toBe("number");
      expect(typeof STABLE_MAX_DELAY_MS).toBe("number");
      expect(typeof STABLE_MAX_RATE_LIMIT_RETRIES).toBe("number");
      expect(typeof STABLE_MAX_RATE_LIMIT_WAIT_MS).toBe("number");
    });

    it("SUBAGENT_CONFIGが正しい構造", () => {
      expect(SUBAGENT_CONFIG.type).toBe("subagent");
      expect(typeof SUBAGENT_CONFIG.label).toBe("string");
      expect(typeof SUBAGENT_CONFIG.emptyOutputMessage).toBe("string");
      expect(typeof SUBAGENT_CONFIG.defaultSummaryFallback).toBe("string");
    });

    it("TEAM_MEMBER_CONFIGが正しい構造", () => {
      expect(TEAM_MEMBER_CONFIG.type).toBe("team-member");
      expect(typeof TEAM_MEMBER_CONFIG.label).toBe("string");
      expect(typeof TEAM_MEMBER_CONFIG.emptyOutputMessage).toBe("string");
      expect(typeof TEAM_MEMBER_CONFIG.defaultSummaryFallback).toBe("string");
    });
  });

  describe("モデルタイムアウト定数のエクスポート", () => {
    it("MODEL_TIMEOUT_BASE_MSがオブジェクト", () => {
      expect(typeof MODEL_TIMEOUT_BASE_MS).toBe("object");
      expect(MODEL_TIMEOUT_BASE_MS).toHaveProperty("default");
    });

    it("THINKING_LEVEL_MULTIPLIERSがオブジェクト", () => {
      expect(typeof THINKING_LEVEL_MULTIPLIERS).toBe("object");
      expect(THINKING_LEVEL_MULTIPLIERS).toHaveProperty("medium");
    });

    it("getModelBaseTimeoutMsが関数", () => {
      expect(typeof getModelBaseTimeoutMs).toBe("function");
    });

    it("computeModelTimeoutMsが関数", () => {
      expect(typeof computeModelTimeoutMs).toBe("function");
    });

    it("computeProgressiveTimeoutMsが関数", () => {
      expect(typeof computeProgressiveTimeoutMs).toBe("function");
    });
  });

  describe("アダプティブペナルティのエクスポート", () => {
    it("createAdaptivePenaltyControllerが関数", () => {
      expect(typeof createAdaptivePenaltyController).toBe("function");
    });
  });

  describe("出力検証のエクスポート", () => {
    it("hasNonEmptyResultSectionが関数", () => {
      expect(typeof hasNonEmptyResultSection).toBe("function");
    });

    it("validateSubagentOutputが関数", () => {
      expect(typeof validateSubagentOutput).toBe("function");
    });

    it("validateTeamMemberOutputが関数", () => {
      expect(typeof validateTeamMemberOutput).toBe("function");
    });
  });

  describe("エージェント共通ユーティリティのエクスポート", () => {
    it("pickFieldCandidateが関数", () => {
      expect(typeof pickFieldCandidate).toBe("function");
    });

    it("pickSummaryCandidateが関数", () => {
      expect(typeof pickSummaryCandidate).toBe("function");
    });

    it("pickClaimCandidateが関数", () => {
      expect(typeof pickClaimCandidate).toBe("function");
    });

    it("normalizeEntityOutputが関数", () => {
      expect(typeof normalizeEntityOutput).toBe("function");
    });

    it("isEmptyOutputFailureMessageが関数", () => {
      expect(typeof isEmptyOutputFailureMessage).toBe("function");
    });

    it("buildFailureSummaryが関数", () => {
      expect(typeof buildFailureSummary).toBe("function");
    });

    it("resolveTimeoutWithEnvが関数", () => {
      expect(typeof resolveTimeoutWithEnv).toBe("function");
    });
  });
});

// ============================================================================
// createRunId 統合テスト
// ============================================================================

describe("createRunId 統合テスト", () => {
  it("一意なIDを生成する", () => {
    const id1 = createRunId();
    const id2 = createRunId();
    expect(id1).not.toBe(id2);
  });

  it("正しい形式を持つ (YYYY-MM-DD-HH-MM-SS-xxxxxx)", () => {
    const id = createRunId();
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[a-f0-9]{6}$/);
  });

  it("100回生成で全て一意", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createRunId());
    }
    expect(ids.size).toBe(100);
  });
});

// ============================================================================
// computeLiveWindow 統合テスト
// ============================================================================

describe("computeLiveWindow 統合テスト", () => {
  it("total <= maxRows_全範囲を返す", () => {
    const result = computeLiveWindow(0, 10, 20);
    expect(result).toEqual({ start: 0, end: 10 });
  });

  it("total > maxRows_ウィンドウを返す", () => {
    const result = computeLiveWindow(5, 20, 10);
    expect(result.end - result.start).toBe(10);
  });

  it("start >= 0 の不変条件", () => {
    const result = computeLiveWindow(-5, 20, 10);
    expect(result.start).toBeGreaterThanOrEqual(0);
  });

  it("end <= total の不変条件", () => {
    const result = computeLiveWindow(100, 20, 10);
    expect(result.end).toBeLessThanOrEqual(20);
  });
});

// ============================================================================
// モデルタイムアウト 統合テスト
// ============================================================================

describe("モデルタイムアウト 統合テスト", () => {
  describe("getModelBaseTimeoutMs", () => {
    it("既知のモデルの基本タイムアウトを返す", () => {
      const timeout = getModelBaseTimeoutMs("claude-3-5-sonnet");
      expect(timeout).toBe(300_000);
    });

    it("未知のモデルはデフォルト値を返す", () => {
      const timeout = getModelBaseTimeoutMs("unknown-model");
      expect(timeout).toBe(MODEL_TIMEOUT_BASE_MS.default);
    });

    it("正確なモデル名でgpt-4o-miniを特定する", () => {
      const timeout = getModelBaseTimeoutMs("gpt-4o-mini");
      expect(timeout).toBe(120_000);
    });

    it("部分一致ではgpt-4がgpt-4o-miniより先にマッチする", () => {
      // "gpt-4o-mini-2024"には"gpt-4"も含まれるため、gpt-4のタイムアウトが返る
      const timeout = getModelBaseTimeoutMs("gpt-4o-mini-2024");
      expect(timeout).toBe(300_000); // gpt-4のタイムアウト
    });
  });

  describe("computeModelTimeoutMs", () => {
    it("ユーザー指定タイムアウトが優先される", () => {
      const timeout = computeModelTimeoutMs("claude-3-5-sonnet", {
        userTimeoutMs: 60000,
      });
      expect(timeout).toBe(60000);
    });

    it("思考レベル乗数が適用される", () => {
      const baseTimeout = computeModelTimeoutMs("claude-3-5-sonnet", {
        thinkingLevel: "off",
      });
      const highTimeout = computeModelTimeoutMs("claude-3-5-sonnet", {
        thinkingLevel: "high",
      });
      expect(highTimeout).toBeGreaterThan(baseTimeout);
    });

    it("xhighは最大乗数", () => {
      const xhighTimeout = computeModelTimeoutMs("claude-3-5-sonnet", {
        thinkingLevel: "xhigh",
      });
      const highTimeout = computeModelTimeoutMs("claude-3-5-sonnet", {
        thinkingLevel: "high",
      });
      expect(xhighTimeout).toBeGreaterThan(highTimeout);
    });
  });

  describe("computeProgressiveTimeoutMs", () => {
    it("試行回数に応じてタイムアウトが増加する", () => {
      const base = 100_000;
      const attempt0 = computeProgressiveTimeoutMs(base, 0);
      const attempt2 = computeProgressiveTimeoutMs(base, 2);
      const attempt4 = computeProgressiveTimeoutMs(base, 4);

      expect(attempt0).toBeLessThan(attempt2);
      expect(attempt2).toBeLessThan(attempt4);
    });

    it("最大2倍まで増加する", () => {
      const base = 100_000;
      const attempt10 = computeProgressiveTimeoutMs(base, 10);
      expect(attempt10).toBeLessThanOrEqual(base * 2);
    });
  });
});

// ============================================================================
// アダプティブペナルティ 統合テスト
// ============================================================================

describe("アダプティブペナルティ 統合テスト", () => {
  describe("createAdaptivePenaltyController", () => {
    it("安定モードでは常に0を返す", () => {
      const controller = createAdaptivePenaltyController({
        isStable: true,
        maxPenalty: 10,
        decayMs: 1000,
      });

      controller.raise("rate_limit");
      expect(controller.get()).toBe(0);

      const limit = controller.applyLimit(10);
      expect(limit).toBe(10);
    });

    it("非安定モードではペナルティが増加する", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 10,
        decayMs: 60_000,
      });

      controller.raise("rate_limit");
      expect(controller.get()).toBe(1);

      controller.raise("timeout");
      expect(controller.get()).toBe(2);
    });

    it("ペナルティはmaxPenaltyを超えない", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 3,
        decayMs: 60_000,
      });

      for (let i = 0; i < 10; i++) {
        controller.raise("rate_limit");
      }
      expect(controller.get()).toBe(3);
    });

    it("lower()でペナルティが減少する", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 10,
        decayMs: 60_000,
      });

      controller.raise("rate_limit");
      controller.raise("rate_limit");
      expect(controller.get()).toBe(2);

      controller.lower();
      expect(controller.get()).toBe(1);
    });

    it("applyLimitが正しく制限を適用する", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 10,
        decayMs: 60_000,
      });

      // ペナルティ0: 10 -> 10
      expect(controller.applyLimit(10)).toBe(10);

      controller.raise("rate_limit");
      // ペナルティ1: 10 / 2 = 5
      expect(controller.applyLimit(10)).toBe(5);

      controller.raise("rate_limit");
      // ペナルティ2: 10 / 3 = 3
      expect(controller.applyLimit(10)).toBe(3);
    });

    it("applyLimitは最低1を返す", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 100,
        decayMs: 60_000,
      });

      // ペナルティを大幅に増加
      for (let i = 0; i < 20; i++) {
        controller.raise("rate_limit");
      }

      // どんなにペナルティが高くても最低1
      expect(controller.applyLimit(10)).toBeGreaterThanOrEqual(1);
    });
  });
});

// ============================================================================
// 出力検証 統合テスト
// ============================================================================

describe("出力検証 統合テスト", () => {
  describe("hasNonEmptyResultSection", () => {
    it("RESULTセクションがある場合はtrue", () => {
      const output = `SUMMARY: test
RESULT:
This is the result content.
NEXT_STEP: none`;
      expect(hasNonEmptyResultSection(output)).toBe(true);
    });

    it("RESULTセクションがない場合はfalse", () => {
      const output = `SUMMARY: test
NEXT_STEP: none`;
      expect(hasNonEmptyResultSection(output)).toBe(false);
    });

    it("RESULTセクションが空の場合はfalse", () => {
      const output = `SUMMARY: test
RESULT:
NEXT_STEP: none`;
      expect(hasNonEmptyResultSection(output)).toBe(false);
    });

    it("RESULTが同じ行に内容がある場合はtrue", () => {
      const output = `SUMMARY: test
RESULT: inline content
NEXT_STEP: none`;
      expect(hasNonEmptyResultSection(output)).toBe(true);
    });
  });

  describe("validateSubagentOutput", () => {
    it("有効な出力はok: true", () => {
      const output = `SUMMARY: This is a valid summary that is long enough.
RESULT:
This is the result content with sufficient length.
NEXT_STEP: none`;
      const result = validateSubagentOutput(output);
      expect(result.ok).toBe(true);
    });

    it("空の出力はok: false", () => {
      const result = validateSubagentOutput("");
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("empty");
    });

    it("文字数不足はok: false", () => {
      const output = `SUMMARY: short
RESULT: x
NEXT_STEP: none`;
      const result = validateSubagentOutput(output);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("too short");
    });

    it("必須ラベルがない場合はok: false", () => {
      // 十分な長さのテキストだがラベルがない
      const output = "Some random text without proper labels. This text is long enough to pass the minChars check but lacks required labels.";
      const result = validateSubagentOutput(output);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("missing labels");
    });
  });

  describe("validateTeamMemberOutput", () => {
    it("有効な出力はok: true", () => {
      const output = `SUMMARY: This is a valid summary.
CLAIM: This is a claim statement.
EVIDENCE: Some evidence here.
RESULT:
This is the result content with sufficient length for team member.
NEXT_STEP: none`;
      const result = validateTeamMemberOutput(output);
      expect(result.ok).toBe(true);
    });

    it("CLAIMがない場合はok: false", () => {
      // 十分な長さのテキストを用意
      const output = `SUMMARY: test summary text here
EVIDENCE: test evidence here
RESULT: content that is long enough for the min chars requirement
NEXT_STEP: none`;
      const result = validateTeamMemberOutput(output);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("CLAIM");
    });

    it("EVIDENCEがない場合はok: false", () => {
      // 十分な長さのテキストを用意
      const output = `SUMMARY: test summary text here
CLAIM: test claim here
RESULT: content that is long enough for the min chars requirement
NEXT_STEP: none`;
      const result = validateTeamMemberOutput(output);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("EVIDENCE");
    });
  });
});

// ============================================================================
// フィールド候補選択 統合テスト
// ============================================================================

describe("フィールド候補選択 統合テスト", () => {
  describe("pickFieldCandidate", () => {
    it("最初の非空行を返す", () => {
      const text = "First line\nSecond line";
      const result = pickFieldCandidate(text, { maxLength: 100 });
      expect(result).toBe("First line");
    });

    it("除外ラベルをスキップする", () => {
      const text = "SUMMARY: skip this\nActual content here";
      const result = pickFieldCandidate(text, {
        maxLength: 100,
        excludeLabels: ["SUMMARY"],
      });
      expect(result).toBe("Actual content here");
    });

    it("maxLengthを超える場合は切り詰める", () => {
      const text = "a".repeat(200);
      const result = pickFieldCandidate(text, { maxLength: 50 });
      expect(result.length).toBe(53); // 50 + "..."
      expect(result.endsWith("...")).toBe(true);
    });

    it("空の入力はフォールバックを返す", () => {
      const result = pickFieldCandidate("", { maxLength: 100, fallback: "Fallback" });
      expect(result).toBe("Fallback");
    });

    it("マークダウン記号を除去する", () => {
      const text = "- List item\n# Heading\n**Bold text**";
      const result = pickFieldCandidate(text, { maxLength: 100 });
      expect(result).toBe("List item");
    });
  });

  describe("pickSummaryCandidate", () => {
    it("SUMMARY, RESULT, NEXT_STEPを除外する", () => {
      const text = "SUMMARY: skip\nRESULT: skip\nNEXT_STEP: skip\nActual summary";
      const result = pickSummaryCandidate(text);
      expect(result).toBe("Actual summary");
    });

    it("最大90文字", () => {
      const text = "a".repeat(200);
      const result = pickSummaryCandidate(text);
      expect(result.length).toBeLessThanOrEqual(93); // 90 + "..."
    });
  });

  describe("pickClaimCandidate", () => {
    it("複数のラベルを除外する", () => {
      const text = "SUMMARY: skip\nCLAIM: skip\nEVIDENCE: skip\nActual claim here";
      const result = pickClaimCandidate(text);
      expect(result).toBe("Actual claim here");
    });

    it("最大120文字", () => {
      const text = "a".repeat(200);
      const result = pickClaimCandidate(text);
      expect(result.length).toBeLessThanOrEqual(123); // 120 + "..."
    });
  });
});

// ============================================================================
// エンティティ出力正規化 統合テスト
// ============================================================================

describe("エンティティ出力正規化 統合テスト", () => {
  const mockValidateFn = (output: string) => {
    const hasSummary = /SUMMARY:/i.test(output);
    const hasResult = /RESULT:/i.test(output);
    const hasNextStep = /NEXT_STEP:/i.test(output);
    if (hasSummary && hasResult && hasNextStep) {
      return { ok: true };
    }
    return { ok: false, reason: "missing required labels" };
  };

  describe("normalizeEntityOutput", () => {
    it("既に正しい形式の出力はそのまま返す", () => {
      const output = `SUMMARY: Valid summary
RESULT: Valid result
NEXT_STEP: none`;
      const result = normalizeEntityOutput(output, {
        config: SUBAGENT_CONFIG,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY:", "RESULT:", "NEXT_STEP:"],
      });
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(false);
    });

    it("空の出力はok: false", () => {
      const result = normalizeEntityOutput("", {
        config: SUBAGENT_CONFIG,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY:", "RESULT:", "NEXT_STEP:"],
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("empty output");
    });

    it("不正な形式の出力は再構築を試みる", () => {
      const output = "This is raw output without proper format.";
      const result = normalizeEntityOutput(output, {
        config: SUBAGENT_CONFIG,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY:", "RESULT:", "NEXT_STEP:"],
      });
      // 再構築後に正しい形式になる
      expect(result.output).toContain("SUMMARY:");
      expect(result.output).toContain("RESULT:");
      expect(result.output).toContain("NEXT_STEP:");
    });
  });

  describe("isEmptyOutputFailureMessage", () => {
    it("空出力メッセージを含む場合はtrue", () => {
      expect(
        isEmptyOutputFailureMessage("subagent returned empty output", SUBAGENT_CONFIG)
      ).toBe(true);
    });

    it("空出力メッセージを含まない場合はfalse", () => {
      expect(
        isEmptyOutputFailureMessage("some other error", SUBAGENT_CONFIG)
      ).toBe(false);
    });
  });

  describe("buildFailureSummary", () => {
    it("empty outputメッセージを検出", () => {
      expect(buildFailureSummary("empty output error")).toBe("(failed: empty output)");
    });

    it("timeoutメッセージを検出", () => {
      expect(buildFailureSummary("request timed out")).toBe("(failed: timeout)");
    });

    it("rate limitメッセージを検出", () => {
      expect(buildFailureSummary("rate limit exceeded")).toBe("(failed: rate limit)");
    });

    it("その他のエラー", () => {
      expect(buildFailureSummary("unknown error")).toBe("(failed)");
    });
  });
});

// ============================================================================
// resolveTimeoutWithEnv 統合テスト
// ============================================================================

describe("resolveTimeoutWithEnv 統合テスト", () => {
  it("環境変数がない場合はデフォルト値を返す", () => {
    vi.stubEnv("TEST_TIMEOUT_FOR_AGENT", undefined);
    const result = resolveTimeoutWithEnv(60000, "TEST_TIMEOUT_FOR_AGENT");
    expect(result).toBe(60000);
    vi.unstubAllEnvs();
  });

  it("環境変数があるが文字列の場合はデフォルト値を返す", () => {
    // toFiniteNumberWithDefaultは数値のみを受け入れ、文字列はデフォルト値を返す
    vi.stubEnv("TEST_TIMEOUT_FOR_AGENT_2", "120000");
    const result = resolveTimeoutWithEnv(60000, "TEST_TIMEOUT_FOR_AGENT_2");
    expect(result).toBe(60000);
    vi.unstubAllEnvs();
  });

  it("無効な環境変数値はデフォルト値を返す", () => {
    vi.stubEnv("TEST_TIMEOUT_FOR_AGENT_3", "invalid");
    const result = resolveTimeoutWithEnv(60000, "TEST_TIMEOUT_FOR_AGENT_3");
    expect(result).toBe(60000);
    vi.unstubAllEnvs();
  });

  it("空文字の環境変数はデフォルト値を返す", () => {
    vi.stubEnv("TEST_TIMEOUT_FOR_AGENT_4", "");
    const result = resolveTimeoutWithEnv(60000, "TEST_TIMEOUT_FOR_AGENT_4");
    expect(result).toBe(60000);
    vi.unstubAllEnvs();
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("createRunIdが常に正しい形式", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), () => {
        const id = createRunId();
        return /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[a-f0-9]{6}$/.test(id);
      })
    );
  });

  it("computeLiveWindowの不変条件", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 100 }),
        (cursor, total, maxRows) => {
          const result = computeLiveWindow(cursor, total, maxRows);
          return (
            result.start >= 0 &&
            result.end >= result.start &&
            result.end <= total
          );
        }
      )
    );
  });

  it("getModelBaseTimeoutMsが常に正の値を返す", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (modelId) => {
        const timeout = getModelBaseTimeoutMs(modelId);
        return timeout > 0;
      })
    );
  });

  it("computeProgressiveTimeoutMsが冪等性を持つ", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 1000000 }),
        fc.integer({ min: 0, max: 10 }),
        (baseTimeout, attempt) => {
          const result = computeProgressiveTimeoutMs(baseTimeout, attempt);
          return result >= baseTimeout && result <= baseTimeout * 2;
        }
      )
    );
  });

  it("pickFieldCandidateが常に文字列を返す", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 1000 }),
        fc.integer({ min: 10, max: 200 }),
        (text, maxLength) => {
          const result = pickFieldCandidate(text, { maxLength });
          return typeof result === "string";
        }
      )
    );
  });

  it("buildFailureSummaryが常に文字列を返す", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (message) => {
        const result = buildFailureSummary(message);
        return typeof result === "string" && result.startsWith("(");
      })
    );
  });
});

// ============================================================================
// 型エクスポート確認テスト
// ============================================================================

describe("型エクスポート確認", () => {
  it("ThinkingLevel型が使用可能", () => {
    const level: ThinkingLevel = "high";
    expect(level).toBe("high");
  });

  it("RunOutcomeCode型が使用可能", () => {
    const code: RunOutcomeCode = "SUCCESS";
    expect(code).toBe("SUCCESS");
  });

  it("RunOutcomeSignal型が使用可能", () => {
    const signal: RunOutcomeSignal = {
      outcomeCode: "SUCCESS",
      retryRecommended: false,
    };
    expect(signal.outcomeCode).toBe("SUCCESS");
  });

  it("EntityType型が使用可能", () => {
    const type: EntityType = "subagent";
    expect(type).toBe("subagent");
  });

  it("EntityConfig型が使用可能", () => {
    const config: EntityConfig = {
      type: "subagent",
      label: "test",
      emptyOutputMessage: "empty",
      defaultSummaryFallback: "fallback",
    };
    expect(config.type).toBe("subagent");
  });

  it("NormalizedEntityOutput型が使用可能", () => {
    const output: NormalizedEntityOutput = {
      ok: true,
      output: "test",
      degraded: false,
    };
    expect(output.ok).toBe(true);
  });

  it("AdaptivePenaltyState型が使用可能", () => {
    const state: AdaptivePenaltyState = {
      penalty: 0,
      updatedAtMs: Date.now(),
      reasonHistory: [],
    };
    expect(state.penalty).toBe(0);
  });

  it("AdaptivePenaltyOptions型が使用可能", () => {
    const options: AdaptivePenaltyOptions = {
      isStable: true,
      maxPenalty: 10,
      decayMs: 60000,
    };
    expect(options.isStable).toBe(true);
  });

  it("ComputeModelTimeoutOptions型が使用可能", () => {
    const options: ComputeModelTimeoutOptions = {
      userTimeoutMs: 60000,
      thinkingLevel: "high",
    };
    expect(options.userTimeoutMs).toBe(60000);
  });

  it("SubagentValidationOptions型が使用可能", () => {
    const options: SubagentValidationOptions = {
      minChars: 48,
      requiredLabels: ["SUMMARY:", "RESULT:"],
    };
    expect(options.minChars).toBe(48);
  });

  it("TeamMemberValidationOptions型が使用可能", () => {
    const options: TeamMemberValidationOptions = {
      minChars: 80,
      requiredLabels: ["SUMMARY:", "CLAIM:", "EVIDENCE:"],
    };
    expect(options.minChars).toBe(80);
  });
});

// ============================================================================
// 境界値・エッジケーステスト
// ============================================================================

describe("境界値・エッジケース", () => {
  describe("createRunId", () => {
    it("連続生成で一意性を保つ", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(createRunId());
      }
      // 同一ミリ秒内での衝突の可能性を考慮し、99%以上の一意性を確認
      expect(ids.size).toBeGreaterThanOrEqual(990);
    });
  });

  describe("computeLiveWindow", () => {
    it("total = 0", () => {
      const result = computeLiveWindow(0, 0, 10);
      expect(result).toEqual({ start: 0, end: 0 });
    });

    it("cursor = total - 1 (末尾)", () => {
      const result = computeLiveWindow(99, 100, 10);
      expect(result.end).toBe(100);
    });

    it("maxRows = 1", () => {
      const result = computeLiveWindow(5, 20, 1);
      expect(result.end - result.start).toBe(1);
    });
  });

  describe("タイムアウト計算", () => {
    it("空文字モデルID", () => {
      const timeout = getModelBaseTimeoutMs("");
      expect(timeout).toBe(MODEL_TIMEOUT_BASE_MS.default);
    });

    it("ユーザータイムアウト = 0は無視される", () => {
      const timeout = computeModelTimeoutMs("claude-3-5-sonnet", {
        userTimeoutMs: 0,
      });
      expect(timeout).toBeGreaterThan(0);
    });

    it("負の試行回数", () => {
      const result = computeProgressiveTimeoutMs(100000, -1);
      expect(result).toBeGreaterThanOrEqual(100000 * 0.75);
    });
  });

  describe("出力検証", () => {
    it("非常に長い出力", () => {
      const longOutput = "a".repeat(100000);
      const result = validateSubagentOutput(longOutput);
      expect(result.ok).toBe(false); // 必須ラベルがない
    });

    it("Unicodeを含む出力", () => {
      const output = `SUMMARY: 日本語テスト 🎉
RESULT: 結果コンテンツ
NEXT_STEP: none`;
      const result = validateSubagentOutput(output);
      expect(result.ok).toBe(true);
    });

    it("制御文字を含む出力", () => {
      const output = `SUMMARY: test\x00\x01
RESULT: content
NEXT_STEP: none`;
      expect(() => validateSubagentOutput(output)).not.toThrow();
    });
  });

  describe("ペナルティ制御", () => {
    it("最大ペナルティ境界", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 5,
        decayMs: 60_000,
      });

      for (let i = 0; i < 100; i++) {
        controller.raise("rate_limit");
      }
      expect(controller.get()).toBe(5);
    });

    it("ゼロ除算回避 (applyLimit)", () => {
      const controller = createAdaptivePenaltyController({
        isStable: false,
        maxPenalty: 0,
        decayMs: 60_000,
      });

      // maxPenalty = 0 でも最低1を返す
      expect(controller.applyLimit(10)).toBeGreaterThanOrEqual(1);
    });
  });
});
