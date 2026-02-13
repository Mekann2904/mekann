// File: .pi/extensions/loop.ts
// Description: Adds an autonomous loop runner with reference-grounded execution for pi.
// Why: Enables repeated model iterations with citation checks and reproducible run logs.
// Related: README.md, .pi/extensions/rsa.ts, .pi/extensions/question.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { atomicWriteTextFile, withFileLock } from "../lib/storage-lock";
import { formatDuration, toErrorMessage, toBoundedInteger, ThinkingLevel, createRunId, GRACEFUL_SHUTDOWN_DELAY_MS, computeModelTimeoutMs } from "../lib";
type LoopStatus = "continue" | "done" | "unknown";
type LoopGoalStatus = "met" | "not_met" | "unknown";

interface LoopConfig {
  maxIterations: number;
  timeoutMs: number;
  requireCitation: boolean;
  verificationTimeoutMs: number;
}

interface LoopReference {
  id: string;
  source: string;
  title: string;
  content: string;
}

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

interface LoadedReferenceResult {
  references: LoopReference[];
  warnings: string[];
}

interface LoopActivityIndicator {
  updateFromProgress: (progress: LoopProgress) => void;
  stop: () => void;
}

interface LoopVerificationResult {
  command: string;
  passed: boolean;
  timedOut: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ParsedLoopContract {
  status: LoopStatus;
  goalStatus: LoopGoalStatus;
  goalEvidence: string;
  citations: string[];
  summary: string;
  nextActions: string[];
  parseErrors: string[];
  usedStructuredBlock: boolean;
}

type VerificationPolicyMode = "always" | "done_only" | "every_n";

interface VerificationPolicyConfig {
  mode: VerificationPolicyMode;
  everyN: number;
}

interface ParsedVerificationCommand {
  executable: string;
  args: string[];
  error?: string;
}

const STABLE_LOOP_PROFILE = true;

const DEFAULT_CONFIG: LoopConfig = {
  maxIterations: STABLE_LOOP_PROFILE ? 4 : 6,
  timeoutMs: STABLE_LOOP_PROFILE ? 120_000 : 300_000,
  requireCitation: true,
  verificationTimeoutMs: STABLE_LOOP_PROFILE ? 60_000 : 120_000,
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
};

const LOOP_JSON_BLOCK_TAG = "LOOP_JSON";
const LOOP_RESULT_BLOCK_TAG = "RESULT";
const DEFAULT_VERIFICATION_POLICY_MODE: VerificationPolicyMode = "done_only";
const DEFAULT_VERIFICATION_POLICY_EVERY_N = 2;
const VERIFICATION_ALLOWLIST_ENV = "PI_LOOP_VERIFY_ALLOWLIST";
const VERIFICATION_POLICY_ENV = "PI_LOOP_VERIFY_POLICY";
const VERIFICATION_POLICY_EVERY_N_ENV = "PI_LOOP_VERIFY_EVERY_N";
const DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES: string[][] = [
  ["npm", "test"],
  ["npm", "run", "test"],
  ["pnpm", "test"],
  ["pnpm", "run", "test"],
  ["yarn", "test"],
  ["yarn", "run", "test"],
  ["bun", "test"],
  ["vitest"],
  ["pytest"],
  ["go", "test"],
  ["cargo", "test"],
];

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
  "  - Verification is allowlist-based by default. Override prefixes via PI_LOOP_VERIFY_ALLOWLIST.",
  "  - Iteration timeouts are recorded and retried. Repeated failures stop the run safely.",
  "  - Logs are written to .pi/agent-loop/<run-id>.jsonl.",
  "  - A summary is saved to .pi/agent-loop/latest-summary.json.",
].join("\n");

