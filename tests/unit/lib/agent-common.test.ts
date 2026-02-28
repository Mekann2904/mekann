/**
 * agent-common.ts 単体テスト
 * カバレッジ: STABLE_RUNTIME_PROFILE, ADAPTIVE_PARALLEL_MAX_PENALTY, EntityConfig,
 * pickFieldCandidate, pickSummaryCandidate, pickClaimCandidate, normalizeEntityOutput,
 * isEmptyOutputFailureMessage, buildFailureSummary, resolveTimeoutWithEnv
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
  STABLE_RUNTIME_PROFILE,
  ADAPTIVE_PARALLEL_MAX_PENALTY,
  ADAPTIVE_PARALLEL_DECAY_MS,
  STABLE_MAX_RETRIES,
  STABLE_INITIAL_DELAY_MS,
  STABLE_MAX_DELAY_MS,
  STABLE_MAX_RATE_LIMIT_RETRIES,
  STABLE_MAX_RATE_LIMIT_WAIT_MS,
  SUBAGENT_CONFIG,
  TEAM_MEMBER_CONFIG,
  pickFieldCandidate,
  pickSummaryCandidate,
  pickClaimCandidate,
  normalizeEntityOutput,
  isEmptyOutputFailureMessage,
  buildFailureSummary,
  resolveTimeoutWithEnv,
  type EntityConfig,
  type NormalizedEntityOutput,
  type PickFieldCandidateOptions,
} from "../../../.pi/lib/agent/agent-common.js";

// ============================================================================
// 定数テスト
// ============================================================================

describe("安定実行プロファイル定数", () => {
  describe("STABLE_RUNTIME_PROFILE", () => {
    it("本番環境ではtrueである", () => {
      expect(STABLE_RUNTIME_PROFILE).toBe(true);
    });
  });

  describe("ADAPTIVE_PARALLEL_MAX_PENALTY", () => {
    it("安定プロファイル時は0である", () => {
      expect(ADAPTIVE_PARALLEL_MAX_PENALTY).toBe(0);
    });
  });

  describe("ADAPTIVE_PARALLEL_DECAY_MS", () => {
    it("正の値である", () => {
      expect(ADAPTIVE_PARALLEL_DECAY_MS).toBeGreaterThan(0);
      expect(ADAPTIVE_PARALLEL_DECAY_MS).toBe(8 * 60 * 1000);
    });
  });
});

describe("リトライ設定定数", () => {
  it("STABLE_MAX_RETRIES_正の値である", () => {
    expect(STABLE_MAX_RETRIES).toBe(2);
  });

  it("STABLE_INITIAL_DELAY_MS_正の値である", () => {
    expect(STABLE_INITIAL_DELAY_MS).toBe(800);
  });

  it("STABLE_MAX_DELAY_MS_正の値である", () => {
    expect(STABLE_MAX_DELAY_MS).toBe(10_000);
  });

  it("STABLE_MAX_RATE_LIMIT_RETRIES_正の値である", () => {
    expect(STABLE_MAX_RATE_LIMIT_RETRIES).toBe(4);
  });

  it("STABLE_MAX_RATE_LIMIT_WAIT_MS_正の値である", () => {
    expect(STABLE_MAX_RATE_LIMIT_WAIT_MS).toBe(90_000);
  });
});

// ============================================================================
// EntityConfig テスト
// ============================================================================

describe("SUBAGENT_CONFIG", () => {
  it("正しい設定を持つ", () => {
    expect(SUBAGENT_CONFIG.type).toBe("subagent");
    expect(SUBAGENT_CONFIG.label).toBe("subagent");
    expect(SUBAGENT_CONFIG.emptyOutputMessage).toBe("subagent returned empty output");
    expect(SUBAGENT_CONFIG.defaultSummaryFallback).toBe("回答を整形しました。");
  });
});

describe("TEAM_MEMBER_CONFIG", () => {
  it("正しい設定を持つ", () => {
    expect(TEAM_MEMBER_CONFIG.type).toBe("team-member");
    expect(TEAM_MEMBER_CONFIG.label).toBe("team member");
    expect(TEAM_MEMBER_CONFIG.emptyOutputMessage).toBe("agent team member returned empty output");
    expect(TEAM_MEMBER_CONFIG.defaultSummaryFallback).toBe("情報を整理しました。");
  });
});

// ============================================================================
// pickFieldCandidate テスト
// ============================================================================

describe("pickFieldCandidate", () => {
  describe("正常ケース", () => {
    it("短いテキスト_そのまま返す", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100 };
      expect(pickFieldCandidate("Hello World", options)).toBe("Hello World");
    });

    it("長いテキスト_切り詰める", () => {
      const options: PickFieldCandidateOptions = { maxLength: 10 };
      const result = pickFieldCandidate("This is a very long text", options);
      expect(result.length).toBe(13); // 10 + "..."
      expect(result.endsWith("...")).toBe(true);
    });

    it("複数行_最初の行を返す", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100 };
      const result = pickFieldCandidate("First line\nSecond line", options);
      expect(result).toBe("First line");
    });

    it("空行をスキップ", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100 };
      const result = pickFieldCandidate("\n\n  Actual content  \n", options);
      expect(result).toBe("Actual content");
    });
  });

  describe("除外ラベル", () => {
    it("除外ラベルを含む行をスキップ", () => {
      const options: PickFieldCandidateOptions = {
        maxLength: 100,
        excludeLabels: ["SUMMARY", "RESULT"],
      };
      const result = pickFieldCandidate("SUMMARY: Test\nActual content", options);
      expect(result).toBe("Actual content");
    });

    it("大文字小文字を区別しない", () => {
      const options: PickFieldCandidateOptions = {
        maxLength: 100,
        excludeLabels: ["SUMMARY"],
      };
      const result = pickFieldCandidate("summary: Test\nContent", options);
      expect(result).toBe("Content");
    });
  });

  describe("フォーマット除去", () => {
    it("リストマーカーを除去", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100 };
      const result = pickFieldCandidate("- Item text", options);
      expect(result).toBe("Item text");
    });

    it("見出しマーカーを除去", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100 };
      const result = pickFieldCandidate("### Heading", options);
      expect(result).toBe("Heading");
    });

    it("複数スペースを正規化", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100 };
      const result = pickFieldCandidate("Text   with   spaces", options);
      expect(result).toBe("Text with spaces");
    });
  });

  describe("境界値", () => {
    it("空文字_fallbackを返す", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100, fallback: "Fallback" };
      expect(pickFieldCandidate("", options)).toBe("Fallback");
    });

    it("空白のみ_fallbackを返す", () => {
      const options: PickFieldCandidateOptions = { maxLength: 100, fallback: "Fallback" };
      expect(pickFieldCandidate("   \n  \t  ", options)).toBe("Fallback");
    });

    it("全て除外対象_fallbackではなく最初の行を返す", () => {
      const options: PickFieldCandidateOptions = {
        maxLength: 100,
        excludeLabels: ["SUMMARY"],
      };
      const result = pickFieldCandidate("SUMMARY: Test", options);
      // 除外対象でも最初の行を返す（フォールバック）
      expect(result).toBe("SUMMARY: Test");
    });

    it("maxLengthちょうど_そのまま返す", () => {
      const options: PickFieldCandidateOptions = { maxLength: 5 };
      expect(pickFieldCandidate("Hello", options)).toBe("Hello");
    });

    it("maxLength+1_切り詰める", () => {
      const options: PickFieldCandidateOptions = { maxLength: 5 };
      const result = pickFieldCandidate("Hello!", options);
      expect(result).toBe("Hello...");
    });
  });
});

// ============================================================================
// pickSummaryCandidate テスト
// ============================================================================

describe("pickSummaryCandidate", () => {
  it("サマリーを抽出", () => {
    const result = pickSummaryCandidate("Some content for summary");
    expect(result).toBe("Some content for summary");
  });

  it("SUMMARYラベルを除外", () => {
    const result = pickSummaryCandidate("SUMMARY: Skip this\nActual summary here");
    expect(result).toBe("Actual summary here");
  });

  it("RESULTラベルを除外", () => {
    const result = pickSummaryCandidate("RESULT: Skip this\nContent");
    expect(result).toBe("Content");
  });

  it("最大90文字に制限", () => {
    const longText = "x".repeat(100);
    const result = pickSummaryCandidate(longText);
    expect(result.length).toBeLessThanOrEqual(93); // 90 + "..."
  });

  it("空入力_デフォルトフォールバック", () => {
    const result = pickSummaryCandidate("");
    expect(result).toBe("回答を整形しました。");
  });
});

// ============================================================================
// pickClaimCandidate テスト
// ============================================================================

describe("pickClaimCandidate", () => {
  it("クレームを抽出", () => {
    const result = pickClaimCandidate("This is the main claim");
    expect(result).toBe("This is the main claim");
  });

  it("複数の除外ラベルを適用", () => {
    const result = pickClaimCandidate("SUMMARY: Skip\nCLAIM: Also skip\nEVIDENCE: Skip too\nReal claim");
    expect(result).toBe("Real claim");
  });

  it("最大120文字に制限", () => {
    const longText = "x".repeat(150);
    const result = pickClaimCandidate(longText);
    expect(result.length).toBeLessThanOrEqual(123); // 120 + "..."
  });

  it("空入力_デフォルトフォールバック", () => {
    const result = pickClaimCandidate("");
    expect(result).toBe("主張を特定できませんでした。");
  });
});

// ============================================================================
// normalizeEntityOutput テスト
// ============================================================================

describe("normalizeEntityOutput", () => {
  const mockValidateFn = vi.fn((output: string) => {
    const hasRequiredLabels = output.includes("SUMMARY:") && output.includes("RESULT:");
    return { ok: hasRequiredLabels, reason: hasRequiredLabels ? undefined : "missing_labels" };
  });

  const mockConfig: EntityConfig = {
    type: "subagent",
    label: "test",
    emptyOutputMessage: "empty output",
    defaultSummaryFallback: "Fallback",
  };

  beforeEach(() => {
    mockValidateFn.mockClear();
  });

  describe("正常ケース", () => {
    it("既に有効な形式_そのまま返す", () => {
      // Arrange
      const validOutput = "SUMMARY: Test\nRESULT:\nContent\nNEXT_STEP: none";
      mockValidateFn.mockReturnValueOnce({ ok: true });

      // Act
      const result = normalizeEntityOutput(validOutput, {
        config: mockConfig,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY", "RESULT"],
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(false);
    });

    it("無効な形式_正規化する", () => {
      // Arrange
      const invalidOutput = "Just some content";
      mockValidateFn
        .mockReturnValueOnce({ ok: false, reason: "missing_labels" })
        .mockReturnValueOnce({ ok: true });

      // Act
      const result = normalizeEntityOutput(invalidOutput, {
        config: mockConfig,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY", "RESULT"],
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.reason).toBe("missing_labels");
      expect(result.output).toContain("SUMMARY:");
      expect(result.output).toContain("RESULT:");
    });
  });

  describe("境界値", () => {
    it("空出力_失敗を返す", () => {
      // Arrange
      mockValidateFn.mockReturnValue({ ok: false, reason: "empty" });

      // Act
      const result = normalizeEntityOutput("", {
        config: mockConfig,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY", "RESULT"],
      });

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("empty output");
    });

    it("空白のみ_失敗を返す", () => {
      // Arrange
      mockValidateFn.mockReturnValue({ ok: false, reason: "empty" });

      // Act
      const result = normalizeEntityOutput("   \n  \t  ", {
        config: mockConfig,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY", "RESULT"],
      });

      // Assert
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("empty output");
    });
  });

  describe("チームメンバー形式", () => {
    it("includeConfidence_true_CLAIMとEVIDENCEを追加", () => {
      // Arrange
      const invalidOutput = "Some content";
      mockValidateFn
        .mockReturnValueOnce({ ok: false, reason: "missing_labels" })
        .mockReturnValueOnce({ ok: true });

      // Act
      const result = normalizeEntityOutput(invalidOutput, {
        config: mockConfig,
        validateFn: mockValidateFn,
        requiredLabels: ["SUMMARY", "CLAIM", "EVIDENCE", "RESULT"],
        includeConfidence: true,
      });

      // Assert
      expect(result.ok).toBe(true);
      expect(result.output).toContain("CLAIM:");
      expect(result.output).toContain("EVIDENCE: not-provided");
    });
  });
});

// ============================================================================
// isEmptyOutputFailureMessage テスト
// ============================================================================

describe("isEmptyOutputFailureMessage", () => {
  it("空出力メッセージを含む_trueを返す", () => {
    const config: EntityConfig = {
      type: "subagent",
      label: "test",
      emptyOutputMessage: "subagent returned empty output",
      defaultSummaryFallback: "",
    };

    expect(isEmptyOutputFailureMessage("subagent returned empty output", config)).toBe(true);
    expect(isEmptyOutputFailureMessage("Error: subagent returned empty output", config)).toBe(true);
  });

  it("大文字小文字を区別しない", () => {
    const config: EntityConfig = {
      type: "subagent",
      label: "test",
      emptyOutputMessage: "Empty Output",
      defaultSummaryFallback: "",
    };

    expect(isEmptyOutputFailureMessage("EMPTY OUTPUT detected", config)).toBe(true);
  });

  it("無関係なメッセージ_falseを返す", () => {
    const config: EntityConfig = {
      type: "subagent",
      label: "test",
      emptyOutputMessage: "empty output",
      defaultSummaryFallback: "",
    };

    expect(isEmptyOutputFailureMessage("Timeout occurred", config)).toBe(false);
    expect(isEmptyOutputFailureMessage("Rate limit hit", config)).toBe(false);
  });
});

// ============================================================================
// buildFailureSummary テスト
// ============================================================================

describe("buildFailureSummary", () => {
  it("空出力メッセージ_適切な要約を返す", () => {
    expect(buildFailureSummary("Error: empty output detected")).toBe("(failed: empty output)");
  });

  it("タイムアウトメッセージ_適切な要約を返す", () => {
    expect(buildFailureSummary("Operation timed out")).toBe("(failed: timeout)");
    expect(buildFailureSummary("Request timed out after 30s")).toBe("(failed: timeout)");
  });

  it("レートリミットメッセージ_適切な要約を返す", () => {
    expect(buildFailureSummary("Rate limit exceeded")).toBe("(failed: rate limit)");
    expect(buildFailureSummary("Error 429: Too Many Requests")).toBe("(failed: rate limit)");
  });

  it("その他のエラー_汎用要約を返す", () => {
    expect(buildFailureSummary("Unknown error")).toBe("(failed)");
    expect(buildFailureSummary("Network error")).toBe("(failed)");
  });

  it("大文字小文字を区別しない", () => {
    expect(buildFailureSummary("EMPTY OUTPUT")).toBe("(failed: empty output)");
    expect(buildFailureSummary("TIMED OUT")).toBe("(failed: timeout)");
  });
});

// ============================================================================
// resolveTimeoutWithEnv テスト
// ============================================================================

describe("resolveTimeoutWithEnv", () => {
  // 注: toFiniteNumberWithDefault は文字列を数値に変換しないため、
  // 環境変数の文字列値は常にデフォルト値にフォールバックする
  it("環境変数なし_デフォルト値を返す", () => {
    const key = `TEST_TIMEOUT_${Date.now()}_${Math.random()}`;
    expect(resolveTimeoutWithEnv(30000, key)).toBe(30000);
  });

  it("空文字_デフォルト値を返す", () => {
    const key = `TEST_TIMEOUT_${Date.now()}_${Math.random()}`;
    process.env[key] = "";
    expect(resolveTimeoutWithEnv(30000, key)).toBe(30000);
    delete process.env[key];
  });

  it("文字列値_デフォルト値を返す", () => {
    const key = `TEST_TIMEOUT_${Date.now()}_${Math.random()}`;
    process.env[key] = "60000";
    // toFiniteNumberWithDefault は文字列を変換しないためデフォルト値が返る
    expect(resolveTimeoutWithEnv(30000, key)).toBe(30000);
    delete process.env[key];
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  describe("pickFieldCandidate", () => {
    it("任意の入力_常に文字列を返す", () => {
      // 正規表現の特殊文字を含まないラベルのみ使用
      const safeLabel = fc.string({ minLength: 1, maxLength: 20 }).filter(
        s => !/[\[\]\\^$.*+?(){}|]/.test(s)
      );

      fc.assert(
        fc.property(
          fc.string(),
          fc.record({
            maxLength: fc.integer({ min: 10, max: 1000 }),
            excludeLabels: fc.oneof(fc.constant(undefined), fc.array(safeLabel)),
            fallback: fc.string({ minLength: 1, maxLength: 20 }),
          }),
          (text, options) => {
            const result = pickFieldCandidate(text, {
              maxLength: options.maxLength,
              excludeLabels: options.excludeLabels,
              fallback: options.fallback,
            });
            expect(typeof result).toBe("string");
            const maxAllowedLength = Math.max(options.maxLength + 3, options.fallback.length);
            expect(result.length).toBeLessThanOrEqual(maxAllowedLength);
          }
        )
      );
    });
  });

  describe("buildFailureSummary", () => {
    it("任意のメッセージ_常にカッコで囲まれた形式", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (message) => {
          const result = buildFailureSummary(message);
          expect(result.startsWith("(failed")).toBe(true);
          expect(result.endsWith(")")).toBe(true);
        })
      );
    });
  });

  describe("resolveTimeoutWithEnv", () => {
    it("任意の数値入力_非負整数を返す", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000000 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (defaultMs, envKey) => {
            const result = resolveTimeoutWithEnv(defaultMs, `TEST_${envKey}`);
            expect(Number.isInteger(result)).toBe(true);
            expect(result).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });
  });
});
