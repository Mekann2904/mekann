/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/storage.ts
 * role: エージェントチームの定義と実行結果の永続化ストレージモジュール
 * why: チーム構成情報と実行履歴をディスク上で管理し、再利用可能にするため
 * related: lib/storage-base.ts, lib/storage-lock.ts, lib/comprehensive-logger.ts, subagents/storage.ts
 * public_api: TeamEnabledState, TeamStrategy, TeamJudgeVerdict, TeamMember, TeamDefinition, TeamMemberResult
 * invariants: チームIDは一意、createdAt/updatedAtはISO 8601形式、members配列は空でない
 * side_effects: ファイルシステムへの読み書き、ロックファイルの作成・削除
 * failure_modes: ディスク容量不足、ファイルロック競合、不正なJSON形式での読み込み失敗
 * @abdd.explain
 * overview: 共通ストレージユーティリティを利用し、エージェントチームの定義と実行記録を永続化する
 * what_it_does:
 *   - チーム定義（TeamDefinition）の保存・読み込み・更新
 *   - チームメンバーの実行結果（TeamMemberResult）の記録
 *   - ファイルロックによる排他制御付きアトミック書き込み
 *   - 実行アーティファクトの整理・削除
 * why_it_exists:
 *   - チーム構成をセッション間で永続化するため
 *   - subagents/storage.tsとのDRY違反を解消し共通基盤を利用するため
 *   - 型安全性のあるチームデータ管理を提供するため
 * scope:
 *   in: チームID、チーム定義オブジェクト、実行結果オブジェクト
 *   out: ファイルシステム上のチーム定義ファイル、実行記録ファイル
 */

/**
 * Agent team storage module.
 * Handles persistence for team definitions and run records.
 *
 * Refactored to use common storage utilities from lib/storage-base.ts
 * to eliminate DRY violations with subagents/storage.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeTeamStorageWithDisk as mergeStorageWithDiskCommon,
  toId as toIdCommon,
  type BaseStoragePaths,
} from "../../lib/storage-base.js";
import { atomicWriteTextFile, withFileLock } from "../../lib/storage-lock.js";
import { getLogger } from "../../lib/comprehensive-logger.js";

const logger = getLogger();

// Re-export types
 /**
  * チームの有効状態を表す型
  * @type {"enabled" | "disabled"}
  */
export type TeamEnabledState = "enabled" | "disabled";
 /**
  * チームの実行戦略を表す型
  * @type {"parallel" | "sequential"}
  */
export type TeamStrategy = "parallel" | "sequential";
 /**
  * チーム審査の判定結果
  */
export type TeamJudgeVerdict = "trusted" | "partial" | "untrusted";

 /**
  * チームメンバーの定義情報を表す
  * @param id - メンバーの一意識別子
  * @param role - メンバーの役割名
  * @param description - メンバーの説明文
  * @param provider - 使用するプロバイダー名（オプション）
  * @param model - 使用するモデル名（オプション）
  * @param enabled - メンバーの有効/無効状態
  * @param skills - メンバーが持つスキル一覧（オプション）
  */
export interface TeamMember {
  id: string;
  role: string;
  description: string;
  provider?: string;
  model?: string;
  enabled: boolean;
  skills?: string[];
/**
 * /**
 * * チームメンバーの実行結果を表すインターフェース
 * *
 * * エージェントチームのメンバーがタスクを実行した際の結果情報を格納します。
 * * 成功時は出力内容、失敗時はエラー情報を含みます。
 * *
 * * @property memberId - メンバーの一意識別子
 * * @property role - メンバー
 */
}

 /**
  * エージェントチームの定義
  * @param id - チームの一意識別子
  * @param name - チーム名
  * @param description - チームの説明
  * @param enabled - チームの有効状態
  * @param members - チームメンバーのリスト
  * @param skills - チームが持つスキルのリスト（任意）
  * @param createdAt - 作成日時（ISO 8601形式）
  * @param updatedAt - 更新日時（ISO 8601形式）
  */
export interface TeamDefinition {
  id: string;
  name: string;
  description: string;
  enabled: TeamEnabledState;
  members: TeamMember[];
  skills?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * チームメンバーの実行結果
 * @param memberId メンバーID
 * @param role 役割
 * @param summary まとめ
 * @param output 出力内容
 * @param status ステータス
 * @param latencyMs レイテンシ（ミリ秒）
 * @param error エラー内容
 * @param diagnostics 診断情報
 */
export interface TeamMemberResult {
  memberId: string;
  role: string;
  summary: string;
  output: string;
  status: "completed" | "failed";
  latencyMs: number;
  error?: string;
  diagnostics?: {
    confidence: number;
    evidenceCount: number;
    contradictionSignals: number;
    conflictSignals: number;
  };
}

