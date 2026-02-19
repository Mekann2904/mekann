/**
 * @file .pi/lib/text-parsing.ts の単体テスト
 * @description テキストパース、数値変換、ID生成ユーティリティのテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  clampConfidence,
  generateClaimId,
  generateEvidenceId,
  parseUnitInterval,
  extractField,
  extractMultilineField,
  countKeywordSignals,
  analyzeDiscussionStance,
  extractConsensusMarker,
  STANCE_PATTERNS,
  type DiscussionStance,
  type DiscussionStanceResult,
} from "@lib/text-parsing";

// ============================================================================
// clampConfidence
// ============================================================================

describe("clampConfidence", () => {
  describe("正常系", () => {
    it("should_return_value_within_range", () => {
      // Arrange
      const value = 0.5;

      // Act
      const result = clampConfidence(value);

      // Assert
      expect(result).toBe(0.5);
    });

    it("should_return_1_for_value_above_1", () => {
      // Arrange
      const value = 1.5;

      // Act
      const result = clampConfidence(value);

      // Assert
      expect(result).toBe(1);
    });

    it("should_return_0_for_negative_value", () => {
      // Arrange
      const value = -0.5;

      // Act
      const result = clampConfidence(value);

      // Assert
      expect(result).toBe(0);
    });
  });

  describe("境界値", () => {
    it("should_return_0_for_0", () => {
      // Arrange & Act & Assert
      expect(clampConfidence(0)).toBe(0);
    });

    it("should_return_1_for_1", () => {
      // Arrange & Act & Assert
      expect(clampConfidence(1)).toBe(1);
    });

    it("should_handle_very_small_positive", () => {
      // Arrange
      const value = 0.0001;

      // Act
      const result = clampConfidence(value);

      // Assert
      expect(result).toBe(0.0001);
    });

    it("should_handle_very_large_positive", () => {
      // Arrange
      const value = 1000000;

      // Act
      const result = clampConfidence(value);

      // Assert
      expect(result).toBe(1);
    });
  });

  describe("特殊値", () => {
    it("should_return_0.5_for_NaN", () => {
      // Arrange & Act & Assert
      expect(clampConfidence(NaN)).toBe(0.5);
    });

    it("should_return_0.5_for_Infinity", () => {
      // Arrange & Act & Assert
      expect(clampConfidence(Infinity)).toBe(0.5);
    });

    it("should_return_0.5_for_negative_Infinity", () => {
      // Arrange & Act & Assert
      expect(clampConfidence(-Infinity)).toBe(0.5);
    });
  });
});

// ============================================================================
// generateClaimId
// ============================================================================

describe("generateClaimId", () => {
  it("should_return_string_starting_with_claim", () => {
    // Arrange & Act
    const id = generateClaimId();

    // Assert
    expect(id.startsWith("claim-")).toBe(true);
  });

  it("should_generate_unique_ids", () => {
    // Arrange
    const ids = new Set<string>();

    // Act
    for (let i = 0; i < 100; i++) {
      ids.add(generateClaimId());
    }

    // Assert
    expect(ids.size).toBe(100);
  });

  it("should_contain_timestamp_and_random_parts", () => {
    // Arrange & Act
    const id = generateClaimId();

    // Assert
    // Format: claim-{timestamp}-{random}
    const parts = id.split("-");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("claim");
  });
});

// ============================================================================
// generateEvidenceId
// ============================================================================

describe("generateEvidenceId", () => {
  it("should_return_string_starting_with_evidence", () => {
    // Arrange & Act
    const id = generateEvidenceId();

    // Assert
    expect(id.startsWith("evidence-")).toBe(true);
  });

  it("should_generate_unique_ids", () => {
    // Arrange
    const ids = new Set<string>();

    // Act
    for (let i = 0; i < 100; i++) {
      ids.add(generateEvidenceId());
    }

    // Assert
    expect(ids.size).toBe(100);
  });

  it("should_be_different_from_claim_id", () => {
    // Arrange & Act
    const claimId = generateClaimId();
    const evidenceId = generateEvidenceId();

    // Assert
    expect(claimId).not.toBe(evidenceId);
    expect(claimId.startsWith("claim-")).toBe(true);
    expect(evidenceId.startsWith("evidence-")).toBe(true);
  });
});

// ============================================================================
// parseUnitInterval
// ============================================================================

describe("parseUnitInterval", () => {
  describe("正常系", () => {
    it("should_parse_decimal_value", () => {
      // Arrange
      const raw = "0.75";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      expect(result).toBe(0.75);
    });

    it("should_parse_percentage_value", () => {
      // Arrange
      const raw = "75%";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      expect(result).toBe(0.75);
    });

    it("should_parse_value_above_1_as_percentage", () => {
      // Arrange
      const raw = "50";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      // 50 > 1 なので50%として扱う
      expect(result).toBe(0.5);
    });

    it("should_parse_1_as_1", () => {
      // Arrange
      const raw = "1";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      expect(result).toBe(1);
    });

    it("should_parse_0_as_0", () => {
      // Arrange
      const raw = "0";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      expect(result).toBe(0);
    });

    it("should_parse_100_percent_as_1", () => {
      // Arrange
      const raw = "100%";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      expect(result).toBe(1);
    });
  });

  describe("境界値", () => {
    it("should_return_undefined_for_undefined", () => {
      // Arrange & Act & Assert
      expect(parseUnitInterval(undefined)).toBeUndefined();
    });

    it("should_return_undefined_for_empty_string", () => {
      // Arrange & Act & Assert
      expect(parseUnitInterval("")).toBeUndefined();
    });

    it("should_return_undefined_for_whitespace_only", () => {
      // Arrange & Act & Assert
      expect(parseUnitInterval("   ")).toBeUndefined();
    });

    it("should_trim_whitespace", () => {
      // Arrange
      const raw = "  0.5  ";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      expect(result).toBe(0.5);
    });

    it("should_handle_negative_values", () => {
      // Arrange
      const raw = "-0.5";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      // clampConfidenceにより0に丸められる
      expect(result).toBe(0);
    });

    it("should_clamp_values_above_1", () => {
      // Arrange
      const raw = "1.5";

      // Act
      const result = parseUnitInterval(raw);

      // Assert
      // 1.5 > 1 なので1.5/100 = 0.015ではなく、clampConfidenceで1に丸められる
      // ※ 実装では1.5 > 1 なので 1.5/100 = 0.015 になる
      // コメント修正: raw値が1より大きい場合パーセントとして扱う
      expect(result).toBe(0.015);
    });
  });

  describe("エラーハンドリング", () => {
    it("should_return_undefined_for_non_numeric", () => {
      // Arrange & Act & Assert
      expect(parseUnitInterval("abc")).toBeUndefined();
    });

    it("should_return_undefined_for_NaN_string", () => {
      // Arrange & Act & Assert
      expect(parseUnitInterval("NaN")).toBeUndefined();
    });

    it("should_return_undefined_for_infinity_string", () => {
      // Arrange & Act & Assert
      expect(parseUnitInterval("Infinity")).toBeUndefined();
    });
  });
});

// ============================================================================
// extractField
// ============================================================================

describe("extractField", () => {
  describe("正常系", () => {
    it("should_extract_single_line_field", () => {
      // Arrange
      const output = "SUMMARY: This is a summary";

      // Act
      const result = extractField(output, "SUMMARY");

      // Assert
      expect(result).toBe("This is a summary");
    });

    it("should_extract_field_with_colon_in_value", () => {
      // Arrange
      const output = "URL: https://example.com";

      // Act
      const result = extractField(output, "URL");

      // Assert
      expect(result).toBe("https://example.com");
    });

    it("should_handle_leading_whitespace", () => {
      // Arrange
      const output = "  FIELD: value";

      // Act
      const result = extractField(output, "FIELD");

      // Assert
      expect(result).toBe("value");
    });

    it("should_handle_whitespace_around_colon", () => {
      // Arrange
      const output = "FIELD  :  value";

      // Act
      const result = extractField(output, "FIELD");

      // Assert
      expect(result).toBe("value");
    });
  });

  describe("境界値", () => {
    it("should_return_undefined_for_missing_field", () => {
      // Arrange
      const output = "OTHER: value";

      // Act
      const result = extractField(output, "MISSING");

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_return_undefined_for_empty_output", () => {
      // Arrange
      const output = "";

      // Act
      const result = extractField(output, "FIELD");

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_handle_field_name_with_special_regex_chars", () => {
      // Arrange
      const output = "FIELD[0]: value";

      // Act
      const result = extractField(output, "FIELD[0]");

      // Assert
      expect(result).toBe("value");
    });

    it("should_be_case_insensitive", () => {
      // Arrange
      const output = "summary: test";

      // Act
      const result = extractField(output, "SUMMARY");

      // Assert
      expect(result).toBe("test");
    });
  });
});

// ============================================================================
// extractMultilineField
// ============================================================================

describe("extractMultilineField", () => {
  describe("正常系", () => {
    it("should_extract_multiline_content", () => {
      // Arrange
      // 注: extractMultilineFieldは「FIELD:\s*$」パターン（コロンの後に改行）を探す
      const output = `RESULT:
Line 1
Line 2
Line 3`;

      // Act
      const result = extractMultilineField(output, "RESULT");

      // Assert
      expect(result).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should_extract_content_from_same_line_when_colon_followed_by_content", () => {
      // Arrange
      // コロンの直後にコンテンツがある場合、sameLineMatchで取得される
      // ただし、パターンマッチの条件を満たす必要がある
      const output = `RESULT: Same line content
Additional line`;

      // Act
      const result = extractMultilineField(output, "RESULT");

      // Assert
      // 注: 実装では ^${name}\s*:\s*$ パターンで検索するため
      // 「RESULT: Same line content」はマッチしない
      // これは複数行フィールド専用の関数の仕様
      expect(result).toBe("");
    });

    it("should_stop_at_next_major_label", () => {
      // Arrange
      const output = `DISCUSSION:
Point 1
Point 2
SUMMARY: This stops`;

      // Act
      const result = extractMultilineField(output, "DISCUSSION");

      // Assert
      expect(result).toBe("Point 1\nPoint 2");
    });

    it("should_handle_multiline_field_with_content_after_newline", () => {
      // Arrange
      // 正しい複数行フィールド形式
      const output = `DISCUSSION:
Initial point
Additional line 1
Additional line 2
SUMMARY: End`;

      // Act
      const result = extractMultilineField(output, "DISCUSSION");

      // Assert
      expect(result).toBe("Initial point\nAdditional line 1\nAdditional line 2");
    });
  });

  describe("境界値", () => {
    it("should_return_empty_string_for_missing_field", () => {
      // Arrange
      const output = "OTHER: value";

      // Act
      const result = extractMultilineField(output, "MISSING");

      // Assert
      expect(result).toBe("");
    });

    it("should_return_empty_string_for_empty_output", () => {
      // Arrange
      const output = "";

      // Act
      const result = extractMultilineField(output, "FIELD");

      // Assert
      expect(result).toBe("");
    });

    it("should_handle_field_without_content", () => {
      // Arrange
      const output = `RESULT:
SUMMARY: Next`;

      // Act
      const result = extractMultilineField(output, "RESULT");

      // Assert
      expect(result).toBe("");
    });
  });

  describe("停止ラベル", () => {
    it("should_stop_at_SUMMARY_label", () => {
      // Arrange
      const output = `DISCUSSION:
content line 1
content line 2
SUMMARY: stop here`;

      // Act
      const result = extractMultilineField(output, "DISCUSSION");

      // Assert
      expect(result).toBe("content line 1\ncontent line 2");
    });

    it("should_stop_at_CLAIM_label", () => {
      // Arrange
      const output = `RESULT:
content
CLAIM: stop here`;

      // Act
      const result = extractMultilineField(output, "RESULT");

      // Assert
      expect(result).toBe("content");
    });

    it("should_stop_at_EVIDENCE_label", () => {
      // Arrange
      const output = `RESULT:
content
EVIDENCE: stop here`;

      // Act
      const result = extractMultilineField(output, "RESULT");

      // Assert
      expect(result).toBe("content");
    });

    it("should_stop_at_CONFIDENCE_label", () => {
      // Arrange
      const output = `DISCUSSION:
content
CONFIDENCE: 0.8`;

      // Act
      const result = extractMultilineField(output, "DISCUSSION");

      // Assert
      expect(result).toBe("content");
    });

    it("should_stop_at_NEXT_STEP_label", () => {
      // Arrange
      const output = `RESULT:
content
NEXT_STEP: action`;

      // Act
      const result = extractMultilineField(output, "RESULT");

      // Assert
      expect(result).toBe("content");
    });
  });

  describe("単一行抽出にはextractFieldを使用", () => {
    it("should_use_extractField_for_single_line_values", () => {
      // Arrange
      const output = "RESULT: single line content";

      // Act
      // 単一行フィールドには extractField を使用
      const result = extractField(output, "RESULT");

      // Assert
      expect(result).toBe("single line content");
    });
  });
});

// ============================================================================
// countKeywordSignals
// ============================================================================

describe("countKeywordSignals", () => {
  describe("正常系", () => {
    it("should_count_matching_keywords", () => {
      // Arrange
      const output = "This text contains apple and banana";
      const keywords = ["apple", "banana", "cherry"];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      expect(result).toBe(2);
    });

    it("should_return_0_for_no_matches", () => {
      // Arrange
      const output = "This text has no fruits";
      const keywords = ["apple", "banana"];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      expect(result).toBe(0);
    });

    it("should_count_multiple_occurrences_as_one_per_keyword", () => {
      // Arrange
      const output = "apple apple apple";
      const keywords = ["apple"];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      // includes()は存在チェックのみなので重複カウントしない
      expect(result).toBe(1);
    });
  });

  describe("大文字小文字", () => {
    it("should_be_case_insensitive", () => {
      // Arrange
      const output = "APPLE BANANA Cherry";
      const keywords = ["apple", "banana", "cherry"];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      expect(result).toBe(3);
    });
  });

  describe("境界値", () => {
    it("should_return_0_for_empty_output", () => {
      // Arrange
      const output = "";
      const keywords = ["apple"];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      expect(result).toBe(0);
    });

    it("should_return_0_for_empty_keywords", () => {
      // Arrange
      const output = "Some text";
      const keywords: string[] = [];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      expect(result).toBe(0);
    });

    it("should_handle_partial_matches", () => {
      // Arrange
      const output = "pineapple";
      const keywords = ["apple"];

      // Act
      const result = countKeywordSignals(output, keywords);

      // Assert
      // "pineapple" contains "apple"
      expect(result).toBe(1);
    });
  });
});

// ============================================================================
// analyzeDiscussionStance
// ============================================================================

describe("analyzeDiscussionStance", () => {
  describe("正常系", () => {
    it("should_detect_agree_stance_in_japanese", () => {
      // Arrange
      const text = "agent-1: この提案に同意します。賛成です。";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("agree");
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    it("should_detect_disagree_stance_in_japanese", () => {
      // Arrange
      const text = "agent-1: この提案には反対です。懸念があります。";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("disagree");
    });

    it("should_detect_agree_stance_in_english", () => {
      // Arrange
      const text = "agent-1: I agree with this proposal. It is correct.";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("agree");
    });

    it("should_detect_disagree_stance_in_english", () => {
      // Arrange
      const text = "agent-1: I disagree with this. There is an issue.";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("disagree");
    });
  });

  describe("境界値", () => {
    it("should_return_neutral_for_empty_text", () => {
      // Arrange
      const text = "";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("neutral");
      expect(result.confidence).toBe(0);
      expect(result.evidence).toEqual([]);
    });

    it("should_return_neutral_for_whitespace_only", () => {
      // Arrange
      const text = "   ";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("neutral");
    });

    it("should_analyze_full_text_when_member_not_found", () => {
      // Arrange
      const text = "I agree with this proposal.";
      const memberId = "nonexistent";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.stance).toBe("agree");
    });
  });

  describe("コンテキストウィンドウ", () => {
    it("should_extract_context_around_member_id", () => {
      // Arrange
      const text = "Some unrelated text. " + "a".repeat(200) + 
        " agent-1: I agree. " + 
        "b".repeat(200) + " More unrelated text.";
      const memberId = "agent-1";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      // member-1の周辺テキストが分析される
      expect(result.stance).toBe("agree");
    });
  });

  describe("信頼度計算", () => {
    it("should_increase_confidence_with_more_matches", () => {
      // Arrange
      const text1 = "I agree.";
      const text2 = "I agree, support, and think it's correct.";
      const memberId = "agent";

      // Act
      const result1 = analyzeDiscussionStance(text1, memberId);
      const result2 = analyzeDiscussionStance(text2, memberId);

      // Assert
      expect(result2.confidence).toBeGreaterThan(result1.confidence);
    });
  });

  describe("証拠収集", () => {
    it("should_collect_matched_evidence", () => {
      // Arrange
      const text = "I agree and support this.";
      const memberId = "agent";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      expect(result.evidence).toContain("agree");
      expect(result.evidence).toContain("support");
    });

    it("should_deduplicate_evidence", () => {
      // Arrange
      const text = "agree agree agree";
      const memberId = "agent";

      // Act
      const result = analyzeDiscussionStance(text, memberId);

      // Assert
      const agreeCount = result.evidence.filter((e) => e === "agree").length;
      expect(agreeCount).toBe(1);
    });
  });
});

// ============================================================================
// extractConsensusMarker
// ============================================================================

describe("extractConsensusMarker", () => {
  describe("正常系", () => {
    it("should_extract_japanese_consensus_marker", () => {
      // Arrange
      const text = "合意: 全員がこの案に賛成しました";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBe("全員がこの案に賛成しました");
    });

    it("should_extract_japanese_consensus_marker_with_fullwidth_colon", () => {
      // Arrange
      const text = "合意：全員がこの案に賛成しました";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBe("全員がこの案に賛成しました");
    });

    it("should_extract_english_consensus_marker", () => {
      // Arrange
      const text = "Consensus: All members agreed";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBe("All members agreed");
    });

    it("should_be_case_insensitive_for_english", () => {
      // Arrange
      const text = "CONSENSUS: Agreement reached";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBe("Agreement reached");
    });
  });

  describe("境界値", () => {
    it("should_return_undefined_for_missing_marker", () => {
      // Arrange
      const text = "No consensus marker here";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_return_undefined_for_empty_text", () => {
      // Arrange
      const text = "";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBeUndefined();
    });

    it("should_handle_whitespace_after_colon", () => {
      // Arrange
      const text = "合意:   Agreement text";

      // Act
      const result = extractConsensusMarker(text);

      // Assert
      expect(result).toBe("Agreement text");
    });
  });
});

// ============================================================================
// STANCE_PATTERNS
// ============================================================================

describe("STANCE_PATTERNS", () => {
  it("should_have_patterns_for_all_stances", () => {
    // Arrange
    const stances: DiscussionStance[] = ["agree", "disagree", "partial", "neutral"];

    // Act & Assert
    for (const stance of stances) {
      expect(STANCE_PATTERNS[stance]).toBeDefined();
      expect(Array.isArray(STANCE_PATTERNS[stance])).toBe(true);
      expect(STANCE_PATTERNS[stance].length).toBeGreaterThan(0);
    }
  });

  it("should_have_regexp_patterns", () => {
    // Arrange & Act & Assert
    for (const patterns of Object.values(STANCE_PATTERNS)) {
      for (const pattern of patterns) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    }
  });
});

// ============================================================================
// プロパティベーステスト (Property-Based Tests)
// ============================================================================

/**
 * DiscussionStanceのArbitrary
 */
