// Path: .pi/extensions/bug-hunt/index.ts
// What: bug-hunt の start / status / stop ツールを pi へ登録する
// Why: ユーザが止めるまで bug を探して task 化する拡張を提供するため
// Related: .pi/extensions/bug-hunt/runner.ts, .pi/extensions/bug-hunt/storage.ts, .pi/lib/background-processes.ts

import { createRequire } from "node:module";
import { join } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  listBackgroundProcesses,
  saveBackgroundProcessConfig,
  startBackgroundProcess,
  stopBackgroundProcess,
  type BackgroundProcessRecord,
} from "../../lib/background-processes.js";
import {
  createBugHuntRunId,
  createDefaultBugHuntState,
  loadBugHuntState,
  saveBugHuntState,
} from "./storage.js";
import { getMinimumBugHuntIterationTimeoutMs } from "./budget.js";
import type { BugHuntModelConfig, BugHuntState } from "./types.js";

const require = createRequire(import.meta.url);

let isInitialized = false;

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function resolveActiveProcess(state: BugHuntState, cwd: string): BackgroundProcessRecord | null {
  if (!state.backgroundProcessId) {
    return null;
  }

  return listBackgroundProcesses({
    cwd,
    includeExited: true,
  }).find((record) => record.id === state.backgroundProcessId) ?? null;
}

function formatState(state: BugHuntState, processRecord: BackgroundProcessRecord | null): string {
  const lines = [
    "# Bug Hunt Status",
    "",
    `status: ${state.status}`,
    `current_stage: ${state.currentStage}`,
    `run_id: ${state.runId ?? "-"}`,
    `background_process_id: ${state.backgroundProcessId ?? "-"}`,
    `background_process_status: ${processRecord?.status ?? "-"}`,
    `model: ${state.model ? `${state.model.provider}/${state.model.id}` : "-"}`,
    `started_at: ${state.startedAt ?? "-"}`,
    `stopped_at: ${state.stoppedAt ?? "-"}`,
    `last_heartbeat_at: ${state.lastHeartbeatAt ?? "-"}`,
    `last_iteration_at: ${state.lastIterationAt ?? "-"}`,
    `iterations: ${state.iterationCount}`,
    `reported_count: ${state.reportedCount}`,
    `stop_requested: ${state.stopRequested}`,
    `interval_ms: ${state.intervalMs}`,
    `timeout_ms: ${state.timeoutMs}`,
    `investigation_parallelism: ${state.investigationParallelism}`,
    `last_summary: ${state.lastSummary ?? "-"}`,
    `last_observer_decision: ${state.lastObserverDecision ?? "-"}`,
    `last_error: ${state.lastError ?? "-"}`,
  ];

  if (state.lastCandidates.length > 0) {
    lines.push(`last_candidates: ${state.lastCandidates.join(" | ")}`);
  }

  if (processRecord) {
    lines.push(`log: ${processRecord.logPath}`);
  }

  return lines.join("\n");
}

function resolveModelConfig(
  params: {
    provider?: string;
    model?: string;
    thinkingLevel?: string;
  },
  ctx: {
    model?: {
      provider?: string;
      id?: string;
      thinkingLevel?: string;
    };
  },
): BugHuntModelConfig | null {
  const provider = params.provider?.trim() || ctx.model?.provider?.trim();
  const id = params.model?.trim() || ctx.model?.id?.trim();
  const thinkingLevel = params.thinkingLevel?.trim() || ctx.model?.thinkingLevel?.trim();

  if (!provider || !id) {
    return null;
  }

  return {
    provider,
    id,
    thinkingLevel: thinkingLevel || undefined,
  };
}

function buildRunnerCommand(cwd: string, runId: string): string {
  const runnerPath = join(import.meta.dirname, "runner.ts");
  const tsxLoaderPath = require.resolve("tsx");
  return [
    quoteShell(process.execPath),
    "--import",
    quoteShell(tsxLoaderPath),
    quoteShell(runnerPath),
    "--cwd",
    quoteShell(cwd),
    "--run-id",
    quoteShell(runId),
  ].join(" ");
}

