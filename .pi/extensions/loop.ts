/**
 * @abdd.meta
 * path: .pi/extensions/loop.ts
 * role: Autonomous loop runner extension with reference grounding
 * why: Enables repeated model iterations with citation checks and reproducible run logs
 * related: README.md, .pi/extensions/rsa.ts, .pi/extensions/question.ts
 * public_api: executeLoop, loadReferences, runVerificationCommand, parseLoopContract
 * invariants: Reference integrity maintained during execution, SSRF protection enforced for network access, verification policies respected
 * side_effects: Writes execution logs to filesystem, executes system commands via verification policy, spawns child processes for model calls
 * failure_modes: Model timeout, semantic repetition detection, network fetch failure, command execution rejection by policy
 * @abdd.explain
 * overview: 認証参照に基づき、検証ポリシーと反復実行を管理する自律型ループランナー拡張機能
 * what_it_does:
 *   - ループ契約を解析し、検証ポリシーに基づくコマンド実行を行う
 *   - 参照ファイルまたはURLからコンテキストを読み込み、SSRF保護を適用する
 *   - セマンティックな繰り返しを検出し、反復ごとの出力をログに記録する
 *   - パターン抽出と意図分類に基づき、ループの焦点と制限を調整する
 * why_it_exists:
 *   - 反復的なモデル処理において、引用チェックと再現可能な実行ログを保証するため
 *   - 外部リソースへのアクセスとコマンド実行を安全なポリシー下で統合するため
 *   - 実行の停滞や無限ループを検知し、健全性を維持するため
 * scope:
 *   in: ParsedLoopContract, VerificationPolicyConfig, array of LoopReference (files or URLs)
 *   out: LoopStatus, Run logs written to disk, Verification command results
 */

// File: .pi/extensions/loop.ts
// Description: Adds an autonomous loop runner with reference-grounded execution for pi.
// Why: Enables repeated model iterations with citation checks and reproducible run logs.
// Related: README.md, .pi/extensions/rsa.ts, .pi/extensions/question.ts

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { formatDuration } from "../lib/core/format-utils.js";
import { toErrorMessage } from "../lib/core/error-utils.js";
import { toBoundedInteger, toBoundedFloat } from "../lib/core/validation-utils.js";
import { createBoundedOptionalNumberSchema } from "../lib/tool-contracts.js";
import { createLoopBenchmarkRun } from "../lib/agent/benchmark-harness.js";
import {
  buildTurnExecutionContext,
  deriveTurnExecutionDecisions,
} from "../lib/agent/turn-context-builder.js";
import {
  applyReplayDecisionConstraints,
  applyReplayToolConstraints,
  createTurnExecutionSnapshot,
  type TurnExecutionSnapshot,
} from "../lib/agent/turn-context-snapshot.js";
import {
  formatTurnExecutionSnapshot,
  loadLoopReplayInput,
  loadLoopTurnContextSnapshots,
} from "../lib/agent/turn-context-inspector.js";
import {
  mergePromptStackBenchmarkSummaries,
  summarizePromptStackForBenchmark,
  type PromptStackBenchmarkSummary,
} from "../lib/agent/benchmark-harness.js";
import { recordAgentBenchmarkRun } from "../lib/agent/benchmark-store.js";
import {
  toPreview,
  normalizeOptionalText,
  throwIfAborted,
} from "../lib/text-utils.js";
import { ThinkingLevel, RunOutcomeCode } from "../lib/agent/agent-types.js";
import { createRunId } from "../lib/agent/agent-utils.js";
import { computeModelTimeoutMs } from "../lib/agent/model-timeouts.js";
import { getLogger } from "../lib/comprehensive-logger";
import type { OperationType } from "../lib/comprehensive-logger-types";

const logger = getLogger();
import {
  classifyIntent,
  getIntentBudget,
  type TaskIntent,
  type IntentClassificationResult,
} from "../lib/intent-aware-limits";
import {
  detectSemanticRepetition,
} from "../lib/storage/semantic-repetition.js";
import { atomicWriteTextFile, withFileLock } from "../lib/storage/storage-lock.js";
import {
  findRelevantPatterns,
} from "../lib/storage/pattern-extraction.js";

import { callModelViaPi as sharedCallModelViaPi } from "./shared/pi-print-executor";
import { checkUlWorkflowOwnership } from "./subagents.js";
import {
  createTrajectoryReducer,
  messageToStep,
  type TrajectoryReductionConfig,
  type ReductionStats,
  DEFAULT_TRAJECTORY_REDUCTION_CONFIG,
} from "../lib/trajectory-reduction/index.js";
import {
  recordLongRunningEvent,
  runLongRunningPreflight,
} from "../lib/long-running-supervisor.js";

// Import extracted modules for SSRF protection, reference loading, verification, and iteration building
import {
  isBlockedHostname,
  isPrivateOrReservedIP,
  validateUrlForSsrf,
} from "./loop/ssrf-protection";
import {
  type LoopReference,
  type LoadedReferenceResult,
  loadReferences,
  fetchTextFromUrl,
} from "./loop/reference-loader";
import {
  type LoopVerificationResult,
  type ParsedVerificationCommand,
  type VerificationPolicyMode,
  type VerificationPolicyConfig,
  resolveVerificationPolicy,
  shouldRunVerificationCommand,
  runVerificationCommand,
  parseVerificationCommand,
  resolveVerificationAllowlistPrefixes,
  isVerificationCommandAllowed,
  buildVerificationValidationFeedback,
} from "./loop/verification";
import {
  LOOP_JSON_BLOCK_TAG,
  LOOP_RESULT_BLOCK_TAG,
  type LoopStatus,
  type LoopGoalStatus,
  type RelevantPattern,
  buildIterationPrompt,
  buildIterationPromptPackage,
  buildReferencePack,
  buildIterationFocus,
  buildLoopCommandPreview,
  buildIterationFailureOutput,
  parseLoopContract,
  extractLoopResultBody,
  validateIteration,
  normalizeValidationFeedback,
  buildDoneDeclarationFeedback,
  extractNextStepLine,
  extractSummaryLine,
  normalizeLoopOutput,
} from "./loop/iteration-builder";

// Re-export for backward compatibility
export {
  isBlockedHostname,
  isPrivateOrReservedIP,
  validateUrlForSsrf,
  type LoopReference,
  type LoadedReferenceResult,
  loadReferences,
  fetchTextFromUrl,
  type LoopVerificationResult,
  type ParsedVerificationCommand,
  type VerificationPolicyMode,
  type VerificationPolicyConfig,
  LOOP_JSON_BLOCK_TAG,
  LOOP_RESULT_BLOCK_TAG,
  buildIterationPrompt,
  buildReferencePack,
  buildIterationFocus,
  buildLoopCommandPreview,
  buildIterationFailureOutput,
  parseLoopContract,
  extractLoopResultBody,
  validateIteration,
  normalizeValidationFeedback,
  buildDoneDeclarationFeedback,
  extractNextStepLine,
  extractSummaryLine,
  normalizeLoopOutput,
  resolveVerificationPolicy,
  shouldRunVerificationCommand,
  runVerificationCommand,
  parseVerificationCommand,
  resolveVerificationAllowlistPrefixes,
  isVerificationCommandAllowed,
  buildVerificationValidationFeedback,
};

interface LoopConfig {
  maxIterations: number;
  timeoutMs: number;
  requireCitation: boolean;
  verificationTimeoutMs: number;
  /** Enable semantic-based stagnation detection (requires OPENAI_API_KEY) */
  enableSemanticStagnation?: boolean;
  /** Semantic similarity threshold for repetition detection (0-1, default: 0.85) */
  semanticRepetitionThreshold?: number;
  /** Enable Mediator layer for intent clarification (arXiv:2602.07338v1) */
  enableMediator?: boolean;
  /** Auto-proceed threshold for Mediator (0-1, default: 0.8) */
  mediatorAutoProceedThreshold?: number;
}

// Note: LoopReference is imported from ./loop/reference-loader.ts

interface LoopIterationResult {
  iteration: number;
  latencyMs: number;
  status: LoopStatus;
  goalStatus: LoopGoalStatus;
  goalEvidence: string;
  verification?: LoopVerificationResult;
  citations: string[];
  validationErrors: string[];
  output: string;
}

/**
 * 十分条件の評価結果
 * self-reflectionスキルの「自己改善の十分条件」に基づく
 */
interface SufficiencyAssessment {
  /** 変動の安定性: 直近N回のイテレーションで出力が安定しているか */
  outputStability: boolean;
  /** 限界的効用: さらなる改善のコストが効果を上回る可能性 */
  diminishingReturns: boolean;
  /** 安定した連続イテレーション数 */
  stableIterationCount: number;
  /** 評価の根拠 */
  assessmentReason: string;
  /** 全体的な「十分」判定（参考情報、停止条件ではない） */
  overallSufficient: boolean;
}

