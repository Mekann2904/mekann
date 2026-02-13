// File: .pi/extensions/rsa.ts
// Description: Adds Recursive Self-Aggregation (RSA) inference as a pi extension tool and command.
// Why: Enables test-time scaling with iterative aggregation without changing model weights.
// Related: README.md, .pi/extensions/question.ts, .pi/extensions/plugin-dev.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { spawn } from "node:child_process";
import { formatDuration, toErrorMessage, toBoundedInteger, ThinkingLevel, GRACEFUL_SHUTDOWN_DELAY_MS } from "../lib";
type TraceMode = "off" | "summary" | "verbose";

interface RSAConfig {
  populationSize: number;
  aggregationSize: number;
  steps: number;
  timeoutMs: number;
  parallelism: number;
  traceMode: TraceMode;
}

interface StepTrace {
  phase: "seed" | "aggregate";
  step: number;
  durationMs: number;
  callCount: number;
  avgCallMs: number;
  minCallMs: number;
  maxCallMs: number;
  uniqueAnswers: number;
  topAnswer: string | null;
  topVotes: number;
}

interface RSAProgress {
  type: "run_start" | "step_start" | "heartbeat" | "call_start" | "call_done" | "step_done";
  phase: "seed" | "aggregate";
  step: number;
  totalSteps: number;
  itemIndex?: number;
  totalItems?: number;
  callIndex?: number;
  completedCalls: number;
  totalCalls: number;
  inFlightCalls?: number;
  latencyMs?: number;
  elapsedMs?: number;
  answerPreview?: string | null;
  subsetIndices?: number[];
  streamText?: string;
  verboseDetails?: boolean;
  stepTrace?: StepTrace;
  config?: Pick<RSAConfig, "populationSize" | "aggregationSize" | "steps" | "parallelism" | "traceMode">;
}

interface SelectionResult {
  index: number;
  method: "majority" | "deterministic";
  answer: string | null;
  votes: number;
}

interface RSARunResult {
  finalCandidate: string;
  finalAnswer: string | null;
  selectedBy: "majority" | "deterministic";
  selectedIndex: number;
  selectedVotes: number;
  totalCalls: number;
  totalDurationMs: number;
  callsPerSecond: number;
  stepTraces: StepTrace[];
  config: RSAConfig;
}

interface ParsedCommandArgs {
  question: string;
  configOverrides: Partial<RSAConfig>;
  help: boolean;
  error?: string;
}

interface CallExecutionResult {
  response: string;
  latencyMs: number;
  answer: string | null;
}

interface StepCallResult extends CallExecutionResult {
  index: number;
}

interface RSAActivityIndicator {
  updateFromProgress: (progress: RSAProgress) => void;
  stop: () => void;
}

const STABLE_RSA_PROFILE = true;
const STABLE_RSA_CAPS = {
  maxPopulation: 6,
  maxAggregation: 3,
  maxSteps: 4,
  maxParallelism: 1,
  maxTotalCalls: 24,
} as const;

const DEFAULT_CONFIG: RSAConfig = {
  populationSize: 4,
  aggregationSize: 2,
  steps: 2,
  timeoutMs: 120_000,
  parallelism: 1,
  traceMode: "summary",
};

const RSA_SPINNER_FRAMES = ["|", "/", "-", "\\"];

const LIMITS = {
  minPopulation: 1,
  maxPopulation: 32,
  minAggregation: 1,
  maxAggregation: 16,
  minSteps: 1,
  maxSteps: 20,
  minTimeoutMs: 0,
  maxTimeoutMs: 86_400_000,
  minParallelism: 1,
  maxParallelism: 16,
  maxTotalCalls: 256,
};

const COMMAND_HELP = [
  "RSA command usage:",
  "  /rsa --n <population> --k <aggregation> --t <steps> [--parallel <c>] [--trace <mode>] [--timeout <ms>|--no-timeout] <question>",
  "",
  "Options:",
  "  --n             Population size N (default: 4)",
  "  --k             Aggregation size K (default: 2)",
  "  --t             Recursive steps T (default: 2)",
  "  --parallel, --p Concurrent model calls per step (default: 1)",
  "  --trace         off | summary | verbose (default: summary)",
  "                 verbose は内部モデル出力を逐次表示",
  "  --stream        Shortcut for --trace verbose",
  "  --timeout       Timeout per model call in ms (default: 120000)",
  "  --no-timeout    Disable per-call timeout (stable profileでは固定timeoutが優先される)",
  "  --verbose       Shortcut for --trace verbose",
  "",
  "Examples:",
  "  /rsa Prove that sqrt(2) is irrational.",
  "  /rsa --n 6 --k 3 --t 4 --parallel 1 Solve this olympiad geometry problem: ...",
  "  /rsa --trace verbose --n 6 --k 3 --t 3 Solve this puzzle: ...",
  "",
  "Note:",
  "  Stable profile: caps N<=6, K<=3, T<=4, parallel<=1, N x T<=24.",
  "  Stable profile: verbose trace is downgraded to summary.",
  "  Total model calls = N x T. The paper setting N=16, K=4, T=10 triggers 160 calls.",
].join("\n");

