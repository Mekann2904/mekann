/**
 * SubagentSpawner — owns spawn orchestration and runtime close.
 *
 * Hides in-process / external Pi branching, session creation,
 * fork context, authority preamble, display lifecycle, and hello handshake.
 * SpawnDelegationAdapters are fixed at construction time.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSession, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAgentSession } from "@earendil-works/pi-coding-agent";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import { ROOT_PATH, resolveTaskPath } from "./types.js";
import type { AgentDisplayRef, AgentDisplayResult, AgentMetadata, AgentRuntime, AgentStatus, ResultContract, SpawnParams, SpawnResult, SubagentAuthority } from "./types.js";
import { extractForkContext, extractLastAssistantText, truncateText } from "./contextFork.js";
import type { ForkTurns } from "./contextFork.js";
import type { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import type { ChildToParent, SubagentHub } from "./ipc.js";
import { KittyController, type LaunchPiWindowParams } from "./kittyControl.js";
import { SpawnQueue, type QueueAdmission } from "./spawnQueue.js";
import { RuntimeStore } from "./runtimeStore.js";
import { SubagentFinalizer } from "./subagentFinalizer.js";
import type { QueuedSpawnDelegation, SpawnDelegationAdapters } from "./subagentLifecycle.js";

const MAILBOX_CONTENT_MAX_CHARS = 2_000;
const SDK_BASE_TOOL_NAMES = ["read", "grep", "find", "ls", "bash", "edit", "write"] as const;

export interface SubagentSpawnerDeps {
  adapters: SpawnDelegationAdapters;
  registry: AgentRegistry;
  mailbox: Mailbox;
  queue: SpawnQueue;
  runtimes: RuntimeStore;
  finalizer: SubagentFinalizer;
}

export interface CloseRuntimeAdapters {
  kitty: KittyController;
  externalPiSlots: Set<string>;
  drainAdapters?: SpawnDelegationAdapters;
}

export class SubagentSpawner {
  constructor(private readonly deps: SubagentSpawnerDeps) {}

  // ─── Spawn ──────────────────────────────────────────────────────

  async spawn(
    params: SpawnParams,
    ctx: ExtensionContext,
    callerPath: string,
    agentId: string,
  ): Promise<SpawnResult> {
    const { registry, queue } = this.deps;
    const adapters = this.deps.adapters;

    registry.ensureRoot("root");
    const canonicalPath = resolveTaskPath(params.task_name, callerPath);
    const depth = canonicalPath.split("/").length - 2;
    if (depth > registry.maxDepth) {
      throw new Error(`Maximum agent depth exceeded (${registry.maxDepth}). Path "${canonicalPath}" would be depth ${depth}.`);
    }
    registry.assertPathAvailable(canonicalPath);

    if (!registry.hasExecutionCapacity()) {
      if (queue.length >= adapters.maxQueuedSubagents) {
        throw new Error(`Maximum queued subagents reached (${adapters.maxQueuedSubagents}). Wait for queued work to start or close queued agents before spawning more.`);
      }
      const item: QueuedSpawnDelegation = { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages: [] };
      const admission = queue.enqueue(item);
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
        createdAt: Date.now(),
        updatedAt: Date.now(),
        depth,
        open: true,
        cancellationRequested: false,
        authority: adapters.normalizeAuthority(params.authority),
        authorityEnforced: true,
        workspaceCwd: ctx.cwd,
        resultContract: params.result_contract,
        expectedValue: params.expected_value,
        justification: params.justification,
        costIntent: params.cost_intent,
        subagentType: params.type,
        queuePosition: admission.position,
        queuedAhead: admission.queuedAhead,
      };
      registry.registerQueuedAgent(metadata);
      return { agent_id: agentId, task_name: canonicalPath, status: "queued", queue_position: admission.position, queued_ahead: admission.queuedAhead };
    }

    return this.startSpawn({ params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages: [] });
  }

  /** Called by SpawnQueue.onDrain when a slot opens. */
  async startSpawnFromQueue(item: QueuedSpawnDelegation): Promise<SpawnResult> {
    return this.startSpawn(item);
  }

  // ─── Close ───────────────────────────────────────────────────────

  async closeRuntime(agentPath: string, closeAdapters: CloseRuntimeAdapters): Promise<void> {
    const { queue, runtimes, finalizer, registry, mailbox, adapters } = this.deps;
    queue.remove(agentPath);
    const agent = registry.get(agentPath);
    const display = agent?.display;
    this.logDisplay(display, "[status] shutdown", closeAdapters.kitty);

    const rt = runtimes.getRuntime(agentPath);
    if (rt?.mode === "external_pi") {
      try { await runtimes.getHub(rt.agentId)?.send(rt.agentId, { type: "shutdown", id: `shutdown_${Date.now()}` }); } catch { /* best-effort */ }
      try { await runtimes.getHub(rt.agentId)?.stop(); } catch { /* best-effort */ }
      runtimes.deleteHub(rt.agentId);
      closeAdapters.externalPiSlots.delete(rt.agentId);
      runtimes.deleteRuntime(agentPath);
    } else {
      const session = rt?.mode === "in_process" ? rt.session : runtimes.getChildSession(agentPath);
      if (session) {
        try { await session.abort(); } catch { /* best-effort */ }
        try { session.dispose(); } catch { /* best-effort */ }
      }
      runtimes.deleteRuntime(agentPath);
      runtimes.deleteChildSession(agentPath);
    }

    if (display) {
      try { await closeAdapters.kitty.close(display); } catch { /* best-effort */ }
      registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    registry.close(agentPath, "shutdown");
    mailbox.appendEvent({ type: "agent_close_end", agentId: registry.get(agentPath)?.agentId ?? "unknown", agentPath, timestamp: Date.now() });
    if (closeAdapters.drainAdapters) {
      queue.scheduleDrain();
    }
  }

  // ─── Internal: prompt assembly ───────────────────────────────────

  private buildStableSubagentPolicyPrompt(): string {
    return [
      "## Subagent Execution Policy",
      "",
      "Default execution style: silent.",
      "Do not emit progress reports, status updates, greetings, or narrated execution.",
      "Use tool calls as needed without announcing them.",
      "Emit an assistant message only for the final result, a blocked state, or an explicit parent decision request.",
      "Final output is for the parent agent, not a human; keep it compact and evidence-oriented.",
      "Communication: When you are done, provide your final result. The parent agent will receive it via wait_agent.",
      "Do not attempt to communicate with the parent agent directly.",
    ].join("\n");
  }

  private buildVolatileContextBlock(input: { params: SpawnParams; ctx: ExtensionContext; callerPath: string; canonicalPath: string; forkTurns: ForkTurns }): string {
    const lines = [
      "## Subagent Context",
      "",
      `You are a subagent at path: ${input.canonicalPath}`,
      `Parent agent path: ${input.callerPath}`,
    ];
    if (input.params.role) lines.push(`Role: ${input.params.role}`);
    if (input.params.nickname) lines.push(`Nickname: ${input.params.nickname}`);
    lines.push("");
    if (input.forkTurns !== 0 && input.forkTurns !== "none") {
      const branch = input.ctx.sessionManager?.getBranch?.() ?? [];
      const messages = branch.filter((e: any) => e.type === "message").map((e: any) => e.message as any);
      const forkCtx = extractForkContext(messages, input.forkTurns);
      if (forkCtx.length > 0) {
        lines.push("--- Parent Agent Conversation Context (forked) ---");
        for (const msg of forkCtx) lines.push(`[${msg.role === "user" ? "User" : "Assistant"}]: ${msg.text}`);
        lines.push("--- End of Forked Context ---");
      }
    }
    return lines.join("\n");
  }

  private baseToolNamesForAuthority(authority: SubagentAuthority, parentActiveTools?: Array<{ name?: string } | string>): string[] {
    const authorityAllowed = authority.mode === "edit"
      ? [...SDK_BASE_TOOL_NAMES]
      : ["read", "grep", "find", "ls"];
    const parentActiveNames = parentActiveTools?.map((t) => typeof t === "string" ? t : t.name).filter((name): name is string => Boolean(name));
    if (!parentActiveNames || parentActiveNames.length === 0) return authorityAllowed;
    const active = new Set(parentActiveNames);
    const intersection = authorityAllowed.filter((name) => active.has(name));
    return intersection.length > 0 ? intersection : authorityAllowed;
  }

  private buildLaunchMessage(input: { externalNotice?: string; preamble?: string; volatileContextBlock: string; taskMessage: string; queuedMessages: string[] }): string {
    const queuedMessagesBlock = input.queuedMessages.length > 0
      ? `--- Queued parent messages ---\n${input.queuedMessages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n")}\n--- End queued parent messages ---`
      : undefined;
    return [input.externalNotice, input.preamble, input.volatileContextBlock, input.taskMessage, queuedMessagesBlock].filter(Boolean).join("\n\n");
  }

  // ─── Internal: start spawn ───────────────────────────────────────

  private async startSpawn(item: QueuedSpawnDelegation): Promise<SpawnResult> {
    const { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages } = item;
    const { registry, mailbox, runtimes, adapters } = this.deps;

    const reservation = registry.reserveSpawnSlot(canonicalPath);
    mailbox.appendEvent({ type: "agent_spawn_begin", agentId, agentPath: canonicalPath, timestamp: Date.now(), parentAgentId: callerPath === ROOT_PATH ? undefined : callerPath });

    try {
      const authority = adapters.normalizeAuthority(params.authority);
      const resultContract = params.result_contract;
      if ((adapters.displayMode === "kitty-pi" || adapters.displayMode === "kitty-split") && adapters.allowUnsafeExternalPi) {
        return await this.spawnExternalPi(item, reservation, authority);
      }

      const model = await adapters.resolveModel(params.model, ctx);
      if (!model) throw new Error("No parent model is selected. Specify spawn_agent.model as an exact provider/model_id to avoid falling back to a default model.");

      const forkTurns = params.fork_turns ?? 0;
      const thinkingLevel = adapters.resolveThinkingLevel(params.reasoning_effort);
      const systemPrompts = [this.buildStableSubagentPolicyPrompt()];
      const authorityPrompt = adapters.authorityPreamble(authority, resultContract);
      if (authorityPrompt) systemPrompts.push(authorityPrompt);

      const parentActiveTools = adapters.pi.getActiveTools?.();
      const { session } = await createAgentSession({
        cwd: ctx.cwd,
        model,
        modelRegistry: ctx.modelRegistry,
        tools: this.baseToolNamesForAuthority(authority, parentActiveTools),
        ...(thinkingLevel ? { thinkingLevel } : {}),
        sessionManager: await import("@earendil-works/pi-coding-agent").then((m) => m.SessionManager.inMemory()),
        appendSystemPrompt: systemPrompts,
      } as any);

      const volatileContextBlock = this.buildVolatileContextBlock({ params, ctx, callerPath, canonicalPath, forkTurns });

      if (parentActiveTools && parentActiveTools.length > 0) {
        const activeSet = new Set(parentActiveTools.map((t: any) => typeof t === "string" ? t : t.name));
        session.agent.state.tools = session.agent.state.tools.filter((t: any) => activeSet.has(t.name));
      }
      if ((session as any).agent?.state?.tools) {
        session.agent.state.tools = adapters.filterToolsByAuthority(session.agent.state.tools, authority);
      }

      const now = Date.now();
      registry.registerAgent({
        agentId, sessionId: session.sessionId, parentAgentId: callerPath === ROOT_PATH ? "root" : undefined, parentSessionId: "root",
        agentPath: canonicalPath, nickname: params.nickname, role: params.role, status: "pending_init", lastTaskMessage: params.message,
        createdAt: now, updatedAt: now, depth, open: true, cancellationRequested: false, display: undefined,
        authority, authorityEnforced: true, workspaceCwd: ctx.cwd, resultContract,
        expectedValue: params.expected_value, justification: params.justification, costIntent: params.cost_intent, subagentType: params.type,
      }, reservation);

      const launchMessage = this.buildLaunchMessage({ externalNotice: undefined, preamble: undefined, volatileContextBlock, taskMessage: params.message, queuedMessages });
      this.registerInProcessRuntime({ agentId, agentPath: canonicalPath, callerPath, session, initialMessage: launchMessage, cwd: ctx.cwd, onSettled: () => this.deps.queue.scheduleDrain() });

      return { agent_id: agentId, task_name: canonicalPath, status: "pending_init", display: adapters.displayResult(registry.get(canonicalPath)?.display) };
    } catch (err) {
      registry.rollbackReservation(reservation);
      mailbox.appendEvent({ type: "agent_spawn_end", agentId, agentPath: canonicalPath, timestamp: Date.now(), success: false, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }

  // ─── Internal: external Pi spawn ─────────────────────────────────

  private async spawnExternalPi(item: QueuedSpawnDelegation, reservation: unknown, authority: SubagentAuthority): Promise<SpawnResult> {
    const { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages } = item;
    const { registry, mailbox, runtimes, adapters } = this.deps;

    if (!adapters.allowUnsafeExternalPi) throw new Error("External Pi subagents are disabled because authority cannot be enforced across an independent Pi process. Use subagent-display=none, or set subagent-allow-unsafe-external-pi=true only for fully trusted experiments.");
    if (adapters.externalPiSlots.size >= adapters.maxExternalPiSubagents) throw new Error(`Maximum number of external Pi subagents reached (${adapters.maxExternalPiSubagents}). Close an existing agent before spawning another.`);
    adapters.externalPiSlots.add(agentId);

    const logDir = adapters.logDir ?? path.join(os.tmpdir(), "pi-subagents");
    const socketPath = path.join(logDir, `${agentId}.sock`);
    const logPath = path.join(logDir, `${agentId}.kitty-pi.log`);
    const displayKind = adapters.displayMode === "kitty-split" ? "kitty-split" as const : "kitty-pi" as const;
    const display: AgentDisplayRef = { kind: displayKind, status: "opening", agentId, title: `pi subagent ${canonicalPath}`, cwd: ctx.cwd, socketPath, logPath };

    const now = Date.now();
    registry.registerAgent({
      agentId, sessionId: `external:${agentId}`, parentAgentId: callerPath === ROOT_PATH ? "root" : undefined, parentSessionId: "root",
      agentPath: canonicalPath, nickname: params.nickname, role: params.role, status: "pending_init", lastTaskMessage: params.message,
      createdAt: now, updatedAt: now, depth, open: true, cancellationRequested: false, display, authority, authorityEnforced: false, workspaceCwd: ctx.cwd, resultContract: params.result_contract,
      expectedValue: params.expected_value, justification: params.justification, costIntent: params.cost_intent, subagentType: params.type,
    }, reservation as any);

    try {
      const nonce = crypto.randomBytes(24).toString("base64url");
      const hub = adapters.hubFactory(socketPath, agentId, nonce);
      const resolvedOverride = params.model ? await adapters.resolveModel(params.model, ctx) : undefined;
      const modelId = resolvedOverride ? ((resolvedOverride as any).provider && (resolvedOverride as any).id ? `${(resolvedOverride as any).provider}/${(resolvedOverride as any).id}` : undefined) : (ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
      if (!modelId) throw new Error("External Pi subagents require an exact provider/model_id. Specify spawn_agent.model or use in-process subagents.");
      const thinkingLevel = adapters.resolveThinkingLevel(params.reasoning_effort);
      const preamble = adapters.authorityPreamble(authority, params.result_contract);
      const externalNotice = ["SECURITY NOTICE: this external Pi process is running with authorityEnforced=false.", "The parent process cannot remove write/edit/bash tools from this process.", `Requested authority mode: ${authority.mode}. Treat it as advisory unless the runtime itself removed tools.`].join("\n");
      const volatileContextBlock = this.buildVolatileContextBlock({ params, ctx, callerPath, canonicalPath, forkTurns: params.fork_turns ?? 0 });
      const launchMessage = this.buildLaunchMessage({ externalNotice, preamble, volatileContextBlock, taskMessage: params.message, queuedMessages });

      await this.registerExternalPiRuntime({
        agentId, agentPath: canonicalPath, callerPath, socketPath, display, hub, kitty: adapters.kitty,
        launchParams: { agentId, agentPath: canonicalPath, cwd: ctx.cwd, socketPath, initialMessage: launchMessage, logPath, title: display.title, piCommand: adapters.piCommand, extensionPath: adapters.extensionPath, modelId, thinkingLevel, nonce },
        displayMode: displayKind,
        helloTimeoutMs: adapters.helloTimeoutMs,
        onClosed: (id) => { adapters.externalPiSlots.delete(id); this.deps.queue.scheduleDrain(); },
      });

      return { agent_id: agentId, task_name: canonicalPath, status: registry.get(canonicalPath)?.status ?? "running", display: adapters.displayResult(registry.get(canonicalPath)?.display) };
    } catch (err) {
      adapters.externalPiSlots.delete(agentId);
      runtimes.deleteRuntime(canonicalPath);
      registry.close(canonicalPath, "errored");
      throw err;
    }
  }

  // ─── Internal: in-process runtime registration ───────────────────

  private registerInProcessRuntime(input: { agentId: string; agentPath: string; callerPath: string; session: AgentSession; initialMessage: string; cwd: string; onSettled?: () => void }): void {
    const { runtimes, finalizer, registry, adapters } = this.deps;

    const unsubscribe = input.session.subscribe((event) => {
      if (event.type === "agent_start") {
        registry.updateStatus(input.agentPath, "running");
      } else if (event.type === "agent_end") {
        const msgs = (event as any).messages as AgentMessage[] | undefined;
        const finalText = extractLastAssistantText(msgs as any) ?? undefined;

        finalizer.handleFinalText({ agentId: input.agentId, agentPath: input.agentPath, callerPath: input.callerPath, finalText, status: "completed", cwd: input.cwd });

        runtimes.deleteRuntime(input.agentPath);
        runtimes.deleteChildSession(input.agentPath);
        registry.close(input.agentPath, "completed");
        input.onSettled?.();
        unsubscribe();
      }
    });

    runtimes.setRuntime(input.agentPath, { mode: "in_process", agentId: input.agentId, agentPath: input.agentPath, session: input.session });
    runtimes.setChildSession(input.agentPath, input.session);

    void input.session.prompt(input.initialMessage).catch((err: unknown) => {
      finalizer.finalizeWithError(input.agentId, input.agentPath, input.callerPath, err);
      runtimes.deleteRuntime(input.agentPath);
      runtimes.deleteChildSession(input.agentPath);
      input.onSettled?.();
    });
  }

  // ─── Internal: external Pi runtime registration ──────────────────

  private async registerExternalPiRuntime(input: {
    agentId: string; agentPath: string; callerPath: string;
    socketPath: string; display: AgentDisplayRef; hub: SubagentHub;
    kitty: KittyController;
    launchParams: LaunchPiWindowParams;
    displayMode: "kitty-pi" | "kitty-split";
    helloTimeoutMs: number;
    onClosed?: (agentId: string) => void;
  }): Promise<void> {
    const { runtimes, registry, adapters } = this.deps;

    runtimes.setHub(input.agentId, input.hub);
    input.hub.onMessage((m) => this.handleExternalChildMessage(input.callerPath, input.agentPath, m, input.kitty, input.onClosed));
    await input.hub.start();
    runtimes.setRuntime(input.agentPath, { mode: "external_pi", agentId: input.agentId, agentPath: input.agentPath, socketPath: input.socketPath, display: input.display, connected: false });

    try {
      const opened = input.displayMode === "kitty-split"
        ? await input.kitty.launchPiSplit(input.launchParams)
        : await input.kitty.launchPiWindow(input.launchParams);
      registry.updateAgent(input.agentPath, { display: opened });
      const rt = runtimes.getRuntime(input.agentPath); if (rt?.mode === "external_pi") rt.display = opened;

      const hello = await input.hub.waitForHello(input.agentId, input.helloTimeoutMs);
      const nextDisplay = { ...registry.get(input.agentPath)?.display ?? opened, status: "open" as const, pid: hello.pid };
      registry.updateStatus(input.agentPath, "running", { display: nextDisplay });
      const rt2 = runtimes.getRuntime(input.agentPath); if (rt2?.mode === "external_pi") { rt2.connected = true; rt2.pid = hello.pid; rt2.capabilities = hello.capabilities; rt2.display = nextDisplay; }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const failed = { ...registry.get(input.agentPath)?.display ?? input.display, status: "failed" as const, error };
      registry.updateStatus(input.agentPath, "errored", { display: failed });
      registry.close(input.agentPath, "errored");
      try { await input.kitty.close(failed); } catch {}
      try { await input.hub.stop(); } catch {}
      runtimes.deleteHub(input.agentId);
      runtimes.deleteRuntime(input.agentPath);
      input.onClosed?.(input.agentId);
      throw err;
    }
  }

  // ─── Internal: external child message handling ───────────────────

  private handleExternalChildMessage(callerPath: string, agentPath: string, msg: ChildToParent, kitty: KittyController, onClosed?: (agentId: string) => void): void {
    const { registry, runtimes, finalizer, mailbox, adapters } = this.deps;
    const agent = registry.get(agentPath); if (!agent) return;

    if (msg.type === "status") {
      registry.updateStatus(agentPath, msg.status);
    } else if (msg.type === "final") {
      finalizer.handleFinalText({ agentId: msg.agentId, agentPath, callerPath, finalText: msg.message, status: msg.status, cwd: agent.workspaceCwd ?? process.cwd() });
      void this.autoCloseExternal(agentPath, kitty, onClosed);
    } else if (msg.type === "error") {
      registry.updateStatus(agentPath, "errored");
      finalizer.enqueueToMailbox(msg.agentId ?? agent.agentId, agentPath, callerPath, `Agent error: ${msg.message}`, "final_result");
      void this.autoCloseExternal(agentPath, kitty, onClosed);
    } else if (msg.type === "log") {
      this.logDisplay(agent.display, msg.line, kitty);
    }
  }

  private async autoCloseExternal(agentPath: string, kitty: KittyController, onClosed?: (agentId: string) => void): Promise<void> {
    const { registry, runtimes, mailbox } = this.deps;
    const rt = runtimes.getRuntime(agentPath);
    if (rt?.mode !== "external_pi") return;
    const agent = registry.get(agentPath);
    const display = agent?.display;
    if (display) {
      try { await kitty.close(display); } catch { /* best-effort */ }
      registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    try { await runtimes.getHub(rt.agentId)?.stop(); } catch { /* best-effort */ }
    runtimes.deleteHub(rt.agentId);
    onClosed?.(rt.agentId);
    runtimes.deleteRuntime(agentPath);
    registry.close(agentPath, agent?.status === "errored" ? "errored" : "completed");
    mailbox.appendEvent({ type: "agent_close_end", agentId: rt.agentId, agentPath, timestamp: Date.now() });
  }

  private logDisplay(display: AgentDisplayRef | undefined, line: string, kitty: KittyController): void {
    if (!display || display.status === "closed") return;
    if (display.logPath) void kitty.appendLog(display, line).catch(() => undefined);
  }
}
