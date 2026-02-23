/**
 * @abdd.meta
 * path: .pi/tests/lib/text-utils.test.ts
 * role: text-utils.tsのユニットテスト
 * why: 文字列処理ユーティリティの正確性を保証するため
 * related: .pi/lib/text-utils.ts
 * public_api: テストケースの実行
 * invariants: テストは冪等性を持つ
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: truncateText, truncateTextWithMarker, toPreview, normalizeOptionalText, throwIfAbortedのテスト
 * what_it_does: 各関数の境界値、通常動作、エッジケースを検証
 * why_it_exists: テキスト処理の品質保証とリグレッション防止
 * scope:
 *   in: テスト用文字列、パラメータ
 *   out: テスト結果
 */

import { describe, it, expect } from "vitest";
import {
  truncateText,
  truncateTextWithMarker,
  toPreview,
  normalizeOptionalText,
  throwIfAborted,
} from "../../lib/text-utils.js";

// ============================================================================
// truncateText Tests
// ============================================================================

describe("truncateText", () => {
  it("短いテキストはそのまま返す", () => {
    // Arrange
    const text = "こんにちは";
    const maxLength = 10;

    // Act
    const result = truncateText(text, maxLength);

    // Assert
    expect(result).toBe("こんにちは");
  });

  it("長いテキストは切り詰めて...を付与する", () => {
    // Arrange
    const text = "これは非常に長いテキストです";
    const maxLength = 10;

    // Act
    const result = truncateText(text, maxLength);

    // Assert - maxLength - 3 = 7文字 + "..."
    expect(result).toBe("これは非常に長...");
    expect(result.length).toBe(10);
  });

  it("maxLengthが3以下の場合は切り詰めのみ行う", () => {
    // Arrange
    const text = "テスト";
    const maxLength = 2;

    // Act
    const result = truncateText(text, maxLength);

    // Assert - slice(0, 2)で"テス"になる
    expect(result).toBe("テス");
  });

  it("空文字はそのまま返す", () => {
    // Arrange
    const text = "";
    const maxLength = 10;

    // Act
    const result = truncateText(text, maxLength);

    // Assert
    expect(result).toBe("");
  });

  it("maxLengthと同じ長さのテキストはそのまま返す", () => {
    // Arrange
    const text = "12345";
    const maxLength = 5;

    // Act
    const result = truncateText(text, maxLength);

    // Assert
    expect(result).toBe("12345");
  });

  it("maxLengthが0の場合は空文字を返す", () => {
    // Arrange
    const text = "テスト";
    const maxLength = 0;

    // Act
    const result = truncateText(text, maxLength);

    // Assert
    expect(result).toBe("");
  });
});

// ============================================================================
// truncateTextWithMarker Tests
// ============================================================================

describe("truncateTextWithMarker", () => {
  it("短いテキストはそのまま返す", () => {
    // Arrange
    const value = "短い";
    const maxChars = 10;

    // Act
    const result = truncateTextWithMarker(value, maxChars);

    // Assert
    expect(result).toBe("短い");
  });

  it("長いテキストは切り詰めてtruncatedマーカーを付与する", () => {
    // Arrange
    const value = "これは長いテキストです";
    const maxChars = 5;

    // Act
    const result = truncateTextWithMarker(value, maxChars);

    // Assert - slice(0, 5)で"これは長い"になる
    expect(result).toBe("これは長い\n...[truncated]");
  });

  it("maxCharsと同じ長さのテキストはそのまま返す", () => {
    // Arrange
    const value = "12345";
    const maxChars = 5;

    // Act
    const result = truncateTextWithMarker(value, maxChars);

    // Assert
    expect(result).toBe("12345");
  });

  it("空文字はそのまま返す", () => {
    // Arrange
    const value = "";
    const maxChars = 10;

    // Act
    const result = truncateTextWithMarker(value, maxChars);

    // Assert
    expect(result).toBe("");
  });
});

// ============================================================================
// toPreview Tests
// ============================================================================

describe("toPreview", () => {
  it("短いテキストはそのまま返す", () => {
    // Arrange
    const value = "プレビュー";
    const maxChars = 10;

    // Act
    const result = toPreview(value, maxChars);

    // Assert
    expect(result).toBe("プレビュー");
  });

  it("長いテキストは切り詰めて...を付与する", () => {
    // Arrange
    const value = "これは非常に長いテキストです";
    const maxChars = 10;

    // Act
    const result = toPreview(value, maxChars);

    // Assert - slice(0, 10)で"これは非常に長いテキ"になる
    expect(result).toBe("これは非常に長いテキ...");
  });

  it("空文字またはfalsy値は空文字を返す", () => {
    // Arrange & Act & Assert
    expect(toPreview("", 10)).toBe("");
    expect(toPreview(null as any, 10)).toBe("");
    expect(toPreview(undefined as any, 10)).toBe("");
  });

  it("maxCharsと同じ長さのテキストはそのまま返す", () => {
    // Arrange
    const value = "12345";
    const maxChars = 5;

    // Act
    const result = toPreview(value, maxChars);

    // Assert
    expect(result).toBe("12345");
  });
});

// ============================================================================
// normalizeOptionalText Tests
// ============================================================================

describe("normalizeOptionalText", () => {
  it("文字列はトリムして返す", () => {
    // Arrange
    const value = "  テスト  ";

    // Act
    const result = normalizeOptionalText(value);

    // Assert
    expect(result).toBe("テスト");
  });

  it("空白のみの文字列はundefinedを返す", () => {
    // Arrange
    const value = "   ";

    // Act
    const result = normalizeOptionalText(value);

    // Assert
    expect(result).toBeUndefined();
  });

  it("空文字はundefinedを返す", () => {
    // Arrange
    const value = "";

    // Act
    const result = normalizeOptionalText(value);

    // Assert
    expect(result).toBeUndefined();
  });

  it("非文字列値はundefinedを返す", () => {
    // Arrange & Act & Assert
    expect(normalizeOptionalText(null)).toBeUndefined();
    expect(normalizeOptionalText(undefined)).toBeUndefined();
    expect(normalizeOptionalText(123)).toBeUndefined();
    expect(normalizeOptionalText({})).toBeUndefined();
  });

  it("通常の文字列はトリムして返す", () => {
    // Arrange
    const value = "テスト";

    // Act
    const result = normalizeOptionalText(value);

    // Assert
    expect(result).toBe("テスト");
  });
});

// ============================================================================
// throwIfAborted Tests
// ============================================================================

describe("throwIfAborted", () => {
  it("abortedでないsignalは例外を投げない", () => {
    // Arrange
    const controller = new AbortController();

    // Act & Assert
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it("abortedのsignalは例外を投げる", () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();

    // Act & Assert
    expect(() => throwIfAborted(controller.signal)).toThrow("aborted");
  });

  it("カスタムメッセージを指定できる", () => {
    // Arrange
    const controller = new AbortController();
    controller.abort();

    // Act & Assert
    expect(() => throwIfAborted(controller.signal, "カスタムエラー")).toThrow("カスタムエラー");
  });

  it("undefinedのsignalは例外を投げない", () => {
    // Arrange & Act & Assert
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });
});
