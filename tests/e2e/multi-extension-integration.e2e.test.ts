/**
 * @abdd.meta
 * path: tests/e2e/multi-extension-integration.e2e.test.ts
 * role: 複数拡張機能の統合E2Eテスト（observability-dataとautoresearch-tbenchのイベントフロー検証）
 * why: クロス拡張機能のイベントプロデューサー/コンシューマーが正しく連携することを検証するため
 * related: .pi/extensions/observability-data.ts, .pi/extensions/autoresearch-tbench.ts, .pi/lib/comprehensive-logger.ts
 * public_api: describe, it, expect, beforeEach, afterEach (Vitest)
 * invariants: テスト実行順序に依存しない、各テストは独立して実行可能
 * side_effects: .pi/logs/ へのイベント書き込み
 * failure_modes: イベントの欠落、パースエラー、クロス拡張機能間の通信失敗
 * @abdd.explain
 * overview: observability-dataとautoresearch-tbench拡張機能間のイベントフローを検証するE2Eテストスイート
 * what_it_does:
 *   - autoresearch-tbenchが生成するイベントをobservability-dataがクエリできることを検証
 *   - イベントの登録、配送、フィルタリングのライフサイクルをテスト
 *   - クロス拡張機能のイベントプロデューサー/コンシューマー連携を検証
 * why_it_exists:
 *   - 拡張機能間のイベントフローが実際に動作することを保証するため
 *   - イベント損失や通信エラーを早期に発見するため
 * scope:
 *   in: observability_data ツール, autoresearch_tbench イベント, ComprehensiveLogger
 *   out: テスト結果、カバレッジレポート
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// テスト対象のモジュールをインポート
import {
  queryObservabilityData,
  type ObservabilityQuery,
  type ObservabilityResult,
} from "../../.pi/extensions/observability-data.js";
import {
  getLogger,
  resetLogger,
  type ComprehensiveLogger,
} from "../../.pi/lib/comprehensive-logger.js";
import type { EventType, LogEvent } from "../../.pi/lib/comprehensive-logger-types.js";

// テスト用一時ディレクトリ
let testLogDir: string;
let logger: ComprehensiveLogger;

describe("E2E: observability-data と autoresearch-tbench のイベントフロー", () => {
  beforeEach(async () => {
    // テスト用一時ディレクトリを作成
    testLogDir = join(tmpdir(), `observability-test-${Date.now()}`);
    mkdirSync(testLogDir, { recursive: true });

    // ロガーをリセットしてテスト用設定を適用
    resetLogger();
    logger = getLogger({
      logDir: testLogDir,
      enabled: true,
      bufferSize: 1,
      flushIntervalMs: 10,
    });

    // 初期フラッシュ
    await logger.flush();
  });

  afterEach(async () => {
    // ロガーをフラッシュしてリセット
    if (logger) {
      await logger.flush();
    }
    resetLogger();

    // テスト用ディレクトリを削除
    if (existsSync(testLogDir)) {
      try {
        rmSync(testLogDir, { recursive: true, force: true });
      } catch {
        // ディレクトリ削除エラーは無視
      }
    }
  });

  describe("シナリオ1: 実験イベントの記録とクエリ", () => {
    it("GIVEN autoresearch-tbenchがexperiment_startイベントを生成 WHEN observability-dataがクエリ THEN イベントが取得できる", async () => {
      // GIVEN: autoresearch-tbenchがexperiment_startイベントを生成
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "test-experiment-1",
        tag: "test-tag",
        branch: "test-branch",
        config: { iterations: 3 },
      });

      // フラッシュしてイベントをファイルに書き込む
      await logger.flush();

      // WHEN: observability-dataがクエリ
      const result = queryObservabilityData({
        eventTypes: ["experiment_start"],
        includeStats: true,
      });

      // THEN: イベントが取得できる
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const startEvent = result.events.find((e) => e.eventType === "experiment_start");
      expect(startEvent).toBeDefined();
      expect((startEvent as any).data.label).toBe("test-experiment-1");
      expect((startEvent as any).data.experimentType).toBe("tbench");
    });

    it("GIVEN autoresearch-tbenchがexperiment_baselineイベントを生成 WHEN observability-dataがクエリ THEN スコア情報が取得できる", async () => {
      // GIVEN: experiment_baselineイベントを生成
      logger.logExperimentBaseline({
        experimentType: "tbench",
        label: "baseline-test",
        score: { failed: 1, passed: 5, total: 6, durationMs: 10000 },
        commit: "abc123",
      });

      await logger.flush();

      // WHEN: クエリ
      const result = queryObservabilityData({
        eventTypes: ["experiment_baseline"],
      });

      // THEN: ベースラインイベントが取得できる
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const baselineEvent = result.events.find((e) => e.eventType === "experiment_baseline");
      expect(baselineEvent).toBeDefined();
      expect((baselineEvent as any).data.label).toBe("baseline-test");
      expect((baselineEvent as any).data.score.failed).toBe(1);
      expect((baselineEvent as any).data.score.passed).toBe(5);
    });
  });

  describe("シナリオ2: 複数イベントタイプのフィルタリング", () => {
    it("GIVEN 複数種類のイベント WHEN 特定タイプでフィルタリング THEN 該当イベントのみ取得できる", async () => {
      // GIVEN: 複数種類のイベントを生成
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "filter-test",
        config: {},
      });

      logger.logExperimentRun({
        experimentType: "tbench",
        label: "filter-test",
        iteration: 1,
      });

      logger.logToolCall(
        "autoresearch_tbench",
        { action: "run" },
        { file: "test.ts", line: 1, function: "test" }
      );

      await logger.flush();

      // WHEN: 実験イベントのみでフィルタリング
      const result = queryObservabilityData({
        eventTypes: ["experiment_start", "experiment_run"],
      });

      // THEN: 実験イベントのみ取得できる
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      result.events.forEach((event) => {
        expect(["experiment_start", "experiment_run"]).toContain(event.eventType);
      });
    });
  });

  describe("シナリオ3: ライフサイクルイベントの検証", () => {
    it("GIVEN 実験のライフサイクルイベント WHEN 完了まで記録 THEN 全イベントが追跡できる", async () => {
      // GIVEN: 実験のライフサイクルをシミュレート
      // 1. 実験開始
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "lifecycle-test",
        config: { iterations: 5 },
      });

      // 2. ベースライン記録
      logger.logExperimentBaseline({
        experimentType: "tbench",
        label: "lifecycle-test",
        score: { failed: 2, passed: 4, total: 6, durationMs: 30000 },
      });

      // 3. 実行
      logger.logExperimentRun({
        experimentType: "tbench",
        label: "lifecycle-test",
        iteration: 1,
      });

      // 4. 改善検出
      logger.logExperimentImproved({
        experimentType: "tbench",
        label: "lifecycle-test",
        previousScore: { failed: 2, passed: 4, total: 6, durationMs: 30000 },
        newScore: { failed: 0, passed: 6, total: 6, durationMs: 25000 },
        improvementType: "fewer_failures",
      });

      // 5. 停止
      logger.logExperimentStop({
        experimentType: "tbench",
        label: "lifecycle-test",
        iteration: 1,
        reason: "success",
      });

      await logger.flush();

      // WHEN: 全ライフサイクルイベントをクエリ
      const result = queryObservabilityData({
        eventTypes: [
          "experiment_start",
          "experiment_baseline",
          "experiment_run",
          "experiment_improved",
          "experiment_stop",
        ],
      });

      // THEN: 全イベントが追跡できる
      expect(result.events.length).toBeGreaterThanOrEqual(5);

      const eventTypes = result.events.map((e) => e.eventType);
      expect(eventTypes).toContain("experiment_start");
      expect(eventTypes).toContain("experiment_baseline");
      expect(eventTypes).toContain("experiment_run");
      expect(eventTypes).toContain("experiment_improved");
      expect(eventTypes).toContain("experiment_stop");
    });
  });

  describe("シナリオ4: エラーイベントの検証", () => {
    it("GIVEN 実験がクラッシュ WHEN クラッシュイベントを記録 THEN クラッシュイベントが取得できる", async () => {
      // GIVEN: クラッシュイベントを記録
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "crash-test",
        config: {},
      });

      logger.logExperimentCrash({
        experimentType: "tbench",
        label: "crash-test",
        iteration: 2,
        error: "Test error message",
      });

      await logger.flush();

      // WHEN: クラッシュイベントをクエリ
      const result = queryObservabilityData({
        eventTypes: ["experiment_crash"],
      });

      // THEN: クラッシュイベントが取得できる
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const crashEvent = result.events.find((e) => e.eventType === "experiment_crash");
      expect(crashEvent).toBeDefined();
      expect((crashEvent as any).data.label).toBe("crash-test");
      expect((crashEvent as any).data.error).toBe("Test error message");
    });

    it("GIVEN 実験がタイムアウト WHEN タイムアウトイベントを記録 THEN タイムアウトイベントが取得できる", async () => {
      // GIVEN: タイムアウトイベントを記録
      logger.logExperimentTimeout({
        experimentType: "tbench",
        label: "timeout-test",
        iteration: 5,
        timeoutMs: 60000,
      });

      await logger.flush();

      // WHEN: タイムアウトイベントをクエリ
      const result = queryObservabilityData({
        eventTypes: ["experiment_timeout"],
      });

      // THEN: タイムアウトイベントが取得できる
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const timeoutEvent = result.events.find((e) => e.eventType === "experiment_timeout");
      expect(timeoutEvent).toBeDefined();
      expect((timeoutEvent as any).data.label).toBe("timeout-test");
      expect((timeoutEvent as any).data.timeoutMs).toBe(60000);
    });
  });

  describe("シナリオ5: 退行イベントの検証", () => {
    it("GIVEN 実験が退行 WHEN 退行イベントを記録 THEN 退行情報が取得できる", async () => {
      // GIVEN: 退行イベントを記録
      logger.logExperimentRegressed({
        experimentType: "tbench",
        label: "regression-test",
        previousScore: { failed: 0, passed: 6, total: 6, durationMs: 25000 },
        newScore: { failed: 2, passed: 4, total: 6, durationMs: 35000 },
        regressionType: "more_failures",
        reverted: true,
      });

      await logger.flush();

      // WHEN: 退行イベントをクエリ
      const result = queryObservabilityData({
        eventTypes: ["experiment_regressed"],
      });

      // THEN: 退行イベントが取得できる
      expect(result.events.length).toBeGreaterThanOrEqual(1);

      const regressedEvent = result.events.find((e) => e.eventType === "experiment_regressed");
      expect(regressedEvent).toBeDefined();
      expect((regressedEvent as any).data.label).toBe("regression-test");
      expect((regressedEvent as any).data.regressionType).toBe("more_failures");
      expect((regressedEvent as any).data.reverted).toBe(true);
    });
  });

  describe("シナリオ6: 統計情報の検証", () => {
    it("GIVEN 複数のイベント WHEN 統計付きでクエリ THEN 正確な統計が取得できる", async () => {
      // GIVEN: 複数のイベントを生成
      for (let i = 0; i < 5; i++) {
        logger.logExperimentRun({
          experimentType: "tbench",
          label: `stats-test-${i}`,
          iteration: i,
        });
      }

      await logger.flush();

      // WHEN: 統計付きでクエリ
      const result = queryObservabilityData({
        eventTypes: ["experiment_run"],
        includeStats: true,
      });

      // THEN: 統計が正確
      expect(result.stats).toBeDefined();
      expect(result.stats!.totalEvents).toBeGreaterThanOrEqual(5);
      expect(result.stats!.eventsByType["experiment_run"]).toBeGreaterThanOrEqual(5);
      expect(result.stats!.firstEventAt).toBeDefined();
      expect(result.stats!.lastEventAt).toBeDefined();
    });
  });

  describe("シナリオ7: タスクID・セッションIDによるフィルタリング", () => {
    it("GIVEN 特定タスクのイベント WHEN タスクIDでフィルタリング THEN 該当イベントのみ取得できる", async () => {
      // 現在のタスクIDを設定
      const taskId = logger.getCurrentTaskId();

      // GIVEN: イベントを生成
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "taskid-test",
        config: {},
      });

      await logger.flush();

      // WHEN: タスクIDでフィルタリング
      const result = queryObservabilityData({
        taskId,
        eventTypes: ["experiment_start"],
      });

      // THEN: 該当タスクのイベントのみ取得
      result.events.forEach((event) => {
        expect(event.taskId).toBe(taskId);
      });
    });
  });
});

/**
 * ユーザージャーニーテスト
 *
 * 実際のユーザーが使用する典型的なワークフローをテスト
 */