function buildRunningStatePatch(input: {
  previous: BugHuntState;
  model: BugHuntModelConfig;
  taskPrompt: string;
  intervalMs: number;
  timeoutMs: number;
  investigationParallelism: number;
}): BugHuntState {
  return {
    ...createDefaultBugHuntState(),
    ...input.previous,
    runId: createBugHuntRunId(),
    status: "running",
    currentStage: "booting",
    backgroundProcessId: null,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    lastHeartbeatAt: null,
    lastIterationAt: null,
    lastSummary: "starting bug-hunt runner",
    lastError: null,
    stopRequested: false,
    intervalMs: input.intervalMs,
    timeoutMs: input.timeoutMs,
    investigationParallelism: input.investigationParallelism,
    taskPrompt: input.taskPrompt,
    model: input.model,
  };
}

function resolvePreferredBugHuntTimeoutMs(
  requestedTimeoutMs: number | undefined,
  previous: BugHuntState,
): number {
  const minimumTimeoutMs = getMinimumBugHuntIterationTimeoutMs();
  const defaultTimeoutMs = createDefaultBugHuntState().timeoutMs;

  if (typeof requestedTimeoutMs === "number") {
    return Math.max(requestedTimeoutMs, minimumTimeoutMs, defaultTimeoutMs);
  }

  return Math.max(previous.timeoutMs ?? 0, minimumTimeoutMs, defaultTimeoutMs);
}

