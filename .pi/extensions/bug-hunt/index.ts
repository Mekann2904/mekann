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
    taskPrompt: input.taskPrompt,
    model: input.model,
  };
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
      provider: Type.Optional(Type.String({ description: "Provider override" })),
      model: Type.Optional(Type.String({ description: "Model override" })),
      thinkingLevel: Type.Optional(Type.String({ description: "Thinking level override" })),
      restartIfRunning: Type.Optional(Type.Boolean({ description: "Restart the current run if one is already active" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      const current = loadBugHuntState(cwd);
      const currentProcess = resolveActiveProcess(current, cwd);

      if (currentProcess?.status === "running" && !params.restartIfRunning) {
        return {
          content: [{
            type: "text",
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
            type: "text",
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
        timeoutMs: params.timeoutMs ?? current.timeoutMs ?? createDefaultBugHuntState().timeoutMs,
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
            type: "text",
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
            type: "text",
            text: formatState(failedState, null),
          }],
          details: {
            state: failedState,
            process: null,
          },
        };
      }
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
    description: "Control the persistent bug hunt loop (start|status|stop)",
    handler: async (args, ctx) => {
      const command = args.trim().toLowerCase();
      if (command === "stop") {
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

      if (command === "status") {
        const state = loadBugHuntState(ctx.cwd);
        ctx.ui?.notify?.(formatState(state, resolveActiveProcess(state, ctx.cwd)), "info");
        return;
      }

      ctx.ui?.notify?.("Use bug_hunt_start for full options, or /bug-hunt status|stop.", "info");
    },
  });

  pi.on("session_shutdown", async () => {
    isInitialized = false;
  });
}
