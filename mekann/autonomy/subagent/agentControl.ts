/**
 * Subagent Extension — Agent control plane.
 *
 * Implements spawn_agent, send_message, followup_task, wait_agent,
 * list_agents, close_agent. Uses AgentRegistry, Mailbox, and
 * createAgentSession from the pi SDK.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAgentSession, type AgentSession } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import os from "node:os";
import path from "node:path";
import { ROOT_PATH, resolveTaskPath, parentPath } from "./types.js";
import { AgentSessionControl } from "./agentSession.js";
import { AgentRegistry } from "./registry.js";
import { Mailbox } from "./mailbox.js";
import { extractForkContext, buildContextPreamble } from "./contextFork.js";
import type {
  AgentMetadata,
  AgentStatus,
  CloseAgentParams,
  FollowupTaskParams,
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
import type { AgentDisplayRef, AgentDisplayResult, AgentRuntime, ResultContract, SubagentAuthority } from "./types.js";
import type { SubagentResultStore } from "./resultStore.js";
import { ApplyQueue } from "./applyQueue.js";
import { SubagentLifecycle } from "./subagentLifecycle.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";

// ─── Default config ──────────────────────────────────────────────

// Includes the root agent. Therefore 3 open agents = root + max 2 subagents.
const DEFAULT_MAX_AGENTS = MEKANN_SUBAGENT_DEFAULTS.maxOpenAgents;
const HARD_MAX_OPEN_AGENTS = MEKANN_SUBAGENT_DEFAULTS.maxOpenAgents;
const DEFAULT_MAX_DEPTH = MEKANN_SUBAGENT_DEFAULTS.maxDepth;
const DEFAULT_MAX_QUEUED_SUBAGENTS = MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents;
const DEFAULT_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.defaultWaitTimeoutMs;
const MAX_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.maxWaitTimeoutMs;
const MIN_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs;

export const DEFAULT_AUTHORITY: SubagentAuthority = { mode: "propose_patch", require_base_hash: true, max_patch_bytes: MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes };

let agentIdCounter = 0;

const processExternalPiSlots = new Set<string>();
const MAX_EXTERNAL_PI_SUBAGENTS = MEKANN_SUBAGENT_DEFAULTS.externalPiSlots;

function nextAgentId(): string {
  return `sub_${++agentIdCounter}_${Date.now().toString(36)}`;
}

export type DisplayMode = "none" | "kitty-pi" | "kitty-split";

export interface AgentControlOptions {
  displayMode?: DisplayMode;
  logDir?: string;
  kitty?: KittyController;
  hubFactory?: (socketPath: string) => SubagentHub;
  piCommand?: string;
  extensionPath?: string;
  helloTimeoutMs?: number;
  allowUnsafeExternalPi?: boolean;
  maxQueuedSubagents?: number;
}

interface QueuedSpawn {
  params: SpawnParams;
  ctx: ExtensionContext;
  callerPath: string;
  canonicalPath: string;
  depth: number;
  agentId: string;
  queuedMessages: string[];
}

// ─── Agent control ───────────────────────────────────────────────

export class AgentControl {
  readonly registry: AgentRegistry;
  readonly mailbox: Mailbox;
  // Back-compat for existing tests/consumers that inspect childSessions/runtimes.
  private runtimes!: Map<string, AgentRuntime>;
  private childSessions!: Map<string, import("@earendil-works/pi-coding-agent").AgentSession>;
  private hubs!: Map<string, SubagentHub>;
  private pi: import("@earendil-works/pi-coding-agent").ExtensionAPI;
  private defaultWaitTimeout: number;
  private minWaitTimeout: number;
  private sessionControl!: AgentSessionControl;
  private displayMode: DisplayMode;
  private logDir: string;
  private kitty: KittyController;
  private hubFactory: (socketPath: string) => SubagentHub;
  private piCommand: string;
  private extensionPath?: string;
  private helloTimeoutMs: number;
  private allowUnsafeExternalPi: boolean;
  private maxQueuedSubagents: number;
  private spawnQueue: QueuedSpawn[] = [];
  private drainingSpawnQueue = false;
  readonly resultStore: SubagentResultStore;
  private readonly lifecycle: SubagentLifecycle;

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
      Math.min(maxAgents ?? DEFAULT_MAX_AGENTS, HARD_MAX_OPEN_AGENTS),
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
    this.extensionPath = options.extensionPath;
    this.helloTimeoutMs = options.helloTimeoutMs ?? 10_000;
    this.allowUnsafeExternalPi = options.allowUnsafeExternalPi ?? false;
    this.maxQueuedSubagents = options.maxQueuedSubagents ?? DEFAULT_MAX_QUEUED_SUBAGENTS;
    this.lifecycle = new SubagentLifecycle(this.registry, this.mailbox, process.cwd());
    this.runtimes = this.lifecycle.runtimes;
    this.childSessions = this.lifecycle.childSessions;
    this.hubs = this.lifecycle.hubs;
    this.resultStore = this.lifecycle.resultStore;
    this.sessionControl = new AgentSessionControl({
      registry: this.registry,
      mailbox: this.mailbox,
      resolveCallerPath: (ctx) => this.resolveCallerPath(ctx),
      resolveTarget: (target, callerPath) => this.resolveTarget(target, callerPath),
      getRuntime: (agentPath) => this.lifecycle.getRuntime(agentPath),
      getHub: (agentId) => this.lifecycle.getHub(agentId),
      displayResult: (display) => this.displayResult(display),
      logDisplay: (display, line) => this.logDisplay(display, line),
    });

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

  private resultStoreFor(cwd: string): SubagentResultStore {
    return this.lifecycle.resultStoreFor(path.resolve(cwd));
  }

  private applyQueueFor(cwd: string): ApplyQueue {
    return new ApplyQueue(this.resultStoreFor(cwd), cwd);
  }

  private parentAgentId(callerPath: string): string | undefined {
    return callerPath === ROOT_PATH ? undefined : callerPath;
  }

  // ─── Helper: resolve model / thinking from params ─────────────────

  private resolveThinkingLevel(reasoningEffort: string | undefined): ThinkingLevel | undefined {
    return (reasoningEffort ?? this.pi.getThinkingLevel?.()) as ThinkingLevel | undefined;
  }

  private async resolveModel(modelOverride: string | undefined, ctx: ExtensionContext) {
    let model = ctx.model;
    if (!modelOverride) return model;
    const slash = modelOverride.indexOf("/");
    if (slash > 0 && slash < modelOverride.length - 1) {
      const provider = modelOverride.slice(0, slash);
      const modelId = modelOverride.slice(slash + 1);
      const found = ctx.modelRegistry.find(provider, modelId);
      if (!found) throw new Error(`Model not found: ${modelOverride}. Use an exact provider/model_id reference.`);
      return found;
    }
    const all = await ctx.modelRegistry.getAvailable();
    const matches = all.filter((m) => m.id === modelOverride);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new Error(`Ambiguous model id: ${modelOverride}. Use exact provider/model_id. Matches: ${matches.map((m) => `${m.provider}/${m.id}`).join(", ")}`);
    }
    if (!matches.length) throw new Error(`Model not found: ${modelOverride}. Available: ${all.map((m) => m.provider ? `${m.provider}/${m.id}` : m.id).join(", ")}`);
  }

  // ─── Helper: finalize agent with error ─────────────────────────────

  private displayResult(display?: AgentDisplayRef): AgentDisplayResult | undefined {
    if (!display) return undefined;
    return { kind: display.kind, status: display.status, window_id: display.windowId, title: display.title, log_path: display.logPath, socket_path: display.socketPath, pid: display.pid, error: display.error };
  }

  private wantsExternalPiDisplay(): boolean {
    return this.displayMode === "kitty-pi" || this.displayMode === "kitty-split";
  }

  private logDisplay(display: AgentDisplayRef | undefined, line: string): void {
    if (!display || display.status === "closed") return;
    // Only append to log files for external Pi displays that have a logPath
    if (display.logPath) {
      void this.kitty.appendLog(display, line).catch(() => undefined);
    }
  }

  private normalizeAuthority(authority?: SubagentAuthority): SubagentAuthority {
    return { ...DEFAULT_AUTHORITY, ...(authority ?? {}) };
  }

  private authorityPreamble(authority: SubagentAuthority, resultContract?: ResultContract): string | undefined {
    if (authority.mode !== "propose_patch" && resultContract !== "subagent_result_v1") return undefined;
    const lines = [
      authority.mode === "propose_patch" ? "You are running in propose_patch mode." : `You are running in ${authority.mode} mode with structured result reporting.`,
      authority.mode === "edit" ? "You may edit only within granted authority." : "Do not modify files directly.",
      "Investigate the requested task. If no change is needed, return outcome=\"no_change\".",
      "Return exactly one JSON object conforming to subagent.result.v1. Output ONLY the raw JSON — no markdown fences, no explanation text.",
    ];
    if (authority.mode === "propose_patch") lines.push(
      "If a change is needed, create a patch proposal.",
      "Use patch.format=\"unified_diff\" and include patch.body. Do not include patch.ref; the parent stores the patch and assigns patch.ref.",
      "Include touched paths, file base hashes, semantic reads/writes, assumptions, effects, public surface delta, validation suggestions, and risk level.",
      "",
      "Minimal patch outcome example (fill in real values):",
      '{"schema":"subagent.result.v1","outcome":"patch","summary":"...","patch":{"format":"unified_diff","body":"--- a/path\\n+++ b/path\\n@@ ...\\n-old\\n+new\\n"},"base":{"files":[{"path":"path","hash":"sha256:..."}]},"scope":{"allowed_paths":["src/"],"touched_paths":["path"]},"semantic":{"reads":[],"writes":[{"kind":"file","name":"path"}],"assumptions":[],"effects":[],"public_surface_delta":[],"risk":{"level":"low"}},"validation":{"suggested":[]}}',
    );
    lines.push(`Granted write_scope: ${JSON.stringify(authority.write_scope ?? [])}`, `Granted semantic_scope: ${JSON.stringify(authority.semantic_scope ?? [])}`);
    return lines.join("\n");
  }

  private filterToolsByAuthority(tools: any[], authority: SubagentAuthority): any[] {
    if (authority.mode === "edit") return tools;
    const readOnlyAllow = new Set(["read", "grep", "glob", "ls", "list", "search", "rg", "find", "get_goal", "list_agents", "wait_agent"]);
    return tools.filter((t: any) => readOnlyAllow.has(t.name));
  }

  private handleFinalText(agentId: string, canonicalPath: string, callerPath: string, finalText: string | undefined, status: AgentStatus, cwd = process.cwd()): string {
    return this.lifecycle.handleFinalText({ agentId, agentPath: canonicalPath, callerPath, finalText, status, cwd });
  }

  private scheduleDrainSpawnQueue(): void {
    queueMicrotask(() => { void this.drainSpawnQueue(); });
  }

  private async drainSpawnQueue(): Promise<void> {
    if (this.drainingSpawnQueue) return;
    this.drainingSpawnQueue = true;
    try {
      while (this.spawnQueue.length > 0 && this.registry.hasExecutionCapacity()) {
        const item = this.spawnQueue.shift()!;
        this.refreshQueuePositions();
        const agent = this.registry.get(item.canonicalPath);
        if (!agent?.open || agent.status !== "queued") continue;
        try {
          await this.startSpawn(item.params, item.ctx, item.callerPath, item.canonicalPath, item.depth, item.agentId, item.queuedMessages);
        } catch (err) {
          this.registry.updateStatus(item.canonicalPath, "errored");
          this.registry.close(item.canonicalPath, "errored");
          this.mailbox.appendEvent({ type: "agent_spawn_end", ...this.evBase(item.agentId, item.canonicalPath), success: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
    } finally {
      this.drainingSpawnQueue = false;
    }
  }

  private refreshQueuePositions(): void {
    this.spawnQueue.forEach((item, index) => this.registry.updateAgent(item.canonicalPath, { queuePosition: index + 1, queuedAhead: index }));
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

    this.registry.assertPathAvailable(canonicalPath);
    const agentId = nextAgentId();

    if (!this.registry.hasExecutionCapacity()) {
      if (this.spawnQueue.length >= this.maxQueuedSubagents) {
        throw new Error(`Maximum queued subagents reached (${this.maxQueuedSubagents}). Wait for queued work to start or close queued agents before spawning more.`);
      }
      const now = Date.now();
      const item: QueuedSpawn = { params, ctx, callerPath, canonicalPath, depth, agentId, queuedMessages: [] };
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
        authority: this.normalizeAuthority(params.authority),
        authorityEnforced: true,
        workspaceCwd: ctx.cwd,
        resultContract: params.result_contract,
        queuePosition,
        queuedAhead: queuePosition - 1,
      };
      this.registry.registerQueuedAgent(metadata);
      return { agent_id: agentId, task_name: canonicalPath, status: "queued", queue_position: queuePosition, queued_ahead: queuePosition - 1 };
    }

    return this.startSpawn(params, ctx, callerPath, canonicalPath, depth, agentId, []);
  }

  private async startSpawn(
    params: SpawnParams,
    ctx: ExtensionContext,
    callerPath: string,
    canonicalPath: string,
    depth: number,
    agentId: string,
    queuedMessages: string[],
  ): Promise<SpawnResult> {
    const reservation = this.registry.reserveSpawnSlot(canonicalPath);

    this.mailbox.appendEvent({
      type: "agent_spawn_begin", ...this.evBase(agentId, canonicalPath),
      parentAgentId: callerPath === ROOT_PATH ? undefined : callerPath,
    });

    try {
      const authority = this.normalizeAuthority(params.authority);
      const resultContract = params.result_contract;

      if (this.wantsExternalPiDisplay() && this.allowUnsafeExternalPi) {
        return await this.spawnExternalPi(params, ctx, callerPath, canonicalPath, depth, reservation, agentId, queuedMessages);
      }

      const model = await this.resolveModel(params.model, ctx);
      if (!model) throw new Error("No parent model is selected. Specify spawn_agent.model as an exact provider/model_id to avoid falling back to a default model.");

      const forkTurns = params.fork_turns ?? 0;

      const thinkingLevel = this.resolveThinkingLevel(params.reasoning_effort);
      const systemPrompts = [
        buildContextPreamble({
          agentPath: canonicalPath,
          parentPath: callerPath,
          role: params.role,
          nickname: params.nickname,
        }),
      ];
      const authorityPrompt = this.authorityPreamble(authority, resultContract);
      if (authorityPrompt) systemPrompts.push(authorityPrompt);

      const { session } = await createAgentSession({
        cwd: ctx.cwd,
        model,
        ...(thinkingLevel ? { thinkingLevel } : {}),
        sessionManager: await import("@earendil-works/pi-coding-agent").then((m) =>
          m.SessionManager.inMemory(),
        ),
        appendSystemPrompt: systemPrompts,
      } as any);

      // Build fork context block for the child agent.
      // Instead of injecting raw messages into session.agent.state.messages (which
      // requires Usage stubs and risks SDK internal crashes during compaction checks),
      // prepend a text block to the initial user message.
      let forkContextBlock: string | undefined;
      if (forkTurns !== 0 && forkTurns !== "none") {
        const branch = ctx.sessionManager?.getBranch?.() ?? [];
        const messages = branch
          .filter((e: any) => e.type === "message")
          .map((e: any) => e.message as any);
        const forkCtx = extractForkContext(messages, forkTurns);
        if (forkCtx.length > 0) {
          const lines: string[] = [
            "--- Parent Agent Conversation Context (forked) ---",
          ];
          for (const msg of forkCtx) {
            const label = msg.role === "user" ? "User" : "Assistant";
            lines.push(`[${label}]: ${msg.text}`);
          }
          lines.push("--- End of Forked Context ---");
          forkContextBlock = lines.join("\n");
        }
      }

      // Inherit parent's tool restrictions, then apply authority restrictions.
      const parentActiveTools = this.pi.getActiveTools?.();
      if (parentActiveTools && parentActiveTools.length > 0) {
        const activeSet = new Set(parentActiveTools.map((t: any) => t.name));
        const allTools = session.agent.state.tools;
        session.agent.state.tools = allTools.filter((t: any) => activeSet.has(t.name));
      }
      if ((session as any).agent?.state?.tools) {
        session.agent.state.tools = this.filterToolsByAuthority(session.agent.state.tools, authority);
      }

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
        display: undefined,
        authority,
        authorityEnforced: true,
        workspaceCwd: ctx.cwd,
        resultContract,
      };

      this.registry.registerAgent(metadata, reservation);

      const baseInitialMessage = forkContextBlock
        ? `${forkContextBlock}\n\n${params.message}`
        : params.message;
      const queuedMessagesBlock = queuedMessages.length > 0
        ? `\n\n--- Queued parent messages ---\n${queuedMessages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n")}\n--- End queued parent messages ---`
        : "";
      const initialMessage = `${baseInitialMessage}${queuedMessagesBlock}`;
      this.lifecycle.registerInProcessRuntime({ agentId, agentPath: canonicalPath, callerPath, session, initialMessage, cwd: ctx.cwd, onSettled: () => this.scheduleDrainSpawnQueue() });

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

  private async spawnExternalPi(params: SpawnParams, ctx: ExtensionContext, callerPath: string, canonicalPath: string, depth: number, reservation: any, agentId: string, queuedMessages: string[] = []): Promise<SpawnResult> {
    if (!this.allowUnsafeExternalPi) {
      throw new Error(
        "External Pi subagents are disabled because authority cannot be enforced across an independent Pi process. Use subagent-display=none, or set subagent-allow-unsafe-external-pi=true only for fully trusted experiments.",
      );
    }

    const authority = this.normalizeAuthority(params.authority);
    if (processExternalPiSlots.size >= MAX_EXTERNAL_PI_SUBAGENTS) {
      throw new Error(`Maximum number of external Pi subagents reached (${MAX_EXTERNAL_PI_SUBAGENTS}). Close an existing agent before spawning another.`);
    }
    processExternalPiSlots.add(agentId);
    const now = Date.now();
    const socketPath = path.join(this.logDir, `${agentId}.sock`);
    const isSplit = this.displayMode === "kitty-split";
    const logPath = path.join(this.logDir, `${agentId}.kitty-pi.log`);
    const displayKind = isSplit ? "kitty-split" as const : "kitty-pi" as const;
    const display: AgentDisplayRef = { kind: displayKind, status: "opening", agentId, title: `pi subagent ${canonicalPath}`, cwd: ctx.cwd, socketPath, logPath };
    const metadata: AgentMetadata = {
      agentId, sessionId: `external:${agentId}`, parentAgentId: callerPath === ROOT_PATH ? "root" : undefined, parentSessionId: "root",
      agentPath: canonicalPath, nickname: params.nickname, role: params.role, status: "pending_init", lastTaskMessage: params.message,
      createdAt: now, updatedAt: now, depth, open: true, cancellationRequested: false, display, authority, authorityEnforced: false, workspaceCwd: ctx.cwd, resultContract: params.result_contract,
    };
    this.registry.registerAgent(metadata, reservation);
    try {
      const hub = this.hubFactory(socketPath);
      const resolvedOverride = params.model ? await this.resolveModel(params.model, ctx) : undefined;
      const modelId = resolvedOverride
        ? ((resolvedOverride as any).provider && (resolvedOverride as any).id ? `${(resolvedOverride as any).provider}/${(resolvedOverride as any).id}` : undefined)
        : (ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
      if (!modelId) throw new Error("External Pi subagents require an exact provider/model_id. Specify spawn_agent.model or use in-process subagents.");
      const thinkingLevel = this.resolveThinkingLevel(params.reasoning_effort);
      const preamble = this.authorityPreamble(authority, params.result_contract);
      const externalNotice = [
        "SECURITY NOTICE: this external Pi process is running with authorityEnforced=false.",
        "The parent process cannot remove write/edit/bash tools from this process.",
        `Requested authority mode: ${authority.mode}. Treat it as advisory unless the runtime itself removed tools.`,
      ].join("\n");

      const queuedMessagesBlock = queuedMessages.length > 0
        ? `--- Queued parent messages ---\n${queuedMessages.map((m, i) => `[${i + 1}] ${m}`).join("\n\n")}\n--- End queued parent messages ---`
        : undefined;
      const launchMessage = [externalNotice, preamble, params.message, queuedMessagesBlock]
        .filter(Boolean)
        .join("\n\n");

      const launchParams = { agentId, agentPath: canonicalPath, cwd: ctx.cwd, socketPath, initialMessage: launchMessage, logPath, title: display.title, piCommand: this.piCommand, extensionPath: this.extensionPath, modelId, thinkingLevel };
      await this.lifecycle.registerExternalPiRuntime({
        agentId,
        agentPath: canonicalPath,
        callerPath,
        socketPath,
        display,
        hub,
        kitty: this.kitty,
        launchParams,
        displayMode: displayKind,
        helloTimeoutMs: this.helloTimeoutMs,
        onClosed: (id) => { processExternalPiSlots.delete(id); this.scheduleDrainSpawnQueue(); },
      });
      return { agent_id: agentId, task_name: canonicalPath, status: this.registry.get(canonicalPath)?.status ?? "running", display: this.displayResult(this.registry.get(canonicalPath)?.display) };
    } catch (err) {
      processExternalPiSlots.delete(agentId);
      this.lifecycle.deleteRuntime(canonicalPath);
      this.registry.close(canonicalPath, "errored");
      throw err;
    }
  }

  private getRuntimeByAgentId(agentId: string): AgentRuntime | undefined {
    return this.lifecycle.getRuntimeByAgentId(agentId);
  }

  private enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.sessionControl.enqueueToMailbox(fromAgentId, fromPath, toPath, content, kind);
  }

  private getCallerAgentId(callerPath: string): string {
    return this.sessionControl.getCallerAgentId(callerPath);
  }

  /** Resolve target path + lookup agent. Throws if not found. */
  private resolveAgentOrFail(target: string, callerPath: string): { targetPath: string; agent: AgentMetadata } {
    return this.sessionControl.resolveAgentOrFail(target, callerPath);
  }

  /** Resolve target agent path + get child session. Shared by sendMessage/followupTask. */
  private resolveTargetSession(target: string, ctx: ExtensionContext): { callerPath: string; targetPath: string; agent: AgentMetadata; childSession: AgentSession | undefined } {
    return this.sessionControl.resolveTargetSession(target, ctx);
  }

  // ─── send_message ──────────────────────────────────────────────

  async sendMessage(
    params: SendMessageParams,
    ctx: ExtensionContext,
  ): Promise<{ delivered: boolean }> {
    return this.sessionControl.sendMessage(params, ctx, (targetPath, message) => {
      const queued = this.spawnQueue.find((item) => item.canonicalPath === targetPath);
      if (queued) queued.queuedMessages.push(message);
      return Boolean(queued);
    });
  }

  // ─── followup_task ─────────────────────────────────────────────

  async followupTask(
    params: FollowupTaskParams,
    ctx: ExtensionContext,
  ): Promise<{ queued: boolean; triggered: boolean }> {
    return this.sessionControl.followupTask(params, ctx);
  }

  // ─── wait_agent ────────────────────────────────────────────────

  async wait(
    params: WaitAgentParams,
    ctx: ExtensionContext,
  ): Promise<WaitResult> {
    return this.sessionControl.wait(params, ctx, this.defaultWaitTimeout, this.minWaitTimeout);
  }

  // ─── list_agents ───────────────────────────────────────────────

  /** List raw agents (for internal use by commands, avoids snake_case round-trip). */
  listAgents(pathPrefix?: string): AgentMetadata[] {
    return this.registry.list(pathPrefix);
  }

  list(params: ListAgentsParams, ctx?: ExtensionContext): ListResult {
    return this.sessionControl.list(params, ctx);
  }

  listAgentResults(params: any = {}, ctx?: ExtensionContext) { return { results: this.resultStoreFor(ctx?.cwd ?? process.cwd()).list(params) }; }
  showAgentResult(params: { result_id: string; include_patch?: boolean }, ctx?: ExtensionContext) { return this.applyQueueFor(ctx?.cwd ?? process.cwd()).showAgentResult(params.result_id, Boolean(params.include_patch)); }
  async applyAgentResults(params: any = {}, ctx?: ExtensionContext) { return this.applyQueueFor(ctx?.cwd ?? process.cwd()).applyAgentResults(params); }
  rejectAgentResult(params: { result_id: string; reason?: any }, ctx?: ExtensionContext) { return this.applyQueueFor(ctx?.cwd ?? process.cwd()).rejectAgentResult(params.result_id, params.reason ?? "manual_reject"); }
  async retryAgentResult(params: { result_id: string; reason?: string }, ctx: ExtensionContext) {
    const stored = this.resultStoreFor(ctx.cwd).load(params.result_id);
    const agent = this.registry.get(stored.agent_path);
    const outcomeHint = stored.result.outcome === "patch"
      ? "Regenerate a patch proposal against the current tree."
      : stored.result.outcome === "observation"
        ? "Regenerate your observation report with the requested additions."
        : "Regenerate your result.";
    const message = `Your previous result was rejected because ${params.reason ?? "its assumptions are stale"}.\nOriginal result_id: ${params.result_id}\n${outcomeHint} Do not modify files. Return subagent.result.v1 as raw JSON only (no markdown fences).`;
    if (agent && agent.open && !isTerminalStatus(agent.status)) {
      await this.followupTask({ target: stored.agent_path, message }, ctx);
      return { result_id: params.result_id, status: "retry_requested", mode: "followup" };
    }
    const retryParent = parentPath(stored.agent_path) ?? ROOT_PATH;
    const originalLeaf = stored.agent_path.split("/").pop() ?? "task";
    const retryName = `${retryParent}/retry_${originalLeaf}_${Date.now().toString(36)}`;

    const spawned = await this.spawn({ task_name: retryName, message, authority: stored.authority, result_contract: "subagent_result_v1" }, ctx);
    return { result_id: params.result_id, status: "retry_spawned", mode: "spawn", spawned };
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

    const agent = this.registry.get(targetPath);
    if (!agent?.open) return { closed: [] };

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
    const rt = this.lifecycle.getRuntime(agentPath);
    const session = rt?.mode === "in_process" ? rt.session : this.lifecycle.getChildSession(agentPath);
    if (!session) return;
    try { await session.abort(); } catch { /* best-effort */ }
    try { session.dispose(); } catch { /* best-effort */ }
    this.lifecycle.deleteRuntime(agentPath);
    this.lifecycle.deleteChildSession(agentPath);
  }

  private async closeSingle(agentPath: string): Promise<void> {
    const queuedIndex = this.spawnQueue.findIndex((item) => item.canonicalPath === agentPath);
    if (queuedIndex >= 0) {
      this.spawnQueue.splice(queuedIndex, 1);
      this.refreshQueuePositions();
    }
    const display = this.registry.get(agentPath)?.display;
    this.logDisplay(display, "[status] shutdown");
    const rt = this.lifecycle.getRuntime(agentPath);
    if (rt?.mode === "external_pi") {
      try { await this.lifecycle.getHub(rt.agentId)?.send(rt.agentId, { type: "shutdown", id: `shutdown_${Date.now()}` }); } catch { /* best-effort */ }
      try { await this.lifecycle.getHub(rt.agentId)?.stop(); } catch { /* best-effort */ }
      this.lifecycle.deleteHub(rt.agentId);
      processExternalPiSlots.delete(rt.agentId);
      this.lifecycle.deleteRuntime(agentPath);
    } else {
      await this.abortSession(agentPath);
    }
    if (display) {
      try { await this.kitty.close(display); } catch { /* best-effort */ }
      this.registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    this.registry.close(agentPath, "shutdown");
    this.mailbox.appendEvent({ type: "agent_close_end", ...this.evBase(this.registry.get(agentPath)?.agentId ?? "unknown", agentPath) });
    this.scheduleDrainSpawnQueue();
  }

  async focus(target: string, ctx: ExtensionContext): Promise<{ focused: boolean; warning?: string }> {
    const callerPath = this.resolveCallerPath(ctx);
    const { agent } = this.resolveAgentOrFail(target, callerPath);
    const display = agent.display;
    if (!display || (display.kind !== "kitty-pi" && display.kind !== "kitty-split") || display.status !== "open") {
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
    for (const path of [...new Set([...this.lifecycle.runtimePaths(), ...this.lifecycle.childSessionPaths()])]) await this.closeSingle(path).catch(() => undefined);
    this.registry.clear();
    this.mailbox.clear();
  }

  // ─── Accessors ─────────────────────────────────────────────────

  get openCount(): number {
    return this.registry.openCount;
  }
}

