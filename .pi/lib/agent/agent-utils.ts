/**
 * @abdd.meta
 * path: .pi/lib/agent-utils.ts
 * role: エージェント機能で利用される共通ユーティリティの集約モジュール
 * why: 実装の重複を排除し、メンテナンス性を向上させるため
 * related: .pi/extensions/loop.ts, .pi/extensions/subagents.ts, .pi/extensions/agent-teams.ts
 * public_api: createRunId, computeLiveWindow, TaskComplexity, estimateTaskComplexity, estimateTaskTimeout, estimateTaskTimeoutConstrained
 * invariants: createRunIdは常に一意な文字列を返す、computeLiveWindowの戻り値範囲は0以上total以下
 * side_effects: なし（純粋関数）
 * failure_modes: randomBytesの失敗（システムエラー）、引数が数値以外の場合の型エラー
 * @abdd.explain
 * overview: 実行ID生成、UI表示範囲計算、タスク複雑度推定機能を提供する共有ライブラリ
 * what_it_does:
 *   - 日時と乱数を組み合わせた一意な実行IDを生成する
 *   - カーソル位置に基づき、リスト表示の開始位置と終了位置をスライディングウィンドウ形式で算出する
 *   - タスク文字列の複雑度を推定し、適切なタイムアウト値を計算する
 * why_it_exists:
 *   - 複数の拡張機能（loop, subagents, agent-teams）に存在していた重複コードを削減するため
 *   - ID生成ロジックや表示計算ロジックの修正を一箇所で完結させるため
 *   - タスクの複雑度に応じたタイムアウト設定を一元管理するため
 * scope:
 *   in: 日時情報（createRunId）、カーソル位置・総数・最大行数（computeLiveWindow）、タスク文字列（複雑度推定）
 *   out: 一意ID文字列、または計算された表示範囲オブジェクト（start/end）、タイムアウト値
 */

/**
 * Shared agent utility functions.
 * Consolidates duplicate implementations from:
 * - .pi/extensions/loop.ts (createRunId)
 * - .pi/extensions/subagents.ts (createRunId, computeLiveWindow)
 * - .pi/extensions/agent-teams.ts (createRunId, computeLiveWindow)
 */

import { randomBytes } from "node:crypto";

/**
 * タスク複雑度の分類
 */
export type TaskComplexity = "low" | "medium" | "high";

 /**
  * 一意な実行IDを生成します。
  * @returns 一意な実行ID文字列
  */
export function createRunId(): string {
  const now = new Date();
  const stamp = [
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("-");
  const suffix = randomBytes(3).toString("hex");
  return `${stamp}-${suffix}`;
}

/**
 * @summary 表示範囲を算出
 * @param cursor - 現在のカーソル位置（0開始）
 * @param total - 全アイテム数
 * @param maxRows - 表示可能な最大行数
 * @returns 開始位置（含む）と終了位置（不含）を持つオブジェクト
 */
export function computeLiveWindow(
  cursor: number,
  total: number,
  maxRows: number,
): { start: number; end: number } {
  if (total <= maxRows) return { start: 0, end: total };
  const clampedCursor = Math.max(0, Math.min(total - 1, cursor));
  const start = Math.max(0, Math.min(total - maxRows, clampedCursor - (maxRows - 1)));
  return { start, end: Math.min(total, start + maxRows) };
}

/**
 * タスク複雑度を推定する
 * @summary タスク複雑度推定
 * @param task - タスク文字列
 * @returns 複雑度分類（low, medium, high）
 */
export function estimateTaskComplexity(task: string): TaskComplexity {
  const normalized = String(task || "").trim();

  // 行数カウント
  const lines = normalized.split("\n").length;

  // 複雑度を示すキーワード
  const highComplexityKeywords = [
    "architecture", "refactor", "migrate", "security",
    "アーキテクチャ", "リファクタ", "移行", "セキュリティ",
    "redesign", "rewrite", "overhaul",
  ];

  const mediumComplexityKeywords = [
    "implement", "create", "build", "add",
    "実装", "作成", "構築", "追加",
    "feature", "module",
  ];

  // 複数ファイル操作の検出
  const hasMultipleFiles = /files?[:\[]|[①②③④⑤]/.test(normalized);

  // 高複雑度キーワードの検出
  const hasHighComplexityKeyword = highComplexityKeywords.some((kw) =>
    normalized.toLowerCase().includes(kw.toLowerCase())
  );

  // 中複雑度キーワードの検出
  const hasMediumComplexityKeyword = mediumComplexityKeywords.some((kw) =>
    normalized.toLowerCase().includes(kw.toLowerCase())
  );

  // 判定ロジック
  if (lines > 20 || hasHighComplexityKeyword) {
    return "high";
  }

  if (lines > 5 || hasMultipleFiles || hasMediumComplexityKeyword) {
    return "medium";
  }

  return "low";
}

/**
 * タスク複雑度に基づいてタイムアウトを計算する
 * @summary タイムアウト計算
 * @param task - タスク文字列
 * @param baseTimeoutMs - ベースタイムアウト（デフォルト: 300000ms = 5分）
 * @returns 計算されたタイムアウト値（ミリ秒）
 */
export function estimateTaskTimeout(
  task: string,
  baseTimeoutMs: number = 300000,
): number {
  const complexity = estimateTaskComplexity(task);

  const multipliers: Record<TaskComplexity, number> = {
    low: 0.5,      // 簡単なタスクは半分
    medium: 1.0,   // 標準
    high: 2.0,     // 複雑なタスクは倍
  };

  return Math.trunc(baseTimeoutMs * multipliers[complexity]);
}

/**
 * 最小・最大タイムアウト制約付きでタイムアウトを計算する
 * @summary 制約付きタイムアウト計算
 * @param task - タスク文字列
 * @param options - オプション（baseTimeoutMs, minTimeoutMs, maxTimeoutMs）
 * @returns タイムアウト値（ミリ秒）
 */
export function estimateTaskTimeoutConstrained(
  task: string,
  options: {
    baseTimeoutMs?: number;
    minTimeoutMs?: number;
    maxTimeoutMs?: number;
  } = {},
): number {
  const {
    baseTimeoutMs = 300000,
    minTimeoutMs = 60000,    // 最小1分
    maxTimeoutMs = 600000,   // 最大10分
  } = options;

  const estimated = estimateTaskTimeout(task, baseTimeoutMs);

  return Math.max(minTimeoutMs, Math.min(maxTimeoutMs, estimated));
}
