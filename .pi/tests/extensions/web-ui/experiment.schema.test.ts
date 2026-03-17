/**
 * @summary 実験イベントスキーマのテスト
 */

import { describe, it, expect } from "vitest";
import {
  validateExperimentEvent,
  ExperimentStartEventSchema,
  ExperimentBaselineEventSchema,
  ExperimentRunEventSchema,
  ExperimentImprovedEventSchema,
  ExperimentRegressedEventSchema,
  ExperimentTimeoutEventSchema,
  ScoreSchema,
  type ExperimentEventType,
} from "../../../extensions/web-ui/src/schemas/experiment.schema.js";

describe("ScoreSchema", () => {
  it("有効なスコアデータを受け入れる", () => {
    const result = ScoreSchema.safeParse({
      failed: 1,
      passed: 5,
      total: 6,
      durationMs: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("failed + passed !== total を拒否する", () => {
    const result = ScoreSchema.safeParse({
      failed: 1,
      passed: 5,
      total: 10, // 不整合
      durationMs: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("負の値を拒否する", () => {
    const result = ScoreSchema.safeParse({
      failed: -1,
      passed: 5,
      total: 4,
      durationMs: 1000,
    });
    expect(result.success).toBe(false);
  });
});

describe("validateExperimentEvent", () => {
  describe("experiment_start", () => {
    it("有効な実験開始イベントを受け入れる", () => {
      const result = validateExperimentEvent("experiment_start", {
        experimentType: "e2e",
        label: "test-experiment",
      });
      expect(result.success).toBe(true);
      expect(result.data?.experimentType).toBe("e2e");
      expect(result.data?.label).toBe("test-experiment");
    });

    it("experimentTypeが欠けている場合を拒否する", () => {
      const result = validateExperimentEvent("experiment_start", {
        label: "test-experiment",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("experimentType");
    });

    it("labelが欠けている場合を拒否する", () => {
      const result = validateExperimentEvent("experiment_start", {
        experimentType: "tbench",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("label");
    });

    it("空文字のlabelを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", {
        experimentType: "e2e",
        label: "",
      });
      expect(result.success).toBe(false);
    });

    it("無効なexperimentTypeを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", {
        experimentType: "invalid",
        label: "test",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("experiment_baseline", () => {
    it("スコア付きのベースラインイベントを受け入れる", () => {
      const result = validateExperimentEvent("experiment_baseline", {
        experimentType: "e2e",
        label: "test",
        score: { failed: 2, passed: 8, total: 10, durationMs: 5000 },
      });
      expect(result.success).toBe(true);
    });

    it("スコアなしのベースラインイベントも受け入れる", () => {
      const result = validateExperimentEvent("experiment_baseline", {
        experimentType: "tbench",
        label: "test",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("experiment_run", () => {
    it("実行イベントを受け入れる", () => {
      const result = validateExperimentEvent("experiment_run", {
        experimentType: "e2e",
        label: "test",
        score: { failed: 1, passed: 9, total: 10, durationMs: 4000 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("experiment_improved", () => {
    it("改善イベントには前後のスコアが必須", () => {
      const result = validateExperimentEvent("experiment_improved", {
        experimentType: "e2e",
        label: "test",
        improvementType: "fewer_failures",
        previousScore: { failed: 5, passed: 5, total: 10, durationMs: 10000 },
        newScore: { failed: 2, passed: 8, total: 10, durationMs: 8000 },
      });
      expect(result.success).toBe(true);
    });

    it("previousScoreが欠けている場合を拒否する", () => {
      const result = validateExperimentEvent("experiment_improved", {
        experimentType: "e2e",
        label: "test",
        improvementType: "fewer_failures",
        newScore: { failed: 2, passed: 8, total: 10, durationMs: 8000 },
      });
      expect(result.success).toBe(false);
    });

    it("無効なimprovementTypeを拒否する", () => {
      const result = validateExperimentEvent("experiment_improved", {
        experimentType: "e2e",
        label: "test",
        improvementType: "invalid_type",
        previousScore: { failed: 5, passed: 5, total: 10, durationMs: 10000 },
        newScore: { failed: 2, passed: 8, total: 10, durationMs: 8000 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("experiment_regressed", () => {
    it("退行イベントには前後のスコアが必須", () => {
      const result = validateExperimentEvent("experiment_regressed", {
        experimentType: "tbench",
        label: "test",
        regressionType: "more_failures",
        previousScore: { failed: 2, passed: 8, total: 10, durationMs: 8000 },
        newScore: { failed: 5, passed: 5, total: 10, durationMs: 10000 },
      });
      expect(result.success).toBe(true);
    });

    it("revertedフラグはオプション", () => {
      const result = validateExperimentEvent("experiment_regressed", {
        experimentType: "tbench",
        label: "test",
        regressionType: "more_failures",
        previousScore: { failed: 2, passed: 8, total: 10, durationMs: 8000 },
        newScore: { failed: 5, passed: 5, total: 10, durationMs: 10000 },
        reverted: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("experiment_timeout", () => {
    it("タイムアウトイベントにはtimeoutMsが必須", () => {
      const result = validateExperimentEvent("experiment_timeout", {
        experimentType: "e2e",
        label: "test",
        timeoutMs: 60000,
      });
      expect(result.success).toBe(true);
    });

    it("timeoutMsが欠けている場合を拒否する", () => {
      const result = validateExperimentEvent("experiment_timeout", {
        experimentType: "e2e",
        label: "test",
      });
      expect(result.success).toBe(false);
    });

    it("部分スコアを含めることができる", () => {
      const result = validateExperimentEvent("experiment_timeout", {
        experimentType: "e2e",
        label: "test",
        timeoutMs: 60000,
        partialScore: { failed: 1, passed: 3, total: 4, durationMs: 30000 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("unknown event type", () => {
    it("未知のイベントタイプを拒否する", () => {
      const result = validateExperimentEvent(
        "unknown_event" as ExperimentEventType,
        { experimentType: "e2e", label: "test" }
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown event type");
    });
  });

  describe("malformed data handling", () => {
    it("nullデータを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", null);
      expect(result.success).toBe(false);
    });

    it("undefinedデータを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", undefined);
      expect(result.success).toBe(false);
    });

    it("空オブジェクトを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", {});
      expect(result.success).toBe(false);
    });

    it("文字列データを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", "invalid");
      expect(result.success).toBe(false);
    });

    it("配列データを拒否する", () => {
      const result = validateExperimentEvent("experiment_start", []);
      expect(result.success).toBe(false);
    });
  });
});

describe("Schema type inference", () => {
  it("ExperimentStartEventSchemaが正しい型を推論する", () => {
    const data = {
      experimentType: "e2e" as const,
      label: "test",
      tag: "v1.0.0",
      branch: "main",
      iteration: 1,
    };
    const result = ExperimentStartEventSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.experimentType).toBe("e2e");
      expect(result.data.label).toBe("test");
      expect(result.data.tag).toBe("v1.0.0");
    }
  });
});