/**
 * Subagent Extension — Multi-agent execution system for pi.
 *
 * Allows a parent agent to spawn subagents that run asynchronously,
 * communicate via mailboxes/events, and are managed through a registry
 * with resource limits.
 *
 * Tools: spawn_agent, send_message, followup_task, wait_agent,
 *        list_agents, close_agent
 * Commands: /agents, /wait-agent, /close-agent
 *
 * Usage:
 *   spawn_agent({ task_name:"research/api_scan", message:"API 層を調査して" })
 *   list_agents()
 *   wait_agent({ timeout_ms: 30000 })
 *   followup_task({ target:"research/api_scan", message:"auth 周辺も確認して" })
 *   close_agent({ target:"/root/research/api_scan" })
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { AgentControl } from "./agentControl.js";
import { formatAgentList, formatWaitResult } from "./render.js";
import type { ForkTurns } from "./contextFork.js";

// ─── Tool parameter schemas ──────────────────────────────────────

const SpawnSchema = Type.Object({
  task_name: Type.String({
    description:
      'Task name / path for the subagent. Relative to current agent path (e.g. "research/api_scan") or absolute (e.g. "/root/research/api_scan").',
  }),
  message: Type.String({
    description: "Initial message / task description for the subagent.",
  }),
  model: Type.Optional(
    Type.String({
      description:
        'Model override. Format: "provider/model_id" or just "model_id".',
    }),
  ),
  reasoning_effort: Type.Optional(
    Type.String({
      description:
        'Reasoning effort level: "off", "minimal", "low", "medium", "high".',
    }),
  ),
  role: Type.Optional(
    Type.String({
      description: "Optional role description for the subagent.",
    }),
  ),
  nickname: Type.Optional(
    Type.String({
      description: "Optional short nickname for the subagent.",
    }),
  ),
  fork_turns: Type.Optional(
    Type.Union([
      Type.Number({ description: "Number of recent user turns to fork (0 = none)." }),
      Type.Literal("all", { description: "Fork all parent conversation." }),
      Type.Literal("none", { description: "No context fork (default)." }),
    ], {
      description: "How much parent context to fork into the subagent. Default: none.",
    }),
  ),
});

const SendMessageSchema = Type.Object({
  target: Type.String({
    description:
      'Target agent path (e.g. "research/api_scan" or "/root/research/api_scan").',
  }),
  message: Type.String({
    description: "Message to send to the target agent.",
  }),
});

const FollowupTaskSchema = Type.Object({
  target: Type.String({
    description:
      'Target agent path (e.g. "research/api_scan").',
  }),
  message: Type.String({
    description: "Follow-up task message.",
  }),
});

const WaitAgentSchema = Type.Object({
  timeout_ms: Type.Optional(
    Type.Number({
      description: "Timeout in milliseconds. Default: 30000. Max: 600000.",
    }),
  ),
});

const ListAgentsSchema = Type.Object({
  path_prefix: Type.Optional(
    Type.String({
      description: "Filter agents by path prefix.",
    }),
  ),
});

const CloseAgentSchema = Type.Object({
  target: Type.String({
    description: 'Target agent path to close (e.g. "research/api_scan").',
  }),
});

// ─── Extension entry point ───────────────────────────────────────

export default function subagentExtension(pi: ExtensionAPI): void {
  let control: AgentControl | null = null;

  // ─── Flags ────────────────────────────────────────────────────

  pi.registerFlag("subagent-max-agents", {
    description: "Maximum number of concurrent subagents (default: 4)",
    type: "string",
    default: "4",
  });

  pi.registerFlag("subagent-max-depth", {
    description: "Maximum nesting depth for subagents (default: 2)",
    type: "string",
    default: "2",
  });

  pi.registerFlag("subagent-default-wait-timeout-ms", {
    description: "Default wait_agent timeout in ms (default: 30000)",
    type: "string",
    default: "30000",
  });

  // ─── Helper: ensure control is initialized ────────────────────

  function ensureControl(): AgentControl {
    if (!control) {
      const maxAgents = Number(pi.getFlag("subagent-max-agents")) || 4;
      const maxDepth = Number(pi.getFlag("subagent-max-depth")) || 2;
      const defaultWait = Number(pi.getFlag("subagent-default-wait-timeout-ms")) || 30000;
      control = new AgentControl(pi, maxAgents, maxDepth, defaultWait);
    }
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

  type ToolHandler = (ctrl: AgentControl, params: any, ctx: ExtensionContext) => Promise<any>;
  function withCtrl(handler: ToolHandler) {
    return async (_id: string, params: unknown, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) => handler(ensureControl(), params, ctx);
  }

  // ─── Tools ────────────────────────────────────────────────────

  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn subagent",
    description:
      "Spawn a new subagent that runs asynchronously. Returns immediately with the agent ID and path. Use wait_agent to get results.",
    promptSnippet: "Run an independent task in a background subagent and later collect its result",
    promptGuidelines: [
      "Subagents are background worker agents. Use them proactively when the user asks for parallel work, multi-agent work, independent investigations, or when a task naturally splits into separate areas that can be done concurrently.",
      "Good subagent use cases: repo-wide research across multiple components, comparing independent approaches, splitting investigation/fix/test work, running a review agent while the main agent continues implementation, or delegating a long-running exploratory task.",
      "Do not use subagents for small single-step tasks, one-file edits, simple questions, or work that requires tight step-by-step coordination with the parent. Direct tool use is better for those cases.",
      "For independent tasks, spawn all relevant subagents first, then wait for results. Avoid spawn→wait→spawn serialization unless later tasks depend on earlier results.",
      "Default workflow: spawn_agent for each independent task → continue useful parent work or spawn more agents → wait_agent to collect updates/results → summarize/merge results → followup_task if more work is needed → close_agent when finished.",
      "spawn_agent returns immediately; it does not mean the child has finished. Never claim subagent results until wait_agent returns mailbox content or a final_result.",
      "Give each subagent a stable, descriptive task_name such as research/api, research/db, fix/tests, review/security. Relative paths are resolved under /root.",
      "Write the message as a self-contained task brief: include goal, relevant files/commands, constraints, expected output format, and what not to change. Subagents may not know unstated parent context.",
      "Use fork_turns only when the recent conversation is genuinely needed by the child; otherwise include the necessary context directly in message.",
      "Respect resource limits. There is a concurrent subagent limit, so prefer a small number of high-value agents and close finished agents to free resources.",
      "If a duplicate task_name is rejected, list_agents to inspect the existing agent or close_agent before reusing that path.",
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
        },
        ctx,
      );
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "send_message",
    label: "Send message to subagent",
    description:
      "Send a message to a subagent without triggering a new turn. The message is queued in the agent's mailbox.",
    promptSnippet: "Deliver context or a note to a subagent without starting new work",
    promptGuidelines: [
      "Use send_message only to provide additional context or a note to a subagent without triggering a new turn.",
      "If you want the subagent to perform additional work, use followup_task instead of send_message.",
    ],
    parameters: SendMessageSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.sendMessage(params, ctx);
      return toolResult(`Message delivered: ${result.delivered}`, result);
    }),
  });

  pi.registerTool({
    name: "followup_task",
    label: "Send follow-up task to subagent",
    description:
      "Send a follow-up task to a subagent. If the agent is idle, triggers a new turn. If running, queues the message.",
    promptSnippet: "Ask an existing subagent to perform additional work",
    promptGuidelines: [
      "Use followup_task when an existing subagent should do more work, refine its previous answer, check another file, or continue from its current context.",
      "If the target subagent is idle, followup_task starts a new turn; if it is running, the task is queued. Use wait_agent afterward to collect the result.",
    ],
    parameters: FollowupTaskSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.followupTask(params, ctx);
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
      "A mailbox item with kind: final_result is the child agent's completed answer. Read it, incorporate it into your response or next plan, and close the agent if no more work is needed.",
      "If wait_agent times out, say that the subagent is still running and either continue other useful work or wait again. Do not invent missing results.",
    ],
    parameters: WaitAgentSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.wait(params, ctx);
      return toolResult(JSON.stringify({ timed_out: result.timed_out, event_count: result.events.length, mailbox_count: result.mailbox.length, events: result.events.map((e) => ({ type: e.type, agentPath: "agentPath" in e ? (e as any).agentPath : undefined, ...(e.type === "agent_status_changed" ? { previousStatus: (e as any).previousStatus, newStatus: (e as any).newStatus } : {}), ...(e.type === "agent_final_message" ? { message: (e as any).message } : {}) })), mailbox: result.mailbox.map((m) => ({ from: m.fromAgentPath, kind: m.kind, content: m.content.slice(0, 200) })) }, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "list_agents",
    label: "List subagents",
    description: "List all agents, optionally filtered by path prefix.",
    promptSnippet: "Inspect subagent paths, statuses, and last tasks",
    promptGuidelines: [
      "Use list_agents when you are unsure which subagents exist, need to verify status, need a target path for followup_task/close_agent, or need to diagnose duplicate task_name errors.",
    ],
    parameters: ListAgentsSchema,
    execute: withCtrl(async (ctrl, params, _ctx) => {
      const result = ctrl.list(params);
      return toolResult(result.agents.length === 0 ? "(no agents)" : result.agents.map((a) => `${a.status === "completed" || a.status === "shutdown" ? "○" : "●"} ${a.agent_path}${a.nickname ? ` (${a.nickname})` : ""}${a.role ? ` [${a.role}]` : ""} — ${a.status}${a.last_task ? `\n  last: ${a.last_task.slice(0, 80)}` : ""}`).join("\n"), result);
    }),
  });

  pi.registerTool({
    name: "close_agent",
    label: "Close subagent",
    description:
      "Close a subagent and all its open descendants. Aborts any running operations.",
    promptSnippet: "Abort or dispose a subagent and its descendants",
    promptGuidelines: [
      "Use close_agent after collecting a final result when the subagent is no longer needed, or when the user asks to stop/cancel a subagent.",
      "close_agent aborts running work for the target and its descendants. Do not close an active subagent prematurely unless cancellation is intended.",
    ],
    parameters: CloseAgentSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.close(params, ctx);
      return toolResult(`Closed: ${result.closed.join(", ")}`, result);
    }),
  });

  // ─── Commands ─────────────────────────────────────────────────

  pi.registerCommand("agents", {
    description: "List all subagents with status",
    async handler(args, ctx) {
      const ctrl = ensureControl();
      const prefix = args?.trim() || undefined;
      const agents = ctrl.listAgents(prefix);
      const lines = formatAgentList(agents);
      ctx.ui.notify(lines.join("\n"), "info");
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
  });

  pi.on("session_shutdown", async () => {
    await shutdownControl();
  });
}
