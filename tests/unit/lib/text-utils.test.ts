/**
 * @abdd.meta
 * path: tests/unit/lib/text-utils.test.ts
 * role: text-utils.tsのユニットテスト
 * why: テキスト処理ユーティリティの正確性を保証するため
 * related: .pi/lib/text-utils.ts
 * public_api: テストケースの実行
 * invariants: なし
 * side_effects: なし（テストのみ）
 * failure_modes: テスト失敗は関数の不具合を示す
 * @abdd.explain
 * overview: text-utils.tsの関数を包括的にテストするスイート
 * what_it_does:
 *   - truncateTextの境界値テスト
 *   - truncateTextWithMarkerのテスト
 *   - toPreviewのテスト
 *   - normalizeOptionalTextのテスト
 *   - throwIfAbortedのテスト
 * why_it_exists:
 *   - 拡張機能間で共有されるテキスト処理の品質を保証するため
 * scope:
 *   in: text-utils.ts
 *   out: テスト結果とカバレッジレポート
 */

import { describe, it, expect } from "vitest";
import {
  truncateText,
  truncateTextWithMarker,
  toPreview,
  normalizeOptionalText,
  throwIfAborted,
} from "../../../.pi/lib/text-utils.js";

// ============================================================================
// truncateText Tests
// ============================================================================