 /**
  * チーム最終審査の結果を表します。
  * @param verdict 審査結果
  * @param confidence 信頼度
  * @param reason 理由
  * @param nextStep 次のステップ
  * @param uIntra 内部整合性
  * @param uInter 外部整合性
  * @param uSys システム整合性
  * @param collapseSignals 崩壊シグナル
  * @param rawOutput 生の出力
  */
export interface TeamFinalJudge {
  verdict: TeamJudgeVerdict;
  confidence: number;
  reason: string;
  nextStep: string;
  uIntra: number;
  uInter: number;
  uSys: number;
  collapseSignals: string[];
  rawOutput: string;
}

 /**
  * メンバー間のClaim参照構造
  * @param claimId 参照対象のClaimID
  * @param memberId メンバーID
  * @param stance スタンス（"agree" | "disagree" | "neutral" | "partial"）
  * @param confidence 信頼度（オプション）
  */
export interface ClaimReference {
  claimId: string;
  memberId: string;
  stance: "agree" | "disagree" | "neutral" | "partial";
  confidence?: number;
}

/**
 * Discussion analysis structure for structured communication context.
 * Tracks references between team members and stance distribution.
 * Controlled by PI_STANCE_CLASSIFICATION_MODE feature flag.
 */
export interface DiscussionAnalysis {
  references: DiscussionReference[];
  consensusMarker?: string;
  stanceDistribution: { agree: number; disagree: number; neutral: number; partial: number };
}

 /**
  * メンバー間のスタンス参照を追跡する
  * @param targetMemberId - 対象メンバーのID
  * @param targetClaimId - 対象の主張ID（省略可）
  * @param stance - スタンス
  * @param excerpt - 抜粋
  * @param confidence - 信頼度
  */
export interface DiscussionReference {
/**
   * /**
   * * チーム実行の記録を表すインターフェース
   * *
   * * チームによるタスク実行の詳細情報、通信状況、実行結果を含む。
   * *
   * * @property runId - 実行の一意識別子
   * * @property teamId - チームの一意識別子
   * * @property strategy - チームが採用した戦略
   * * @property task - 実行されたタスクの内容
   * * @property communicationRounds - 通信の総ラウンド数（省略可）
   * * @property failedMemberRetryRounds - 失敗メ
   */
  targetMemberId: string;
  targetClaimId?: string;
  stance: "agree" | "disagree" | "neutral" | "partial";
  excerpt: string;
  confidence: number;
}

 /**
  * チーム内通信監査エントリ
  * @property round - ラウンド数
  * @property memberId - メンバーID
  * @property role - 役割
  * @property partnerIds - パートナーIDリスト
  * @property referencedPartners - 参照されたパートナーIDリスト
  * @property missingPartners - 欠落しているパートナーIDリスト
  * @property contextPreview - コンテキストのプレビュー
  * @property partnerSnapshots - パートナーのスナップショットリスト
  * @property resultStatus - 実行結果ステータス
  * @property claimId - クレームID（省略可）
  * @property evidenceId - エビデンスID（省略可）
  * @property claimReferences - クレーム参照リスト（省略可）
  */
export interface TeamCommunicationAuditEntry {
  round: number;
  memberId: string;
  role: string;
  partnerIds: string[];
  referencedPartners: string[];
  missingPartners: string[];
  contextPreview: string;
  partnerSnapshots: string[];
  resultStatus: "completed" | "failed";
  // Phase 2: Structured communication fields (optional for backward compatibility)
  claimId?: string;
  evidenceId?: string;
  claimReferences?: ClaimReference[];
}

 /**
  * チーム実行記録を表すインターフェース
  * @param runId 実行ID
  * @param teamId チームID
  * @param strategy チーム戦略
  * @param task タスク内容
  * @param communicationRounds 通信ラウンド数
  * @param failedMemberRetryRounds 失敗メンバーの再試行ラウンド数
  * @param failedMemberRetryApplied 適用された失敗メンバーの再試行数
  * @param recoveredMembers 回復したメンバーIDの配列
  * @param communicationLinks 通信リンクのレコード
  */
export interface TeamRunRecord {
  runId: string;
/**
   * チーム関連のストレージパスを管理するインターフェース
   *
   * BaseStoragePathsを拡張し、エージェントチーム機能で使用される
   * ストレージパス情報を定義します。
   */
  teamId: string;
  strategy: TeamStrategy;
  task: string;
  communicationRounds?: number;
  failedMemberRetryRounds?: number;
  failedMemberRetryApplied?: number;
  recoveredMembers?: string[];
  communicationLinks?: Record<string, string[]>;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  memberCount: number;
  outputFile: string;
  finalJudge?: {
    verdict: TeamJudgeVerdict;
    confidence: number;
    reason: string;
    nextStep: string;
    uIntra: number;
    uInter: number;
    uSys: number;
    collapseSignals: string[];
  };
  // 相関IDフィールド（後方互換性のためオプション）
  correlationId?: string;
  parentEventId?: string;
}

