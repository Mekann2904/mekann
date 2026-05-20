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
import { ROOT_PATH, resolveTaskPath, parentPath } from "./types.js";
import { AgentRegistry } from "./registry.js";
import { Mailbox } from "./mailbox.js";
import { extractForkContext, buildContextPreamble, extractTextFromContent, truncateText } from "./contextFork.js";
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
import type { AgentDisplayRef, AgentDisplayResult, AgentRuntime, ResultContract, SubagentAuthority } from "./types.js";
import { tryParseSubagentResult } from "./resultSchema.js";
import { resultSummary, SubagentResultStore } from "./resultStore.js";
import { ApplyQueue } from "./applyQueue.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";

// ─── Default config ──────────────────────────────────────────────

// Includes the root agent. Therefore 3 open agents = root + max 2 subagents.
const DEFAULT_MAX_AGENTS = MEKANN_SUBAGENT_DEFAULTS.maxOpenAgents;
const HARD_MAX_OPEN_AGENTS = MEKANN_SUBAGENT_DEFAULTS.maxOpenAgents;
const DEFAULT_MAX_DEPTH = MEKANN_SUBAGENT_DEFAULTS.maxDepth;
const DEFAULT_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.defaultWaitTimeoutMs;
const MAX_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.maxWaitTimeoutMs;
const MIN_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs;

export const DEFAULT_AUTHORITY: SubagentAuthority = { mode: "propose_patch", require_base_hash: true, max_patch_bytes: MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes };

let agentIdCounter = 0;