describe("text-utils.ts", () => {
  describe("truncateText", () => {
    describe("正常系", () => {
      it("テキストが最大長以下の場合そのまま返す", () => {
        // Arrange
        const text = "short text";
        const maxLength = 20;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("short text");
      });

      it("テキストが最大長と等しい場合そのまま返す", () => {
        // Arrange
        const text = "12345";
        const maxLength = 5;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("12345");
      });

      it("テキストが最大長を超える場合切り詰めて...を付ける", () => {
        // Arrange
        const text = "this is a long text";
        const maxLength = 10;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("this is...");
        expect(result.length).toBe(maxLength);
      });

      it("日本語テキストも正しく切り詰める", () => {
        // Arrange
        const text = "これは長い日本語のテキストです";
        const maxLength = 10;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("これは長い日本語の...");
        expect(result.length).toBe(maxLength);
      });
    });

    describe("境界値テスト", () => {
      it("maxLengthが3の場合...を付けずに3文字で返す", () => {
        // Arrange
        const text = "12345";
        const maxLength = 3;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("123");
      });

      it("maxLengthが2の場合2文字で返す", () => {
        // Arrange
        const text = "12345";
        const maxLength = 2;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("12");
      });

      it("maxLengthが1の場合1文字で返す", () => {
        // Arrange
        const text = "12345";
        const maxLength = 1;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("1");
      });

      it("maxLengthが0の場合空文字を返す", () => {
        // Arrange
        const text = "12345";
        const maxLength = 0;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("");
      });

      it("空文字を渡した場合空文字を返す", () => {
        // Arrange
        const text = "";
        const maxLength = 10;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("");
      });
    });
  });

  // ============================================================================
  // truncateTextWithMarker Tests
  // ============================================================================

  describe("truncateTextWithMarker", () => {
    describe("正常系", () => {
      it("テキストが最大長以下の場合そのまま返す", () => {
        // Arrange
        const text = "short";
        const maxChars = 10;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe("short");
      });

      it("テキストが最大長を超える場合truncatedマーカーを付ける", () => {
        // Arrange
        const text = "this is a very long text";
        const maxChars = 10;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe("this is a \n...[truncated]");
      });
    });

    describe("境界値テスト", () => {
      it("maxCharsが0の場合マーカーのみ返す", () => {
        // Arrange
        const text = "test";
        const maxChars = 0;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe("\n...[truncated]");
      });

      it("日本語テキストも正しく処理する", () => {
        // Arrange
        const text = "これはテストです";
        const maxChars = 4;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe("これはテ\n...[truncated]");
      });
    });
  });

  // ============================================================================
  // toPreview Tests
  // ============================================================================

  describe("toPreview", () => {
    describe("正常系", () => {
      it("テキストが最大長以下の場合そのまま返す", () => {
        // Arrange
        const text = "preview text";
        const maxChars = 20;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("preview text");
      });

      it("テキストが最大長を超える場合...を付ける", () => {
        // Arrange
        const text = "this is a long preview text";
        const maxChars = 10;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("this is a ...");
      });
    });

    describe("境界値テスト", () => {
      it("空文字の場合空文字を返す", () => {
        // Arrange
        const text = "";
        const maxChars = 10;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("");
      });

      it("nullまたはundefinedの場合空文字を返す", () => {
        // Arrange
        const nullText = null as unknown as string;
        const undefinedText = undefined as unknown as string;
        const maxChars = 10;

        // Act
        const nullResult = toPreview(nullText, maxChars);
        const undefinedResult = toPreview(undefinedText, maxChars);

        // Assert
        expect(nullResult).toBe("");
        expect(undefinedResult).toBe("");
      });
    });
  });

  // ============================================================================
  // normalizeOptionalText Tests
  // ============================================================================

  describe("normalizeOptionalText", () => {
    describe("正常系", () => {
      it("文字列の場合トリムして返す", () => {
        // Arrange
        const value = "  hello world  ";

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBe("hello world");
      });

      it("空白のみの文字列の場合undefinedを返す", () => {
        // Arrange
        const value = "   ";

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("空文字の場合undefinedを返す", () => {
        // Arrange
        const value = "";

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });
    });

    describe("型変換テスト", () => {
      it("数値の場合undefinedを返す", () => {
        // Arrange
        const value = 123;

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("nullの場合undefinedを返す", () => {
        // Arrange
        const value = null;

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("undefinedの場合undefinedを返す", () => {
        // Arrange
        const value = undefined;

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("オブジェクトの場合undefinedを返す", () => {
        // Arrange
        const value = { key: "value" };

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // throwIfAborted Tests
  // ============================================================================

  describe("throwIfAborted", () => {
    describe("正常系", () => {
      it("abortedでないSignalの場合例外を投げない", () => {
        // Arrange
        const controller = new AbortController();

        // Act & Assert
        expect(() => throwIfAborted(controller.signal)).not.toThrow();
      });

      it("undefinedの場合例外を投げない", () => {
        // Act & Assert
        expect(() => throwIfAborted(undefined)).not.toThrow();
      });
    });

    describe("異常系", () => {
      it("abortedのSignalの場合デフォルトメッセージで例外を投げる", () => {
        // Arrange
        const controller = new AbortController();
        controller.abort();

        // Act & Assert
        expect(() => throwIfAborted(controller.signal)).toThrow("aborted");
      });

      it("abortedのSignalの場合カスタムメッセージで例外を投げる", () => {
        // Arrange
        const controller = new AbortController();
        controller.abort();
        const customMessage = "Operation was cancelled";

        // Act & Assert
        expect(() => throwIfAborted(controller.signal, customMessage)).toThrow(
          customMessage
        );
      });

      it("abortedのSignalの場合日本語メッセージで例外を投げる", () => {
        // Arrange
        const controller = new AbortController();
        controller.abort();
        const customMessage = "操作がキャンセルされました";

        // Act & Assert
        expect(() => throwIfAborted(controller.signal, customMessage)).toThrow(
          customMessage
        );
      });
    });
  });

  // ============================================================================
  // プロパティベーステスト
  // ============================================================================

  describe("プロパティベーステスト", () => {
    it("truncateTextは常に元のテキスト以下の長さを返す", () => {
      // Arrange
      const testCases = [
        { text: "short", maxLength: 10 },
        { text: "exactly ten!", maxLength: 10 },
        { text: "this is a longer text", maxLength: 10 },
        { text: "日本語テキスト", maxLength: 5 },
        { text: "", maxLength: 5 },
      ];

      // Act & Assert
      testCases.forEach(({ text, maxLength }) => {
        const result = truncateText(text, maxLength);
        expect(result.length).toBeLessThanOrEqual(maxLength);
      });
    });

    it("truncateTextWithMarkerは切り詰め時に必ずマーカーを含む", () => {
      // Arrange
      const testCases = [
        { text: "short", maxChars: 100 },
        { text: "long text here", maxChars: 5 },
        { text: "very long text here", maxChars: 10 },
      ];

      // Act & Assert
      testCases.forEach(({ text, maxChars }) => {
        const result = truncateTextWithMarker(text, maxChars);
        if (text.length > maxChars) {
          expect(result).toContain("[truncated]");
        } else {
          expect(result).not.toContain("[truncated]");
        }
      });
    });

    it("normalizeOptionalTextは冪等である", () => {
      // Arrange
      const testCases = ["text", "  text  ", "", "   ", null, undefined, 123];

      // Act & Assert
      testCases.forEach((value) => {
        const result1 = normalizeOptionalText(value);
        const result2 = normalizeOptionalText(result1);
        // 最初の結果が文字列またはundefinedの場合、2回目は同じ結果になる
        if (typeof result1 === "string") {
          expect(result2).toBe(result1.trim() || undefined);
        } else {
          expect(result2).toBeUndefined();
        }
      });
    });

    it("toPreviewは空入力に対して冪等である", () => {
      // Arrange
      const emptyValues = ["", null as unknown as string, undefined as unknown as string];
      const maxChars = 10;

      // Act & Assert
      emptyValues.forEach((value) => {
        const result = toPreview(value, maxChars);
        expect(result).toBe("");
      });
    });
  });
});