 /**
  * チーム定義と実行記録のストレージ
  * @param teams チーム定義の配列
  * @param runs チーム実行記録の配列
  * @param currentTeamId 現在選択中のチームID
  * @param defaultsVersion デフォルト設定のバージョン
  */
export interface TeamStorage {
  teams: TeamDefinition[];
  runs: TeamRunRecord[];
  currentTeamId?: string;
  defaultsVersion?: number;
}

 /**
  * チームストレージのパス定義（BaseStoragePathsを拡張）
  */
export interface TeamPaths extends BaseStoragePaths {}

// Constants
export const MAX_RUNS_TO_KEEP = 100;
export const TEAM_DEFAULTS_VERSION = 3;

// Use common path factory
const getBasePaths = createPathsFactory("agent-teams");
export const getPaths = getBasePaths as (cwd: string) => TeamPaths;
export const ensurePaths = createEnsurePaths(getPaths);

 /**
  * 文字列をID形式に変換する
  * @param input 入力文字列
  * @returns 変換されたID
  */
export function toId(input: string): string {
  return toIdCommon(input);
}

/**
 * Merge storage with disk state (for concurrent access).
 * Uses common utility from lib/storage-base.ts.
 */
function mergeTeamStorageWithDisk(
  storageFile: string,
  next: TeamStorage,
): TeamStorage {
  return mergeStorageWithDiskCommon(
    storageFile,
    {
      teams: next.teams,
      runs: next.runs,
      currentTeamId: next.currentTeamId,
      defaultsVersion: next.defaultsVersion,
    },
    TEAM_DEFAULTS_VERSION,
    MAX_RUNS_TO_KEEP,
  ) as TeamStorage;
}

 /**
  * ディスクからチームストレージを読み込む
  * @param cwd カレントワーキングディレクトリのパス
  * @returns 読み込まれたチームストレージ
  */
export function loadStorage(cwd: string): TeamStorage {
  const paths = ensurePaths(cwd);

  if (!existsSync(paths.storageFile)) {
    const fallback: TeamStorage = {
      teams: [],
      runs: [],
      currentTeamId: undefined,
      defaultsVersion: TEAM_DEFAULTS_VERSION,
    };
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const parsed = JSON.parse(readFileSync(paths.storageFile, "utf-8")) as Partial<TeamStorage>;
    const storage: TeamStorage = {
      teams: Array.isArray(parsed.teams) ? parsed.teams : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentTeamId: typeof parsed.currentTeamId === "string" ? parsed.currentTeamId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return storage;
  } catch {
    const fallback: TeamStorage = {
      teams: [],
      runs: [],
      currentTeamId: undefined,
      defaultsVersion: TEAM_DEFAULTS_VERSION,
    };
    saveStorage(cwd, fallback);
    return fallback;
  }
}

 /**
  * チームストレージをディスクに保存する。
  * @param cwd 作業ディレクトリのパス
  * @param storage 保存するストレージデータ
  * @returns なし
  */
export function saveStorage(cwd: string, storage: TeamStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: TeamStorage = {
    ...storage,
    runs: storage.runs.slice(-MAX_RUNS_TO_KEEP),
    defaultsVersion: TEAM_DEFAULTS_VERSION,
  };
  withFileLock(paths.storageFile, () => {
    const merged = mergeTeamStorageWithDisk(paths.storageFile, normalized);
    const content = JSON.stringify(merged, null, 2);
    atomicWriteTextFile(paths.storageFile, content);
    
    // 状態変更をログ記録
    logger.logStateChange({
      entityType: 'storage',
      entityPath: paths.storageFile,
      changeType: existsSync(paths.storageFile) ? 'update' : 'create',
      afterContent: content,
    });
    
    pruneRunArtifacts(paths, merged.runs);
  });
}

 /**
  * ストレージを保存し、パターンを抽出
  * @param cwd 作業ディレクトリ
  * @param storage 保存するストレージデータ
  * @returns Promise<void>
  */
export async function saveStorageWithPatterns(
  cwd: string,
  storage: TeamStorage,
): Promise<void> {
  saveStorage(cwd, storage);

  // Extract patterns from new runs (async, non-blocking)
  const { addRunToPatterns } = await import("../../lib/pattern-extraction.js");
  const { addRunToSemanticMemory, isSemanticMemoryAvailable } = await import(
    "../../lib/semantic-memory.js"
  );
  const { indexTeamRun } = await import("../../lib/run-index.js");

  // Get the most recent run(s) that haven't been indexed yet
  const recentRuns = storage.runs.slice(-5);

  for (const run of recentRuns) {
    try {
      // Add to pattern extraction
      addRunToPatterns(cwd, {
        runId: run.runId,
        teamId: run.teamId,
        task: run.task,
        summary: run.summary,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        error: run.error,
      });

      // Add to semantic memory if available
      if (isSemanticMemoryAvailable()) {
        const indexedRun = indexTeamRun(run);
        await addRunToSemanticMemory(cwd, indexedRun);
      }
    } catch (error) {
      // Don't fail the save if pattern extraction fails
      console.error("Error extracting patterns from team run:", error);
    }
  }
}
