/**
 * Subagent Extension — Agent registry.
 *
 * Tracks all agents (root + subagents), enforces resource limits,
 * prevents duplicate open task paths, and publishes lifecycle events
 * to subscribers.
 */

import { ROOT_PATH, pathDepth } from "./types.js";
import type {
  AgentMetadata,
  AgentStatus,
  LifecycleEvent,
  RegistrySubscriber,
} from "./types.js";

// ─── Reservation token ───────────────────────────────────────────

let reservationCounter = 0;

export interface Reservation {
  readonly token: number;
  readonly maxAgents: number;
  consumed: boolean;
  rolledBack: boolean;
  readonly path: string;
}

// ─── Agent registry ──────────────────────────────────────────────

export class AgentRegistry {
  private agents = new Map<string, AgentMetadata>();
  private subscribers: RegistrySubscriber[] = [];
  private _maxAgents: number;
  private _maxDepth: number;
  private reservations = new Set<Reservation>();
  private reservedPaths = new Set<string>();

  private get reservedCount(): number {
    return this.reservations.size;
  }

  constructor(maxAgents: number, maxDepth: number) {
    this._maxAgents = maxAgents;
    this._maxDepth = maxDepth;
  }

  get maxAgents(): number {
    return this._maxAgents;
  }

  get maxDepth(): number {
    return this._maxDepth;
  }

  // ─── Subscription ────────────────────────────────────────────

