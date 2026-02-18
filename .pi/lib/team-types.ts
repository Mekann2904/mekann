/**
 * @abdd.meta
 * path: .pi/lib/team-types.ts
 * role: チームオーケストレーション用型定義モジュール
 * why: agent-teams.tsから型定義を分離し、保守性と再利用性を向上させるため
 * related: extensions/agent-teams.ts, extensions/agent-teams/storage.ts, tui/live-monitor-base.ts, live-view-utils.ts
 * public_api: TeamLivePhase, TeamLiveViewMode, TeamLiveItem, TeamMonitorLifecycle, LiveStreamView(再エクスポート)
 * invariants: TeamLiveItem.keyは"teamId/memberId"形式、TeamLivePhaseは5つの定義済みフェーズのみ、TeamMonitorLifecycle実装は開始/終了状態遷移を管理
 * side_effects: なし（純粋な型定義ファイル）
 * failure_modes: なし（型定義のため実行時エラーは発生しない）
 * @abdd.explain
 * overview: チーム実行のライブモニタリングと並列実行調整に使用される型定義を集約したモジュール
 * what_it_does:
 *   - チームメンバーの実行フェーズ型(TeamLivePhase)を定義: queued/initial/communication/judge/finished
 *   - チームモニタリングの表示モード型(TeamLiveViewMode)を定義: list/detail/discussion
 *   - チームメンバー実行状態を追跡するインターフェース(TeamLiveItem)を定義
 *   - ライフサイクル操作のみを必要とするクライアント向けのISP準拠インターフェース(TeamMonitorLifecycle)を定義
 *   - LiveStreamView型の再エクスポートを提供
 * why_it_exists:
 *   - agent-teams.tsから型定義を抽出してモジュール分割による保守性向上
 *   - チームライブモニタリングシステムと並列実行調整で共有する型を一元管理
 * scope:
 *   in: LiveStreamView, LiveStatusの型参照
 *   out: 実行時ロジック、状態管理実装、TUI描画処理
 */

/**
 * Team orchestration type definitions.
 * Extracted from agent-teams.ts for maintainability.
 *
 * These types are used by the team live monitoring system and
 * parallel execution coordination.
 *
 * Related: extensions/agent-teams.ts, extensions/agent-teams/storage.ts
 */

import type { LiveStreamView } from "./tui/live-monitor-base.js";
import type { LiveStatus } from "./live-view-utils.js";

// Re-export LiveStreamView for convenience
export type { LiveStreamView } from "./tui/live-monitor-base.js";

// ============================================================================
// Team Live Monitor Types
// ============================================================================

/**
 * Team execution phase during orchestration.
 * Tracks the current stage of team member execution.
 */
export type TeamLivePhase =
  | "queued"
  | "initial"
  | "communication"
  | "judge"
  | "finished";

/**
 * View mode for team live monitoring interface.
 * Extends base LiveViewMode with "discussion" mode.
 */
export type TeamLiveViewMode = "list" | "detail" | "discussion";

/**
 * Live item tracking for team member execution.
 * Maintains real-time state for TUI rendering.
 */
export interface TeamLiveItem {
  /** Unique key: teamId/memberId */
  key: string;
  /** Display label */
  label: string;
  /** Communication partners (member IDs) */
  partners: string[];
  /** Current execution status */
  status: LiveStatus;
  /** Current execution phase */
  phase: TeamLivePhase;
  /** Communication round number (if in communication phase) */
  phaseRound?: number;
  /** Execution start timestamp */
  startedAtMs?: number;
  /** Execution finish timestamp */
  finishedAtMs?: number;
  /** Last output chunk timestamp */
  lastChunkAtMs?: number;
  /** Last event timestamp */
  lastEventAtMs?: number;
  /** Last event description */
  lastEvent?: string;
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
  /** Event log entries */
  events: string[];
  /** Discussion content tail */
  discussionTail: string;
  /** Discussion content bytes */
  discussionBytes: number;
  /** Discussion newline count */
  discussionNewlineCount: number;
  /** Whether discussion ends with newline */
  discussionEndsWithNewline: boolean;
}

// ============================================================================
// Team Monitor Interfaces (ISP-Compliant)
// ============================================================================

/**
 * Lifecycle operations for marking team member execution states.
 * Used by code that only needs to track start/finish transitions.
 *
 * @see Interface Segregation Principle - clients depend only on needed methods
 */