let lastRunSummary: LoopRunSummary | null = null;

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
            });
          },
        });

        lastRunSummary = run.summary;
        pi.appendEntry("loop-last-run", run.summary);

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
      const summary = result?.details?.summary as LoopRunSummary | undefined;
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
      const normalizedCurrent = normalizeLoopOutput(output);
      const normalizedPrev = normalizeLoopOutput(previousOutput);
      if (normalizedPrev && normalizedCurrent === normalizedPrev) {
        repeatedCount += 1;
      } else {
        repeatedCount = 0;
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
    if (!deterministicGoalMode && repeatedCount >= LIMITS.stableRepeatThreshold) {
      stopReason = "stagnation";
      break;
    }

    previousOutput = callFailed ? "" : output;
    validationFeedback = normalizeValidationFeedback(validationErrors);
  }

  const finishedAt = new Date().toISOString();
  const lastIteration = iterations[iterations.length - 1];
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

  return {
    ok: true,
    config: {
      maxIterations: maxIterations.value,
      timeoutMs: timeoutMs.value,
      requireCitation,
      verificationTimeoutMs: verificationTimeoutMs.value,
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

async function loadReferences(
  input: { refs: string[]; refsFile?: string; cwd: string },
  signal?: AbortSignal,
): Promise<LoadedReferenceResult> {
  const warnings: string[] = [];
  const specs: string[] = [];

  for (const ref of input.refs) {
    const normalized = normalizeRefSpec(ref);
    if (normalized) specs.push(normalized);
  }

  if (input.refsFile) {
    const refsFilePath = resolvePath(input.cwd, input.refsFile);
    try {
      const raw = readFileSync(refsFilePath, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = normalizeRefSpec(line);
        if (!trimmed || trimmed.startsWith("#")) continue;
        specs.push(trimmed);
      }
    } catch (error) {
      warnings.push(`Could not read refs file: ${refsFilePath} (${toErrorMessage(error)})`);
    }
  }

  if (specs.length > LIMITS.maxReferences) {
    warnings.push(`Reference count capped at ${LIMITS.maxReferences}. Extra references were ignored.`);
  }

  const clippedSpecs = specs.slice(0, LIMITS.maxReferences);
  const loaded: LoopReference[] = [];
  let usedChars = 0;

  // Load refs in order and assign stable IDs (R1, R2, ...).
  for (let i = 0; i < clippedSpecs.length; i++) {
    throwIfAborted(signal);
    const spec = clippedSpecs[i];
    const id = `R${i + 1}`;

    try {
      const fetched = await loadSingleReference(spec, input.cwd, signal);
      if (!fetched.content.trim()) {
        warnings.push(`Reference ${id} has empty content and was skipped: ${spec}`);
        continue;
      }

      // Bound total reference size to avoid polluting context windows.
      const remainingBudget = LIMITS.maxReferenceCharsTotal - usedChars;
      if (remainingBudget <= 0) {
        warnings.push("Reference text budget reached. Remaining references were skipped.");
        break;
      }

      const clipped = truncateText(fetched.content, Math.min(LIMITS.maxReferenceCharsPerItem, remainingBudget));
      usedChars += clipped.length;

      loaded.push({
        id,
        source: fetched.source,
        title: fetched.title,
        content: clipped,
      });
    } catch (error) {
      warnings.push(`Reference ${id} could not be loaded (${spec}): ${toErrorMessage(error)}`);
    }
  }

  return {
    references: loaded,
    warnings,
  };
}

async function loadSingleReference(
  spec: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<{ source: string; title: string; content: string }> {
  if (looksLikeUrl(spec)) {
    const text = await fetchTextFromUrl(spec, signal);
    return {
      source: spec,
      title: `URL: ${spec}`,
      content: text,
    };
  }

  const candidatePath = resolvePath(cwd, spec);
  if (existsSync(candidatePath)) {
    const stats = statSync(candidatePath);
    if (!stats.isFile()) {
      throw new Error("path exists but is not a file");
    }

    const content = readFileSync(candidatePath, "utf-8");
    return {
      source: candidatePath,
      title: `File: ${basename(candidatePath)}`,
      content,
    };
  }

  return {
    source: "inline",
    title: `Inline reference: ${toPreview(spec, 42)}`,
    content: spec,
  };
}

async function fetchTextFromUrl(url: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "pi-loop-extension/1.0",
        accept: "text/plain,text/markdown,text/html,application/json;q=0.9,*/*;q=0.5",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.text();
    if (looksLikeHtml(body)) {
      return htmlToText(body);
    }
    return body;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

function buildIterationPrompt(input: {
  task: string;
  goal?: string;
  verificationCommand?: string;
  iteration: number;
  maxIterations: number;
  references: LoopReference[];
  previousOutput: string;
  validationFeedback: string[];
}): string {
  const lines: string[] = [];

  lines.push("You are executing an autonomous quality-improvement loop.");
  lines.push(`Iteration ${input.iteration} of ${input.maxIterations}.`);
  lines.push("");
  lines.push("Task:");
  lines.push(input.task);
  lines.push("");

  if (input.goal?.trim()) {
    lines.push("Completion goal:");
    lines.push(input.goal.trim());
    lines.push("");
  }

  if (input.verificationCommand?.trim()) {
    lines.push("Deterministic verification command (must pass before STATUS: done):");
    lines.push(input.verificationCommand.trim());
    lines.push("");
  }

  lines.push("Rules:");
  lines.push("- Improve correctness and clarity relative to previous attempts.");
  lines.push("- When references are provided, cite them inline as [R1], [R2], ...");
  lines.push("- Do not invent reference IDs.");
  lines.push("- Use STATUS: done only if the task is actually complete.");
  lines.push("- If a completion goal exists, mark STATUS: done only when GOAL_STATUS is met.");
  lines.push("- Return the machine-readable contract in <LOOP_JSON>...</LOOP_JSON>.");
  lines.push("");

  if (input.references.length > 0) {
    lines.push("Reference pack:");
    lines.push(buildReferencePack(input.references));
    lines.push("");
  }

  if (input.previousOutput.trim()) {
    lines.push("Previous iteration output:");
    lines.push(truncateText(input.previousOutput, LIMITS.maxPreviousOutputChars));
    lines.push("");
  }

  if (input.validationFeedback.length > 0) {
    lines.push("Fix these validation issues from the previous iteration:");
    for (const issue of input.validationFeedback) {
      lines.push(`- ${issue}`);
    }
    lines.push("");
  }

  lines.push("Output format (strict):");
  lines.push(`<${LOOP_JSON_BLOCK_TAG}>`);
  lines.push("{");
  lines.push('  "status": "continue|done",');
  lines.push('  "goal_status": "met|not_met|unknown",');
  lines.push('  "goal_evidence": "short objective evidence or none",');
  lines.push('  "summary": "1-3 lines",');
  lines.push('  "next_actions": ["specific next step or none"],');
  lines.push('  "citations": ["R1", "R2"]');
  lines.push("}");
  lines.push(`</${LOOP_JSON_BLOCK_TAG}>`);
  lines.push(`<${LOOP_RESULT_BLOCK_TAG}>`);
  lines.push("<main answer>");
  lines.push(`</${LOOP_RESULT_BLOCK_TAG}>`);

  return lines.join("\n");
}

function buildReferencePack(references: LoopReference[]): string {
  const lines: string[] = [];
  for (const ref of references) {
    lines.push(`[${ref.id}] ${ref.title}`);
    lines.push(`Source: ${ref.source}`);
    lines.push(ref.content);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildIterationFocus(task: string, previousOutput: string, validationFeedback: string[]): string {
  if (validationFeedback.length > 0) {
    return `fix: ${validationFeedback[0]}`;
  }

  const nextStep = extractNextStepLine(previousOutput);
  if (nextStep && !/^none$/i.test(nextStep.trim())) {
    return `next: ${nextStep}`;
  }

  return task;
}

function extractNextStepLine(output: string): string {
  const structured = parseLoopJsonObject(output);
  if (structured) {
    const nextActions = normalizeStringArray(structured.next_actions);
    if (nextActions.length > 0) {
      return nextActions[0] ?? "";
    }
  }
  const match = output.match(/^\s*next[_\s-]*step\s*:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "";
}

function extractSummaryLine(output: string): string {
  const structured = parseLoopJsonObject(output);
  if (structured) {
    const summary = normalizeOptionalText(structured.summary);
    if (summary) {
      return summary;
    }
  }

  const match = output.match(/^\s*summary\s*:\s*(.+)$/im);
  if (match?.[1]?.trim()) {
    return match[1].trim();
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[0] ?? "";
}

function buildLoopCommandPreview(model: {
  provider: string;
  id: string;
  thinkingLevel: ThinkingLevel;
}): string {
  const parts = [
    "pi -p --no-extensions",
    `--provider ${model.provider}`,
    `--model ${model.id}`,
  ];

  if (model.thinkingLevel) {
    parts.push(`--thinking ${model.thinkingLevel}`);
  }

  return parts.join(" ");
}

// Parse the machine contract first, then fall back to legacy text fields.
function parseLoopContract(output: string, hasGoal: boolean): ParsedLoopContract {
  const parseErrors: string[] = [];
  let status = parseLoopStatus(output);
  let goalStatus = parseLoopGoalStatus(output, hasGoal);
  let goalEvidence = extractGoalEvidence(output);
  let citations = extractCitations(output);
  let summary = extractSummaryLine(output);
  const legacyNextStep = normalizeOptionalText(extractNextStepLine(output));
  let nextActions = legacyNextStep ? [legacyNextStep] : [];
  let usedStructuredBlock = false;

  const structured = parseLoopJsonObject(output);
  if (structured) {
    usedStructuredBlock = true;

    const normalizedStatus = normalizeLoopStatus(structured.status);
    if (normalizedStatus === "unknown") {
      parseErrors.push("LOOP_JSON.status must be continue or done.");
    } else {
      status = normalizedStatus;
    }

    const structuredGoalStatus = parseStructuredLoopGoalStatus(structured.goal_status);
    if (!structuredGoalStatus.valid) {
      parseErrors.push("LOOP_JSON.goal_status must be met, not_met, or unknown.");
    }
    goalStatus = hasGoal ? structuredGoalStatus.status : "met";

    const structuredGoalEvidence = normalizeOptionalText(structured.goal_evidence);
    if (structuredGoalEvidence) {
      goalEvidence = structuredGoalEvidence;
    }

    const structuredSummary = normalizeOptionalText(structured.summary);
    if (!structuredSummary) {
      parseErrors.push("LOOP_JSON.summary is required.");
    } else {
      summary = structuredSummary;
    }

    const structuredNextActions = normalizeStringArray(structured.next_actions);
    if (structuredNextActions.length === 0) {
      parseErrors.push("LOOP_JSON.next_actions must be a non-empty string array.");
    } else {
      nextActions = structuredNextActions;
    }

    const citationsValue = structured.citations;
    if (!Array.isArray(citationsValue)) {
      parseErrors.push("LOOP_JSON.citations must be a string array.");
    } else {
      const normalizedCitations = normalizeCitationList(citationsValue);
      if (normalizedCitations.length !== citationsValue.length) {
        parseErrors.push("LOOP_JSON.citations must contain only valid R# IDs.");
      }
      citations = normalizedCitations;
    }
  } else {
    parseErrors.push("Missing <LOOP_JSON> contract block.");
  }

  if (!summary) {
    parseErrors.push("Missing summary.");
  }

  if (nextActions.length === 0) {
    nextActions = ["none"];
  }

  return {
    status,
    goalStatus,
    goalEvidence,
    citations,
    summary,
    nextActions,
    parseErrors,
    usedStructuredBlock,
  };
}

function extractTaggedBlock(output: string, tag: string): string | undefined {
  const pattern = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, "i");
  const match = output.match(pattern);
  if (!match?.[1]) return undefined;
  return match[1].trim();
}

function extractLoopResultBody(output: string): string {
  const block = extractTaggedBlock(output, LOOP_RESULT_BLOCK_TAG);
  if (block) return block;
  return output.trim();
}

function parseLoopJsonObject(output: string): Record<string, unknown> | undefined {
  const block = extractTaggedBlock(output, LOOP_JSON_BLOCK_TAG);
  if (!block) return undefined;

  const trimmed = stripMarkdownCodeFence(block);
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

function normalizeLoopStatus(value: unknown): LoopStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "continue" || normalized === "done") {
    return normalized;
  }
  return "unknown";
}

function normalizeLoopGoalStatus(value: unknown): LoopGoalStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "met") return "met";
  if (normalized === "not_met") return "not_met";
  if (normalized === "unknown") return "unknown";
  return "unknown";
}

function parseStructuredLoopGoalStatus(
  value: unknown,
): { status: LoopGoalStatus; valid: boolean } {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { status: "unknown", valid: false };
  }

  const normalized = normalizeLoopGoalStatus(raw);
  if (normalized === "met" || normalized === "not_met" || normalized === "unknown") {
    const valid =
      normalized === "unknown"
        ? /^unknown$/i.test(raw.trim())
        : true;
    return { status: normalized, valid };
  }

  return { status: "unknown", valid: false };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item));
  return Array.from(new Set(normalized));
}

function normalizeCitationId(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;

  const match = raw.match(/^\[?R(\d+)\]?$/i);
  if (!match?.[1]) return undefined;
  const id = Number(match[1]);
  if (!Number.isFinite(id) || id < 1) return undefined;
  return `R${id}`;
}

function normalizeCitationList(values: unknown[]): string[] {
  const normalizedIds = values
    .map((value) => normalizeCitationId(value))
    .filter((value): value is string => Boolean(value));
  const unique = Array.from(new Set(normalizedIds));
  unique.sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
  return unique;
}

function parseLoopStatus(output: string): LoopStatus {
  const statusMatch = output.match(/^\s*status\s*:\s*(continue|done)\b/im);
  if (statusMatch?.[1]) {
    const value = statusMatch[1].toLowerCase();
    if (value === "continue" || value === "done") return value;
  }

  const stopMatch = output.match(/^\s*stop\s*:\s*(yes|true|done)\b/im);
  if (stopMatch) return "done";

  return "unknown";
}

function parseLoopGoalStatus(output: string, hasGoal: boolean): LoopGoalStatus {
  if (!hasGoal) return "met";

  const match = output.match(/^\s*goal[_\s-]*status\s*:\s*(met|not[_\s-]*met|unknown)\b/im);
  if (match?.[1]) {
    const normalized = match[1].toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "met") return "met";
    if (normalized === "not_met") return "not_met";
    return "unknown";
  }

  const passMatch = output.match(/^\s*(goal[_\s-]*met|criteria[_\s-]*met)\s*:\s*(yes|true)\b/im);
  if (passMatch) return "met";

  return "unknown";
}

