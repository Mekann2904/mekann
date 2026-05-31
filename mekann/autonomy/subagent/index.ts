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
import { fileURLToPath } from "node:url";
import { AgentControl } from "./agentControl.js";
import { SubagentClient } from "./ipc.js";
import { KittyController } from "./kittyControl.js";
import { formatAgentList, formatWaitResult } from "./types.js";
import type { SpawnParams, SpawnResult } from "./types.js";
import { extractLastAssistantText } from "./contextFork.js";
import type { ForkTurns } from "./contextFork.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";
import { registerSubagentFlags } from "./flags.js";

let sharedSpawnAgent: ((params: SpawnParams, ctx: ExtensionContext) => Promise<SpawnResult>) | undefined;

export async function spawnAgentFromFeature(params: SpawnParams, ctx: ExtensionContext): Promise<SpawnResult> {
  if (!sharedSpawnAgent) throw new Error("subagent feature is not initialized");
  return sharedSpawnAgent(params, ctx);
}

// ─── Tool parameter schemas ──────────────────────────────────────

const SemanticTargetSchema = Type.Object({ kind: Type.String(), name: Type.String() });
const ValidationCommandSchema = Type.Union([
  Type.Object({ kind: Type.Literal("npm_script"), script: Type.String(), args: Type.Optional(Type.Array(Type.String())) }),
  Type.Object({ kind: Type.Literal("shell_allowlisted"), command_id: Type.String(), args: Type.Optional(Type.Array(Type.String())) }),
]);
const AuthoritySchema = Type.Object({
  mode: Type.Union([Type.Literal("read_only"), Type.Literal("propose_patch"), Type.Literal("edit")]),
  write_scope: Type.Optional(Type.Array(Type.String())),
  semantic_scope: Type.Optional(Type.Array(SemanticTargetSchema)),
  allowed_commands: Type.Optional(Type.Array(ValidationCommandSchema)),
  max_patch_bytes: Type.Optional(Type.Number()),
  require_base_hash: Type.Optional(Type.Boolean()),
  isolated_worktree: Type.Optional(Type.Union([Type.Literal("required"), Type.Literal("preferred"), Type.Literal("none")])),
});

const ExpectedValueSchema = Type.Union([
  Type.Literal("parallel_search"),
  Type.Literal("fault_localization"),
  Type.Literal("candidate_generation"),
  Type.Literal("fresh_review"),
  Type.Literal("verification"),
  Type.Literal("large_context_isolation"),
  Type.Literal("other"),
]);
const CostIntentSchema = Type.Union([Type.Literal("cheap"), Type.Literal("standard"), Type.Literal("expensive")]);
const SubagentTypeSchema = Type.Union([Type.Literal("explore"), Type.Literal("verify"), Type.Literal("review"), Type.Literal("patch")]);

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
    Type.Union([
      Type.Literal("off"),
      Type.Literal("minimal"),
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("xhigh"),
    ], {
      description:
        'Reasoning effort level. If omitted, the subagent inherits the parent session thinking level deterministically.',
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
  authority: Type.Optional(AuthoritySchema),
  result_contract: Type.Optional(Type.Union([Type.Literal("free_text"), Type.Literal("subagent_result_v1")])),
  expected_value: Type.Optional(ExpectedValueSchema),
  justification: Type.Optional(Type.String({ description: "Why this subagent is worth the extra child-loop cost." })),
  cost_intent: Type.Optional(CostIntentSchema),
  type: Type.Optional(SubagentTypeSchema),
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

const ListAgentResultsSchema = Type.Object({ status: Type.Optional(Type.String()), outcome: Type.Optional(Type.String()), agent_path: Type.Optional(Type.String()) });
const ShowAgentResultSchema = Type.Object({ result_id: Type.String(), include_patch: Type.Optional(Type.Boolean()) });
const ApplyAgentResultsSchema = Type.Object({ source: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("result_ids")])), result_ids: Type.Optional(Type.Array(Type.String())), order: Type.Optional(Type.Literal("fifo")), max_results: Type.Optional(Type.Number()), rollback_on_failure: Type.Optional(Type.Boolean()), allow_high_risk: Type.Optional(Type.Boolean()) });
const RejectAgentResultSchema = Type.Object({ result_id: Type.String(), reason: Type.Optional(Type.String()) });
const RetryAgentResultSchema = Type.Object({ result_id: Type.String(), reason: Type.Optional(Type.String()) });

