/**
 * @abdd.meta
 * path: .pi/extensions/loop.ts
 * role: ループ実行機能の拡張および検証・参照読み込みサブモジュールのエントリポイント
 * why: モデルの反復実行、引用チェック、検証コマンドの統合、再現可能な実行ログを実現するため
 * related: README.md, .pi/extensions/rsa.ts, .pi/extensions/question.ts
 * public_api: loadReferences, fetchTextFromUrl, runVerificationCommand, buildIterationPrompt, parseLoopContract
 * invariants: SSRF保護ルールによりプライベートIPやブロック済みホストへのアクセスは拒否される、検証ポリシーは環境変数またはデフォルト設定に基づいて解決される
 * side_effects: ファイルシステムへのログ書き込み、外部URLへのHTTPリクエスト、検証コマンドのプロセス起動
 * failure_modes: DNS解決の失敗、参照のロード失敗、検証コマンドの実行エラー、またはセマンティックな重複検出によるループ停止
 * @abdd.explain
 * overview: piエージェントのための自律的ループランナーを提供し、参照に基づく実行と検証プロセスを管理する
 * what_it_does:
 *   - 反復的なモデル実行プロセスを管理し、引用チェックを実施する
 *   - 外部参照をロードし、SSRF保護を適用して安全にURLからテキストを取得する
 *   - 環境変数に基づいて検証ポリシーを解決し、検証コマンドを実行またはスキップする
 *   - セマンティックな重複を検出し、ループの停止条件を判断する
 *   - 実行ログをファイルに出力し、プロセスの再現性を確保する
 * why_it_exists:
 *   - 反復タスクにおいて外部コンテキストとの整合性を検証しつつ進行する必要があるため
 *   - セキュリティ（SSRF対策）と検証の柔軟性を両立するため
 *   - 実行の進捗と結果を永続化し、デバッグや監査を可能にするため
 * scope:
 *   in: 拡張API、ユーザー定義のループ設定、環境変数（検証ポリシーなど）
 *   out: モデル呼び出しの実行、検証コマンドの実行結果、ログファイル、参照データの読み込み結果
 */

// File: .pi/extensions/loop.ts
// Description: Adds an autonomous loop runner with reference-grounded execution for pi.
// Why: Enables repeated model iterations with citation checks and reproducible run logs.
// Related: README.md, .pi/extensions/rsa.ts, .pi/extensions/question.ts

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

import { formatDuration } from "../lib/format-utils.js";
import { toErrorMessage } from "../lib/error-utils.js";
import { toBoundedInteger, toBoundedFloat } from "../lib/validation-utils.js";
import {
  truncateTextWithMarker,
  toPreview,
  normalizeOptionalText,
  throwIfAborted,
} from "../lib/text-utils.js";
import { ThinkingLevel } from "../lib/agent-types.js";
import { createRunId } from "../lib/agent-utils.js";
import { computeModelTimeoutMs } from "../lib/model-timeouts.js";
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
  type SemanticRepetitionResult,
} from "../lib/semantic-repetition";
import { atomicWriteTextFile, withFileLock } from "../lib/storage-lock";

import { callModelViaPi as sharedCallModelViaPi } from "./shared/pi-print-executor";

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
  VERIFICATION_ALLOWLIST_ENV,
  VERIFICATION_ALLOWLIST_ADDITIONAL_ENV,
  VERIFICATION_POLICY_ENV,
  VERIFICATION_POLICY_EVERY_N_ENV,
  DEFAULT_VERIFICATION_POLICY_MODE,
  DEFAULT_VERIFICATION_POLICY_EVERY_N,
  DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES,
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
  type ParsedLoopContract,
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
}