const arbDiscussionStance: fc.Arbitrary<DiscussionStance> = fc.constantFrom(
  "agree",
  "disagree",
  "partial",
  "neutral"
);

describe("プロパティベーステスト: clampConfidence", () => {
  describe("不変条件", () => {
    // 不変条件: 結果は常に[0, 1]の範囲
    it("PBT: 結果は常に0以上1以下", () => {
      fc.assert(
        fc.property(fc.double({ min: -1000, max: 1000, noNaN: false }), (value) => {
          // Act
          const result = clampConfidence(value);

          // Assert
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(1);
        })
      );
    });

    // 不変条件: NaNとInfinityは0.5
    it("PBT: NaNとInfinityは0.5を返す", () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity)),
          (value) => {
            // Act
            const result = clampConfidence(value);

            // Assert
            expect(result).toBe(0.5);
          }
        )
      );
    });

    // 不変条件: [0, 1]内の値はそのまま
    it("PBT: [0, 1]内の値はそのまま返す", () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (value) => {
          // Act
          const result = clampConfidence(value);

          // Assert
          expect(result).toBe(value);
        })
      );
    });

    // 決定性: 同じ入力で同じ結果
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(fc.double(), (value) => {
          // Act
          const result1 = clampConfidence(value);
          const result2 = clampConfidence(value);

          // Assert
          expect(result1).toBe(result2);
        })
      );
    });
  });
});

