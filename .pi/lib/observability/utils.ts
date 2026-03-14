/**
 * @abdd.meta
 * path: .pi/lib/observability/utils.ts
 * role: Observability共通ユーティリティ関数
 * why: メトリクス計算、日付処理、ファイル操作の重複を排除するため
 * related: .pi/lib/observability/llm-metrics.ts, .pi/lib/observability/subagent-metrics.ts
 * public_api: percentile, getDateStr, ensureDir, calculatePercentiles
 * invariants: なし
 * side_effects: ensureDirはファイルシステムに書き込む
 * failure_modes: ディスク容量不足、権限エラー
 * @abdd.explain
 * overview: 複数のメトリクスコレクターで共通して使用されるユーティリティ関数群
 * what_it_does:
 *   - パーセンタイル計算（P50/P95/P99）
 *   - 日付文字列生成
 *   - ディレクトリ作成
 *   - 統計集計ヘルパー
 * why_it_exists:
 *   - DRY原則に従い重複コードを排除するため
 *   - 一貫した計算ロジックを保証するため
 * scope:
 *   in: 数値配列、パス、設定
 *   out: 計算結果、副作用としてのディレクトリ作成
 */

import { existsSync, mkdirSync } from "node:fs";

// ============================================================================
// Percentile Calculation
// ============================================================================

/**
 * ソート済み配列からパーセンタイル値を計算
 * @summary パーセンタイル計算
 * @param sortedValues ソート済みの数値配列
 * @param p パーセンタイル（0-100）
 * @returns パーセンタイル値
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;

  const index = Math.min(
    sortedValues.length - 1,
    Math.floor((p / 100) * sortedValues.length)
  );
  return sortedValues[index] ?? 0;
}

/**
 * 複数のパーセンタイルを一度に計算
 * @summary パーセンタイル一括計算
 * @param values 数値配列（ソート不要）
 * @returns P50/P95/P99のオブジェクト
 */
export function calculatePercentiles(values: number[]): {
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * 現在の日付文字列を取得（YYYY-MM-DD形式）
 * @summary 日付文字列取得
 * @returns ISO 8601形式の日付部分
 */
export function getDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 現在のタイムスタンプを取得（ISO 8601形式）
 * @summary タイムスタンプ取得
 * @returns ISO 8601形式のタイムスタンプ
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

// ============================================================================
// File System Utilities
// ============================================================================

/**
 * ディレクトリが存在することを保証（存在しない場合は作成）
 * @summary ディレクトリ保証
 * @param dirPath ディレクトリパス
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

// ============================================================================
// Statistics Utilities
// ============================================================================

/**
 * 配列の平均値を計算
 * @summary 平均値計算
 * @param values 数値配列
 * @returns 平均値（空配列の場合は0）
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 配列の合計値を計算
 * @summary 合計値計算
 * @param values 数値配列
 * @returns 合計値
 */
export function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/**
 * 成功率を計算
 * @summary 成功率計算
 * @param successCount 成功数
 * @param totalCount 合計数
 * @returns 成功率（0-1）
 */
export function successRate(successCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  return successCount / totalCount;
}

// ============================================================================
// Sanitization Utilities
// ============================================================================

/**
 * 結果をサニタイズ（大きなデータを切り詰め）
 * @summary 結果サニタイズ
 * @param result 任意の値
 * @param maxLength 文字列の最大長
 * @param maxObjectSize オブジェクトの最大サイズ（バイト）
 * @returns サニタイズされた値
 */
export function sanitizeResult(
  result: unknown,
  maxLength = 1000,
  maxObjectSize = 10000
): unknown {
  if (result === undefined) return undefined;

  if (typeof result === "string" && result.length > maxLength) {
    return result.slice(0, maxLength) + "... (truncated)";
  }

  if (typeof result === "object" && result !== null) {
    try {
      const str = JSON.stringify(result);
      if (str.length > maxObjectSize) {
        return { truncated: true, size: str.length };
      }
    } catch {
      return { unserializable: true };
    }
  }

  return result;
}
