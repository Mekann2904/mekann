/**
 * Subagent type definitions.
 * Extracted from subagents.ts for maintainability.
 *
 * These types are used by the subagent live monitoring system and
 * parallel execution coordination.
 *
 * Related: extensions/subagents.ts, extensions/subagents/storage.ts
 */

import type { LiveStreamView, LiveViewMode } from "./tui/live-monitor-base.js";
import type { LiveStatus } from "./live-view-utils.js";

// Use LiveStatus from live-view-utils.ts for the canonical definition
export type { LiveStreamView, LiveViewMode } from "./tui/live-monitor-base.js";

// ============================================================================
// Subagent Live Monitor Types
// ============================================================================

 /**
  * サブエージェントのライブ監視ビューの表示モード
  */
export type SubagentLiveViewMode = LiveViewMode;

/**
 * Stream view selection for subagent output display.
 * Alias for base LiveStreamView for semantic clarity.
 */
export type SubagentLiveStreamView = LiveStreamView;

 /**
  * サブエージェントの実行状態を管理するライブアイテム
  * @param id サブエージェントID
  * @param name サブエージェント名
  * @param status 現在の実行ステータス
  * @param startedAtMs 実行開始タイムスタンプ
  * @param finishedAtMs 実行終了タイムスタンプ
  * @param lastChunkAtMs 最後の出力チャンクタイムスタンプ
  * @param summary 実行サマリー
  * @param error 失敗時のエラーメッセージ
  */
export interface SubagentLiveItem {
  /** Subagent ID */
  id: string;
  /** Subagent name */
  name: string;
  /** Current execution status */
  status: LiveStatus;
  /** Execution start timestamp */
  startedAtMs?: number;
  /** Execution finish timestamp */
  finishedAtMs?: number;
  /** Last output chunk timestamp */
  lastChunkAtMs?: number;
  /** Execution summary */
  summary?: string;
  /** Error message if failed */
  error?: string;
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

// ============================================================================
// Subagent Monitor Interfaces (ISP-Compliant)
// ============================================================================

/**
 * Lifecycle operations for marking agent execution states.
 * Used by code that only needs to track start/finish transitions.
 *
 * @see Interface Segregation Principle - clients depend only on needed methods
 */
export interface SubagentMonitorLifecycle {
  markStarted: (agentId: string) => void;
  markFinished: (
    agentId: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}

 /**
  * 標準出力/標準エラー出力のチャンク追加操作
  * @param agentId エージェントID
  * @param stream 出力ストリームの種類
  * @param chunk 追加するチャンク文字列
  */
export interface SubagentMonitorStream {
  appendChunk: (agentId: string, stream: SubagentLiveStreamView, chunk: string) => void;
}

/**
 * Resource cleanup and termination operations.
 * Used by code that only needs to manage monitor lifecycle.
 */
export interface SubagentMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * Full monitor controller combining all capabilities.
 * Extends partial interfaces to maintain backward compatibility.
 * Clients should use narrower interfaces when possible.
 */
export interface SubagentLiveMonitorController
  extends SubagentMonitorLifecycle,
    SubagentMonitorStream,
    SubagentMonitorResource {}

// ============================================================================
// Subagent Parallel Execution Types
// ============================================================================

 /**
  * サブエージェントの出力正規化構造
  * @param summary 抽出された要約
  * @param output 完全な出力内容
  * @param hasResult 結果セクションを含むかどうか
  */
export interface SubagentNormalizedOutput {
  /** Extracted summary */
  summary: string;
  /** Full output content */
  output: string;
  /** Whether output contains result section */
  hasResult: boolean;
}

 /**
  * サブエージェントの並列容量解決結果
  * @param agentId サブエージェントID
  * @param approvedParallelism 承認された並列度
  * @param approved リクエストが承認されたか
  * @param reason 非承認の場合の理由
  */
export interface SubagentParallelCapacityResolution {
  /** Subagent ID */
  agentId: string;
  /** Approved parallelism level */
  approvedParallelism: number;
  /** Whether request was approved */
  approved: boolean;
  /** Rejection reason if not approved */
  reason?: string;
}

// ============================================================================
// Subagent Delegation State Types
// ============================================================================

 /**
  * 委譲優先ポリシーの状態追跡
  * @param delegatedThisRequest このリクエストで委譲ツールが呼び出されたか
  * @param directWriteConfirmedThisRequest このリクエストで直接書き込みが確認されたか
  * @param pendingDirectWriteConfirmUntilMs 直接書き込みが確認されている期限のタイムスタンプ
  * @param sessionDelegationCalls セッション内の委譲呼び出しの合計数
  */
export interface DelegationState {
  /** Whether any delegation tool was called this request */
  delegatedThisRequest: boolean;
  /** Whether direct write was confirmed this request */
  directWriteConfirmedThisRequest: boolean;
  /** Timestamp until which direct write is confirmed */
  pendingDirectWriteConfirmUntilMs: number;
  /** Total delegation calls in this session */
  sessionDelegationCalls: number;
}

 /**
  * コマンド実行結果
  * @param output 出力内容
  * @param latencyMs 実行レイテンシ（ミリ秒）
  */
export interface PrintCommandResult {
  /** Output content */
  output: string;
  /** Execution latency in milliseconds */
  latencyMs: number;
}
