import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentSession, ExtensionContext, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import os from "node:os";
import path from "node:path";
import { ROOT_PATH, resolveTaskPath } from "./types.js";
import type { AgentDisplayRef, AgentDisplayResult, AgentMetadata, AgentRuntime, AgentStatus, ResultContract, SpawnParams, SpawnResult, SubagentAuthority } from "./types.js";
import { buildContextPreamble, extractForkContext, extractTextFromContent, truncateText } from "./contextFork.js";
import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { resultSummary, SubagentResultStore } from "./resultStore.js";
import type { ChildToParent, SubagentHub } from "./ipc.js";
import { KittyController, type LaunchPiWindowParams } from "./kittyControl.js";

const MAILBOX_CONTENT_MAX_CHARS = 2_000;

export interface QueuedSpawnDelegation {
  params: SpawnParams;
  ctx: ExtensionContext;
  callerPath: string;
  canonicalPath: string;
  depth: number;
  agentId: string;
  queuedMessages: string[];
}

export interface SpawnDelegationAdapters {
  pi: ExtensionAPI;
  displayMode: "none" | "kitty-pi" | "kitty-split";
  logDir?: string;
  kitty: KittyController;
  hubFactory: (socketPath: string) => SubagentHub;
  piCommand: string;
  extensionPath?: string;
  helloTimeoutMs: number;
  allowUnsafeExternalPi: boolean;
  maxQueuedSubagents: number;
  maxExternalPiSubagents: number;
  externalPiSlots: Set<string>;
  normalizeAuthority: (authority?: SubagentAuthority) => SubagentAuthority;
  authorityPreamble: (authority: SubagentAuthority, resultContract?: ResultContract) => string | undefined;
  filterToolsByAuthority: (tools: any[], authority: SubagentAuthority) => any[];
  resolveModel: (modelOverride: string | undefined, ctx: ExtensionContext) => Promise<any>;
  resolveThinkingLevel: (reasoningEffort: string | undefined) => ThinkingLevel | undefined;
  displayResult: (display?: AgentDisplayRef) => AgentDisplayResult | undefined;
}

export interface SpawnDelegationInput {
  params: SpawnParams;
  ctx: ExtensionContext;
  callerPath: string;
  agentId: string;
  adapters: SpawnDelegationAdapters;
}

export interface FinalizeSubagentInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  finalText?: string;
  status: AgentStatus;
  cwd?: string;
}

export interface RegisterInProcessRuntimeInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  session: AgentSession;
  initialMessage: string;
  cwd: string;
  onSettled?: () => void;
}

export interface RegisterExternalPiRuntimeInput {
  agentId: string;
  agentPath: string;
  callerPath: string;
  socketPath: string;
  display: AgentDisplayRef;
  hub: SubagentHub;
  kitty: KittyController;
  launchParams: LaunchPiWindowParams;
  displayMode: "kitty-pi" | "kitty-split";
  helloTimeoutMs: number;
  onClosed?: (agentId: string) => void;
}

export class SubagentLifecycle {
  readonly resultStore: SubagentResultStore;
  private storesByCwd = new Map<string, SubagentResultStore>();
  private spawnQueue: QueuedSpawnDelegation[] = [];
  private drainingSpawnQueue = false;
  readonly runtimes = new Map<string, AgentRuntime>();
  readonly childSessions = new Map<string, AgentSession>();
  readonly hubs = new Map<string, SubagentHub>();

  constructor(private readonly registry: AgentRegistry, private readonly mailbox: Mailbox, cwd = process.cwd()) {
    this.resultStore = this.resultStoreFor(cwd);
  }

  resultStoreFor(cwd: string): SubagentResultStore {
    const key = cwd;
    let store = this.storesByCwd.get(key);
    if (!store) { store = new SubagentResultStore(key); this.storesByCwd.set(key, store); }
    return store;
  }