function registerSubagentPromptProvider(): void {
  registerPromptProvider({
    id: "subagent",
    getFragments() {
      return [{
        id: "subagent:policy",
        source: "subagent",
        kind: "subagent_policy",
        stability: "stable",
        scope: "global",
        priority: 350,
        version: "v2",
        cacheIntent: "prefer_cache",
        content: [
          "Prefer direct tools. Use subagents only when they buy independent exploration, candidate diversity, fresh review, verification, or large-context isolation.",
          `Limits: ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents} running, ${MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents} queued by default. Extra spawns queue FIFO and remain visible to list_agents/wait_agent.`,
          "Before spawning, check that at least 3 ROI conditions hold: natural decomposition, independent evidence, parent-verifiable result, high failure cost, too many reads/tool calls for local context, comparable candidates, or explicit user request for parallel/multi-agent work.",
          "Do not spawn for short Q&A, simple summaries, single grep/read, 1-3 file cross-references, single-file edits, tightly coupled implementation, ambiguous requirements, verifier-less debate, or multiple agents reading the same files with the same goal.",
          "Use expected_value and justification when spawning so the cost can be audited.",
          "Spawn all genuinely independent tasks first, then wait_agent before summarizing or deciding next steps. Do not repeatedly wait by reflex; do non-overlapping local work while subagents run.",
          "Write subagent task messages in English.",
          "Request compact, structured, evidence/path-oriented results for the parent agent only.",
          "Do not request progress reports, greetings, apologies, narration, or polished prose.",
        ].join("\n"),
      }];
    },
  });
}

// ─── Extension entry point ───────────────────────────────────────

