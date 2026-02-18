/**
 * @abdd.meta
 * path: .pi/lib/team-types.ts
 * role: チーム監視と並列実行調整用の型定義コレクション
 * why: agent-teams.tsから型を分離し、保守性と依存の明確化を確保するため
 * related: extensions/agent-teams.ts, extensions/agent-teams/storage.ts, .pi/lib/tui/live-monitor-base.ts, .pi/lib/live-view-utils.ts
 * public_api: TeamLivePhase, TeamLiveViewMode, TeamLiveItem, TeamMonitorLifecycle, LiveStreamView
 * invariants: TeamLiveItemのkeyは「teamId/memberId」形式
 * side_effects: なし（純粋な型定義と再エクスポートのみ）
 * failure_modes: なし（実行時ロジックを含まない）
 * @abdd.explain
 * overview: チームの実行フェーズ、TUI用ライブアイテム、ライフサイクル操作のインターフェースを定義する
 * what_it_does:
 *   - 実行フェーズ（queued, communication, judge等）とビューモードの型を定義する
 *   - チームメンバーの実行状態、ログ、議論内容を保持するTeamLiveItemインターフェースを提供する
 *   - インターフェース分離原則に基づき、開始/完了操作のみを扱うTeamMonitorLifecycleを定義する
 * why_it_exists:
 *   - チーム監視システムと並列実行調整で共有される型情報を一元管理するため
 *   - 監視機能のみを必要とするクライアントに対し、不要な依存を排除するため
 * scope:
 *   in: LiveStreamView, LiveStatusの各種型
 *   out: チーム実行状態、監視インターフェース、TUI描画用の各種型
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
 * @typedef {"list" | "detail" | "discussion"} TeamLiveViewMode
 */
export type TeamLiveViewMode = "list" | "detail" | "discussion";

/**
 * アイテムのライブ状態を表す
 * @summary ライブ状態表現
 * @returns {void}
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
    TeamMonitorResource {}

// ============================================================================
// Team Parallel Execution Types
// ============================================================================

/**
 * 正規化されたチーム出力を表します。
 * @summary 正規化チーム出力
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
