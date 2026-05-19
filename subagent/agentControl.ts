/**
 * Subagent Extension — Agent control plane.
 *
 * Implements spawn_agent, send_message, followup_task, wait_agent,
 * list_agents, close_agent. Uses AgentRegistry, Mailbox, and
 * createAgentSession from the pi SDK.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAgentSession, type AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import os from "node:os";
import path from "node:path";
import { ROOT_PATH, resolveTaskPath } from "./types.js";
import { AgentRegistry } from "./registry.js";
import { Mailbox } from "./mailbox.js";
import { extractForkContext, buildContextPreamble, extractTextFromContent } from "./contextFork.js";
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
import { KittyController } from "./kittyControl.js";
import { SubagentHub } from "./ipc.js";
import type { ChildToParent } from "./ipc.js";
import type { AgentDisplayRef, AgentDisplayResult, AgentRuntime } from "./types.js";

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

export type DisplayMode = "none" | "kitty-log" | "kitty-pi";

export interface AgentControlOptions {
  displayMode?: DisplayMode;
  logDir?: string;
  kitty?: KittyController;
  hubFactory?: (socketPath: string) => SubagentHub;
  piCommand?: string;
  helloTimeoutMs?: number;
}

// ─── Agent control ───────────────────────────────────────────────

export class AgentControl {
  readonly registry: AgentRegistry;
  readonly mailbox: Mailbox;
  private runtimes = new Map<string, AgentRuntime>();
  // Back-compat for existing tests/consumers that inspect childSessions.
  private childSessions = new Map<string, import("@earendil-works/pi-coding-agent").AgentSession>();
  private hubs = new Map<string, SubagentHub>();
  private pi: import("@earendil-works/pi-coding-agent").ExtensionAPI;
  private defaultWaitTimeout: number;
  private minWaitTimeout: number;
  private lastConsumedSeq = new Map<string, number>();
  private displayMode: DisplayMode;
  private logDir: string;
  private kitty: KittyController;
  private hubFactory: (socketPath: string) => SubagentHub;
  private piCommand: string;
  private helloTimeoutMs: number;

  constructor(
    pi: import("@earendil-works/pi-coding-agent").ExtensionAPI,
    maxAgents?: number,
    maxDepth?: number,
    defaultWaitTimeout?: number,
    minWaitTimeout?: number,
    options: AgentControlOptions = {},
  ) {
    this.pi = pi;
    this.registry = new AgentRegistry(
      maxAgents ?? DEFAULT_MAX_AGENTS,
      maxDepth ?? DEFAULT_MAX_DEPTH,
    );
    this.mailbox = new Mailbox();
    this.defaultWaitTimeout = defaultWaitTimeout ?? DEFAULT_WAIT_TIMEOUT_MS;
    this.minWaitTimeout = minWaitTimeout ?? MIN_WAIT_TIMEOUT_MS;
    this.displayMode = options.displayMode ?? "none";
    this.logDir = options.logDir ?? path.join(os.tmpdir(), "pi-subagents");
    this.kitty = options.kitty ?? new KittyController();
    this.hubFactory = options.hubFactory ?? ((socketPath) => new SubagentHub(socketPath));
    this.piCommand = options.piCommand ?? "pi";
    this.helloTimeoutMs = options.helloTimeoutMs ?? 10_000;
    // DEBUG: confirm display mode
    console.error(`[subagent-ext] AgentControl init: displayMode=${this.displayMode}, logDir=${this.logDir}`);

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

  private async resolveModel(modelOverride: string | undefined, ctx: ExtensionContext) {
    let model = ctx.model;
    if (!modelOverride) return model;
    const parts = modelOverride.split("/");
    if (parts.length === 2) {
      const found = ctx.modelRegistry.find(parts[0], parts[1]);
      if (!found) throw new Error(`Model not found: ${modelOverride}. Use provider/model_id format.`);
      return found;
    }
    const all = await ctx.modelRegistry.getAvailable();
    const match = all.find((m) => m.id === modelOverride);
    if (!match) throw new Error(`Model not found: ${modelOverride}. Available: ${all.map((m) => m.id).join(", ")}`);
    return match;
  }

  // ─── Helper: finalize agent with error ─────────────────────────────

  private displayResult(display?: AgentDisplayRef): AgentDisplayResult | undefined {
    if (!display) return undefined;
    return { kind: display.kind, status: display.status, window_id: display.windowId, title: display.title, log_path: display.logPath, socket_path: display.socketPath, pid: display.pid, error: display.error };
  }

  private logDisplay(display: AgentDisplayRef | undefined, line: string): void {
    if (!display || display.status === "closed") return;
    void this.kitty.appendLog(display, line).catch(() => undefined);
  }

  private finalizeWithError(agentId: string, canonicalPath: string, callerPath: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.logDisplay(this.registry.get(canonicalPath)?.display, `[error] ${errorMessage}`);
    this.registry.updateStatus(canonicalPath, "errored");
    this.mailbox.appendEvent({
      type: "agent_final_message", ...this.evBase(agentId, canonicalPath),
      parentAgentId: this.parentAgentId(callerPath) ?? "root",
      message: `Agent error: ${errorMessage}`, status: "errored",
    });
    this.enqueueToMailbox(agentId, canonicalPath, callerPath, `Agent error: ${errorMessage}`, "final_result");
    this.runtimes.delete(canonicalPath);
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

    // Reserve slot + path atomically before async session creation
    const reservation = this.registry.reserveSpawnSlot(canonicalPath);

    // Publish spawn begin event
    const agentId = nextAgentId();
    this.mailbox.appendEvent({
      type: "agent_spawn_begin", ...this.evBase(agentId, canonicalPath),
      parentAgentId: callerPath === ROOT_PATH ? undefined : callerPath,
    });

    try {
      if (this.displayMode === "kitty-pi") {
        return await this.spawnExternalPi(params, ctx, callerPath, canonicalPath, depth, reservation, agentId);
      }

      const model = await this.resolveModel(params.model, ctx);

      const forkTurns = params.fork_turns ?? 0;

      const thinkingLevel = params.reasoning_effort as ThinkingLevel | undefined;

      const { session } = await createAgentSession({
        cwd: ctx.cwd,
        model,
        ...(thinkingLevel ? { thinkingLevel } : {}),
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
      } as any);

      // Inject fork context if requested
      if (forkTurns !== 0 && forkTurns !== "none") {
        const branch = ctx.sessionManager?.getBranch?.() ?? [];
        const messages = branch
          .filter((e: any) => e.type === "message")
          .map((e: any) => e.message as any);
        const forkCtx = extractForkContext(messages, forkTurns);
        if (forkCtx.length > 0) {
          for (const msg of forkCtx) {
            session.agent.state.messages.push({
              role: msg.role,
              content: [{ type: "text", text: msg.text }],
            } as any);
          }
        }
      }

      // Inherit parent's tool restrictions
      const parentActiveTools = this.pi.getActiveTools?.();
      if (parentActiveTools && parentActiveTools.length > 0) {
        const activeSet = new Set(parentActiveTools);
        const allTools = session.agent.state.tools;
        session.agent.state.tools = allTools.filter((t: any) => activeSet.has(t.name));
      }

      // Register agent
      const now = Date.now();
      const display: AgentDisplayRef | undefined = this.displayMode === "kitty-log" ? {
        kind: "kitty-log",
        status: "opening",
        agentId,
        title: `pi subagent ${canonicalPath}`,
        cwd: ctx.cwd,
        logPath: path.join(this.logDir, `${agentId}.log`),
      } : undefined;

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
        display,
      };

      this.registry.registerAgent(metadata, reservation);

      if (display) {
        this.logDisplay(display, `[task] ${params.message}`);
        try {
          const opened = await this.kitty.launchLogWindow({ agentId, agentPath: canonicalPath, cwd: ctx.cwd, logPath: display.logPath!, title: display.title });
          this.registry.updateAgent(canonicalPath, { display: opened });
        } catch (err) {
          this.registry.updateAgent(canonicalPath, { display: { ...display, status: "failed", error: err instanceof Error ? err.message : String(err) } });
        }
      }

      // Subscribe to child session events for status tracking
      const unsubscribe = session.subscribe((event) => {
        if (event.type === "agent_start") {
          this.logDisplay(this.registry.get(canonicalPath)?.display, "[status] running");
          this.registry.updateStatus(canonicalPath, "running");
        } else if (event.type === "agent_end") {
          // Extract final assistant text
          const msgs = (event as any).messages as AgentMessage[] | undefined;
          const lastAssistant = msgs?.filter((m) => m.role === "assistant").pop();
          const finalText = lastAssistant
            ? extractTextFromContent(lastAssistant.content) ?? undefined
            : undefined;

          this.logDisplay(this.registry.get(canonicalPath)?.display, `${finalText ?? "(agent completed)"}\n[status] completed`);
          this.registry.updateStatus(canonicalPath, "completed", {
            lastTaskMessage: finalText,
          });

          this.enqueueToMailbox(agentId, canonicalPath, callerPath, finalText ?? "(agent completed)", "final_result");

          // Publish final message lifecycle event
          this.mailbox.appendEvent({
            type: "agent_final_message", ...this.evBase(agentId, canonicalPath),
            parentAgentId: callerPath === ROOT_PATH ? undefined : "root",
            message: finalText ?? "(agent completed)",
            status: "completed",
          });

          this.runtimes.delete(canonicalPath);
          this.childSessions.delete(canonicalPath);
          unsubscribe();
        }
      });

      // Store session reference
      this.runtimes.set(canonicalPath, { mode: "in_process", agentId, agentPath: canonicalPath, session, display: this.registry.get(canonicalPath)?.display });
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
        display: this.displayResult(this.registry.get(canonicalPath)?.display),
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

  private async spawnExternalPi(params: SpawnParams, ctx: ExtensionContext, callerPath: string, canonicalPath: string, depth: number, reservation: any, agentId: string): Promise<SpawnResult> {
    const now = Date.now();
    const socketPath = path.join(this.logDir, `${agentId}.sock`);
    const display: AgentDisplayRef = { kind: "kitty-pi", status: "opening", agentId, title: `pi subagent ${canonicalPath}`, cwd: ctx.cwd, socketPath };
    const metadata: AgentMetadata = {
      agentId, sessionId: `external:${agentId}`, parentAgentId: callerPath === ROOT_PATH ? "root" : undefined, parentSessionId: "root",
      agentPath: canonicalPath, nickname: params.nickname, role: params.role, status: "pending_init", lastTaskMessage: params.message,
      createdAt: now, updatedAt: now, depth, open: true, cancellationRequested: false, display,
    };
    this.registry.registerAgent(metadata, reservation);
    const hub = this.hubFactory(socketPath);
    this.hubs.set(agentId, hub);
    hub.onMessage((m) => this.handleChildMessage(callerPath, canonicalPath, m));
    await hub.start();
    this.runtimes.set(canonicalPath, { mode: "external_pi", agentId, agentPath: canonicalPath, socketPath, display, connected: false });
    try {
      const opened = await this.kitty.launchPiWindow({ agentId, agentPath: canonicalPath, cwd: ctx.cwd, socketPath, initialMessage: params.message, title: display.title, piCommand: this.piCommand });
      this.registry.updateAgent(canonicalPath, { display: opened });
      const rt = this.runtimes.get(canonicalPath); if (rt?.mode === "external_pi") rt.display = opened;
      const hello = await hub.waitForHello(agentId, this.helloTimeoutMs);
      const nextDisplay = { ...this.registry.get(canonicalPath)?.display ?? opened, status: "open" as const, pid: hello.pid };
      this.registry.updateStatus(canonicalPath, "running", { display: nextDisplay });
      const rt2 = this.runtimes.get(canonicalPath); if (rt2?.mode === "external_pi") { rt2.connected = true; rt2.pid = hello.pid; rt2.capabilities = hello.capabilities; rt2.display = nextDisplay; }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const failed = { ...this.registry.get(canonicalPath)?.display ?? display, status: "failed" as const, error };
      this.registry.updateStatus(canonicalPath, "errored", { display: failed });
      try { await this.kitty.close(failed); } catch {}
      throw err;
    }
    return { agent_id: agentId, task_name: canonicalPath, status: this.registry.get(canonicalPath)?.status ?? "running", display: this.displayResult(this.registry.get(canonicalPath)?.display) };
  }

  private handleChildMessage(callerPath: string, agentPath: string, msg: ChildToParent): void {
    const agent = this.registry.get(agentPath); if (!agent) return;
    if (msg.type === "status") this.registry.updateStatus(agentPath, msg.status);
    else if (msg.type === "final") { this.registry.updateStatus(agentPath, msg.status); this.enqueueToMailbox(msg.agentId, agentPath, callerPath, msg.message, "final_result"); this.mailbox.appendEvent({ type: "agent_final_message", ...this.evBase(msg.agentId, agentPath), parentAgentId: callerPath === ROOT_PATH ? undefined : callerPath, message: msg.message, status: msg.status }); }
    else if (msg.type === "error") { this.registry.updateStatus(agentPath, "errored"); this.enqueueToMailbox(msg.agentId ?? agent.agentId, agentPath, callerPath, `Agent error: ${msg.message}`, "final_result"); }
    else if (msg.type === "log") this.logDisplay(agent.display, msg.line);
  }

  private getRuntimeByAgentId(agentId: string): AgentRuntime | undefined {
    for (const rt of this.runtimes.values()) if (rt.agentId === agentId) return rt;
  }

  private enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.mailbox.enqueue({ fromAgentId, fromAgentPath: fromPath, toAgentPath: toPath, content, timestamp: Date.now(), kind });
  }

  private getCallerAgentId(callerPath: string): string {
    return this.registry.get(callerPath)?.agentId ?? "root";
  }

  /** Resolve target path + lookup agent. Throws if not found. */
  private resolveAgentOrFail(target: string, callerPath: string): { targetPath: string; agent: AgentMetadata } {
    const targetPath = this.resolveTarget(target, callerPath);
    const agent = this.registry.get(targetPath);
    if (!agent) throw new Error(`Agent not found: ${targetPath}`);
    return { targetPath, agent };
  }

  /** Resolve target agent path + get child session. Shared by sendMessage/followupTask. */
  private resolveTargetSession(target: string, ctx: ExtensionContext): { callerPath: string; targetPath: string; agent: AgentMetadata; childSession: AgentSession | undefined } {
    const callerPath = this.resolveCallerPath(ctx);
    const { targetPath, agent } = this.resolveAgentOrFail(target, callerPath);
    const rt = this.runtimes.get(targetPath);
    return { callerPath, targetPath, agent, childSession: rt?.mode === "in_process" ? rt.session : undefined };
  }

  // ─── send_message ──────────────────────────────────────────────

  async sendMessage(
    params: SendMessageParams,
    ctx: ExtensionContext,
  ): Promise<{ delivered: boolean }> {
    const { callerPath, targetPath, agent, childSession } = this.resolveTargetSession(params.target, ctx);
    if (!agent.open || isTerminalStatus(agent.status)) throw new Error(`Agent at ${targetPath} is not open (status: ${agent.status}). Cannot send message.`);
    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, params.message, "message");
    this.logDisplay(agent.display, `[message from ${callerPath}] ${params.message}`);

    const rt = this.runtimes.get(targetPath);
    if (rt?.mode === "external_pi") {
      if (!rt.capabilities?.includes("message")) throw new Error(`External Pi subagent ${targetPath} does not support message injection.`);
      await this.hubs.get(rt.agentId)?.send(rt.agentId, { type: "message", id: `msg_${Date.now()}`, fromAgentPath: callerPath, message: params.message });
    } else if (childSession) {
      await childSession.sendCustomMessage({ customType: "subagent_message", content: `[Message from ${callerPath}]: ${params.message}`, display: true }, { triggerTurn: false, deliverAs: "nextTurn" });
    }
    return { delivered: true };
  }

  // ─── followup_task ─────────────────────────────────────────────

  async followupTask(
    params: FollowupTaskParams,
    ctx: ExtensionContext,
  ): Promise<{ queued: boolean; triggered: boolean }> {
    const { callerPath, targetPath, agent, childSession } = this.resolveTargetSession(params.target, ctx);
    if (targetPath === ROOT_PATH) throw new Error("Cannot send followup_task to the root agent.");
    if (!agent.open || isTerminalStatus(agent.status)) {
      throw new Error(`Cannot follow up a terminal agent (status: ${agent.status}).`);
    }

    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, params.message, "followup");
    this.logDisplay(agent.display, `[followup from ${callerPath}] ${params.message}`);

    // Update last task message
    this.registry.updateStatus(targetPath, agent.status, {
      lastTaskMessage: params.message,
    });

    // Deliver to child session or external Pi over IPC. Never use kitty send-text here.
    const rt = this.runtimes.get(targetPath);
    if (rt?.mode === "external_pi") {
      if (!rt.capabilities?.includes("followup")) throw new Error(`External Pi subagent ${targetPath} does not support followup injection.`);
      await this.hubs.get(rt.agentId)?.send(rt.agentId, { type: "followup", id: `fu_${Date.now()}`, message: params.message });
      return { queued: true, triggered: true };
    } else if (childSession) {
      const triggered = !childSession.isStreaming;
      await childSession.sendUserMessage(
        `[Follow-up from ${callerPath}]: ${params.message}`,
        childSession.isStreaming ? { deliverAs: "followUp" } : undefined,
      );
      return { queued: true, triggered };
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
      this.minWaitTimeout,
    );

    const beforeSeq = this.lastConsumedSeq.get(callerPath) ?? 0;

    const result = await this.mailbox.waitForUpdate(
      callerPath,
      beforeSeq,
      timeoutMs,
    );

    // Update consumed seq to prevent re-delivery
    const maxSeq = Math.max(
      ...result.mailbox.map((m) => m.seq),
      ...result.events.map((e) => "seq" in e ? (e as any).seq as number : 0),
      beforeSeq,
    );
    this.lastConsumedSeq.set(callerPath, maxSeq);

    const timedOut =
      result.events.length === 0 && result.mailbox.length === 0;

    return {
      timed_out: timedOut,
      events: result.events,
      mailbox: result.mailbox,
    };
  }

  // ─── list_agents ───────────────────────────────────────────────

  /** List raw agents (for internal use by commands, avoids snake_case round-trip). */
  listAgents(pathPrefix?: string): AgentMetadata[] {
    return this.registry.list(pathPrefix);
  }

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
        display: this.displayResult(a.display),
      })),
    };
  }

  // ─── close_agent ───────────────────────────────────────────────

  async close(
    params: CloseAgentParams,
    ctx: ExtensionContext,
  ): Promise<{ closed: string[] }> {
    const { targetPath } = this.resolveTargetSession(params.target, ctx);

    if (targetPath === ROOT_PATH) {
      throw new Error("Cannot close the root agent.");
    }

    const agent = this.registry.get(targetPath); if (!agent?.open) throw new Error(`Agent at ${targetPath} is already closed (status: ${agent?.status ?? "unknown"}).`);

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
    const rt = this.runtimes.get(agentPath);
    const session = rt?.mode === "in_process" ? rt.session : this.childSessions.get(agentPath);
    if (!session) return;
    try { await session.abort(); } catch { /* best-effort */ }
    try { session.dispose(); } catch { /* best-effort */ }
    this.runtimes.delete(agentPath);
    this.childSessions.delete(agentPath);
  }

  private async closeSingle(agentPath: string): Promise<void> {
    const display = this.registry.get(agentPath)?.display;
    this.logDisplay(display, "[status] shutdown");
    const rt = this.runtimes.get(agentPath);
    if (rt?.mode === "external_pi") {
      try { await this.hubs.get(rt.agentId)?.send(rt.agentId, { type: "shutdown", id: `shutdown_${Date.now()}` }); } catch { /* best-effort */ }
      try { await this.hubs.get(rt.agentId)?.stop(); } catch { /* best-effort */ }
      this.hubs.delete(rt.agentId);
      this.runtimes.delete(agentPath);
    } else {
      await this.abortSession(agentPath);
    }
    if (display) {
      try { await this.kitty.close(display); } catch { /* best-effort */ }
      this.registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    this.registry.close(agentPath, "shutdown");
    this.mailbox.appendEvent({ type: "agent_close_end", ...this.evBase(this.registry.get(agentPath)?.agentId ?? "unknown", agentPath) });
  }

  async focus(target: string, ctx: ExtensionContext): Promise<{ focused: boolean; warning?: string }> {
    const callerPath = this.resolveCallerPath(ctx);
    const { agent } = this.resolveAgentOrFail(target, callerPath);
    const display = agent.display;
    if (!display || (display.kind !== "kitty-log" && display.kind !== "kitty-pi") || display.status !== "open") {
      return { focused: false, warning: `No open kitty display for ${agent.agentPath}.` };
    }
    try {
      await this.kitty.focus(display);
      return { focused: true };
    } catch (err) {
      return { focused: false, warning: err instanceof Error ? err.message : String(err) };
    }
  }

  // ─── Shutdown ──────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    for (const agent of this.registry.list()) {
      if (agent.display && agent.display.status === "open") {
        try { await this.kitty.close(agent.display); } catch { /* best-effort */ }
      }
    }
    for (const path of [...new Set([...this.runtimes.keys(), ...this.childSessions.keys()])]) await this.closeSingle(path).catch(() => undefined);
    this.registry.clear();
    this.mailbox.clear();
  }

  // ─── Accessors ─────────────────────────────────────────────────

  get openCount(): number {
    return this.registry.openCount;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function clampTimeout(ms: number, minMs: number = MIN_WAIT_TIMEOUT_MS): number {
  return Math.max(minMs, Math.min(ms, MAX_WAIT_TIMEOUT_MS));
}

