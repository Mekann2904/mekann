/**
 * path: .pi/extensions/long-running-supervisor.ts
 * role: long-running session の journal、resume、preflight、supervisor sweep を pi に公開する
 * why: 長時間自走の crash-resume と unattended preflight を root task 単位で閉じるため
 * related: .pi/lib/long-running-supervisor.ts, .pi/extensions/workspace-verification.ts, .pi/extensions/background-process.ts, tests/unit/extensions/long-running-supervisor.test.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  beginLongRunningSession,
  createLongRunningReplay,
  finalizeLongRunningSession,
  formatLongRunningPreflight,
  formatLongRunningReplay,
  heartbeatLongRunningSession,
  recordLongRunningAgentLifecycle,
  recordLongRunningEvent,
  recordLongRunningToolCall,
  recordLongRunningToolResult,
  runLongRunningPreflight,
  runLongRunningSupervisorSweep,
} from "../lib/long-running-supervisor.js";

let isInitialized = false;
let currentSessionId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const EXECUTION_GATED_TOOLS = new Set([
  "loop_run",
  "subagent_run",
  "subagent_run_parallel",
  "subagent_run_dag",
]);

function stopHeartbeatTimer(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeatTimer(cwd: string): void {
  stopHeartbeatTimer();
  if (!currentSessionId) {
    return;
  }

  heartbeatTimer = setInterval(() => {
    if (!currentSessionId) {
      return;
    }
    heartbeatLongRunningSession({
      cwd,
      sessionId: currentSessionId,
    });
  }, 30_000);
  heartbeatTimer.unref?.();
}

function buildResumePrompt(cwd: string): string {
  const replay = createLongRunningReplay(cwd);
  const preflight = runLongRunningPreflight(cwd);

  if (!replay.session && replay.workspaceVerification.phase === "clear" && preflight.ok) {
    return "";
  }

  return [
    "<!-- LONG_RUNNING_SUPERVISOR -->",
    "## Long-Running Supervisor",
    "",
    "このワークスペースには durable replay 情報があります。",
    "次の方針で再開してください。",
    "",
    formatLongRunningReplay(replay).trim(),
    "",
    formatLongRunningPreflight(preflight).trim(),
  ].join("\n");
}

export default function registerLongRunningSupervisor(pi: ExtensionAPI) {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("session_start", async (_event, ctx) => {
    const { session, sweep } = await beginLongRunningSession({
      cwd: ctx.cwd,
    });
    currentSessionId = session.id;
    startHeartbeatTimer(ctx.cwd);

    if (sweep.recoveredSessionId) {
      ctx.ui?.notify?.(`Recovered crashed long-running session: ${sweep.recoveredSessionId}`, "warning");
    }
    if (sweep.warnings.length > 0) {
      ctx.ui?.notify?.(sweep.warnings.join(" | "), "info");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const block = buildResumePrompt(ctx.cwd);
    if (!block) {
      return;
    }

    const currentPrompt = event.systemPrompt ?? "";
    if (currentPrompt.includes("LONG_RUNNING_SUPERVISOR")) {
      return;
    }

    return {
      systemPrompt: `${currentPrompt}\n\n${block}`.trim(),
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if (EXECUTION_GATED_TOOLS.has(toolName)) {
      const preflight = runLongRunningPreflight(ctx.cwd);
      if (!preflight.ok) {
        recordLongRunningEvent(ctx.cwd, {
          type: "tool_call",
          toolName,
          summary: `blocked by long-running preflight: ${toolName}`,
          success: false,
          details: {
            blockers: preflight.blockers,
          },
        });
        return {
          block: true,
          reason: `long-running preflight blocked ${toolName}: ${preflight.blockers.join(" | ")}`,
        };
      }
    }

    if (currentSessionId) {
      heartbeatLongRunningSession({
        cwd: ctx.cwd,
        sessionId: currentSessionId,
        toolName,
      });
      recordLongRunningToolCall(ctx.cwd, currentSessionId, event);
    }
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!currentSessionId) {
      return;
    }
    recordLongRunningToolResult(ctx.cwd, currentSessionId, event);
  });

  pi.on("agent_start", async (_event, ctx) => {
    if (!currentSessionId) {
      return;
    }
    recordLongRunningAgentLifecycle(ctx.cwd, currentSessionId, true);
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!currentSessionId) {
      return;
    }
    recordLongRunningAgentLifecycle(ctx.cwd, currentSessionId, false);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    stopHeartbeatTimer();
    if (currentSessionId) {
      finalizeLongRunningSession(ctx?.cwd, currentSessionId, "clean_shutdown");
    }
    currentSessionId = null;
    isInitialized = false;
  });

  pi.registerTool({
    name: "long_running_status",
    label: "Long Running Status",
    description: "Show the latest root-session replay, checkpoint, and recovery hints.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const replay = createLongRunningReplay(ctx.cwd);
      return {
        content: [{ type: "text", text: formatLongRunningReplay(replay) }],
        details: replay,
      };
    },
  });

  pi.registerTool({
    name: "long_running_preflight",
    label: "Long Running Preflight",
    description: "Check whether the current workspace can finish unattended without approval or review gates.",
    parameters: Type.Object({
      task: Type.Optional(Type.String({ description: "Optional root task summary" })),
      requestedTools: Type.Optional(Type.Array(Type.String({ description: "Optional tool names expected during the run" }))),
      nonInteractive: Type.Optional(Type.Boolean({ description: "Treat ask decisions as blockers" })),
      requireVerification: Type.Optional(Type.Boolean({ description: "Include workspace verification gates" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = runLongRunningPreflight({
        cwd: ctx.cwd,
        task: params.task,
        requestedTools: params.requestedTools,
        nonInteractive: params.nonInteractive,
        requireVerification: params.requireVerification,
      });
      return {
        content: [{ type: "text", text: formatLongRunningPreflight(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "long_running_resume",
    label: "Long Running Resume",
    description: "Return the durable replay input for the latest long-running session.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const replay = createLongRunningReplay(ctx.cwd);
      return {
        content: [{ type: "text", text: formatLongRunningReplay(replay) }],
        details: replay,
      };
    },
  });

  pi.registerTool({
    name: "long_running_supervisor",
    label: "Long Running Supervisor",
    description: "Run orphan cleanup and stale-session recovery sweep immediately.",
    parameters: Type.Object({
      reclaimBackgroundOrphans: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runLongRunningSupervisorSweep({
        cwd: ctx.cwd,
        reclaimBackgroundOrphans: params.reclaimBackgroundOrphans,
      });
      return {
        content: [{
          type: "text",
          text: [
            "# Long-Running Supervisor Sweep",
            "",
            `warnings: ${result.warnings.length}`,
            `running_background_processes: ${result.background.runningCount}`,
            `orphaned_background_processes: ${result.background.orphanedCount}`,
            `reclaimed_background_processes: ${result.background.reclaimedCount}`,
            `active_subagent_runs: ${result.subagents.activeCount}`,
            `orphaned_subagent_runs: ${result.subagents.orphanedCount}`,
            `recovered_subagent_runs: ${result.subagents.recoveredCount}`,
            `recovered_session_id: ${result.recoveredSessionId ?? "-"}`,
          ].join("\n"),
        }],
        details: result,
      };
    },
  });
}