function extractGoalEvidence(output: string): string {
  const structured = parseLoopJsonObject(output);
  if (structured) {
    const goalEvidence = normalizeOptionalText(structured.goal_evidence);
    if (goalEvidence) {
      return goalEvidence;
    }
  }

  const match = output.match(/^\s*goal[_\s-]*evidence\s*:\s*(.+)$/im);
  return match?.[1]?.trim() ?? "";
}

function extractCitations(output: string): string[] {
  const structured = parseLoopJsonObject(output);
  if (structured && Array.isArray(structured.citations)) {
    return normalizeCitationList(structured.citations);
  }

  const ids = new Set<number>();
  const matcher = /\[R(\d+)\]/gi;
  let match: RegExpExecArray | null = null;

  while (true) {
    match = matcher.exec(output);
    if (!match?.[1]) break;
    ids.add(Number(match[1]));
  }

  return Array.from(ids)
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b)
    .map((id) => `R${id}`);
}

function validateIteration(input: {
  status: LoopStatus;
  goal?: string;
  goalStatus: LoopGoalStatus;
  citations: string[];
  referenceCount: number;
  requireCitation: boolean;
}): string[] {
  const errors: string[] = [];

  if (input.goal) {
    if (input.goalStatus === "unknown") {
      errors.push("Missing GOAL_STATUS. Use GOAL_STATUS: met|not_met|unknown.");
    }
    if (input.status === "done" && input.goalStatus !== "met") {
      errors.push("STATUS is done but GOAL_STATUS is not met.");
    }
  }

  if (input.referenceCount > 0 && input.requireCitation && input.citations.length === 0) {
    errors.push("Missing citations. Add [R#] markers that map to the reference pack.");
  }

  const invalidIds = input.citations.filter((citation) => {
    const id = Number(citation.slice(1));
    return !Number.isFinite(id) || id < 1 || id > input.referenceCount;
  });

  if (invalidIds.length > 0) {
    errors.push(`Invalid citation IDs: ${invalidIds.join(", ")}.`);
  }

  return errors;
}