export default function registerRSAExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "rsa_solve",
    label: "RSA Solve",
    description:
      "Solve a hard prompt with Recursive Self-Aggregation using repeated print-mode pi calls.",
    parameters: Type.Object({
      question: Type.String({
        description: "Question or task to solve with RSA",
      }),
      populationSize: Type.Optional(
        Type.Number({
          description: "Population size N",
          minimum: LIMITS.minPopulation,
          maximum: LIMITS.maxPopulation,
        }),
      ),
      aggregationSize: Type.Optional(
        Type.Number({
          description: "Aggregation size K",
          minimum: LIMITS.minAggregation,
          maximum: LIMITS.maxAggregation,
        }),
      ),
      steps: Type.Optional(
        Type.Number({
          description: "Recursive aggregation steps T",
          minimum: LIMITS.minSteps,
          maximum: LIMITS.maxSteps,
        }),
      ),
      parallelism: Type.Optional(
        Type.Number({
          description: "Concurrent model calls per step",
          minimum: LIMITS.minParallelism,
          maximum: LIMITS.maxParallelism,
        }),
      ),
      traceMode: Type.Optional(
        Type.String({
          description: "Trace mode: off | summary | verbose",
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({
          description: "Timeout per model call in milliseconds (0 disables timeout)",
          minimum: LIMITS.minTimeoutMs,
          maximum: LIMITS.maxTimeoutMs,
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const normalized = normalizeConfig({
        populationSize: params.populationSize,
        aggregationSize: params.aggregationSize,
        steps: params.steps,
        timeoutMs: params.timeoutMs,
        parallelism: params.parallelism,
        traceMode: params.traceMode,
      });

      if (!normalized.ok) {
        return {
          content: [{ type: "text" as const, text: `RSA config error: ${normalized.error}` }],
          details: { error: normalized.error },
        };
      }

      const question = String(params.question ?? "").trim();
      if (!question) {
        return {
          content: [{ type: "text" as const, text: "RSA question is required." }],
          details: { error: "missing_question" },
        };
      }

      const model = ctx.model;
      if (!model) {
        return {
          content: [{ type: "text" as const, text: "No active model found." }],
          details: { error: "missing_model" },
        };
      }

      const thinkingLevel = (pi.getThinkingLevel() || "off") as ThinkingLevel;
      const indicator = startRSAActivityIndicator(ctx, normalized.config);

      try {
        const result = await runRSA(
          pi,
          question,
          normalized.config,
          {
            provider: model.provider,
            id: model.id,
            thinkingLevel,
          },
          signal,
          (progress) => {
            indicator.updateFromProgress(progress);
            if (progress.type === "call_start" && normalized.config.traceMode !== "verbose") {
              return;
            }
            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: formatProgress(progress),
                },
              ],
            });
          },
        );

        return {
          content: [{ type: "text" as const, text: formatResultText(question, result) }],
          details: {
            ...result,
            question,
          },
        };
      } catch (error) {
        const message = toErrorMessage(error);
        return {
          content: [{ type: "text" as const, text: `RSA failed: ${message}` }],
          details: { error: message },
        };
      } finally {
        indicator.stop();
      }
    },

    renderCall(args, theme) {
      const question = typeof args.question === "string" ? args.question.trim() : "";
      const preview = question.length > 52 ? `${question.slice(0, 52)}...` : question || "(no question)";
      const text = theme.bold("rsa_solve ") + theme.fg("muted", preview);
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const method = result?.details?.selectedBy ? String(result.details.selectedBy) : "unknown";
      const calls = Number(result?.details?.totalCalls ?? 0);
      const durationMs = Number(result?.details?.totalDurationMs ?? 0);
      const text =
        theme.fg("success", "RSA done ") +
        theme.fg("accent", `${method}`) +
        theme.fg("muted", ` (${calls} calls, ${formatDuration(durationMs)})`);
      return new Text(text, 0, 0);
    },
  });

  pi.registerCommand("rsa", {
    description: "Run Recursive Self-Aggregation from the current model",
    handler: async (args, ctx) => {
      const parsed = parseCommandArgs(args);
      if (parsed.help) {
        pi.sendMessage({
          customType: "rsa-help",
          content: COMMAND_HELP,
          display: true,
        });
        return;
      }

      if (parsed.error) {
        pi.sendMessage({
          customType: "rsa-command-error",
          content: `RSA argument error: ${parsed.error}\n\n${COMMAND_HELP}`,
          display: true,
        });
        return;
      }

      const normalized = normalizeConfig(parsed.configOverrides);
      if (!normalized.ok) {
        pi.sendMessage({
          customType: "rsa-config-error",
          content: `RSA config error: ${normalized.error}\n\n${COMMAND_HELP}`,
          display: true,
        });
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("RSA failed: no active model", "error");
        return;
      }

      const question = parsed.question.trim();
      const config = normalized.config;
      const thinkingLevel = (pi.getThinkingLevel() || "off") as ThinkingLevel;
      const indicator = startRSAActivityIndicator(ctx, config);

      try {
        const result = await runRSA(
          pi,
          question,
          config,
          {
            provider: ctx.model.provider,
            id: ctx.model.id,
            thinkingLevel,
          },
          undefined,
          (progress) => {
            indicator.updateFromProgress(progress);
            const isAlways =
              progress.type === "run_start" ||
              progress.type === "step_start" ||
              progress.type === "step_done" ||
              progress.type === "heartbeat";
            const isVerboseCallStart = progress.type === "call_start" && config.traceMode === "verbose";
            const shouldNotify = isAlways || isVerboseCallStart;
            if (shouldNotify) {
              ctx.ui.notify(formatProgress(progress), "info");
            }
          },
        );

        pi.sendMessage({
          customType: "rsa-result",
          content: formatResultText(question, result),
          display: true,
          details: { question, ...result },
        });
        ctx.ui.notify("RSA completed", "success");
      } catch (error) {
        const message = toErrorMessage(error);
        pi.sendMessage({
          customType: "rsa-error",
          content: `RSA failed: ${message}`,
          display: true,
        });
        ctx.ui.notify("RSA failed. Check message for details.", "error");
      } finally {
        indicator.stop();
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("RSA extension loaded (/rsa, rsa_solve)", "info");
  });
}

async function runRSA(
  pi: ExtensionAPI,
  question: string,
  config: RSAConfig,
  model: { provider: string; id: string; thinkingLevel: ThinkingLevel },
  signal: AbortSignal | undefined,
  onProgress?: (progress: RSAProgress) => void,
): Promise<RSARunResult> {
  const totalCalls = config.populationSize * config.steps;
  let launchedCalls = 0;
  let completedCalls = 0;
  let inFlightCalls = 0;
  let progressBucket = -1;
  let lastSummaryHeartbeatMs = 0;
  const stepTraces: StepTrace[] = [];
  const runStartedAt = Date.now();

  if (config.traceMode !== "off") {
    onProgress?.({
      type: "run_start",
      phase: "seed",
      step: 1,
      totalSteps: config.steps,
      completedCalls,
      totalCalls,
      inFlightCalls,
      config: {
        populationSize: config.populationSize,
        aggregationSize: config.aggregationSize,
        steps: config.steps,
        parallelism: config.parallelism,
        traceMode: config.traceMode,
      },
    });
  }

  const emitSummaryHeartbeat = (callIndex: number, text: string) => {
    if (config.traceMode === "off") return;
    if (config.traceMode === "verbose") return;

    const now = Date.now();
    if (now - lastSummaryHeartbeatMs < 2000) return;

    lastSummaryHeartbeatMs = now;
    onProgress?.({
      type: "heartbeat",
      phase: "aggregate",
      step: 1,
      totalSteps: config.steps,
      callIndex,
      completedCalls,
      totalCalls,
      inFlightCalls,
      elapsedMs: now - runStartedAt,
      streamText: text ? `sample=${toPreview(text, 72)}` : undefined,
    });
  };

  const executeCall = async (args: {
    phase: "seed" | "aggregate";
    step: number;
    itemIndex: number;
    totalItems: number;
    prompt: string;
    subsetIndices?: number[];
  }): Promise<CallExecutionResult> => {
    throwIfAborted(signal);
    const callIndex = ++launchedCalls;
    inFlightCalls += 1;

    if (config.traceMode === "verbose") {
      onProgress?.({
        type: "call_start",
        phase: args.phase,
        step: args.step,
        totalSteps: config.steps,
        itemIndex: args.itemIndex,
        totalItems: args.totalItems,
        callIndex,
        completedCalls,
        totalCalls,
        inFlightCalls,
        subsetIndices: args.subsetIndices,
      });
    }

    let streamBuffer = "";
    const onChunk = (chunk: string) => {
      const clean = sanitizeStreamText(chunk);
      if (!clean) return;

      if (config.traceMode === "verbose") {
        streamBuffer += clean;
        const lines = streamBuffer.split(/\n/);
        streamBuffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          onProgress?.({
            type: "heartbeat",
            phase: args.phase,
            step: args.step,
            totalSteps: config.steps,
            itemIndex: args.itemIndex,
            totalItems: args.totalItems,
            callIndex,
            completedCalls,
            totalCalls,
            inFlightCalls,
            elapsedMs: Date.now() - runStartedAt,
            subsetIndices: args.subsetIndices,
            streamText: toPreview(line, 180),
            verboseDetails: true,
          });
        }

        if (streamBuffer.length >= 220) {
          onProgress?.({
            type: "heartbeat",
            phase: args.phase,
            step: args.step,
            totalSteps: config.steps,
            itemIndex: args.itemIndex,
            totalItems: args.totalItems,
            callIndex,
            completedCalls,
            totalCalls,
            inFlightCalls,
            elapsedMs: Date.now() - runStartedAt,
            subsetIndices: args.subsetIndices,
            streamText: toPreview(streamBuffer, 180),
            verboseDetails: true,
          });
          streamBuffer = "";
        }
      } else {
        emitSummaryHeartbeat(callIndex, clean);
      }
    };

    const callStartedAt = Date.now();
    const response = await callModelViaPi(pi, model, args.prompt, config.timeoutMs, signal, onChunk);
    const latencyMs = Date.now() - callStartedAt;
    const answer = extractFinalAnswer(response);

    if (config.traceMode === "verbose") {
      const tail = streamBuffer.trim();
      if (tail) {
        onProgress?.({
          type: "heartbeat",
          phase: args.phase,
          step: args.step,
          totalSteps: config.steps,
          itemIndex: args.itemIndex,
          totalItems: args.totalItems,
          callIndex,
          completedCalls,
          totalCalls,
          inFlightCalls,
          elapsedMs: Date.now() - runStartedAt,
          subsetIndices: args.subsetIndices,
          streamText: toPreview(tail, 180),
          verboseDetails: true,
        });
      }
    }

    completedCalls += 1;
    inFlightCalls = Math.max(0, inFlightCalls - 1);

    const shouldEmitCallDone = shouldEmitCallDoneEvent(
      config.traceMode,
      completedCalls,
      totalCalls,
      progressBucket,
    );

    if (config.traceMode === "summary" && shouldEmitCallDone) {
      progressBucket = Math.floor((completedCalls * 10) / totalCalls);
    }

    if (shouldEmitCallDone) {
      onProgress?.({
        type: "call_done",
        phase: args.phase,
        step: args.step,
        totalSteps: config.steps,
        itemIndex: args.itemIndex,
        totalItems: args.totalItems,
        callIndex,
        completedCalls,
        totalCalls,
        inFlightCalls,
        latencyMs,
        elapsedMs: Date.now() - runStartedAt,
        answerPreview: answer ? toPreview(answer, 80) : null,
        subsetIndices: args.subsetIndices,
        verboseDetails: config.traceMode === "verbose",
      });
    }

    return { response, latencyMs, answer };
  };

  // Step 1: generate initial population in parallel.
  if (config.traceMode !== "off") {
    onProgress?.({
      type: "step_start",
      phase: "seed",
      step: 1,
      totalSteps: config.steps,
      completedCalls,
      totalCalls,
      inFlightCalls,
      elapsedMs: Date.now() - runStartedAt,
    });
  }

  const seedStepStartedAt = Date.now();
  const seedIndices = Array.from({ length: config.populationSize }, (_, index) => index);

  const seedResults = await mapWithConcurrency(seedIndices, config.parallelism, async (_value, index) => {
    const prompt = buildSeedPrompt(question, index + 1, config.populationSize);
    const call = await executeCall({
      phase: "seed",
      step: 1,
      itemIndex: index + 1,
      totalItems: config.populationSize,
      prompt,
    });
    return {
      index,
      ...call,
    } as StepCallResult;
  });

  let population = seedResults.map((item) => item.response);
  const seedTrace = buildStepTrace("seed", 1, Date.now() - seedStepStartedAt, seedResults);
  stepTraces.push(seedTrace);

  if (config.traceMode !== "off") {
    onProgress?.({
      type: "step_done",
      phase: "seed",
      step: 1,
      totalSteps: config.steps,
      completedCalls,
      totalCalls,
      inFlightCalls,
      elapsedMs: Date.now() - runStartedAt,
      stepTrace: seedTrace,
    });
  }

  // Step 2..T: aggregate subsets in parallel for each step.
  for (let step = 2; step <= config.steps; step++) {
    if (config.traceMode !== "off") {
      onProgress?.({
        type: "step_start",
        phase: "aggregate",
        step,
        totalSteps: config.steps,
        completedCalls,
        totalCalls,
        inFlightCalls,
        elapsedMs: Date.now() - runStartedAt,
      });
    }

    const previousPopulation = population;
    const subsetPlans = Array.from({ length: config.populationSize }, (_, index) =>
      sampleIndexSubset(previousPopulation.length, config.aggregationSize, step + index),
    );

    const stepStartedAt = Date.now();
    const stepResults = await mapWithConcurrency(subsetPlans, config.parallelism, async (subsetIndices, index) => {
      const subset = subsetIndices.map((candidateIndex) => previousPopulation[candidateIndex]);
      const prompt = buildAggregationPrompt(question, subset, step, config.steps);

      const call = await executeCall({
        phase: "aggregate",
        step,
        itemIndex: index + 1,
        totalItems: config.populationSize,
        subsetIndices: subsetIndices.map((value) => value + 1),
        prompt,
      });

      return {
        index,
        ...call,
      } as StepCallResult;
    });

    population = stepResults.map((item) => item.response);
    const stepTrace = buildStepTrace("aggregate", step, Date.now() - stepStartedAt, stepResults);
    stepTraces.push(stepTrace);

    if (config.traceMode !== "off") {
      onProgress?.({
        type: "step_done",
        phase: "aggregate",
        step,
        totalSteps: config.steps,
        completedCalls,
        totalCalls,
        inFlightCalls,
        elapsedMs: Date.now() - runStartedAt,
        stepTrace,
      });
    }
  }

  // Final selection: majority vote over extracted answers, fallback to deterministic pick.
  const selection = selectFinalCandidate(population);
  const finalCandidate = population[selection.index] ?? "";
  const totalDurationMs = Date.now() - runStartedAt;
  const callsPerSecond = totalDurationMs > 0 ? totalCalls / (totalDurationMs / 1000) : 0;

  return {
    finalCandidate,
    finalAnswer: selection.answer,
    selectedBy: selection.method,
    selectedIndex: selection.index + 1,
    selectedVotes: selection.votes,
    totalCalls,
    totalDurationMs,
    callsPerSecond,
    stepTraces,
    config,
  };
}

