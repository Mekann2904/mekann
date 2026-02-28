/**
 * @abdd.meta
 * path: .pi/extensions/subagents/storage.ts
 * role: サブエージェント定義と実行記録の永続化を行うモジュール
 * why: agent-teams/storage.tsとのコード重複を排除し、共通ストレージユーティリティを利用するため
 * related: ../../lib/storage-base.ts, ../../lib/storage-lock.ts, ../../lib/comprehensive-logger.ts
 * public_api: type AgentEnabledState, interface SubagentDefinition, interface SubagentRunRecord
 * invariants: SubagentDefinitionには一意なidとISO 8601形式の日時が含まれる
 * side_effects: ファイルシステムへの読み書き、ファイルロックの取得と解放
 * failure_modes: ファイルの破損時はバックアップを作成、書き込み失敗時はエラーを記録
 * @abdd.explain
 * overview: サブエージェントのメタデータと実行履歴を管理するストレージ層の実装
 * what_it_does:
 *   - SubagentDefinition（定義）とSubagentRunRecord（実行記録）の型定義をエクスポートする
 *   - 共通ストレージユーティリティ（storage-base.ts）を用いてデータの永続化を行う
 *   - アトミックな書き込みとファイルロックを利用してデータの一貫性を保つ
 * why_it_exists:
 *   - エージェント定義と実行履歴を永続化するために
 *   - 重複コード（DRY違反）を解消し、ストレージロジックを共通化するために
 *   - ファイル操作の競合を防ぎ、データ破損リスクを低減するために
 * scope:
 *   in: なし（外部依存としてstorage-base.ts, storage-lock.tsを使用）
 *   out: SubagentDefinition, SubagentRunRecord, AgentEnabledState
 */

/**
 * Subagent storage module.
 * Handles persistence for subagent definitions and run records.
 *
 * Refactored to use common storage utilities from lib/storage-base.ts
 * to eliminate DRY violations with agent-teams/storage.ts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPathsFactory,
  createEnsurePaths,
  pruneRunArtifacts,
  mergeSubagentStorageWithDisk as mergeStorageWithDiskCommon,
  createCorruptedBackup,
  type BaseStoragePaths,
} from "../../lib/storage/storage-base.js";
import { atomicWriteTextFile, withFileLock } from "../../lib/storage/storage-lock.js";
import { getLogger } from "../../lib/comprehensive-logger.js";

const logger = getLogger();

// Re-export types for convenience
/**
/**
 * サブエージェントの定義情報を表すインターフェース
 *
 * サブエージェントの設定、プロバイダー情報、スキルなどを管理します。
 *
 * @property id - サブエージェントの一意識別子
 * @property name - サブエージェントの表示名
 * @property description - サブエージェントの機能説明
 * @property systemPrompt - エージェントの動作を定義するシステムプロンプト
 * @property provider - 使用するAIプロバイダー（省略可能）
 * @property model - 使用するモデル名（省略可能）
 * @property enabled - エージェントの有効/無効状態
 * @property skills - エージェントが使用可能なスキルIDの配列（省略可能）
 * @property createdAt - 作成日時（ISO 8601形式）
 * @property updatedAt - 最終更新日時（ISO 8601形式）
 */

/**
 * エージェントの有効/無効状態
 * @summary 有効/無効状態
 */
export type AgentEnabledState = "enabled" | "disabled";

 /**
  * サブエージェントの定義情報を表すインターフェース
  * @param id - サブエージェントの一意識別子
  * @param name - 表示名
  * @param description - 説明文
  * @param systemPrompt - システムプロンプト
  * @param provider - プロバイダ名（省略可能）
  * @param model - 使用するモデル名（省略可能）
  * @param enabled - 有効/無効状態
  * @param skills - 利用可能なスキルIDの配列（省略可能）
  */
export interface SubagentDefinition {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  provider?: string;
  model?: string;
  enabled: AgentEnabledState;
  skills?: string[];
/**
   * サブエージェントのストレージパスを定義するインターフェース
   *
   * BaseStoragePathsを継承し、サブエージェント固有のパス構造を提供します。
   *
   * @example
   * const paths = getPaths('/project/root');
   * console.log(paths.dataDir);
   */
  createdAt: string;
  updatedAt: string;
}