interface LoopRunOutput {
  summary: LoopRunSummary;
  finalOutput: string;
  iterations: LoopIterationResult[];
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

interface ParsedLoopCommand {
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
export default function registerLoopExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "loop_run",
    label: "Loop Run",
    description:
      "Run an autonomous iteration loop for a task, optionally with explicit goal criteria and verification command checks.",
    parameters: Type.Object({
      task: Type.String({
        description: "Task to execute in iterative loop mode",
      }),
      maxIterations: Type.Optional(
        Type.Number({
          description: "Maximum number of loop iterations",
          minimum: LIMITS.minIterations,
          maximum: LIMITS.maxIterations,
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({
          description: "Timeout per iteration model call in milliseconds",
          minimum: LIMITS.minTimeoutMs,
          maximum: LIMITS.maxTimeoutMs,
        }),
      ),
      verificationTimeoutMs: Type.Optional(
        Type.Number({
          description: "Timeout per verification command execution in milliseconds",
          minimum: LIMITS.minVerificationTimeoutMs,
          maximum: LIMITS.maxVerificationTimeoutMs,
        }),
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
      semanticRepetitionThreshold: Type.Optional(
        Type.Number({
          description: "Semantic similarity threshold for repetition detection (0.7-0.95, default: 0.85). Higher values require closer match.",
          minimum: LIMITS.minSemanticRepetitionThreshold,
          maximum: LIMITS.maxSemanticRepetitionThreshold,
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
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

      const normalized = normalizeLoopConfig({
        maxIterations: params.maxIterations,
        timeoutMs: params.timeoutMs,
        verificationTimeoutMs: params.verificationTimeoutMs,
        requireCitation: params.requireCitation,
        enableSemanticStagnation: params.enableSemanticStagnation,
        semanticRepetitionThreshold: params.semanticRepetitionThreshold,
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

      const _operationId = logger.startOperation("loop_run" as OperationType, task.slice(0, 60), {
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
          },
        };
      } catch (error) {
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
      const summary = (result as any)?.details?.summary as LoopRunSummary | undefined;
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
          },
        });
        ctx.ui.notify("Loop run completed", "success");
      } catch (error) {
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

  input.onProgress?.({
    type: "run_start",
    maxIterations: input.config.maxIterations,
    taskPreview: toPreview(input.task, 120),
    commandPreview: buildLoopCommandPreview(input.model),
  });

  let previousOutput = "";
  let repeatedCount = 0;
  let consecutiveFailures = 0;
  let completed = false;
  let stopReason: LoopRunSummary["stopReason"] = "max_iterations";
  let finalOutput = "";
  let validationFeedback: string[] = [];
  const verificationPolicy = resolveVerificationPolicy();

  // Intent classification for intent-aware resource allocation
  let intentClassification: IntentClassificationResult | undefined;
  if (input.config.enableSemanticStagnation) {
    intentClassification = classifyIntent({
      task: input.task,
      goal: input.goal,
      referenceCount: input.references.length,
    });
  }

  // Track semantic stagnation statistics
  const semanticStagnationStats = {
    detected: false,
    method: "exact" as "embedding" | "exact" | "unavailable",
    similarities: [] as number[],
  };

  for (let iteration = 1; iteration <= input.config.maxIterations; iteration++) {
    throwIfAborted(input.signal);

    // Show what this iteration is trying to do so users can follow progress.
    const focusPreview = buildIterationFocus(input.task, previousOutput, validationFeedback);

    input.onProgress?.({
      type: "iteration_start",
      iteration,
      maxIterations: input.config.maxIterations,
      taskPreview: toPreview(input.task, 120),
      focusPreview: toPreview(focusPreview, 140),
    });

    // Each iteration gets the previous output and validation feedback.
    const prompt = buildIterationPrompt({
      task: input.task,
      goal: input.goal,
      verificationCommand: input.verificationCommand,
      iteration,
      maxIterations: input.config.maxIterations,
      references: input.references,
      previousOutput,
      validationFeedback,
    });

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
        }),
      ];

      if (
        input.verificationCommand &&
        shouldRunVerificationCommand({
          iteration,
          maxIterations: input.config.maxIterations,
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
      }

      if (status === "done" && validationErrors.length > 0) {
        validationErrors = buildDoneDeclarationFeedback(validationErrors);
      }

      validationErrors = normalizeValidationFeedback(validationErrors);
      consecutiveFailures = 0;
    } catch (error) {
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

    appendJsonl(logFile, {
      type: "iteration",
      runId,
      iteration,
      latencyMs,
      status,
      goalStatus,
      goalEvidence,
      verification,
      citations,
      validationErrors,
      output,
    });

    input.onProgress?.({
      type: "iteration_done",
      iteration,
      maxIterations: input.config.maxIterations,
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

  const summary: LoopRunSummary = {
    runId,
    startedAt,
    finishedAt,
    task: input.task,
    completed,
    stopReason,
    iterationCount: iterations.length,
    maxIterations: input.config.maxIterations,
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

  input.onProgress?.({
    type: "run_done",
    maxIterations: input.config.maxIterations,
  });

  return {
    summary,
    finalOutput,
    iterations,
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

  return {
    ok: true,
    config: {
      maxIterations: maxIterations.value,
      timeoutMs: timeoutMs.value,
      requireCitation,
      verificationTimeoutMs: verificationTimeoutMs.value,
      enableSemanticStagnation,
      semanticRepetitionThreshold: thresholdValue,
    },
  };
}

function parseLoopCommand(args: string | undefined): ParsedLoopCommand {
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

function startLoopActivityIndicator(ctx: any, maxIterations: number): LoopActivityIndicator {
  if (!ctx?.hasUI || !ctx?.ui) {
    return {
      updateFromProgress: () => {},
      stop: () => {},
    };
  }

  const ui: any = ctx.ui;
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

  return [
    headline,
    `Run ID: ${summary.runId}`,
    `Task: ${summary.task}`,
    `Model: ${summary.model.provider}/${summary.model.id} (${summary.model.thinkingLevel})`,
    `Iterations: ${summary.iterationCount}/${summary.maxIterations}`,
    `Completed: ${summary.completed ? "yes" : "no"} (${summary.stopReason})`,
    `References: ${summary.referenceCount}`,
    ...deterministicLines,
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

function normalizeRefSpec(value: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed.slice(1).trim();
  return trimmed;
}

function resolvePath(cwd: string, pathLike: string): string {
  if (isAbsolute(pathLike)) return pathLike;
  return resolve(cwd, pathLike);
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function looksLikeHtml(value: string): boolean {
  return /<html[\s>]|<!doctype html/i.test(value);
}

function htmlToText(value: string): string {
  const withoutScripts = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

// Re-export truncateTextWithMarker as truncateText for backward compatibility within this module
const truncateText = truncateTextWithMarker;