  getRuntime(agentPath: string): AgentRuntime | undefined { return this.runtimes.get(agentPath); }
  setRuntime(agentPath: string, runtime: AgentRuntime): void { this.runtimes.set(agentPath, runtime); }
  deleteRuntime(agentPath: string): void { this.runtimes.delete(agentPath); }
  runtimePaths(): string[] { return [...this.runtimes.keys()]; }
  getRuntimeByAgentId(agentId: string): AgentRuntime | undefined { for (const rt of this.runtimes.values()) if (rt.agentId === agentId) return rt; }

  queueMessageToQueued(agentPath: string, message: string): boolean {
    const queued = this.spawnQueue.find((item) => item.canonicalPath === agentPath);
    if (!queued) return false;
    queued.queuedMessages.push(message);
    return true;
  }

  removeQueued(agentPath: string): boolean {
    const index = this.spawnQueue.findIndex((item) => item.canonicalPath === agentPath);
    if (index < 0) return false;
    this.spawnQueue.splice(index, 1);
    this.refreshQueuePositions();
    return true;
  }

  private scheduleDrainSpawnQueue(adapters: SpawnDelegationAdapters): void {
    queueMicrotask(() => { void this.drainSpawnQueue(adapters); });
  }

  private async drainSpawnQueue(adapters: SpawnDelegationAdapters): Promise<void> {
    if (this.drainingSpawnQueue) return;
    this.drainingSpawnQueue = true;
    try {
      while (this.spawnQueue.length > 0 && this.registry.hasExecutionCapacity()) {
        const item = this.spawnQueue.shift()!;
        this.refreshQueuePositions();
        const agent = this.registry.get(item.canonicalPath);
        if (!agent?.open || agent.status !== "queued") continue;
        try {
          await this.startSpawn(item, adapters);
        } catch (err) {
          this.registry.updateStatus(item.canonicalPath, "errored");
          this.registry.close(item.canonicalPath, "errored");
          this.mailbox.appendEvent({ type: "agent_spawn_end", agentId: item.agentId, agentPath: item.canonicalPath, timestamp: Date.now(), success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      this.drainingSpawnQueue = false;
    }
  }

  private refreshQueuePositions(): void {
    this.spawnQueue.forEach((item, index) => this.registry.updateAgent(item.canonicalPath, { queuePosition: index + 1, queuedAhead: index }));
  }

  async spawnDelegation(input: SpawnDelegationInput): Promise<SpawnResult> {
    const { params, ctx, callerPath, agentId, adapters } = input;
    this.registry.ensureRoot("root");
    const canonicalPath = resolveTaskPath(params.task_name, callerPath);
    const depth = canonicalPath.split("/").length - 2;
    if (depth > this.registry.maxDepth) {
      throw new Error(`Maximum agent depth exceeded (${this.registry.maxDepth}). Path "${canonicalPath}" would be depth ${depth}.`);
    }
    this.registry.assertPathAvailable(canonicalPath);

    if (!this.registry.hasExecutionCapacity()) {
      if (this.spawnQueue.length >= adapters.maxQueuedSubagents) {
        throw new Error(`Maximum queued subagents reached (${adapters.maxQueuedSubagents}). Wait for queued work to start or close queued agents before spawning more.`);
      }
      const now = Date.now();
      const item: QueuedSpawnDelegation = { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages: [] };
      this.spawnQueue.push(item);
      const queuePosition = this.spawnQueue.length;
      const metadata: AgentMetadata = {
        agentId,
        sessionId: `queued:${agentId}`,
        parentAgentId: callerPath === ROOT_PATH ? "root" : undefined,
        parentSessionId: "root",
        agentPath: canonicalPath,
        nickname: params.nickname,
        role: params.role,
        status: "queued",
        lastTaskMessage: params.message,
        createdAt: now,
        updatedAt: now,
        depth,
        open: true,
        cancellationRequested: false,
        authority: adapters.normalizeAuthority(params.authority),
        authorityEnforced: true,
        workspaceCwd: ctx.cwd,
        resultContract: params.result_contract,
        queuePosition,
        queuedAhead: queuePosition - 1,
      };
      this.registry.registerQueuedAgent(metadata);
      return { agent_id: agentId, task_name: canonicalPath, status: "queued", queue_position: queuePosition, queued_ahead: queuePosition - 1 };
    }

    return this.startSpawn({ params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages: [] }, adapters);
  }

  private async startSpawn(item: QueuedSpawnDelegation, adapters: SpawnDelegationAdapters): Promise<SpawnResult> {
    const { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages } = item;
    const reservation = this.registry.reserveSpawnSlot(canonicalPath);
    this.mailbox.appendEvent({ type: "agent_spawn_begin", agentId, agentPath: canonicalPath, timestamp: Date.now(), parentAgentId: callerPath === ROOT_PATH ? undefined : callerPath });
    try {
      const authority = adapters.normalizeAuthority(params.authority);
      const resultContract = params.result_contract;
      if ((adapters.displayMode === "kitty-pi" || adapters.displayMode === "kitty-split") && adapters.allowUnsafeExternalPi) {
        return await this.spawnExternalPi(item, reservation, adapters, authority);
      }
      const model = await adapters.resolveModel(params.model, ctx);
      if (!model) throw new Error("No parent model is selected. Specify spawn_agent.model as an exact provider/model_id to avoid falling back to a default model.");
      const forkTurns = params.fork_turns ?? 0;
      const thinkingLevel = adapters.resolveThinkingLevel(params.reasoning_effort);
      const systemPrompts = [buildContextPreamble({ agentPath: canonicalPath, parentPath: callerPath, role: params.role, nickname: params.nickname })];
      const authorityPrompt = adapters.authorityPreamble(authority, resultContract);
      if (authorityPrompt) systemPrompts.push(authorityPrompt);
      const { session } = await createAgentSession({
        cwd: ctx.cwd,
        model,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        sessionManager: await import("@earendil-works/pi-coding-agent").then((m) => m.SessionManager.inMemory()),
        appendSystemPrompt: systemPrompts,
      } as any);
      let forkContextBlock: string | undefined;
      if (forkTurns !== 0 && forkTurns !== "none") {
        const branch = ctx.sessionManager?.getBranch?.() ?? [];
        const messages = branch.filter((e: any) => e.type === "message").map((e: any) => e.message as any);
        const forkCtx = extractForkContext(messages, forkTurns);
        if (forkCtx.length > 0) {
          const lines = ["--- Parent Agent Conversation Context (forked) ---"];
          for (const msg of forkCtx) lines.push(`[${msg.role === "user" ? "User" : "Assistant"}]: ${msg.text}`);
          lines.push("--- End of Forked Context ---");
          forkContextBlock = lines.join("\n");
        }
      }
      const parentActiveTools = adapters.pi.getActiveTools?.();
      if (parentActiveTools && parentActiveTools.length > 0) {
        const activeSet = new Set(parentActiveTools.map((t: any) => t.name));
        session.agent.state.tools = session.agent.state.tools.filter((t: any) => activeSet.has(t.name));
      }
      if ((session as any).agent?.state?.tools) session.agent.state.tools = adapters.filterToolsByAuthority(session.agent.state.tools, authority);
      const now = Date.now();
      this.registry.registerAgent({
        agentId, sessionId: session.sessionId, parentAgentId: callerPath === ROOT_PATH ? "root" : undefined, parentSessionId: "root",
        agentPath: canonicalPath, nickname: params.nickname, role: params.role, status: "pending_init", lastTaskMessage: params.message,
        createdAt: now, updatedAt: now, depth, open: true, cancellationRequested: false, display: undefined,
        authority, authorityEnforced: true, workspaceCwd: ctx.cwd, resultContract,
      }, reservation);
      const baseInitialMessage = forkContextBlock ? `${forkContextBlock}\n\n${params.message}` : params.message;
      const queuedMessagesBlock = queuedMessages.length > 0 ? `\n\n--- Queued parent messages ---\n${queuedMessages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n")}\n--- End queued parent messages ---` : "";
      this.registerInProcessRuntime({ agentId, agentPath: canonicalPath, callerPath, session, initialMessage: `${baseInitialMessage}${queuedMessagesBlock}`, cwd: ctx.cwd, onSettled: () => this.scheduleDrainSpawnQueue(adapters) });
      return { agent_id: agentId, task_name: canonicalPath, status: "pending_init", display: adapters.displayResult(this.registry.get(canonicalPath)?.display) };
    } catch (err) {
      this.registry.rollbackReservation(reservation);
      this.mailbox.appendEvent({ type: "agent_spawn_end", agentId, agentPath: canonicalPath, timestamp: Date.now(), success: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  private async spawnExternalPi(item: QueuedSpawnDelegation, reservation: any, adapters: SpawnDelegationAdapters, authority: SubagentAuthority): Promise<SpawnResult> {
    const { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages } = item;
    if (!adapters.allowUnsafeExternalPi) throw new Error("External Pi subagents are disabled because authority cannot be enforced across an independent Pi process. Use subagent-display=none, or set subagent-allow-unsafe-external-pi=true only for fully trusted experiments.");
    if (adapters.externalPiSlots.size >= adapters.maxExternalPiSubagents) throw new Error(`Maximum number of external Pi subagents reached (${adapters.maxExternalPiSubagents}). Close an existing agent before spawning another.`);
    adapters.externalPiSlots.add(agentId);
    const logDir = adapters.logDir ?? path.join(os.tmpdir(), "pi-subagents");
    const socketPath = path.join(logDir, `${agentId}.sock`);
    const logPath = path.join(logDir, `${agentId}.kitty-pi.log`);
    const displayKind = adapters.displayMode === "kitty-split" ? "kitty-split" as const : "kitty-pi" as const;
    const display: AgentDisplayRef = { kind: displayKind, status: "opening", agentId, title: `pi subagent ${canonicalPath}`, cwd: ctx.cwd, socketPath, logPath };
    const now = Date.now();
    this.registry.registerAgent({
      agentId, sessionId: `external:${agentId}`, parentAgentId: callerPath === ROOT_PATH ? "root" : undefined, parentSessionId: "root",
      agentPath: canonicalPath, nickname: params.nickname, role: params.role, status: "pending_init", lastTaskMessage: params.message,
      createdAt: now, updatedAt: now, depth, open: true, cancellationRequested: false, display, authority, authorityEnforced: false, workspaceCwd: ctx.cwd, resultContract: params.result_contract,
    }, reservation);
    try {
      const hub = adapters.hubFactory(socketPath);
      const resolvedOverride = params.model ? await adapters.resolveModel(params.model, ctx) : undefined;
      const modelId = resolvedOverride ? ((resolvedOverride as any).provider && (resolvedOverride as any).id ? `${(resolvedOverride as any).provider}/${(resolvedOverride as any).id}` : undefined) : (ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
      if (!modelId) throw new Error("External Pi subagents require an exact provider/model_id. Specify spawn_agent.model or use in-process subagents.");
      const thinkingLevel = adapters.resolveThinkingLevel(params.reasoning_effort);
      const preamble = adapters.authorityPreamble(authority, params.result_contract);
      const externalNotice = ["SECURITY NOTICE: this external Pi process is running with authorityEnforced=false.", "The parent process cannot remove write/edit/bash tools from this process.", `Requested authority mode: ${authority.mode}. Treat it as advisory unless the runtime itself removed tools.`].join("\n");
      const queuedMessagesBlock = queuedMessages.length > 0 ? `--- Queued parent messages ---\n${queuedMessages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n")}\n--- End queued parent messages ---` : undefined;
      const launchMessage = [externalNotice, preamble, params.message, queuedMessagesBlock].filter(Boolean).join("\n\n");
      await this.registerExternalPiRuntime({
        agentId, agentPath: canonicalPath, callerPath, socketPath, display, hub, kitty: adapters.kitty,
        launchParams: { agentId, agentPath: canonicalPath, cwd: ctx.cwd, socketPath, initialMessage: launchMessage, logPath, title: display.title, piCommand: adapters.piCommand, extensionPath: adapters.extensionPath, modelId, thinkingLevel },
        displayMode: displayKind,
        helloTimeoutMs: adapters.helloTimeoutMs,
        onClosed: (id) => { adapters.externalPiSlots.delete(id); this.scheduleDrainSpawnQueue(adapters); },
      });
      return { agent_id: agentId, task_name: canonicalPath, status: this.registry.get(canonicalPath)?.status ?? "running", display: adapters.displayResult(this.registry.get(canonicalPath)?.display) };
    } catch (err) {
      adapters.externalPiSlots.delete(agentId);
      this.deleteRuntime(canonicalPath);
      this.registry.close(canonicalPath, "errored");
      throw err;
    }
  }

  getChildSession(agentPath: string): AgentSession | undefined { return this.childSessions.get(agentPath); }
  setChildSession(agentPath: string, session: AgentSession): void { this.childSessions.set(agentPath, session); }
  deleteChildSession(agentPath: string): void { this.childSessions.delete(agentPath); }
  childSessionPaths(): string[] { return [...this.childSessions.keys()]; }

  setHub(agentId: string, hub: SubagentHub): void { this.hubs.set(agentId, hub); }
  getHub(agentId: string): SubagentHub | undefined { return this.hubs.get(agentId); }
  deleteHub(agentId: string): void { this.hubs.delete(agentId); }

  registerInProcessRuntime(input: RegisterInProcessRuntimeInput): void {
    const unsubscribe = input.session.subscribe((event) => {
      if (event.type === "agent_start") {
        this.registry.updateStatus(input.agentPath, "running");
      } else if (event.type === "agent_end") {
        const msgs = (event as any).messages as AgentMessage[] | undefined;
        const lastAssistant = msgs?.filter((m) => m.role === "assistant").pop();
        const finalText = lastAssistant ? extractTextFromContent(lastAssistant.content) ?? undefined : undefined;

        this.handleFinalText({ agentId: input.agentId, agentPath: input.agentPath, callerPath: input.callerPath, finalText, status: "completed", cwd: input.cwd });

        this.deleteRuntime(input.agentPath);
        this.deleteChildSession(input.agentPath);
        this.registry.close(input.agentPath, "completed");
        input.onSettled?.();
        unsubscribe();
      }
    });

    this.setRuntime(input.agentPath, { mode: "in_process", agentId: input.agentId, agentPath: input.agentPath, session: input.session });
    this.setChildSession(input.agentPath, input.session);

    void input.session.prompt(input.initialMessage).catch((err: unknown) => {
      this.finalizeWithError(input.agentId, input.agentPath, input.callerPath, err);
      input.onSettled?.();
    });
  }

  async registerExternalPiRuntime(input: RegisterExternalPiRuntimeInput): Promise<void> {
    this.setHub(input.agentId, input.hub);
    input.hub.onMessage((m) => this.handleExternalChildMessage(input.callerPath, input.agentPath, m, input.kitty, input.onClosed));
    await input.hub.start();
    this.setRuntime(input.agentPath, { mode: "external_pi", agentId: input.agentId, agentPath: input.agentPath, socketPath: input.socketPath, display: input.display, connected: false });
    try {
      const opened = input.displayMode === "kitty-split"
        ? await input.kitty.launchPiSplit(input.launchParams)
        : await input.kitty.launchPiWindow(input.launchParams);
      this.registry.updateAgent(input.agentPath, { display: opened });
      const rt = this.getRuntime(input.agentPath); if (rt?.mode === "external_pi") rt.display = opened;
      const hello = await input.hub.waitForHello(input.agentId, input.helloTimeoutMs);
      const nextDisplay = { ...this.registry.get(input.agentPath)?.display ?? opened, status: "open" as const, pid: hello.pid };
      this.registry.updateStatus(input.agentPath, "running", { display: nextDisplay });
      const rt2 = this.getRuntime(input.agentPath); if (rt2?.mode === "external_pi") { rt2.connected = true; rt2.pid = hello.pid; rt2.capabilities = hello.capabilities; rt2.display = nextDisplay; }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const failed = { ...this.registry.get(input.agentPath)?.display ?? input.display, status: "failed" as const, error };
      this.registry.updateStatus(input.agentPath, "errored", { display: failed });
      this.registry.close(input.agentPath, "errored");
      try { await input.kitty.close(failed); } catch {}
      try { await input.hub.stop(); } catch {}
      this.deleteHub(input.agentId);
      this.deleteRuntime(input.agentPath);
      input.onClosed?.(input.agentId);
      throw err;
    }
  }

  handleExternalChildMessage(callerPath: string, agentPath: string, msg: ChildToParent, kitty: KittyController, onClosed?: (agentId: string) => void): void {
    const agent = this.registry.get(agentPath); if (!agent) return;
    if (msg.type === "status") {
      this.registry.updateStatus(agentPath, msg.status);
    } else if (msg.type === "final") {
      this.handleFinalText({ agentId: msg.agentId, agentPath, callerPath, finalText: msg.message, status: msg.status, cwd: agent.workspaceCwd ?? process.cwd() });
      void this.autoCloseExternal(agentPath, kitty, onClosed);
    } else if (msg.type === "error") {
      this.registry.updateStatus(agentPath, "errored");
      this.enqueueToMailbox(msg.agentId ?? agent.agentId, agentPath, callerPath, `Agent error: ${msg.message}`, "final_result");
      void this.autoCloseExternal(agentPath, kitty, onClosed);
    } else if (msg.type === "log") {
      this.logDisplay(agent.display, msg.line, kitty);
    }
  }

  async autoCloseExternal(agentPath: string, kitty: KittyController, onClosed?: (agentId: string) => void): Promise<void> {
    const rt = this.getRuntime(agentPath);
    if (rt?.mode !== "external_pi") return;
    const agent = this.registry.get(agentPath);
    const display = agent?.display;
    if (display) {
      try { await kitty.close(display); } catch { /* best-effort */ }
      this.registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    try { await this.getHub(rt.agentId)?.stop(); } catch { /* best-effort */ }
    this.deleteHub(rt.agentId);
    onClosed?.(rt.agentId);
    this.deleteRuntime(agentPath);
    this.registry.close(agentPath, agent?.status === "errored" ? "errored" : "completed");
    this.mailbox.appendEvent({ type: "agent_close_end", agentId: rt.agentId, agentPath, timestamp: Date.now() });
  }

  private logDisplay(display: AgentDisplayRef | undefined, line: string, kitty: KittyController): void {
    if (!display || display.status === "closed") return;
    if (display.logPath) void kitty.appendLog(display, line).catch(() => undefined);
  }

  finalizeWithError(agentId: string, agentPath: string, callerPath: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    this.registry.updateStatus(agentPath, "errored");
    this.mailbox.appendEvent({
      type: "agent_final_message",
      agentId,
      agentPath,
      timestamp: Date.now(),
      parentAgentId: callerPath === ROOT_PATH ? undefined : "root",
      message: `Agent error: ${errorMessage}`,
      status: "errored",
    });
    this.enqueueToMailbox(agentId, agentPath, callerPath, `Agent error: ${errorMessage}`, "final_result");
    this.deleteRuntime(agentPath);
    this.deleteChildSession(agentPath);
  }

  handleFinalText(input: FinalizeSubagentInput): string {
    const text = input.finalText ?? "(agent completed)";
    const parsed = tryParseSubagentResult(text);
    let message = truncateText(text, MAILBOX_CONTENT_MAX_CHARS);
    const agent = this.registry.get(input.agentPath);
    if (parsed.ok && agent) {
      const stored = this.resultStoreFor(input.cwd ?? process.cwd()).save(agent, parsed.result);
      message = resultSummary(stored);
    }
    this.registry.updateStatus(input.agentPath, input.status, { lastTaskMessage: message });
    this.enqueueToMailbox(input.agentId, input.agentPath, input.callerPath, message, "final_result");
    this.mailbox.appendEvent({
      type: "agent_final_message",
      agentId: input.agentId,
      agentPath: input.agentPath,
      timestamp: Date.now(),
      parentAgentId: input.callerPath === ROOT_PATH ? undefined : "root",
      message,
      status: input.status,
    });
    return message;
  }

  enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.mailbox.enqueue({ fromAgentId, fromAgentPath: fromPath, toAgentPath: toPath, content: truncateText(content, MAILBOX_CONTENT_MAX_CHARS), timestamp: Date.now(), kind });
  }
}
