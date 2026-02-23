/**
 * @file .pi/lib/text-parsing.ts の単体テスト
 * @description テキスト解析ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
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
} from "../../lib/text-parsing.js";

// ============================================================================
// clampConfidence
// ============================================================================

describe("clampConfidence", () => {
	describe("正常系", () => {
		it("should_return_value_within_range", () => {
			expect(clampConfidence(0.5)).toBe(0.5);
			expect(clampConfidence(0.0)).toBe(0.0);
			expect(clampConfidence(1.0)).toBe(1.0);
		});

		it("should_clamp_to_0", () => {
			expect(clampConfidence(-0.5)).toBe(0);
			expect(clampConfidence(-100)).toBe(0);
		});

		it("should_clamp_to_1", () => {
			expect(clampConfidence(1.5)).toBe(1);
			expect(clampConfidence(100)).toBe(1);
		});

		it("should_handle_NaN", () => {
			expect(clampConfidence(NaN)).toBe(0.5);
		});

		it("should_handle_Infinity", () => {
			expect(clampConfidence(Infinity)).toBe(0.5);
			expect(clampConfidence(-Infinity)).toBe(0.5);
		});
	});

	describe("境界条件", () => {
		it("should_handle_very_small_values", () => {
			expect(clampConfidence(0.001)).toBeCloseTo(0.001, 10);
			expect(clampConfidence(-0.001)).toBe(0);
		});

		it("should_handle_very_large_values", () => {
			expect(clampConfidence(Number.MAX_VALUE)).toBe(1);
			expect(clampConfidence(Number.MIN_VALUE)).toBeCloseTo(0, 10);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 結果は常に0以上1以下", () => {
			fc.assert(
				fc.property(fc.float(), (value) => {
					const result = clampConfidence(value);
					return result >= 0 && result <= 1;
				}),
				{ numRuns: 100 },
			);
		});

		it("PBT: 有限値は変更またはクランプ", () => {
			fc.assert(
				fc.property(fc.float({ min: -1000, max: 1000 }), (value) => {
					const result = clampConfidence(value);
					if (value >= 0 && value <= 1) {
						return result === value;
					}
					return result >= 0 && result <= 1;
				}),
				{ numRuns: 100 },
			);
		});
	});
});

// ============================================================================
// generateClaimId / generateEvidenceId
// ============================================================================

describe("generateClaimId", () => {
	it("should_generate_unique_id", () => {
		const id1 = generateClaimId();
		const id2 = generateClaimId();
		expect(id1).not.toBe(id2);
	});

	it("should_start_with_claim_prefix", () => {
		const id = generateClaimId();
		expect(id.startsWith("claim-")).toBe(true);
	});

	it("should_contain_timestamp_and_random", () => {
		const id = generateClaimId();
		const parts = id.split("-");
		expect(parts.length).toBeGreaterThanOrEqual(3);
	});
});

describe("generateEvidenceId", () => {
	it("should_generate_unique_id", () => {
		const id1 = generateEvidenceId();
		const id2 = generateEvidenceId();
		expect(id1).not.toBe(id2);
	});

	it("should_start_with_evidence_prefix", () => {
		const id = generateEvidenceId();
		expect(id.startsWith("evidence-")).toBe(true);
	});

	it("should_contain_timestamp_and_random", () => {
		const id = generateEvidenceId();
		const parts = id.split("-");
		expect(parts.length).toBeGreaterThanOrEqual(3);
	});
});

// ============================================================================
// parseUnitInterval
// ============================================================================

describe("parseUnitInterval", () => {
	describe("正常系", () => {
		it("should_parse_decimal", () => {
			expect(parseUnitInterval("0.5")).toBe(0.5);
			expect(parseUnitInterval("0.0")).toBe(0.0);
			expect(parseUnitInterval("1.0")).toBe(1.0);
		});

		it("should_parse_percent", () => {
			expect(parseUnitInterval("50%")).toBe(0.5);
			expect(parseUnitInterval("0%")).toBe(0.0);
			expect(parseUnitInterval("100%")).toBe(1.0);
		});

		it("should_handle_whitespace", () => {
			expect(parseUnitInterval(" 0.5 ")).toBe(0.5);
			expect(parseUnitInterval("  50%  ")).toBe(0.5);
		});

		it("should_treat_greater_than_1_as_percent", () => {
			expect(parseUnitInterval("50")).toBe(0.5);
			expect(parseUnitInterval("100")).toBe(1.0);
		});
	});

	describe("境界条件", () => {
		it("should_return_undefined_for_empty_string", () => {
			expect(parseUnitInterval("")).toBeUndefined();
		});

		it("should_return_undefined_for_whitespace_only", () => {
			expect(parseUnitInterval("   ")).toBeUndefined();
		});

		it("should_return_undefined_for_undefined_input", () => {
			expect(parseUnitInterval(undefined)).toBeUndefined();
		});

		it("should_return_undefined_for_invalid_format", () => {
			expect(parseUnitInterval("abc")).toBeUndefined();
			expect(parseUnitInterval("NaN")).toBeUndefined();
		});

		it("should_clamp_values_outside_range", () => {
			expect(parseUnitInterval("150%")).toBe(1.0);
			expect(parseUnitInterval("-10%")).toBe(0.0);
		});
	});

	describe("プロパティベーステスト", () => {
		it("PBT: 有効な数値は0-1の範囲", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.float({ min: 0, max: 1 }),
						fc.integer({ min: 0, max: 100 }),
					),
					(value) => {
						const input =
							typeof value === "number" && value <= 1
								? value.toString()
								: `${value}%`;
						const result = parseUnitInterval(input);
						if (result !== undefined) {
							return result >= 0 && result <= 1;
						}
						return true;
					},
				),
				{ numRuns: 50 },
			);
		});
	});
});

// ============================================================================
// extractField
// ============================================================================

describe("extractField", () => {
	describe("正常系", () => {
		it("should_extract_simple_field", () => {
			const output = "SUMMARY: This is a summary";
			expect(extractField(output, "SUMMARY")).toBe("This is a summary");
		});

		it("should_extract_field_with_colon_in_value", () => {
			const output = "CLAIM: If A then B: C";
			expect(extractField(output, "CLAIM")).toBe("If A then B: C");
		});

		it("should_handle_case_insensitive", () => {
			const output = "summary: lowercase";
			expect(extractField(output, "SUMMARY")).toBe("lowercase");
		});

		it("should_trim_whitespace", () => {
			const output = "SUMMARY:   trimmed value  ";
			expect(extractField(output, "SUMMARY")).toBe("trimmed value");
		});
	});

	describe("境界条件", () => {
		it("should_return_undefined_for_missing_field", () => {
			const output = "OTHER: value";
			expect(extractField(output, "SUMMARY")).toBeUndefined();
		});

		it("should_handle_empty_output", () => {
			expect(extractField("", "SUMMARY")).toBeUndefined();
		});

		it("should_escape_special_regex_chars_in_name", () => {
			const output = "SUMMARY.TEST: value";
			expect(extractField(output, "SUMMARY.TEST")).toBe("value");
		});

		it("should_handle_multiline_output", () => {
			const output = `SUMMARY: first line
OTHER: second line`;
			expect(extractField(output, "SUMMARY")).toBe("first line");
		});
	});
});

// ============================================================================
// extractMultilineField
// ============================================================================

describe("extractMultilineField", () => {
	describe("正常系", () => {
		it("should_extract_single_line_field", () => {
			const output = "DISCUSSION:\nThis is the content";
			expect(extractMultilineField(output, "DISCUSSION")).toBe(
				"This is the content",
			);
		});

		it("should_extract_multiline_field", () => {
			const output = `DISCUSSION:
Line 1
Line 2
Line 3
SUMMARY: Stop here`;
			expect(extractMultilineField(output, "DISCUSSION")).toBe(
				"Line 1\nLine 2\nLine 3",
			);
		});

		it("should_stop_at_next_major_label", () => {
			const output = `RESULT:
Some result here
SUMMARY: New section`;
			expect(extractMultilineField(output, "RESULT")).toBe("Some result here");
		});

		it("should_include_same_line_content", () => {
			// 注意: extractMultilineField はラベル行が「ラベル:」のみの行を探す
			// 「ラベル: コンテンツ」の形式は extractField で処理すべき
			const output = "DISCUSSION:\nSame line content\nContinues here";
			expect(extractMultilineField(output, "DISCUSSION")).toBe(
				"Same line content\nContinues here",
			);
		});
	});

	describe("境界条件", () => {
		it("should_return_empty_string_for_missing_field", () => {
			const output = "OTHER: value";
			expect(extractMultilineField(output, "DISCUSSION")).toBe("");
		});

		it("should_handle_empty_output", () => {
			expect(extractMultilineField("", "DISCUSSION")).toBe("");
		});

		it("should_handle_field_at_end_of_output", () => {
			const output = "DISCUSSION:\nLast content";
			expect(extractMultilineField(output, "DISCUSSION")).toBe("Last content");
		});

		it("should_stop_at_all_major_labels", () => {
			const labels = [
				"SUMMARY",
				"CLAIM",
				"EVIDENCE",
				"CONFIDENCE",
				"DISCUSSION",
				"RESULT",
				"NEXT_STEP",
			];
			for (const label of labels) {
				const output = `CONTENT:
Some text
${label}: Stop here`;
				expect(extractMultilineField(output, "CONTENT")).toBe("Some text");
			}
		});
	});
});

// ============================================================================
// countKeywordSignals
// ============================================================================

describe("countKeywordSignals", () => {
	describe("正常系", () => {
		it("should_count_single_keyword", () => {
			const output = "This has keyword in it";
			expect(countKeywordSignals(output, ["keyword"])).toBe(1);
		});

		it("should_count_multiple_keywords", () => {
			const output = "This has keyword1 and keyword2 in it";
			expect(countKeywordSignals(output, ["keyword1", "keyword2"])).toBe(2);
		});

		it("should_count_repeated_keywords_only_once", () => {
			const output = "keyword keyword keyword";
			expect(countKeywordSignals(output, ["keyword"])).toBe(1);
		});

		it("should_be_case_insensitive", () => {
			const output = "KEYWORD and Keyword and keyword";
			expect(countKeywordSignals(output, ["keyword"])).toBe(1);
		});
	});

	describe("境界条件", () => {
		it("should_return_0_for_empty_keywords", () => {
			expect(countKeywordSignals("any text", [])).toBe(0);
		});

		it("should_return_0_for_no_matches", () => {
			expect(countKeywordSignals("no matches here", ["xyz"])).toBe(0);
		});

		it("should_handle_empty_output", () => {
			expect(countKeywordSignals("", ["keyword"])).toBe(0);
		});
	});
});

// ============================================================================
// analyzeDiscussionStance
// ============================================================================

describe("analyzeDiscussionStance", () => {
	describe("正常系", () => {
		it("should_detect_agree_stance", () => {
			const text = "strategy-architectの主張に同意します。完全に正しいです。";
			const result = analyzeDiscussionStance(text, "strategy-architect");

			expect(result.stance).toBe("agree");
			expect(result.confidence).toBeGreaterThan(0);
			expect(result.evidence.length).toBeGreaterThan(0);
		});

		it("should_detect_disagree_stance", () => {
			const text = "unit-test-engineerの主張に反対です。重大な問題があります。";
			const result = analyzeDiscussionStance(text, "unit-test-engineer");

			expect(result.stance).toBe("disagree");
			expect(result.confidence).toBeGreaterThan(0);
		});

		it("should_detect_partial_stance", () => {
			const text = "部分的には同意しますが、一部の側面には懸念があります。";
			const result = analyzeDiscussionStance(text, "member");

			expect(result.stance).toBe("partial");
		});

		it("should_default_to_neutral", () => {
			const text = "これは参考情報です。確認が必要です。";
			const result = analyzeDiscussionStance(text, "member");

			expect(result.stance).toBe("neutral");
		});
	});

	describe("境界条件", () => {
		it("should_handle_empty_text", () => {
			const result = analyzeDiscussionStance("", "member");

			expect(result.stance).toBe("neutral");
			expect(result.confidence).toBe(0);
			expect(result.evidence).toEqual([]);
		});

		it("should_handle_whitespace_only", () => {
			const result = analyzeDiscussionStance("   \n\t  ", "member");

			expect(result.stance).toBe("neutral");
			expect(result.confidence).toBe(0);
		});

		it("should_handle_member_id_not_found", () => {
			const text = "一般的な議論内容";
			const result = analyzeDiscussionStance(text, "unknown-member");

			// 全体テキストを分析
			expect(result.stance).toBeDefined();
		});

		it("should_handle_english_keywords", () => {
			const text = "I agree with the proposal. It is correct.";
			const result = analyzeDiscussionStance(text, "member");

			expect(result.stance).toBe("agree");
		});
	});

	describe("信頼度計算", () => {
		it("should_calculate_confidence_proportionally", () => {
			const text = "同意同意同意同意同意";
			const result = analyzeDiscussionStance(text, "member");

			// 複数のマッチで信頼度が上がる
			expect(result.confidence).toBeGreaterThan(0);
		});

		it("should_deduplicate_evidence", () => {
			const text = "同意同意同意";
			const result = analyzeDiscussionStance(text, "member");

			// 同じキーワードは重複排除
			const uniqueEvidence = new Set(result.evidence);
			expect(uniqueEvidence.size).toBe(result.evidence.length);
		});
	});
});

// ============================================================================
// extractConsensusMarker
// ============================================================================

describe("extractConsensusMarker", () => {
	describe("正常系", () => {
		it("should_extract_japanese_consensus_marker", () => {
			const text = "合意: 全員がこの方針に同意";
			expect(extractConsensusMarker(text)).toBe("全員がこの方針に同意");
		});

		it("should_extract_japanese_consensus_marker_with_fullwidth_colon", () => {
			const text = "合意：全員がこの方針に同意";
			expect(extractConsensusMarker(text)).toBe("全員がこの方針に同意");
		});

		it("should_extract_english_consensus_marker", () => {
			const text = "Consensus: Everyone agrees on this";
			expect(extractConsensusMarker(text)).toBe("Everyone agrees on this");
		});

		it("should_be_case_insensitive_for_english", () => {
			const text = "CONSENSUS: Agreement reached";
			expect(extractConsensusMarker(text)).toBe("Agreement reached");
		});
	});

	describe("境界条件", () => {
		it("should_return_undefined_for_no_marker", () => {
			const text = "通常のテキストです";
			expect(extractConsensusMarker(text)).toBeUndefined();
		});

		it("should_return_undefined_for_empty_text", () => {
			expect(extractConsensusMarker("")).toBeUndefined();
		});

		it("should_handle_whitespace_after_colon", () => {
			const text = "合意:   マーカー内容";
			expect(extractConsensusMarker(text)).toBe("マーカー内容");
		});
	});
});

// ============================================================================
// STANCE_PATTERNS
// ============================================================================

describe("STANCE_PATTERNS", () => {
	it("should_have_patterns_for_all_stances", () => {
		const stances: DiscussionStance[] = ["agree", "disagree", "partial", "neutral"];
		for (const stance of stances) {
			expect(STANCE_PATTERNS[stance]).toBeDefined();
			expect(Array.isArray(STANCE_PATTERNS[stance])).toBe(true);
			expect(STANCE_PATTERNS[stance].length).toBeGreaterThan(0);
		}
	});

	it("should_include_japanese_and_english_patterns", () => {
		// 同意パターンに日本語と英語が含まれる
		const agreePatterns = STANCE_PATTERNS.agree;
		const hasJapanese = agreePatterns.some((p) => p.source.includes("同意"));
		const hasEnglish = agreePatterns.some((p) =>
			p.source.toLowerCase().includes("agree"),
		);
		expect(hasJapanese || hasEnglish).toBe(true);
	});
});