  subscribe(fn: RegistrySubscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      const idx = this.subscribers.indexOf(fn);
      if (idx >= 0) this.subscribers.splice(idx, 1);
    };
  }

  private publish(event: LifecycleEvent): void {
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        // Subscriber errors must not break the registry.
      }
    }
  }

  // ─── Slot reservation ────────────────────────────────────────

  /**
   * Reserve a spawn slot. Call this before attempting to create a child
   * session. If the reservation is not consumed via registerAgent(), call
   * rollbackReservation() to free the slot.
   */
  reserveSpawnSlot(path: string): Reservation {
    // Check open count + reserved-but-not-committed count
    const activeCount = this.openCount + this.reservedCount;
    if (activeCount >= this._maxAgents) {
      throw new Error(
        `Maximum number of open agents reached (${this._maxAgents}). Close existing agents before spawning new ones.`,
      );
    }
    // Duplicate open path check (includes reserved paths)
    const existing = this.agents.get(path);
    if (existing && existing.open) {
      throw new Error(
        `An open agent already exists at path "${path}" (agent_id: ${existing.agentId}). Close it first or use a different path.`,
      );
    }
    if (this.reservedPaths.has(path)) {
      throw new Error(
        `An agent reservation already exists at path "${path}". Wait for the pending spawn to complete or use a different path.`,
      );
    }
    const reservation: Reservation = {
      token: ++reservationCounter,
      maxAgents: this._maxAgents,
      consumed: false,
      rolledBack: false,
      path,
    };
    this.reservations.add(reservation);
    this.reservedPaths.add(path);
    return reservation;
  }

  rollbackReservation(reservation: Reservation): void {
    if (reservation.consumed || reservation.rolledBack) return;
    reservation.rolledBack = true;
    this.reservations.delete(reservation);
    this.reservedPaths.delete(reservation.path);
  }

  // ─── Registration ────────────────────────────────────────────

  /**
   * Ensure the root agent is registered. Called on first tool invocation
   * or session_start.
   */
  ensureRoot(sessionId: string): AgentMetadata {
    const existing = this.agents.get(ROOT_PATH);
    if (existing && existing.open) {
      return existing;
    }
    const now = Date.now();
    const root: AgentMetadata = {
      agentId: "root",
      sessionId,
      agentPath: ROOT_PATH,
      status: "running",
      createdAt: now,
      updatedAt: now,
      depth: 0,
      open: true,
      cancellationRequested: false,
    };
    this.agents.set(ROOT_PATH, root);
    return root;
  }

  /**
   * Register a new subagent. Consumes the reservation.
   * Rejects duplicate open task paths and depth violations.
   */
  registerAgent(
    metadata: AgentMetadata,
    reservation: Reservation,
  ): void {
    if (reservation.consumed || reservation.rolledBack) {
      throw new Error("Reservation already consumed or rolled back.");
    }

    // Depth check
    if (metadata.depth > this._maxDepth) {
      throw new Error(
        `Maximum agent depth exceeded (${this._maxDepth}). Current depth would be ${metadata.depth}.`,
      );
    }

    // Duplicate open path check (already checked at reservation time, but guard again for safety)
    const existing = this.agents.get(metadata.agentPath);
    if (existing && existing.open) {
      throw new Error(
        `An open agent already exists at path "${metadata.agentPath}" (agent_id: ${existing.agentId}). Close it first or use a different path.`,
      );
    }

    reservation.consumed = true;
    this.reservations.delete(reservation);
    this.reservedPaths.delete(reservation.path);
    this.agents.set(metadata.agentPath, metadata);

    this.publish({
      type: "agent_spawn_end",
      agentId: metadata.agentId,
      agentPath: metadata.agentPath,
      success: true,
      timestamp: Date.now(),
    });
  }

  // ─── Queries ─────────────────────────────────────────────────


  get openCount(): number {
    return this.filterAgents(a => a.open).length;
  }

  get(agentPath: string): AgentMetadata | undefined {
    return this.agents.get(agentPath);
  }

  /** Find first agent matching predicate, or undefined. */
  private findAgent(predicate: (agent: AgentMetadata) => boolean): AgentMetadata | undefined {
    for (const [, agent] of this.agents) {
      if (predicate(agent)) return agent;
    }
  }

  getByAgentId(agentId: string): AgentMetadata | undefined {
    return this.findAgent(a => a.agentId === agentId);
  }

  getBySessionId(sessionId: string): AgentMetadata | undefined {
    return this.findAgent(a => a.sessionId === sessionId);
  }

  /** Filter agents by predicate, return as sorted array. */
  private filterAgents(predicate: (agent: AgentMetadata) => boolean): AgentMetadata[] {
    const result: AgentMetadata[] = [];
    for (const [, agent] of this.agents) {
      if (predicate(agent)) result.push(agent);
    }
    return result;
  }

  /**
   * List agents, optionally filtered by path prefix (segment-boundary).
   */
  list(pathPrefix?: string): AgentMetadata[] {
    return this.filterAgents(a => !pathPrefix || a.agentPath.startsWith(pathPrefix + "/") || a.agentPath === pathPrefix)
      .sort((a, b) => a.agentPath.localeCompare(b.agentPath));
  }

  /**
   * Get all open descendant agents of the given agent.
   * Returns in depth-first order (deepest first for safe closing).
   */
  getOpenDescendants(agentPath: string): AgentMetadata[] {
    const prefix = agentPath + "/";
    return this.filterAgents(a => a.open && a.agentPath.startsWith(prefix))
      .sort((a, b) => pathDepth(b.agentPath) - pathDepth(a.agentPath));
  }

  // ─── Mutations ───────────────────────────────────────────────

  private setStatusAndPublish(agentPath: string, newStatus: AgentStatus, updates?: Partial<AgentMetadata>): void {
    const agent = this.agents.get(agentPath); if (!agent) return;
    const previousStatus = agent.status;
    Object.assign(agent, updates, { status: newStatus, updatedAt: Date.now() });
    this.publish({ type: "agent_status_changed", agentId: agent.agentId, agentPath: agent.agentPath, previousStatus, newStatus, timestamp: agent.updatedAt });
  }

  updateStatus(agentPath: string, newStatus: AgentStatus, extra?: Partial<Pick<AgentMetadata, "lastTaskMessage" | "timeoutDeadline">>): void {
    const agent = this.agents.get(agentPath); if (!agent) return;
    if (extra?.lastTaskMessage !== undefined) agent.lastTaskMessage = extra.lastTaskMessage;
    if (extra?.timeoutDeadline !== undefined) agent.timeoutDeadline = extra.timeoutDeadline;
    if (agent.status !== newStatus) this.setStatusAndPublish(agentPath, newStatus);
  }

  close(agentPath: string, status: AgentStatus = "shutdown"): void {
    this.setStatusAndPublish(agentPath, status, { open: false });
  }

  /**
   * Clear all agents. Used on session_shutdown.
   */
  clear(): void {
    this.agents.clear();
    this.reservations.clear();
    this.reservedPaths.clear();
  }

  /**
   * Check if a given path has an open agent.
   */
  isOpen(agentPath: string): boolean {
    const agent = this.agents.get(agentPath);
    return agent?.open ?? false;
  }
}
