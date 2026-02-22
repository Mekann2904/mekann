/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/team-orchestrator.ts
 * role: チームタスク実行のオーケストレーション機能
 * why: extension.tsから中核的なチーム実行ロジックを分離し、テスト可能性と保守性を向上させるため
 * related: .pi/extensions/agent-teams/extension.ts, .pi/extensions/agent-teams/member-execution.ts, .pi/extensions/agent-teams/communication.ts
 * public_api: runTeamTask, TeamTaskInput, TeamTaskResult
 * invariants: チーム実行IDは一意、判定信頼度は0〜1の範囲
 * side_effects: ファイルシステムへの実行記録書き込み、コスト見積もり記録
 * failure_modes: メンバー実行タイムアウト、ストレージ書き込みエラー
 * @abdd.explain
 * overview: チームメンバーの並列/順次実行、コミュニケーションラウンド処理、最終判定を行うオーケストレーター。
 * what_it_does:
 *   - チームメンバーの初期フェーズ実行（並列/順次）
 *   - コミュニケーションラウンドでのメンバー間情報共有
 *   - 失敗メンバーの再試行処理
 *   - 最終判定（Judge）の実行と結果記録
 * why_it_exists:
 *   - extension.tsの巨大化を解消し、チーム実行ロジックを独立してテスト可能にするため
 * scope:
 *   in: チーム定義、タスク、戦略、コールバック
 *   out: 実行記録、メンバー結果、コミュニケーション監査
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { createRunId } from "../../lib/agent-utils.js";
import { createChildAbortController } from "../../lib/abort-utils.js";
import {
  STABLE_RUNTIME_PROFILE,
  TEAM_MEMBER_CONFIG,
} from "../../lib/agent-common.js";
import { classifyPressureError } from "../../lib/error-utils.js";
import { getLogger } from "../../lib/comprehensive-logger.js";
import type { OperationType } from "../../lib/comprehensive-logger-types.js";
import { getCostEstimator, type ExecutionHistoryEntry } from "../../lib/cost-estimator.js";
import { formatDurationMs, normalizeForSingleLine } from "../../lib/format-utils.js";
import { runWithConcurrencyLimit } from "../../lib/concurrency.js";
import type { RetryWithBackoffOverrides } from "../../lib/retry-with-backoff.js";
import { toConcurrencyLimit } from "../../lib/runtime-utils.js";
import { ValidationError } from "../../lib/errors.js";

import {
  type TeamMember,
  type TeamDefinition,
  type TeamMemberResult,
  type TeamCommunicationAuditEntry,
  type TeamRunRecord,
  type TeamStrategy,
  ensurePaths,
} from "./storage.js";
import {
  DEFAULT_COMMUNICATION_ROUNDS,
  DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,
  normalizeCommunicationRounds,
  normalizeFailedMemberRetryRounds,
  createCommunicationLinksMap,
  buildCommunicationContext,
  buildPrecomputedContextMap,
  detectPartnerReferencesV2,
  clearBeliefStateCache,
  extractField,
  type PrecomputedMemberContext,
} from "./communication.js";
import { runMember } from "./member-execution.js";
import { runFinalJudge, buildFallbackJudge, computeProxyUncertainty, computeProxyUncertaintyWithExplainability, formatJudgeExplanation, type TeamUncertaintyProxy, type JudgeExplanation } from "./judge.js";
import type { TeamLivePhase } from "../../lib/team-types.js";

const logger = getLogger();
const STABLE_AGENT_TEAM_RUNTIME = STABLE_RUNTIME_PROFILE;

// ============================================================================
// Types
// ============================================================================

/**
 * チームタスク実行の入力パラメータ
 * @summary タスク入力定義
 */
export interface TeamTaskInput {
  /** チーム定義 */
  team: TeamDefinition;
  /** 実行タスク */
  task: string;
  /** 実行戦略 */
  strategy: TeamStrategy;
  /** メンバー並列実行数の上限 */
  memberParallelLimit?: number;
  /** コミュニケーションラウンド数 */
  communicationRounds: number;
  /** 失敗メンバー再試行ラウンド数 */
  failedMemberRetryRounds?: number;
  /** コミュニケーションリンク */
  communicationLinks?: Map<string, string[]>;
  /** 共有コンテキスト */
  sharedContext?: string;
  /** 成功基準（ユーザー期待値の明確化） */
  successCriteria?: string[];
  /** タイムアウト（ミリ秒） */
  timeoutMs: number;
  /** 作業ディレクトリ */
  cwd: string;
  /** 再試行オーバーライド */
  retryOverrides?: RetryWithBackoffOverrides;
  /** フォールバックプロバイダー */
  fallbackProvider?: string;
  /** フォールバックモデル */
  fallbackModel?: string;
  /** 中止シグナル */
  signal?: AbortSignal;
  /** メンバー開始コールバック */
  onMemberStart?: (member: TeamMember) => void;
  /** メンバー終了コールバック */
  onMemberEnd?: (member: TeamMember) => void;
  /** メンバーテキスト差分コールバック */
  onMemberTextDelta?: (member: TeamMember, delta: string) => void;
  /** メンバー標準エラーチャンクコールバック */
  onMemberStderrChunk?: (member: TeamMember, chunk: string) => void;
  /** メンバー結果コールバック */
  onMemberResult?: (member: TeamMember, result: TeamMemberResult) => void;
  /** メンバーフェーズ変更コールバック */
  onMemberPhase?: (member: TeamMember, phase: TeamLivePhase, round?: number) => void;
  /** メンバーイベントコールバック */
  onMemberEvent?: (member: TeamMember, event: string) => void;
  /** チームイベントコールバック */
  onTeamEvent?: (event: string) => void;
}

