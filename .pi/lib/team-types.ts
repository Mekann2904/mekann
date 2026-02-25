/**
 * @abdd.meta
 * path: .pi/lib/team-types.ts
 * role: チーム監視および並列実行調整用の型定義集
 * why: agent-teams.ts から定義を分離し、保守性と再利用性を向上させるため
 * related: extensions/agent-teams.ts, extensions/agent-teams/storage.ts, ./live-types-base.js, ./tui/live-monitor-base.js
 * public_api: TeamLivePhase, TeamLiveViewMode, TeamQueueStatus, TeamLiveItem, TeamMonitorLifecycle, TeamMonitorPhase
 * invariants: TeamLiveItem.keyは一意の識別子である、TeamLivePhaseは定義された順序に従う
 * side_effects: なし（純粋な型定義）
 * failure_modes: 型定義の不整合によるコンパイルエラー、循環参照
 * @abdd.explain
 * overview: チームのライブ監視システムと並列実行調整に使用される型定義を集約したモジュール
 * what_it_does:
 *   - チームライブのフェーズ（queued, initialなど）と表示モードを定義する
 *   - チームキューの待機状態を表すTeamQueueStatusを提供する
 *   - 実行中のアイテムのスナップショットであるTeamLiveItemを定義する
 *   - ライフサイクル管理とフェーズ管理のためのインターフェースを提供する
 * why_it_exists:
 *   - 監視システムと実行調整ロジック間で共有されるデータ構造を一元管理するため
 *   - implementation detailsから型定義を分離し、依存関係を整理するため
 * scope:
 *   in: BaseLiveSnapshot, LiveStreamView, LiveStatus (インポート)
 *   out: TeamLivePhase, TeamLiveViewMode, TeamQueueStatus, TeamLiveItem, TeamMonitorLifecycle, TeamMonitorPhase
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

import type { BaseLiveSnapshot } from "./live-types-base.js";
import type { LiveStreamView } from "./tui/live-monitor-base.js";
import type { LiveStatus } from "./live-view-utils.js";

// Re-export LiveStreamView for convenience
export type { LiveStreamView } from "./tui/live-monitor-base.js";

// ============================================================================
// Team Live Monitor Types
// ============================================================================

/**
 * チームライブのフェーズ定義
 * @summary フェーズ定義
 * @typedef {"queued" | "initial" | "communication" | "judge" | "finished"} TeamLivePhase
 */
export type TeamLivePhase =
  | "queued"
  | "initial"
  | "communication"
  | "judge"
  | "finished";

/**
 * チームライブの表示モード
 * @summary 表示モード定義
 * @typedef {"list" | "detail" | "discussion" | "tree" | "timeline" | "gantt"} TeamLiveViewMode
 */
export type TeamLiveViewMode = "list" | "detail" | "discussion" | "tree" | "timeline" | "gantt";

/**
 * 待機状態情報
 * @summary 待機状態表現
 */
export interface TeamQueueStatus {
  /** 待機中かどうか */
  isWaiting: boolean;
  /** 待機時間（ミリ秒） */
  waitedMs?: number;
  /** キュー内の位置 */
  queuePosition?: number;
  /** 前方のキューアイテム数 */
  queuedAhead?: number;
}

/**
 * アイテムのライブ状態を表す
 * @summary ライブ状態表現
 * @returns {void}
 */
export interface TeamLiveItem extends BaseLiveSnapshot {
  /** Unique key: teamId/memberId */
  key: string;
  /** Display label */
  label: string;
  /** Communication partners (member IDs) */
  partners: string[];
  /** Current execution phase */
  phase: TeamLivePhase;
  /** Communication round number (if in communication phase) */
  phaseRound?: number;
  /** Last event timestamp */
  lastEventAtMs?: number;
  /** Last event description */
  lastEvent?: string;
  /** Execution summary */
  summary?: string;
  /** Error message if failed */
  error?: string;
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
 * ライフサイクル情報を保持する
 * @summary ライフサイクル管理
 * @returns {void}
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
 * 開始または終了をマークする
 * @summary 状態マーク
 * @param {string} itemKey - アイテムキー
 * @param {("completed" | "failed")} status - ステータス
 * @param {string} summary - サマリー
 * @returns {void}
 */
export interface TeamMonitorPhase {
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
}

/**
 * 実行フェーズを操作する
 * @summary フェーズ操作
 * @param {string} itemKey - アイテムのキー
 * @param {string} phase - フェーズ
 * @param {number} [round] - ラウンド番号（省略可）
 * @returns {void}
 */
export interface TeamMonitorEvents {
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
}

/**
 * チャンクを追加する
 * @summary チャンク追加
 * @param {string} itemKey - 対象のアイテムキー
 * @param {string} event - 記録するイベント文字列
 * @returns {void}
 */
export interface TeamMonitorStream {
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
}

/**
 * チームの議論ログを管理します。
 * @summary 議論ログ
 * @param itemKey 項目識別子
 * @param discussion 追加する議論内容
 */
export interface TeamMonitorDiscussion {
  appendDiscussion: (itemKey: string, discussion: string) => void;
}

/**
 * 待機状態を管理します。
 * @summary 待機状態管理
 */
export interface TeamMonitorQueue {
  updateQueueStatus: (status: TeamQueueStatus) => void;
}

/**
 * モニタリングリソースを管理します。
 * @summary 監視リソース
 */
export interface TeamMonitorResource {
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * エージェントチームのライブモニタリングを制御します。
 * @summary ライブ監視制御
 */
export interface AgentTeamLiveMonitorController
  extends TeamMonitorLifecycle,
    TeamMonitorPhase,
    TeamMonitorEvents,
    TeamMonitorStream,
    TeamMonitorDiscussion,
    TeamMonitorQueue,
    TeamMonitorResource {}

// ============================================================================
// Team Parallel Execution Types
// ============================================================================

/**
 * 正規化されたチーム出力を表します（API応答用）。
 * runtime用のTeamNormalizedOutput（member-execution.ts）とは異なる構造です。
 * @summary 正規化チーム出力（API用）
 */
export interface TeamNormalizedOutputAPI {
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
 * チーム並列容量候補を表します。
 * @summary 並列容量候補
 */
export interface TeamParallelCapacityCandidate {
  /** Team ID */
  teamId: string;
  /** Requested parallelism level */
  parallelism: number;
}

/**
 * 並列容量の解決結果
 * @summary 並列容量解決
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
 * チームのフロントマター
 * @summary チームフロントマター
 */
export interface TeamFrontmatter {
  id: string;
  name: string;
  description: string;
  enabled: "enabled" | "disabled";
  strategy?: "parallel" | "sequential";
  skills?: string[];
  /** 親チームID（Phase分割チームの場合） */
  parent?: string;
  members: TeamMemberFrontmatter[];
}

/**
 * チームメンバーのフロントマター
 * @summary メンバーフロントマター
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
 * チームMarkdownの解析結果
 * @summary チームMarkdown構造
 */
export interface ParsedTeamMarkdown {
  frontmatter: TeamFrontmatter;
  content: string;
  filePath: string;
}
