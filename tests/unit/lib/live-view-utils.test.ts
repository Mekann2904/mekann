/**
 * live-view-utils.ts 単体テスト
 * カバレッジ分析: getLiveStatusGlyph, getLiveStatusColor, getActivityIndicator, isEnterInput, finalizeLiveLines
 */
import {
  describe,
  it,
  expect,
} from "vitest";
import * as fc from "fast-check";

import {
  getLiveStatusGlyph,
  getLiveStatusColor,
  getActivityIndicator,
  isEnterInput,
  finalizeLiveLines,
  type LiveStatus,
} from "../../../.pi/lib/live-view-utils.js";

// ============================================================================
// getLiveStatusGlyph テスト
// ============================================================================

describe("getLiveStatusGlyph", () => {
  it("getLiveStatusGlyph_pending_グリフ返却", () => {
    // Arrange & Act
    const result = getLiveStatusGlyph("pending");

    // Assert
    expect(result).toBe("[ ]");
  });

  it("getLiveStatusGlyph_running_グリフ返却", () => {
    // Arrange & Act
    const result = getLiveStatusGlyph("running");

    // Assert
    expect(result).toBe("[>]");
  });

  it("getLiveStatusGlyph_completed_グリフ返却", () => {
    // Arrange & Act
    const result = getLiveStatusGlyph("completed");

    // Assert
    expect(result).toBe("[+]");
  });

  it("getLiveStatusGlyph_failed_グリフ返却", () => {
    // Arrange & Act
    const result = getLiveStatusGlyph("failed");

    // Assert
    expect(result).toBe("[x]");
  });

  it("getLiveStatusGlyph_未知のステータス_フォールバック", () => {
    // Arrange & Act
    const result = getLiveStatusGlyph("unknown" as LiveStatus);

    // Assert
    expect(result).toBe("[?]");
  });

  it("getLiveStatusGlyph_全ステータス_3文字グリフ", () => {
    // Arrange
    const statuses: LiveStatus[] = ["pending", "running", "completed", "failed"];

    // Act & Assert
    for (const status of statuses) {
      const glyph = getLiveStatusGlyph(status);
      expect(glyph).toHaveLength(3);
    }
  });
});

// ============================================================================
// getLiveStatusColor テスト
// ============================================================================

describe("getLiveStatusColor", () => {
  it("getLiveStatusColor_pending_dim返却", () => {
    // Arrange & Act
    const result = getLiveStatusColor("pending");

    // Assert
    expect(result).toBe("dim");
  });

  it("getLiveStatusColor_running_accent返却", () => {
    // Arrange & Act
    const result = getLiveStatusColor("running");

    // Assert
    expect(result).toBe("accent");
  });

  it("getLiveStatusColor_completed_success返却", () => {
    // Arrange & Act
    const result = getLiveStatusColor("completed");

    // Assert
    expect(result).toBe("success");
  });

  it("getLiveStatusColor_failed_error返却", () => {
    // Arrange & Act
    const result = getLiveStatusColor("failed");

    // Assert
    expect(result).toBe("error");
  });

  it("getLiveStatusColor_未知のステータス_dimフォールバック", () => {
    // Arrange & Act
    const result = getLiveStatusColor("unknown" as LiveStatus);

    // Assert
    expect(result).toBe("dim");
  });
});

// ============================================================================
// getActivityIndicator テスト
// ============================================================================

describe("getActivityIndicator", () => {
  it("getActivityIndicator_エラーあり_err返却", () => {
    // Arrange & Act
    const result = getActivityIndicator(true, true, false);

    // Assert
    expect(result).toBe("err!");
  });

  it("getActivityIndicator_最近の出力あり_outExclamation返却", () => {
    // Arrange & Act
    const result = getActivityIndicator(true, false, true);

    // Assert
    expect(result).toBe("out!");
  });

  it("getActivityIndicator_古い出力あり_out返却", () => {
    // Arrange & Act
    const result = getActivityIndicator(true, false, false);

    // Assert
    expect(result).toBe("out");
  });

  it("getActivityIndicator_出力なし_ダッシュ返却", () => {
    // Arrange & Act
    const result = getActivityIndicator(false, false, false);

    // Assert
    expect(result).toBe("-");
  });

  it("getActivityIndicator_エラー優先_エラー表示", () => {
    // Arrange & Act - エラーあり、最近の出力ありの場合エラー優先
    const result = getActivityIndicator(true, true, true);

    // Assert
    expect(result).toBe("err!");
  });

  it("getActivityIndicator_最近出力優先_古い出力より", () => {
    // Arrange & Act - 最近の出力と古い出力の比較
    const recentResult = getActivityIndicator(true, false, true);
    const oldResult = getActivityIndicator(true, false, false);

    // Assert
    expect(recentResult).toBe("out!");
    expect(oldResult).toBe("out");
  });
});

// ============================================================================
// isEnterInput テスト
// ============================================================================

