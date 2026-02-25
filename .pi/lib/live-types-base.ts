/**
 * @abdd.meta
 * path: .pi/lib/live-types-base.ts
 * role: SubagentとTeamのライブ監視で共有する基底型定義
 * why: SubagentLiveItemとTeamLiveItem間の重複を排除し、共通インターフェースを提供するため
 * related: ./live-view-utils.js
 * public_api: BaseLiveSnapshot, LiveStatus
 * invariants: statusはLiveStatus型である, stdoutTailとstderrTailは文字列である, バイト数と改行数は0以上である
 * side_effects: なし（型定義のみ）
 * failure_modes: なし（型定義のみ）
 * @abdd.explain
 * overview: ライブ監視スナップショットの共通基底インターフェースを定義するモジュール
 * what_it_does:
 *   - 実行ステータスやタイムスタンプ（開始、終了、最終チャンク）を定義する
 *   - 標準出力・標準エラー出力のテキスト末尾、バイト数、改行数、改行終端判定を定義する
 *   - LiveStatus型を再エクスポートする
 * why_it_exists:
 *   - 複数のエンティティ（Subagent, Team）で同じ監視データ構造を利用するため
 *   - 型定義を一箇所に集約し、保守性を向上させるため
 * scope:
 *   in: ./live-view-utils.js (LiveStatus型)
 *   out: BaseLiveSnapshot, LiveStatus
 */

/**
 * Live monitoring base types.
 * Shared type definitions for subagent and team live monitoring.
 *
 * This module provides the common base interface for live snapshots,
 * reducing duplication between SubagentLiveItem and TeamLiveItem.
 */

import type { LiveStatus } from "./live-view-utils.js";

// Re-export LiveStatus for convenience
export type { LiveStatus } from "./live-view-utils.js";

// ============================================================================
// State Transition Types (for Gantt Chart)
// ============================================================================

/**
 * State transition entry for Gantt display
 * @summary 状態遷移エントリ
 */
export interface StateTransition {
  /** Timestamp when state started */
  startedAtMs: number;
  /** Timestamp when state ended (undefined if current) */
  finishedAtMs?: number;
  /** State type: RUN (executing) or WAIT (blocked/idle) */
  state: "RUN" | "WAIT";
}

// ============================================================================
// Base Live Snapshot Interface
// ============================================================================

/**
 * ライブ監視スナップショットの共通基底型
 * @summary ライブ監視の基底型
 */
export interface BaseLiveSnapshot {
  /** Current execution status */
  status: LiveStatus;
  /** Execution start timestamp (milliseconds) */
  startedAtMs?: number;
  /** Execution finish timestamp (milliseconds) */
  finishedAtMs?: number;
  /** Last output chunk timestamp (milliseconds) */
  lastChunkAtMs?: number;
  /** Recent stdout lines */
  stdoutTail: string;
  /** Recent stderr lines */
  stderrTail: string;
  /** Total stdout bytes */
  stdoutBytes: number;
  /** Total stderr bytes */
  stderrBytes: number;
  /** Newline count in stdout */
  stdoutNewlineCount: number;
  /** Newline count in stderr */
  stderrNewlineCount: number;
  /** Whether stdout ends with newline */
  stdoutEndsWithNewline: boolean;
  /** Whether stderr ends with newline */
  stderrEndsWithNewline: boolean;
  /** State transition history for Gantt rendering */
  stateTimeline?: StateTransition[];
}
