/**
 * Subagent Extension — Multi-agent execution system for pi.
 *
 * Allows a parent agent to delegate work to subagents. The default tool is
 * synchronous; advanced tools can still spawn asynchronously, communicate via
 * mailboxes/events, and manage a registry with resource limits.
 *
 * Tools: delegate_agent, spawn_agent, message_agent, wait_agent,
 *        list_agents, close_agent, agent_results
 * Commands: /agents, /wait-agent, /close-agent
 *
 * Usage:
 *   delegate_agent({ task_name:"research/api_scan", message:"API 層を調査して" })
 *   spawn_agent({ task_name:"research/api_scan", message:"API 層を調査して" })
 *   list_agents()
 *   wait_agent({ timeout_ms: 30000 })
 *   message_agent({ target:"research/api_scan", message:"auth 周辺も確認して", mode:"task" })
 *   close_agent({ target:"/root/research/api_scan" })
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { AgentControl } from "./agentControl.js";
import { SubagentClient } from "./ipc.js";
import { formatAgentList, formatWaitResult } from "./types.js";
import type { DelegateAgentParams, DelegateAgentResult, SpawnParams, SpawnResult } from "./types.js";
import { extractLastAssistantText } from "./contextFork.js";
import type { ForkTurns } from "./contextFork.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";
import { featureStringValue, isFeatureEnabled } from "../../settings/enabled.js";
import { setToolsActive } from "../../settings/toolSurface.js";
import { projectFeatureToolSurface } from "../../settings/toolSurfaceProjection.js";
import { registerSubagentFlags } from "./flags.js";
import { registerSubagentPromptProvider } from "./promptProvider.js";
import { AgentResultsSchema, CloseAgentSchema, DelegateAgentSchema, ListAgentsSchema, MessageAgentSchema, SpawnSchema, WaitAgentSchema } from "./schemas.js";
import { createSubagentControl } from "./controlFactory.js";

let sharedSpawnAgent: ((params: SpawnParams, ctx: ExtensionContext) => Promise<SpawnResult>) | undefined;
let sharedDelegateAgent: ((params: DelegateAgentParams, ctx: ExtensionContext) => Promise<DelegateAgentResult>) | undefined;

const SUBAGENT_DELEGATE_TOOL_NAMES = ["delegate_agent"] as const;
const SUBAGENT_MANAGEMENT_TOOL_NAMES = ["spawn_agent", "message_agent", "wait_agent", "list_agents", "close_agent"] as const;
const SUBAGENT_RESULT_TOOL_NAMES = ["agent_results"] as const;

export async function spawnAgentFromFeature(params: SpawnParams, ctx: ExtensionContext): Promise<SpawnResult> {
  if (!sharedSpawnAgent) throw new Error("subagent feature is not initialized");
  return sharedSpawnAgent(params, ctx);
}

export async function delegateAgentFromFeature(params: DelegateAgentParams, ctx: ExtensionContext): Promise<DelegateAgentResult> {
  if (!sharedDelegateAgent) throw new Error("subagent feature is not initialized");
  return sharedDelegateAgent(params, ctx);
}

// ─── Extension entry point ───────────────────────────────────────

export default function subagentExtension(pi: ExtensionAPI): void | Promise<void> {
  if (!isFeatureEnabled("subagent")) return;

  registerSubagentPromptProvider();
  if (process.env.PI_SUBAGENT_ROLE === "child") {
    const g = globalThis as typeof globalThis & { __piSubagentChildStarted?: boolean };
    if (!g.__piSubagentChildStarted) {
      g.__piSubagentChildStarted = true;
      // Return the Promise so pi awaits it before emitting session_start.
      // Without this, session_start fires before IPC handlers are registered
      // and the child never sends hello / never receives the initial message.
      return startChildMode(pi);
    }
    return;
  }

  let control: AgentControl | null = null;
  const asyncToolsEnabled = featureStringValue("subagent", "toolSurface", MEKANN_SUBAGENT_DEFAULTS.toolSurface) === "async-tools";

  // ─── Flags ────────────────────────────────────────────────────

  const extensionPathDefault = fileURLToPath(import.meta.url);
  registerSubagentFlags(pi, extensionPathDefault);

  // ─── Helper: ensure control is initialized ────────────────────

  function ensureControl(): AgentControl {
    if (!control) control = createSubagentControl(pi, extensionPathDefault);
    return control;
  }

  // ─── Helper: convert fork_turns from raw params ──────────────

  function parseForkTurns(raw: unknown): ForkTurns {
    if (raw === undefined || raw === null) return 0;
    if (raw === "all") return "all";
    if (raw === "none") return "none";
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
    return 0;
  }

  function toolResult(text: string, result: unknown) {
    return { content: [{ type: "text", text }], details: result };
  }

  function compactWaitResult(result: any) {
    return {
      timed_out: result.timed_out,
      event_count: result.events.length,
      mailbox_count: result.mailbox.length,
      events: result.events.map((e: any) => ({
        type: e.type,
        agentPath: "agentPath" in e ? e.agentPath : undefined,
        ...(e.type === "agent_status_changed" ? { previousStatus: e.previousStatus, newStatus: e.newStatus } : {}),
        ...(e.type === "agent_final_message" ? { message: String(e.message ?? "").slice(0, 500) } : {}),
      })),
      mailbox: result.mailbox.map((m: any) => ({ from: m.fromAgentPath, kind: m.kind, content: String(m.content ?? "").slice(0, 500) })),
    };
  }

  function hasInteractiveSubagentState(ctrl: AgentControl): boolean {
    return ctrl.listAgents().some((agent: any) => agent.agentPath !== "/root" && (agent.open || agent.unread_final_result || agent.status === "queued" || agent.status === "pending_init" || agent.status === "running"));
  }

  function hasPendingAgentResults(ctrl: AgentControl, ctx?: ExtensionContext): boolean {
    try { return ctrl.listAgentResults({ status: "pending" }, ctx).results.length > 0; }
    catch { return false; }
  }

  function syncSubagentToolSurface(ctx?: ExtensionContext): void {
    const ctrl = control;
    if (!ctrl) return;
    projectFeatureToolSurface(pi, "subagent", SUBAGENT_DELEGATE_TOOL_NAMES, "always", () => true);
    if (asyncToolsEnabled) {
      projectFeatureToolSurface(pi, "subagent", SUBAGENT_MANAGEMENT_TOOL_NAMES, "always", () => hasInteractiveSubagentState(ctrl));
      projectFeatureToolSurface(pi, "subagent", SUBAGENT_RESULT_TOOL_NAMES, "always", () => hasPendingAgentResults(ctrl, ctx));
    }
  }

  sharedSpawnAgent = async (params, ctx) => {
    try { return await ensureControl().spawn(params, ctx); }
    finally { syncSubagentToolSurface(ctx); }
  };
  sharedDelegateAgent = async (params, ctx) => {
    try { return await ensureControl().delegate(params, ctx); }
    finally { syncSubagentToolSurface(ctx); }
  };

  type ToolHandler = (ctrl: AgentControl, params: any, ctx: ExtensionContext) => Promise<any>;
  function withCtrl(handler: ToolHandler) {
    return async (_id: string, params: unknown, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) => {
      try { return await handler(ensureControl(), params, ctx); }
      finally { syncSubagentToolSurface(ctx); }
    };
  }

  // ─── Tools ────────────────────────────────────────────────────

  pi.registerTool({
    name: "delegate_agent",
    label: "Delegate to subagent",
    description:
      "Spawn a subagent and wait synchronously until its final result is available. Use this by default instead of spawn_agent so subagent results cannot be forgotten. No timeout is applied.",
    promptSnippet: "Run an independent subagent task and return its final result synchronously",
    promptGuidelines: [
      "Prefer delegate_agent over async subagent tools. It returns only after the subagent reaches a final result; no timeout is applied.",
      "Use type=scout to offload broad search into minimal verification pointers; root must verify pointers before trusting conclusions.",
      "Use type=implement to delegate bounded file-scope implementation, ideally after root has written failing TDD tests; root must verify changed files, tests, and diff.",
      "Write a self-contained English task brief with scope, constraints, expected output, and verification commands; request compact, evidence-oriented output from the subagent itself."
    ],
    parameters: DelegateAgentSchema,
    prepareArguments(args: unknown) {
      if (typeof args !== "object" || args === null) return args as any;
      const a = args as Record<string, unknown>;
      if ("fork_context" in a && !("fork_turns" in a)) {
        a.fork_turns = a.fork_context ? "all" : "none";
      }
      return a as any;
    },
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.delegate(
        {
          task_name: params.task_name,
          message: params.message,
          model: params.model,
          reasoning_effort: params.reasoning_effort,
          role: params.role,
          nickname: params.nickname,
          fork_turns: parseForkTurns(params.fork_turns),
          authority: params.authority,
          result_contract: params.result_contract,
          roi_category: params.roi_category,
          justification: params.justification,
          cost_intent: params.cost_intent,
          type: params.type,
        },
        ctx,
      );
      const text = result.final_result ?? JSON.stringify({ task_name: result.task_name, status: result.status }, null, 2);
      return toolResult(text, result);
    }),
  });

  if (asyncToolsEnabled) {
  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn subagent",
    description:
      `Spawn a new subagent that runs asynchronously. Returns immediately with the agent ID and path. Up to ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents} subagents run concurrently by default; excess spawns are queued FIFO up to ${MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents} queued subagents. Use wait_agent to get results.`,
    promptSnippet: "Run an independent task in a background subagent and later collect its result",
    promptGuidelines: [
      "Advanced async tool. Prefer delegate_agent unless the parent can do useful work while children run or must manage multiple children.",
      "After spawning, call wait_agent until every needed final_result is received; never answer from an uncollected subagent.",
      "Use stable task_name values; write task briefs in English and request compact structured results for the parent agent, not for humans."
    ],
    parameters: SpawnSchema,
    prepareArguments(args: unknown) {
      if (typeof args !== "object" || args === null) return args as any;
      const a = args as Record<string, unknown>;
      // Legacy: fork_context boolean → fork_turns
      if ("fork_context" in a && !("fork_turns" in a)) {
        a.fork_turns = a.fork_context ? "all" : "none";
      }
      return a as any;
    },
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.spawn(
        {
          task_name: params.task_name,
          message: params.message,
          model: params.model,
          reasoning_effort: params.reasoning_effort,
          role: params.role,
          nickname: params.nickname,
          fork_turns: parseForkTurns(params.fork_turns),
          authority: params.authority,
          result_contract: params.result_contract,
          roi_category: params.roi_category,
          justification: params.justification,
          cost_intent: params.cost_intent,
          type: params.type,
        },
        ctx,
      );
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "message_agent",
    label: "Message subagent",
    description:
      "Send a note or follow-up task to an existing subagent. mode=note queues context without starting work; mode=task triggers a turn when idle or queues the task if running.",
    promptSnippet: "Send context or a follow-up task to a subagent",
    promptGuidelines: [
      "Use mode=note only to provide additional context without triggering a new turn.",
      "Use mode=task when the subagent should do more work, refine a previous answer, or continue from its current context.",
      "Write messages to subagents in English, consistent with the initial delegation language.",
    ],
    parameters: MessageAgentSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      if (params.mode === "note") {
        const result = await ctrl.sendMessage({ target: params.target, message: params.message }, ctx);
        return toolResult(`Message delivered: ${result.delivered}`, result);
      }
      const result = await ctrl.followupTask({ target: params.target, message: params.message }, ctx);
      return toolResult(`Follow-up ${result.triggered ? "triggered new turn" : "queued"}: queued=${result.queued}, triggered=${result.triggered}`, result);
    }),
  });

  pi.registerTool({
    name: "wait_agent",
    label: "Wait for subagent updates",
    description:
      "Wait for mailbox messages and/or lifecycle events from subagents. Returns immediately if pending, otherwise waits up to timeout.",
    promptSnippet: "Collect pending subagent updates or wait for new results",
    promptGuidelines: [
      "Use wait_agent after spawning subagents to collect lifecycle events and mailbox messages. It returns immediately if updates are pending; otherwise it waits up to timeout_ms.",
      "Use reasonable timeouts: short waits for quick checks, longer waits for substantial research. Do not block indefinitely.",
      "A mailbox item with kind: final_result is the child agent's completed answer. Read it and incorporate it into your response or next plan. Normally you do not need to call close_agent because completed subagents are cleaned up automatically.",
      "A timeout from wait_agent is not an error. It only means no new subagent result arrived within timeout_ms.",
      "If wait_agent times out and a subagent is still running, continue other useful work or wait again later. Do not report timeout as a failure unless an explicit error event is returned. Do not invent missing results.",
    ],
    parameters: WaitAgentSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.wait(params, ctx);
      const compact = compactWaitResult(result);
      return toolResult(JSON.stringify(compact, null, 2), compact);
    }),
  });

  pi.registerTool({
    name: "list_agents",
    label: "List subagents",
    description: "List all agents, optionally filtered by path prefix.",
    promptSnippet: "Inspect subagent paths, statuses, and last tasks",
    promptGuidelines: [
      "Use list_agents when you are unsure which subagents exist, need to verify status, need a target path for message_agent/close_agent, or need to diagnose duplicate task_name errors.",
    ],
    parameters: ListAgentsSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = ctrl.list(params, ctx);
      const unreadCount = result.agents.filter((a) => a.unread_final_result).length;
      const header = unreadCount > 0 ? `Unread final_results: ${unreadCount}. Run wait_agent to collect them.\n` : "";
      return toolResult(result.agents.length === 0 ? "(no agents)" : header + result.agents.map((a) => `${a.status === "completed" || a.status === "shutdown" ? "○" : "●"} ${a.agent_path}${a.nickname ? ` (${a.nickname})` : ""}${a.role ? ` [${a.role}]` : ""} — ${a.status}${a.unread_final_result ? " — unread final_result" : ""}${a.authority ? ` — authority:${a.authority.mode}/${a.authority_enforced === false ? "not_enforced" : "enforced"}` : ""}${a.display ? ` — display: ${a.display.status === "failed" ? `${a.display.kind}/failed: ${a.display.error}` : `${a.display.kind}/${a.display.status}${a.display.pid ? ` pid=${a.display.pid}` : ""}${a.display.window_id ? ` window=${a.display.window_id}` : ""}`}` : ""}${a.last_task ? `\n  last: ${a.last_task.slice(0, 80)}` : ""}`).join("\n"), result);
    }),
  });

  pi.registerTool({
    name: "agent_results",
    label: "Manage subagent results",
    description: "List, show, apply, reject, or retry stored structured subagent results.",
    parameters: AgentResultsSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      let result: unknown;
      switch (params.action) {
        case "list":
          result = ctrl.listAgentResults({ status: params.status, outcome: params.outcome, agent_path: params.agent_path }, ctx);
          break;
        case "show":
          if (!params.result_id) throw new Error("result_id is required for action=show");
          result = ctrl.showAgentResult({ result_id: params.result_id, include_patch: params.include_patch }, ctx);
          break;
        case "apply":
          result = await ctrl.applyAgentResults({ source: params.source, result_ids: params.result_ids, order: params.order, max_results: params.max_results, rollback_on_failure: params.rollback_on_failure, allow_high_risk: params.allow_high_risk }, ctx);
          break;
        case "reject":
          if (!params.result_id) throw new Error("result_id is required for action=reject");
          result = ctrl.rejectAgentResult({ result_id: params.result_id, reason: params.reason }, ctx);
          break;
        case "retry":
          if (!params.result_id) throw new Error("result_id is required for action=retry");
          result = await ctrl.retryAgentResult({ result_id: params.result_id, reason: params.reason }, ctx);
          break;
        default:
          throw new Error(`Unknown agent_results action: ${String(params.action)}`);
      }
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "close_agent",
    label: "Close subagent",
    description:
      "Close a subagent and all its open descendants. Aborts any running operations.",
    promptSnippet: "Abort or dispose a subagent and its descendants",
    promptGuidelines: [
      "Use close_agent only when the user asks to cancel/stop a subagent, or when an agent appears stuck and should be aborted.",
      "Do not call close_agent after every successful final_result; completed subagents are cleaned up automatically.",
      "close_agent aborts running work for the target and its descendants. Do not close an active subagent prematurely unless cancellation is intended.",
    ],
    parameters: CloseAgentSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.close(params, ctx);
      return toolResult(`Closed: ${result.closed.join(", ")}`, result);
    }),
  });

  }

  // ─── Commands ─────────────────────────────────────────────────

  pi.registerCommand("agents", {
    description: "List all subagents with status",
    async handler(args, ctx) {
      const ctrl = ensureControl();
      const prefix = args?.trim() || undefined;
      const agents = ctrl.listAgents(prefix);
      const lines = formatAgentList(agents);
      ctx.ui.notify(lines.join("\n"), "info");
      syncSubagentToolSurface(ctx as any);
    },
  });

  pi.registerCommand("wait-agent", {
    description: "Wait for subagent updates (with optional timeout)",
    async handler(args, ctx) {
      const ctrl = ensureControl();
      const timeoutMs = args?.trim() ? Number(args.trim()) : undefined;
      const result = await ctrl.wait(
        { timeout_ms: timeoutMs },
        ctx as any,
      );
      const lines = formatWaitResult(
        result.events,
        result.mailbox,
        result.timed_out,
      );
      ctx.ui.notify(lines.join("\n"), "info");
      syncSubagentToolSurface(ctx as any);
    },
  });

  pi.registerCommand("focus-agent", {
    description: "Focus a subagent display window",
    async handler(args, ctx) {
      const target = args?.trim();
      if (!target) {
        ctx.ui.notify("Usage: /focus-agent <target_path>", "warning");
        return;
      }
      const result = await ensureControl().focus(target, ctx as any);
      ctx.ui.notify(result.focused ? `Focused: ${target}` : (result.warning ?? `No display for ${target}`), result.focused ? "info" : "warning");
      syncSubagentToolSurface(ctx as any);
    },
  });

  pi.registerCommand("close-agent", {
    description: "Close a subagent by path",
    async handler(args, ctx) {
      const target = args?.trim();
      if (!target) {
        ctx.ui.notify("Usage: /close-agent <target_path>", "warning");
        return;
      }
      const ctrl = ensureControl();
      try {
        const result = await ctrl.close(
          { target },
          ctx as any,
        );
        ctx.ui.notify(`Closed: ${result.closed.join(", ")}`, "info");
      } catch (err) {
        ctx.ui.notify(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
          "error",
        );
      } finally {
        syncSubagentToolSurface(ctx as any);
      }
    },
  });

  // ─── Lifecycle ────────────────────────────────────────────────

  async function shutdownControl() {
    if (control) { await control.shutdown(); control = null; }
  }

  pi.on("session_start", async (_event, ctx) => {
    await shutdownControl();
    ensureControl();
    control!.registry.ensureRoot("root");
    syncSubagentToolSurface(ctx as any);
  });

  pi.on("session_shutdown", async () => {
    setToolsActive(pi, [...SUBAGENT_DELEGATE_TOOL_NAMES, ...SUBAGENT_MANAGEMENT_TOOL_NAMES, ...SUBAGENT_RESULT_TOOL_NAMES], false);
    await shutdownControl();
  });
}
async function startChildMode(pi: ExtensionAPI): Promise<void> {
  const agentId = process.env.PI_SUBAGENT_ID;
  const agentPath = process.env.PI_SUBAGENT_PATH;
  const socketPath = process.env.PI_SUBAGENT_PARENT_SOCKET;
  const initialMessage = process.env.PI_SUBAGENT_INITIAL_MESSAGE ?? "";
  const nonce = process.env.PI_SUBAGENT_NONCE;
  if (!agentId || !agentPath || !socketPath) {
    console.error("subagent child mode requires PI_SUBAGENT_ID, PI_SUBAGENT_PATH, and PI_SUBAGENT_PARENT_SOCKET");
    process.exitCode = 1;
    return;
  }

  const client = new SubagentClient(socketPath, agentId, agentPath);
  let connected = false;
  let currentCtx: ExtensionContext | undefined;
  let initialSent = false;

  async function safeSend(message: Parameters<SubagentClient["send"]>[0]): Promise<void> {
    if (!connected) return;
    try { await client.send(message); } catch { /* parent may have gone away */ }
  }

  try {
    await client.connect();
    connected = true;
  } catch (err) {
    console.error(`subagent child IPC error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  client.onMessage((msg) => {
    if (msg.type === "shutdown") {
      void safeSend({ type: "status", agentId, status: "shutdown" })
        .finally(() => client.close())
        .finally(() => currentCtx?.shutdown?.());
      return;
    }
    if (msg.type === "message") {
      pi.sendMessage({
        customType: "subagent_message",
        content: `[Message from ${msg.fromAgentPath}]: ${msg.message}`,
        display: true,
      }, { deliverAs: "nextTurn", triggerTurn: false });
      return;
    }
    if (msg.type === "followup") {
      const idle = currentCtx?.isIdle?.() ?? true;
      pi.sendUserMessage(`[Follow-up from parent]: ${msg.message}`, idle ? undefined : { deliverAs: "followUp" });
      void safeSend({ type: "status", agentId, status: "running" });
      return;
    }
    if (msg.type === "interrupt") {
      try { currentCtx?.abort?.(); }
      catch (err) { void safeSend({ type: "error", id: msg.id, agentId, message: err instanceof Error ? err.message : String(err) }); }
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    const capabilities = ["hello", "status", "shutdown", "message", "followup", "interrupt"];
    await safeSend({ type: "hello", agentId, agentPath, pid: process.pid, cwd: ctx.cwd, capabilities, nonce });
    await safeSend({ type: "status", agentId, status: "running" });
    if (initialMessage && !initialSent) {
      initialSent = true;
      queueMicrotask(() => {
        try { pi.sendUserMessage(initialMessage); }
        catch (err) { void safeSend({ type: "error", agentId, message: `initial prompt failed: ${err instanceof Error ? err.message : String(err)}` }); }
      });
    }
  });

  pi.on("agent_start", async () => {
    await safeSend({ type: "status", agentId, status: "running" });
  });

  pi.on("agent_end", async (event) => {
    const msgs = (event as any).messages as Array<{ role: string; content: unknown }> | undefined;
    const finalText = extractLastAssistantText(msgs) ?? undefined;
    await safeSend({ type: "status", agentId, status: "completed" });
    await safeSend({ type: "final", agentId, status: "completed", message: finalText ?? "(agent completed)" });
  });

  pi.on("session_shutdown", async () => {
    await safeSend({ type: "status", agentId, status: "shutdown" });
    await client.close();
    connected = false;
  });
}
