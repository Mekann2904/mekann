/**
 * Subagent Extension — Agent control plane.
 *
 * Implements spawn_agent, message_agent, wait_agent,
 * list_agents, close_agent. Uses AgentRegistry, Mailbox, and
 * createAgentSession from the pi SDK.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT_PATH, resolveTaskPath, parentPath } from "./types.js";
import { AgentSessionControl } from "./agentSession.js";
import { AgentRegistry } from "./registry.js";
import { Mailbox } from "./mailbox.js";

import type {
  AgentMetadata,
  AgentStatus,
  CloseAgentParams,
  DelegateAgentParams,
  DelegateAgentResult,
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
import type { AgentDisplayRef, AgentDisplayResult, ResultContract, SubagentAuthority } from "./types.js";
import type { SubagentResultStore } from "./resultStore.js";
import { ApplyQueue } from "./applyQueue.js";

/** Structural sink for a pi runtime logger (not exposed on ExtensionAPI). */
interface LoggerSink {
  warn?(message: string): void;
  error?(message: string): void;
}
import { SubagentLifecycle } from "./subagentLifecycle.js";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";
import { featureRawConfig } from "../../settings/enabled.js";
import { evaluateSpawnCost } from "./subagentCostPolicy.js";
import { bestEffortAsync } from "../../utils/best-effort.js";

// ─── Default config ──────────────────────────────────────────────

// Subagent-spawning tools that must be hidden from children when nesting is
// disabled, to prevent recursive child creation (spawn_agent) or redundant
// re-review (review_fixer). See issue #62.
const NESTING_TOOL_NAMES = new Set(["spawn_agent", "review_fixer"]);

// Includes the root agent. Therefore 3 open agents = root + max 2 subagents.
const DEFAULT_MAX_AGENTS = MEKANN_SUBAGENT_DEFAULTS.maxOpenAgents;
const HARD_MAX_OPEN_AGENTS = 8;
const DEFAULT_MAX_DEPTH = MEKANN_SUBAGENT_DEFAULTS.maxDepth;
const DEFAULT_MAX_QUEUED_SUBAGENTS = MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents;
const DEFAULT_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.defaultWaitTimeoutMs;
const MIN_WAIT_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs;
const DEFAULT_HELLO_TIMEOUT_MS = MEKANN_SUBAGENT_DEFAULTS.helloTimeoutMs;
const DEFAULT_MAX_RESULT_RETRIES = MEKANN_SUBAGENT_DEFAULTS.maxResultRetries;

export const DEFAULT_AUTHORITY: SubagentAuthority = { mode: "propose_patch", require_base_hash: true, max_patch_bytes: MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes };

let agentIdCounter = 0;

const processExternalPiSlots = new Set<string>();

/**
 * Generate a subagent id. The previous `sub_<counter>_<time>` form collided
 * across parallel pi processes (both emit `sub_1_<same-ms>`) which in turn
 * collided the IPC socket filename and registry id. Mix in crypto randomness
 * so ids are unique across processes (issue #152 / IC, same root as #144).
 * The per-process counter is retained only for readable ordering within a
 * single session.
 */
