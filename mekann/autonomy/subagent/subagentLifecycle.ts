/**
 * SubagentLifecycle — thin facade over SpawnQueue, RuntimeStore,
 * SubagentFinalizer, and SubagentSpawner.
 *
 * Preserves the original public interface so callers (AgentControl, tests)
 * do not change. Every method delegates to the appropriate sub-module.
 */

import type { AgentSession, ExtensionContext } from "@earendil-works/pi-coding-agent";
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

// Re-export shared types for existing consumers.
export type { QueuedSpawnDelegation, SpawnDelegationAdapters, SpawnDelegationInput, FinalizeSubagentInput } from "./subagentLifecycleTypes.js";

export class SubagentLifecycle {
  readonly resultStore: SubagentResultStore;
  private readonly _runtimes: RuntimeStore;
  private readonly queue: SpawnQueue;
  private readonly finalizer: SubagentFinalizer;
  private spawner!: SubagentSpawner;
  private adaptersInitialized = false;

  /**
   * Back-compat public maps. AgentControl reads these directly:
   *   this.runtimes = this.lifecycle.runtimes;
   *   this.childSessions = this.lifecycle.childSessions;
   *   this.hubs = this.lifecycle.hubs;
   * We expose the RuntimeStore's internal maps as readonly references.
   */
  readonly runtimes: Map<string, AgentRuntime>;
  readonly childSessions: Map<string, AgentSession>;
  readonly hubs: Map<string, SubagentHub>;

  constructor(
    private readonly registry: AgentRegistry,
    private readonly mailbox: Mailbox,
    cwd = process.cwd(),
  ) {
    this.finalizer = new SubagentFinalizer(registry, mailbox, cwd);
    this._runtimes = new RuntimeStore();
    this.resultStore = this.finalizer.resultStore;

    // Expose internal maps for back-compat
    this.runtimes = (this._runtimes as any).runtimes;
    this.childSessions = (this._runtimes as any).childSessions;
    this.hubs = (this._runtimes as any).hubs;

    // Queue is created eagerly; spawner is wired in initAdapters().
    // The onDrain callback defers to spawner which will exist by the time
    // drain actually runs (drain uses queueMicrotask, so it's always async).
    this.queue = new SpawnQueue(registry, (item) => {
      if (!this.spawner) throw new Error("SubagentLifecycle adapters not initialized. Call initAdapters() first.");
      return this.spawner.startSpawnFromQueue(item);
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

  getRuntime(agentPath: string): AgentRuntime | undefined {
    return this._runtimes.getRuntime(agentPath);
  }

  setRuntime(agentPath: string, runtime: AgentRuntime): void {
    this._runtimes.setRuntime(agentPath, runtime);
  }

  deleteRuntime(agentPath: string): void {
    this._runtimes.deleteRuntime(agentPath);
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

  setChildSession(agentPath: string, session: AgentSession): void {
    this._runtimes.setChildSession(agentPath, session);
  }

  deleteChildSession(agentPath: string): void {
    this._runtimes.deleteChildSession(agentPath);
  }

  childSessionPaths(): string[] {
    return this._runtimes.childSessionPaths();
  }

  setHub(agentId: string, hub: SubagentHub): void {
    this._runtimes.setHub(agentId, hub);
  }

  getHub(agentId: string): SubagentHub | undefined {
    return this._runtimes.getHub(agentId);
  }

  deleteHub(agentId: string): void {
    this._runtimes.deleteHub(agentId);
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

  // ─── Spawn & Close (delegate to spawner) ──────────────────────

  async spawnDelegation(input: SpawnDelegationInput): Promise<SpawnResult> {
    return this.spawner.spawn(input.params, input.ctx, input.callerPath, input.agentId);
  }

  async closeRuntime(agentPath: string, adapters: CloseRuntimeAdapters): Promise<void> {
    return this.spawner.closeRuntime(agentPath, adapters);
  }
}