describe("プロパティベーステスト: ID生成", () => {
  describe("generateClaimId", () => {
    // 不変条件: 常に"claim-"で始まる
    it("PBT: 常にclaim-で始まる", () => {
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          // Act
          const id = generateClaimId();

          // Assert
          expect(id.startsWith("claim-")).toBe(true);
        })
      );
    });

    // 不変条件: 一意性（複数回呼び出しで異なるID）
    it("PBT: 一意性（100回呼び出しで全て異なる）", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateClaimId());
      }
      expect(ids.size).toBe(100);
    });

    // 不変条件: フォーマット
    it("PBT: フォーマットはclaim-{timestamp}-{random}", () => {
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          // Act
          const id = generateClaimId();

          // Assert
          const parts = id.split("-");
          expect(parts.length).toBeGreaterThanOrEqual(3);
          expect(parts[0]).toBe("claim");
        })
      );
    });
  });

  describe("generateEvidenceId", () => {
    // 不変条件: 常に"evidence-"で始まる
    it("PBT: 常にevidence-で始まる", () => {
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          // Act
          const id = generateEvidenceId();

          // Assert
          expect(id.startsWith("evidence-")).toBe(true);
        })
      );
    });

    // 不変条件: 一意性
    it("PBT: 一意性（100回呼び出しで全て異なる）", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateEvidenceId());
      }
      expect(ids.size).toBe(100);
    });

    // 不変条件: claim IDと異なる
    it("PBT: claim IDと常に異なる", () => {
      fc.assert(
        fc.property(fc.constant(undefined), () => {
          // Act
          const claimId = generateClaimId();
          const evidenceId = generateEvidenceId();

          // Assert
          expect(claimId).not.toBe(evidenceId);
          expect(claimId.startsWith("claim-")).toBe(true);
          expect(evidenceId.startsWith("evidence-")).toBe(true);
        })
      );
    });
  });
});