function normalizeValidationFeedback(errors: string[]): string[] {
  const compact = errors
    .map((issue) => normalizeValidationIssue(issue))
    .filter((issue): issue is string => Boolean(issue));
  const unique = Array.from(new Set(compact));
  unique.sort((left, right) => validationIssuePriority(left) - validationIssuePriority(right));
  return unique
    .slice(0, LIMITS.maxValidationFeedbackItems)
    .map((issue, index) => `${index + 1}. ${toPreview(issue, LIMITS.maxValidationFeedbackCharsPerItem)}`);
}

function normalizeValidationIssue(issue: string): string {
  const compact = String(issue ?? "")
    .replace(/^\d+\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";

  if (/missing <loop_json>|contract block/i.test(compact)) {
    return "Return <LOOP_JSON> with the required JSON object contract.";
  }
  if (/loop_json\.status/i.test(compact)) {
    return 'Set "status" to "continue" or "done" in <LOOP_JSON>.';
  }
  if (/status is done but goal_status is not met/i.test(compact)) {
    return "Do not set status=done until goal_status is met.";
  }
  if (/loop_json\.goal_status|goal_status/i.test(compact)) {
    return 'Set "goal_status" to "met", "not_met", or "unknown" in <LOOP_JSON>.';
  }
  if (/loop_json\.summary|missing summary/i.test(compact)) {
    return 'Provide a short "summary" field in <LOOP_JSON>.';
  }
  if (/loop_json\.next_actions/i.test(compact)) {
    return 'Provide "next_actions" as a non-empty string array in <LOOP_JSON>.';
  }
  if (/loop_json\.citations|missing citations|invalid citation ids/i.test(compact)) {
    return 'Fix citations: use valid ["R#"] IDs that exist in the reference pack.';
  }
  if (/verification command failed/i.test(compact)) {
    return "Fix failing verification command before declaring done.";
  }
  return compact;
}

function validationIssuePriority(issue: string): number {
  if (/status=done|status is done|do not set status=done/i.test(issue)) return 0;
  if (/verification|command/i.test(issue)) return 1;
  if (/goal_status|goal/i.test(issue)) return 2;
  if (/citation|reference/i.test(issue)) return 3;
  return 4;
}

function buildDoneDeclarationFeedback(errors: string[]): string[] {
  return [
    "STATUS=done was rejected by system validation. Keep STATUS=continue until all gates pass.",
    ...errors,
  ];
}

function buildIterationFailureOutput(message: string): string {
  const contract = {
    status: "continue",
    goal_status: "unknown",
    goal_evidence: "none",
    summary: "iteration execution failed",
    next_actions: ["retry with narrower scope"],
    citations: [],
  };
  return [
    `<${LOOP_JSON_BLOCK_TAG}>`,
    JSON.stringify(contract, null, 2),
    `</${LOOP_JSON_BLOCK_TAG}>`,
    `<${LOOP_RESULT_BLOCK_TAG}>`,
    message,
    `</${LOOP_RESULT_BLOCK_TAG}>`,
  ].join("\n");
}

function resolveVerificationPolicy(): VerificationPolicyConfig {
  const rawMode = String(process.env[VERIFICATION_POLICY_ENV] || "")
    .trim()
    .toLowerCase();
  const mode: VerificationPolicyMode =
    rawMode === "always" || rawMode === "done_only" || rawMode === "every_n"
      ? rawMode
      : DEFAULT_VERIFICATION_POLICY_MODE;
  const rawEveryN = Number(process.env[VERIFICATION_POLICY_EVERY_N_ENV]);
  const everyN =
    Number.isFinite(rawEveryN) && rawEveryN >= 1 ? Math.trunc(rawEveryN) : DEFAULT_VERIFICATION_POLICY_EVERY_N;
  return { mode, everyN };
}

function shouldRunVerificationCommand(input: {
  iteration: number;
  maxIterations: number;
  status: LoopStatus;
  policy: VerificationPolicyConfig;
}): boolean {
  if (input.policy.mode === "always") {
    return true;
  }
  if (input.policy.mode === "every_n") {
    if (input.status === "done") return true;
    if (input.iteration === input.maxIterations) return true;
    return input.iteration % input.policy.everyN === 0;
  }
  return input.status === "done" || input.iteration === input.maxIterations;
}

async function callModelViaPi(
  model: { provider: string; id: string; thinkingLevel: ThinkingLevel },
  prompt: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const args = ["-p", "--no-extensions", "--provider", model.provider, "--model", model.id];
  if (model.thinkingLevel) {
    args.push("--thinking", model.thinkingLevel);
  }
  args.push(prompt);

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const killSafely = (sig: NodeJS.Signals) => {
      if (!child.killed) {
        try {
          child.kill(sig);
        } catch {
          // noop
        }
      }
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish(() => rejectPromise(new Error("loop aborted")));
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killSafely("SIGTERM");
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
    });

    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`pi -p timed out after ${timeoutMs}ms`));
          return;
        }
        if (code !== 0) {
          const message = stderr.trim() || `exit code ${code}`;
          rejectPromise(new Error(`pi -p failed: ${message}`));
          return;
        }

        const output = stdout.trim();
        if (!output) {
          rejectPromise(new Error("pi -p returned empty output"));
          return;
        }
        resolvePromise(output);
      });
    });
  });
}

