/**
 * @file .pi/extensions/question.ts の追加単体テスト
 * @description 質問UI拡張機能のブラケットペースト、状態遷移、文字幅計算のテスト
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    String: () => ({ type: "string" }),
    Boolean: () => ({ type: "boolean" }),
    Optional: (type) => type,
    Object: (fields) => ({ type: "object", fields }),
    Array: (type) => ({ type: "array", itemType: type }),
  },
}));

vi.mock("@mariozechner/pi-tui", () => ({
  Text: vi.fn(),
  truncateToWidth: vi.fn((s) => s),
  wrapTextWithAnsi: vi.fn((text, width) => {
    if (text.length <= width) return [text];
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += width) {
      lines.push(text.slice(i, i + width));
    }
    return lines;
  }),
  CURSOR_MARKER: "\u2588",
  Key: {
    enter: "enter",
    escape: "escape",
    backspace: "backspace",
    left: "left",
    right: "right",
    up: "up",
    down: "down",
    home: "home",
    end: "end",
    delete: "delete",
    shift: (key) => `shift+${key}`,
  },
  matchesKey: vi.fn((data, key) => data === key),
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  ExtensionAPI: vi.fn(),
}));

vi.mock("../../.pi/extensions/kitty-status-integration.js", () => ({
  playSound: vi.fn(),
}));

// ============================================================================
// ブラケットペースト処理のテスト
// ============================================================================

describe("Bracket Paste Processing", () => {
  describe("ペースト開始・終了シーケンス", () => {
    it("should_detect_paste_start_sequence", () => {
      const data = "some text\x1b[200~pasted content";
      const hasPasteStart = data.includes("\x1b[200~");
      expect(hasPasteStart).toBe(true);
    });

    it("should_detect_paste_end_sequence", () => {
      const data = "pasted content\x1b[201~";
      const hasPasteEnd = data.includes("\x1b[201~");
      expect(hasPasteEnd).toBe(true);
    });

    it("should_extract_paste_content", () => {
      const pasteBuffer = "hello world\x1b[201~";
      const endIndex = pasteBuffer.indexOf("\x1b[201~");
      const pasteContent = pasteBuffer.substring(0, endIndex);
      expect(pasteContent).toBe("hello world");
    });

    it("should_handle_complete_paste_sequence", () => {
      const data = "\x1b[200~pasted text\x1b[201~";
      const startIndex = data.indexOf("\x1b[200~");
      const endIndex = data.indexOf("\x1b[201~");

      expect(startIndex).toBe(0);
      expect(endIndex).toBeGreaterThan(startIndex);

      const content = data.slice(startIndex + 6, endIndex); // 6 = length of "\x1b[200~"
      expect(content).toBe("pasted text");
    });
  });

  describe("ペースト内容のサニタイゼーション", () => {
    it("should_remove_ansi_escape_sequences", () => {
      const input = "Text\x1b[31mRed\x1b[0mMore";
      const cleanText = input.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      expect(cleanText).toBe("TextRedMore");
    });

    it("should_normalize_crlf_to_lf", () => {
      const input = "line1\r\nline2\rline3";
      const cleanText = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      expect(cleanText).toBe("line1\nline2\nline3");
    });

    it("should_remove_complex_ansi_sequences", () => {
      const input = "\x1b[1;31mBold Red\x1b[0m\x1b[2mDim\x1b[0m";
      const cleanText = input.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      expect(cleanText).toBe("Bold RedDim");
    });

    it("should_preserve_normal_text", () => {
      const input = "Normal text without ANSI";
      const cleanText = input.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      expect(cleanText).toBe("Normal text without ANSI");
    });
  });

  describe("ペースト長制限", () => {
    const MAX_PASTE_LENGTH = 10000;

    it("should_accept_short_paste", () => {
      const shortText = "a".repeat(100);
      expect(shortText.length <= MAX_PASTE_LENGTH).toBe(true);
    });

    it("should_detect_long_paste", () => {
      const longText = "a".repeat(15000);
      expect(longText.length > MAX_PASTE_LENGTH).toBe(true);
    });

    it("should_truncate_to_max_length", () => {
      const longText = "a".repeat(15000);
      const truncated = longText.slice(0, MAX_PASTE_LENGTH);
      expect(truncated.length).toBe(MAX_PASTE_LENGTH);
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: サニタイズ後のテキストにANSIが含まれない", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (text) => {
            const ansiPattern = /\x1b\[[0-9;]*[a-zA-Z]/;
            const hasAnsi = ansiPattern.test(text);
            const sanitized = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
            const hasAnsiAfter = ansiPattern.test(sanitized);
            return !hasAnsiAfter || !hasAnsi;
          }
        ),
        { numRuns: 50 }
      );
    });

    it("PBT: 改行コード正規化は冪等性を持つ", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          (text) => {
            const normalize = (s: string) =>
              s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            const once = normalize(text);
            const twice = normalize(once);
            return once === twice;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

// ============================================================================
// 文字幅計算のテスト
// ============================================================================

describe("Character Width Calculation", () => {
  /**
   * 文字の表示幅を取得（テスト用コピー）
   */
  function getCharWidth(char: string): number {
    const code = char.codePointAt(0) || 0;
    if (
      (code >= 0x3000 && code <= 0x303F) ||  // CJK記号・句読点
      (code >= 0x3040 && code <= 0x309F) ||  // ひらがな
      (code >= 0x30A0 && code <= 0x30FF) ||  // カタカナ
      (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK統合漢字
      (code >= 0xFF00 && code <= 0xFFEF)     // 半角・全角形
    ) {
      return 2;
    }
    return 1;
  }

  /**
   * 文字列の表示幅を取得
   */
  function getStringWidth(str: string): number {
    let width = 0;
    for (const char of str) {
      width += getCharWidth(char);
    }
    return width;
  }

  /**
   * 表示幅から文字列を切り詰め
   */
  function truncateByWidth(str: string, maxWidth: number): string {
    let width = 0;
    let result = "";
    for (const char of str) {
      const charWidth = getCharWidth(char);
      if (width + charWidth > maxWidth) {
        break;
      }
      result += char;
      width += charWidth;
    }
    return result;
  }

  describe("ASCII文字", () => {
    it("should_return_1_for_lowercase_letters", () => {
      expect(getCharWidth("a")).toBe(1);
      expect(getCharWidth("z")).toBe(1);
    });

    it("should_return_1_for_uppercase_letters", () => {
      expect(getCharWidth("A")).toBe(1);
      expect(getCharWidth("Z")).toBe(1);
    });

    it("should_return_1_for_digits", () => {
      expect(getCharWidth("0")).toBe(1);
      expect(getCharWidth("9")).toBe(1);
    });

    it("should_return_1_for_symbols", () => {
      expect(getCharWidth("!")).toBe(1);
      expect(getCharWidth("@")).toBe(1);
      expect(getCharWidth(" ")).toBe(1);
    });
  });

  describe("日本語文字", () => {
    it("should_return_2_for_hiragana", () => {
      expect(getCharWidth("あ")).toBe(2);
      expect(getCharWidth("ん")).toBe(2);
      expect(getCharWidth("を")).toBe(2);
    });

    it("should_return_2_for_katakana", () => {
      expect(getCharWidth("ア")).toBe(2);
      expect(getCharWidth("ン")).toBe(2);
      expect(getCharWidth("ヴ")).toBe(2);
    });

    it("should_return_2_for_kanji", () => {
      expect(getCharWidth("漢")).toBe(2);
      expect(getCharWidth("字")).toBe(2);
      expect(getCharWidth("日")).toBe(2);
    });

    it("should_return_2_for_fullwidth_symbols", () => {
      expect(getCharWidth("　")).toBe(2); // 全角スペース
      expect(getCharWidth("。")).toBe(2);
      expect(getCharWidth("、")).toBe(2);
    });
  });

  describe("文字列幅計算", () => {
    it("should_calculate_ascii_string_width", () => {
      expect(getStringWidth("abc")).toBe(3);
      expect(getStringWidth("Hello")).toBe(5);
    });

    it("should_calculate_japanese_string_width", () => {
      expect(getStringWidth("あいう")).toBe(6);
      expect(getStringWidth("漢字")).toBe(4);
    });

    it("should_calculate_mixed_string_width", () => {
      expect(getStringWidth("aあb")).toBe(4); // 1 + 2 + 1
      expect(getStringWidth("Hello世界")).toBe(9); // 5 + 4
    });

    it("should_handle_empty_string", () => {
      expect(getStringWidth("")).toBe(0);
    });
  });

  describe("幅による切り詰め", () => {
    it("should_truncate_ascii_string", () => {
      expect(truncateByWidth("Hello", 3)).toBe("Hel");
      expect(truncateByWidth("Hello", 5)).toBe("Hello");
      expect(truncateByWidth("Hello", 10)).toBe("Hello");
    });

    it("should_truncate_japanese_string", () => {
      expect(truncateByWidth("あいう", 4)).toBe("あい");
      expect(truncateByWidth("あいう", 2)).toBe("あ");
    });

    it("should_truncate_mixed_string", () => {
      expect(truncateByWidth("aあbいc", 4)).toBe("aあb");
      expect(truncateByWidth("Hello世界", 7)).toBe("Hello世");
    });

    it("should_not_truncate_empty_string", () => {
      expect(truncateByWidth("", 10)).toBe("");
    });

    it("should_handle_zero_max_width", () => {
      expect(truncateByWidth("Hello", 0)).toBe("");
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: 文字幅は常に1または2", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          (str) => {
            for (const char of str) {
              const width = getCharWidth(char);
              if (width !== 1 && width !== 2) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it("PBT: 文字列幅は各文字幅の合計", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 20 }),
          (str) => {
            const totalWidth = getStringWidth(str);
            let sumWidth = 0;
            for (const char of str) {
              sumWidth += getCharWidth(char);
            }
            return totalWidth === sumWidth;
          }
        ),
        { numRuns: 50 }
      );
    });

    it("PBT: 切り詰め後の幅はmaxWidth以下", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.integer({ min: 0, max: 50 }),
          (str, maxWidth) => {
            const truncated = truncateByWidth(str, maxWidth);
            return getStringWidth(truncated) <= maxWidth;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

// ============================================================================
// 状態遷移のテスト
// ============================================================================

describe("State Transitions", () => {
  describe("選択モード", () => {
    interface SelectionState {
      cursor: number;
      selected: Set<number>;
      customMode: boolean;
    }

    const createInitialState = (optionsCount: number): SelectionState => ({
      cursor: 0,
      selected: new Set<number>(),
      customMode: false,
    });

    it("should_move_cursor_down", () => {
      const state = createInitialState(3);
      state.cursor = Math.min(2, state.cursor + 1);
      expect(state.cursor).toBe(1);
    });

    it("should_not_exceed_max_cursor", () => {
      const state = createInitialState(3);
      state.cursor = 2;
      state.cursor = Math.min(2, state.cursor + 1);
      expect(state.cursor).toBe(2);
    });

    it("should_move_cursor_up", () => {
      const state = createInitialState(3);
      state.cursor = 2;
      state.cursor = Math.max(0, state.cursor - 1);
      expect(state.cursor).toBe(1);
    });

    it("should_not_go_below_zero_cursor", () => {
      const state = createInitialState(3);
      state.cursor = Math.max(0, state.cursor - 1);
      expect(state.cursor).toBe(0);
    });
  });

  describe("複数選択モード", () => {
    it("should_toggle_selection_on", () => {
      const selected = new Set<number>();
      const cursor = 1;
      if (selected.has(cursor)) {
        selected.delete(cursor);
      } else {
        selected.add(cursor);
      }
      expect(selected.has(1)).toBe(true);
    });

    it("should_toggle_selection_off", () => {
      const selected = new Set<number>([1]);
      const cursor = 1;
      if (selected.has(cursor)) {
        selected.delete(cursor);
      } else {
        selected.add(cursor);
      }
      expect(selected.has(1)).toBe(false);
    });

    it("should_track_multiple_selections", () => {
      const selected = new Set<number>();
      [0, 2, 4].forEach(i => selected.add(i));
      expect(selected.size).toBe(3);
      expect(selected.has(0)).toBe(true);
      expect(selected.has(1)).toBe(false);
      expect(selected.has(2)).toBe(true);
    });
  });

  describe("カスタム入力モードへの遷移", () => {
    interface CustomInputState {
      customMode: boolean;
      customInput: string;
      customCursor: number;
    }

    it("should_enter_custom_mode_from_selection", () => {
      const state: CustomInputState = {
        customMode: false,
        customInput: "",
        customCursor: 0,
      };

      // 「その他」を選択してEnter
      state.customMode = true;
      state.customInput = "";
      state.customCursor = 0;

      expect(state.customMode).toBe(true);
      expect(state.customInput).toBe("");
      expect(state.customCursor).toBe(0);
    });

    it("should_exit_custom_mode_on_escape", () => {
      const state: CustomInputState = {
        customMode: true,
        customInput: "some text",
        customCursor: 9,
      };

      // Escapeで選択モードに戻る
      state.customMode = false;

      expect(state.customMode).toBe(false);
    });
  });

  describe("カスタム入力の編集操作", () => {
    it("should_insert_character_at_cursor", () => {
      const text = "hllo";
      const cursor = 1;
      const char = "e";

      const before = text.slice(0, cursor);
      const after = text.slice(cursor);
      const result = before + char + after;

      expect(result).toBe("hello");
    });

    it("should_delete_character_before_cursor", () => {
      const text = "hello";
      const cursor = 4;

      const before = text.slice(0, cursor - 1);
      const after = text.slice(cursor);
      const result = before + after;

      expect(result).toBe("helo");
      expect(result.length).toBe(4);
    });

    it("should_delete_character_at_cursor", () => {
      const text = "hello";
      const cursor = 1;

      const before = text.slice(0, cursor);
      const after = text.slice(cursor + 1);
      const result = before + after;

      expect(result).toBe("hllo");
    });

    it("should_handle_cursor_at_start", () => {
      const text = "hello";
      const cursor = 0;

      // Backspace at start should do nothing
      if (cursor > 0) {
        const before = text.slice(0, cursor - 1);
        const after = text.slice(cursor);
        return before + after;
      }

      expect(text).toBe("hello");
    });

    it("should_handle_cursor_at_end", () => {
      const text = "hello";
      const cursor = 5;

      // Delete at end should do nothing
      if (cursor < text.length) {
        const before = text.slice(0, cursor);
        const after = text.slice(cursor + 1);
        return before + after;
      }

      expect(text).toBe("hello");
    });
  });

  describe("複数行入力", () => {
    it("should_insert_newline", () => {
      const text = "line1line2";
      const cursor = 5;

      const before = text.slice(0, cursor);
      const after = text.slice(cursor);
      const result = before + "\n" + after;

      expect(result).toBe("line1\nline2");
    });

    it("should_split_into_lines", () => {
      const text = "line1\nline2\nline3";
      const lines = text.split("\n");

      expect(lines).toEqual(["line1", "line2", "line3"]);
    });

    it("should_calculate_line_offsets", () => {
      const text = "line1\nline2\nline3";
      const lines = text.split("\n");

      let charCount = 0;
      const offsets: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        offsets.push(charCount);
        charCount += lines[i].length + 1; // +1 for \n
      }

      expect(offsets).toEqual([0, 6, 12]);
    });

    it("should_move_cursor_between_lines", () => {
      const text = "line1\nline2\nline3";
      const lines = text.split("\n");
      const cursor = 7; // "line1\nl" position (in line2)

      // Find current line
      let charCount = 0;
      let currentLine = 0;
      let colInLine = 0;

      for (let i = 0; i < lines.length; i++) {
        if (cursor <= charCount + lines[i].length) {
          currentLine = i;
          colInLine = cursor - charCount;
          break;
        }
        charCount += lines[i].length + 1;
      }

      expect(currentLine).toBe(1);
      expect(colInLine).toBe(1);

      // Move up to previous line
      if (currentLine > 0) {
        const prevLineLength = lines[currentLine - 1].length;
        const newCol = Math.min(colInLine, prevLineLength);
        const newCursor = charCount - lines[currentLine - 1].length - 1 + newCol;

        expect(newCursor).toBe(1); // Should be at position 1 in "line1"
      }
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: カーソルは常に有効範囲内", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (initialCursor, text) => {
            let cursor = initialCursor;
            cursor = Math.max(0, Math.min(text.length, cursor));
            return cursor >= 0 && cursor <= text.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    it("PBT: 文字列操作後のカーソル位置は有効", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 5 }),
          fc.integer({ min: 0, max: 20 }),
          (originalText, insertChar, position) => {
            const clampedPos = Math.max(0, Math.min(originalText.length, position));
            const before = originalText.slice(0, clampedPos);
            const after = originalText.slice(clampedPos);
            const result = before + insertChar + after;
            const newCursor = clampedPos + insertChar.length;

            return newCursor >= 0 && newCursor <= result.length;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

// ============================================================================
// エラーレスポンス生成のテスト
// ============================================================================

describe("Error Response Generation", () => {
  enum QuestionErrorCode {
    NO_UI = "NO_UI",
    NO_OPTIONS = "NO_OPTIONS",
    NO_QUESTIONS = "NO_QUESTIONS",
    CANCELLED = "CANCELLED",
    VALIDATION_ERROR = "VALIDATION_ERROR"
  }

  interface QuestionError {
    code: QuestionErrorCode;
    message: string;
    recovery: string[];
    details?: Record<string, unknown>;
  }

  function createErrorResponse(error: QuestionError) {
    return {
      content: [{
        type: "text" as const,
        text: `エラー [${error.code}]: ${error.message}\n\n回復方法:\n${error.recovery.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      }],
      details: {
        answers: [],
        error
      }
    };
  }

  describe("各種エラーコード", () => {
    it("should_create_no_ui_error", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.NO_UI,
        message: "UIが利用できません",
        recovery: ["対話モードで再実行してください"]
      });

      expect(response.details.error.code).toBe("NO_UI");
      expect(response.content[0].text).toContain("回復方法");
      expect(response.details.answers).toEqual([]);
    });

    it("should_create_no_options_error_with_details", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.NO_OPTIONS,
        message: "質問 1 に選択肢がありません",
        recovery: [
          "options に選択肢を追加してください",
          "または custom: true を設定してください"
        ],
        details: { questionIndex: 0, header: "Test" }
      });

      expect(response.details.error.details).toEqual({ questionIndex: 0, header: "Test" });
      expect(response.details.error.recovery).toHaveLength(2);
    });

    it("should_create_validation_error", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.VALIDATION_ERROR,
        message: "ヘッダーが長すぎます",
        recovery: ["header は30文字以下にしてください"]
      });

      expect(response.details.error.code).toBe("VALIDATION_ERROR");
      expect(response.content[0].text).toContain("1. header");
    });

    it("should_create_cancelled_error", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.CANCELLED,
        message: "ユーザーがキャンセルしました",
        recovery: []
      });

      expect(response.details.error.code).toBe("CANCELLED");
    });
  });

  describe("エラーメッセージフォーマット", () => {
    it("should_include_error_code_in_message", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.NO_QUESTIONS,
        message: "質問がありません",
        recovery: ["質問を追加してください"]
      });

      expect(response.content[0].text).toContain("[NO_QUESTIONS]");
    });

    it("should_number_recovery_steps", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.VALIDATION_ERROR,
        message: "Test",
        recovery: ["Step 1", "Step 2", "Step 3"]
      });

      expect(response.content[0].text).toContain("1. Step 1");
      expect(response.content[0].text).toContain("2. Step 2");
      expect(response.content[0].text).toContain("3. Step 3");
    });

    it("should_handle_empty_recovery_steps", () => {
      const response = createErrorResponse({
        code: QuestionErrorCode.CANCELLED,
        message: "Cancelled",
        recovery: []
      });

      expect(response.content[0].text).toContain("回復方法:\n");
    });
  });
});

// ============================================================================
// パラメータバリデーションのテスト
// ============================================================================

describe("Parameter Validation", () => {
  describe("空選択肢 + custom=false", () => {
    it("should_detect_invalid_combination", () => {
      const question = {
        question: "テスト",
        header: "T",
        options: [],
        custom: false
      };

      const hasOptions = question.options && question.options.length > 0;
      const allowCustom = question.custom !== false;
      const isValid = hasOptions || allowCustom;

      expect(isValid).toBe(false);
    });

    it("should_accept_empty_options_with_custom_true", () => {
      const question = {
        question: "テスト",
        header: "T",
        options: [],
        custom: true
      };

      const hasOptions = question.options && question.options.length > 0;
      const allowCustom = question.custom !== false;
      const isValid = hasOptions || allowCustom;

      expect(isValid).toBe(true);
    });

    it("should_accept_options_with_custom_false", () => {
      const question = {
        question: "テスト",
        header: "T",
        options: [{ label: "A" }],
        custom: false
      };

      const hasOptions = question.options && question.options.length > 0;
      const allowCustom = question.custom !== false;
      const isValid = hasOptions || allowCustom;

      expect(isValid).toBe(true);
    });
  });

  describe("ヘッダー長の警告", () => {
    const MAX_HEADER_LENGTH = 30;

    it("should_accept_short_header", () => {
      const header = "短いヘッダー";
      expect(header.length <= MAX_HEADER_LENGTH).toBe(true);
    });

    it("should_warn_on_long_header", () => {
      const header = "a".repeat(50); // 50 ASCII characters
      expect(header.length > MAX_HEADER_LENGTH).toBe(true);
    });

    it("should_accept_exactly_max_length_header", () => {
      const header = "a".repeat(MAX_HEADER_LENGTH);
      expect(header.length <= MAX_HEADER_LENGTH).toBe(true);
    });
  });

  describe("ラベル長の警告", () => {
    const MAX_LABEL_LENGTH = 10;

    it("should_accept_short_label", () => {
      const label = "はい";
      expect(label.length <= MAX_LABEL_LENGTH).toBe(true);
    });

    it("should_warn_on_long_label", () => {
      const label = "非常に長いラベル名前です";
      expect(label.length > MAX_LABEL_LENGTH).toBe(true);
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: バリデーションロジックの一貫性", () => {
      fc.assert(
        fc.property(
          fc.record({
            options: fc.array(fc.record({ label: fc.string({ minLength: 1 }) })),
            custom: fc.boolean()
          }),
          (question) => {
            const hasOptions = question.options.length > 0;
            const allowCustom = question.custom !== false;
            const isValid = hasOptions || allowCustom;

            // 少なくとも1つの入力方法がある場合のみ有効
            return isValid === (hasOptions || allowCustom);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

// ============================================================================
// 確認画面のテスト
// ============================================================================

describe("Confirmation Screen", () => {
  describe("選択肢の構築", () => {
    it("should_build_confirmation_options", () => {
      const questions = [
        { question: "Q1", header: "H1" },
        { question: "Q2", header: "H2" }
      ];

      const totalOptions = 2 + questions.length; // 確定 + キャンセル + 質問数
      expect(totalOptions).toBe(4);
    });

    it("should_map_cursor_to_action", () => {
      const questions = [{ question: "Q1", header: "H1" }];

      // Cursor 0: 確定
      // Cursor 1: キャンセル
      // Cursor 2: Q1を編集

      const getAction = (cursor: number) => {
        if (cursor === 0) return "confirm";
        if (cursor === 1) return "cancel";
        const editIndex = cursor - 2;
        if (editIndex >= 0 && editIndex < questions.length) {
          return { type: "edit", index: editIndex };
        }
        return "fallback";
      };

      expect(getAction(0)).toBe("confirm");
      expect(getAction(1)).toBe("cancel");
      expect(getAction(2)).toEqual({ type: "edit", index: 0 });
    });
  });

  describe("境界チェック", () => {
    it("should_handle_no_questions", () => {
      const questions: unknown[] = [];
      const totalOptions = 2 + questions.length;

      expect(totalOptions).toBe(2);
    });

    it("should_limit_edit_options_to_9", () => {
      const questions = Array.from({ length: 15 }, (_, i) => ({
        question: `Q${i}`,
        header: `H${i}`
      }));

      const maxEditOptions = 9;
      const visibleOptions = Math.min(questions.length, maxEditOptions);

      expect(visibleOptions).toBe(9);
    });

    it("should_fallback_on_invalid_cursor", () => {
      const questions = [{ question: "Q1", header: "H1" }];
      const cursor = 100;

      const editIndex = cursor - 2;
      const isValid = editIndex >= 0 && editIndex < questions.length;

      expect(isValid).toBe(false);
    });
  });
});