/**
 * サブエージェントの実行記録
 * @summary 実行記録を保持
 * @param runId 実行ID
 * @param agentId エージェントID
 * @param task タスク内容
 * @param summary 実行結果の要約
 * @param status ステータス
 * @param startedAt 開始日時
 * @param finishedAt 終了日時
 * @param latencyMs 遅延時間（ミリ秒）
 * @param outputFile 出力ファイルパス
 * @param error エラー内容（任意）
 * @param correlationId 相関ID（任意、後方互換性用）
 * @param parentEventId 親イベントID（任意）
 */
export interface SubagentRunRecord {
  runId: string;
  agentId: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  outputFile: string;
  error?: string;
  // 相関IDフィールド（後方互換性のためオプション）
  correlationId?: string;
  parentEventId?: string;
}

/**
 * サブエージェントのストレージ
 * @summary ストレージ取得
 * @param agents - サブエージェント定義のリスト
 * @param runs - サブエージェントの実行記録リスト
 * @param currentAgentId - 現在のエージェントID（オプション）
 * @param defaultsVersion - デフォルト設定のバージョン（オプション）
 */
export interface SubagentStorage {
  agents: SubagentDefinition[];
  runs: SubagentRunRecord[];
  currentAgentId?: string;
  defaultsVersion?: number;
}

/**
 * パス定義
 * @summary パス定義
 * @returns {void}
 */
export type SubagentPaths = BaseStoragePaths;

// Constants
export const MAX_RUNS_TO_KEEP = 100;
export const SUBAGENT_DEFAULTS_VERSION = 4;  // Updated: added challenger and inspector agents

// Use common path factory
const getBasePaths = createPathsFactory("subagents");
export const getPaths = getBasePaths as (cwd: string) => SubagentPaths;
export const ensurePaths = createEnsurePaths(getPaths);

/**
 * デフォルト作成
 * @summary デフォルト作成
 * @param nowIso - 現在時刻のISO形式文字列
 * @returns {SubagentDefinition[]} デフォルトのサブエージェント定義リスト
 */