async function runVerificationCommand(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<LoopVerificationResult> {
  // Verification is executed without a shell and must match an explicit allowlist prefix.
  const parsedCommand = parseVerificationCommand(input.command);
  if (parsedCommand.error) {
    return {
      command: input.command,
      passed: false,
      timedOut: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: parsedCommand.error,
    };
  }

  const allowlist = resolveVerificationAllowlistPrefixes();
  if (!isVerificationCommandAllowed(parsedCommand, allowlist)) {
    return {
      command: input.command,
      passed: false,
      timedOut: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `verification command is not allowed by ${VERIFICATION_ALLOWLIST_ENV}: ${formatAllowlistPreview(allowlist)}`,
    };
  }

  const startedAt = Date.now();

  return await new Promise<LoopVerificationResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(parsedCommand.executable, parsedCommand.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const finish = (partial: {
      passed: boolean;
      timedOut: boolean;
      exitCode: number | null;
      error?: string;
    }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise({
        command: input.command,
        passed: partial.passed,
        timedOut: partial.timedOut,
        exitCode: partial.exitCode,
        durationMs: Date.now() - startedAt,
        stdout: truncateText(redactSensitiveText(stdout.trim()), 1_200),
        stderr: truncateText(redactSensitiveText(stderr.trim()), 1_200),
        error: partial.error,
      });
    };

    const killSafely = (sig: NodeJS.Signals) => {
      if (child.killed) return;
      try {
        child.kill(sig);
      } catch {
        // noop
      }
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish({
        passed: false,
        timedOut: false,
        exitCode: null,
        error: "verification aborted",
      });
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killSafely("SIGTERM");
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
    }, input.timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", onAbort);
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
    });

    child.on("error", (error) => {
      finish({
        passed: false,
        timedOut: false,
        exitCode: null,
        error: toErrorMessage(error),
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish({
          passed: false,
          timedOut: true,
          exitCode: code,
          error: `verification timed out after ${input.timeoutMs}ms`,
        });
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        finish({
          passed: false,
          timedOut: false,
          exitCode: code,
          error: detail,
        });
        return;
      }

      finish({
        passed: true,
        timedOut: false,
        exitCode: code,
      });
    });
  });
}

