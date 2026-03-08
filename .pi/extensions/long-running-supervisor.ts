/**
 * path: .pi/extensions/long-running-supervisor.ts
 * role: long-running session の journal、resume、preflight、supervisor sweep を pi に公開する
 * why: 長時間自走の crash-resume と unattended preflight を root task 単位で閉じるため
 * related: .pi/lib/long-running-supervisor.ts, .pi/extensions/workspace-verification.ts, .pi/extensions/background-process.ts, tests/unit/extensions/long-running-supervisor.test.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { applyPromptStack } from "../lib/agent/prompt-stack.js";
import type { PromptStackEntry } from "../lib/agent/prompt-stack.js";
import {
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
} from "../lib/agent/runtime-notifications.js";
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
import {
  createWorkpad,
  loadWorkflowDocument,
  updateWorkpad,
} from "../lib/workflow-workpad.js";
import {
  queueSymphonyIssueRetry,
  releaseSymphonyIssue,
  startSymphonyIssueRun,
} from "../lib/symphony-orchestrator-state.js";

let isInitialized = false;
let currentSessionId: string | null = null;
let currentWorkpadId: string | null = null;
let currentIssueId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const EXECUTION_GATED_TOOLS = new Set([
  "loop_run",
  "subagent_run",
  "subagent_run_parallel",
  "subagent_run_dag",
]);
const VERIFICATION_TOOLS = new Set([
  "workspace_verify",
  "workspace_verify_ack",
  "workspace_verify_review",
  "workspace_verify_review_ack",
  "workspace_verify_replay",
  "workspace_verify_replan",
]);

function formatWorkpadLine(label: string, detail?: string): string {
  return detail?.trim()
    ? `- ${label}: ${detail.trim()}`
    : `- ${label}`;
}

function summarizeValue(value: unknown, maxLength: number = 160): string {
  const text = typeof value === "string"
    ? value
    : value == null
      ? ""
      : JSON.stringify(value);
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 3)}...`;
}

function readEventInput(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") {
    return {};
  }
  const input = (event as { input?: unknown }).input;
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function pickFirstString(
  input: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function extractIssueId(input: Record<string, unknown>): string | undefined {
  const issueId = pickFirstString(input, ["issue_id", "issueId", "task_id", "taskId", "id"]);
  return issueId || undefined;
}

function extractRootTask(toolName: string, event: unknown): string | null {
  const input = readEventInput(event);
  const direct = pickFirstString(input, [
    "task",
    "title",
    "summary",
    "goal",
    "description",
    "prompt",
    "next_step",
    "nextStep",
  ]);
  if (direct) {
    return summarizeValue(direct);
  }

  const nestedTask = input.task;
  if (nestedTask && typeof nestedTask === "object") {
    const nested = pickFirstString(nestedTask as Record<string, unknown>, [
      "title",
      "task",
      "summary",
      "description",
    ]);
    if (nested) {
      return summarizeValue(nested);
    }
  }

  return EXECUTION_GATED_TOOLS.has(toolName) ? `Auto-run via ${toolName}` : null;
}

function ensureActiveWorkpad(cwd: string, toolName: string, event: unknown): string | null {
  if (currentWorkpadId) {
    return currentWorkpadId;
  }

  const workflow = loadWorkflowDocument(cwd);
  if (!workflow.exists) {
    return null;
  }

  const task = extractRootTask(toolName, event);
  if (!task) {
    return null;
  }

  const input = readEventInput(event);
  const issueId = extractIssueId(input) ?? null;
  const record = createWorkpad(cwd, {
    task,
    source: `auto:${toolName}`,
    issueId: issueId ?? undefined,
  });
  currentWorkpadId = record.metadata.id;
  currentIssueId = issueId;

  updateWorkpad(cwd, {
    id: record.metadata.id,
    section: "progress",
    content: formatWorkpadLine("auto-started", `tool=${toolName}`),
    mode: "append",
  });
  updateWorkpad(cwd, {
    id: record.metadata.id,
    section: "next",
    content: formatWorkpadLine("next", "inspect the latest execution loop and collect proof artifacts"),
    mode: "replace",
  });

  return currentWorkpadId;
}

function appendToWorkpad(
  cwd: string,
  section: "progress" | "verification" | "review" | "next",
  content: string,
): void {
  if (!currentWorkpadId) {
    return;
  }
  updateWorkpad(cwd, {
    id: currentWorkpadId,
    section,
    content,
    mode: "append",
  });
}

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

function buildResumeEntries(cwd: string): PromptStackEntry[] {
  const replay = createLongRunningReplay(cwd);
  const preflight = runLongRunningPreflight(cwd);
  const entries: PromptStackEntry[] = [];

  if (!replay.session && replay.workspaceVerification.phase === "clear" && preflight.ok) {
    return entries;
  }

  const supervisorBlock = [
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

  entries.push({
    source: "long-running-supervisor-context",
    recordSource: "long-running-supervisor-context",
    layer: "startup-context",
    markerId: `long-running-supervisor:${replay.session?.id ?? "none"}:${preflight.ok ? "ok" : "blocked"}`,
    content: supervisorBlock,
  });

  const notifications = [
    createRuntimeNotification(
      "long-running-resume",
      replay.session
        ? `resume=${replay.nextAction || "latest checkpoint"}; session=${replay.session.id}; status=${replay.session.status}`
        : "",
      replay.session?.status === "crashed" ? "warning" : "info",
      1,
    ),
    createRuntimeNotification(
      "long-running-preflight",
      (
        preflight.ok
          ? preflight.warnings.length > 0
            ? `preflight ok with warnings: ${preflight.warnings.slice(0, 2).join(" | ")}`
            : "preflight ok; unattended run may continue"
          : `preflight blocked: ${preflight.blockers.slice(0, 3).join(" | ")}`
      ),
      preflight.ok ? "info" : "critical",
      1,
    ),
  ].filter((notification): notification is NonNullable<typeof notification> => Boolean(notification));

  const notificationBlock = formatRuntimeNotificationBlock(notifications);
  if (notificationBlock) {
    entries.push({
      source: "long-running-supervisor-notification",
      recordSource: "long-running-supervisor-notification",
      layer: "runtime-notification",
      markerId: `long-running-supervisor-notification:${replay.session?.id ?? "none"}:${preflight.ok ? "ok" : "blocked"}`,
      content: notificationBlock,
    });
  }

  return entries;
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
    currentWorkpadId = null;
    currentIssueId = null;
    startHeartbeatTimer(ctx.cwd);

    if (sweep.recoveredSessionId) {
      ctx.ui?.notify?.(`Recovered crashed long-running session: ${sweep.recoveredSessionId}`, "warning");
    }
    if (sweep.warnings.length > 0) {
      ctx.ui?.notify?.(sweep.warnings.join(" | "), "info");
    }
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const entries = buildResumeEntries(ctx.cwd);
    if (entries.length === 0) {
      return;
    }

    const result = applyPromptStack(event.systemPrompt ?? "", entries);
    if (result.appliedEntries.length === 0) {
      return;
    }

    return {
      systemPrompt: result.systemPrompt,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    ensureActiveWorkpad(ctx.cwd, toolName, event);

    if (EXECUTION_GATED_TOOLS.has(toolName)) {
      const preflight = runLongRunningPreflight(ctx.cwd);
      if (!preflight.ok) {
        if (currentIssueId) {
          queueSymphonyIssueRetry({
            cwd: ctx.cwd,
            issueId: currentIssueId,
            source: "long-running-supervisor",
            reason: `preflight blocked ${toolName}: ${preflight.blockers.join(" | ")}`,
            retryAttempt: 1,
            sessionId: currentSessionId ?? undefined,
            workpadId: currentWorkpadId ?? undefined,
          });
        }
        appendToWorkpad(
          ctx.cwd,
          "review",
          formatWorkpadLine("preflight blocked", `${toolName} :: ${preflight.blockers.join(" | ")}`),
        );
        appendToWorkpad(
          ctx.cwd,
          "next",
          formatWorkpadLine("next", "resolve the preflight blockers before starting another unattended execution"),
        );
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
    if (EXECUTION_GATED_TOOLS.has(toolName) && currentIssueId) {
      startSymphonyIssueRun({
        cwd: ctx.cwd,
        issueId: currentIssueId,
        source: "long-running-supervisor",
        reason: `execution tool started: ${toolName}`,
        sessionId: currentSessionId ?? undefined,
        workpadId: currentWorkpadId ?? undefined,
      });
    }
    if (currentWorkpadId && toolName) {
      const input = readEventInput(event);
      const detail = summarizeValue(
        pickFirstString(input, ["task", "title", "summary", "description", "command"])
        ?? pickFirstString(input, ["prompt"])
        ?? "",
      );
      appendToWorkpad(
        ctx.cwd,
        "progress",
        formatWorkpadLine(`tool_call ${toolName}`, detail || undefined),
      );
    }
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!currentSessionId) {
      return;
    }
    recordLongRunningToolResult(ctx.cwd, currentSessionId, event);
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    const isError = Boolean((event as { isError?: unknown })?.isError);
    const detail = summarizeValue(
      (event as { result?: unknown; output?: unknown; error?: unknown }).error
      ?? (event as { result?: unknown; output?: unknown }).result
      ?? (event as { output?: unknown }).output,
    );

    if (toolName === "workspace_verify") {
      if (currentIssueId) {
        if (isError) {
          queueSymphonyIssueRetry({
            cwd: ctx.cwd,
            issueId: currentIssueId,
            source: "long-running-supervisor",
            reason: "workspace_verify failed",
            retryAttempt: 1,
            sessionId: currentSessionId ?? undefined,
            workpadId: currentWorkpadId ?? undefined,
          });
        } else {
          releaseSymphonyIssue({
            cwd: ctx.cwd,
            issueId: currentIssueId,
            source: "long-running-supervisor",
            reason: "workspace_verify passed",
            sessionId: currentSessionId ?? undefined,
            workpadId: currentWorkpadId ?? undefined,
          });
        }
      }
      appendToWorkpad(
        ctx.cwd,
        "verification",
        formatWorkpadLine(
          isError ? "workspace_verify failed" : "workspace_verify passed",
          detail || undefined,
        ),
      );
      appendToWorkpad(
        ctx.cwd,
        "next",
        formatWorkpadLine(
          "next",
          isError
            ? "repair the failing verification step and rerun workspace_verify"
            : "inspect artifacts and close the remaining review loop",
        ),
      );
      return;
    }

    if (VERIFICATION_TOOLS.has(toolName)) {
      appendToWorkpad(
        ctx.cwd,
        "verification",
        formatWorkpadLine(
          `${toolName} ${isError ? "failed" : "completed"}`,
          detail || undefined,
        ),
      );
      return;
    }

    appendToWorkpad(
      ctx.cwd,
      "progress",
      formatWorkpadLine(
        `tool_result ${toolName || "unknown"}`,
        isError ? `error ${detail}`.trim() : detail || "ok",
      ),
    );
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
    if (currentWorkpadId) {
      appendToWorkpad(
        ctx.cwd,
        "review",
        formatWorkpadLine("session shutdown", currentSessionId ?? undefined),
      );
      appendToWorkpad(
        ctx.cwd,
        "next",
        formatWorkpadLine("next", "resume from the latest progress or verification artifact if more work remains"),
      );
    }
    if (currentIssueId) {
      releaseSymphonyIssue({
        cwd: ctx.cwd,
        issueId: currentIssueId,
        source: "long-running-supervisor",
        reason: "session shutdown",
        sessionId: currentSessionId ?? undefined,
        workpadId: currentWorkpadId ?? undefined,
      });
    }
    currentSessionId = null;
    currentWorkpadId = null;
    currentIssueId = null;
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