/**
 * チームタスク実行の結果
 * @summary タスク結果定義
 */
export interface TeamTaskResult {
  /** 実行記録 */
  runRecord: TeamRunRecord;
  /** メンバー結果一覧 */
  memberResults: TeamMemberResult[];
  /** コミュニケーション監査エントリ */
  communicationAudit: TeamCommunicationAuditEntry[];
  /** 不確実性プロキシ値 */
  uncertaintyProxy: TeamUncertaintyProxy;
  /** 不確実性判定の説明可能性データ */
  uncertaintyProxyExplanation: JudgeExplanation;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 失敗したメンバー結果を再試行すべきか判定する
 * @summary 再試行判定
 * @param result - メンバー結果
 * @param retryRound - 現在の再試行ラウンド
 * @returns 再試行すべきならtrue
 */
export function shouldRetryFailedMemberResult(
  result: TeamMemberResult,
  retryRound: number,
): boolean {
  if (result.status !== "failed") return false;
  if (!result.error) return true;
  
  const pressureType = classifyPressureError(result.error);
  
  // レート制限や容量エラーは再試行しない（上位で処理される）
  if (pressureType === "rate_limit" || pressureType === "capacity") {
    return false;
  }
  
  // タイムアウトは再試行対象
  if (pressureType === "timeout") {
    return retryRound <= 1; // 1回のみ再試行
  }
  
  // その他のエラーは再試行対象
  return true;
}

/**
 * AbortControllerの子を作成してMaxListenersExceededWarningを防止
 * @summary 子AbortController作成
 * @param signal - 親のAbortSignal
 * @returns 子コントローラーとクリーンアップ関数
 */
export function createChildAbort(signal?: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  return createChildAbortController(signal);
}

// ============================================================================
// Main Orchestrator Function
// ============================================================================

/**
 * チームでタスクを実行する
 * @summary チームタスク実行
 * @param input - タスク入力パラメータ
 * @returns 実行結果
 * @throws {ValidationError} 有効なメンバーがいない場合
 */
export async function runTeamTask(input: TeamTaskInput): Promise<TeamTaskResult> {
  // Clear belief state cache at the start of each team execution to prevent state pollution
  clearBeliefStateCache();

  const enabledMembers = input.team.members.filter((member) => member.enabled);
  if (enabledMembers.length === 0) {
    throw new ValidationError(`no enabled members in team (${input.team.id})`, {
      field: "team.members",
      expected: "at least one enabled member",
      actual: "0 enabled members",
    });
  }
  
  const activeMembers = enabledMembers;

  const runId = createRunId();
  const startedAt = new Date().toISOString();
  const paths = ensurePaths(input.cwd);
  const outputFile = join(paths.runsDir, `${runId}.json`);
  const communicationRounds =
    activeMembers.length <= 1
      ? 0
      : normalizeCommunicationRounds(
          input.communicationRounds,
          DEFAULT_COMMUNICATION_ROUNDS,
          STABLE_AGENT_TEAM_RUNTIME,
        );
  const failedMemberRetryRounds =
    activeMembers.length <= 1
      ? 0
      : normalizeFailedMemberRetryRounds(
          input.failedMemberRetryRounds,
          DEFAULT_FAILED_MEMBER_RETRY_ROUNDS,
          STABLE_AGENT_TEAM_RUNTIME,
        );
  
  let failedMemberRetryApplied = 0;
  const recoveredMembers = new Set<string>();
  const communicationLinks =
    input.communicationLinks ?? createCommunicationLinksMap(activeMembers);
  const activeMemberById = new Map(activeMembers.map((member) => [member.id, member]));
  const memberById = new Map(input.team.members.map((member) => [member.id, member]));
  const communicationAudit: TeamCommunicationAuditEntry[] = [];

  // 初期イベント発行
  input.onTeamEvent?.(
    `team=${input.team.id} start strategy=${input.strategy} members=${activeMembers.length} communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryRounds}`,
  );
  
  const communicationPlanLine = activeMembers
    .map((member) => `${member.id}->${(communicationLinks.get(member.id) ?? []).join(",") || "-"}`)
    .join(" | ");
  input.onTeamEvent?.(`communication links: ${normalizeForSingleLine(communicationPlanLine, 320)}`);
  
  for (const member of activeMembers) {
    const partners = communicationLinks.get(member.id) ?? [];
    input.onMemberPhase?.(member, "queued");
    input.onMemberEvent?.(
      member,
      `queued: partners=${partners.join(", ") || "-"} shared_context=${input.sharedContext?.trim() ? "yes" : "no"}`,
    );
  }

  /**
   * 結果イベントを発行
   */
  const emitResultEvent = (
    member: TeamMember,
    phaseLabel: string,
    result: TeamMemberResult,
  ) => {
    const diagnostics = result.diagnostics
      ? ` confidence=${result.diagnostics.confidence.toFixed(2)} evidence=${result.diagnostics.evidenceCount}`
      : "";
    input.onMemberEvent?.(
      member,
      `${phaseLabel} result: status=${result.status} latency=${result.latencyMs}ms summary=${normalizeForSingleLine(result.summary, 96)}${diagnostics}${result.error ? ` error=${normalizeForSingleLine(result.error, 120)}` : ""}`,
    );
  };

  // ============================================================================
  // Phase 1: Initial Execution
  // ============================================================================
  
  let memberResults: TeamMemberResult[] = [];
  
  if (input.strategy === "parallel") {
    const memberParallelLimit = toConcurrencyLimit(input.memberParallelLimit, activeMembers.length);
    input.onTeamEvent?.(`initial phase start: strategy=parallel member_parallel_limit=${memberParallelLimit}`);
    
    memberResults = await runWithConcurrencyLimit(
      activeMembers,
      memberParallelLimit,
      async (member) => {
        const { controller: childController, cleanup: cleanupAbort } = createChildAbort(input.signal);
        try {
          input.onMemberPhase?.(member, "initial");
          input.onMemberEvent?.(member, "initial phase: dispatching run");
          
          const result = await runMember({
            team: input.team,
            member,
            task: input.task,
            sharedContext: input.sharedContext,
            phase: "initial",
            timeoutMs: input.timeoutMs,
            cwd: input.cwd,
            retryOverrides: input.retryOverrides,
            fallbackProvider: input.fallbackProvider,
            fallbackModel: input.fallbackModel,
            signal: childController.signal,
            onStart: input.onMemberStart,
            onEnd: input.onMemberEnd,
            onEvent: input.onMemberEvent,
            onTextDelta: input.onMemberTextDelta,
            onStderrChunk: input.onMemberStderrChunk,
          });
          
          emitResultEvent(member, "initial", result);
          return result;
        } finally {
          cleanupAbort();
        }
      },
      { signal: input.signal },
    );
    
    for (let index = 0; index < activeMembers.length; index += 1) {
      const result = memberResults[index];
      if (result) {
        input.onMemberResult?.(activeMembers[index], result);
      }
    }
    
    input.onTeamEvent?.(
      `initial phase finished: success=${memberResults.filter((result) => result.status === "completed").length}/${memberResults.length}`,
    );
  } else {
    input.onTeamEvent?.("initial phase start: strategy=sequential");
    
    for (const member of activeMembers) {
      input.onMemberPhase?.(member, "initial");
      input.onMemberEvent?.(member, "initial phase: dispatching run");
      
      const result = await runMember({
        team: input.team,
        member,
        task: input.task,
        sharedContext: input.sharedContext,
        phase: "initial",
        timeoutMs: input.timeoutMs,
        cwd: input.cwd,
        retryOverrides: input.retryOverrides,
        fallbackProvider: input.fallbackProvider,
        fallbackModel: input.fallbackModel,
        signal: input.signal,
        onStart: input.onMemberStart,
        onEnd: input.onMemberEnd,
        onEvent: input.onMemberEvent,
        onTextDelta: input.onMemberTextDelta,
        onStderrChunk: input.onMemberStderrChunk,
      });
      
      memberResults.push(result);
      emitResultEvent(member, "initial", result);
      input.onMemberResult?.(member, result);
    }
    
    input.onTeamEvent?.(
      `initial phase finished: success=${memberResults.filter((result) => result.status === "completed").length}/${memberResults.length}`,
    );
  }

  // ============================================================================
  // Phase 2: Communication Rounds
  // ============================================================================
  
  let canRunCommunication =
    memberResults.filter((result) => result.status === "completed").length >= 2;
  
  for (let round = 1; round <= communicationRounds; round += 1) {
    if (!canRunCommunication) {
      input.onTeamEvent?.(
        `communication round skipped: insufficient successful members (need>=2, have=${memberResults.filter((result) => result.status === "completed").length})`,
      );
      break;
    }
    
    input.onTeamEvent?.(`communication round ${round} start`);
    const previousResults = memberResults;
    const previousResultById = new Map(previousResults.map((result) => [result.memberId, result]));
    const communicationMembers = activeMembers.filter(
      (member) => previousResultById.get(member.id)?.status === "completed",
    );
    const skippedCommunicationMembers = activeMembers.filter(
      (member) => !communicationMembers.some((candidate) => candidate.id === member.id),
    );

    if (skippedCommunicationMembers.length > 0) {
      input.onTeamEvent?.(
        `communication round ${round}: skipped_failed_members=${skippedCommunicationMembers
          .map((member) => member.id)
          .join(",")}`,
      );
      for (const member of skippedCommunicationMembers) {
        input.onMemberEvent?.(
          member,
          `communication round ${round}: skipped (previous status=failed)`,
        );
      }
    }

    if (communicationMembers.length < 2) {
      input.onTeamEvent?.(
        `communication round ${round} skipped: insufficient successful members after filtering (need>=2, have=${communicationMembers.length})`,
      );
      canRunCommunication = false;
      break;
    }

    const contextMap = buildPrecomputedContextMap(previousResults);
    memberResults = await executeCommunicationRound({
      input,
      round,
      communicationMembers,
      previousResults,
      previousResultById,
      contextMap,
      communicationLinks,
      memberById,
      memberResults,
      communicationAudit,
      emitResultEvent,
    });
    
    const roundAuditEntries = communicationAudit.filter((entry) => entry.round === round);
    const referencedCount = roundAuditEntries.filter((entry) => entry.referencedPartners.length > 0).length;
    input.onTeamEvent?.(
      `communication round ${round} evidence: referenced=${referencedCount}/${roundAuditEntries.length}`,
    );
    input.onTeamEvent?.(
      `communication round ${round} finished: success=${memberResults.filter((result) => result.status === "completed").length}/${memberResults.length}`,
    );
    
    canRunCommunication =
      memberResults.filter((result) => result.status === "completed").length >= 2;
  }

  // ============================================================================
  // Phase 3: Failed Member Retry
  // ============================================================================
  
  memberResults = await executeFailedMemberRetries({
    input,
    failedMemberRetryRounds,
    memberResults,
    activeMembers,
    activeMemberById,
    communicationLinks,
    memberById,
    communicationRounds,
    communicationAudit,
    emitResultEvent,
    recoveredMembers,
    failedMemberRetryApplied,
  });

  // ============================================================================
  // Phase 4: Final Judge
  // ============================================================================
  
  const finalResult = await executeFinalJudge({
    input,
    memberResults,
    activeMembers,
    communicationRounds,
    failedMemberRetryRounds,
    failedMemberRetryApplied,
    recoveredMembers,
    communicationLinks,
    communicationAudit,
    runId,
    startedAt,
    outputFile,
  });

  return finalResult;
}

// ============================================================================
// Helper: Communication Round Execution
// ============================================================================

interface CommunicationRoundParams {
  input: TeamTaskInput;
  round: number;
  communicationMembers: TeamMember[];
  previousResults: TeamMemberResult[];
  previousResultById: Map<string, TeamMemberResult>;
  contextMap: Map<string, PrecomputedMemberContext>;
  communicationLinks: Map<string, string[]>;
  memberById: Map<string, TeamMember>;
  memberResults: TeamMemberResult[];
  communicationAudit: TeamCommunicationAuditEntry[];
  emitResultEvent: (member: TeamMember, phaseLabel: string, result: TeamMemberResult) => void;
}

async function executeCommunicationRound(
  params: CommunicationRoundParams,
): Promise<TeamMemberResult[]> {
  const {
    input,
    round,
    communicationMembers,
    previousResults,
    previousResultById,
    contextMap,
    communicationLinks,
    memberById,
    communicationAudit,
    emitResultEvent,
  } = params;

  if (input.strategy === "parallel") {
    const memberParallelLimit = toConcurrencyLimit(
      input.memberParallelLimit,
      communicationMembers.length,
    );
    input.onTeamEvent?.(
      `communication round ${round}: strategy=parallel member_parallel_limit=${memberParallelLimit}`,
    );
    
    const roundResults = await runWithConcurrencyLimit(
      communicationMembers,
      memberParallelLimit,
      async (member) => {
        const { controller: childController, cleanup: cleanupAbort } = createChildAbort(input.signal);
        try {
          return await runCommunicationMember({
            input,
            member,
            round,
            previousResults,
            communicationLinks,
            contextMap,
            memberById,
            communicationAudit,
            emitResultEvent,
            signal: childController.signal,
          });
        } finally {
          cleanupAbort();
        }
      },
      { signal: input.signal },
    );
    
    for (let index = 0; index < communicationMembers.length; index += 1) {
      input.onMemberResult?.(communicationMembers[index], roundResults[index]);
    }
    
    return mergeRoundResults(communicationMembers, roundResults, previousResultById);
  } else {
    const roundResults: TeamMemberResult[] = [];
    
    for (const member of communicationMembers) {
      const result = await runCommunicationMember({
        input,
        member,
        round,
        previousResults,
        communicationLinks,
        contextMap,
        memberById,
        communicationAudit,
        emitResultEvent,
        signal: input.signal,
      });
      roundResults.push(result);
      input.onMemberResult?.(member, result);
    }
    
    return mergeRoundResults(communicationMembers, roundResults, previousResultById);
  }
}

interface RunCommunicationMemberParams {
  input: TeamTaskInput;
  member: TeamMember;
  round: number;
  previousResults: TeamMemberResult[];
  communicationLinks: Map<string, string[]>;
  contextMap: Map<string, PrecomputedMemberContext>;
  memberById: Map<string, TeamMember>;
  communicationAudit: TeamCommunicationAuditEntry[];
  emitResultEvent: (member: TeamMember, phaseLabel: string, result: TeamMemberResult) => void;
  signal?: AbortSignal;
}

async function runCommunicationMember(
  params: RunCommunicationMemberParams,
): Promise<TeamMemberResult> {
  const {
    input,
    member,
    round,
    previousResults,
    communicationLinks,
    contextMap,
    memberById,
    communicationAudit,
    emitResultEvent,
    signal,
  } = params;

  const partnerIds = communicationLinks.get(member.id) ?? [];
  const partnerSnapshots = partnerIds.map((partnerId) => {
    const partnerResult = previousResults.find((result) => result.memberId === partnerId);
    const claim = partnerResult ? extractField(partnerResult.output, "CLAIM") || "-" : "-";
    return `${partnerId}:status=${partnerResult?.status || "unknown"} summary=${normalizeForSingleLine(partnerResult?.summary || "-", 70)} claim=${normalizeForSingleLine(claim, 70)}`;
  });
  
  input.onMemberPhase?.(member, "communication", round);
  input.onMemberEvent?.(
    member,
    `communication round ${round}: partners=${partnerIds.join(", ") || "-"} context_build=start`,
  );
  
  const communicationContext = buildCommunicationContext({
    team: input.team,
    member,
    round,
    partnerIds,
    contextMap,
  });
  
  input.onMemberEvent?.(
    member,
    `communication round ${round}: context_build=done size=${communicationContext.length}chars`,
  );
  input.onMemberEvent?.(
    member,
    `communication round ${round}: partner_snapshots=${partnerSnapshots.join(" | ") || "-"}`,
  );
  input.onMemberEvent?.(
    member,
    `communication round ${round}: context_preview=${normalizeForSingleLine(communicationContext, 200)}`,
  );

  const result = await runMember({
    team: input.team,
    member,
    task: input.task,
    sharedContext: input.sharedContext,
    phase: "communication",
    communicationContext,
    timeoutMs: input.timeoutMs,
    cwd: input.cwd,
    retryOverrides: input.retryOverrides,
    fallbackProvider: input.fallbackProvider,
    fallbackModel: input.fallbackModel,
    signal,
    onStart: input.onMemberStart,
    onEnd: input.onMemberEnd,
    onEvent: input.onMemberEvent,
    onTextDelta: input.onMemberTextDelta,
    onStderrChunk: input.onMemberStderrChunk,
  });
  
  emitResultEvent(member, `communication#${round}`, result);
  
  const communicationReference = detectPartnerReferencesV2(result.output, partnerIds, memberById);
  communicationAudit.push({
    round,
    memberId: member.id,
    role: member.role,
    partnerIds: [...partnerIds],
    referencedPartners: communicationReference.referencedPartners,
    missingPartners: communicationReference.missingPartners,
    contextPreview: normalizeForSingleLine(communicationContext, 200),
    partnerSnapshots,
    resultStatus: result.status,
    claimReferences:
      communicationReference.claimReferences.length > 0
        ? communicationReference.claimReferences
        : undefined,
  });
  
  input.onMemberEvent?.(
    member,
    `communication round ${round}: referenced=${communicationReference.referencedPartners.join(", ") || "-"} missing=${communicationReference.missingPartners.join(", ") || "-"}`,
  );
  
  return result;
}

function mergeRoundResults(
  communicationMembers: TeamMember[],
  roundResults: TeamMemberResult[],
  previousResultById: Map<string, TeamMemberResult>,
): TeamMemberResult[] {
  const roundResultById = new Map(roundResults.map((result) => [result.memberId, result]));
  
  return communicationMembers.map((member) => {
    const updated = roundResultById.get(member.id);
    if (updated) return updated;
    
    const previous = previousResultById.get(member.id);
    if (previous) return previous;
    
    return createFailedMemberResult(member, "member result missing after communication round");
  });
}

// ============================================================================
// Helper: Failed Member Retry Execution
// ============================================================================

interface FailedMemberRetryParams {
  input: TeamTaskInput;
  failedMemberRetryRounds: number;
  memberResults: TeamMemberResult[];
  activeMembers: TeamMember[];
  activeMemberById: Map<string, TeamMember>;
  communicationLinks: Map<string, string[]>;
  memberById: Map<string, TeamMember>;
  communicationRounds: number;
  communicationAudit: TeamCommunicationAuditEntry[];
  emitResultEvent: (member: TeamMember, phaseLabel: string, result: TeamMemberResult) => void;
  recoveredMembers: Set<string>;
  failedMemberRetryApplied: number;
}

async function executeFailedMemberRetries(
  params: FailedMemberRetryParams,
): Promise<TeamMemberResult[]> {
  const {
    input,
    failedMemberRetryRounds,
    memberResults,
    activeMembers,
    activeMemberById,
    communicationLinks,
    memberById,
    communicationRounds,
    communicationAudit,
    emitResultEvent,
    recoveredMembers,
  } = params;
  
  let currentResults = memberResults;
  let failedMemberRetryApplied = 0;

  for (let retryRound = 1; retryRound <= failedMemberRetryRounds; retryRound += 1) {
    const resultByIdBeforeRetry = new Map(currentResults.map((result) => [result.memberId, result]));
    const failedMemberResults = currentResults.filter((result) => result.status === "failed");
    
    if (failedMemberResults.length === 0) {
      if (retryRound === 1) {
        input.onTeamEvent?.("failed-member retry skipped: no failed members");
      }
      break;
    }

    const retryTargetIds = failedMemberResults
      .filter((result) => shouldRetryFailedMemberResult(result, retryRound))
      .map((result) => result.memberId);
    const retryTargetMembers = retryTargetIds
      .map((memberId) => activeMemberById.get(memberId))
      .filter((member): member is TeamMember => Boolean(member));
    const skippedFailedMemberIds = failedMemberResults
      .map((result) => result.memberId)
      .filter((memberId) => !retryTargetIds.includes(memberId));

    if (retryTargetMembers.length === 0) {
      input.onTeamEvent?.(
        `failed-member retry round ${retryRound}/${failedMemberRetryRounds} skipped: no retry-eligible failures`,
      );
      continue;
    }

    failedMemberRetryApplied += 1;
    const retryPhaseRound = communicationRounds + retryRound;
    const previousResults = currentResults;
    
    if (skippedFailedMemberIds.length > 0) {
      input.onTeamEvent?.(
        `failed-member retry round ${retryRound}: skipped_by_policy=${skippedFailedMemberIds.join(",")}`,
      );
    }
    
    input.onTeamEvent?.(
      `failed-member retry round ${retryRound}/${failedMemberRetryRounds} start: targets=${retryTargetMembers.map((member) => member.id).join(",")}`,
    );

    const contextMap = buildPrecomputedContextMap(previousResults);

    let retriedResults: TeamMemberResult[] = [];
    if (input.strategy === "parallel") {
      const memberParallelLimit = toConcurrencyLimit(input.memberParallelLimit, retryTargetMembers.length);
      input.onTeamEvent?.(
        `failed-member retry round ${retryRound}: strategy=parallel member_parallel_limit=${memberParallelLimit}`,
      );
      
      retriedResults = await runWithConcurrencyLimit(
        retryTargetMembers,
        memberParallelLimit,
        async (member) =>
          runRetryMember({
            input,
            member,
            retryRound,
            retryPhaseRound,
            previousResults,
            communicationLinks,
            contextMap,
            memberById,
            communicationAudit,
            emitResultEvent,
          }),
        { signal: input.signal },
      );
    } else {
      input.onTeamEvent?.(`failed-member retry round ${retryRound}: strategy=sequential`);
      
      for (const member of retryTargetMembers) {
        const result = await runRetryMember({
          input,
          member,
          retryRound,
          retryPhaseRound,
          previousResults,
          communicationLinks,
          contextMap,
          memberById,
          communicationAudit,
          emitResultEvent,
        });
        retriedResults.push(result);
      }
    }

    const resultById = new Map(currentResults.map((result) => [result.memberId, result]));
    for (let index = 0; index < retryTargetMembers.length; index += 1) {
      const member = retryTargetMembers[index];
      const retried = retriedResults[index];
      const before = resultByIdBeforeRetry.get(member.id);
      
      if (before?.status === "failed" && retried.status === "completed") {
        recoveredMembers.add(member.id);
      }
      
      resultById.set(member.id, retried);
      input.onMemberResult?.(member, retried);
    }

    currentResults = activeMembers.map((member) => {
      const existing = resultById.get(member.id);
      if (existing) return existing;
      return createFailedMemberResult(member, "member result missing after retry");
    });

    const failedAfter = currentResults.filter((result) => result.status === "failed").length;
    input.onTeamEvent?.(
      `failed-member retry round ${retryRound} finished: failed_remaining=${failedAfter}/${currentResults.length} recovered_total=${recoveredMembers.size}`,
    );
  }

  return currentResults;
}

interface RunRetryMemberParams {
  input: TeamTaskInput;
  member: TeamMember;
  retryRound: number;
  retryPhaseRound: number;
  previousResults: TeamMemberResult[];
  communicationLinks: Map<string, string[]>;
  contextMap: Map<string, PrecomputedMemberContext>;
  memberById: Map<string, TeamMember>;
  communicationAudit: TeamCommunicationAuditEntry[];
  emitResultEvent: (member: TeamMember, phaseLabel: string, result: TeamMemberResult) => void;
}

async function runRetryMember(params: RunRetryMemberParams): Promise<TeamMemberResult> {
  const {
    input,
    member,
    retryRound,
    retryPhaseRound,
    previousResults,
    communicationLinks,
    contextMap,
    memberById,
    communicationAudit,
    emitResultEvent,
  } = params;

  const { controller: childController, cleanup: cleanupAbort } = createChildAbort(input.signal);
  
  try {
    const partnerIds = communicationLinks.get(member.id) ?? [];
    const partnerSnapshots = partnerIds.map((partnerId) => {
      const partnerResult = previousResults.find((result) => result.memberId === partnerId);
      const claim = partnerResult ? extractField(partnerResult.output, "CLAIM") || "-" : "-";
      return `${partnerId}:status=${partnerResult?.status || "unknown"} summary=${normalizeForSingleLine(partnerResult?.summary || "-", 70)} claim=${normalizeForSingleLine(claim, 70)}`;
    });
    
    input.onMemberPhase?.(member, "communication", retryPhaseRound);
    input.onMemberEvent?.(
      member,
      `failed-member retry round ${retryRound}: partners=${partnerIds.join(", ") || "-"} context_build=start`,
    );
    
    const communicationContext = buildCommunicationContext({
      team: input.team,
      member,
      round: retryPhaseRound,
      partnerIds,
      contextMap,
    });
    
    input.onMemberEvent?.(
      member,
      `failed-member retry round ${retryRound}: context_build=done size=${communicationContext.length}chars`,
    );
    input.onMemberEvent?.(
      member,
      `failed-member retry round ${retryRound}: partner_snapshots=${partnerSnapshots.join(" | ") || "-"}`,
    );
    input.onMemberEvent?.(
      member,
      `failed-member retry round ${retryRound}: context_preview=${normalizeForSingleLine(communicationContext, 200)}`,
    );
    
    const result = await runMember({
      team: input.team,
      member,
      task: input.task,
      sharedContext: input.sharedContext,
      phase: "communication",
      communicationContext,
      timeoutMs: input.timeoutMs,
      cwd: input.cwd,
      retryOverrides: input.retryOverrides,
      fallbackProvider: input.fallbackProvider,
      fallbackModel: input.fallbackModel,
      signal: childController.signal,
      onStart: input.onMemberStart,
      onEnd: input.onMemberEnd,
      onEvent: input.onMemberEvent,
      onTextDelta: input.onMemberTextDelta,
      onStderrChunk: input.onMemberStderrChunk,
    });
    
    emitResultEvent(member, `failed-retry#${retryRound}`, result);
    
    const communicationReference = detectPartnerReferencesV2(result.output, partnerIds, memberById);
    communicationAudit.push({
      round: retryPhaseRound,
      memberId: member.id,
      role: member.role,
      partnerIds: [...partnerIds],
      referencedPartners: communicationReference.referencedPartners,
      missingPartners: communicationReference.missingPartners,
      contextPreview: normalizeForSingleLine(communicationContext, 200),
      partnerSnapshots,
      resultStatus: result.status,
      claimReferences:
        communicationReference.claimReferences.length > 0
          ? communicationReference.claimReferences
          : undefined,
    });
    
    input.onMemberEvent?.(
      member,
      `failed-member retry round ${retryRound}: referenced=${communicationReference.referencedPartners.join(", ") || "-"} missing=${communicationReference.missingPartners.join(", ") || "-"}`,
    );
    
    return result;
  } finally {
    cleanupAbort();
  }
}

// ============================================================================
// Helper: Final Judge Execution
// ============================================================================

interface FinalJudgeParams {
  input: TeamTaskInput;
  memberResults: TeamMemberResult[];
  activeMembers: TeamMember[];
  communicationRounds: number;
  failedMemberRetryRounds: number;
  failedMemberRetryApplied: number;
  recoveredMembers: Set<string>;
  communicationLinks: Map<string, string[]>;
  communicationAudit: TeamCommunicationAuditEntry[];
  runId: string;
  startedAt: string;
  outputFile: string;
}

async function executeFinalJudge(
  params: FinalJudgeParams,
): Promise<TeamTaskResult> {
  const {
    input,
    memberResults,
    activeMembers,
    communicationRounds,
    failedMemberRetryRounds,
    failedMemberRetryApplied,
    recoveredMembers,
    communicationLinks,
    communicationAudit,
    runId,
    startedAt,
    outputFile,
  } = params;

  const failed = memberResults.filter((result) => result.status === "failed");
  const communicationLinksRecord = Object.fromEntries(
    activeMembers.map((member) => [member.id, communicationLinks.get(member.id) ?? []]),
  );
  
  const summary =
    failed.length === 0
      ? `${memberResults.length} teammates completed. communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryApplied}/${failedMemberRetryRounds} recovered=${recoveredMembers.size}`
      : `${memberResults.length - failed.length}/${memberResults.length} teammates completed (${failed.length} failed). communication_rounds=${communicationRounds} failed_member_retries=${failedMemberRetryApplied}/${failedMemberRetryRounds} recovered=${recoveredMembers.size}`;
  
  const { proxy, explanation } = computeProxyUncertaintyWithExplainability(memberResults);

  // Log judge explanation for transparency (P0 improvement: decision explainability)
  const explanationSummary = formatJudgeExplanation(explanation);
  input.onTeamEvent?.(`judge explanation: ${explanationSummary.split('\n').slice(0, 3).join(' | ')}`);

  // ユーザビリティ改善: 達成/残存の初期化
  const achieved: string[] = [];
  const remaining: string[] = [];

  // 自動的な達成/残存の推論（finalJudgeの前）
  if (failed.length === 0) {
    achieved.push("All teammates completed successfully");
  } else {
    achieved.push(`${memberResults.length - failed.length}/${memberResults.length} teammates completed`);
    remaining.push(`${failed.length} teammate(s) failed`);
  }
  if (communicationRounds > 0 && communicationAudit.length > 0) {
    achieved.push("Communication rounds executed");
  }

  // runRecordの初期化（finalJudgeは後で設定）
  let runRecord: TeamRunRecord = {
    runId,
    teamId: input.team.id,
    strategy: input.strategy,
    task: input.task,
    communicationRounds,
    failedMemberRetryRounds,
    failedMemberRetryApplied,
    recoveredMembers: Array.from(recoveredMembers),
    communicationLinks: communicationLinksRecord,
    summary,
    status: failed.length === memberResults.length ? "failed" : "completed",
    startedAt,
    finishedAt: new Date().toISOString(),
    memberCount: memberResults.length,
    outputFile,
    successCriteria: input.successCriteria,
    achieved,
    remaining,
  };

  for (const member of activeMembers) {
    input.onMemberPhase?.(member, "judge");
    input.onMemberEvent?.(member, "final judge: waiting team-level verdict");
  }
  input.onTeamEvent?.("final judge start");

  const finalJudge = await runFinalJudge({
    team: input.team,
    task: input.task,
    strategy: input.strategy,
    memberResults,
    proxy,
    timeoutMs: input.timeoutMs,
    signal: input.signal,
  });
  
  input.onTeamEvent?.(
    `final judge finished: verdict=${finalJudge.verdict} confidence=${Math.round(finalJudge.confidence * 100)}% u_sys=${finalJudge.uSys.toFixed(2)}`,
  );

  // finalJudgeの結果に基づいてachieved/remainingを更新
  if (finalJudge.verdict === "trusted") {
    achieved.push("High confidence result");
  } else if (finalJudge.verdict === "partial") {
    remaining.push("Result has partial confidence - review recommended");
  } else {
    remaining.push("Low confidence result - manual review required");
  }

  // 成功基準がある場合、達成状況を推論（finalJudgeの後）
  if (input.successCriteria && input.successCriteria.length > 0) {
    const allResultsText = memberResults.map(r => r.output ?? "").join(" ").toLowerCase();
    for (const criterion of input.successCriteria) {
      if (allResultsText.includes(criterion.toLowerCase()) ||
          (failed.length === 0 && finalJudge.verdict === "trusted")) {
        achieved.push(`[CRITERION MET] ${criterion}`);
      } else {
        remaining.push(`[CRITERION PENDING] ${criterion}`);
      }
    }
  }

  // runRecordを更新
  runRecord = {
    ...runRecord,
    achieved,
    remaining,
    finalJudge: {
      verdict: finalJudge.verdict,
      confidence: finalJudge.confidence,
      reason: finalJudge.reason,
      nextStep: finalJudge.nextStep,
      uIntra: finalJudge.uIntra,
      uInter: finalJudge.uInter,
      uSys: finalJudge.uSys,
      collapseSignals: finalJudge.collapseSignals,
    },
  };
  
  for (const member of activeMembers) {
    input.onMemberEvent?.(
      member,
      `final judge verdict=${finalJudge.verdict} confidence=${Math.round(finalJudge.confidence * 100)}% next_step=${normalizeForSingleLine(finalJudge.nextStep, 120)}`,
    );
    input.onMemberPhase?.(member, "finished");
  }

  // 思考領域改善: チーム実行後の簡易検証（同期）
  let verificationResult: { triggered: boolean; result?: { issues: Array<{ type: string; severity: string; description: string }>; verdict: string }; error?: string } | null = null;
  try {
    const { simpleVerificationHook } = await import("../../lib/verification-simple.js");
    const aggregatedOutput = JSON.stringify({
      summary,
      verdict: finalJudge.verdict,
      confidence: finalJudge.confidence,
      memberSummaries: memberResults.map(r => r.summary),
    });
    
    verificationResult = await simpleVerificationHook(
      aggregatedOutput,
      finalJudge.confidence,
      {
        task: input.task,
        triggerMode: "post-team",
        teamId: input.team.id,
      }
    );
    
    if (verificationResult.triggered && verificationResult.result) {
      input.onTeamEvent?.(`verification: ${verificationResult.result.issues.length} issues, verdict=${verificationResult.result.verdict}`);
      if (verificationResult.result.issues.length > 0) {
        remaining.push(`Verification: ${verificationResult.result.issues.map(i => i.type).join(", ")}`);
      }
    }
  } catch (verificationError) {
    const verificationErrorMsg = verificationError instanceof Error ? verificationError.message : String(verificationError);
    input.onTeamEvent?.(`verification error: ${verificationErrorMsg}`);
  }

  // Record team execution for cost estimation learning
  const totalLatencyMs = memberResults.reduce((sum, r) => sum + r.latencyMs, 0);
  const executionEntry: ExecutionHistoryEntry = {
    source: "agent_team_run",
    provider: input.fallbackProvider ?? "(session-default)",
    model: input.fallbackModel ?? "(session-default)",
    taskDescription: input.task,
    actualDurationMs: totalLatencyMs,
    actualTokens: 0,
    success: failed.length === 0,
    timestamp: Date.now(),
  };
  
  try {
    getCostEstimator().recordExecution(executionEntry);
  } catch {
    // Ignore errors in cost estimation recording
  }

  writeFileSync(
    outputFile,
    JSON.stringify(
      {
        run: runRecord,
        team: input.team,
        memberResults,
        communicationAudit,
        uncertaintyProxy: proxy,
        uncertaintyProxyExplanation: explanation,
        finalJudge,
        task: input.task,
        sharedContext: input.sharedContext,
      },
      null,
      2,
    ),
    "utf-8",
  );

  return {
    runRecord,
    memberResults,
    communicationAudit,
    uncertaintyProxy: proxy,
    uncertaintyProxyExplanation: explanation,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 失敗したメンバーの結果を作成
 */
function createFailedMemberResult(member: TeamMember, error: string): TeamMemberResult {
  return {
    memberId: member.id,
    role: member.role,
    summary: "(failed)",
    output: "",
    status: "failed",
    latencyMs: 0,
    error,
    diagnostics: {
      confidence: 0,
      evidenceCount: 0,
      contradictionSignals: 0,
      conflictSignals: 0,
    },
  };
}
