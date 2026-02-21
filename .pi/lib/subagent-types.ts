/**
 * @abdd.meta
 * path: .pi/lib/subagent-types.ts
 * role: サブエージェントのライブ監視システムおよび並列実行調整に使用される型定義
 * why: subagents.tsから型定義を分離し、保守性と依存関係の明確化を図るため
 * related: ./tui/live-monitor-base.ts, ./live-view-utils.ts, extensions/subagents.ts, extensions/subagents/storage.ts
 * public_api: SubagentLiveItem, SubagentMonitorLifecycle, SubagentMonitorStream, SubagentMonitorResource
 * invariants: LiveStatusはlive-view-utils.tsの正規定義を使用する
 * side_effects: なし（型定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: サブエージェントの実行状態、ライフサイクル、ストリーム出力、リソース管理に関する型定義を集約したモジュール
 * what_it_does:
 *   - SubagentLiveItemにて、ID、ステータス、タイムスタンプ、標準出力バイト数等の実行状態を定義する
 *   - SubagentMonitorLifecycle、SubagentMonitorStream、SubagentMonitorResourceにて、監視機能をInterface Segregation Principle（ISP）に基づき分割定義する
 *   - LiveStreamViewおよびLiveViewModeの型エイリアスを提供し、意味の明確化を図る
 * why_it_exists:
 *   - subagents.tsから型定義を抽出し、コードベースのモジュール化と保守性を向上させるため
 *   - ライブ監視システムと並列実行調整の間で共有されるデータ構造を一元管理するため
 * scope:
 *   in: ./tui/live-monitor-base.ts (LiveStreamView, LiveViewMode), ./live-view-utils.ts (LiveStatus)
 * out: サブエージェント監視・制御ロジックを実装するモジュール
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