interface LoopRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  task: string;
  completed: boolean;
  stopReason: "model_done" | "max_iterations" | "stagnation" | "iteration_error";
  iterationCount: number;
  maxIterations: number;
  referenceCount: number;
  goal?: string;
  verificationCommand?: string;
  verificationTimeoutMs?: number;
  lastGoalStatus?: LoopGoalStatus;
  lastVerificationPassed?: boolean;
  model: {
    provider: string;
    id: string;
    thinkingLevel: ThinkingLevel;
  };
  config: LoopConfig;
  logFile: string;
  summaryFile: string;
  finalPreview: string;
  /** Intent classification result (if semantic stagnation enabled) */
  intentClassification?: {
    intent: TaskIntent;
    confidence: number;
  };
  /** Semantic stagnation detection summary */
  semanticStagnation?: {
    detected: boolean;
    averageSimilarity: number;
    method: "embedding" | "exact" | "unavailable";
  };
  /** Mediator phase result (if mediator enabled) */
  mediator?: {
    status: string;
    confidence: number;
    interpretation: string;
    gapCount: number;
    processingTimeMs: number;
    taskClarified: boolean;
  };
  /** Sufficiency assessment based on self-reflection skill criteria */
  sufficiencyAssessment?: SufficiencyAssessment;
  /** Trajectory reduction statistics */
  trajectoryReduction?: ReductionStats;
}

interface LoopRunOutput {
  summary: LoopRunSummary;
  finalOutput: string;
  iterations: LoopIterationResult[];
  totalPromptChars: number;
  promptStackSummary: PromptStackBenchmarkSummary;
  runtimeNotificationCount: number;
}

interface LoopRunInput {
  task: string;
  goal?: string;
  verificationCommand?: string;
  config: LoopConfig;
  references: LoopReference[];
  model: {
    provider: string;
    id: string;
    thinkingLevel: ThinkingLevel;
  };
  cwd: string;
  replaySnapshot?: TurnExecutionSnapshot;
  signal?: AbortSignal;
  onProgress?: (progress: LoopProgress) => void;
}

interface LoopProgress {
  type: "run_start" | "iteration_start" | "iteration_done" | "run_done";
  iteration?: number;
  maxIterations: number;
  status?: LoopStatus;
  latencyMs?: number;
  validationErrors?: string[];
  taskPreview?: string;
  focusPreview?: string;
  commandPreview?: string;
  summaryPreview?: string;
}

export interface ParsedLoopCommand {
  mode: "help" | "status" | "run";
  task: string;
  goal?: string;
  verifyCommand?: string;
  refs: string[];
  refsFile?: string;
  configOverrides: Partial<LoopConfig>;
  error?: string;
}

// Note: LoadedReferenceResult is imported from ./loop/reference-loader.ts

interface LoopActivityIndicator {
  updateFromProgress: (progress: LoopProgress) => void;
  stop: () => void;
}

// Note: LoopVerificationResult is imported from ./loop/verification.ts

const STABLE_LOOP_PROFILE = true;

// アイドルタイムアウト方式（pi-print-executor.ts）を使用
// タイムアウトは「無応答時間」を意味し、LLMが応答し続けている限り継続
const DEFAULT_CONFIG: LoopConfig = {
  maxIterations: STABLE_LOOP_PROFILE ? 4 : 6,
  timeoutMs: STABLE_LOOP_PROFILE ? 60_000 : 120_000,  // 1分 / 2分のアイドルタイムアウト
  requireCitation: true,
  verificationTimeoutMs: STABLE_LOOP_PROFILE ? 60_000 : 120_000,
  enableSemanticStagnation: false,  // Opt-in feature
  semanticRepetitionThreshold: 0.85,
  enableMediator: false,  // Opt-in feature (training-free intent clarification)
  mediatorAutoProceedThreshold: 0.8,
};

const LIMITS = {
  minIterations: 1,
  maxIterations: STABLE_LOOP_PROFILE ? 16 : 48,
  minTimeoutMs: 10_000,
  maxTimeoutMs: 600_000,
  minVerificationTimeoutMs: 1_000,
  maxVerificationTimeoutMs: 120_000,
  maxReferences: 24,
  maxReferenceCharsPerItem: 8_000,
  maxReferenceCharsTotal: 30_000,
  maxPreviousOutputChars: 9_000,
  maxValidationFeedbackItems: 4,
  maxValidationFeedbackCharsPerItem: 180,
  stableRepeatThreshold: 1,
  maxConsecutiveFailures: 2,
  minSemanticRepetitionThreshold: 0.7,
  maxSemanticRepetitionThreshold: 0.95,
};

const LOOP_SPINNER_FRAMES = ["|", "/", "-", "\\"];

const LOOP_HELP = [
  "loop command usage:",
  "  /loop run [--max <n>] [--timeout <ms>] [--goal <text>] [--verify <command>] [--verify-timeout <ms>] [--ref <path|url|text>] [--refs-file <file>] [--require-citation|--no-require-citation] <task>",
  "  /loop status",
  "  /loop help",
  "",
  "examples:",
  "  /loop run --max 8 --ref ./docs/paper-notes.md Build a robust parser and stop when all tests pass.",
  "  /loop run --goal \"all tests pass\" --verify \"npm test\" --verify-timeout 90000 Implement parser updates.",
  "  /loop run --ref https://arxiv.org/abs/2501.00001 --ref ./notes/constraints.md Write a summary with citations.",
  "  /loop status",
  "",
  "notes:",
  "  - References are injected as [R1], [R2], ... and the model is asked to cite them inline.",
  "  - Use --goal for explicit completion criteria. Use --verify with a deterministic check command.",
  "  - Default timeout is 120000ms per iteration in stable profile. Use --timeout to increase.",
  "  - Verification is allowlist-based by default. Add custom prefixes via PI_LOOP_VERIFY_ALLOWLIST_ADDITIONAL.",
  "  - Iteration timeouts are recorded and retried. Repeated failures stop the run safely.",
  "  - Logs are written to .pi/agent-loop/<run-id>.jsonl.",
  "  - A summary is saved to .pi/agent-loop/latest-summary.json.",
].join("\n");

let lastRunSummary: LoopRunSummary | null = null;

/**
 * ループ機能を拡張する
 * @summary ループ拡張を登録
 * @param pi - 拡張API
 * @returns void
 */

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

/**
 * テスト用のリセット関数
 * @summary isInitializedフラグをリセット
 */
export function resetForTesting(): void {
  isInitialized = false;
}