export interface TeamMonitorLifecycle {
  markStarted: (itemKey: string) => void;
  markFinished: (
    itemKey: string,
    status: "completed" | "failed",
    summary: string,
    error?: string,
  ) => void;
}

 /**
  * チームメンバーの実行フェーズ操作
  * @param itemKey アイテムのキー
  * @param phase フェーズ
  * @param round ラウンド番号（省略可）
  */
export interface TeamMonitorPhase {
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
}

 /**
  * 実行イベントを記録するための操作。イベントのログ記録のみを行うコードで使用されます。
  * @param {string} itemKey - 対象のアイテムキー
  * @param {string} event - 記録するイベント文字列
  * @returns {void}
  */
export interface TeamMonitorEvents {
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
}

/**
 * Stream output operations for appending stdout/stderr chunks.
 * Used by code that only needs to handle output streaming.
 */
export interface TeamMonitorStream {
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
}

/**
 * Discussion tracking operations for multi-agent communication.
 * Used by code that only needs to track discussion content.
 */
export interface TeamMonitorDiscussion {
  appendDiscussion: (itemKey: string, discussion: string) => void;
}

 /**
  * リソースのクリーンアップと終了操作。
  */
export interface TeamMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

 /**
  * エージェントチームのライブ監視を制御するインターフェース
  */
export interface AgentTeamLiveMonitorController
  extends TeamMonitorLifecycle,
    TeamMonitorPhase,
    TeamMonitorEvents,
    TeamMonitorStream,
    TeamMonitorDiscussion,
    TeamMonitorResource {}

// ============================================================================
// Team Parallel Execution Types
// ============================================================================

 /**
  * チームメンバー実行の正規化された出力構造。
  * @param summary 抽出された要約
  * @param output 出力の完全な内容
  * @param evidenceCount 出力からのエビデンス数
  * @param hasDiscussion 出力にディスカッションセクションが含まれるか
  */
export interface TeamNormalizedOutput {
  /** Extracted summary */
  summary: string;
  /** Full output content */
  output: string;
  /** Evidence count from output */
  evidenceCount: number;
  /** Whether output contains discussion section */
  hasDiscussion: boolean;
}

/**
 * Candidate for parallel capacity allocation.
 * Used in team parallel execution planning.
 */
export interface TeamParallelCapacityCandidate {
  /** Team ID */
  teamId: string;
  /** Requested parallelism level */
  parallelism: number;
}

 /**
  * チーム並列容量の解決結果
  * @param teamId チームID
  * @param approvedParallelism 承認された並列度
  * @param approved リクエストが承認されたかどうか
  * @param reason 非承認の場合の拒否理由
  */
export interface TeamParallelCapacityResolution {
  /** Team ID */
  teamId: string;
  /** Approved parallelism level */
  approvedParallelism: number;
  /** Whether request was approved */
  approved: boolean;
  /** Rejection reason if not approved */
  reason?: string;
}

// ============================================================================
// Team Frontmatter Types (Markdown Parsing)
// ============================================================================

 /**
  * チーム定義のフロントマター構造
  * @param id チームID
  * @param name チーム名
  * @param description チームの説明
  * @param enabled 有効状態 ("enabled" | "disabled")
  * @param strategy 実行戦略 ("parallel" | "sequential")
  * @param skills スキルリスト
  * @param members メンバーリスト
  */
export interface TeamFrontmatter {
  id: string;
  name: string;
  description: string;
  enabled: "enabled" | "disabled";
  strategy?: "parallel" | "sequential";
  skills?: string[];
  members: TeamMemberFrontmatter[];
}

 /**
  * チームメンバーのフロントマター
  * @param id メンバーID
  * @param role 役割
  * @param description 説明
  * @param enabled 有効かどうか
  * @param provider プロバイダー名
  * @param model モデル名
  * @param skills スキル一覧
  */
export interface TeamMemberFrontmatter {
  id: string;
  role: string;
  description: string;
  enabled?: boolean;
  provider?: string;
  model?: string;
  skills?: string[];
}

 /**
  * パースされたチームMarkdownファイル構造
  * @param frontmatter フロントマター
  * @param content コンテンツ
  * @param filePath ファイルパス
  */
export interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}