describe("isEnterInput", () => {
  it("isEnterInput_キャリッジリターン_true", () => {
    // Arrange & Act
    const result = isEnterInput("\r");

    // Assert
    expect(result).toBe(true);
  });

  it("isEnterInput_改行_true", () => {
    // Arrange & Act
    const result = isEnterInput("\n");

    // Assert
    expect(result).toBe(true);
  });

  it("isEnterInput_CRLF_true", () => {
    // Arrange & Act
    const result = isEnterInput("\r\n");

    // Assert
    expect(result).toBe(true);
  });

  it("isEnterInput_enter文字列_true", () => {
    // Arrange & Act
    const result = isEnterInput("enter");

    // Assert
    expect(result).toBe(true);
  });

  it("isEnterInput_その他の文字_false", () => {
    // Arrange & Act
    const result = isEnterInput("a");

    // Assert
    expect(result).toBe(false);
  });

  it("isEnterInput_空文字_false", () => {
    // Arrange & Act
    const result = isEnterInput("");

    // Assert
    expect(result).toBe(false);
  });

  it("isEnterInput_スペース_false", () => {
    // Arrange & Act
    const result = isEnterInput(" ");

    // Assert
    expect(result).toBe(false);
  });

  it("isEnterInput_Enter大文字_false", () => {
    // Arrange & Act
    const result = isEnterInput("Enter");

    // Assert
    expect(result).toBe(false);
  });
});

// ============================================================================
// finalizeLiveLines テスト
// ============================================================================

describe("finalizeLiveLines", () => {
  it("finalizeLiveLines_height未指定_そのまま返却", () => {
    // Arrange
    const lines = ["line1", "line2", "line3"];

    // Act
    const result = finalizeLiveLines(lines);

    // Assert
    expect(result).toEqual(lines);
  });

  it("finalizeLiveLines_heightゼロ_そのまま返却", () => {
    // Arrange
    const lines = ["line1", "line2", "line3"];

    // Act
    const result = finalizeLiveLines(lines, 0);

    // Assert
    expect(result).toEqual(lines);
  });

  it("finalizeLiveLines_height負数_そのまま返却", () => {
    // Arrange
    const lines = ["line1", "line2", "line3"];

    // Act
    const result = finalizeLiveLines(lines, -1);

    // Assert
    expect(result).toEqual(lines);
  });

  it("finalizeLiveLines_行数超過_切り詰め", () => {
    // Arrange
    const lines = ["line1", "line2", "line3", "line4", "line5"];

    // Act
    const result = finalizeLiveLines(lines, 3);

    // Assert
    expect(result).toEqual(["line1", "line2", "line3"]);
    expect(result).toHaveLength(3);
  });

  it("finalizeLiveLines_行数不足_空行埋め", () => {
    // Arrange
    const lines = ["line1", "line2"];

    // Act
    const result = finalizeLiveLines(lines, 4);

    // Assert
    expect(result).toEqual(["line1", "line2", "", ""]);
    expect(result).toHaveLength(4);
  });

  it("finalizeLiveLines_行数一致_そのまま返却", () => {
    // Arrange
    const lines = ["line1", "line2", "line3"];

    // Act
    const result = finalizeLiveLines(lines, 3);

    // Assert
    expect(result).toEqual(lines);
    expect(result).toHaveLength(3);
  });

  it("finalizeLiveLines_空配列_空行埋め", () => {
    // Arrange
    const lines: string[] = [];

    // Act
    const result = finalizeLiveLines(lines, 3);

    // Assert
    expect(result).toEqual(["", "", ""]);
    expect(result).toHaveLength(3);
  });

  it("finalizeLiveLines_height1_1行のみ", () => {
    // Arrange
    const lines = ["line1", "line2"];

    // Act
    const result = finalizeLiveLines(lines, 1);

    // Assert
    expect(result).toEqual(["line1"]);
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("getLiveStatusGlyph_有効ステータス_3文字グリフ", () => {
    const validStatuses: LiveStatus[] = ["pending", "running", "completed", "failed"];

    fc.assert(
      fc.property(fc.constantFrom(...validStatuses), (status) => {
        const glyph = getLiveStatusGlyph(status);
        return glyph.length === 3;
      })
    );
  });

  it("isEnterInput_任意の文字列_ブール値返却", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10 }), (input) => {
        const result = isEnterInput(input);
        return typeof result === "boolean";
      })
    );
  });

  it("finalizeLiveLines_任意の行配列と高さ_指定高さの配列", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 50 }), { maxLength: 20 }),
        fc.integer({ min: 1, max: 50 }),
        (lines, height) => {
          const result = finalizeLiveLines(lines, height);
          return result.length === height;
        }
      )
    );
  });

  it("getActivityIndicator_任意のフラグ組み合わせ_有効な文字列", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (hasOutput, hasError, isRecent) => {
        const result = getActivityIndicator(hasOutput, hasError, isRecent);
        return ["err!", "out!", "out", "-"].includes(result);
      })
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  it("finalizeLiveLines_非常に大きなheight_空行大量追加", () => {
    // Arrange
    const lines = ["line1"];
    const height = 1000;

    // Act
    const result = finalizeLiveLines(lines, height);

    // Assert
    expect(result).toHaveLength(1000);
    expect(result[0]).toBe("line1");
    expect(result[999]).toBe("");
  });

  it("finalizeLiveLines_大量の行_切り詰め", () => {
    // Arrange
    const lines = Array.from({ length: 1000 }, (_, i) => `line${i}`);

    // Act
    const result = finalizeLiveLines(lines, 10);

    // Assert
    expect(result).toHaveLength(10);
  });

  it("isEnterInput_特殊文字_false", () => {
    // Arrange & Act & Assert
    expect(isEnterInput("\t")).toBe(false);
    expect(isEnterInput("\0")).toBe(false);
  });
});