function tokenizeBugHuntArgs(input: string): string[] {
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
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function clampBugHuntParallelism(value: number): number {
  const normalized = Math.floor(value);
  if (!Number.isFinite(normalized)) {
    return createDefaultBugHuntState().investigationParallelism;
  }
  return Math.max(1, Math.min(6, normalized));
}

function resolveBugHuntParallelism(
  requestedParallelism: number | undefined,
  previous: BugHuntState,
): number {
  if (typeof requestedParallelism === "number") {
    return clampBugHuntParallelism(requestedParallelism);
  }

  return clampBugHuntParallelism(previous.investigationParallelism ?? createDefaultBugHuntState().investigationParallelism);
}

type BugHuntCommandParseResult =
  | { mode: "help" }
  | { mode: "status" }
  | { mode: "stop" }
  | { mode: "start"; task?: string; parallelism?: number }
  | { mode: "error"; error: string };

function parseBugHuntCommand(args: string | undefined): BugHuntCommandParseResult {
  const raw = (args ?? "").trim();
  if (!raw) {
    return { mode: "help" };
  }

  const tokens = tokenizeBugHuntArgs(raw);
  if (tokens.length === 0) {
    return { mode: "help" };
  }

  const head = tokens[0].toLowerCase();
  if (head === "help" || head === "--help" || head === "-h") {
    return { mode: "help" };
  }
  if (head === "status") {
    return tokens.length === 1 ? { mode: "status" } : { mode: "error", error: "status does not take extra arguments" };
  }
  if (head === "stop") {
    return tokens.length === 1 ? { mode: "stop" } : { mode: "error", error: "stop does not take extra arguments" };
  }

  let cursor = head === "start" ? 1 : 0;
  const taskTokens: string[] = [];
  let parallelism: number | undefined;

  for (; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    const lower = token.toLowerCase();

    if (lower === "--parallel" || lower === "--parallelism" || lower === "-p") {
      const next = tokens[cursor + 1];
      if (!next) {
        return { mode: "error", error: `missing value for ${token}` };
      }
      parallelism = Number(next);
      cursor += 1;
      continue;
    }

    if (lower.startsWith("--parallel=") || lower.startsWith("--parallelism=")) {
      parallelism = Number(token.slice(token.indexOf("=") + 1));
      continue;
    }

    if (lower.startsWith("parallel=") || lower.startsWith("parallelism=")) {
      parallelism = Number(token.slice(token.indexOf("=") + 1));
      continue;
    }

    if (/^\d+(?:並列)?$/.test(token)) {
      parallelism = Number(token.replace(/並列$/, ""));
      continue;
    }

    taskTokens.push(token);
  }

  if (parallelism !== undefined && !Number.isFinite(parallelism)) {
    return { mode: "error", error: "parallelism must be a number" };
  }

  return {
    mode: "start",
    task: taskTokens.join(" ").trim() || undefined,
    parallelism,
  };
}

async function startBugHuntRun(
  params: {
    task?: string;
    intervalMs?: number;
    timeoutMs?: number;
    parallelism?: number;
    provider?: string;
    model?: string;
    thinkingLevel?: string;
    restartIfRunning?: boolean;
  },
  ctx: {
    cwd: string;
    model?: {
      provider?: string;
      id?: string;
      thinkingLevel?: string;
    };
  },
) {
  const cwd = ctx.cwd;
  const current = loadBugHuntState(cwd);
  const currentProcess = resolveActiveProcess(current, cwd);

  if (currentProcess?.status === "running" && !params.restartIfRunning) {
    return {
      content: [{
        type: "text" as const,
        text: `bug-hunt is already running.\n\n${formatState(current, currentProcess)}`,
      }],
      details: {
        state: current,
        process: currentProcess,
      },
    };
  }

  if (currentProcess?.status === "running" && params.restartIfRunning) {
    await stopBackgroundProcess({
      cwd,
      id: currentProcess.id,
    });
  }

  const model = resolveModelConfig(params, ctx);
  if (!model) {
    return {
      content: [{
        type: "text" as const,
        text: "Could not resolve provider/model. Pass provider/model explicitly or run from a session with an active model.",
      }],
      details: {},
    };
  }

  saveBackgroundProcessConfig(cwd, {
    enabled: true,
    defaultKeepAliveOnShutdown: true,
  });

  const nextState = buildRunningStatePatch({
    previous: current,
    model,
    taskPrompt: params.task?.trim() || current.taskPrompt || createDefaultBugHuntState().taskPrompt,
    intervalMs: params.intervalMs ?? current.intervalMs ?? createDefaultBugHuntState().intervalMs,
    timeoutMs: resolvePreferredBugHuntTimeoutMs(params.timeoutMs, current),
    investigationParallelism: resolveBugHuntParallelism(params.parallelism, current),
  });
  saveBugHuntState(nextState, cwd);

  try {
    const result = await startBackgroundProcess({
      cwd,
      command: buildRunnerCommand(cwd, nextState.runId as string),
      label: "bug-hunt",
      keepAliveOnShutdown: true,
      startupTimeoutMs: 5_000,
      readyPattern: "BUG_HUNT_READY",
      waitForReady: false,
    });

    const runningState = saveBugHuntState({
      ...loadBugHuntState(cwd),
      runId: nextState.runId,
      status: "running",
      backgroundProcessId: result.record.id,
      startedAt: nextState.startedAt,
      lastSummary: result.ready ? "bug-hunt runner started" : "bug-hunt runner booting",
    }, cwd);

    return {
      content: [{
        type: "text" as const,
        text: [
          `bug-hunt started (${result.ready ? "ready" : "booting"}).`,
          "",
          formatState(runningState, result.record),
        ].join("\n"),
      }],
      details: {
        state: runningState,
        process: result.record,
        ready: result.ready,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedState = saveBugHuntState({
      ...loadBugHuntState(cwd),
      runId: nextState.runId,
      status: "failed",
      currentStage: "idle",
      backgroundProcessId: null,
      startedAt: nextState.startedAt,
      stoppedAt: new Date().toISOString(),
      lastError: message,
      lastSummary: `failed to start bug-hunt runner: ${message}`,
    }, cwd);

    return {
      content: [{
        type: "text" as const,
        text: formatState(failedState, null),
      }],
      details: {
        state: failedState,
        process: null,
      },
    };
  }
}

export function resetForTesting(): void {
  isInitialized = false;
}

export default function registerBugHuntExtension(pi: ExtensionAPI): void {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.registerTool({
    name: "bug_hunt_start",
    label: "Bug Hunt Start",
    description: "Start a persistent bug-hunting loop that keeps adding reports to the Web UI task list.",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "Optional hunting focus or mission text" })),
      intervalMs: Type.Optional(Type.Integer({
        minimum: 5_000,
        maximum: 3_600_000,
        description: "Delay between bug-hunt iterations",
      })),
      timeoutMs: Type.Optional(Type.Integer({
        minimum: 10_000,
        maximum: 900_000,
        description: "Per-iteration model timeout",
      })),
      parallelism: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 6,
        description: "Maximum concurrent investigations per iteration",
      })),
      provider: Type.Optional(Type.String({ description: "Provider override" })),
      model: Type.Optional(Type.String({ description: "Model override" })),
      thinkingLevel: Type.Optional(Type.String({ description: "Thinking level override" })),
      restartIfRunning: Type.Optional(Type.Boolean({ description: "Restart the current run if one is already active" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return await startBugHuntRun(params, ctx);
    },
  });

  pi.registerTool({
    name: "bug_hunt_status",
    label: "Bug Hunt Status",
    description: "Show the current bug-hunt loop state and tracked background process.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const state = loadBugHuntState(ctx.cwd);
      const processRecord = resolveActiveProcess(state, ctx.cwd);

      return {
        content: [{
          type: "text",
          text: formatState(state, processRecord),
        }],
        details: {
          state,
          process: processRecord,
        },
      };
    },
  });

  pi.registerTool({
    name: "bug_hunt_stop",
    label: "Bug Hunt Stop",
    description: "Stop the current bug-hunt loop.",
    parameters: Type.Object({
      force: Type.Optional(Type.Boolean({ description: "Use SIGKILL immediately" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      const current = loadBugHuntState(cwd);
      const processRecord = resolveActiveProcess(current, cwd);

      if (!current.runId || !processRecord) {
        const stopped = saveBugHuntState({
          ...current,
          status: "stopped",
          currentStage: "idle",
          stopRequested: true,
          stoppedAt: new Date().toISOString(),
          lastSummary: "no active bug-hunt run",
        }, cwd);
        return {
          content: [{
            type: "text",
            text: formatState(stopped, null),
          }],
          details: {
            state: stopped,
            process: null,
          },
        };
      }

      saveBugHuntState({
        ...current,
        status: "stopping",
        stopRequested: true,
        lastSummary: "stop requested",
      }, cwd);

      const stoppedProcess = await stopBackgroundProcess({
        cwd,
        id: processRecord.id,
        force: params.force,
      });

      const stoppedState = saveBugHuntState({
        ...loadBugHuntState(cwd),
        status: "stopped",
        currentStage: "idle",
        stopRequested: true,
        stoppedAt: new Date().toISOString(),
        lastSummary: stoppedProcess
          ? `stopped via ${stoppedProcess.signal}`
          : "stop requested but background process was not found",
      }, cwd);

      return {
        content: [{
          type: "text",
          text: formatState(stoppedState, stoppedProcess?.record ?? null),
        }],
        details: {
          state: stoppedState,
          process: stoppedProcess?.record ?? null,
        },
      };
    },
  });

  pi.registerCommand("bug-hunt", {
    description: "Control the persistent bug hunt loop (start|status|stop). Supports /bug-hunt start 3 or /bug-hunt start parallel=3.",
    handler: async (args, ctx) => {
      const parsed = parseBugHuntCommand(args);

      if (parsed.mode === "help") {
        ctx.ui?.notify?.("Use /bug-hunt start [parallel=3] [task...], /bug-hunt status, or /bug-hunt stop.", "info");
        return;
      }

      if (parsed.mode === "error") {
        ctx.ui?.notify?.(`bug-hunt argument error: ${parsed.error}`, "error");
        return;
      }

      if (parsed.mode === "stop") {
        const cwd = ctx.cwd;
        const state = loadBugHuntState(cwd);
        const processRecord = resolveActiveProcess(state, cwd);
        if (processRecord) {
          saveBugHuntState({
            ...state,
            status: "stopping",
            stopRequested: true,
            lastSummary: "stop requested from slash command",
          }, cwd);
          await stopBackgroundProcess({
            cwd,
            id: processRecord.id,
          });
          saveBugHuntState({
            ...loadBugHuntState(cwd),
            status: "stopped",
            currentStage: "idle",
            stopRequested: true,
            stoppedAt: new Date().toISOString(),
            lastSummary: "stopped from slash command",
          }, cwd);
        }
        ctx.ui?.notify?.("bug-hunt stop requested", "info");
        return;
      }

      if (parsed.mode === "status") {
        const state = loadBugHuntState(ctx.cwd);
        ctx.ui?.notify?.(formatState(state, resolveActiveProcess(state, ctx.cwd)), "info");
        return;
      }

      const result = await startBugHuntRun({
        task: parsed.task,
        parallelism: parsed.parallelism,
      }, ctx);
      ctx.ui?.notify?.(result.content[0]?.text ?? "bug-hunt start completed", "info");
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
