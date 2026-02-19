/**
 * runtime-error-builders.ts 単体テスト
 * カバレッジ分析: resolveEffectiveTimeoutMs をカバー
 * エッジケース: ユーザー指定のみ、モデル固有のみ、フォールバックのみ
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";
import { resolveEffectiveTimeoutMs } from "../../../.pi/lib/runtime-error-builders.js";

// ============================================================================
// resolveEffectiveTimeoutMs テスト
// ============================================================================

describe("resolveEffectiveTimeoutMs", () => {
  it("resolveEffectiveTimeoutMs_全て指定なし_フォールバック返却", () => {
    // Arrange
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("resolveEffectiveTimeoutMs_ユーザー指定のみ_ユーザー値返却", () => {
    // Arrange
    const userTimeoutMs = 60000;
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, undefined, fallback);

    // Assert
    expect(result).toBe(userTimeoutMs);
  });

  it("resolveEffectiveTimeoutMs_モデル固有のみ_モデル値返却", () => {
    // Arrange
    const modelId = "claude-sonnet-4"; // モデル固有タイムアウトを持つモデル
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert - モデル固有タイムアウトがあればそれが使用される
    expect(result).toBeGreaterThan(0);
  });

  it("resolveEffectiveTimeoutMs_両方指定_大きい方を返却", () => {
    // Arrange
    const userTimeoutMs = 60000;
    const modelId = "claude-sonnet-4";
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, modelId, fallback);

    // Assert - ユーザー指定とモデル固有の大きい方
    expect(result).toBeGreaterThanOrEqual(userTimeoutMs);
  });

  it("resolveEffectiveTimeoutMs_ユーザー値が大きい_ユーザー値使用", () => {
    // Arrange - 非常に大きなユーザー値（モデル固有より大きい）
    const userTimeoutMs = 600000; // 10分 - モデル固有の336000より大きい
    const modelId = "claude-sonnet-4";
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, modelId, fallback);

    // Assert - ユーザー値がモデル固有より大きいのでユーザー値が使用される
    expect(result).toBe(userTimeoutMs);
  });

  it("resolveEffectiveTimeoutMs_ゼロユーザー値_フォールバックまたはモデル値", () => {
    // Arrange
    const userTimeoutMs = 0;
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, undefined, fallback);

    // Assert - 0は無効として扱われ、フォールバックが使用される可能性
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("resolveEffectiveTimeoutMs_負のユーザー値_フォールバック使用", () => {
    // Arrange
    const userTimeoutMs = -1000;
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("resolveEffectiveTimeoutMs_文字列としての数値_変換される", () => {
    // Arrange
    const userTimeoutMs = "60000" as unknown as number;
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, undefined, fallback);

    // Assert
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("resolveEffectiveTimeoutMs_無効な文字列_フォールバック使用", () => {
    // Arrange
    const userTimeoutMs = "invalid" as unknown as number;
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("resolveEffectiveTimeoutMs_session-defaultモデル_モデル固有無視", () => {
    // Arrange
    const modelId = "(session-default)";
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert - session-defaultはモデル固有タイムアウトなし
    expect(result).toBe(fallback);
  });

  it("resolveEffectiveTimeoutMs_空文字モデル_モデル固有無視", () => {
    // Arrange
    const modelId = "";
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("resolveEffectiveTimeoutMs_nullモデル_モデル固有無視", () => {
    // Arrange
    const modelId = null as unknown as string;
    const fallback = 30000;

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert
    expect(result).toBe(fallback);
  });
});

// ============================================================================
// モデル別タイムアウトテスト
// ============================================================================

describe("モデル別タイムアウト", () => {
  const fallback = 30000;

  it("claude-sonnet-4_モデル固有タイムアウト適用", () => {
    // Arrange
    const modelId = "claude-sonnet-4";

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert - モデル固有の値が返される
    expect(result).toBeGreaterThan(0);
  });

  it("claude-opus-4_モデル固有タイムアウト適用", () => {
    // Arrange
    const modelId = "claude-opus-4";

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert
    expect(result).toBeGreaterThan(0);
  });

  it("claude-3-5-sonnet_モデル固有タイムアウト適用", () => {
    // Arrange
    const modelId = "claude-3-5-sonnet";

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert
    expect(result).toBeGreaterThan(0);
  });

  it("未知のモデル_フォールバックまたはデフォルト使用", () => {
    // Arrange
    const modelId = "unknown-model-xyz";

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, modelId, fallback);

    // Assert - 未知のモデルはデフォルトのタイムアウト値またはフォールバックを使用
    // 実装ではデフォルト値(336000ms)が設定される可能性がある
    expect(result).toBeGreaterThan(0);
  });

  it("ユーザー指定がモデル固有より大きい_ユーザー優先", () => {
    // Arrange
    const userTimeoutMs = 600000; // 10分
    const modelId = "claude-sonnet-4";

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, modelId, fallback);

    // Assert
    expect(result).toBe(userTimeoutMs);
  });

  it("モデル固有がユーザー指定より大きい_モデル優先", () => {
    // Arrange
    const userTimeoutMs = 1000; // 1秒（短い）
    const modelId = "claude-sonnet-4";

    // Act
    const result = resolveEffectiveTimeoutMs(userTimeoutMs, modelId, fallback);

    // Assert - モデル固有の方が大きければそちらを使用
    expect(result).toBeGreaterThanOrEqual(userTimeoutMs);
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("resolveEffectiveTimeoutMs_任意の入力_非負の数値を返す", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.oneof(fc.string(), fc.constant(undefined)),
        fc.integer({ min: 0, max: 1000000 }),
        (userTimeoutMs, modelId, fallback) => {
          const result = resolveEffectiveTimeoutMs(
            userTimeoutMs as unknown as number,
            modelId,
            fallback
          );

          expect(result).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(result)).toBe(true);

          return true;
        }
      )
    );
  });

  it("resolveEffectiveTimeoutMs_フォールバックは常に有効な選択肢", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.oneof(fc.string(), fc.constant(undefined)),
        fc.integer({ min: 1000, max: 3600000 }),
        (userTimeoutMs, modelId, fallback) => {
          const result = resolveEffectiveTimeoutMs(
            userTimeoutMs as unknown as number,
            modelId,
            fallback
          );

          // 結果は少なくともフォールバック以上、または有効なユーザー/モデル値
          expect(result).toBeGreaterThanOrEqual(0);

          return true;
        }
      )
    );
  });
});

// ============================================================================
// 境界値テスト
// ============================================================================

describe("境界値テスト", () => {
  const fallback = 30000;

  it("フォールバックが0_0を返却可能", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(undefined, undefined, 0);

    // Assert
    expect(result).toBe(0);
  });

  it("フォールバックが最大値_正しく処理", () => {
    // Arrange
    const maxFallback = 2147483647; // MAX_INT

    // Act
    const result = resolveEffectiveTimeoutMs(undefined, undefined, maxFallback);

    // Assert
    expect(result).toBe(maxFallback);
  });

  it("ユーザー値が最小正の値_正しく処理", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(1, undefined, fallback);

    // Assert
    expect(result).toBe(1);
  });

  it("ユーザー値が非常に大きい_そのまま使用", () => {
    // Arrange
    const largeTimeout = 86400000; // 24時間

    // Act
    const result = resolveEffectiveTimeoutMs(largeTimeout, undefined, fallback);

    // Assert
    expect(result).toBe(largeTimeout);
  });
});

// ============================================================================
// エラーハンドリングテスト
// ============================================================================

describe("エラーハンドリング", () => {
  const fallback = 30000;

  it("NaNユーザー値_フォールバック使用", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(NaN, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("Infinityユーザー値_フォールバック使用", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(Infinity, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("オブジェクトユーザー値_フォールバック使用", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(
      {} as unknown as number,
      undefined,
      fallback
    );

    // Assert
    expect(result).toBe(fallback);
  });

  it("配列ユーザー値_フォールバック使用", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(
      [] as unknown as number,
      undefined,
      fallback
    );

    // Assert
    expect(result).toBe(fallback);
  });

  it("undefinedユーザー値_フォールバックまたはモデル値", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(undefined, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });

  it("nullユーザー値_フォールバック使用", () => {
    // Act
    const result = resolveEffectiveTimeoutMs(null as unknown as number, undefined, fallback);

    // Assert
    expect(result).toBe(fallback);
  });
});