describe("E2E: ユーザージャーニー - autoresearch監視", () => {
  let testLogDir: string;
  let logger: ComprehensiveLogger;

  beforeEach(async () => {
    testLogDir = join(tmpdir(), `observability-journey-${Date.now()}`);
    mkdirSync(testLogDir, { recursive: true });
    resetLogger();
    logger = getLogger({
      logDir: testLogDir,
      enabled: true,
      bufferSize: 1,
      flushIntervalMs: 10,
    });
    await logger.flush();
  });

  afterEach(async () => {
    if (logger) {
      await logger.flush();
    }
    resetLogger();
    if (existsSync(testLogDir)) {
      try {
        rmSync(testLogDir, { recursive: true, force: true });
      } catch {
        // 削除エラーは無視
      }
    }
  });

  describe("ジャーニー1: 実験の開始から完了まで", () => {
    it("ユーザーが実験を開始し、完了するまでのイベントフローをテストする", async () => {
      const label = "journey-test";

      // 1. 実験開始
      logger.logExperimentStart({
        experimentType: "tbench",
        label,
        config: { iterations: 5 },
      });

      // 2. ベースライン記録
      logger.logExperimentBaseline({
        experimentType: "tbench",
        label,
        score: { failed: 2, passed: 8, total: 10, durationMs: 60000 },
      });

      // 3. 複数回の実行
      for (let i = 1; i <= 3; i++) {
        logger.logExperimentRun({
          experimentType: "tbench",
          label,
          iteration: i,
        });
      }

      // 4. 改善検出
      logger.logExperimentImproved({
        experimentType: "tbench",
        label,
        previousScore: { failed: 2, passed: 8, total: 10, durationMs: 60000 },
        newScore: { failed: 0, passed: 10, total: 10, durationMs: 55000 },
        improvementType: "fewer_failures",
      });

      // 5. 実験停止
      logger.logExperimentStop({
        experimentType: "tbench",
        label,
        iteration: 3,
        reason: "success",
      });

      await logger.flush();

      // 検証: 全イベントが記録されている
      const result = queryObservabilityData({
        eventTypes: [
          "experiment_start",
          "experiment_baseline",
          "experiment_run",
          "experiment_improved",
          "experiment_stop",
        ],
        includeStats: true,
      });

      expect(result.events.length).toBeGreaterThanOrEqual(7);

      const eventCounts = {
        experiment_start: result.events.filter((e) => e.eventType === "experiment_start").length,
        experiment_baseline: result.events.filter((e) => e.eventType === "experiment_baseline").length,
        experiment_run: result.events.filter((e) => e.eventType === "experiment_run").length,
        experiment_improved: result.events.filter((e) => e.eventType === "experiment_improved").length,
        experiment_stop: result.events.filter((e) => e.eventType === "experiment_stop").length,
      };

      expect(eventCounts.experiment_start).toBeGreaterThanOrEqual(1);
      expect(eventCounts.experiment_baseline).toBeGreaterThanOrEqual(1);
      expect(eventCounts.experiment_run).toBeGreaterThanOrEqual(3);
      expect(eventCounts.experiment_improved).toBeGreaterThanOrEqual(1);
      expect(eventCounts.experiment_stop).toBeGreaterThanOrEqual(1);
    });
  });

  describe("ジャーニー2: エラーからの回復", () => {
    it("実験がクラッシュし、再開するまでのイベントフローをテストする", async () => {
      const label = "recovery-test";

      // 1. 実験開始
      logger.logExperimentStart({
        experimentType: "tbench",
        label,
        config: { iterations: 5 },
      });

      // 2. クラッシュ発生
      logger.logExperimentCrash({
        experimentType: "tbench",
        label,
        iteration: 2,
        error: "Network timeout",
      });

      // 3. 再開
      logger.logExperimentStart({
        experimentType: "tbench",
        label: `${label}-retry`,
        config: { iterations: 5 },
      });

      await logger.flush();

      // 検証: クラッシュと再開が記録されている
      const result = queryObservabilityData({
        eventTypes: ["experiment_start", "experiment_crash"],
      });

      const startEvents = result.events.filter((e) => e.eventType === "experiment_start");
      const crashEvents = result.events.filter((e) => e.eventType === "experiment_crash");

      expect(startEvents.length).toBeGreaterThanOrEqual(2);
      expect(crashEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});

/**
 * 受け入れテスト
 *
 * プロダクトオーナーが定義した受け入れ基準を満たすかテスト
 */
describe("E2E: 受け入れテスト - クロス拡張機能イベントフロー", () => {
  let testLogDir: string;
  let logger: ComprehensiveLogger;

  beforeEach(async () => {
    testLogDir = join(tmpdir(), `observability-acceptance-${Date.now()}`);
    mkdirSync(testLogDir, { recursive: true });
    resetLogger();
    logger = getLogger({
      logDir: testLogDir,
      enabled: true,
      bufferSize: 1,
      flushIntervalMs: 10,
    });
    await logger.flush();
  });

  afterEach(async () => {
    if (logger) {
      await logger.flush();
    }
    resetLogger();
    if (existsSync(testLogDir)) {
      try {
        rmSync(testLogDir, { recursive: true, force: true });
      } catch {
        // 削除エラーは無視
      }
    }
  });

  describe("受け入れ基準1: イベントの記録と取得", () => {
    it("autoresearch-tbenchがイベントを生成し、observability-dataがそれを取得できる", async () => {
      // AC1: autoresearch-tbenchがイベントを生成できる
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "acceptance-test",
        config: {},
      });

      await logger.flush();

      // AC2: observability-dataがイベントを取得できる
      const result = queryObservabilityData({
        eventTypes: ["experiment_start"],
      });

      expect(result.events.length).toBeGreaterThanOrEqual(1);

      // AC3: イベントの内容が正しい
      const event = result.events.find((e) => e.eventType === "experiment_start");
      expect(event).toBeDefined();
      expect((event as any).data.experimentType).toBe("tbench");
      expect((event as any).data.label).toBe("acceptance-test");
    });
  });

  describe("受け入れ基準2: フィルタリング機能", () => {
    it("ユーザーはイベントをタイプでフィルタリングできる", async () => {
      // 複数のイベントを生成
      logger.logExperimentStart({
        experimentType: "tbench",
        label: "filter-acceptance",
        config: {},
      });

      logger.logToolCall(
        "autoresearch_tbench",
        {},
        { file: "test.ts", line: 1, function: "test" }
      );

      await logger.flush();

      // AC1: タイプでフィルタリング
      const typeResult = queryObservabilityData({
        eventTypes: ["experiment_start"],
      });
      expect(typeResult.events.every((e) => e.eventType === "experiment_start")).toBe(true);
    });
  });

  describe("受け入れ基準3: 統計情報", () => {
    it("ユーザーはイベントの統計情報を取得できる", async () => {
      // 複数のイベントを生成
      for (let i = 0; i < 5; i++) {
        logger.logExperimentRun({
          experimentType: "tbench",
          label: `stats-test-${i}`,
          iteration: i,
        });
      }

      await logger.flush();

      // AC1: 統計情報を取得できる
      const result = queryObservabilityData({
        eventTypes: ["experiment_run"],
        includeStats: true,
      });

      expect(result.stats).toBeDefined();

      // AC2: 統計が正確
      expect(result.stats!.totalEvents).toBeGreaterThanOrEqual(5);
      expect(result.stats!.eventsByType["experiment_run"]).toBeGreaterThanOrEqual(5);

      // AC3: 最初/最後のイベント時刻が記録されている
      expect(result.stats!.firstEventAt).toBeDefined();
      expect(result.stats!.lastEventAt).toBeDefined();
    });
  });
});