function normalizeConfig(
  overrides: Partial<RSAConfig>,
): { ok: true; config: RSAConfig } | { ok: false; error: string } {
  const populationSize = toBoundedInteger(
    overrides.populationSize,
    DEFAULT_CONFIG.populationSize,
    LIMITS.minPopulation,
    LIMITS.maxPopulation,
    "populationSize",
  );
  if (!populationSize.ok) return populationSize;

  const aggregationSize = toBoundedInteger(
    overrides.aggregationSize,
    DEFAULT_CONFIG.aggregationSize,
    LIMITS.minAggregation,
    LIMITS.maxAggregation,
    "aggregationSize",
  );
  if (!aggregationSize.ok) return aggregationSize;

  const steps = toBoundedInteger(
    overrides.steps,
    DEFAULT_CONFIG.steps,
    LIMITS.minSteps,
    LIMITS.maxSteps,
    "steps",
  );
  if (!steps.ok) return steps;

  const timeoutMs = toBoundedInteger(
    overrides.timeoutMs,
    DEFAULT_CONFIG.timeoutMs,
    LIMITS.minTimeoutMs,
    LIMITS.maxTimeoutMs,
    "timeoutMs",
  );
  if (!timeoutMs.ok) return timeoutMs;

  const parallelism = toBoundedInteger(
    overrides.parallelism,
    DEFAULT_CONFIG.parallelism,
    LIMITS.minParallelism,
    LIMITS.maxParallelism,
    "parallelism",
  );
  if (!parallelism.ok) return parallelism;

  const traceMode = normalizeTraceMode(overrides.traceMode, DEFAULT_CONFIG.traceMode);
  if (!traceMode.ok) return traceMode;

  if (aggregationSize.value > populationSize.value) {
    return {
      ok: false,
      error: "aggregationSize (K) must be <= populationSize (N).",
    };
  }

  const totalCalls = populationSize.value * steps.value;
  if (!STABLE_RSA_PROFILE && totalCalls > LIMITS.maxTotalCalls) {
    return {
      ok: false,
      error: `N x T must be <= ${LIMITS.maxTotalCalls}. Current: ${totalCalls}.`,
    };
  }

  let resolvedPopulation = populationSize.value;
  let resolvedAggregation = aggregationSize.value;
  let resolvedSteps = steps.value;
  let resolvedTimeoutMs = timeoutMs.value;
  let resolvedParallelism = Math.min(parallelism.value, populationSize.value);
  let resolvedTraceMode = traceMode.value;

  if (STABLE_RSA_PROFILE) {
    resolvedPopulation = Math.min(resolvedPopulation, STABLE_RSA_CAPS.maxPopulation);
    resolvedAggregation = Math.min(
      resolvedAggregation,
      STABLE_RSA_CAPS.maxAggregation,
      resolvedPopulation,
    );
    resolvedSteps = Math.min(resolvedSteps, STABLE_RSA_CAPS.maxSteps);
    resolvedParallelism = Math.min(
      resolvedParallelism,
      STABLE_RSA_CAPS.maxParallelism,
      resolvedPopulation,
    );
    if (resolvedTimeoutMs <= 0) {
      resolvedTimeoutMs = DEFAULT_CONFIG.timeoutMs;
    }
    if (resolvedTraceMode === "verbose") {
      resolvedTraceMode = "summary";
    }
  }

  if (resolvedAggregation > resolvedPopulation) {
    return {
      ok: false,
      error: "aggregationSize (K) must be <= populationSize (N).",
    };
  }

  const stableCallCap = STABLE_RSA_PROFILE ? STABLE_RSA_CAPS.maxTotalCalls : LIMITS.maxTotalCalls;
  const resolvedTotalCalls = resolvedPopulation * resolvedSteps;
  if (resolvedTotalCalls > stableCallCap) {
    return {
      ok: false,
      error: `N x T must be <= ${stableCallCap}. Current: ${resolvedTotalCalls}.`,
    };
  }

  return {
    ok: true,
    config: {
      populationSize: resolvedPopulation,
      aggregationSize: resolvedAggregation,
      steps: resolvedSteps,
      timeoutMs: resolvedTimeoutMs,
      parallelism: resolvedParallelism,
      traceMode: resolvedTraceMode,
    },
  };
}

