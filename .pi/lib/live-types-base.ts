/**
 * @abdd.meta
 * path: .pi/lib/live-types-base.ts
 * role: ライブ監視スナップショットの共通基底型
 * why: SubagentLiveItemとTeamLiveItemの共通フィールドを一元管理し、型の一貫性を保つため
 * related: .pi/lib/subagent-types.ts, .pi/lib/team-types.ts, .pi/lib/live-view-utils.ts
 * public_api: BaseLiveSnapshot
 * invariants: すべてのフィールドは読み取り専用
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェント実行のライブ監視に共通する状態フィールドを定義
 * what_it_does: stdout/stderrの追跡、タイムスタンプ管理の共通インターフェースを提供
 * why_it_exists: subagent/team間の型重複を解消し、保守性を向上させる
 * scope:
 *   in: なし（型定義のみ）
 *   out: 基底インターフェース
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
}
