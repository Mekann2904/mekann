/**
 * @file .pi/lib/core.ts の単体テスト
 * @description Layer 0 バレルエクスポートの確認
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";

// core.ts はバレルファイルなので、エクスポートされていることを確認する
import * as core from "../../../.pi/lib/core.js";

// ============================================================================
// 再エクスポート確認テスト
// ============================================================================

describe("core.ts バレルエクスポート", () => {
  // ============================================================================
  // Error handling utilities (from error-utils.js)
  // ============================================================================
  describe("error-utils", () => {
    it("toErrorMessage_関数_エクスポート", () => {
      expect(core).toHaveProperty("toErrorMessage");
      expect(typeof core.toErrorMessage).toBe("function");
    });

    it("extractStatusCodeFromMessage_関数_エクスポート", () => {
      expect(core).toHaveProperty("extractStatusCodeFromMessage");
      expect(typeof core.extractStatusCodeFromMessage).toBe("function");
    });

    it("classifyPressureError_関数_エクスポート", () => {
      expect(core).toHaveProperty("classifyPressureError");
      expect(typeof core.classifyPressureError).toBe("function");
    });

    it("isCancelledErrorMessage_関数_エクスポート", () => {
      expect(core).toHaveProperty("isCancelledErrorMessage");
      expect(typeof core.isCancelledErrorMessage).toBe("function");
    });

    it("isTimeoutErrorMessage_関数_エクスポート", () => {
      expect(core).toHaveProperty("isTimeoutErrorMessage");
      expect(typeof core.isTimeoutErrorMessage).toBe("function");
    });
  });

  // ============================================================================
  // Unified error classes (from errors.js)
  // ============================================================================
  describe("errors", () => {
    it("PiError_クラス_エクスポート", () => {
      expect(core).toHaveProperty("PiError");
      expect(typeof core.PiError).toBe("function");
    });

    it("RuntimeLimitError_クラス_エクスポート", () => {
      expect(core).toHaveProperty("RuntimeLimitError");
      expect(typeof core.RuntimeLimitError).toBe("function");
    });

    it("ValidationError_クラス_エクスポート", () => {
      expect(core).toHaveProperty("ValidationError");
      expect(typeof core.ValidationError).toBe("function");
    });

    it("TimeoutError_クラス_エクスポート", () => {
      expect(core).toHaveProperty("TimeoutError");
      expect(typeof core.TimeoutError).toBe("function");
    });

    it("CancelledError_クラス_エクスポート", () => {
      expect(core).toHaveProperty("CancelledError");
      expect(typeof core.CancelledError).toBe("function");
    });

    it("RateLimitError_クラス_エクスポート", () => {
      expect(core).toHaveProperty("RateLimitError");
      expect(typeof core.RateLimitError).toBe("function");
    });

    it("isPiError_関数_エクスポート", () => {
      expect(core).toHaveProperty("isPiError");
      expect(typeof core.isPiError).toBe("function");
    });

    it("isRetryableError_関数_エクスポート", () => {
      expect(core).toHaveProperty("isRetryableError");
      expect(typeof core.isRetryableError).toBe("function");
    });
  });

  // ============================================================================
  // TUI utilities (from tui/tui-utils.js)
  // ============================================================================
  describe("tui-utils", () => {
    it("appendTail_関数_エクスポート", () => {
      expect(core).toHaveProperty("appendTail");
      expect(typeof core.appendTail).toBe("function");
    });

    it("toTailLines_関数_エクスポート", () => {
      expect(core).toHaveProperty("toTailLines");
      expect(typeof core.toTailLines).toBe("function");
    });

    it("countOccurrences_関数_エクスポート", () => {
      expect(core).toHaveProperty("countOccurrences");
      expect(typeof core.countOccurrences).toBe("function");
    });

    it("looksLikeMarkdown_関数_エクスポート", () => {
      expect(core).toHaveProperty("looksLikeMarkdown");
      expect(typeof core.looksLikeMarkdown).toBe("function");
    });

    it("LIVE_TAIL_LIMIT_定数_エクスポート", () => {
      expect(core).toHaveProperty("LIVE_TAIL_LIMIT");
      expect(typeof core.LIVE_TAIL_LIMIT).toBe("number");
    });
  });

  // ============================================================================
  // Validation utilities (from validation-utils.js)
  // ============================================================================
  describe("validation-utils", () => {
    it("toFiniteNumber_関数_エクスポート", () => {
      expect(core).toHaveProperty("toFiniteNumber");
      expect(typeof core.toFiniteNumber).toBe("function");
    });

    it("toFiniteNumberWithDefault_関数_エクスポート", () => {
      expect(core).toHaveProperty("toFiniteNumberWithDefault");
      expect(typeof core.toFiniteNumberWithDefault).toBe("function");
    });

    it("toBoundedInteger_関数_エクスポート", () => {
      expect(core).toHaveProperty("toBoundedInteger");
      expect(typeof core.toBoundedInteger).toBe("function");
    });

    it("clampInteger_関数_エクスポート", () => {
      expect(core).toHaveProperty("clampInteger");
      expect(typeof core.clampInteger).toBe("function");
    });

    it("clampFloat_関数_エクスポート", () => {
      expect(core).toHaveProperty("clampFloat");
      expect(typeof core.clampFloat).toBe("function");
    });
  });

  // ============================================================================
  // File system utilities (from fs-utils.js)
  // ============================================================================
  describe("fs-utils", () => {
    it("ensureDir_関数_エクスポート", () => {
      expect(core).toHaveProperty("ensureDir");
      expect(typeof core.ensureDir).toBe("function");
    });
  });

  // ============================================================================
  // Formatting utilities (from format-utils.js)
  // ============================================================================
  describe("format-utils", () => {
    it("formatDuration_関数_エクスポート", () => {
      expect(core).toHaveProperty("formatDuration");
      expect(typeof core.formatDuration).toBe("function");
    });

    it("formatDurationMs_関数_エクスポート", () => {
      expect(core).toHaveProperty("formatDurationMs");
      expect(typeof core.formatDurationMs).toBe("function");
    });

    it("formatBytes_関数_エクスポート", () => {
      expect(core).toHaveProperty("formatBytes");
      expect(typeof core.formatBytes).toBe("function");
    });

    it("formatClockTime_関数_エクスポート", () => {
      expect(core).toHaveProperty("formatClockTime");
      expect(typeof core.formatClockTime).toBe("function");
    });
  });

  // ============================================================================
  // 統合テスト: 実際の使用パターン
  // ============================================================================
  describe("統合テスト", () => {
    it("toErrorMessage_正常_文字列返却", () => {
      const result = core.toErrorMessage(new Error("test error"));
      expect(result).toBe("test error");
    });

    it("toErrorMessage_正常_文字列入力そのまま", () => {
      const result = core.toErrorMessage("string error");
      expect(result).toBe("string error");
    });

    it("formatDuration_正常_ミリ秒単位", () => {
      const result = core.formatDuration(65);
      expect(result).toContain("ms");
    });

    it("formatDuration_正常_秒単位", () => {
      const result = core.formatDuration(65000);
      expect(result).toContain("s");
    });

    it("formatBytes_正常_KB単位", () => {
      const result = core.formatBytes(1024);
      expect(result).toContain("KB");
    });

    it("clampInteger_正常_範囲内", () => {
      const result = core.clampInteger(5, 0, 10);
      expect(result).toBe(5);
    });

    it("clampInteger_境界_最小値", () => {
      const result = core.clampInteger(-5, 0, 10);
      expect(result).toBe(0);
    });

    it("clampInteger_境界_最大値", () => {
      const result = core.clampInteger(15, 0, 10);
      expect(result).toBe(10);
    });

    it("PiError_正常_インスタンス生成", () => {
      const error = new core.PiError("test", "TEST_001");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("test");
    });

    it("isPiError_正常_PiError判定", () => {
      const error = new core.PiError("test", "TEST_001");
      expect(core.isPiError(error)).toBe(true);
    });

    it("isPiError_正常_通常エラー判定", () => {
      const error = new Error("test");
      expect(core.isPiError(error)).toBe(false);
    });
  });
});