export default function subagentExtension(pi: ExtensionAPI): void | Promise<void> {
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

  // ─── Flags ────────────────────────────────────────────────────

  const extensionPathDefault = fileURLToPath(import.meta.url);
  registerSubagentFlags(pi, extensionPathDefault);

  // ─── Helper: ensure control is initialized ────────────────────

  function readSettingsFile(): Record<string, unknown> {
    if (process.env.VITEST || process.env.NODE_ENV === "test") return {};
    return { subagent: featureConfig("subagent") };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getFlagOrSetting<T = any>(flagName: string, settingsKey: string, defaultValue?: T): T | undefined {
    const flagVal = pi.getFlag(flagName) as T | undefined;
    try {
      const settings = readSettingsFile();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = (settings as any).subagent;
      if (sub && sub[settingsKey] !== undefined) {
        // pi.getFlag() returns registered defaults too. Treat the default value
        // as "not explicitly set" so mekann.json can actually configure the
        // extension. A non-default CLI flag still wins.
        if (flagVal === undefined || flagVal === null || flagVal === defaultValue) return sub[settingsKey] as T;
      }
    } catch { /* ignore */ }
    if (flagVal !== undefined && flagVal !== null) return flagVal;
    return defaultValue;
  }

  function ensureControl(): AgentControl {
    if (!control) {
      // AgentRegistry counts the root agent too, so root + max 2 subagents = 3 open agents.
      const maxSubagentsDefault = String(MEKANN_SUBAGENT_DEFAULTS.maxSubagents);
      const maxSubagents = Math.min(
        Math.max(Number(getFlagOrSetting("subagent-max-agents", "maxSubagents", maxSubagentsDefault)) || MEKANN_SUBAGENT_DEFAULTS.maxSubagents, 0),
        4,
      );
      const configuredMaxOpenAgents = Number(getFlagOrSetting("subagent-max-open-agents", "maxOpenAgents", String(maxSubagents + 1))) || maxSubagents + 1;
      const maxAgents = Math.max(configuredMaxOpenAgents, maxSubagents + 1);
      const maxQueuedDefault = String(MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents);
      const maxQueuedSubagents = Math.max(Number(getFlagOrSetting("subagent-max-queued-agents", "maxQueuedSubagents", maxQueuedDefault)) || MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents, 0);
      const maxDepthDefault = String(MEKANN_SUBAGENT_DEFAULTS.maxDepth);
      const maxDepth = Number(getFlagOrSetting("subagent-max-depth", "maxDepth", maxDepthDefault)) || MEKANN_SUBAGENT_DEFAULTS.maxDepth;
      const rawDefaultWait = getFlagOrSetting<string>("subagent-default-wait-timeout-ms", "defaultWaitTimeoutMs");
      const parsedDefaultWait = rawDefaultWait === undefined || rawDefaultWait === "" ? undefined : Number(rawDefaultWait);
      const defaultWait = parsedDefaultWait !== undefined && Number.isFinite(parsedDefaultWait) ? parsedDefaultWait : undefined;
      const minWaitDefault = String(MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs);
      const minWait = Number(getFlagOrSetting("subagent-min-wait-timeout-ms", "minWaitTimeoutMs", minWaitDefault)) || MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs;
      const rawDisplayFlag = getFlagOrSetting<string>("subagent-display", "display", MEKANN_SUBAGENT_DEFAULTS.display);
      const displayFlag = String(rawDisplayFlag ?? MEKANN_SUBAGENT_DEFAULTS.display);
      const displayMap: Record<string, "none" | "kitty-pi" | "kitty-split"> = { none: "none", "external-pi": "kitty-pi", "external-split": "kitty-split" };
      const requestedDisplayMode = displayMap[displayFlag] ?? "none";
      const displayMode = requestedDisplayMode.startsWith("kitty-") && !process.env.KITTY_WINDOW_ID ? "none" : requestedDisplayMode;
      const allowUnsafeExternalPi = /^(1|true|yes|on)$/i.test(
        String(getFlagOrSetting<string>(
          "subagent-allow-unsafe-external-pi",
          "allowUnsafeExternalPi",
          String(MEKANN_SUBAGENT_DEFAULTS.allowUnsafeExternalPi),
        ) ?? String(MEKANN_SUBAGENT_DEFAULTS.allowUnsafeExternalPi)),
      );
      const logDirFlag = String(getFlagOrSetting<string>("subagent-log-dir", "log-dir", MEKANN_SUBAGENT_DEFAULTS.logDir) ?? MEKANN_SUBAGENT_DEFAULTS.logDir).trim();
      const kittenBin = String(getFlagOrSetting<string>("subagent-kitten-bin", "kitten-bin", MEKANN_SUBAGENT_DEFAULTS.kittenBin) ?? MEKANN_SUBAGENT_DEFAULTS.kittenBin) || MEKANN_SUBAGENT_DEFAULTS.kittenBin;
      const piCommand = String(getFlagOrSetting<string>("subagent-pi-command", "pi-command", MEKANN_SUBAGENT_DEFAULTS.piCommand) ?? MEKANN_SUBAGENT_DEFAULTS.piCommand) || MEKANN_SUBAGENT_DEFAULTS.piCommand;
      const extensionPath = String(getFlagOrSetting<string>("subagent-extension-path", "extensionPath", extensionPathDefault) ?? extensionPathDefault).trim();
      const externalPiSlots = Number(getFlagOrSetting("subagent-external-pi-slots", "externalPiSlots", String(MEKANN_SUBAGENT_DEFAULTS.externalPiSlots))) || MEKANN_SUBAGENT_DEFAULTS.externalPiSlots;
      const allowNestedSubagents = /^(1|true|yes|on)$/i.test(String(getFlagOrSetting<string>("subagent-allow-nested", "allowNestedSubagents", String(MEKANN_SUBAGENT_DEFAULTS.allowNestedSubagents)) ?? String(MEKANN_SUBAGENT_DEFAULTS.allowNestedSubagents)));
      const defaultReasoningEffort = String(getFlagOrSetting<string>("subagent-default-reasoning-effort", "defaultReasoningEffort", MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort) ?? MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort);

      control = new AgentControl(pi, maxAgents, maxDepth, defaultWait, minWait, {
        displayMode,
        logDir: logDirFlag || undefined,
        kitty: new KittyController(kittenBin),
        piCommand,
        extensionPath: extensionPath || undefined,
        allowUnsafeExternalPi,
        maxQueuedSubagents,
        externalPiSlots,
        allowNestedSubagents,
        defaultReasoningEffort,
      });
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

  sharedSpawnAgent = (params, ctx) => ensureControl().spawn(params, ctx);

  type ToolHandler = (ctrl: AgentControl, params: any, ctx: ExtensionContext) => Promise<any>;
  function withCtrl(handler: ToolHandler) {
    return async (_id: string, params: unknown, _signal: unknown, _onUpdate: unknown, ctx: ExtensionContext) => handler(ensureControl(), params, ctx);
  }

  // ─── Tools ────────────────────────────────────────────────────

  pi.registerTool({
    name: "spawn_agent",
    label: "Spawn subagent",
    description:
      `Spawn a new subagent that runs asynchronously. Returns immediately with the agent ID and path. Up to ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents} subagents run concurrently by default; excess spawns are queued FIFO up to ${MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents} queued subagents. Use wait_agent to get results.`,
    promptSnippet: "Run an independent task in a background subagent and later collect its result",
    promptGuidelines: [
      "Subagents are expensive child loops. Prefer direct tools; use spawn_agent only when it buys independent exploration, candidate diversity, fresh review, verification, or large-context isolation.",
      "Good subagent use cases: repo-wide research across distinct components, fault localization with multiple independent hypotheses, comparing patch candidates, fresh review of a concrete risk, or high-value research with separable branches.",
      "Do not use subagents for small single-step tasks, one-file edits, simple questions, 1-3 file cross-references, single grep/read, tightly coupled implementation, ambiguous requirements, verifier-less debate, or work that requires tight step-by-step coordination with the parent. Direct tool use is better for those cases.",
      "Before spawning, check that at least 3 ROI conditions hold: natural decomposition, independent evidence, parent-verifiable result, high failure cost, too many local reads/tool calls, comparable candidates, or explicit user request for parallel/multi-agent work.",
      "For genuinely independent tasks, spawn all relevant subagents first, then wait for results. Avoid spawn→wait→spawn serialization unless later tasks depend on earlier results.",
      "Default workflow: spawn_agent for each independent task → continue useful parent work or spawn more agents → wait_agent to collect updates/results → summarize/merge results → followup_task if more work is needed.",
      "Subagents are cleaned up automatically after successful completion. Do not call close_agent as routine cleanup after final_result; use close_agent only for cancellation, aborting, or stuck/abnormal agents.",
      "spawn_agent returns immediately; it does not mean the child has finished. Never claim subagent results until wait_agent returns mailbox content or a final_result.",
      "Give each subagent a stable, descriptive task_name such as research/api, research/db, fix/tests, review/security. Relative paths are resolved under /root.",
      "Write the message as a self-contained task brief in English: include goal, relevant files/commands, constraints, expected output format, and what not to change. Subagents may not know unstated parent context. English is required even if the user-facing conversation is in another language.",
      "Use fork_turns only when the recent conversation is genuinely needed by the child; otherwise include the necessary context directly in message.",
      "Set expected_value and justification so subagent cost can be audited. Use type=explore for wide read-only investigation, verify for narrow checks, review for fresh review, and patch for bounded patch proposals.",
      `Respect resource limits. By default, max running subagents = ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents} and max queued subagents = ${MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents}; excess accepted spawns return status=\"queued\" with queue_position/queued_ahead and start automatically when a slot opens.`,
      "Use list_agents or wait_agent to observe queued/running/completed status. close_agent can cancel queued agents. send_message can add pre-start context to queued agents; followup_task requires a running agent.",
      "If a duplicate task_name is rejected, list_agents to inspect whether an agent with that path is still open/running before choosing a different path or aborting it with close_agent.",
      "Subagent output is for the parent agent, not for humans. Request compact structured results: findings, file paths, key decisions, risks, next actions. Avoid greetings, apologies, narrative summaries, or polished prose in subagent responses. For result_contract=subagent_result_v1 the child emits only raw JSON; put any desired report shape, language, or bullet sections inside JSON fields such as summary/evidence/validation. Use outcome=observation for read-only research/review, no_change only for verified no-op, patch only for concrete patch proposals, blocked for authority/environment blockers, and needs_decision only for explicit parent decisions. For free_text results, ask the child to use terse bullet sections.",
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
          expected_value: params.expected_value,
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
    name: "send_message",
    label: "Send message to subagent",
    description:
      "Send a message to a subagent without triggering a new turn. The message is queued in the agent's mailbox.",
    promptSnippet: "Deliver context or a note to a subagent without starting new work",
    promptGuidelines: [
      "Use send_message only to provide additional context or a note to a subagent without triggering a new turn.",
      "If you want the subagent to perform additional work, use followup_task instead of send_message.",
      "Write messages to subagents in English, consistent with the task delegation language.",
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
      "Write follow-up instructions in English, consistent with the initial task delegation language.",
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
      "Use list_agents when you are unsure which subagents exist, need to verify status, need a target path for followup_task/close_agent, or need to diagnose duplicate task_name errors.",
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
    name: "list_agent_results",
    label: "List subagent results",
    description: "List stored structured subagent results.",
    parameters: ListAgentResultsSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = ctrl.listAgentResults(params, ctx);
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "show_agent_result",
    label: "Show subagent result",
    description: "Show a stored structured subagent result, optionally including patch content.",
    parameters: ShowAgentResultSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = ctrl.showAgentResult(params, ctx);
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "apply_agent_results",
    label: "Apply subagent results",
    description: "Apply pending structured patch proposals from subagents mechanically.",
    parameters: ApplyAgentResultsSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.applyAgentResults(params, ctx);
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "reject_agent_result",
    label: "Reject subagent result",
    description: "Reject a stored subagent result.",
    parameters: RejectAgentResultSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = ctrl.rejectAgentResult(params, ctx);
      return toolResult(JSON.stringify(result, null, 2), result);
    }),
  });

  pi.registerTool({
    name: "retry_agent_result",
    label: "Retry subagent result",
    description: "Ask the originating subagent to regenerate a rejected patch proposal when possible.",
    parameters: RetryAgentResultSchema,
    execute: withCtrl(async (ctrl, params, ctx) => {
      const result = await ctrl.retryAgentResult(params, ctx);
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
