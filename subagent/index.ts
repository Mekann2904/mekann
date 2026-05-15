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

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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

  // ─── Tools ────────────────────────────────────────────────────

  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn subagent",
    description:
      "Spawn a new subagent that runs asynchronously. Returns immediately with the agent ID and path. Use wait_agent to get results.",
    promptSnippet: "Spawn a background subagent for a specific task",
    promptGuidelines: [
      "spawn_agent starts a subagent in the background — it returns immediately, not after the subagent finishes.",
      "Use wait_agent to receive results when the subagent completes.",
      "Each subagent has a unique task_name path — duplicate open paths are rejected.",
      "Close agents with close_agent when done to free resources.",
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
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const ctrl = ensureControl();
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "send_message",
    label: "Send message to subagent",
    description:
      "Send a message to a subagent without triggering a new turn. The message is queued in the agent's mailbox.",
    promptSnippet: "Send a message to a running subagent",
    parameters: SendMessageSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const ctrl = ensureControl();
      const result = await ctrl.sendMessage(params, ctx);
      return {
        content: [
          {
            type: "text",
            text: `Message delivered: ${result.delivered}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "followup_task",
    label: "Send follow-up task to subagent",
    description:
      "Send a follow-up task to a subagent. If the agent is idle, triggers a new turn. If running, queues the message.",
    promptSnippet: "Send a follow-up task to a subagent",
    parameters: FollowupTaskSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const ctrl = ensureControl();
      const result = await ctrl.followupTask(params, ctx);
      return {
        content: [
          {
            type: "text",
            text: `Follow-up ${result.triggered ? "triggered new turn" : "queued"}: queued=${result.queued}, triggered=${result.triggered}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "wait_agent",
    label: "Wait for subagent updates",
    description:
      "Wait for mailbox messages and/or lifecycle events from subagents. Returns immediately if pending, otherwise waits up to timeout.",
    promptSnippet: "Wait for subagent results or status updates",
    promptGuidelines: [
      "wait_agent returns pending updates immediately or waits for new ones.",
      "Use a reasonable timeout — the agent is blocked while waiting.",
      "After receiving a final_result, the subagent has completed.",
    ],
    parameters: WaitAgentSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const ctrl = ensureControl();
      const result = await ctrl.wait(params, ctx);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                timed_out: result.timed_out,
                event_count: result.events.length,
                mailbox_count: result.mailbox.length,
                events: result.events.map((e) => ({
                  type: e.type,
                  agentPath: "agentPath" in e ? (e as any).agentPath : undefined,
                  ...(e.type === "agent_status_changed"
                    ? {
                        previousStatus: (e as any).previousStatus,
                        newStatus: (e as any).newStatus,
                      }
                    : {}),
                  ...(e.type === "agent_final_message"
                    ? { message: (e as any).message }
                    : {}),
                })),
                mailbox: result.mailbox.map((m) => ({
                  from: m.fromAgentPath,
                  kind: m.kind,
                  content: m.content.slice(0, 200),
                })),
              },
              null,
              2,
            ),
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "list_agents",
    label: "List subagents",
    description: "List all agents, optionally filtered by path prefix.",
    promptSnippet: "List active and closed subagents",
    parameters: ListAgentsSchema,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const ctrl = ensureControl();
      const result = ctrl.list(params);
      return {
        content: [
          {
            type: "text",
            text:
              result.agents.length === 0
                ? "(no agents)"
                : result.agents
                    .map(
                      (a) =>
                        `${a.status === "completed" || a.status === "shutdown" ? "○" : "●"} ${a.agent_path}${a.nickname ? ` (${a.nickname})` : ""}${a.role ? ` [${a.role}]` : ""} — ${a.status}${a.last_task ? `\n  last: ${a.last_task.slice(0, 80)}` : ""}`,
                    )
                    .join("\n"),
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "close_agent",
    label: "Close subagent",
    description:
      "Close a subagent and all its open descendants. Aborts any running operations.",
    promptSnippet: "Close a subagent and free resources",
    parameters: CloseAgentSchema,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const ctrl = ensureControl();
      const result = await ctrl.close(params, ctx);
      return {
        content: [
          {
            type: "text",
            text: `Closed: ${result.closed.join(", ")}`,
          },
        ],
        details: result,
      };
    },
  });

  // ─── Commands ─────────────────────────────────────────────────

  pi.registerCommand("agents", {
    description: "List all subagents with status",
    async handler(args, ctx) {
      const ctrl = ensureControl();
      const prefix = args?.trim() || undefined;
      const agents = ctrl.list({ path_prefix: prefix });
      const lines = formatAgentList(
        agents.agents.map((a) => ({
          agentId: a.agent_id,
          sessionId: "",
          agentPath: a.agent_path,
          nickname: a.nickname,
          role: a.role,
          status: a.status,
          lastTaskMessage: a.last_task,
          createdAt: 0,
          updatedAt: 0,
          depth: a.depth,
          open:
            a.status !== "completed" &&
            a.status !== "shutdown" &&
            a.status !== "errored" &&
            a.status !== "interrupted",
          cancellationRequested: false,
        })),
      );
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

  pi.on("session_start", async (_event, ctx) => {
    // Reset control on new session
    if (control) {
      await control.shutdown();
      control = null;
    }
    ensureControl();
    // Register root
    control!.registry.ensureRoot("root");
  });

  pi.on("session_shutdown", async () => {
    if (control) {
      await control.shutdown();
      control = null;
    }
  });
}
