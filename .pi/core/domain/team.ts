/**
 * @abdd.meta
 * path: .pi/core/domain/team.ts
 * role: チームのドメインモデル（Enterprise Business Rules）
 * why: チームに関するビジネスルールを一箇所に集約し、他の層から独立させるため
 * related: application/use-cases/team, adapters/repositories/team-repository
 * public_api: Team, TeamMember, TeamId, TeamStrategy, TeamRunRecord
 * invariants: TeamIdは空文字でない、TeamMemberは一意のIDを持つ
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェントチームのドメインモデルを定義する
 * what_it_does:
 *   - チームの識別子（TeamId）を定義する
 *   - チームメンバー（TeamMember）を定義する
 *   - チーム戦略（TeamStrategy）を定義する
 *   - チーム実行記録（TeamRunRecord）を定義する
 *   - チーム集約（Team）を定義する
 * why_it_exists:
 *   - ビジネスルールをインフラストラクチャから分離するため
 *   - チームに関する変更理由を一箇所に集約するため（CCP）
 * scope:
 *   in: AgentId, RunId from ./agent
 *   out: application層、adapters層への型エクスポート
 */

import type { AgentId, RunId, RunOutcome, AgentStatus } from "./agent.js";

// ============================================================================
// Value Objects (値オブジェクト)
// ============================================================================

/**
 * チーム識別子
 * @summary チームID
 */
export type TeamId = string & { readonly brand: unique symbol };

/**
 * チームIDを作成する
 * @summary ID作成
 * @param value - 識別子文字列
 * @returns TeamId
 */
export function createTeamId(value: string): TeamId {
  if (!value || value.trim() === "") {
    throw new Error("TeamId cannot be empty");
  }
  return value as TeamId;
}

/**
 * チームメンバー識別子
 * @summary メンバーID
 */
export type MemberId = string & { readonly brand: unique symbol };

/**
 * メンバーIDを作成する
 * @summary ID作成
 * @param value - 識別子文字列
 * @returns MemberId
 */
export function createMemberId(value: string): MemberId {
  if (!value || value.trim() === "") {
    throw new Error("MemberId cannot be empty");
  }
  return value as MemberId;
}

// ============================================================================
// Enums (列挙型)
// ============================================================================

/**
 * チーム実行戦略
 * @summary 実行戦略
 */
export type TeamStrategy = "parallel" | "sequential";

/**
 * チームの状態
 * @summary チーム状態
 */
export type TeamStatus =
  | "idle"
  | "queued"
  | "running"
  | "communication"
  | "judge"
  | "completed"
  | "failed";

/**
 * チーム内メンバーの状態
 * @summary メンバー状態
 */
export type MemberStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed";

// ============================================================================
// Entities (エンティティ)
// ============================================================================

/**
 * チームメンバー定義
 * @summary メンバー定義
 */
export interface TeamMemberDefinition {
  /** メンバーID */
  id: MemberId;
  /** ロール名 */
  role: string;
  /** 説明 */
  description: string;
  /** システムプロンプト（オプション） */
  systemPrompt?: string;
  /** プロバイダー（オプション） */
  provider?: string;
  /** モデル（オプション） */
  model?: string;
  /** 有効フラグ */
  enabled: boolean;
  /** スキル割り当て（オプション） */
  skills?: string[];
}

/**
 * チームメンバー実行記録
 * @summary メンバー実行記録
 */
export interface MemberRunRecord {
  /** 実行ID */
  runId: RunId;
  /** チーム実行ID */
  teamRunId: RunId;
  /** メンバーID */
  memberId: MemberId;
  /** タスク */
  task: string;
  /** 状態 */
  status: MemberStatus;
  /** 結果 */
  outcome?: RunOutcome;
  /** 出力 */
  output?: string;
  /** 開始時刻 */
  startedAt: Date;
  /** 終了時刻 */
  finishedAt?: Date;
}

/**
 * チーム定義
 * @summary チーム定義
 */
export interface TeamDefinition {
  /** チームID */
  id: TeamId;
  /** 表示名 */
  name: string;
  /** 説明 */
  description: string;
  /** 実行戦略 */
  strategy: TeamStrategy;
  /** メンバー定義リスト */
  members: TeamMemberDefinition[];
  /** 有効フラグ */
  enabled: boolean;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * チーム実行記録
 * @summary チーム実行記録
 */
export interface TeamRunRecord {
  /** 実行ID */
  runId: RunId;
  /** チームID */
  teamId: TeamId;
  /** タスク */
  task: string;
  /** 状態 */
  status: TeamStatus;
  /** 結果 */
  outcome?: RunOutcome;
  /** 統合出力 */
  output?: string;
  /** サマリー */
  summary?: string;
  /** メンバー実行記録 */
  memberRuns: MemberRunRecord[];
  /** コミュニケーション履歴 */
  communicationLog?: string[];
  /** 開始時刻 */
  startedAt: Date;
  /** 終了時刻 */
  finishedAt?: Date;
  /** コミュニケーションラウンド数 */
  communicationRounds: number;
}

/**
 * チーム集約
 * @summary チーム集約
 *
 * チームに関するすべての情報を含む集約ルート。
 */
export interface Team {
  /** 定義 */
  definition: TeamDefinition;
  /** 実行履歴 */
  runs: TeamRunRecord[];
  /** 現在の状態 */
  currentStatus: TeamStatus;
}

// ============================================================================
// Domain Services (ドメインサービス)
// ============================================================================

/**
 * チーム実行が完了状態かどうかを判定する
 * @summary 完了判定
 * @param status - チーム状態
 * @returns 完了状態かどうか
 */
export function isTerminalTeamStatus(status: TeamStatus): boolean {
  return ["completed", "failed"].includes(status);
}

/**
 * 全メンバーが完了したかどうかを判定する
 * @summary 全員完了判定
 * @param memberStatuses - メンバー状態リスト
 * @returns 全員完了かどうか
 */
export function allMembersCompleted(memberStatuses: MemberStatus[]): boolean {
  return memberStatuses.every((s) => s === "completed" || s === "failed");
}

/**
 * チームの最大並列数を計算する
 * @summary 最大並列数計算
 * @param team - チーム定義
 * @returns 最大並列数
 */
export function calculateMaxParallelism(team: TeamDefinition): number {
  return team.members.filter((m) => m.enabled).length;
}