export default function registerLoopExtension(pi: ExtensionAPI) {
  if (isInitialized) return;
  isInitialized = true;

  pi.registerTool({
    name: "loop_run",
    label: "Loop Run",
    description:
      "Run an autonomous iteration loop for a task, optionally with explicit goal criteria and verification command checks.",
    parameters: Type.Object({
      task: Type.String({
        description: "Task to execute in iterative loop mode",
      }),
      maxIterations: createBoundedOptionalNumberSchema(
        "最大イテレーション回数",
        LIMITS.minIterations,
        LIMITS.maxIterations,
      ),
      timeoutMs: createBoundedOptionalNumberSchema(
        "各イテレーションのモデル呼び出しタイムアウト（ms）",
        LIMITS.minTimeoutMs,
        LIMITS.maxTimeoutMs,
      ),
      verificationTimeoutMs: createBoundedOptionalNumberSchema(
        "検証コマンドのタイムアウト（ms）",
        LIMITS.minVerificationTimeoutMs,
        LIMITS.maxVerificationTimeoutMs,
      ),
      requireCitation: Type.Optional(
        Type.Boolean({
          description: "Require [R#] citations when references are provided",
        }),
      ),
      goal: Type.Optional(
        Type.String({
          description: "Clear completion criteria that must be satisfied before STATUS: done",
        }),
      ),
      verifyCommand: Type.Optional(
        Type.String({
          description: "Optional deterministic verification command (e.g. `npm test`)",
        }),
      ),
      references: Type.Optional(
        Type.Array(Type.String(), {
          description: "Reference specs. Each item can be a file path, URL, or inline text.",
        }),
      ),
      refsFile: Type.Optional(
        Type.String({
          description: "Optional file containing one reference spec per line",
        }),
      ),
      enableSemanticStagnation: Type.Optional(
        Type.Boolean({
          description: "Enable semantic-based stagnation detection using embeddings (requires OPENAI_API_KEY). Based on 'Agentic Search in the Wild' paper findings.",
        }),
      ),
      semanticRepetitionThreshold: createBoundedOptionalNumberSchema(
        "意味的反復検知の閾値",
        LIMITS.minSemanticRepetitionThreshold,
        LIMITS.maxSemanticRepetitionThreshold,
      ),
      enableMediator: Type.Optional(
        Type.Boolean({
          description: "Enable Mediator layer for intent clarification before loop execution (arXiv:2602.07338v1). Training-free intent reconstruction.",
        }),
      ),
      mediatorAutoProceedThreshold: Type.Optional(
        Type.Number({
          description: "Auto-proceed threshold for Mediator (0-1, default: 0.8). Lower values trigger more clarification.",
          minimum: 0.5,
          maximum: 1.0,
        }),
      ),
      ulTaskId: Type.Optional(Type.String({ description: "UL workflow task ID. If provided, checks ownership before execution." })),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      // ULワークフロー所有権チェック
      if (params.ulTaskId) {
        const ownership = checkUlWorkflowOwnership(params.ulTaskId);
        if (!ownership.owned) {
          return {
            content: [{ type: "text" as const, text: `loop_run error: UL workflow ${params.ulTaskId} is owned by another instance (${ownership.ownerInstanceId}).` }],
            details: {
              error: "ul_workflow_not_owned",
              ulTaskId: params.ulTaskId,
              ownerInstanceId: ownership.ownerInstanceId,
              ownerPid: ownership.ownerPid,
              outcomeCode: "NONRETRYABLE_FAILURE" as RunOutcomeCode,
              retryRecommended: false,
            },
          };
        }
      }

      const task = String(params.task ?? "").trim();
      if (!task) {
        return {
          content: [{ type: "text" as const, text: "loop_run error: task is required." }],
          details: { error: "missing_task" },
        };
      }

      if (!ctx.model) {
        return {
          content: [{ type: "text" as const, text: "loop_run error: no active model." }],
          details: { error: "missing_model" },
        };
      }

      const preflight = runLongRunningPreflight(ctx.cwd);
      if (!preflight.ok) {
        return {
          content: [{ type: "text" as const, text: `loop_run blocked by long-running preflight: ${preflight.blockers.join(" | ")}` }],
          details: {
            error: "long_running_preflight_blocked",
            preflight,
          },
        };
      }

      const normalized = normalizeLoopConfig({
        maxIterations: params.maxIterations,
        timeoutMs: params.timeoutMs,
        verificationTimeoutMs: params.verificationTimeoutMs,
        requireCitation: params.requireCitation,
        enableSemanticStagnation: params.enableSemanticStagnation,
        semanticRepetitionThreshold: params.semanticRepetitionThreshold,
        enableMediator: params.enableMediator,
        mediatorAutoProceedThreshold: params.mediatorAutoProceedThreshold,
      });

      if (!normalized.ok) {
        return {
          content: [{ type: "text" as const, text: `loop_run config error: ${normalized.error}` }],
          details: { error: normalized.error },
        };
      }

      const loadedReferences = await loadReferences(
        {
          refs: Array.isArray(params.references) ? params.references : [],
          refsFile: typeof params.refsFile === "string" ? params.refsFile : undefined,
          cwd: ctx.cwd,
        },
        signal,
      );

      const thinkingLevel = (pi.getThinkingLevel() || "off") as ThinkingLevel;
      const indicator = startLoopActivityIndicator(ctx, normalized.config.maxIterations);

      logger.startOperation("loop_run" as OperationType, task.slice(0, 60), {
        task: params.task,
        params: {
          maxIterations: normalized.config.maxIterations,
          timeoutMs: normalized.config.timeoutMs,
          goal: params.goal,
          verificationCommand: params.verifyCommand,
          referenceCount: loadedReferences.references.length,
        },
      });

      try {
        const goal = normalizeOptionalText(params.goal);
        const verificationCommand = normalizeOptionalText(params.verifyCommand);
        const run = await runLoop({
          task,
          goal,
          verificationCommand,
          config: normalized.config,
          references: loadedReferences.references,
          model: {
            provider: ctx.model.provider,
            id: ctx.model.id,
            thinkingLevel,
          },
          cwd: ctx.cwd,
          signal,
          onProgress: (progress) => {
            indicator.updateFromProgress(progress);
            onUpdate?.({
              content: [{ type: "text" as const, text: formatLoopProgress(progress) }],
              details: {},
            });
          },
        });

        lastRunSummary = run.summary;
        pi.appendEntry("loop-last-run", run.summary);

        logger.endOperation({
          status: run.summary.completed ? "success" : "partial",
          tokensUsed: 0,
          outputLength: run.finalOutput.length,
          childOperations: run.iterations.length,
          toolCalls: 0,
        });

        const text = formatLoopResultText(run.summary, run.finalOutput, loadedReferences.warnings);
        const benchmarkRun = createLoopBenchmarkRun({
          provider: ctx.model.provider,
          model: ctx.model.id,
          task,
          completed: run.summary.completed,
          iterations: run.iterations.length,
          verificationFailures: run.iterations.filter(
            (item) => item.verification && item.verification.passed === false,
          ).length,
          emptyOutputs: run.iterations.filter((item) => item.output.trim().length === 0).length,
          promptChars: run.totalPromptChars,
          promptStackSummary: run.promptStackSummary,
          runtimeNotificationCount: run.runtimeNotificationCount,
        });
        try {
          recordAgentBenchmarkRun(ctx.cwd, benchmarkRun);
        } catch {
          // benchmark 保存失敗は本体処理を止めない
        }
        return {
          content: [{ type: "text" as const, text }],
          details: {
            summary: run.summary,
            iterations: run.iterations,
            finalOutput: run.finalOutput,
            references: loadedReferences.references.map((item) => ({
              id: item.id,
              source: item.source,
              title: item.title,
            })),
            referenceWarnings: loadedReferences.warnings,
            benchmarkRun,
          },
        };
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        logger.endOperation({
          status: "failure",
          tokensUsed: 0,
          outputLength: 0,
          childOperations: 0,
          toolCalls: 0,
          error: {
            type: "loop_error",
            message,
            stack: error instanceof Error ? error.stack || "" : "",
          },
        });
        return {
          content: [{ type: "text" as const, text: `loop_run failed: ${message}` }],
          details: { error: message },
        };
      } finally {
        indicator.stop();
      }
    },

    renderCall(args, theme) {
      const task = typeof args.task === "string" ? args.task.trim() : "";
      const preview = task.length > 48 ? `${task.slice(0, 48)}...` : task || "(no task)";
      return new Text(theme.bold("loop_run ") + theme.fg("muted", preview), 0, 0);
    },

    renderResult(result, _options, theme) {
      interface LoopResultWithSummary {
        details?: { summary?: LoopRunSummary };
      }
      function hasLoopDetails(value: unknown): value is LoopResultWithSummary {
        return typeof value === "object" && value !== null && "details" in value;
      }
      const summary = hasLoopDetails(result) ? result.details?.summary : undefined;
      if (!summary) {
        return new Text(theme.fg("warning", "loop result unavailable"), 0, 0);
      }
      const head = summary.completed ? theme.fg("success", "loop done ") : theme.fg("warning", "loop stopped ");
      const body = theme.fg(
        "accent",
        `${summary.iterationCount}/${summary.maxIterations} iterations`,
      );
      return new Text(head + body, 0, 0);
    },
  });

  pi.registerTool({
    name: "loop_inspect_run",
    label: "Loop Inspect Run",
    description: "Load persisted turn execution snapshots for a loop run summary.",
    parameters: Type.Object({
      summaryFile: Type.Optional(Type.String({ description: "Loop summary file path. Uses latest-summary.json when omitted." })),
      iteration: Type.Optional(Type.Number({ description: "Optional iteration number to inspect." })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const summaryFile = typeof params.summaryFile === "string" && params.summaryFile.trim()
        ? params.summaryFile.trim()
        : join(ctx.cwd, ".pi", "agent-loop", "latest-summary.json");
      const entries = loadLoopTurnContextSnapshots(summaryFile);
      const requestedIteration = Number.isFinite(Number(params.iteration)) ? Math.trunc(Number(params.iteration)) : undefined;
      const selected = requestedIteration
        ? entries.find((entry) => entry.iteration === requestedIteration)
        : entries[entries.length - 1];

      if (!selected) {
        throw new Error(`loop iteration snapshot not found: iteration=${requestedIteration}`);
      }

      return {
        content: [{ type: "text" as const, text: formatTurnExecutionSnapshot(selected.snapshot) }],
        details: {
          summaryFile,
          iteration: selected.iteration,
          snapshot: selected.snapshot,
          availableIterations: entries.map((entry) => entry.iteration),
        },
      };
    },
  });

  pi.registerTool({
    name: "loop_replay_run",
    label: "Loop Replay Run",
    description: "Replay a persisted loop run from its summary. Use prepareOnly to inspect reconstructed input without executing.",
    parameters: Type.Object({
      summaryFile: Type.Optional(Type.String({ description: "Loop summary file path. Uses latest-summary.json when omitted." })),
      prepareOnly: Type.Optional(Type.Boolean({ description: "Only reconstruct replay input without executing." })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const summaryFile = typeof params.summaryFile === "string" && params.summaryFile.trim()
        ? params.summaryFile.trim()
        : join(ctx.cwd, ".pi", "agent-loop", "latest-summary.json");
      const replay = loadLoopReplayInput(summaryFile);
      const latestSnapshot = replay.snapshots[replay.snapshots.length - 1];

      if (!replay.summary.task || !replay.summary.config) {
        throw new Error("loop replay artifact is missing task or config");
      }

      if (params.prepareOnly === true) {
        return {
          content: [{
            type: "text" as const,
            text: [
              "Loop Replay Input:",
              `Task: ${replay.summary.task}`,
              `Goal: ${replay.summary.goal ?? "(none)"}`,
              `Verification: ${replay.summary.verificationCommand ?? "(none)"}`,
              `References: ${replay.references.length}`,
              "",
              latestSnapshot ? formatTurnExecutionSnapshot(latestSnapshot.snapshot) : "No snapshot available.",
            ].join("\n"),
          }],
          details: {
            summaryFile,
            replay,
            prepared: true,
          },
        };
      }

      if (!ctx.model) {
        return {
          content: [{ type: "text" as const, text: "loop_replay_run error: no active model." }],
          details: { error: "missing_model" },
        };
      }

      const normalized = normalizeLoopConfig(replay.summary.config as Partial<LoopConfig>);
      if (!normalized.ok) {
        return {
          content: [{ type: "text" as const, text: `loop_replay_run config error: ${normalized.error}` }],
          details: { error: normalized.error },
        };
      }

      const references = replay.references
        .filter((item) => typeof item.source === "string" && item.source.trim().length > 0)
        .map((item, index) => ({
          id: item.id ?? `R${index + 1}`,
          title: item.title ?? item.source!,
          source: item.source!,
          content: "",
        }));

      const run = await runLoop({
        task: replay.summary.task,
        goal: replay.summary.goal,
        verificationCommand: replay.summary.verificationCommand,
        config: normalized.config,
        references,
        model: {
          provider: ctx.model.provider,
          id: ctx.model.id,
          thinkingLevel: (pi.getThinkingLevel() || "off") as ThinkingLevel,
        },
        cwd: latestSnapshot?.snapshot.workspace.cwd || ctx.cwd,
        replaySnapshot: latestSnapshot?.snapshot,
        signal,
      });

      return {
        content: [{ type: "text" as const, text: formatLoopResultText(run.summary, run.finalOutput, []) }],
        details: {
          replayedFrom: summaryFile,
          originalRunId: replay.summary.runId,
          summary: run.summary,
        },
      };
    },
  });

  pi.registerCommand("loop", {
    description: "Run autonomous loop execution with optional references",
    handler: async (args, ctx) => {
      const parsed = parseLoopCommand(args);
      if (parsed.mode === "help") {
        pi.sendMessage({
          customType: "loop-help",
          content: LOOP_HELP,
          display: true,
        });
        return;
      }

      if (parsed.error) {
        logger.recordCommandError("loop", parsed.error, args);
        pi.sendMessage({
          customType: "loop-arg-error",
          content: `loop argument error: ${parsed.error}\n\n${LOOP_HELP}`,
          display: true,
        });
        return;
      }

      if (parsed.mode === "status") {
        const summary = lastRunSummary ?? readLatestSummary(ctx.cwd);
        if (!summary) {
          ctx.ui.notify("No loop run summary found yet.", "warning");
          return;
        }
        pi.sendMessage({
          customType: "loop-status",
          content: formatLoopSummary(summary),
          display: true,
          details: { summary },
        });
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("loop failed: no active model", "error");
        return;
      }

      const preflight = runLongRunningPreflight(ctx.cwd);
      if (!preflight.ok) {
        ctx.ui.notify(`loop blocked by long-running preflight: ${preflight.blockers.join(" | ")}`, "warning");
        return;
      }

      const normalized = normalizeLoopConfig(parsed.configOverrides);
      if (!normalized.ok) {
        pi.sendMessage({
          customType: "loop-config-error",
          content: `loop config error: ${normalized.error}\n\n${LOOP_HELP}`,
          display: true,
        });
        return;
      }

      const loadedReferences = await loadReferences(
        {
          refs: parsed.refs,
          refsFile: parsed.refsFile,
          cwd: ctx.cwd,
        },
        undefined,
      );

      const thinkingLevel = (pi.getThinkingLevel() || "off") as ThinkingLevel;
      const indicator = startLoopActivityIndicator(ctx, normalized.config.maxIterations);

      try {
        const run = await runLoop({
          task: parsed.task,
          goal: parsed.goal,
          verificationCommand: parsed.verifyCommand,
          config: normalized.config,
          references: loadedReferences.references,
          model: {
            provider: ctx.model.provider,
            id: ctx.model.id,
            thinkingLevel,
          },
          cwd: ctx.cwd,
          onProgress: (progress) => {
            indicator.updateFromProgress(progress);
            const shouldNotify =
              progress.type === "run_start" ||
              progress.type === "iteration_start" ||
              progress.type === "iteration_done" ||
              progress.type === "run_done";
            if (shouldNotify) {
              ctx.ui.notify(formatLoopProgress(progress), "info");
            }
          },
        });

        lastRunSummary = run.summary;
        pi.appendEntry("loop-last-run", run.summary);

        pi.sendMessage({
          customType: "loop-result",
          content: formatLoopResultText(run.summary, run.finalOutput, loadedReferences.warnings),
          display: true,
          details: {
            summary: run.summary,
            references: loadedReferences.references.map((item) => ({
              id: item.id,
              source: item.source,
              title: item.title,
            })),
            referenceWarnings: loadedReferences.warnings,
            benchmarkRun: (() => {
              const runRecord = createLoopBenchmarkRun({
                provider: ctx.model.provider,
                model: ctx.model.id,
                task: parsed.task,
              completed: run.summary.completed,
              iterations: run.iterations.length,
              verificationFailures: run.iterations.filter(
                (item) => item.verification && item.verification.passed === false,
              ).length,
              emptyOutputs: run.iterations.filter((item) => item.output.trim().length === 0).length,
              promptChars: run.totalPromptChars,
              promptStackSummary: run.promptStackSummary,
              runtimeNotificationCount: run.runtimeNotificationCount,
              });
              try {
                recordAgentBenchmarkRun(ctx.cwd, runRecord);
              } catch {
                // benchmark 保存失敗は本体処理を止めない
              }
              return runRecord;
            })(),
          },
        });
        ctx.ui.notify("Loop run completed", "info");
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        pi.sendMessage({
          customType: "loop-error",
          content: `loop failed: ${message}`,
          display: true,
        });
        ctx.ui.notify("Loop run failed. Check message for details.", "error");
      } finally {
        indicator.stop();
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getEntries().slice().reverse()) {
      if (entry.type === "custom" && entry.customType === "loop-last-run") {
        lastRunSummary = entry.data as LoopRunSummary;
        break;
      }
    }
    ctx.ui.notify("Loop extension loaded (/loop, loop_run)", "info");
  });

  // セッション終了時にリスナー重複登録防止フラグをリセット
  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}

async function runLoop(input: LoopRunInput): Promise<LoopRunOutput> {
  // Persist every run so a later /loop status can inspect what happened.
  const runId = createRunId();
  const runDir = join(input.cwd, ".pi", "agent-loop");
  mkdirSync(runDir, { recursive: true });

  const logFile = join(runDir, `${runId}.jsonl`);
  const summaryFile = join(runDir, `${runId}.summary.json`);
  const latestSummaryFile = join(runDir, "latest-summary.json");

  const startedAt = new Date().toISOString();
  const iterations: LoopIterationResult[] = [];

  appendJsonl(logFile, {
    type: "run_start",
    runId,
    startedAt,
    task: input.task,
    goal: input.goal,
    verificationCommand: input.verificationCommand,
    config: input.config,
    model: input.model,
    referenceCount: input.references.length,
  });
  recordLongRunningEvent(input.cwd, {
    type: "loop_run",
    summary: `loop run started: ${toPreview(input.task, 120)}`,
    success: true,
    details: {
      runId,
      maxIterations: input.config.maxIterations,
      goal: input.goal,
      verificationCommand: input.verificationCommand,
    },
  });

  input.onProgress?.({
    type: "run_start",
    maxIterations: input.config.maxIterations,
    taskPreview: toPreview(input.task, 120),
    commandPreview: buildLoopCommandPreview(input.model),
  });

  // Mediator phase: Clarify intent before starting iterations (arXiv:2602.07338v1)
  let clarifiedTask = input.task;
  let mediatorResult: {
    status: string;
    confidence: number;
    interpretation: string;
    gapCount: number;
    processingTimeMs: number;
  } | undefined;

  if (input.config.enableMediator) {
    try {
      const { runMediatorPhase } = await import("../lib/mediator-integration.js");
      const { createLlmCallFunction } = await import("../lib/mediator-integration.js");
      
      // Create LLM call function from loop's model
      const llmCall = createLlmCallFunction(async (prompt: string, timeoutMs: number) => {
        return callModelViaPi(input.model, prompt, timeoutMs, input.signal);
      });

      const result = await runMediatorPhase(
        input.task,
        {
          enableMediator: true,
          autoProceedThreshold: input.config.mediatorAutoProceedThreshold ?? 0.8,
          maxClarificationRounds: 1,  // Single round for loop integration
          historyDir: join(input.cwd, ".pi", "memory"),
          debugMode: false,
        },
        llmCall,
        undefined  // No question tool in loop context
      );

      if (result.success) {
        clarifiedTask = result.clarifiedTask;
        mediatorResult = {
          status: result.mediatorOutput?.status ?? "unknown",
          confidence: result.mediatorOutput?.confidence ?? 0,
          interpretation: result.mediatorOutput?.interpretation ?? "",
          gapCount: result.mediatorOutput?.gaps.length ?? 0,
          processingTimeMs: result.processingTimeMs,
        };

        appendJsonl(logFile, {
          type: "mediator_phase",
          runId,
          originalTask: input.task,
          clarifiedTask,
          mediatorResult,
        });
      }
    } catch (error: unknown) {
      // Mediator failure should not block the loop
      const message = toErrorMessage(error);
      appendJsonl(logFile, {
        type: "mediator_error",
        runId,
        error: message,
      });
    }
  }

  let previousOutput = "";
  let repeatedCount = 0;
  let consecutiveFailures = 0;
  let completed = false;
  let stopReason: LoopRunSummary["stopReason"] = "max_iterations";
  let finalOutput = "";
  let validationFeedback: string[] = [];
  let totalPromptChars = 0;
  let totalRuntimeNotificationCount = 0;
  const promptStackSummaries: PromptStackBenchmarkSummary[] = [];
  const verificationPolicy = resolveVerificationPolicy();
  const liveBaselineTurnContext = buildTurnExecutionContext({
    cwd: input.cwd,
    startupKind: "baseline",
    isFirstTurn: true,
    previousContextAvailable: false,
    sessionElapsedMs: 0,
  });
  const baselineTurnContext = applyReplayToolConstraints(
    liveBaselineTurnContext,
    input.replaySnapshot,
  );
  const liveBaselineTurnDecisions = deriveTurnExecutionDecisions(baselineTurnContext, {
    taskKind: "loop",
    wantsCommandExecution: Boolean(input.verificationCommand),
    taskText: input.task,
  });
  const baselineTurnDecisions = applyReplayDecisionConstraints(
    liveBaselineTurnDecisions,
    input.replaySnapshot,
  );
  const effectiveMaxIterations = Math.min(
    input.config.maxIterations,
    baselineTurnDecisions.maxLoopIterations,
  );

  if (effectiveMaxIterations < input.config.maxIterations) {
    appendJsonl(logFile, {
      type: "turn_policy_cap",
      runId,
      requestedMaxIterations: input.config.maxIterations,
      effectiveMaxIterations,
      policyProfile: baselineTurnContext.policy.profile,
      policyMode: baselineTurnContext.policy.mode,
    });
  }

  // Intent classification for intent-aware resource allocation
  let intentClassification: IntentClassificationResult | undefined;
  if (input.config.enableSemanticStagnation) {
    intentClassification = classifyIntent({
      task: clarifiedTask,  // Use clarified task
      goal: input.goal,
      referenceCount: input.references.length,
    });
  }

  // Load relevant patterns from past executions for memory-guided execution
  let relevantPatterns: RelevantPattern[] = [];
  try {
    const rawPatterns = findRelevantPatterns(input.cwd, clarifiedTask, 5);
    relevantPatterns = rawPatterns.map(p => ({
      patternType: p.patternType,
      taskType: p.taskType,
      description: p.description,
      agentOrTeam: p.agentOrTeam,
      confidence: p.confidence,
      keywords: p.keywords,
    }));
    
    if (relevantPatterns.length > 0) {
      appendJsonl(logFile, {
        type: "patterns_loaded",
        runId,
        patternCount: relevantPatterns.length,
        patternTypes: relevantPatterns.map(p => p.patternType),
      });
    }
  } catch (error: unknown) {
    // Pattern loading failure should not block the loop
    const message = toErrorMessage(error);
    appendJsonl(logFile, {
      type: "patterns_error",
      runId,
      error: message,
    });
  }

  // Track semantic stagnation statistics
  const semanticStagnationStats = {
    detected: false,
    method: "exact" as "embedding" | "exact" | "unavailable",
    similarities: [] as number[],
  };
  const turnSnapshots: Array<{
    iteration: number;
    snapshot: ReturnType<typeof createTurnExecutionSnapshot>;
  }> = [];

  // Trajectory Reduction: リデューサーを作成
  const trajectoryConfig: TrajectoryReductionConfig = {
    ...DEFAULT_TRAJECTORY_REDUCTION_CONFIG,
    enabled: true,  // loopでは常に有効
  };
  const callLLMForReduction = async (prompt: string, _model: string): Promise<string> => {
    // 実際のLLMを使用（TODO: 専用の安価なモデルを使用する設定を追加）
    return callModelViaPi(input.model, prompt, 30000, input.signal);
  };
  const trajectoryReducer = createTrajectoryReducer(runId, trajectoryConfig, callLLMForReduction);

  for (let iteration = 1; iteration <= effectiveMaxIterations; iteration++) {
    throwIfAborted(input.signal);

    // Show what this iteration is trying to do so users can follow progress.
    const focusPreview = buildIterationFocus(clarifiedTask, previousOutput, validationFeedback);

    input.onProgress?.({
      type: "iteration_start",
      iteration,
      maxIterations: effectiveMaxIterations,
      taskPreview: toPreview(clarifiedTask, 120),
      focusPreview: toPreview(focusPreview, 140),
    });

    // Each iteration gets the previous output and validation feedback.
    // On first iteration, also include relevant patterns from past executions.
    const liveTurnContext = buildTurnExecutionContext({
      cwd: input.cwd,
      startupKind: previousOutput.trim() ? "delta" : "baseline",
      isFirstTurn: iteration === 1,
      previousContextAvailable: Boolean(previousOutput.trim()),
      sessionElapsedMs: 0,
    });
    const turnContext = applyReplayToolConstraints(liveTurnContext, input.replaySnapshot);
    const liveTurnDecisions = deriveTurnExecutionDecisions(turnContext, {
      taskKind: "loop",
      wantsCommandExecution: Boolean(input.verificationCommand),
      taskText: clarifiedTask,
    });
    const turnDecisions = applyReplayDecisionConstraints(liveTurnDecisions, input.replaySnapshot);
    const turnSnapshot = createTurnExecutionSnapshot(turnContext, turnDecisions);
    turnSnapshots.push({
      iteration,
      snapshot: turnSnapshot,
    });

    const promptPackage = buildIterationPromptPackage({
      task: clarifiedTask,  // Use clarified task
      goal: input.goal,
      verificationCommand: input.verificationCommand,
      iteration,
      maxIterations: effectiveMaxIterations,
      references: input.references,
      previousOutput,
      validationFeedback,
      relevantPatterns: iteration === 1 ? relevantPatterns : undefined,  // Only on first iteration
      modelProvider: input.model.provider,
      modelId: input.model.id,
      turnContext,
    });
    const prompt = promptPackage.prompt;
    totalPromptChars += prompt.length;
    totalRuntimeNotificationCount += promptPackage.runtimeNotificationCount;
    promptStackSummaries.push(summarizePromptStackForBenchmark(promptPackage.entries));

    const started = Date.now();
    let output = "";
    let latencyMs = 0;
    let status: LoopStatus = "unknown";
    let goalStatus: LoopGoalStatus = input.goal ? "unknown" : "met";
    let goalEvidence = "";
    let verification: LoopVerificationResult | undefined;
    let citations: string[] = [];
    let validationErrors: string[] = [];
    let callFailed = false;
    let iterationSummary = "";

    try {
      // Compute model-specific timeout with thinking level adjustment
      const effectiveTimeoutMs = computeModelTimeoutMs(input.model.id, {
        userTimeoutMs: input.config.timeoutMs,
        thinkingLevel: input.model.thinkingLevel,
      });
      output = await callModelViaPi(input.model, prompt, effectiveTimeoutMs, input.signal);
      latencyMs = Date.now() - started;
      finalOutput = output;

      const parsedContract = parseLoopContract(output, Boolean(input.goal));
      status = parsedContract.status;
      goalStatus = parsedContract.goalStatus;
      goalEvidence = parsedContract.goalEvidence;
      citations = parsedContract.citations;
      iterationSummary = parsedContract.summary;
      validationErrors = [
        ...parsedContract.parseErrors,
        ...validateIteration({
          status,
          goal: input.goal,
          goalStatus,
          citations,
          referenceCount: input.references.length,
          requireCitation: input.config.requireCitation,
          confidenceScore: parsedContract.confidenceScore,
        }),
      ];

      if (
        input.verificationCommand &&
        turnDecisions.allowCommandExecution &&
        shouldRunVerificationCommand({
          iteration,
          maxIterations: effectiveMaxIterations,
          status,
          policy: verificationPolicy,
        })
      ) {
        verification = await runVerificationCommand({
          command: input.verificationCommand,
          cwd: input.cwd,
          timeoutMs: input.config.verificationTimeoutMs,
          signal: input.signal,
        });
        if (!verification.passed) {
          validationErrors.push(...buildVerificationValidationFeedback(verification));
        }
      } else if (input.verificationCommand && !turnDecisions.allowCommandExecution) {
        validationErrors.push("Verification skipped because command execution is blocked by the current autonomy mode.");
      }

      if (status === "done" && validationErrors.length > 0) {
        validationErrors = buildDoneDeclarationFeedback(validationErrors);
      }

      validationErrors = normalizeValidationFeedback(validationErrors);
      consecutiveFailures = 0;
    } catch (error: unknown) {
      latencyMs = Date.now() - started;
      callFailed = true;
      consecutiveFailures += 1;

      const message = toErrorMessage(error);
      const timeoutHint =
        /timed out/i.test(message)
          ? "Increase --timeout or reduce task/reference size."
          : "Retry with a smaller scoped task.";

      output = buildIterationFailureOutput(message);
      finalOutput = output;
      status = "unknown";
      goalStatus = input.goal ? "unknown" : "met";
      goalEvidence = "";
      verification = undefined;
      citations = [];
      iterationSummary = "iteration execution failed";
      validationErrors = normalizeValidationFeedback([
        `Iteration execution failed: ${message}`,
        timeoutHint,
      ]);

        appendJsonl(logFile, {
          type: "iteration_error",
          runId,
          iteration,
          turnContext: turnSnapshot,
          latencyMs,
          error: message,
        });
    }

    const iterationResult: LoopIterationResult = {
      iteration,
      latencyMs,
      status,
      goalStatus,
      goalEvidence,
      verification,
      citations,
      validationErrors,
      output,
    };
    iterations.push(iterationResult);

    // Trajectory Reduction: ステップを追加して圧縮処理
    const promptStep = messageToStep({ role: "user", content: prompt }, iteration * 2 - 1);
    const responseStep = messageToStep({ role: "assistant", content: output }, iteration * 2);
    trajectoryReducer.addStep(promptStep);
    trajectoryReducer.addStep(responseStep);
    
    // 圧縮処理を実行（stepsAfter=2なので、2ステップ前を圧縮）
    try {
      const reductionResult = await trajectoryReducer.afterStepExecution(iteration * 2);
      if (reductionResult) {
        appendJsonl(logFile, {
          type: "trajectory_reduction",
          runId,
          iteration,
          targetStep: iteration * 2 - 3,  // 圧縮対象ステップ
          tokensSaved: reductionResult.tokensSaved,
          reductionRatio: reductionResult.reductionRatio,
          wasteTypes: reductionResult.wasteTypes,
        });
      }
    } catch (error: unknown) {
      // 圧縮エラーはループをブロックしない
      const message = toErrorMessage(error);
      appendJsonl(logFile, {
        type: "trajectory_reduction_error",
        runId,
        iteration,
        error: message,
      });
    }

    appendJsonl(logFile, {
      type: "iteration",
      runId,
      iteration,
      turnContext: turnSnapshot,
      latencyMs,
      status,
      goalStatus,
      goalEvidence,
      verification,
      citations,
      validationErrors,
      output,
    });
    recordLongRunningEvent(input.cwd, {
      type: "loop_iteration",
      summary: `loop iteration ${iteration} finished with ${status}`,
      success: !callFailed,
      details: {
        runId,
        iteration,
        status,
        goalStatus,
        validationErrors,
        verificationPassed: verification?.passed,
      },
    });

    input.onProgress?.({
      type: "iteration_done",
      iteration,
      maxIterations: effectiveMaxIterations,
      status,
      latencyMs,
      validationErrors,
      taskPreview: toPreview(input.task, 120),
      focusPreview: toPreview(focusPreview, 140),
      summaryPreview: toPreview(iterationSummary || extractSummaryLine(output), 140),
    });

    if (callFailed) {
      repeatedCount = 0;
    } else {
      // Check for stagnation using semantic or exact matching
      if (input.config.enableSemanticStagnation) {
        // Semantic-based detection (requires embedding provider configured via /embedding)
        const semanticThreshold = toBoundedFloat(
          input.config.semanticRepetitionThreshold ?? 0.85,
          0.85,
          LIMITS.minSemanticRepetitionThreshold,
          LIMITS.maxSemanticRepetitionThreshold,
          "semanticRepetitionThreshold",
        );
        const semanticResult = await detectSemanticRepetition(output, previousOutput, {
          threshold: semanticThreshold.ok ? semanticThreshold.value : 0.85,
          useEmbedding: true,
        });
        if (semanticResult.isRepeated) {
          repeatedCount += 1;
        } else {
          repeatedCount = 0;
        }
        // Track semantic detection stats
        semanticStagnationStats.method = semanticResult.method;
        semanticStagnationStats.similarities.push(semanticResult.similarity);
      } else {
        // Original exact matching
        const normalizedCurrent = normalizeLoopOutput(output);
        const normalizedPrev = normalizeLoopOutput(previousOutput);
        if (normalizedPrev && normalizedCurrent === normalizedPrev) {
          repeatedCount += 1;
        } else {
          repeatedCount = 0;
        }
      }
    }

    // "done" is only accepted when validation gates pass.
    if (status === "done" && validationErrors.length === 0) {
      completed = true;
      stopReason = "model_done";
      break;
    }

    if (consecutiveFailures >= LIMITS.maxConsecutiveFailures) {
      stopReason = "iteration_error";
      break;
    }

    // In deterministic-goal mode, keep iterating until maxIterations
    // even when output text repeats, because verification may still fail.
    const deterministicGoalMode = Boolean(input.goal || input.verificationCommand);
    
    // Apply intent-aware repetition tolerance if semantic stagnation is enabled
    // Paper insight: Different intents have different expected repetition rates
    // - Declarative: Higher tolerance (0.6) - repetition is expected in fact-finding
    // - Procedural: Medium tolerance (0.4) - sequential tasks may have valid repetition
    // - Reasoning: Low tolerance (0.3) - repetition likely indicates stuck reasoning
    let effectiveRepeatThreshold = LIMITS.stableRepeatThreshold;
    if (input.config.enableSemanticStagnation && intentClassification) {
      const budget = getIntentBudget(intentClassification.intent);
      // Higher tolerance allows more repetitions before stopping
      // Formula: base * (2 + tolerance) to create meaningful differentiation
      // - declarative (0.6): 1 * 2.6 = 3
      // - procedural (0.4): 1 * 2.4 = 2  
      // - reasoning (0.3): 1 * 2.3 = 2
      effectiveRepeatThreshold = Math.max(1, Math.round(LIMITS.stableRepeatThreshold * (2 + budget.repetitionTolerance)));
    }
    
    if (!deterministicGoalMode && repeatedCount >= effectiveRepeatThreshold) {
      stopReason = "stagnation";
      semanticStagnationStats.detected = true;
      break;
    }

    previousOutput = callFailed ? "" : output;
    validationFeedback = normalizeValidationFeedback(validationErrors);
  }

  const finishedAt = new Date().toISOString();
  const lastIteration = iterations[iterations.length - 1];
  
  // Calculate average similarity for semantic stagnation
  const averageSimilarity = semanticStagnationStats.similarities.length > 0
    ? semanticStagnationStats.similarities.reduce((a, b) => a + b, 0) / semanticStagnationStats.similarities.length
    : 0;

  // Assess sufficiency based on self-reflection skill criteria
  const sufficiencyAssessment = assessSufficiency(iterations, effectiveMaxIterations);

  const summary: LoopRunSummary = {
    runId,
    startedAt,
    finishedAt,
    task: input.task,
    completed,
    stopReason,
    iterationCount: iterations.length,
    maxIterations: effectiveMaxIterations,
    referenceCount: input.references.length,
    goal: input.goal,
    verificationCommand: input.verificationCommand,
    verificationTimeoutMs: input.verificationCommand ? input.config.verificationTimeoutMs : undefined,
    lastGoalStatus: lastIteration?.goalStatus,
    lastVerificationPassed: lastIteration?.verification?.passed,
    model: input.model,
    config: input.config,
    logFile,
    summaryFile,
    finalPreview: toPreview(extractLoopResultBody(finalOutput), 220),
    // Intent classification (if semantic stagnation enabled)
    intentClassification: intentClassification ? {
      intent: intentClassification.intent,
      confidence: intentClassification.confidence,
    } : undefined,
    // Semantic stagnation summary (if enabled)
    semanticStagnation: input.config.enableSemanticStagnation ? {
      detected: semanticStagnationStats.detected,
      averageSimilarity,
      method: semanticStagnationStats.method,
    } : undefined,
    // Mediator result (if enabled)
    mediator: mediatorResult ? {
      ...mediatorResult,
      taskClarified: clarifiedTask !== input.task,
    } : undefined,
    // Sufficiency assessment (always computed for user reference)
    sufficiencyAssessment,
    // Trajectory reduction statistics
    trajectoryReduction: trajectoryReducer.getStats(),
  };

  const summaryPayload = {
    summary,
    references: input.references.map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
    })),
    iterations: iterations.map((item) => ({
      iteration: item.iteration,
      latencyMs: item.latencyMs,
      status: item.status,
      goalStatus: item.goalStatus,
      goalEvidence: item.goalEvidence,
      verification: item.verification
        ? {
            passed: item.verification.passed,
            timedOut: item.verification.timedOut,
            exitCode: item.verification.exitCode,
            durationMs: item.verification.durationMs,
            error: item.verification.error,
            stdout: toPreview(item.verification.stdout, 180),
            stderr: toPreview(item.verification.stderr, 180),
          }
        : undefined,
      citations: item.citations,
      validationErrors: item.validationErrors,
      outputPreview: toPreview(item.output, 240),
    })),
    turnContexts: turnSnapshots,
  };

  const summaryPayloadText = JSON.stringify(summaryPayload, null, 2);
  atomicWriteTextFile(summaryFile, summaryPayloadText);
  writeLatestSummarySnapshot(latestSummaryFile, summaryPayloadText);

  appendJsonl(logFile, {
    type: "run_done",
    runId,
    finishedAt,
    summary,
  });
  recordLongRunningEvent(input.cwd, {
    type: "loop_run",
    summary: completed
      ? `loop run completed after ${iterations.length} iteration(s)`
      : `loop run stopped: ${stopReason}`,
    success: completed,
    details: {
      runId,
      completed,
      stopReason,
      iterationCount: iterations.length,
      lastGoalStatus: lastIteration?.goalStatus,
      lastVerificationPassed: lastIteration?.verification?.passed,
    },
  });

  input.onProgress?.({
    type: "run_done",
    maxIterations: effectiveMaxIterations,
  });

  return {
    summary,
    finalOutput,
    iterations,
    totalPromptChars,
    promptStackSummary: mergePromptStackBenchmarkSummaries(promptStackSummaries),
    runtimeNotificationCount: totalRuntimeNotificationCount,
  };
}

function normalizeLoopConfig(
  overrides: Partial<LoopConfig>,
): { ok: true; config: LoopConfig } | { ok: false; error: string } {
  const maxIterations = toBoundedInteger(
    overrides.maxIterations,
    DEFAULT_CONFIG.maxIterations,
    LIMITS.minIterations,
    LIMITS.maxIterations,
    "maxIterations",
  );
  if (!maxIterations.ok) return maxIterations;

  const timeoutMs = toBoundedInteger(
    overrides.timeoutMs,
    DEFAULT_CONFIG.timeoutMs,
    LIMITS.minTimeoutMs,
    LIMITS.maxTimeoutMs,
    "timeoutMs",
  );
  if (!timeoutMs.ok) return timeoutMs;

  const verificationTimeoutMs = toBoundedInteger(
    overrides.verificationTimeoutMs,
    DEFAULT_CONFIG.verificationTimeoutMs,
    LIMITS.minVerificationTimeoutMs,
    LIMITS.maxVerificationTimeoutMs,
    "verificationTimeoutMs",
  );
  if (!verificationTimeoutMs.ok) return verificationTimeoutMs;

  const requireCitation =
    overrides.requireCitation === undefined
      ? DEFAULT_CONFIG.requireCitation
      : Boolean(overrides.requireCitation);

  const enableSemanticStagnation =
    overrides.enableSemanticStagnation === undefined
      ? DEFAULT_CONFIG.enableSemanticStagnation
      : Boolean(overrides.enableSemanticStagnation);

  const semanticRepetitionThreshold = toBoundedFloat(
    overrides.semanticRepetitionThreshold,
    DEFAULT_CONFIG.semanticRepetitionThreshold ?? 0.85,
    LIMITS.minSemanticRepetitionThreshold,
    LIMITS.maxSemanticRepetitionThreshold,
    "semanticRepetitionThreshold",
  );
  // semanticRepetitionThreshold uses default on error (not critical)
  const thresholdValue = semanticRepetitionThreshold.ok
    ? semanticRepetitionThreshold.value
    : DEFAULT_CONFIG.semanticRepetitionThreshold ?? 0.85;

  // Mediator settings
  const enableMediator =
    overrides.enableMediator === undefined
      ? DEFAULT_CONFIG.enableMediator
      : Boolean(overrides.enableMediator);

  const mediatorAutoProceedThreshold = toBoundedFloat(
    overrides.mediatorAutoProceedThreshold,
    DEFAULT_CONFIG.mediatorAutoProceedThreshold ?? 0.8,
    0.5,
    1.0,
    "mediatorAutoProceedThreshold",
  );
  const mediatorThresholdValue = mediatorAutoProceedThreshold.ok
    ? mediatorAutoProceedThreshold.value
    : DEFAULT_CONFIG.mediatorAutoProceedThreshold ?? 0.8;

  return {
    ok: true,
    config: {
      maxIterations: maxIterations.value,
      timeoutMs: timeoutMs.value,
      requireCitation,
      verificationTimeoutMs: verificationTimeoutMs.value,
      enableSemanticStagnation,
      semanticRepetitionThreshold: thresholdValue,
      enableMediator,
      mediatorAutoProceedThreshold: mediatorThresholdValue,
    },
  };
}

export function parseLoopCommand(args: string | undefined): ParsedLoopCommand {
  const raw = (args ?? "").trim();
  if (!raw) {
    return {
      mode: "help",
      task: "",
      refs: [],
      configOverrides: {},
    };
  }

  const tokens = tokenizeArgs(raw);
  if (tokens.length === 0) {
    return {
      mode: "help",
      task: "",
      refs: [],
      configOverrides: {},
    };
  }

  let mode: ParsedLoopCommand["mode"] = "run";
  let cursor = 0;
  const head = tokens[0].toLowerCase();

  if (head === "help" || head === "--help" || head === "-h") {
    return {
      mode: "help",
      task: "",
      refs: [],
      configOverrides: {},
    };
  }

  if (head === "status") {
    mode = "status";
    cursor = 1;
  } else if (head === "run") {
    mode = "run";
    cursor = 1;
  }

  const refs: string[] = [];
  const configOverrides: Partial<LoopConfig> = {};
  let refsFile: string | undefined;
  let goal: string | undefined;
  let verifyCommand: string | undefined;
  const taskTokens: string[] = [];
  let forceTask = false;

  for (; cursor < tokens.length; cursor++) {
    const token = tokens[cursor];

    if (mode === "status") {
      if (token === "--help" || token === "-h" || token.toLowerCase() === "help") {
        return {
          mode: "help",
          task: "",
          refs: [],
          configOverrides: {},
        };
      }
      return {
        mode: "status",
        task: "",
        refs: [],
        configOverrides: {},
        error: "status does not take extra arguments",
      };
    }

    // "--" switches parser into pure task text mode.
    if (forceTask) {
      taskTokens.push(token);
      continue;
    }

    if (token === "--") {
      forceTask = true;
      continue;
    }

    if (token === "--help" || token === "-h") {
      return {
        mode: "help",
        task: "",
        refs: [],
        configOverrides: {},
      };
    }

    if (token === "--max" || token === "-n") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --max");
      configOverrides.maxIterations = Number(next);
      cursor += 1;
      continue;
    }
    if (token.startsWith("--max=")) {
      configOverrides.maxIterations = Number(token.slice("--max=".length));
      continue;
    }

    if (token === "--timeout") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --timeout");
      configOverrides.timeoutMs = Number(next);
      cursor += 1;
      continue;
    }
    if (token.startsWith("--timeout=")) {
      configOverrides.timeoutMs = Number(token.slice("--timeout=".length));
      continue;
    }

    if (token === "--verify-timeout") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --verify-timeout");
      configOverrides.verificationTimeoutMs = Number(next);
      cursor += 1;
      continue;
    }
    if (token.startsWith("--verify-timeout=")) {
      configOverrides.verificationTimeoutMs = Number(token.slice("--verify-timeout=".length));
      continue;
    }

    if (token === "--goal") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --goal");
      goal = next;
      cursor += 1;
      continue;
    }
    if (token.startsWith("--goal=")) {
      goal = token.slice("--goal=".length);
      continue;
    }

    if (token === "--verify") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --verify");
      verifyCommand = next;
      cursor += 1;
      continue;
    }
    if (token.startsWith("--verify=")) {
      verifyCommand = token.slice("--verify=".length);
      continue;
    }

    if (token === "--ref") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --ref");
      refs.push(next);
      cursor += 1;
      continue;
    }
    if (token.startsWith("--ref=")) {
      refs.push(token.slice("--ref=".length));
      continue;
    }

    if (token === "--refs-file") {
      const next = tokens[cursor + 1];
      if (!next) return withArgError("missing value for --refs-file");
      refsFile = next;
      cursor += 1;
      continue;
    }
    if (token.startsWith("--refs-file=")) {
      refsFile = token.slice("--refs-file=".length);
      continue;
    }

    if (token === "--require-citation") {
      configOverrides.requireCitation = true;
      continue;
    }

    if (token === "--no-require-citation") {
      configOverrides.requireCitation = false;
      continue;
    }

    taskTokens.push(token);
  }

  const task = taskTokens.join(" ").trim();
  if (!task) {
    return withArgError("task is required for /loop run");
  }

  return {
    mode: "run",
    task,
    goal: normalizeOptionalText(goal),
    verifyCommand: normalizeOptionalText(verifyCommand),
    refs,
    refsFile,
    configOverrides,
  };

  function withArgError(error: string): ParsedLoopCommand {
    return {
      mode: "run",
      task: "",
      goal: normalizeOptionalText(goal),
      verifyCommand: normalizeOptionalText(verifyCommand),
      refs,
      refsFile,
      configOverrides,
      error,
    };
  }
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (quote) {
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

async function callModelViaPi(
  model: { provider: string; id: string; thinkingLevel: ThinkingLevel },
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  return sharedCallModelViaPi({
    model: {
      provider: model.provider,
      id: model.id,
      thinkingLevel: model.thinkingLevel,
    },
    prompt,
    timeoutMs,
    signal,
    entityLabel: "loop",
  });
}

/**
 * BUG-TS-003修正: any型を適切な型定義に置き換え
 * @summary ループアクティビティインジケーターを開始
 * @param ctx - 拡張機能APIコンテキスト
 * @param maxIterations - 最大反復回数
 * @returns ループアクティビティインジケーター
 */
function startLoopActivityIndicator(ctx: ExtensionAPI["context"], maxIterations: number): LoopActivityIndicator {
  if (!ctx?.hasUI || !ctx?.ui) {
    return {
      updateFromProgress: () => {},
      stop: () => {},
    };
  }

  // BUG-TS-003修正: uiの型を明示的に定義
  const ui = ctx.ui;
  const statusKey = "loop-status";
  let label = `Loop running (max=${maxIterations})`;
  let frame = 0;
  let closed = false;

  const render = () => {
    if (closed) return;
    const glyph = LOOP_SPINNER_FRAMES[frame % LOOP_SPINNER_FRAMES.length];
    frame += 1;
    ui.setStatus?.(statusKey, `${glyph} ${label}`);
  };

  render();
  const interval = setInterval(render, 120);
  ui.setWorkingMessage?.("Loop running...");

  return {
    updateFromProgress(progress) {
      if (closed) return;

      if (progress.type === "iteration_start" && progress.iteration) {
        const focus = progress.focusPreview ? ` | ${toPreview(progress.focusPreview, 52)}` : "";
        label = `Loop iteration ${progress.iteration}/${progress.maxIterations}${focus}`;
        return;
      }

      if (progress.type === "iteration_done" && progress.iteration) {
        const state = progress.status ?? "unknown";
        const latency = progress.latencyMs ? formatDuration(progress.latencyMs) : "-";
        const summary = progress.summaryPreview ? ` | ${toPreview(progress.summaryPreview, 48)}` : "";
        label = `Loop iteration ${progress.iteration}/${progress.maxIterations} done (${state}, ${latency})${summary}`;
        return;
      }

      if (progress.type === "run_done") {
        label = "Loop finishing...";
      }
    },
    stop() {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      ui.setStatus?.(statusKey, undefined);
      ui.setWorkingMessage?.();
    },
  };
}

function formatLoopProgress(progress: LoopProgress): string {
  if (progress.type === "run_start") {
    const task = progress.taskPreview ? ` | task="${progress.taskPreview}"` : "";
    const command = progress.commandPreview ? ` | run=${progress.commandPreview}` : "";
    return `loop start: maxIterations=${progress.maxIterations}${task}${command}`;
  }

  if (progress.type === "iteration_start") {
    const focus = progress.focusPreview ? ` | focus="${progress.focusPreview}"` : "";
    return `loop iteration ${progress.iteration}/${progress.maxIterations} started${focus}`;
  }

  if (progress.type === "iteration_done") {
    const latency = progress.latencyMs ? formatDuration(progress.latencyMs) : "-";
    const status = progress.status ?? "unknown";
    const focus = progress.focusPreview ? ` | focus="${progress.focusPreview}"` : "";
    const summary = progress.summaryPreview ? ` | summary="${progress.summaryPreview}"` : "";
    const validation =
      progress.validationErrors && progress.validationErrors.length > 0
        ? ` | validation: ${progress.validationErrors.join(" ; ")}`
        : "";
    return `loop iteration ${progress.iteration}/${progress.maxIterations} done (${status}, ${latency})${focus}${summary}${validation}`;
  }

  return "loop done";
}

function formatLoopResultText(summary: LoopRunSummary, finalOutput: string, warnings: string[]): string {
  const resultBody = extractLoopResultBody(finalOutput);
  const warningLines = warnings.length > 0 ? [`Warnings:`, ...warnings.map((item) => `- ${item}`), ""] : [];
  const headline = summary.completed ? "Loop completed." : "Loop finished with warnings.";
  const deterministicLines: string[] = [];
  if (summary.goal) {
    deterministicLines.push(`Goal: ${summary.goal}`);
    deterministicLines.push(`Goal status: ${summary.lastGoalStatus ?? "unknown"}`);
  }
  if (summary.verificationCommand) {
    deterministicLines.push(`Verification command: ${summary.verificationCommand}`);
    deterministicLines.push(`Verification passed: ${summary.lastVerificationPassed ? "yes" : "no"}`);
  }
  // Mediator info
  const mediatorLines: string[] = [];
  if (summary.mediator) {
    mediatorLines.push(`Mediator: ${summary.mediator.status} (confidence: ${summary.mediator.confidence.toFixed(2)})`);
    if (summary.mediator.taskClarified) {
      mediatorLines.push(`Task clarified: yes`);
    }
  }

  // Sufficiency assessment info
  const sufficiencyLines: string[] = [];
  if (summary.sufficiencyAssessment) {
    const sa = summary.sufficiencyAssessment;
    sufficiencyLines.push("Sufficiency assessment:");
    sufficiencyLines.push(`  Overall sufficient: ${sa.overallSufficient ? "yes" : "no"}`);
    sufficiencyLines.push(`  Output stability: ${sa.outputStability ? "stable" : "unstable"} (${sa.stableIterationCount} consecutive)`);
    sufficiencyLines.push(`  Reason: ${sa.assessmentReason}`);
  }

  return [
    headline,
    `Run ID: ${summary.runId}`,
    `Task: ${summary.task}`,
    `Model: ${summary.model.provider}/${summary.model.id} (${summary.model.thinkingLevel})`,
    `Iterations: ${summary.iterationCount}/${summary.maxIterations}`,
    `Completed: ${summary.completed ? "yes" : "no"} (${summary.stopReason})`,
    `References: ${summary.referenceCount}`,
    ...deterministicLines,
    ...mediatorLines,
    ...sufficiencyLines,
    `Log: ${summary.logFile}`,
    `Summary: ${summary.summaryFile}`,
    "",
    ...warningLines,
    "Final output:",
    resultBody,
  ].join("\n");
}

function formatLoopSummary(summary: LoopRunSummary): string {
  const deterministicLines: string[] = [];
  if (summary.goal) {
    deterministicLines.push(`Goal: ${summary.goal}`);
    deterministicLines.push(`Goal status: ${summary.lastGoalStatus ?? "unknown"}`);
  }
  if (summary.verificationCommand) {
    deterministicLines.push(`Verification command: ${summary.verificationCommand}`);
    deterministicLines.push(`Verification passed: ${summary.lastVerificationPassed ? "yes" : "no"}`);
  }

  return [
    "Latest loop run:",
    `Run ID: ${summary.runId}`,
    `Task: ${summary.task}`,
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt}`,
    `Model: ${summary.model.provider}/${summary.model.id} (${summary.model.thinkingLevel})`,
    `Iterations: ${summary.iterationCount}/${summary.maxIterations}`,
    `Completed: ${summary.completed ? "yes" : "no"} (${summary.stopReason})`,
    `References: ${summary.referenceCount}`,
    ...deterministicLines,
    `Log: ${summary.logFile}`,
    `Summary: ${summary.summaryFile}`,
    `Final preview: ${summary.finalPreview}`,
  ].join("\n");
}

function readLatestSummary(cwd: string): LoopRunSummary | null {
  const path = join(cwd, ".pi", "agent-loop", "latest-summary.json");
  try {
    if (!existsSync(path)) return null;
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    const summary = parsed?.summary as LoopRunSummary | undefined;
    if (!summary?.runId) return null;
    return summary;
  } catch {
    return null;
  }
}

function writeLatestSummarySnapshot(path: string, payload: string): void {
  withFileLock(path, () => {
    atomicWriteTextFile(path, payload);
  });
}

function appendJsonl(path: string, value: unknown) {
  withFileLock(path, () => {
    appendFileSync(path, `${JSON.stringify(value)}\n`, "utf-8");
  });
}

/**
 * 十分条件を評価する
 * 
 * self-reflectionスキルの「自己改善の十分条件」に基づき、
 * ループの終了時に「十分」かどうかを評価する。
 * この評価は**参考情報**であり、停止条件としては使用されない。
 * ユーザーが判断するための情報を提供する。
 * 
 * @param iterations - ループのイテレーション結果
 * @param maxIterations - 最大イテレーション数
 * @returns 十分条件の評価結果
 */
function assessSufficiency(
  iterations: LoopIterationResult[],
  maxIterations: number
): SufficiencyAssessment {
  const SUFFICIENCY_CONFIG = {
    /** 安定と見なすための連続イテレーション数 */
    requiredStableIterations: 3,
    /** 出力が「変化なし」と見なす文字数の閾値 */
    outputStabilityThreshold: 100,
    /** 限界的効用が逆転したと見なすイテレーション数比率 */
    diminishingReturnRatio: 0.7,
  };

  // 1. 変動の安定性: 直近N回のイテレーションで出力が安定しているか
  let stableIterationCount = 0;
  let outputStability = false;
  
  if (iterations.length >= SUFFICIENCY_CONFIG.requiredStableIterations) {
    const recentOutputs = iterations
      .slice(-SUFFICIENCY_CONFIG.requiredStableIterations)
      .map((it) => normalizeLoopOutput(it.output));
    
    // すべての出力が類似しているかチェック
    const firstOutput = recentOutputs[0] || "";
    outputStability = recentOutputs.every(
      (output) => Math.abs(output.length - firstOutput.length) < SUFFICIENCY_CONFIG.outputStabilityThreshold
    );
    
    if (outputStability) {
      stableIterationCount = SUFFICIENCY_CONFIG.requiredStableIterations;
    }
  }

  // 2. 限界的効用の逆転: イテレーション数が閾値を超えているか
  const iterationRatio = iterations.length / maxIterations;
  const diminishingReturns = iterationRatio >= SUFFICIENCY_CONFIG.diminishingReturnRatio;

  // 3. 全体的な「十分」判定
  const reasons: string[] = [];
  
  if (outputStability) {
    reasons.push(`出力が${stableIterationCount}回連続で安定`);
  }
  if (diminishingReturns) {
    reasons.push(`イテレーション使用率${(iterationRatio * 100).toFixed(0)}%で限界的効用逆転の可能性`);
  }
  if (iterations.length >= maxIterations) {
    reasons.push("最大イテレーションに到達");
  }

  // ゴールステータスの傾向
  const recentGoalStatuses = iterations
    .slice(-3)
    .map((it) => it.goalStatus);
  const allRecentGoalsMet = recentGoalStatuses.every((s) => s === "met");
  if (allRecentGoalsMet && recentGoalStatuses.length > 0) {
    reasons.push("直近のゴール評価がすべてmet");
  }

  const overallSufficient = outputStability && (diminishingReturns || allRecentGoalsMet);

  const assessmentReason = reasons.length > 0
    ? reasons.join("; ")
    : "まだ十分条件が満たされていない";

  return {
    outputStability,
    diminishingReturns,
    stableIterationCount,
    assessmentReason,
    overallSufficient,
  };
}
