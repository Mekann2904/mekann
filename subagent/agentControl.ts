/**
 * Subagent Extension — Agent control plane.
 *
 * Implements spawn_agent, send_message, followup_task, wait_agent,
 * list_agents, close_agent. Uses AgentRegistry, Mailbox, and
 * createAgentSession from the pi SDK.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { ROOT_PATH, resolveTaskPath } from "./types.js";
import { AgentRegistry } from "./registry.js";
import { Mailbox } from "./mailbox.js";
import { extractForkContext, buildContextPreamble } from "./contextFork.js";
import type {
  AgentMetadata,
  AgentStatus,
  CloseAgentParams,
  FollowupTaskParams,
  LifecycleEvent,
  ListAgentsParams,
  ListResult,
  SendMessageParams,
  SpawnParams,
  SpawnResult,
  WaitAgentParams,
  WaitResult,
} from "./types.js";
import { isTerminalStatus } from "./types.js";

// ─── Default config ──────────────────────────────────────────────

const DEFAULT_MAX_AGENTS = 4;
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const MAX_WAIT_TIMEOUT_MS = 600_000;
const MIN_WAIT_TIMEOUT_MS = 1_000;

let agentIdCounter = 0;

function nextAgentId(): string {
  return `sub_${++agentIdCounter}_${Date.now().toString(36)}`;
}

// ─── Agent control ───────────────────────────────────────────────

export class AgentControl {
  readonly registry: AgentRegistry;
  readonly mailbox: Mailbox;
  private childSessions = new Map<string, import("@earendil-works/pi-coding-agent").AgentSession>();
  private pi: import("@earendil-works/pi-coding-agent").ExtensionAPI;
  private defaultWaitTimeout: number;

  constructor(
    pi: import("@earendil-works/pi-coding-agent").ExtensionAPI,
    maxAgents?: number,
    maxDepth?: number,
    defaultWaitTimeout?: number,
  ) {
    this.pi = pi;
    this.registry = new AgentRegistry(
      maxAgents ?? DEFAULT_MAX_AGENTS,
      maxDepth ?? DEFAULT_MAX_DEPTH,
    );
    this.mailbox = new Mailbox();
    this.defaultWaitTimeout = defaultWaitTimeout ?? DEFAULT_WAIT_TIMEOUT_MS;

    // Forward registry events to mailbox
    this.registry.subscribe((event) => {
      this.mailbox.appendEvent(event);
    });
  }

  // ─── Helper: resolve caller's agent path from context ──────────

  private resolveCallerPath(_ctx: ExtensionContext): string {
    // For now, always return root — the calling agent is the root agent.
    // Future: check session source metadata to identify subagent callers.
    return ROOT_PATH;
  }

  // ─── Helper: resolve target agent path ─────────────────────────

  private resolveTarget(target: string, callerPath: string): string {
    const trimmed = target.trim();
    if (!trimmed) throw new Error("Target must not be empty.");
    if (trimmed.startsWith("/")) return trimmed;
    return resolveTaskPath(trimmed, callerPath);
  }

  private evBase(agentId: string, agentPath: string) {
    return { agentId, agentPath, timestamp: Date.now() };
  }

  private parentAgentId(callerPath: string): string | undefined {
    return callerPath === ROOT_PATH ? undefined : callerPath;
  }

  // ─── Helper: resolve model from params ────────────────────────────

  private resolveModel(modelOverride: string | undefined, ctx: ExtensionContext) {
    let model = ctx.model;
    if (!modelOverride) return model;
    const parts = modelOverride.split("/");
    if (parts.length === 2) {
      const found = ctx.modelRegistry.find(parts[0], parts[1]);
      if (!found) throw new Error(`Model not found: ${modelOverride}. Use provider/model_id format.`);
      return found;
    }
    const all = ctx.modelRegistry.getAvailable();
    const found = all.find((m) => m.id === modelOverride);
    if (!found) throw new Error(`Model not found: ${modelOverride}. Available: ${all.map((m) => m.id).join(", ")}`);
    return found;
  }

  // ─── Helper: finalize agent with error ─────────────────────────────

  private finalizeWithError(agentId: string, canonicalPath: string, callerPath: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.registry.updateStatus(canonicalPath, "errored");
    this.mailbox.appendEvent({
      type: "agent_final_message", ...this.evBase(agentId, canonicalPath),
      parentAgentId: this.parentAgentId(callerPath) ?? "root",
      message: `Agent error: ${errorMessage}`, status: "errored",
    });
    this.mailbox.enqueue({
      fromAgentId: agentId, fromAgentPath: canonicalPath, toAgentPath: callerPath,
      content: `Agent error: ${errorMessage}`, timestamp: Date.now(), kind: "final_result",
    });
    this.childSessions.delete(canonicalPath);
  }

  // ─── spawn_agent ───────────────────────────────────────────────

  async spawn(
    params: SpawnParams,
    ctx: ExtensionContext,
  ): Promise<SpawnResult> {
    const callerPath = this.resolveCallerPath(ctx);

    // Ensure root is registered
    const rootMeta = this.registry.ensureRoot("root");
    void rootMeta;

    // Resolve task path
    const canonicalPath = resolveTaskPath(params.task_name, callerPath);

    // Depth check
    const depth = canonicalPath.split("/").length - 2; // /root/seg1/seg2 → depth 2
    if (depth > this.registry.maxDepth) {
      throw new Error(
        `Maximum agent depth exceeded (${this.registry.maxDepth}). Path "${canonicalPath}" would be depth ${depth}.`,
      );
    }

    // Reserve slot
    const reservation = this.registry.reserveSpawnSlot();

    // Publish spawn begin event
    const agentId = nextAgentId();
    this.mailbox.appendEvent({
      type: "agent_spawn_begin", ...this.evBase(agentId, canonicalPath),
      parentAgentId: callerPath === ROOT_PATH ? undefined : callerPath,
    });

    try {
      const model = this.resolveModel(params.model, ctx);

      const forkTurns = params.fork_turns ?? 0;

      const { session } = await createAgentSession({
        cwd: ctx.cwd,
        model,
        sessionManager: await import("@earendil-works/pi-coding-agent").then((m) =>
          m.SessionManager.inMemory(),
        ),
        appendSystemPrompt: [
          buildContextPreamble({
            agentPath: canonicalPath,
            parentPath: callerPath,
            role: params.role,
            nickname: params.nickname,
          }),
        ],
      });

      // Register agent
      const now = Date.now();
      const metadata: AgentMetadata = {
        agentId,
        sessionId: session.sessionId,
        parentAgentId: callerPath === ROOT_PATH ? "root" : undefined,
        parentSessionId: "root",
        agentPath: canonicalPath,
        nickname: params.nickname,
        role: params.role,
        status: "pending_init",
        lastTaskMessage: params.message,
        createdAt: now,
        updatedAt: now,
        depth,
        open: true,
        cancellationRequested: false,
      };

      this.registry.registerAgent(metadata, reservation);

      // Subscribe to child session events for status tracking
      const unsubscribe = session.subscribe((event) => {
        if (event.type === "agent_start") {
          this.registry.updateStatus(canonicalPath, "running");
        } else if (event.type === "agent_end") {
          // Extract final assistant text
          const msgs = (event as any).messages as AgentMessage[] | undefined;
          const lastAssistant = msgs?.filter((m) => m.role === "assistant").pop();
          const finalText = lastAssistant
            ? extractTextFromContent(lastAssistant.content) ?? undefined
            : undefined;

          this.registry.updateStatus(canonicalPath, "completed", {
            lastTaskMessage: finalText,
          });

          // Enqueue final message to parent mailbox
          this.mailbox.enqueue({
            fromAgentId: agentId,
            fromAgentPath: canonicalPath,
            toAgentPath: callerPath,
            content: finalText ?? "(agent completed)",
            timestamp: Date.now(),
            kind: "final_result",
          });

          // Publish final message lifecycle event
          this.mailbox.appendEvent({
            type: "agent_final_message", ...this.evBase(agentId, canonicalPath),
            parentAgentId: callerPath === ROOT_PATH ? undefined : "root",
            message: finalText ?? "(agent completed)",
            status: "completed",
          });

          this.childSessions.delete(canonicalPath);
          unsubscribe();
        }
      });

      // Store session reference
      this.childSessions.set(canonicalPath, session);

      // Send initial message in background
      const initialMessage = params.message;
      void session
        .prompt(initialMessage)
        .catch((err: unknown) => {
          this.finalizeWithError(agentId, canonicalPath, callerPath, err);
        });

      return {
        agent_id: agentId,
        task_name: canonicalPath,
        status: "pending_init",
      };
    } catch (err) {
      // Rollback reservation on failure
      this.registry.rollbackReservation(reservation);
      this.mailbox.appendEvent({
        type: "agent_spawn_end", ...this.evBase(agentId, canonicalPath),
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.mailbox.enqueue({ fromAgentId, fromAgentPath: fromPath, toAgentPath: toPath, content, timestamp: Date.now(), kind });
  }

  private getCallerAgentId(callerPath: string): string {
    return this.registry.get(callerPath)?.agentId ?? "root";
  }

  // ─── send_message ──────────────────────────────────────────────

  async sendMessage(
    params: SendMessageParams,
    ctx: ExtensionContext,
  ): Promise<{ delivered: boolean }> {
    const callerPath = this.resolveCallerPath(ctx);
    const targetPath = this.resolveTarget(params.target, callerPath);
    const agent = this.registry.get(targetPath);
    if (!agent) throw new Error(`Agent not found: ${targetPath}`);
    if (!agent.open || isTerminalStatus(agent.status)) throw new Error(`Agent at ${targetPath} is not open (status: ${agent.status}). Cannot send message.`);
    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, params.message, "message");

    const childSession = this.childSessions.get(targetPath);
    if (childSession) {
      await childSession.sendCustomMessage({ customType: "subagent_message", content: `[Message from ${callerPath}]: ${params.message}`, display: true }, { triggerTurn: false, deliverAs: "nextTurn" });
    }
    return { delivered: true };
  }

  // ─── followup_task ─────────────────────────────────────────────

  async followupTask(
    params: FollowupTaskParams,
    ctx: ExtensionContext,
  ): Promise<{ queued: boolean; triggered: boolean }> {
    const callerPath = this.resolveCallerPath(ctx);
    const targetPath = this.resolveTarget(params.target, callerPath);
    if (targetPath === ROOT_PATH) throw new Error("Cannot send followup_task to the root agent.");
    const agent = this.registry.get(targetPath);
    if (!agent) throw new Error(`Agent not found: ${targetPath}`);
    if (!agent.open) throw new Error(`Agent at ${targetPath} is not open (status: ${agent.status}).`);

    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, params.message, "followup");

    // Update last task message
    this.registry.updateStatus(targetPath, agent.status, {
      lastTaskMessage: params.message,
    });

    // Deliver to child session
    const childSession = this.childSessions.get(targetPath);
    if (childSession) {
      if (childSession.isStreaming) {
        // Queue as follow-up
        await childSession.sendUserMessage(
          `[Follow-up from ${callerPath}]: ${params.message}`,
          { deliverAs: "followUp" },
        );
        return { queued: true, triggered: false };
      } else {
        // Trigger a new turn
        await childSession.sendUserMessage(
          `[Follow-up from ${callerPath}]: ${params.message}`,
        );
        return { queued: false, triggered: true };
      }
    }

    return { queued: true, triggered: false };
  }

  // ─── wait_agent ────────────────────────────────────────────────

  async wait(
    params: WaitAgentParams,
    ctx: ExtensionContext,
  ): Promise<WaitResult> {
    const callerPath = this.resolveCallerPath(ctx);

    const timeoutMs = clampTimeout(
      params.timeout_ms ?? this.defaultWaitTimeout,
    );

    const beforeSeq = this.mailbox.currentSeq;

    const result = await this.mailbox.waitForUpdate(
      callerPath,
      beforeSeq,
      timeoutMs,
    );

    const timedOut =
      result.events.length === 0 && result.mailbox.length === 0;

    return {
      timed_out: timedOut,
      events: result.events,
      mailbox: result.mailbox,
    };
  }

  // ─── list_agents ───────────────────────────────────────────────

  list(params: ListAgentsParams): ListResult {
    const agents = this.registry.list(params.path_prefix);
    return {
      agents: agents.map((a) => ({
        agent_id: a.agentId,
        agent_path: a.agentPath,
        status: a.status,
        last_task: a.lastTaskMessage,
        nickname: a.nickname,
        role: a.role,
        depth: a.depth,
      })),
    };
  }

  // ─── close_agent ───────────────────────────────────────────────

  async close(
    params: CloseAgentParams,
    ctx: ExtensionContext,
  ): Promise<{ closed: string[] }> {
    const callerPath = this.resolveCallerPath(ctx);
    const targetPath = this.resolveTarget(params.target, callerPath);

    if (targetPath === ROOT_PATH) {
      throw new Error("Cannot close the root agent.");
    }

    const agent = this.registry.get(targetPath);
    if (!agent) throw new Error(`Agent not found: ${targetPath}`);
    if (!agent.open) {
      throw new Error(
        `Agent at ${targetPath} is already closed (status: ${agent.status}).`,
      );
    }

    // Close descendants first (deepest first)
    const descendants = this.registry.getOpenDescendants(targetPath);
    const closed: string[] = [];

    for (const desc of descendants) {
      await this.closeSingle(desc.agentPath);
      closed.push(desc.agentPath);
    }

    // Close the target itself
    await this.closeSingle(targetPath);
    closed.push(targetPath);

    return { closed };
  }

  private async abortSession(agentPath: string): Promise<void> {
    const childSession = this.childSessions.get(agentPath);
    if (!childSession) return;
    try { await childSession.abort(); } catch { /* best-effort */ }
    try { childSession.dispose(); } catch { /* best-effort */ }
    this.childSessions.delete(agentPath);
  }

  private async closeSingle(agentPath: string): Promise<void> {
    await this.abortSession(agentPath);
    this.registry.close(agentPath, "shutdown");
    this.mailbox.appendEvent({ type: "agent_close_end", ...this.evBase(this.registry.get(agentPath)?.agentId ?? "unknown", agentPath) });
  }

  // ─── Shutdown ──────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    for (const path of [...this.childSessions.keys()]) await this.abortSession(path);
    this.registry.clear();
    this.mailbox.clear();
  }

  // ─── Accessors ─────────────────────────────────────────────────

  get openCount(): number {
    let count = 0;
    for (const agent of this.registry.list()) {
      if (agent.open) count++;
    }
    return count;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function clampTimeout(ms: number): number {
  return Math.max(MIN_WAIT_TIMEOUT_MS, Math.min(ms, MAX_WAIT_TIMEOUT_MS));
}

import { extractTextFromContent } from "./contextFork.js";