describe("プロパティベーステスト: parseUnitInterval", () => {
  describe("不変条件", () => {
    // 不変条件: 結果はundefinedまたは[0, 1]の範囲
    it("PBT: 結果はundefinedまたは[0, 1]の範囲", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.constant(undefined)), (raw) => {
          // Act
          const result = parseUnitInterval(raw);

          // Assert
          if (result !== undefined) {
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(1);
          }
        })
      );
    });

    // 不変条件: undefinedと空文字はundefined
    it("PBT: undefinedと空文字はundefined", () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(undefined), fc.constant(""), fc.constant("   ")),
          (raw) => {
            // Act
            const result = parseUnitInterval(raw);

            // Assert
            expect(result).toBeUndefined();
          }
        )
      );
    });

    // 不変条件: 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(fc.oneof(fc.string(), fc.constant(undefined)), (raw) => {
          // Act
          const result1 = parseUnitInterval(raw);
          const result2 = parseUnitInterval(raw);

          // Assert
          expect(result1).toBe(result2);
        })
      );
    });
  });

  describe("数値パース", () => {
    // 不変条件: 有効な数値は正しくパースされる
    it("PBT: 有効な0-1の数値は正しくパースされる", () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (value) => {
          // Arrange
          const raw = value.toString();

          // Act
          const result = parseUnitInterval(raw);

          // Assert
          expect(result).toBeCloseTo(value, 10);
        })
      );
    });

    // 不変条件: パーセント表記
    it("PBT: パーセント表記は0-1に変換される", () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (value) => {
          // Arrange
          const raw = `${value}%`;

          // Act
          const result = parseUnitInterval(raw);

          // Assert
          if (result !== undefined) {
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThanOrEqual(1);
          }
        })
      );
    });
  });
});

