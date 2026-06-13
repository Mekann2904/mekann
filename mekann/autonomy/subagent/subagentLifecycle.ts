/**
 * SubagentLifecycle — facade over SpawnQueue, RuntimeStore,
 * SubagentFinalizer, SubagentSpawner, and SubagentSurfaceSync.
 *
 * Owns the spawn-to-final-result seam, keeps runtime maps private,
 * and optionally drives tool surface visibility reactively from
 * lifecycle state changes.
 */

import type { ExtensionAPI, AgentSession, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentRuntime, SpawnResult } from "./types.js";
import type { FinalizeSubagentInput, QueuedSpawnDelegation, SpawnDelegationAdapters, SpawnDelegationInput } from "./subagentLifecycleTypes.js";
import type { SubagentHub } from "./ipc.js";
import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { SubagentResultStore } from "./resultStore.js";
import { SpawnQueue } from "./spawnQueue.js";
import { RuntimeStore } from "./runtimeStore.js";
import { SubagentFinalizer } from "./subagentFinalizer.js";
import { SubagentSpawner, type CloseRuntimeAdapters } from "./subagentSpawner.js";
import { createSurfaceSyncSubscriber, syncSubagentToolSurface } from "./subagentSurfaceSync.js";

// Re-export shared types for existing consumers.
export type { QueuedSpawnDelegation, SpawnDelegationAdapters, SpawnDelegationInput, FinalizeSubagentInput } from "./subagentLifecycleTypes.js";

export class SubagentLifecycle {
  readonly resultStore: SubagentResultStore;
  private readonly _runtimes: RuntimeStore;
  private readonly queue: SpawnQueue;
  private readonly finalizer: SubagentFinalizer;
  private spawner!: SubagentSpawner;
  private adaptersInitialized = false;
  private surfaceSyncUnsubscribe?: () => void;
  private _cwd: string;

  constructor(
    private readonly registry: AgentRegistry,
    private readonly mailbox: Mailbox,
    cwd = process.cwd(),
  ) {
    this._cwd = cwd;
    this.finalizer = new SubagentFinalizer(registry, mailbox, cwd);
    this._runtimes = new RuntimeStore();
    this.resultStore = this.finalizer.resultStore;

    // Queue is created eagerly; spawner is wired in initAdapters().
    // The onDrain callback defers to spawner which will exist by the time
    // drain actually runs (drain uses queueMicrotask, so it's always async).
    this.queue = new SpawnQueue(registry, async (item) => {
      if (!this.spawner) throw new Error("SubagentLifecycle adapters not initialized. Call initAdapters() first.");
      await this.spawner.startSpawnFromQueue(item);
    }, { maxQueueMs: 10 * 60 * 1000 }, (item, reason) => {
      this.finalizer.enqueueToMailbox(item.agentId, item.canonicalPath, item.callerPath, `Agent error: ${reason}`, "final_result");
      this.mailbox.appendEvent({ type: "agent_final_message", agentId: item.agentId, agentPath: item.canonicalPath, timestamp: Date.now(), parentAgentId: item.callerPath === "/root" ? undefined : "root", message: `Agent error: ${reason}`, status: "errored" });
    });
  }

  /**
   * Initialize adapters after construction. Called once by AgentControl
   * before the first spawn. The adapters are fixed for the lifetime of
   * the spawner.
   */
  initAdapters(adapters: SpawnDelegationAdapters): void {
    if (this.adaptersInitialized) return;
    this.adaptersInitialized = true;
    this.spawner = new SubagentSpawner({
      adapters,
      registry: this.registry,
      mailbox: this.mailbox,
      queue: this.queue,
      runtimes: this._runtimes,
      finalizer: this.finalizer,
    });
  }

  // ─── Result store ─────────────────────────────────────────────

  resultStoreFor(cwd: string): SubagentResultStore {
    return this.finalizer.resultStoreFor(cwd);
  }

  // ─── Runtime accessors (back-compat) ──────────────────────────

  /** Runtime lookup for AgentSessionControl; keeps RuntimeStore behind this seam. */
  runtimeForSession(agentPath: string): AgentRuntime | undefined {
    return this._runtimes.getRuntime(agentPath);
  }

  runtimePaths(): string[] {
    return this._runtimes.runtimePaths();
  }

  getRuntimeByAgentId(agentId: string): AgentRuntime | undefined {
    return this._runtimes.getRuntimeByAgentId(agentId);
  }

  getChildSession(agentPath: string): AgentSession | undefined {
    return this._runtimes.getChildSession(agentPath);
  }

  childSessionPaths(): string[] {
    return this._runtimes.childSessionPaths();
  }

  /** Hub lookup for AgentSessionControl; keeps RuntimeStore behind this seam. */
  hubForSession(agentId: string): SubagentHub | undefined {
    return this._runtimes.getHub(agentId);
  }

  // ─── Queue accessors (back-compat) ────────────────────────────

  queueMessageToQueued(agentPath: string, message: string): boolean {
    return this.queue.queueMessage(agentPath, message);
  }

  removeQueued(agentPath: string): boolean {
    return this.queue.remove(agentPath);
  }

  // ─── Finalization ─────────────────────────────────────────────

  handleFinalText(input: FinalizeSubagentInput): string {
    return this.finalizer.handleFinalText(input);
  }

  finalizeWithError(agentId: string, agentPath: string, callerPath: string, err: unknown): void {
    this.finalizer.finalizeWithError(agentId, agentPath, callerPath, err);
    this._runtimes.deleteRuntime(agentPath);
    this._runtimes.deleteChildSession(agentPath);
  }

  enqueueToMailbox(fromAgentId: string, fromPath: string, toPath: string, content: string, kind: "message" | "followup" | "final_result"): void {
    this.finalizer.enqueueToMailbox(fromAgentId, fromPath, toPath, content, kind);
  }

  /** Register a pending retry link for chain tracking. */
  registerRetryLink(agentPath: string, originalResultId: string): void {
    this.finalizer.registerRetryLink(agentPath, originalResultId);
  }

  // ─── Spawn & Close (delegate to spawner) ──────────────────────

  async spawnDelegation(input: SpawnDelegationInput): Promise<SpawnResult> {
    return this.spawner.spawn(input.params, input.ctx, input.callerPath, input.agentId);
  }

  async closeRuntime(agentPath: string, adapters: CloseRuntimeAdapters): Promise<void> {
    return this.spawner.closeRuntime(agentPath, adapters);
  }

  // ─── Tool surface sync ─────────────────────────────────────────

  /**
   * Enable reactive tool surface sync. The lifecycle subscribes to
   * registry events and updates Pi's active tool set automatically.
   * Call this once after initAdapters(). Call disableSurfaceSync()
   * on shutdown.
   */
  enableSurfaceSync(pi: ExtensionAPI): void {
    if (this.surfaceSyncUnsubscribe) return;
    this.surfaceSyncUnsubscribe = createSurfaceSyncSubscriber(
      pi,
      this.registry,
      (cwd) => this.resultStoreFor(cwd),
      () => this._cwd,
    );
  }

  disableSurfaceSync(): void {
    this.surfaceSyncUnsubscribe?.();
    this.surfaceSyncUnsubscribe = undefined;
  }

  /**
   * One-shot surface sync. Called from index.ts after tool invocations
   * for backwards compatibility when reactive sync is not enabled.
   */
  syncSurface(pi: ExtensionAPI): void {
    syncSubagentToolSurface(pi, this.registry.list(), this.resultStoreFor(this._cwd));
  }
}
