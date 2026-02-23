/**
 * @abdd.meta
 * path: .pi/lib/subagent-types.ts
 * role: Subagent監視・並列実行に関わる型定義の集約モジュール
 * why: subagents.tsから型定義を分離し、保守性と依存関係の明確化を図るため
 * related: extensions/subagents.ts, extensions/subagents/storage.ts, ./tui/live-monitor-base.js, ./live-types-base.js
 * public_api: SubagentLiveViewMode, SubagentLiveStreamView, SubagentLiveItem, SubagentMonitorLifecycle, SubagentMonitorStream, SubagentMonitorResource, SubagentLiveMonitorController, SubagentNormalizedOutput
 * invariants: SubagentLiveItemはBaseLiveSnapshotを継承し、一意のidを持つ
 * side_effects: なし（型定義のみ）
 * failure_modes: なし（型定義のみ）
 * @abdd.explain
 * overview: サブエージェントのライブ監視システムおよび並列実行調整に使用される型定義を管理する
 * what_it_does:
 *   - ライブ監視用の表示モードおよびストリームビューの型エイリアスを定義する
 *   - 実行中のサブエージェント状態を表すSubagentLiveItemインターフェースを提供する
 *   - ライフサイクル管理、ストリーム監視、リソース管理の各インターフェースを定義する
 *   - サブエージェントの出力正規化データおよび並列実行情報の型を定義する
 * why_it_exists:
 *   - 監視および実行制御に関する型を一箇所にまとめ、コードの重複を排除するため
 *   - 関連モジュール間での型整合性を保証するため
 * scope:
 *   in: ./tui/live-monitor-base.js, ./live-types-base.js, ./live-view-utils.js
 *   out: extensions/subagents.ts, extensions/subagents/storage.ts (監視・実行システム)
 */

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
import type { BaseLiveSnapshot } from "./live-types-base.js";
import type { LiveStatus } from "./live-view-utils.js";

// Use LiveStatus from live-view-utils.ts for the canonical definition
export type { LiveStreamView, LiveViewMode } from "./tui/live-monitor-base.js";

// ============================================================================
// Subagent Live Monitor Types
// ============================================================================

/**
 * ライブビューの表示モード
 * @summary 表示モード定義
 * @returns なし
 */
export type SubagentLiveViewMode = LiveViewMode;

/**
 * ライブストリームビューの別名
 * @summary ライブストリームビュー
 * @returns なし
 */
export type SubagentLiveStreamView = LiveStreamView;

/**
 * 実行中のサブエージェント項目
 * @summary エージェント項目定義
 * @returns なし
 */
export interface SubagentLiveItem extends BaseLiveSnapshot {
  /** Subagent ID */
  id: string;
  /** Subagent name */
  name: string;
  /** Execution summary */
  summary?: string;
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// Subagent Monitor Interfaces (ISP-Compliant)
// ============================================================================

/**
 * ライフサイクル管理インターフェース
 * @summary ライフサイクル管理
 * @returns なし
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
 * ストリーム監視インターフェース
 * @summary ストリーム監視操作
 * @param agentId エージェントID
 * @param status 状態
 * @param summary 概要
 * @returns なし
 */
export interface SubagentMonitorStream {
  appendChunk: (agentId: string, stream: SubagentLiveStreamView, chunk: string) => void;
}

/**
 * モニターのリソース管理を行うインターフェース
 * @summary リソースを管理
 */
export interface SubagentMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * ライブモニターの制御およびライフサイクル管理を行う
 * @summary モニターを制御
 */
export interface SubagentLiveMonitorController
  extends SubagentMonitorLifecycle,
    SubagentMonitorStream,
    SubagentMonitorResource {}

// ============================================================================
// Subagent Parallel Execution Types
// ============================================================================

/**
 * サブエージェントの出力正規化データを表す
 * @summary 出力を正規化
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
 * サブエージェントの並列実行解決情報を表す
 * @summary 並列解決情報を取得
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
 * 委任状態を表すインターフェース
 * @summary 委任状態を保持
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
 * @summary コマンド結果を出力
 * @param output 出力内容
 * @param latencyMs レイテンシ
 * @param delegatedThisRequest 委任実行フラグ
 * @param directWriteConfirmedThisRequest 直接書込確認フラグ
 */
export interface PrintCommandResult {
  /** Output content */
  output: string;
  /** Execution latency in milliseconds */
  latencyMs: number;
}