function normalizeTraceMode(
  value: unknown,
  fallback: TraceMode,
): { ok: true; value: TraceMode } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: fallback };
  }

  const raw = String(value).toLowerCase().trim();
  if (raw === "off" || raw === "summary" || raw === "verbose") {
    return { ok: true, value: raw };
  }

  return { ok: false, error: "traceMode must be one of: off, summary, verbose." };
}

function parseCommandArgs(args: string | undefined): ParsedCommandArgs {
  const raw = (args ?? "").trim();
  if (!raw || /^(-h|--help|help)$/i.test(raw)) {
    return { question: "", configOverrides: {}, help: true };
  }

  let remaining = raw;
  const configOverrides: Partial<RSAConfig> = {};

  const consumeNumericFlag = (pattern: RegExp, assign: (value: number) => void) => {
    while (true) {
      const match = remaining.match(pattern);
      if (!match || !match[1]) break;
      assign(Number(match[1]));
      remaining = remaining.replace(match[0], " ");
    }
  };

  const consumeStringFlag = (pattern: RegExp, assign: (value: string) => void) => {
    while (true) {
      const match = remaining.match(pattern);
      if (!match || !match[1]) break;
      assign(match[1]);
      remaining = remaining.replace(match[0], " ");
    }
  };

  const consumeTokenFlag = (pattern: RegExp, assign: () => void) => {
    while (true) {
      const match = remaining.match(pattern);
      if (!match) break;
      assign();
      remaining = remaining.replace(match[0], " ");
    }
  };

  consumeNumericFlag(/(?:^|\s)--n(?:=|\s+)(\d+)\b/i, (value) => {
    configOverrides.populationSize = value;
  });
  consumeNumericFlag(/(?:^|\s)--k(?:=|\s+)(\d+)\b/i, (value) => {
    configOverrides.aggregationSize = value;
  });
  consumeNumericFlag(/(?:^|\s)--t(?:=|\s+)(\d+)\b/i, (value) => {
    configOverrides.steps = value;
  });
  consumeNumericFlag(/(?:^|\s)--timeout(?:=|\s+)(\d+)\b/i, (value) => {
    configOverrides.timeoutMs = value;
  });
  consumeTokenFlag(/(?:^|\s)--no-timeout\b/i, () => {
    configOverrides.timeoutMs = 0;
  });
  consumeNumericFlag(/(?:^|\s)--(?:parallel|parallelism|p|c)(?:=|\s+)(\d+)\b/i, (value) => {
    configOverrides.parallelism = value;
  });

  consumeStringFlag(/(?:^|\s)--trace(?:=|\s+)(off|summary|verbose)\b/i, (value) => {
    configOverrides.traceMode = value as TraceMode;
  });

  consumeTokenFlag(/(?:^|\s)--verbose\b/i, () => {
    configOverrides.traceMode = "verbose";
  });

  consumeTokenFlag(/(?:^|\s)--stream\b/i, () => {
    configOverrides.traceMode = "verbose";
  });

  consumeTokenFlag(/(?:^|\s)--quiet\b/i, () => {
    configOverrides.traceMode = "off";
  });

  remaining = remaining.replace(/^\s*run\s+/i, " ").trim();
  if (!remaining) {
    return {
      question: "",
      configOverrides,
      help: false,
      error: "question is required",
    };
  }

  return {
    question: remaining,
    configOverrides,
    help: false,
  };
}