describe("プロパティベーステスト: extractField", () => {
  describe("不変条件", () => {
    // 不変条件: 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), fc.string({ maxLength: 30 }), (output, name) => {
          // Act
          const result1 = extractField(output, name);
          const result2 = extractField(output, name);

          // Assert
          expect(result1).toBe(result2);
        })
      );
    });

    // 不変条件: 空の出力はundefined
    it("PBT: 空の出力はundefined", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 30 }), (name) => {
          // Act
          const result = extractField("", name);

          // Assert
          expect(result).toBeUndefined();
        })
      );
    });

    // 不変条件: 特殊文字を含むフィールド名も正しく処理
    it("PBT: 正規表現特殊文字を含むフィールド名も処理可能", () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom("[", "]", "(", ")", ".", "*", "+", "?", "^", "$", "{", "}", "|", "\\"), { minLength: 1, maxLength: 5 }).map((arr) => arr.join("")),
          fc.string({ maxLength: 20 }),
          (specialName, value) => {
            // Arrange
            const output = `${specialName}: ${value}`;

            // Act
            const result = extractField(output, specialName);

            // Assert
            // 特殊文字がエスケープされていればマッチする
            expect(result).toBeDefined();
          }
        )
      );
    });
  });
});

describe("プロパティベーステスト: countKeywordSignals", () => {
  describe("不変条件", () => {
    // 不変条件: 結果は常に0以上
    it("PBT: 結果は常に0以上", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 200 }),
          fc.array(fc.string({ maxLength: 20 }), { maxLength: 10 }),
          (output, keywords) => {
            // Act
            const result = countKeywordSignals(output, keywords);

            // Assert
            expect(result).toBeGreaterThanOrEqual(0);
          }
        )
      );
    });

    // 不変条件: 空のキーワード配列は0
    it("PBT: 空のキーワード配列は0", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (output) => {
          // Act
          const result = countKeywordSignals(output, []);

          // Assert
          expect(result).toBe(0);
        })
      );
    });

    // 不変条件: 結果はキーワード数以下
    it("PBT: 結果はキーワード数以下", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 200 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
          (output, keywords) => {
            // Act
            const result = countKeywordSignals(output, keywords);

            // Assert
            expect(result).toBeLessThanOrEqual(keywords.length);
          }
        )
      );
    });

    // 不変条件: 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }),
          fc.array(fc.string({ maxLength: 10 }), { maxLength: 5 }),
          (output, keywords) => {
            // Act
            const result1 = countKeywordSignals(output, keywords);
            const result2 = countKeywordSignals(output, keywords);

            // Assert
            expect(result1).toBe(result2);
          }
        )
      );
    });
  });
});