const processExternalPiSlots = new Set<string>();
const MAX_EXTERNAL_PI_SUBAGENTS = MEKANN_SUBAGENT_DEFAULTS.externalPiSlots;
const MAILBOX_CONTENT_MAX_CHARS = 2_000;
const MESSAGE_INJECTION_MAX_CHARS = 4_000;

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
  private extensionPath?: string;
  private helloTimeoutMs: number;
  private allowUnsafeExternalPi: boolean;
  readonly resultStore: SubagentResultStore;
  private storesByCwd = new Map<string, SubagentResultStore>();

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
    this.resultStore = this.resultStoreFor(process.cwd());

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
    const key = path.resolve(cwd);
    let store = this.storesByCwd.get(key);
    if (!store) { store = new SubagentResultStore(key); this.storesByCwd.set(key, store); }
    return store;
  }

  private applyQueueFor(cwd: string): ApplyQueue {
    return new ApplyQueue(this.resultStoreFor(cwd), cwd);
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
    const text = finalText ?? "(agent completed)";
    const parsed = tryParseSubagentResult(text);
    let message = truncateText(text, MAILBOX_CONTENT_MAX_CHARS);
    const agent = this.registry.get(canonicalPath);
    if (parsed.ok && agent) {
      const stored = this.resultStoreFor(cwd).save(agent, parsed.result);
      message = resultSummary(stored);
    }
    this.registry.updateStatus(canonicalPath, status, { lastTaskMessage: message });
    this.enqueueToMailbox(agentId, canonicalPath, callerPath, message, "final_result");
    this.mailbox.appendEvent({
      type: "agent_final_message", ...this.evBase(agentId, canonicalPath),
      parentAgentId: callerPath === ROOT_PATH ? undefined : "root",
      message,
      status,
    });
    return message;
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
      const authority = this.normalizeAuthority(params.authority);
      const resultContract = params.result_contract;

      if (this.wantsExternalPiDisplay() && this.allowUnsafeExternalPi) {
        return await this.spawnExternalPi(params, ctx, callerPath, canonicalPath, depth, reservation, agentId);
      }

      const model = await this.resolveModel(params.model, ctx);

      const forkTurns = params.fork_turns ?? 0;

      const thinkingLevel = params.reasoning_effort as ThinkingLevel | undefined;
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

          this.handleFinalText(agentId, canonicalPath, callerPath, finalText, "completed", ctx.cwd);

          this.runtimes.delete(canonicalPath);
          this.childSessions.delete(canonicalPath);
          this.registry.close(canonicalPath, "completed");
          unsubscribe();
        }
      });

      // Store session reference
      this.runtimes.set(canonicalPath, { mode: "in_process", agentId, agentPath: canonicalPath, session });
      this.childSessions.set(canonicalPath, session);

      // Send initial message in background
      const initialMessage = forkContextBlock
        ? `${forkContextBlock}\n\n${params.message}`
        : params.message;
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
    const hub = this.hubFactory(socketPath);
    this.hubs.set(agentId, hub);
    hub.onMessage((m) => this.handleChildMessage(callerPath, canonicalPath, m));
    await hub.start();
    this.runtimes.set(canonicalPath, { mode: "external_pi", agentId, agentPath: canonicalPath, socketPath, display, connected: false });
    try {
      const resolvedOverride = params.model ? await this.resolveModel(params.model, ctx) : undefined;
      const modelId = resolvedOverride
        ? `${(resolvedOverride as any).provider ?? ''}/${(resolvedOverride as any).id ?? ''}`
        : (ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}/${ctx.model.id}` : undefined);
      const preamble = this.authorityPreamble(authority, params.result_contract);
      const externalNotice = [
        "SECURITY NOTICE: this external Pi process is running with authorityEnforced=false.",
        "The parent process cannot remove write/edit/bash tools from this process.",
        `Requested authority mode: ${authority.mode}. Treat it as advisory unless the runtime itself removed tools.`,
      ].join("\n");

      const launchMessage = [externalNotice, preamble, params.message]
        .filter(Boolean)
        .join("\n\n");

      const launchParams = { agentId, agentPath: canonicalPath, cwd: ctx.cwd, socketPath, initialMessage: launchMessage, logPath, title: display.title, piCommand: this.piCommand, extensionPath: this.extensionPath, modelId };
      const opened = isSplit
        ? await this.kitty.launchPiSplit(launchParams)
        : await this.kitty.launchPiWindow(launchParams);
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
      this.registry.close(canonicalPath, "errored");
      try { await this.kitty.close(failed); } catch {}
      try { await hub.stop(); } catch {}
      this.hubs.delete(agentId);
      this.runtimes.delete(canonicalPath);
      processExternalPiSlots.delete(agentId);
      throw err;
    }
    return { agent_id: agentId, task_name: canonicalPath, status: this.registry.get(canonicalPath)?.status ?? "running", display: this.displayResult(this.registry.get(canonicalPath)?.display) };
  }

  private handleChildMessage(callerPath: string, agentPath: string, msg: ChildToParent): void {
    const agent = this.registry.get(agentPath); if (!agent) return;
    if (msg.type === "status") {
      this.registry.updateStatus(agentPath, msg.status);
    } else if (msg.type === "final") {
      this.handleFinalText(msg.agentId, agentPath, callerPath, msg.message, msg.status, agent.workspaceCwd ?? process.cwd());
      void this.autoCloseExternal(agentPath);
    } else if (msg.type === "error") {
      this.registry.updateStatus(agentPath, "errored");
      this.enqueueToMailbox(msg.agentId ?? agent.agentId, agentPath, callerPath, `Agent error: ${msg.message}`, "final_result");
      void this.autoCloseExternal(agentPath);
    } else if (msg.type === "log") {
      this.logDisplay(agent.display, msg.line);
    }
  }

  private async autoCloseExternal(agentPath: string): Promise<void> {
    const rt = this.runtimes.get(agentPath);
    if (rt?.mode !== "external_pi") return;
    const agent = this.registry.get(agentPath);
    const display = agent?.display;
    // Close kitty window
    if (display) {
      try { await this.kitty.close(display); } catch { /* best-effort */ }
      this.registry.updateAgent(agentPath, { display: { ...display, status: "closed" } });
    }
    // Stop IPC hub
    try { await this.hubs.get(rt.agentId)?.stop(); } catch { /* best-effort */ }
    this.hubs.delete(rt.agentId);
    processExternalPiSlots.delete(rt.agentId);
    this.runtimes.delete(agentPath);
    this.registry.close(agentPath, agent?.status === "errored" ? "errored" : "completed");
    this.mailbox.appendEvent({ type: "agent_close_end", ...this.evBase(rt.agentId, agentPath) });
  }

  private getRuntimeByAgentId(agentId: string): AgentRuntime | undefined {
    for (const rt of this.runtimes.values()) if (rt.agentId === agentId) return rt;
  }

  private enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.mailbox.enqueue({ fromAgentId, fromAgentPath: fromPath, toAgentPath: toPath, content: truncateText(content, MAILBOX_CONTENT_MAX_CHARS), timestamp: Date.now(), kind });
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
    const message = truncateText(params.message, MESSAGE_INJECTION_MAX_CHARS);
    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, message, "message");
    this.logDisplay(agent.display, `[message from ${callerPath}] ${message}`);

    const rt = this.runtimes.get(targetPath);
    if (rt?.mode === "external_pi") {
      if (!rt.capabilities?.includes("message")) throw new Error(`External Pi subagent ${targetPath} does not support message injection.`);
      await this.hubs.get(rt.agentId)?.send(rt.agentId, { type: "message", id: `msg_${Date.now()}`, fromAgentPath: callerPath, message });
    } else if (childSession) {
      await childSession.sendCustomMessage({ customType: "subagent_message", content: `[Message from ${callerPath}]: ${message}`, display: true }, { triggerTurn: false, deliverAs: "nextTurn" });
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

    const message = truncateText(params.message, MESSAGE_INJECTION_MAX_CHARS);
    this.enqueueToMailbox(this.getCallerAgentId(callerPath), callerPath, targetPath, message, "followup");
    this.logDisplay(agent.display, `[followup from ${callerPath}] ${message}`);

    // Update last task message
    this.registry.updateStatus(targetPath, agent.status, {
      lastTaskMessage: message,
    });

    // Deliver to child session or external Pi over IPC. Never use kitty send-text here.
    const rt = this.runtimes.get(targetPath);
    if (rt?.mode === "external_pi") {
      if (!rt.capabilities?.includes("followup")) throw new Error(`External Pi subagent ${targetPath} does not support followup injection.`);
      await this.hubs.get(rt.agentId)?.send(rt.agentId, { type: "followup", id: `fu_${Date.now()}`, message });
      return { queued: true, triggered: true };
    } else if (childSession) {
      const triggered = !childSession.isStreaming;
      await childSession.sendUserMessage(
        `[Follow-up from ${callerPath}]: ${message}`,
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
        authority: a.authority,
        authority_enforced: a.authorityEnforced,
        result_contract: a.resultContract,
      })),
    };
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
      processExternalPiSlots.delete(rt.agentId);
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

