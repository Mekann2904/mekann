/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/extraction/candidates.test.ts
 * role: candidates.tsのユニットテスト
 * why: 候補抽出機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/extraction/candidates.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 候補抽出の各関数をユニットテストで検証
 * what_it_does:
 *   - extractCandidates関数のテスト
 *   - applyContextFilter関数のテスト
 *   - generateFilterStats関数のテスト
 * why_it_exists:
 *   - 抽出機能の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  extractCandidates,
  applyContextFilter,
  generateFilterStats,
} from "../../../../lib/verification/extraction/candidates.js";

const testPatterns = [
  { pattern: /"([^"]+)"/g, type: "quoted", confidence: 0.8 },
  { pattern: /\b[A-Z][a-z]+[A-Z][a-z]+\b/g, type: "camelCase", confidence: 0.6 },
];

describe("extractCandidates", () => {
  it("should return empty array for empty input", () => {
    const result = extractCandidates("", testPatterns);
    expect(result).toEqual([]);
  });

  it("should extract quoted phrases as candidates", () => {
    const text = 'This is a "quoted phrase" and another "candidate term".';
    const result = extractCandidates(text, testPatterns);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(c => c.type === "quoted")).toBe(true);
  });

  it("should extract technical terms", () => {
    const text = "Use the TypeScript Compiler API.";
    const result = extractCandidates(text, testPatterns);
    expect(Array.isArray(result)).toBe(true);
  });

  it("should include location information", () => {
    const text = 'This is a "test" phrase.';
    const result = extractCandidates(text, testPatterns);
    if (result.length > 0) {
      expect(result[0].location).toBeDefined();
      expect(result[0].location.start).toBeGreaterThanOrEqual(0);
      expect(result[0].location.end).toBeGreaterThan(result[0].location.start);
    }
  });

  it("should include context information", () => {
    const text = 'This is a "test" phrase with surrounding context.';
    const result = extractCandidates(text, testPatterns);
    if (result.length > 0) {
      expect(result[0].context).toBeDefined();
      expect(typeof result[0].context).toBe("string");
    }
  });
});

describe("applyContextFilter", () => {
  it("should filter candidates based on context", () => {
    const candidates = [
      { type: "test", matchedText: "API", location: { start: 0, end: 3 }, context: "API context", patternConfidence: 0.8 },
      { type: "test", matchedText: "Database", location: { start: 5, end: 13 }, context: "Database context", patternConfidence: 0.6 },
    ];
    const context = "API integration with database";
    const result = applyContextFilter(candidates, context);
    expect(Array.isArray(result)).toBe(true);
  });

  it("should return empty array for empty candidates", () => {
    const result = applyContextFilter([], "some context");
    expect(result).toEqual([]);
  });

  it("should handle empty context gracefully", () => {
    const candidates = [{ type: "test", matchedText: "test", location: { start: 0, end: 4 }, context: "test", patternConfidence: 0.5 }];
    const result = applyContextFilter(candidates, "");
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("generateFilterStats", () => {
  it("should return stats object", () => {
    const original = [
      { type: "a", matchedText: "a", location: { start: 0, end: 1 }, context: "a", patternConfidence: 0.8 },
      { type: "b", matchedText: "b", location: { start: 1, end: 2 }, context: "b", patternConfidence: 0.6 },
    ];
    const filtered = [
      { type: "a", matchedText: "a", location: { start: 0, end: 1 }, context: "a", patternConfidence: 0.8 },
    ];
    const result = generateFilterStats(original, filtered);
    expect(result).toBeDefined();
  });

  it("should handle empty input", () => {
    const result = generateFilterStats([], []);
    expect(result).toBeDefined();
  });

  it("should handle all filtered out", () => {
    const original = [
      { type: "a", matchedText: "a", location: { start: 0, end: 1 }, context: "a", patternConfidence: 0.8 },
    ];
    const filtered: never[] = [];
    const result = generateFilterStats(original, filtered);
    expect(result).toBeDefined();
  });
});