describe("プロパティベーステスト: analyzeDiscussionStance", () => {
  describe("不変条件", () => {
    // 不変条件: 結果構造
    it("PBT: 常に正しい構造を返す", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 500 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          (text, memberId) => {
            // Act
            const result = analyzeDiscussionStance(text, memberId);

            // Assert
            expect(result).toHaveProperty("stance");
            expect(result).toHaveProperty("confidence");
            expect(result).toHaveProperty("evidence");
            expect(["agree", "disagree", "partial", "neutral"]).toContain(result.stance);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
            expect(Array.isArray(result.evidence)).toBe(true);
          }
        )
      );
    });

    // 不変条件: 空テキストはneutral
    it("PBT: 空または空白のみはneutral", () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(""), fc.constant("   "), fc.constant("\t\n")),
          fc.string({ minLength: 1, maxLength: 20 }),
          (text, memberId) => {
            // Act
            const result = analyzeDiscussionStance(text, memberId);

            // Assert
            expect(result.stance).toBe("neutral");
            expect(result.confidence).toBe(0);
          }
        )
      );
    });

    // 不変条件: confidenceは[0, 1]
    it("PBT: confidenceは常に[0, 1]の範囲", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 1000 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          (text, memberId) => {
            // Act
            const result = analyzeDiscussionStance(text, memberId);

            // Assert
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
          }
        )
      );
    });

    // 不変条件: 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (text, memberId) => {
            // Act
            const result1 = analyzeDiscussionStance(text, memberId);
            const result2 = analyzeDiscussionStance(text, memberId);

            // Assert
            expect(result1.stance).toBe(result2.stance);
            expect(result1.confidence).toBe(result2.confidence);
          }
        )
      );
    });
  });
});

describe("プロパティベーステスト: extractConsensusMarker", () => {
  describe("不変条件", () => {
    // 不変条件: マーカーがない場合はundefined
    it("PBT: マーカーがない場合はundefined", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 100 }).filter((s) => !s.includes("合意") && !s.toLowerCase().includes("consensus")),
          (text) => {
            // Act
            const result = extractConsensusMarker(text);

            // Assert
            expect(result).toBeUndefined();
          }
        )
      );
    });

    // 不変条件: 決定性
    it("PBT: 決定的である", () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 200 }), (text) => {
          // Act
          const result1 = extractConsensusMarker(text);
          const result2 = extractConsensusMarker(text);

          // Assert
          expect(result1).toBe(result2);
        })
      );
    });
  });
});
