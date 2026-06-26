import type { AgentSession as PiAgentSession } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ROOT_PATH } from "./types.js";
import type { AgentMetadata, AgentRuntime, LifecycleEvent, ListAgentsParams, ListResult, MailboxItem, WaitAgentParams, WaitResult } from "./types.js";
import { isTerminalStatus } from "./types.js";
import type { AgentRegistry } from "./registry.js";
import type { Mailbox } from "./mailbox.js";
import { truncateText } from "./contextFork.js";

const MESSAGE_INJECTION_MAX_CHARS = 4_000;

/**
 * Compute the highest sequence number across `beforeSeq`, mailbox items, and
 * events using a plain loop. `Math.max(...spread)` would consume one stack
 * frame per element and overflow once mailbox/events grow large
 * (MAX_RETAINED_RECORDS, issue #152 / IC-162).
 */
function maxSeqLinear(beforeSeq: number, mailbox: MailboxItem[], events: LifecycleEvent[]): number {
  let max = beforeSeq;
  for (let i = 0; i < mailbox.length; i++) {
    const s = mailbox[i].seq;
    if (s > max) max = s;
  }
  for (let i = 0; i < events.length; i++) {
    const e: any = events[i];
    const s = typeof e?.seq === "number" ? e.seq : 0;
    if (s > max) max = s;
  }
  return max;
}

export function clampTimeout(value: number, min: number, max = 600_000): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export interface AgentSessionControlDeps {
  registry: AgentRegistry;
  mailbox: Mailbox;
  resolveCallerPath(ctx: ExtensionContext): string;
  resolveTarget(target: string, callerPath: string): string;
  getRuntime(agentPath: string): AgentRuntime | undefined;
  getHub(agentId: string): { send(agentId: string, msg: unknown): Promise<void> } | undefined;
  displayResult(display: AgentMetadata["display"]): ListResult["agents"][number]["display"];
  logDisplay(display: AgentMetadata["display"], line: string): void;
}

export class AgentSessionControl {
  private lastConsumedSeq = new Map<string, number>();

  constructor(private readonly deps: AgentSessionControlDeps) {}

  getCallerAgentId(callerPath: string): string {
    return this.deps.registry.get(callerPath)?.agentId ?? "root";
  }

  resolveAgentOrFail(target: string, callerPath: string): { targetPath: string; agent: AgentMetadata } {
    const targetPath = this.deps.resolveTarget(target, callerPath);
    const agent = this.deps.registry.get(targetPath);
    if (!agent) throw new Error(`Agent not found: ${targetPath}`);
    return { targetPath, agent };
  }

  resolveTargetSession(target: string, ctx: ExtensionContext): { callerPath: string; targetPath: string; agent: AgentMetadata; childSession: PiAgentSession | undefined } {
    const callerPath = this.deps.resolveCallerPath(ctx);
    const { targetPath, agent } = this.resolveAgentOrFail(target, callerPath);
    const rt = this.deps.getRuntime(targetPath);
    return { callerPath, targetPath, agent, childSession: rt?.mode === "in_process" ? rt.session : undefined };
  }

  enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.deps.mailbox.enqueue({ fromAgentId, fromAgentPath: fromPath, toAgentPath: toPath, content: truncateText(content, MESSAGE_INJECTION_MAX_CHARS), timestamp: Date.now(), kind });
  }

  async sendMessage(params: { target: string; message: string }, ctx: ExtensionContext, queuedMessageSink: (targetPath: string, message: string) => boolean): Promise<{ delivered: boolean }> {
    const { callerPath, targetPath, agent, childSession } = this.resolveTargetSession(params.target, ctx);
    if (!agent.open || isTerminalStatus(agent.status)) throw new Error(`Agent at ${targetPath} is not open (status: ${agent.status}). Cannot send message.`);
    const message = truncateText(params.message, MESSAGE_INJECTION_MAX_CHARS);
    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, message, "message");
    this.deps.logDisplay(agent.display, `[message from ${callerPath}] ${message}`);
    if (agent.status === "queued") {
      queuedMessageSink(targetPath, message);
      return { delivered: true };
    }

    const rt = this.deps.getRuntime(targetPath);
    if (rt?.mode === "external_pi") {
      if (!rt.capabilities?.includes("message")) throw new Error(`External Pi subagent ${targetPath} does not support message injection.`);
      const hub = this.deps.getHub(rt.agentId);
      if (!hub) throw new Error(`External Pi subagent ${targetPath} has no connected IPC hub.`);
      await hub.send(rt.agentId, { type: "message", id: `msg_${Date.now()}`, fromAgentPath: callerPath, message });
    } else if (childSession) {
      await childSession.sendCustomMessage({ customType: "subagent_message", content: `[Message from ${callerPath}]: ${message}`, display: true }, { triggerTurn: false, deliverAs: "nextTurn" });
    }
    return { delivered: true };
  }

  async followupTask(params: { target: string; message: string }, ctx: ExtensionContext): Promise<{ queued: boolean; triggered: boolean }> {
    const { callerPath, targetPath, agent, childSession } = this.resolveTargetSession(params.target, ctx);
    if (targetPath === ROOT_PATH) throw new Error("Cannot send message_agent mode=task to the root agent.");
    if (!agent.open || isTerminalStatus(agent.status)) throw new Error(`Cannot follow up a terminal agent (status: ${agent.status}).`);
    if (agent.status === "queued") throw new Error("Agent is queued and cannot receive message_agent mode=task until it is running. Use message_agent mode=note to add pre-start context, or wait_agent until the agent starts.");

    const message = truncateText(params.message, MESSAGE_INJECTION_MAX_CHARS);
    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, message, "followup");
    this.deps.logDisplay(agent.display, `[followup from ${callerPath}] ${message}`);
    this.deps.registry.updateStatus(targetPath, agent.status, { lastTaskMessage: message });

    const rt = this.deps.getRuntime(targetPath);
    if (rt?.mode === "external_pi") {
      if (!rt.capabilities?.includes("followup")) throw new Error(`External Pi subagent ${targetPath} does not support followup injection.`);
      const hub = this.deps.getHub(rt.agentId);
      if (!hub) throw new Error(`External Pi subagent ${targetPath} has no connected IPC hub.`);
      await hub.send(rt.agentId, { type: "followup", id: `fu_${Date.now()}`, message });
      return { queued: true, triggered: true };
    }
    if (childSession) {
      const triggered = !childSession.isStreaming;
      await childSession.sendUserMessage(`[Follow-up from ${callerPath}]: ${message}`, childSession.isStreaming ? { deliverAs: "followUp" } : undefined);
      return { queued: true, triggered };
    }
    return { queued: true, triggered: false };
  }

  async wait(params: WaitAgentParams, ctx: ExtensionContext, defaultWaitTimeout: number, minWaitTimeout: number): Promise<WaitResult> {
    const callerPath = this.deps.resolveCallerPath(ctx);
    const timeoutMs = clampTimeout(params.timeout_ms ?? defaultWaitTimeout, minWaitTimeout);
    const result = await this.waitForMailboxUpdate(callerPath, timeoutMs);
    // `timed_out` is the authoritative signal from the mailbox (issue #152 /
    // IC-029). Previously this was derived from emptiness, which conflated a
    // genuine timeout with an empty-but-successful notification.
    return { timed_out: result.timed_out, events: result.events, mailbox: result.mailbox };
  }

  async waitIndefinitely(ctx: ExtensionContext): Promise<Omit<WaitResult, "timed_out">> {
    const callerPath = this.deps.resolveCallerPath(ctx);
    return this.waitForMailboxUpdate(callerPath);
  }

  private async waitForMailboxUpdate(callerPath: string, timeoutMs?: number): Promise<{ events: LifecycleEvent[]; mailbox: MailboxItem[]; timed_out: boolean }> {
    const beforeSeq = this.lastConsumedSeq.get(callerPath) ?? 0;
    const result = timeoutMs === undefined
      ? await this.deps.mailbox.waitForUpdateIndefinitely(callerPath, beforeSeq)
      : await this.deps.mailbox.waitForUpdate(callerPath, beforeSeq, timeoutMs);
    // Linear aggregation: spreading huge mailbox/events arrays into Math.max
    // can exceed the call-stack limit once retention is large (issue #152 /
    // IC-162). Iterate instead.
    this.lastConsumedSeq.set(callerPath, maxSeqLinear(beforeSeq, result.mailbox, result.events));
    return result;
  }

  list(params: ListAgentsParams, ctx?: ExtensionContext): ListResult {
    const callerPath = ctx ? this.deps.resolveCallerPath(ctx) : ROOT_PATH;
    const afterSeq = this.lastConsumedSeq.get(callerPath) ?? 0;
    const unreadFinalResultPaths = new Set(this.deps.mailbox.pendingFor(callerPath, afterSeq).filter((item) => item.kind === "final_result").map((item) => item.fromAgentPath));
    return {
      agents: this.deps.registry.list(params.path_prefix).map((a) => ({
        agent_id: a.agentId,
        agent_path: a.agentPath,
        status: a.status,
        last_task: a.lastTaskMessage,
        nickname: a.nickname,
        role: a.role,
        depth: a.depth,
        display: this.deps.displayResult(a.display),
        authority: a.authority,
        authority_enforced: a.authorityEnforced,
        result_contract: a.resultContract,
        roi_category: a.roiCategory,
        justification: a.justification,
        cost_intent: a.costIntent,
        subagent_type: a.subagentType,
        queue_position: a.queuePosition,
        queued_ahead: a.queuedAhead,
        unread_final_result: unreadFinalResultPaths.has(a.agentPath) || undefined,
      })),
    };
  }
}
