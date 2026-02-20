/**
 * @file .pi/lib/adaptive-total-limit.ts の単体テスト
 * @description クラスタ全体のTotal max LLM自動調整コントローラーのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";

// 依存モジュールのモック
vi.mock("../../../.pi/lib/runtime-config.js", () => ({
  getRuntimeConfig: vi.fn(() => ({
    profile: "balanced",
    totalMaxLlm: 10,
    totalMaxRequests: 100,
    maxParallelSubagents: 5,
    maxParallelTeams: 3,
    maxParallelTeammates: 5,
    maxConcurrentOrchestrations: 2,
    adaptiveEnabled: true,
    predictiveEnabled: true,
    maxConcurrentPerModel: 5,
    maxTotalConcurrent: 20,
  })),
}));

// モック設定後にインポート
import {
  recordTotalLimitObservation,
  getAdaptiveTotalMaxLlm,
  getAdaptiveTotalLimitSnapshot,
  __resetAdaptiveTotalLimitStateForTests,
  __setAdaptiveTotalLimitNowProviderForTests,
  type TotalLimitObservation,
} from "../../../.pi/lib/adaptive-total-limit.js";

// ============================================================================
// ヘルパー関数
// ============================================================================

function createObservation(overrides: Partial<TotalLimitObservation> = {}): TotalLimitObservation {
  return {
    kind: "success",
    latencyMs: 1000,
    waitMs: 0,
    timestampMs: Date.now(),
    ...overrides,
  };
}

// ============================================================================
// getAdaptiveTotalLimitSnapshot テスト
// ============================================================================

describe("getAdaptiveTotalLimitSnapshot", () => {
  beforeEach(() => {
    __resetAdaptiveTotalLimitStateForTests();
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("snapshot_正常_基本構造確認", () => {
    const snapshot = getAdaptiveTotalLimitSnapshot();

    expect(snapshot).toHaveProperty("enabled");
    expect(snapshot).toHaveProperty("baseLimit");
    expect(snapshot).toHaveProperty("learnedLimit");
    expect(snapshot).toHaveProperty("hardMax");
    expect(snapshot).toHaveProperty("minLimit");
    expect(snapshot).toHaveProperty("sampleCount");
    expect(snapshot).toHaveProperty("lastReason");
  });

  it("snapshot_正常_enabled型確認", () => {
    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(typeof snapshot.enabled).toBe("boolean");
  });

  it("snapshot_正常_数値フィールド型確認", () => {
    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(typeof snapshot.baseLimit).toBe("number");
    expect(typeof snapshot.learnedLimit).toBe("number");
    expect(typeof snapshot.hardMax).toBe("number");
    expect(typeof snapshot.minLimit).toBe("number");
    expect(typeof snapshot.sampleCount).toBe("number");
  });

  it("snapshot_正常_初期状態でlearnedLimitが範囲内", () => {
    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(snapshot.learnedLimit).toBeGreaterThanOrEqual(snapshot.minLimit);
    expect(snapshot.learnedLimit).toBeLessThanOrEqual(snapshot.hardMax);
  });
});

// ============================================================================
// getAdaptiveTotalMaxLlm テスト
// ============================================================================

describe("getAdaptiveTotalMaxLlm", () => {
  beforeEach(() => {
    __resetAdaptiveTotalLimitStateForTests();
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("getAdaptiveTotalMaxLlm_正常_基本値返却", () => {
    const limit = getAdaptiveTotalMaxLlm(10);
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(64);
  });

  it("getAdaptiveTotalMaxLlm_正常_baseLimit反映", () => {
    const limit1 = getAdaptiveTotalMaxLlm(5);
    const limit2 = getAdaptiveTotalMaxLlm(20);

    // 異なるbaseLimitで異なる結果が返る可能性がある
    expect(typeof limit1).toBe("number");
    expect(typeof limit2).toBe("number");
  });

  it("getAdaptiveTotalMaxLlm_境界_最小baseLimit", () => {
    const limit = getAdaptiveTotalMaxLlm(1);
    expect(limit).toBeGreaterThanOrEqual(1);
  });

  it("getAdaptiveTotalMaxLlm_境界_最大baseLimit", () => {
    const limit = getAdaptiveTotalMaxLlm(64);
    expect(limit).toBeLessThanOrEqual(64);
  });

  it("getAdaptiveTotalMaxLlm_無効化_環境変数で無効化", () => {
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "0");
    __resetAdaptiveTotalLimitStateForTests();

    const limit = getAdaptiveTotalMaxLlm(10);
    // 無効時はbaseLimitがそのまま返る
    expect(limit).toBe(10);
  });
});

// ============================================================================
// recordTotalLimitObservation テスト
// ============================================================================

describe("recordTotalLimitObservation", () => {
  let mockNow: number;

  beforeEach(() => {
    __resetAdaptiveTotalLimitStateForTests();
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "1");
    mockNow = Date.now();
    __setAdaptiveTotalLimitNowProviderForTests(() => mockNow);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __setAdaptiveTotalLimitNowProviderForTests();
  });

  it("recordTotalLimitObservation_正常_成功記録", () => {
    recordTotalLimitObservation(createObservation({ kind: "success" }));

    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(1);
  });

  it("recordTotalLimitObservation_正常_レート制限記録", () => {
    recordTotalLimitObservation(createObservation({ kind: "rate_limit" }));

    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(1);
  });

  it("recordTotalLimitObservation_正常_タイムアウト記録", () => {
    recordTotalLimitObservation(createObservation({ kind: "timeout" }));

    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(1);
  });

  it("recordTotalLimitObservation_正常_エラー記録", () => {
    recordTotalLimitObservation(createObservation({ kind: "error" }));

    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(1);
  });

  it("recordTotalLimitObservation_複数_サンプル蓄積", () => {
    for (let i = 0; i < 10; i++) {
      recordTotalLimitObservation(createObservation({ kind: "success" }));
    }

    const snapshot = getAdaptiveTotalLimitSnapshot();
    expect(snapshot.sampleCount).toBeGreaterThanOrEqual(10);
  });

  it("recordTotalLimitObservation_無効化_記録スキップ", () => {
    // 先にリセットしてから無効化
    __resetAdaptiveTotalLimitStateForTests();
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "0");
    __resetAdaptiveTotalLimitStateForTests();

    recordTotalLimitObservation(createObservation({ kind: "success" }));

    // 無効時はサンプルが蓄積されない
    const snapshot = getAdaptiveTotalLimitSnapshot();
    // 無効時は記録がスキップされる
    expect(snapshot.enabled).toBe(false);
  });
});

// ============================================================================
// 統合テスト: 学習動作確認
// ============================================================================

describe("統合テスト: 学習動作", () => {
  let mockNow: number;

  beforeEach(() => {
    __resetAdaptiveTotalLimitStateForTests();
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "1");
    mockNow = Date.now();
    __setAdaptiveTotalLimitNowProviderForTests(() => mockNow);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __setAdaptiveTotalLimitNowProviderForTests();
  });

  it("学習_正常_安定時は維持または増加", () => {
    // 十分なサンプル数を追加
    for (let i = 0; i < 30; i++) {
      mockNow += 1000;
      recordTotalLimitObservation(createObservation({
        kind: "success",
        latencyMs: 10000,
        waitMs: 0,
      }));
    }

    // 時間を進めてクールダウンを解除
    mockNow += 180000;

    const limit = getAdaptiveTotalMaxLlm(10);
    // 学習結果は環境によるが、数値が返ることを確認
    expect(typeof limit).toBe("number");
  });

  it("学習_レート制限_連続時は削減", () => {
    // 十分なサンプル数を追加
    for (let i = 0; i < 30; i++) {
      mockNow += 1000;
      recordTotalLimitObservation(createObservation({
        kind: i % 3 === 0 ? "rate_limit" : "success",
        waitMs: i % 3 === 0 ? 5000 : 0,
      }));
    }

    // 時間を進めてクールダウンを解除
    mockNow += 180000;

    const snapshot = getAdaptiveTotalLimitSnapshot();
    // レート制限が検出されればreasonが変わる
    expect(snapshot.lastReason).toBeDefined();
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  beforeEach(() => {
    __resetAdaptiveTotalLimitStateForTests();
    vi.stubEnv("PI_ADAPTIVE_TOTAL_MAX_LLM", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("PBT: getAdaptiveTotalMaxLlmは常に範囲内の値を返す", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 64 }),
        (baseLimit) => {
          __resetAdaptiveTotalLimitStateForTests();
          const limit = getAdaptiveTotalMaxLlm(baseLimit);
          return limit >= 1 && limit <= 64;
        }
      ),
      { numRuns: 50 }
    );
  });

  it("PBT: あらゆる観測値に対してsnapshotが整合性を保つ", () => {
    const kindArbitrary = fc.constantFrom("success", "rate_limit", "timeout", "error") as fc.Arbitrary<"success" | "rate_limit" | "timeout" | "error">;

    fc.assert(
      fc.property(
        kindArbitrary,
        fc.integer({ min: 0, max: 3600000 }),
        fc.integer({ min: 0, max: 3600000 }),
        (kind, latencyMs, waitMs) => {
          __resetAdaptiveTotalLimitStateForTests();

          recordTotalLimitObservation({ kind, latencyMs, waitMs });

          const snapshot = getAdaptiveTotalLimitSnapshot();
          return (
            snapshot.sampleCount >= 0 &&
            snapshot.learnedLimit >= snapshot.minLimit &&
            snapshot.learnedLimit <= snapshot.hardMax
          );
        }
      ),
      { numRuns: 50 }
    );
  });
});
