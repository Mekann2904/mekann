/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/storage.ts
 * role: エージェントチームの定義および実行記録の永続化処理
 * why: チーム設定と履歴をファイルシステムで管理し、他のストレージ実装とロジックを共通化するため
 * related: .pi/extensions/subagents/storage.ts, .pi/lib/storage-base.ts, .pi/lib/storage-lock.ts
 * public_api: TeamDefinition, TeamMember, TeamMemberResult, TeamEnabledState, TeamStrategy, TeamJudgeVerdict
 * invariants: チームIDは一意、updatedAtは更新時常に最新、enabledは定義ごとに保持
 * side_effects: ファイルシステムへの書き込み、アーティファクトファイルの削除
 * failure_modes: ファイル書き込み権限なし、JSONパースエラー、ID衝突
 * @abdd.explain
 * overview: エージェントチームの設定定義と実行結果をJSONファイルで永続化するモジュール
 * what_it_does:
 *   - TeamDefinitionおよびTeamMemberResultの型定義とエクスポート
 *   - lib/storage-baseの共通ユーティリティを利用したパス生成、データ結合、ID生成
 *   - チーム設定ファイルの読み書きおよびロック機制による競合回避
 *   - 実行アーティファクトの整理と不要ファイルの削除
 * why_it_exists:
 *   - subagents/storage.tsとの重複実装（DRY違反）を解消するため
 *   - チームの状態管理をファイルベースで一貫して行うため
 * scope:
 *   in: チーム定義オブジェクト、実行結果オブジェクト、ストレージパス
 *   out: JSON形式の設定ファイル、実行ログ、アーティファクトファイル
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
 * @summary 有効状態
 * @type {"enabled" | "disabled"}
 */
export type TeamEnabledState = "enabled" | "disabled";
/**
 * チームの実行戦略を表す型
 * @summary 実行戦略
 * @type {"parallel" | "sequential"}
 */
export type TeamStrategy = "parallel" | "sequential";
/**
 * チーム審査の判定結果
 * @summary 判定結果
 * @type {"trusted" | "partial" | "untrusted"}
 */
export type TeamJudgeVerdict = "trusted" | "partial" | "untrusted";

/**
 * チームメンバー情報
 * @summary メンバー定義
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
 * エージェントチーム定義
 * @summary チーム定義取得
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
 * チームメンバー実行結果
 * @summary メンバー実行結果
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
 * チーム最終審査の結果
 * @summary チーム最終審査結果
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
 * @summary Claim参照を定義
 * @param claimId 参照対象のClaimID
 * @param memberId メンバーID
 * @param stance スタンス
 * @param confidence 信頼度（オプション）
 */
export interface ClaimReference {
  claimId: string;
  memberId: string;
  stance: "agree" | "disagree" | "neutral" | "partial";
  confidence?: number;
}

/**
 * @summary スタンス参照を追跡
 * ディスカッション内のメンバー間のスタンス参照を追跡します。
 * @param targetMemberId 対象メンバーのID
 * @param targetClaimId 対象の主張ID（省略可）
 * @param stance スタンス
 * @param excerpt 抜粋
 * @param confidence 信頼度
 */
export interface DiscussionAnalysis {
  references: DiscussionReference[];
  consensusMarker?: string;
  stanceDistribution: { agree: number; disagree: number; neutral: number; partial: number };
}

/**
 * ディスカッション参照情報
 * @summary 参照情報保持
 * @param targetMemberId 対象メンバーID
 * @param targetClaimId 対象主張ID
 * @param stance スタンス（立場）
 * @param excerpt 抜粋
 * @param confidence 確信度
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
 * 通信監査エントリ
 * @summary 通信監査記録
 * @param round ラウンド数
 * @param memberId メンバーID
 * @param role 役割
 * @param partnerIds 通信相手IDリスト
 * @param referencedPartners 参照相手IDリスト
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
 * チーム実行記録
 * @summary 実行記録保持
 * @param runId 実行ID
 * @param teamId チームID
 * @param strategy 戦略
 * @param task タスク内容
 * @param communicationRounds 通信ラウンド数
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
 * チームストレージ定義
 * @summary データ保持
 * @param uSys システム更新日時
 * @param collapseSignals 信号の折りたたみ設定
 * @param correlationId 相関ID（後方互換性のためオプション）
 */
export interface TeamStorage {
  teams: TeamDefinition[];
  runs: TeamRunRecord[];
  currentTeamId?: string;
  defaultsVersion?: number;
}

/**
 * チームパス定義
 * @summary パス生成
 * @param teams チーム定義の配列
 * @param runs チーム実行記録の配列
 * @param currentTeamId 現在選択中のチームID
 * @param defaultsVersion デフォルト設定のバージョン
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
 * ID文字列へ変換
 * @summary ID文字列へ変換
 * @param input 入力文字列
 * @returns 変換後のID文字列
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
 * ストレージを読込
 * @summary ストレージ読込
 * @param cwd カレントワーキングディレクトリ
 * @returns 読み込んだストレージデータ
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
 * ストレージを保存
 * @summary ストレージ保存
 * @param cwd カレントワーキングディレクトリ
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
 * パターン付きで保存
 * @summary パターン付き保存
 * @param cwd カレントワーキングディレクトリ
 * @param storage 保存するストレージデータ
 * @returns Promiseを返す
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
