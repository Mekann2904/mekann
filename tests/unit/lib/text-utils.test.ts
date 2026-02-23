/**
 * text-utils.ts の単体テスト
 *
 * テスト対象:
 * - truncateText: テキストの切り詰め
 * - truncateTextWithMarker: マーカー付き切り詰め
 * - toPreview: プレビュー形式変換
 * - normalizeOptionalText: optionalテキストの正規化
 * - throwIfAborted: AbortSignalチェック
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  truncateText,
  truncateTextWithMarker,
  toPreview,
  normalizeOptionalText,
  throwIfAborted,
} from "../../../.pi/lib/text-utils.js";

describe("text-utils.ts", () => {
  describe("truncateText", () => {
    describe("正常系", () => {
      it("短いテキストはそのまま返す", () => {
        // Arrange
        const text = "短いテキスト";
        const maxLength = 20;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe(text);
      });

      it("長いテキストは切り詰めて...を付ける", () => {
        // Arrange
        const text = "これは非常に長いテキストです";
        const maxLength = 10;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result.length).toBe(maxLength);
        // slice(0, 7) + "..." = "これは非常に長..." (10文字)
        expect(result).toBe("これは非常に長...");
      });

      it("maxLengthと同じ長さのテキストはそのまま返す", () => {
        // Arrange
        const text = "12345";
        const maxLength = 5;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe(text);
      });

      it("maxLengthより1文字長いテキストは切り詰められる", () => {
        // Arrange
        const text = "123456";
        const maxLength = 5;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("12...");
      });
    });

    describe("境界値テスト", () => {
      it("maxLength=3の場合は...のみ", () => {
        // Arrange
        const text = "1234567890";
        const maxLength = 3;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("123");
      });

      it("maxLength=2の場合は最初の2文字", () => {
        // Arrange
        const text = "1234567890";
        const maxLength = 2;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("12");
      });

      it("maxLength=1の場合は最初の1文字", () => {
        // Arrange
        const text = "1234567890";
        const maxLength = 1;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("1");
      });

      it("maxLength=0の場合は空文字", () => {
        // Arrange
        const text = "テスト";
        const maxLength = 0;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("");
      });

      it("空文字列入力は空文字を返す", () => {
        // Arrange
        const text = "";
        const maxLength = 10;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result).toBe("");
      });
    });

    describe("日本語テキスト", () => {
      it("日本語を正しく切り詰める", () => {
        // Arrange
        const text = "これは日本語のテストです";
        const maxLength = 8;

        // Act
        const result = truncateText(text, maxLength);

        // Assert
        expect(result.length).toBe(maxLength);
        // slice(0, 5) + "..." = "これは日本..." (8文字)
        expect(result).toBe("これは日本...");
      });
    });
  });

  describe("truncateTextWithMarker", () => {
    describe("正常系", () => {
      it("短いテキストはそのまま返す", () => {
        // Arrange
        const text = "短いテキスト";
        const maxChars = 100;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe(text);
      });

      it("長いテキストはマーカー付きで切り詰める", () => {
        // Arrange
        const text = "これは非常に長いテキストです";
        const maxChars = 10;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        // slice(0, 10) = "これは非常に長いテキ" (10文字)
        expect(result).toBe("これは非常に長いテキ\n...[truncated]");
        expect(result.startsWith(text.slice(0, maxChars))).toBe(true);
        expect(result.endsWith("\n...[truncated]")).toBe(true);
      });
    });

    describe("境界値テスト", () => {
      it("maxChars=0の場合はマーカーのみ", () => {
        // Arrange
        const text = "テスト";
        const maxChars = 0;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe("\n...[truncated]");
      });

      it("maxCharsと同じ長さの場合はそのまま", () => {
        // Arrange
        const text = "12345";
        const maxChars = 5;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe(text);
      });

      it("空文字列入力は空文字を返す", () => {
        // Arrange
        const text = "";
        const maxChars = 10;

        // Act
        const result = truncateTextWithMarker(text, maxChars);

        // Assert
        expect(result).toBe("");
      });
    });
  });

  describe("toPreview", () => {
    describe("正常系", () => {
      it("短いテキストはそのまま返す", () => {
        // Arrange
        const text = "短いテキスト";
        const maxChars = 100;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe(text);
      });

      it("長いテキストは...付きで切り詰める", () => {
        // Arrange
        const text = "これは非常に長いテキストです";
        const maxChars = 10;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("これは非常に長いテキ...");
        expect(result.length).toBe(maxChars + 3);
      });
    });

    describe("境界値テスト", () => {
      it("空文字列入力は空文字を返す", () => {
        // Arrange
        const text = "";
        const maxChars = 10;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("");
      });

      it("Falsy値入力は空文字を返す", () => {
        // Arrange
        const text = "" as string;
        const maxChars = 10;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("");
      });

      it("maxChars=0の場合は...のみ", () => {
        // Arrange
        const text = "テスト";
        const maxChars = 0;

        // Act
        const result = toPreview(text, maxChars);

        // Assert
        expect(result).toBe("...");
      });
    });
  });

  describe("normalizeOptionalText", () => {
    describe("正常系", () => {
      it("文字列をトリムして返す", () => {
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

      it("空文字列はundefinedを返す", () => {
        // Arrange
        const value = "";

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });
    });

    describe("型変換", () => {
      it("数値はundefinedを返す", () => {
        // Arrange
        const value = 123;

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("nullはundefinedを返す", () => {
        // Arrange
        const value = null;

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("undefinedはundefinedを返す", () => {
        // Arrange
        const value = undefined;

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });

      it("オブジェクトはundefinedを返す", () => {
        // Arrange
        const value = { key: "value" };

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBeUndefined();
      });
    });

    describe("エッジケース", () => {
      it("内部空白は保持する", () => {
        // Arrange
        const value = "  テスト テスト  ";

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBe("テスト テスト");
      });

      it("改行を含むテキスト", () => {
        // Arrange
        const value = "  テスト\nテスト  ";

        // Act
        const result = normalizeOptionalText(value);

        // Assert
        expect(result).toBe("テスト\nテスト");
      });
    });
  });

  describe("throwIfAborted", () => {
    describe("正常系", () => {
      it("中断されていないsignalは例外を投げない", () => {
        // Arrange
        const controller = new AbortController();

        // Act & Assert
        expect(() => throwIfAborted(controller.signal)).not.toThrow();
      });

      it("undefined signalは例外を投げない", () => {
        // Act & Assert
        expect(() => throwIfAborted(undefined)).not.toThrow();
      });
    });

    describe("中断時", () => {
      it("中断されたsignalは例外を投げる", () => {
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
    });
  });

  describe("プロパティベーステスト", () => {
    it("truncateTextの結果は常にmaxLength以下", () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 1000 }),
          fc.integer({ min: 0, max: 100 }),
          (text, maxLength) => {
            // Act
            const result = truncateText(text, maxLength);

            // Assert
            expect(result.length).toBeLessThanOrEqual(maxLength);
          }
        )
      );
    });

    it("truncateTextの結果は元のテキストのプレフィックスを含む", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc.integer({ min: 1, max: 100 }),
          (text, maxLength) => {
            // Skip if text is shorter than maxLength
            fc.pre(text.length > maxLength);

            // Act
            const result = truncateText(text, maxLength);

            // Assert
            // ...を除いた部分は元のテキストのプレフィックス
            const withoutEllipsis = maxLength > 3 ? result.slice(0, -3) : result;
            expect(text.startsWith(withoutEllipsis)).toBe(true);
          }
        )
      );
    });

    it("truncateTextWithMarkerの結果はマーカーを含む", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 1000 }),
          fc.integer({ min: 1, max: 9 }),
          (text, maxChars) => {
            // Act
            const result = truncateTextWithMarker(text, maxChars);

            // Assert
            expect(result).toContain("\n...[truncated]");
          }
        )
      );
    });

    it("toPreviewの結果は元のテキストのプレフィックス", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc.integer({ min: 0, max: 100 }),
          (text, maxChars) => {
            // Skip if text is shorter than maxChars
            fc.pre(text.length > maxChars && text.length > 0);

            // Act
            const result = toPreview(text, maxChars);

            // Assert
            expect(text.startsWith(result.replace(/\.\.\.$/, ""))).toBe(true);
          }
        )
      );
    });

    it("normalizeOptionalTextは文字列入力で常にトリムされた文字列またはundefinedを返す", () => {
      fc.assert(
        fc.property(fc.string(), (value) => {
          // Act
          const result = normalizeOptionalText(value);

          // Assert
          if (result !== undefined) {
            expect(result).toBe(result.trim());
            expect(result.length).toBeGreaterThan(0);
          }
        })
      );
    });
  });
});