export function createDefaultAgents(nowIso: string): SubagentDefinition[] {
  return [
    {
      id: "researcher",
      name: "Researcher",
      description: "Fast code and docs investigator. Great for broad discovery and fact collection.",
      systemPrompt:
        "You are the Researcher subagent. Collect concrete facts quickly. Use short bullet points. Include file paths and exact findings. Avoid implementation changes. Before starting investigation, explicitly state your understanding of what the user wants to know. If the user's intent is unclear, list multiple possible interpretations. Actively seek evidence that contradicts your initial hypotheses. " +
        "Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
        "If an error or failure occurs during investigation, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "architect",
      name: "Architect",
      description: "Design-focused helper for decomposition, constraints, and migration plans.",
      systemPrompt:
        "You are the Architect subagent. Propose minimal, modular designs. Prefer explicit trade-offs and short execution plans. Consider multiple design alternatives before settling on one. Explicitly state what assumptions your design depends on. Consider edge cases and failure modes. Verify that your design constraints are necessary and not overly restrictive. " +
        "Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
        "If an error or failure occurs during design, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "implementer",
      name: "Implementer",
      description: "Implementation helper for scoped coding tasks and fixes.",
      systemPrompt:
        "You are the Implementer subagent. Deliver precise, minimal code-focused output. Mention assumptions. Keep scope tight. Before implementing, verify your understanding of requirements. Consider edge cases and potential side effects. Explicitly state what assumptions your implementation depends on. After implementation, verify that the solution actually solves the stated problem. " +
        "Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
        "If an error or failure occurs during implementation, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "reviewer",
      name: "Reviewer",
      description: "Read-only reviewer for risk checks, tests, and quality feedback.",
      systemPrompt:
        "You are the Reviewer subagent. Do not propose broad rewrites. Highlight critical issues first, then warnings, then optional improvements. Specifically check for: (1) confirmation bias in conclusions - actively seek disconfirming evidence, (2) missing evidence for claims, (3) logical inconsistencies between CLAIM and RESULT, (4) reversal of causal claims - verify if 'A implies B' also means 'B implies A', (5) assumptions about user intent that may be incorrect, (6) anchoring bias - reconsider initial conclusions in light of new evidence. " +
        "Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
        "If an error or failure occurs during review, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "tester",
      name: "Tester",
      description: "Validation helper focused on reproducible checks and minimal test plans.",
      systemPrompt:
        "You are the Tester subagent. Propose deterministic validation steps first. Prefer quick, high-signal checks and explicit expected outcomes. Actively seek test cases that could disprove the implementation, not just confirm it. Consider boundary conditions, edge cases, and failure modes. Distinguish between tests that verify expected behavior and tests that try to break the code. " +
        "Output format: SUMMARY: <brief summary in Japanese>, CLAIM: <main claim>, EVIDENCE: <file:line references>, CONFIDENCE: <0.0-1.0>, RESULT: <main answer>. " +
        "If an error or failure occurs during testing, report it clearly with: ERROR: <error description in Japanese>, RECOVERY: <suggested recovery action>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "challenger",
      name: "Challenger",
      description: "Adversarial reviewer that actively disputes claims and finds weaknesses in other agents' outputs.",
      systemPrompt:
        "You are the Challenger subagent. Your primary role is to DISPUTE and FIND FLAWS in other agents' outputs. " +
        "For each claim you review: (1) Identify at least one weakness or gap, (2) Check if evidence actually supports the claim or is merely consistent with it, " +
        "(3) Propose at least one alternative interpretation, (4) Flag assumptions that may be unwarranted, " +
        "(5) Test boundary conditions where the claim would fail. " +
        "Be constructively critical - your goal is to strengthen conclusions through rigorous challenge. " +
        "Output format: CHALLENGED_CLAIM: <specific claim>, FLAW: <identified flaw>, EVIDENCE_GAP: <missing evidence>, " +
        "ALTERNATIVE: <alternative interpretation>, BOUNDARY_FAILURE: <conditions where claim fails>, SEVERITY: critical/moderate/minor.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "inspector",
      name: "Inspector",
      description: "Output quality monitor that detects suspicious patterns, inconsistencies, and potential reasoning failures.",
      systemPrompt:
        "You are the Inspector subagent. Monitor outputs for suspicious patterns: " +
        "(1) Claims without evidence or with weak evidence for high confidence, " +
        "(2) Logical inconsistencies between CLAIM and RESULT sections, " +
        "(3) Confidence misalignment with evidence strength (e.g., 0.9 confidence with minimal evidence), " +
        "(4) Missing alternative explanations for conclusions, " +
        "(5) Reversal of causal claims without justification ('A implies B' treated as 'B implies A'), " +
        "(6) Confirmation bias patterns - only seeking supporting evidence. " +
        "Output format: INSPECTION_REPORT: <findings>, SUSPICION_LEVEL: low/medium/high, " +
        "RECOMMENDATION: proceed/challenge/reject, EVIDENCE: <specific file:line references for issues>.",
      enabled: "enabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

/**
 * Merge existing subagent with default values.
 * Note: Kept locally because this is subagent-specific merge logic.
 */
function mergeDefaultSubagent(
  existing: SubagentDefinition,
  fallback: SubagentDefinition,
): SubagentDefinition {
  const hasDrift =
    existing.name !== fallback.name ||
    existing.description !== fallback.description ||
    existing.systemPrompt !== fallback.systemPrompt;
  return {
    ...fallback,
    enabled: existing.enabled,
    provider: existing.provider,
    model: existing.model,
    createdAt: existing.createdAt || fallback.createdAt,
    updatedAt: hasDrift ? new Date().toISOString() : existing.updatedAt || fallback.updatedAt,
  };
}

/**
 * Ensure storage has default agents.
 * Note: Kept locally because default agent logic is subagent-specific.
 */
function ensureDefaults(storage: SubagentStorage, nowIso: string): SubagentStorage {
  const defaults = createDefaultAgents(nowIso);
  const defaultIds = new Set(defaults.map((agent) => agent.id));
  const existingById = new Map(storage.agents.map((agent) => [agent.id, agent]));
  const mergedAgents: SubagentDefinition[] = [];

  // Keep built-in definitions synchronized so prompt updates actually apply.
  for (const defaultAgent of defaults) {
    const existing = existingById.get(defaultAgent.id);
    if (!existing) {
      mergedAgents.push(defaultAgent);
      continue;
    }
    mergedAgents.push(mergeDefaultSubagent(existing, defaultAgent));
  }

  // Preserve user-defined agents as-is.
  for (const agent of storage.agents) {
    if (!defaultIds.has(agent.id)) {
      mergedAgents.push(agent);
    }
  }

  storage.agents = mergedAgents;
  storage.defaultsVersion = SUBAGENT_DEFAULTS_VERSION;

  if (!storage.currentAgentId || !storage.agents.some((agent) => agent.id === storage.currentAgentId)) {
    storage.currentAgentId = defaults[0]?.id;
  }

  return storage;
}

/**
 * Merge storage with disk state (for concurrent access).
 * Uses common utility from lib/storage-base.ts.
 */
function mergeSubagentStorageWithDisk(
  storageFile: string,
  next: SubagentStorage,
): SubagentStorage {
  return mergeStorageWithDiskCommon(
    storageFile,
    {
      agents: next.agents,
      runs: next.runs,
      currentAgentId: next.currentAgentId,
      defaultsVersion: next.defaultsVersion,
    },
    SUBAGENT_DEFAULTS_VERSION,
    MAX_RUNS_TO_KEEP,
  ) as SubagentStorage;
}

/**
 * ストレージを読み込み
 * @summary ストレージ読込
 * @param cwd - カレントワーキングディレクトリ
 * @returns {SubagentStorage} 読み込まれたサブエージェントストレージデータ
 */
export function loadStorage(cwd: string): SubagentStorage {
  const paths = ensurePaths(cwd);
  const nowIso = new Date().toISOString();

  const fallback: SubagentStorage = {
    agents: createDefaultAgents(nowIso),
    runs: [],
    currentAgentId: "researcher",
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };

  if (!existsSync(paths.storageFile)) {
    saveStorage(cwd, fallback);
    return fallback;
  }

  try {
    const rawContent = readFileSync(paths.storageFile, "utf-8");
    const parsed = JSON.parse(rawContent) as Partial<SubagentStorage>;
    const storage: SubagentStorage = {
      agents: Array.isArray(parsed.agents) ? parsed.agents : [],
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      currentAgentId: typeof parsed.currentAgentId === "string" ? parsed.currentAgentId : undefined,
      defaultsVersion:
        typeof parsed.defaultsVersion === "number" && Number.isFinite(parsed.defaultsVersion)
          ? Math.trunc(parsed.defaultsVersion)
          : 0,
    };
    return ensureDefaults(storage, nowIso);
  } catch (error: unknown) {
    // Create backup of corrupted file before overwriting
    createCorruptedBackup(paths.storageFile, "subagents");

    // Log warning about data loss
    console.warn(
      `[subagents] loadStorage: JSON parse failed, falling back to empty storage. ` +
        `Backup saved. Error: ${error instanceof Error ? error.message : String(error)}`,
    );

    saveStorage(cwd, fallback);
    return fallback;
  }
}

/**
 * ストレージを保存
 * @summary ストレージ保存
 * @param cwd - カレントワーキングディレクトリ
 * @param storage - 保存するサブエージェントストレージデータ
 * @returns {void}
 */
export function saveStorage(cwd: string, storage: SubagentStorage): void {
  const paths = ensurePaths(cwd);
  const normalized: SubagentStorage = {
    ...storage,
    runs: storage.runs.slice(-MAX_RUNS_TO_KEEP),
    defaultsVersion: SUBAGENT_DEFAULTS_VERSION,
  };
  withFileLock(paths.storageFile, () => {
    const merged = mergeSubagentStorageWithDisk(paths.storageFile, normalized);
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
 * ストレージを保存
 * @summary ストレージ保存
 * @param cwd - カレントワーキングディレクトリ
 * @param storage - 保存するサブエージェントストレージデータ
 * @returns {Promise<void>}
 */
export async function saveStorageWithPatterns(
  cwd: string,
  storage: SubagentStorage,
): Promise<void> {
  saveStorage(cwd, storage);

  // Extract patterns from new runs (async, non-blocking)
  const { addRunToPatterns } = await import("../../lib/storage/pattern-extraction.js");
  const { addRunToSemanticMemory, isSemanticMemoryAvailable } = await import(
    "../../lib/storage/semantic-memory.js"
  );
  const { indexSubagentRun } = await import("../../lib/storage/run-index.js");

  // Get the most recent run(s) that haven't been indexed yet
  const recentRuns = storage.runs.slice(-5);

  for (const run of recentRuns) {
    try {
      // Add to pattern extraction
      addRunToPatterns(cwd, {
        runId: run.runId,
        agentId: run.agentId,
        task: run.task,
        summary: run.summary,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        error: run.error,
      });

      // Add to semantic memory if available
      if (isSemanticMemoryAvailable()) {
        const indexedRun = indexSubagentRun(run);
        await addRunToSemanticMemory(cwd, indexedRun);
      }
    } catch (error: unknown) {
      // Don't fail the save if pattern extraction fails
      console.error("Error extracting patterns from run:", error instanceof Error ? error.message : String(error));
    }
  }
}
