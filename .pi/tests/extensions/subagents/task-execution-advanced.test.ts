/**
 * task-execution.tsの重要なエラー処理・リトライロジックのテスト
 * Three-Layer Pipeline、リトライ判定、エラー概要作成のテストを含む
 */

import { describe, it, expect } from "vitest";
import {
  processOutputWithThreeLayerPipeline,
  ensureOutputStructure,
  isRetryableSubagentError,
  buildFailureSummary,
  isEmptyOutputFailureMessage,
} from "../../../extensions/subagents/task-execution.js";

describe("processOutputWithThreeLayerPipeline", () => {
  describe("空出力の処理", () => {
    it("空文字列に対してdegradedフラグを設定する", () => {
      const result = processOutputWithThreeLayerPipeline("");
      // 空出力は何らかの処理が行われる
      expect(result.degraded).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("空白のみの文字列に対してdegradedフラグを設定する", () => {
      const result = processOutputWithThreeLayerPipeline("   \n\t  ");
      expect(result.degraded).toBe(true);
    });
  });

  describe("有効なJSON出力の処理", () => {
    it("有効なJSONオブジェクトを処理する", () => {
      const validOutput = JSON.stringify({ summary: "テスト結果", result: "成功" });
      const result = processOutputWithThreeLayerPipeline(validOutput);
      // スキーマ検証の結果によってok/degradedが決まる
      expect(result.output).toBeDefined();
    });

    it("配列を含む有効なJSONを処理する", () => {
      const validOutput = JSON.stringify({ items: [1, 2, 3], count: 3 });
      const result = processOutputWithThreeLayerPipeline(validOutput);
      expect(result.output).toBeDefined();
    });
  });

  describe("不正なJSON出力の処理", () => {
    it("不正なJSONに対してdegradedフラグを設定する", () => {
      const invalidOutput = "これはJSONではありません";
      const result = processOutputWithThreeLayerPipeline(invalidOutput);
      expect(result.degraded).toBe(true);
      expect(result.appliedLayer).toBe(3);
    });

    it("部分的に壊れたJSONを処理する", () => {
      const brokenJson = '{"summary": "テスト", "result": 壊れている}';
      const result = processOutputWithThreeLayerPipeline(brokenJson);
      expect(result.degraded).toBe(true);
    });
  });
});

describe("ensureOutputStructure", () => {
  describe("構造検証", () => {
    it("出力を検証して結果を返す", () => {
      const output = "単なるテキスト";
      const result = ensureOutputStructure(output);
      expect(result.output).toBeDefined();
    });

    it("JSON形式の出力を検証する", () => {
      const jsonOutput = JSON.stringify({ key: "value" });
      const result = ensureOutputStructure(jsonOutput);
      expect(result.output).toBeDefined();
    });
  });
});

describe("isRetryableSubagentError", () => {
  describe("ネットワークエラー", () => {
    it("ECONNRESETはリトライ可能", () => {
      const error = new Error("ECONNRESET: Connection reset by peer");
      expect(isRetryableSubagentError(error)).toBe(true);
    });

    it("ETIMEDOUTはリトライ可能", () => {
      const error = new Error("ETIMEDOUT: Connection timed out");
      expect(isRetryableSubagentError(error)).toBe(true);
    });

    it("socket hang upはリトライ可能", () => {
      const error = new Error("socket hang up");
      expect(isRetryableSubagentError(error)).toBe(true);
    });

    it("network errorはリトライ可能", () => {
      const error = new Error("network error occurred");
      expect(isRetryableSubagentError(error)).toBe(true);
    });
  });

  describe("HTTPステータスコード", () => {
    it("429 (Too Many Requests) はリトライ可能", () => {
      const error = new Error("Rate limit exceeded");
      expect(isRetryableSubagentError(error, 429)).toBe(true);
    });

    it("503 (Service Unavailable) はリトライ可能", () => {
      const error = new Error("Service temporarily unavailable");
      expect(isRetryableSubagentError(error, 503)).toBe(true);
    });

    it("502 (Bad Gateway) はリトライ可能", () => {
      const error = new Error("Bad Gateway");
      expect(isRetryableSubagentError(error, 502)).toBe(true);
    });

    it("400 (Bad Request) はリトライ不可", () => {
      const error = new Error("Bad Request");
      expect(isRetryableSubagentError(error, 400)).toBe(false);
    });

    it("401 (Unauthorized) はリトライ不可", () => {
      const error = new Error("Unauthorized");
      expect(isRetryableSubagentError(error, 401)).toBe(false);
    });

    it("404 (Not Found) はリトライ不可", () => {
      const error = new Error("Not Found");
      expect(isRetryableSubagentError(error, 404)).toBe(false);
    });
  });

  describe("空出力エラー", () => {
    it("空出力エラーはリトライ可能", () => {
      const error = new Error("subagent returned empty output");
      expect(isRetryableSubagentError(error)).toBe(true);
    });

    it("空出力エラー（大文字）はリトライ可能", () => {
      const error = new Error("SUBAGENT RETURNED EMPTY OUTPUT");
      expect(isRetryableSubagentError(error)).toBe(true);
    });
  });

  describe("非リトライ可能エラー", () => {
    it("不明なエラーはリトライ不可", () => {
      const error = new Error("Unknown error occurred");
      expect(isRetryableSubagentError(error)).toBe(false);
    });

    it("nullエラーはリトライ不可", () => {
      expect(isRetryableSubagentError(null)).toBe(false);
    });

    it("undefinedエラーはリトライ不可", () => {
      expect(isRetryableSubagentError(undefined)).toBe(false);
    });
  });
});

describe("buildFailureSummary", () => {
  describe("空出力エラー", () => {
    it("empty outputを検出する", () => {
      expect(buildFailureSummary("subagent returned empty output")).toBe(
        "(failed: empty output)",
      );
    });

    it("EMPTY OUTPUT（大文字）を検出する", () => {
      expect(buildFailureSummary("EMPTY OUTPUT DETECTED")).toBe(
        "(failed: empty output)",
      );
    });
  });

  describe("タイムアウトエラー", () => {
    it("timeoutを検出する", () => {
      expect(buildFailureSummary("Operation timeout after 30s")).toBe(
        "(failed: timeout)",
      );
    });

    it("timed outを検出する", () => {
      expect(buildFailureSummary("Request timed out")).toBe("(failed: timeout)");
    });
  });

  describe("レート制限エラー", () => {
    it("rate limitを検出する", () => {
      expect(buildFailureSummary("Rate limit exceeded")).toBe(
        "(failed: rate limit)",
      );
    });

    it("429を検出する", () => {
      expect(buildFailureSummary("HTTP 429: Too Many Requests")).toBe(
        "(failed: rate limit)",
      );
    });
  });

  describe("その他のエラー", () => {
    it("不明なエラーは汎用メッセージを返す", () => {
      expect(buildFailureSummary("Something went wrong")).toBe("(failed)");
    });

    it("空文字列は汎用メッセージを返す", () => {
      expect(buildFailureSummary("")).toBe("(failed)");
    });
  });
});

describe("isEmptyOutputFailureMessage", () => {
  it("空出力メッセージを検出する", () => {
    expect(isEmptyOutputFailureMessage("subagent returned empty output")).toBe(true);
  });

  it("大文字小文字を区別しない", () => {
    expect(isEmptyOutputFailureMessage("SUBAGENT RETURNED EMPTY OUTPUT")).toBe(true);
    expect(isEmptyOutputFailureMessage("Subagent Returned Empty Output")).toBe(true);
  });

  it("空出力を含まないメッセージはfalse", () => {
    expect(isEmptyOutputFailureMessage("Operation timed out")).toBe(false);
    expect(isEmptyOutputFailureMessage("Rate limit exceeded")).toBe(false);
  });

  it("日本語メッセージで空出力を含まない場合はfalse", () => {
    expect(isEmptyOutputFailureMessage("エラーが発生しました")).toBe(false);
  });
});