async function callModelViaPi(
  _pi: ExtensionAPI,
  model: { provider: string; id: string; thinkingLevel: ThinkingLevel },
  prompt: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const args = ["-p", "--no-extensions", "--provider", model.provider, "--model", model.id];

  if (model.thinkingLevel) {
    args.push("--thinking", model.thinkingLevel);
  }

  args.push(prompt);

  return await new Promise<string>((resolve, reject) => {
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
      finish(() => reject(new Error("RSA aborted")));
    };

    // timeoutMs <= 0 means "no per-call timeout". User cancellation still aborts the process.
    const timeoutEnabled = timeoutMs > 0;
    const timeout = timeoutEnabled
      ? setTimeout(() => {
          timedOut = true;
          killSafely("SIGTERM");
          setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
        }, timeoutMs)
      : undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
      onChunk?.(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
    });

    child.on("error", (error) => {
      finish(() => reject(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          reject(new Error(`pi -p timed out after ${timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          const err = stderr.trim() || `exit code ${code}`;
          reject(new Error(`pi -p failed: ${err}`));
          return;
        }

        const output = stdout.trim();
        if (!output) {
          reject(new Error("pi -p returned empty output."));
          return;
        }

        resolve(output);
      });
    });
  });
}

function buildSeedPrompt(question: string, candidateIndex: number, totalCandidates: number): string {
  return [
    "You are generating one candidate solution for Recursive Self-Aggregation (RSA).",
    `Candidate ${candidateIndex} of ${totalCandidates}.`,
    "Try a distinct path when possible while staying correct.",
    "",
    "Problem:",
    question,
    "",
    "Output format (strict):",
    "Reasoning: <step-by-step reasoning>",
    "Final Answer: <single final answer>",
  ].join("\n");
}

function buildAggregationPrompt(question: string, subset: string[], step: number, totalSteps: number): string {
  const candidates = subset
    .map((candidate, index) => `Candidate ${index + 1}:\n${truncateForPrompt(candidate, 3500)}`)
    .join("\n\n---\n\n");

  return [
    "You are performing one RSA aggregation step.",
    `Step ${step} of ${totalSteps}.`,
    "Synthesize one improved solution from the candidates.",
    "Reuse correct intermediate logic and discard wrong steps.",
    "Fix contradictions explicitly before concluding.",
    "",
    "Problem:",
    question,
    "",
    "Candidates:",
    candidates,
    "",
    "Output format (strict):",
    "Reasoning: <improved reasoning>",
    "Final Answer: <single final answer>",
  ].join("\n");
}

function truncateForPrompt(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function sampleIndexSubset(totalItems: number, size: number, offset = 0): number[] {
  if (size >= totalItems) {
    return Array.from({ length: totalItems }, (_, index) => index);
  }

  const normalizedOffset = ((Math.trunc(offset) % totalItems) + totalItems) % totalItems;
  const rotated = Array.from(
    { length: totalItems },
    (_, index) => (normalizedOffset + index) % totalItems,
  );
  return rotated.slice(0, size);
}

function selectFinalCandidate(population: string[]): SelectionResult {
  const voteMap = new Map<string, { count: number; firstIndex: number }>();
  const extractedAnswers = population.map((candidate) => extractFinalAnswer(candidate));

  extractedAnswers.forEach((answer, index) => {
    if (!answer) return;
    const key = normalizeAnswer(answer);
    const current = voteMap.get(key);
    if (!current) {
      voteMap.set(key, { count: 1, firstIndex: index });
      return;
    }
    voteMap.set(key, { count: current.count + 1, firstIndex: current.firstIndex });
  });

  let winner: { answer: string; count: number; firstIndex: number } | null = null;
  for (const [answer, stats] of voteMap.entries()) {
    if (!winner || stats.count > winner.count) {
      winner = { answer, count: stats.count, firstIndex: stats.firstIndex };
    }
  }

  if (winner && winner.count >= 2) {
    return {
      index: winner.firstIndex,
      method: "majority",
      answer: extractedAnswers[winner.firstIndex],
      votes: winner.count,
    };
  }

  const deterministicIndex = extractedAnswers.findIndex((answer) => Boolean(answer));
  const fallbackIndex = deterministicIndex >= 0 ? deterministicIndex : 0;
  return {
    index: fallbackIndex,
    method: "deterministic",
    answer: extractedAnswers[fallbackIndex],
    votes: 1,
  };
}

function extractFinalAnswer(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/^final answer\s*[:\-]\s*(.+)$/i);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
  }

  const boxed = text.match(/\\boxed\{([^}]+)\}/);
  if (boxed?.[1]) {
    return boxed[1].trim();
  }

  if (lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    if (lastLine.length <= 120) {
      return lastLine;
    }
  }

  return null;
}

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`*$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildStepTrace(
  phase: "seed" | "aggregate",
  step: number,
  durationMs: number,
  calls: StepCallResult[],
): StepTrace {
  const latencies = calls.map((item) => item.latencyMs);
  const avgCallMs = latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
  const minCallMs = latencies.length > 0 ? Math.min(...latencies) : 0;
  const maxCallMs = latencies.length > 0 ? Math.max(...latencies) : 0;

  const answerStats = summarizeAnswers(calls.map((item) => item.answer));

  return {
    phase,
    step,
    durationMs,
    callCount: calls.length,
    avgCallMs,
    minCallMs,
    maxCallMs,
    uniqueAnswers: answerStats.uniqueAnswers,
    topAnswer: answerStats.topAnswer,
    topVotes: answerStats.topVotes,
  };
}

function summarizeAnswers(answers: Array<string | null>): {
  uniqueAnswers: number;
  topAnswer: string | null;
  topVotes: number;
} {
  const votes = new Map<string, { count: number; display: string }>();

  for (const answer of answers) {
    if (!answer) continue;
    const key = normalizeAnswer(answer);
    const existing = votes.get(key);
    if (!existing) {
      votes.set(key, { count: 1, display: answer });
      continue;
    }
    votes.set(key, { count: existing.count + 1, display: existing.display });
  }

  let topAnswer: string | null = null;
  let topVotes = 0;
  for (const { count, display } of votes.values()) {
    if (count > topVotes) {
      topVotes = count;
      topAnswer = display;
    }
  }

  return {
    uniqueAnswers: votes.size,
    topAnswer,
    topVotes,
  };
}

function shouldEmitCallDoneEvent(
  traceMode: TraceMode,
  completedCalls: number,
  totalCalls: number,
  previousBucket: number,
): boolean {
  if (traceMode === "off") return false;
  if (traceMode === "verbose") return true;

  const currentBucket = Math.floor((completedCalls * 10) / totalCalls);
  return currentBucket > previousBucket || completedCalls >= totalCalls;
}

function formatProgress(progress: RSAProgress): string {
  if (progress.type === "run_start") {
    if (!progress.config) return "RSA started";
    const c = progress.config;
    return `RSA start: N=${c.populationSize}, K=${c.aggregationSize}, T=${c.steps}, parallel=${c.parallelism}, trace=${c.traceMode}, calls=${progress.totalCalls}`;
  }

  if (progress.type === "step_start") {
    return `RSA step ${progress.step}/${progress.totalSteps} start (${progress.phase}) | completed=${progress.completedCalls}/${progress.totalCalls}, in-flight=${progress.inFlightCalls ?? 0}`;
  }

  if (progress.type === "heartbeat") {
    const base = `RSA heartbeat: completed=${progress.completedCalls}/${progress.totalCalls}, in-flight=${progress.inFlightCalls ?? 0}`;
    if (!progress.streamText) return base;
    return `${base} | c${progress.callIndex ?? "?"}: ${progress.streamText}`;
  }

  if (progress.type === "call_start") {
    const itemText =
      progress.itemIndex && progress.totalItems
        ? ` item ${progress.itemIndex}/${progress.totalItems}`
        : "";
    return `RSA call ${progress.callIndex}/${progress.totalCalls} start (${progress.phase} step ${progress.step}/${progress.totalSteps}${itemText})`;
  }

  if (progress.type === "call_done") {
    const pct = Math.round((progress.completedCalls / progress.totalCalls) * 100);
    if (!progress.verboseDetails) {
      return `RSA progress: ${progress.completedCalls}/${progress.totalCalls} calls (${pct}%), in-flight=${progress.inFlightCalls ?? 0}`;
    }

    const latency = progress.latencyMs ? formatDuration(progress.latencyMs) : "-";
    const answer = progress.answerPreview ?? "(no extracted answer)";
    const subset = progress.subsetIndices?.length ? ` subset=[${progress.subsetIndices.join(",")}]` : "";
    return `RSA call ${progress.callIndex}/${progress.totalCalls} done (${progress.phase} step ${progress.step}/${progress.totalSteps}, ${latency})${subset} answer=${answer}`;
  }

  const trace = progress.stepTrace;
  if (!trace) {
    return `RSA step ${progress.step}/${progress.totalSteps} done`;
  }

  const topAnswer = trace.topAnswer ? toPreview(trace.topAnswer, 42) : "(none)";
  return [
    `RSA step ${trace.step}/${progress.totalSteps} ${trace.phase} done in ${formatDuration(trace.durationMs)}`,
    `avg=${formatDuration(trace.avgCallMs)}, min=${formatDuration(trace.minCallMs)}, max=${formatDuration(trace.maxCallMs)}`,
    `answers: unique=${trace.uniqueAnswers}, top=${topAnswer} x${trace.topVotes}`,
  ].join(" | ");
}

function formatResultText(question: string, result: RSARunResult): string {
  const answerLine = result.finalAnswer
    ? `Extracted final answer: ${result.finalAnswer}`
    : "Extracted final answer: (not found)";

  const voteLine =
    result.selectedBy === "majority"
      ? `Selection: majority vote (${result.selectedVotes} votes)`
      : "Selection: deterministic fallback (no majority found)";

  const stepLines = result.stepTraces.map((trace) => {
    const top = trace.topAnswer ? toPreview(trace.topAnswer, 40) : "(none)";
    return `- step ${trace.step} ${trace.phase}: ${formatDuration(trace.durationMs)} (avg ${formatDuration(trace.avgCallMs)}, unique ${trace.uniqueAnswers}, top ${top} x${trace.topVotes})`;
  });

  return [
    "RSA completed.",
    `Config: N=${result.config.populationSize}, K=${result.config.aggregationSize}, T=${result.config.steps}, parallel=${result.config.parallelism}, trace=${result.config.traceMode}, timeout=${formatTimeoutLabel(result.config.timeoutMs)}`,
    `Total model calls: ${result.totalCalls}`,
    `Runtime: ${formatDuration(result.totalDurationMs)} (${result.callsPerSecond.toFixed(2)} calls/sec)`,
    `Selected candidate index: ${result.selectedIndex}`,
    voteLine,
    answerLine,
    "",
    "Step trace:",
    ...stepLines,
    "",
    `Question: ${question}`,
    "",
    "Final candidate:",
    result.finalCandidate,
  ].join("\n");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function startRSAActivityIndicator(ctx: any, config: RSAConfig): RSAActivityIndicator {
  if (!ctx?.hasUI || !ctx?.ui) {
    return {
      updateFromProgress: () => {},
      stop: () => {},
    };
  }

  const ui: any = ctx.ui;
  const statusKey = "rsa-status";
  const totalCalls = config.populationSize * config.steps;
  let label = `RSA running (calls=${totalCalls}, parallel=${config.parallelism})`;
  let frame = 0;
  let closed = false;

  const render = () => {
    if (closed) return;
    const glyph = RSA_SPINNER_FRAMES[frame % RSA_SPINNER_FRAMES.length];
    frame += 1;
    ui.setStatus?.(statusKey, `${glyph} ${label}`);
  };

  render();
  const interval = setInterval(render, 120);

  // Use PI built-in working indicator while RSA is running.
  ui.setWorkingMessage?.("RSA running...");

  return {
    updateFromProgress(progress) {
      if (closed) return;

      if (progress.type === "step_start") {
        label = `RSA step ${progress.step}/${progress.totalSteps} (${progress.phase})`;
        return;
      }

      if (progress.type === "heartbeat") {
        const sample = progress.streamText ? ` | ${toPreview(progress.streamText, 56)}` : "";
        label =
          `RSA ${progress.completedCalls}/${progress.totalCalls}` +
          `, in-flight=${progress.inFlightCalls ?? 0}` +
          sample;
        return;
      }

      if (progress.type === "step_done" && progress.stepTrace) {
        label =
          `RSA step ${progress.step}/${progress.totalSteps} done` +
          ` (${formatDuration(progress.stepTrace.durationMs)})`;
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

function sanitizeStreamText(text: string): string {
  return text
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
}

function toPreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function formatTimeoutLabel(timeoutMs: number): string {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return "disabled";
  return `${timeoutMs}ms`;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new Error("RSA aborted");
  }
}