function parseVerificationCommand(command: string): ParsedVerificationCommand {
  const raw = String(command ?? "").trim();
  if (!raw) {
    return {
      executable: "",
      args: [],
      error: "verification command is empty",
    };
  }

  if (/[\r\n]/.test(raw)) {
    return {
      executable: "",
      args: [],
      error: "verification command must be a single line",
    };
  }

  if (/[|&;<>()$`]/.test(raw)) {
    return {
      executable: "",
      args: [],
      error: "shell operators are not allowed in verification command",
    };
  }

  const tokens = tokenizeArgs(raw).filter(Boolean);
  if (tokens.length === 0) {
    return {
      executable: "",
      args: [],
      error: "verification command is empty",
    };
  }

  return {
    executable: tokens[0],
    args: tokens.slice(1),
  };
}

function resolveVerificationAllowlistPrefixes(): string[][] {
  const raw = String(process.env[VERIFICATION_ALLOWLIST_ENV] || "").trim();
  const source = raw
    ? raw.split(",").map((item) => item.trim())
    : DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES.map((item) => item.join(" "));

  const prefixes = source
    .map((entry) => tokenizeArgs(entry))
    .map((tokens) => tokens.map((token) => token.trim()).filter(Boolean))
    .filter((tokens) => tokens.length > 0);

  return prefixes.length > 0 ? prefixes : DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES;
}

function isVerificationCommandAllowed(
  command: ParsedVerificationCommand,
  allowlistPrefixes: string[][],
): boolean {
  const commandTokens = [command.executable, ...command.args].map((token) => token.toLowerCase());
  return allowlistPrefixes.some((prefix) => {
    if (prefix.length === 0 || commandTokens.length < prefix.length) {
      return false;
    }
    return prefix.every((token, index) => token.toLowerCase() === commandTokens[index]);
  });
}

function formatAllowlistPreview(prefixes: string[][]): string {
  const preview = prefixes.slice(0, 6).map((prefix) => prefix.join(" "));
  if (prefixes.length > 6) {
    preview.push("...");
  }
  return preview.join(", ");
}

function redactSensitiveText(value: string): string {
  if (!value) return value;

  const replacements: Array<[RegExp, string]> = [
    [/(api[_-]?key\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(token\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(password\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(secret\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(bearer\s+)([a-z0-9._-]+)/gi, "$1[REDACTED]"],
  ];

  let redacted = value;
  for (const [pattern, replacement] of replacements) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

function buildVerificationValidationFeedback(result: LoopVerificationResult): string[] {
  if (result.passed) return [];

  const duration = formatDuration(result.durationMs);
  const code = result.exitCode === null ? "none" : String(result.exitCode);
  const reason = result.error || result.stderr || result.stdout || "verification failed";
  const compactReason = toPreview(reason.replace(/\s+/g, " ").trim(), 180);

  return [
    `Verification: passed=false timedOut=${result.timedOut ? "yes" : "no"} exit=${code} duration=${duration}.`,
    `Verification reason: ${compactReason}`,
  ];
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

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function normalizeLoopOutput(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toPreview(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function normalizeOptionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new Error("loop aborted");
  }
}