function nextAgentId(): string {
  return `sub_${++agentIdCounter}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

export type DisplayMode = "none" | "kitty-pi" | "kitty-split";

function getEffectiveMaxPatchBytes(): number {
  const configured = Number(featureRawConfig("subagent").maxPatchBytes);
  return Number.isFinite(configured) && configured > 0 ? configured : MEKANN_SUBAGENT_DEFAULTS.maxPatchBytes;
}

export interface AgentControlOptions {
  displayMode?: DisplayMode;
  logDir?: string;
  kitty?: KittyController;
  hubFactory?: (socketPath: string, expectedAgentId?: string, expectedNonce?: string) => SubagentHub;
  piCommand?: string;
  extensionPath?: string;
  helloTimeoutMs?: number;
  allowUnsafeExternalPi?: boolean;
  maxQueuedSubagents?: number;
  externalPiSlots?: number;
  allowNestedSubagents?: boolean;
  defaultReasoningEffort?: string;
  /** Max re-runs per result via `agent_results action=retry` (issue #83 / C-014). */
  maxResultRetries?: number;
  /** Max mailbox items/events retained before eviction (issue #152). */
  mailboxRetention?: number;
}

// ─── Agent control ───────────────────────────────────────────────

export class AgentControl {
  readonly registry: AgentRegistry;
  readonly mailbox: Mailbox;
  private pi: import("@earendil-works/pi-coding-agent").ExtensionAPI;
  private defaultWaitTimeout: number;
  private minWaitTimeout: number;
  private sessionControl!: AgentSessionControl;
  private displayMode: DisplayMode;
  private logDir: string;
  private kitty: KittyController;
  private hubFactory: (socketPath: string, expectedAgentId?: string, expectedNonce?: string) => SubagentHub;
  private piCommand: string;
  private extensionPath?: string;
  private helloTimeoutMs: number;
  private allowUnsafeExternalPi: boolean;
  private maxQueuedSubagents: number;
  private maxExternalPiSubagents: number;
  private allowNestedSubagents: boolean;
  private defaultReasoningEffort: string;
  private maxResultRetries: number;
  private readonly mailboxRetention: number;
  private sessionSpawnCount = 0;
  readonly resultStore: SubagentResultStore;
  readonly lifecycle: SubagentLifecycle;
  private drainQueueOnClose = true;

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
    this.mailboxRetention = options.mailboxRetention ?? MEKANN_SUBAGENT_DEFAULTS.mailboxRetention;
    this.mailbox = new Mailbox({ maxRetainedRecords: this.mailboxRetention });
    this.defaultWaitTimeout = defaultWaitTimeout ?? DEFAULT_WAIT_TIMEOUT_MS;
    this.minWaitTimeout = minWaitTimeout ?? MIN_WAIT_TIMEOUT_MS;
    this.displayMode = options.displayMode ?? "none";
    this.logDir = options.logDir ?? path.join(os.tmpdir(), "pi-subagents");
    this.kitty = options.kitty ?? new KittyController();
    this.hubFactory = options.hubFactory ?? ((socketPath, expectedAgentId, expectedNonce) => new SubagentHub(socketPath, expectedAgentId, expectedNonce));
    this.piCommand = options.piCommand ?? "pi";
    this.extensionPath = options.extensionPath;
    this.helloTimeoutMs = options.helloTimeoutMs ?? DEFAULT_HELLO_TIMEOUT_MS;
    this.allowUnsafeExternalPi = options.allowUnsafeExternalPi ?? false;
    this.maxQueuedSubagents = options.maxQueuedSubagents ?? DEFAULT_MAX_QUEUED_SUBAGENTS;
    this.maxExternalPiSubagents = options.externalPiSlots ?? (this.allowUnsafeExternalPi && this.displayMode !== "none" ? 1 : MEKANN_SUBAGENT_DEFAULTS.externalPiSlots);
    this.allowNestedSubagents = options.allowNestedSubagents ?? MEKANN_SUBAGENT_DEFAULTS.allowNestedSubagents;
    this.defaultReasoningEffort = options.defaultReasoningEffort ?? MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort;
    this.maxResultRetries = options.maxResultRetries ?? DEFAULT_MAX_RESULT_RETRIES;
    this.lifecycle = new SubagentLifecycle(this.registry, this.mailbox, process.cwd());
    this.resultStore = this.lifecycle.resultStore;
    this.sessionControl = new AgentSessionControl({
      registry: this.registry,
      mailbox: this.mailbox,
      resolveCallerPath: (ctx) => this.resolveCallerPath(ctx),
      resolveTarget: (target, callerPath) => this.resolveTarget(target, callerPath),
      getRuntime: (agentPath) => this.lifecycle.runtimeForSession(agentPath),
      getHub: (agentId) => this.lifecycle.hubForSession(agentId),
      displayResult: (display) => this.displayResult(display),
      logDisplay: (display, line) => this.logDisplay(display, line),
    });

    // Forward registry events to mailbox
    this.registry.subscribe((event) => {
      this.mailbox.appendEvent(event);
    });

    // Wire spawner with resolved adapters (one-time, idempotent)
    this.lifecycle.initAdapters(this.lifecycleAdapters());
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

  private resultStoreFor(cwd: string): SubagentResultStore {
    return this.lifecycle.resultStoreFor(path.resolve(cwd));
  }

  private applyQueueFor(cwd: string): ApplyQueue {
    return new ApplyQueue(this.resultStoreFor(cwd), cwd);
  }

  // ─── Helper: resolve model / thinking from params ─────────────────

  private resolveThinkingLevel(reasoningEffort: string | undefined): ThinkingLevel | undefined {
    return (reasoningEffort ?? this.defaultReasoningEffort) as ThinkingLevel | undefined;
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

  private logDisplay(display: AgentDisplayRef | undefined, line: string): void {
    if (!display || display.status === "closed") return;
    // Only append to log files for external Pi displays that have a logPath
    if (display.logPath) {
      // Swallowing log-append errors is fine, but they must be observable so a
      // broken display log path does not silently eat all result logging
      // (issue #146).
      void bestEffortAsync("subagent-display-log", () => this.kitty.appendLog(display, line));
    }
  }

  private normalizeAuthority(authority?: SubagentAuthority): SubagentAuthority {
    return { ...DEFAULT_AUTHORITY, max_patch_bytes: getEffectiveMaxPatchBytes(), ...(authority ?? {}) };
  }

  private authorityPreamble(authority: SubagentAuthority, resultContract?: ResultContract): string | undefined {
    if (authority.mode !== "propose_patch" && resultContract !== "subagent_result_v1") return undefined;
    const lines = [
      authority.mode === "propose_patch" ? "You are running in propose_patch mode." : `You are running in ${authority.mode} mode with structured result reporting.`,
      authority.mode === "edit" ? "You may edit only within granted authority." : "Do not modify files directly.",
      "Return exactly one JSON object conforming to subagent.result.v1. Output ONLY the raw JSON — no markdown fences, no explanation text.",
      "Outcome selection: use outcome=\"observation\" for research/review findings without a patch; outcome=\"no_change\" only when you verified no action is needed; outcome=\"patch\" only for a concrete patch proposal; outcome=\"blocked\" when authority/environment prevents completion; outcome=\"needs_decision\" only when a parent decision is explicitly required.",
      "If the parent asks for bullets, sections, or a specific language, put that content inside JSON fields such as summary, evidence, assumptions, or validation.suggested while keeping the outer response raw JSON.",
      "Minimal observation example: {\"schema\":\"subagent.result.v1\",\"outcome\":\"observation\",\"summary\":\"one-sentence result...\",\"findings\":[{\"path\":\"path:line\",\"message\":\"verification pointer or decision-relevant finding\"}]}",
      "Minimal blocked example: {\"schema\":\"subagent.result.v1\",\"outcome\":\"blocked\",\"summary\":\"blocked reason...\",\"evidence\":[]}",
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
    // Subagent-spawning tools must be hidden when nesting is disabled to
    // prevent recursive child creation or redundant review-fixer delegation.
    const authorityScopedTools = this.allowNestedSubagents
      ? tools
      : tools.filter((t: any) => !NESTING_TOOL_NAMES.has(t.name ?? ""));
    if (authority.mode === "edit") return authorityScopedTools;
    // For read_only and propose_patch, only allow non-destructive tools.
    const readOnlyPatterns = [
      /^read$/, /^grep$/, /^glob$/, /^ls$/, /^list$/, /^search$/, /^rg$/, /^find$/,
      /^get_goal$/, /^list_agents$/, /^wait_agent$/,
      /^codex_web_search$/, /^search_tool_outputs$/, /^search_context_events$/,
      /^summarize_session_context$/, /^request_elevation$/,
    ];
    return authorityScopedTools.filter((t: any) => {
      const name: string = t.name ?? "";
      return readOnlyPatterns.some((pat) => pat.test(name));
    });
  }

  private handleFinalText(agentId: string, canonicalPath: string, callerPath: string, finalText: string | undefined, status: AgentStatus, cwd = process.cwd()): string {
    return this.lifecycle.handleFinalText({ agentId, agentPath: canonicalPath, callerPath, finalText, status, cwd });
  }

  // ─── spawn_agent ───────────────────────────────────────────────

  private lifecycleAdapters() {
    return {
      pi: this.pi,
      displayMode: this.displayMode,
      logDir: this.logDir,
      kitty: this.kitty,
      hubFactory: this.hubFactory,
      piCommand: this.piCommand,
      extensionPath: this.extensionPath,
      helloTimeoutMs: this.helloTimeoutMs,
      allowUnsafeExternalPi: this.allowUnsafeExternalPi,
      maxQueuedSubagents: this.maxQueuedSubagents,
      maxExternalPiSubagents: this.maxExternalPiSubagents,
      externalPiSlots: processExternalPiSlots,
      normalizeAuthority: (authority: SubagentAuthority | undefined) => this.normalizeAuthority(authority),
      authorityPreamble: (authority: SubagentAuthority, resultContract?: ResultContract) => this.authorityPreamble(authority, resultContract),
      filterToolsByAuthority: (tools: any[], authority: SubagentAuthority) => this.filterToolsByAuthority(tools, authority),
      resolveModel: (modelOverride: string | undefined, spawnCtx: ExtensionContext) => this.resolveModel(modelOverride, spawnCtx),
      resolveThinkingLevel: (reasoningEffort: string | undefined) => this.resolveThinkingLevel(reasoningEffort),
      displayResult: (display?: AgentDisplayRef) => this.displayResult(display),
    };
  }

  private applySubagentTypeDefaults(params: SpawnParams): SpawnParams {
    if (!params.type || params.role === "review-fixer") return params;
    const effectiveType = params.type === "explore" ? "scout" : params.type === "patch" ? "implement" : params.type;
    const mode = effectiveType === "implement" ? "edit" : "read_only";
    const typeInstruction: Record<string, string> = {
      scout: [
        "Subagent type: scout. You are a low-cost scout, not the final decision maker.",
        "Goal: reduce the parent agent's search space without polluting parent context.",
        "Do not ask the parent to trust your conclusion. Return the smallest verification pointer set the parent should inspect.",
        "Output as subagent.result.v1 observation JSON. Put a one-sentence hypothesis in summary. In findings, include only decision-relevant verification pointers: path/ref, what the parent should check, why it matters, and what to do if rejected. No exploration logs.",
      ].join("\n"),
      verify: [
        "Subagent type: verify. Narrow check only; do not expand scope.",
        "Return subagent.result.v1 observation JSON with verdict VERIFIED / NOT_VERIFIED / INCONCLUSIVE in summary and minimal evidence/verification pointers in findings.",
      ].join("\n"),
      review: [
        "Subagent type: review. Fresh read-only review; look for concrete risks, missed cases, or evidence gaps. Do not make changes.",
        "Return subagent.result.v1 observation JSON with only decision-relevant findings and parent verification pointers.",
      ].join("\n"),
      implement: [
        "Subagent type: implement. You are a bounded implementer, not the final decision maker.",
        "The parent owns requirements, tests, scope, and final verification. Prefer making the parent-provided failing test pass with the smallest diff.",
        "Respect granted write_scope/allowed_paths strictly. Do not edit tests unless explicitly allowed. Avoid unrelated refactors and public-surface changes.",
        "Run only requested/allowed validation commands when practical. Return subagent.result.v1 observation JSON with: changed_files, scope_compliance, tests run/results, risks, and exact root_should_verify steps. Do not include large diffs or exploration logs.",
      ].join("\n"),
    };
    return {
      ...params,
      authority: params.authority ?? { mode },
      result_contract: params.result_contract ?? "subagent_result_v1",
      message: `${typeInstruction[effectiveType]}\n\n${params.message}`,
    };
  }

  async spawn(
    params: SpawnParams,
    ctx: ExtensionContext,
  ): Promise<SpawnResult> {
    const effectiveParams = this.applySubagentTypeDefaults(params);
    const advice = evaluateSpawnCost({
      params: effectiveParams,
      sessionSpawnCount: this.sessionSpawnCount,
      openSubagents: Math.max(0, this.registry.list().filter((a) => a.open).length - 1),
      queuedSubagents: this.registry.list().filter((a) => a.status === "queued").length,
    });
    const result = await this.lifecycle.spawnDelegation({
      params: effectiveParams,
      ctx,
      callerPath: this.resolveCallerPath(ctx),
      agentId: nextAgentId(),
      adapters: this.lifecycleAdapters(),
    });
    this.sessionSpawnCount++;
    if (advice.level !== "none" && advice.message) {
      result.cost_advice = { level: advice.level, message: advice.message, reasons: advice.reasons };
    }
    return result;
  }

  async delegate(params: DelegateAgentParams, ctx: ExtensionContext): Promise<DelegateAgentResult> {
    const spawn = await this.spawn(params, ctx);
    const events: DelegateAgentResult["events"] = [];
    const mailbox: DelegateAgentResult["mailbox"] = [];

    for (;;) {
      const update = await this.sessionControl.waitIndefinitely(ctx);
      events.push(...update.events);
      mailbox.push(...update.mailbox);
      const finalItem = update.mailbox.find((m) => m.kind === "final_result" && m.fromAgentPath === spawn.task_name);
      if (finalItem) {
        const agent = this.registry.get(spawn.task_name);
        return { agent_id: spawn.agent_id, task_name: spawn.task_name, status: agent?.status ?? "completed", final_result: finalItem.content, events, mailbox, spawn };
      }
      const finalEvent = update.events.find((e: any) => e.type === "agent_final_message" && e.agentPath === spawn.task_name) as any;
      if (finalEvent) {
        const agent = this.registry.get(spawn.task_name);
        return { agent_id: spawn.agent_id, task_name: spawn.task_name, status: agent?.status ?? finalEvent.status ?? "completed", final_result: finalEvent.message, events, mailbox, spawn };
      }
      const agent = this.registry.get(spawn.task_name);
      if (agent && isTerminalStatus(agent.status)) {
        return { agent_id: spawn.agent_id, task_name: spawn.task_name, status: agent.status, events, mailbox, spawn };
      }
    }
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

  // ─── message_agent(mode=note) ─────────────────────────────────

  async sendMessage(
    params: SendMessageParams,
    ctx: ExtensionContext,
  ): Promise<{ delivered: boolean }> {
    return this.sessionControl.sendMessage(params, ctx, (targetPath, message) => this.lifecycle.queueMessageToQueued(targetPath, message));
  }

  // ─── message_agent(mode=task) ─────────────────────────────────

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

  async listAgentResults(params: any = {}, ctx?: ExtensionContext) { return { results: await this.resultStoreFor(ctx?.cwd ?? process.cwd()).list(params) }; }
  showAgentResult(params: { result_id: string; include_patch?: boolean }, ctx?: ExtensionContext) { return this.applyQueueFor(ctx?.cwd ?? process.cwd()).showAgentResult(params.result_id, Boolean(params.include_patch)); }
  async applyAgentResults(params: any = {}, ctx?: ExtensionContext) { return this.applyQueueFor(ctx?.cwd ?? process.cwd()).applyAgentResults(params); }
  rejectAgentResult(params: { result_id: string; reason?: any }, ctx?: ExtensionContext) { return this.applyQueueFor(ctx?.cwd ?? process.cwd()).rejectAgentResult(params.result_id, params.reason ?? "manual_reject"); }
  async retryAgentResult(params: { result_id: string; reason?: string }, ctx: ExtensionContext) {
    const store = this.resultStoreFor(ctx.cwd);
    const stored = store.load(params.result_id);

    // Enforce configured retry budget (subagent.maxResultRetries, default 3,
    // hard-clamped to 1–10 in controlFactory). Issue #83 / C-014.
    const currentRetries = store.getRetryCount(params.result_id);
    if (currentRetries >= this.maxResultRetries) {
      return { result_id: params.result_id, status: "retry_limit_reached", retries: currentRetries };
    }

    const agent = this.registry.get(stored.agent_path);
    const outcomeHint = stored.result.outcome === "patch"
      ? "Regenerate a patch proposal against the current tree."
      : stored.result.outcome === "observation"
        ? "Regenerate your observation report with the requested additions."
        : "Regenerate your result.";
    const message = `Your previous result was rejected because ${params.reason ?? "its assumptions are stale"}.\nOriginal result_id: ${params.result_id}\n${outcomeHint} Do not modify files. Return subagent.result.v1 as raw JSON only (no markdown fences).`;

    // If agent is alive and not terminal, send followup
    if (agent && agent.open && !isTerminalStatus(agent.status)) {
      await this.followupTask({ target: stored.agent_path, message }, ctx);
      return { result_id: params.result_id, status: "retry_requested", mode: "followup", retries: currentRetries };
    }

    // Otherwise re-spawn
    const retryParent = parentPath(stored.agent_path) ?? ROOT_PATH;
    const originalLeaf = stored.agent_path.split("/").pop() ?? "task";
    const retryName = `${retryParent}/retry_${originalLeaf}_${Date.now().toString(36)}`;

    const spawned = await this.spawn({ task_name: retryName, message, authority: stored.authority, result_contract: "subagent_result_v1" }, ctx);
    // Register retry chain link
    const retryPath = spawned.task_name;
    this.lifecycle.registerRetryLink(retryPath, params.result_id);
    return { result_id: params.result_id, status: "retry_spawned", mode: "spawn", spawned, retries: currentRetries };
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

  private async closeSingle(agentPath: string): Promise<void> {
    const adapters = this.lifecycleAdapters();
    await this.lifecycle.closeRuntime(agentPath, {
      kitty: this.kitty,
      externalPiSlots: processExternalPiSlots,
      ...(this.drainQueueOnClose ? { drainAdapters: adapters } : {}),
    });
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
    // Aggregate per-agent failures instead of swallowing them silently so a
    // zombie worker or stuck kitty window does not vanish from the operator's
    // view (issue #152 / IC-041). Shutdown still resolves (best-effort), but
    // any collected errors are surfaced via the extension logger / stderr.
    const failures: Array<{ agentPath: string; error: string }> = [];
    for (const agent of this.registry.list()) {
      if (agent.display && agent.display.status === "open") {
        // Best-effort like the closeSingle loop below: one failing kitty close
        // must not abort the rest of shutdown, but a display that refuses to
        // close should be observable, not silently swallowed (issue #146).
        await bestEffortAsync("subagent-shutdown-kitty-close", () => this.kitty.close(agent.display!));
      }
    }
    this.drainQueueOnClose = false;
    try {
      // Closing each path is best-effort (one failing close must not abort the
      // rest of shutdown), but a zombie worker that refuses to close should be
      // visible in the structured log rather than silently swallowed
      // (issue #146).
      for (const path of [...new Set([...this.lifecycle.runtimePaths(), ...this.lifecycle.childSessionPaths()])]) await bestEffortAsync("subagent-shutdown-close", () => this.closeSingle(path));
    } finally {
      this.drainQueueOnClose = true;
    }
    this.registry.clear();
    this.mailbox.clear();
    if (failures.length > 0) this.reportShutdownFailures(failures);
  }

  private reportShutdownFailures(failures: Array<{ agentPath: string; error: string }>): void {
    const summary = failures.map((f) => `${f.agentPath}: ${f.error}`).join("; ");
    // ExtensionAPI exposes no logger surface, but pi attaches one at runtime.
    const piLogger = this.pi as unknown as { log?: LoggerSink; logger?: LoggerSink };
    const logger = piLogger?.log ?? piLogger?.logger;
    const message = `[subagent] shutdown encountered ${failures.length} failure(s): ${summary}`;
    if (typeof logger?.warn === "function") logger.warn(message);
    else if (typeof logger?.error === "function") logger.error(message);
    else console.warn(message);
  }

  // ─── Accessors ─────────────────────────────────────────────────

  get openCount(): number {
    return this.registry.openCount;
  }
}

