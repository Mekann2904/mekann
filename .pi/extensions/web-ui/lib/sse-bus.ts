/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/sse-bus.ts
 * @role SSE event bus for real-time broadcasting
 * @why Centralize SSE client management and event broadcasting
 * @related server.ts, routes/sse.ts
 * @public_api SSEEventBus, SSEEventType, SSEEvent
 * @invariants Each client must have unique ID, disconnected clients must be cleaned up
 * @side_effects Maintains SSE connections, sends events to clients
 * @failure_modes Client write failures (handled by removing client)
 *
 * @abdd.explain
 * @overview Server-Sent Events client management and broadcasting
 * @what_it_does Manages SSE client connections, broadcasts events to all clients
 * @why_it_exists Enables real-time push notifications to browser clients
 * @scope(in) SSEEvent objects
 * @scope(out) SSE event streams to connected clients
 */

import type { Response } from "express";

/**
 * @summary SSE event types for real-time updates
 */
export type SSEEventType =
  | "status"
  | "tool-call"
  | "response"
  | "heartbeat"
  | "context-update"
  | "instances-update"
  | "experiment_start"
  | "experiment_baseline"
  | "experiment_run"
  | "experiment_improved"
  | "experiment_regressed"
  | "experiment_timeout"
  | "experiment_crash"
  | "experiment_stop";

/**
 * @summary SSE event payload structure
 */
export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * @summary SSE client connection
 * @description Tracks last successful write time for stale client detection
 */
interface SSEClient {
  id: string;
  res: Response;
  /** Last successful write timestamp, used for stale client cleanup */
  lastHeartbeat: number;
}

/**
 * @summary Event bus for SSE broadcasting
 */
export class SSEEventBus {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private instancesBroadcastInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * @summary Add SSE client connection
   */
  addClient(id: string, res: Response): void {
    this.clients.set(id, { id, res, lastHeartbeat: Date.now() });
  }

  /**
   * @summary Remove SSE client connection
   */
  removeClient(id: string): void {
    this.clients.delete(id);
  }

  /**
   * @summary Broadcast event to all connected clients
   * @description Updates lastHeartbeat on successful write to track active clients
   */
  broadcast(event: SSEEvent): void {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;
    const now = Date.now();

    for (const [id, client] of this.clients) {
      try {
        client.res.write(eventStr);
        // Update lastHeartbeat on successful write to track active clients
        client.lastHeartbeat = now;
      } catch (error) {
        // Client disconnected, remove it
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[web-ui] SSE client ${id} disconnected during broadcast: ${errorMessage}`);
        this.clients.delete(id);
      }
    }
  }

  /**
   * @summary Start heartbeat interval (30 seconds)
   * @description Broadcasts heartbeat and removes stale clients (90s timeout = 3 missed heartbeats)
   */
  startHeartbeat(): void {
    const CLIENT_TIMEOUT_MS = 90000; // 90 seconds = 3 missed heartbeats

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      // Proactively remove stale clients that haven't responded within timeout
      for (const [id, client] of this.clients) {
        const staleDuration = now - client.lastHeartbeat;
        if (staleDuration > CLIENT_TIMEOUT_MS) {
          console.warn(`[web-ui] SSE client ${id} timed out after ${Math.round(staleDuration / 1000)}s of inactivity`);
          this.clients.delete(id);
        }
      }

      this.broadcast({
        type: "heartbeat",
        data: { timestamp: now },
        timestamp: now,
      });
    }, 30000);
  }

  /**
   * @summary Start instances broadcast interval (3 seconds)
   */
  startInstancesBroadcast(getInstances: () => unknown[]): void {
    this.instancesBroadcastInterval = setInterval(() => {
      const instances = getInstances();
      this.broadcast({
        type: "instances-update",
        data: {
          instances,
          count: instances.length,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    }, 3000);
  }

  /**
   * @summary Stop heartbeat interval and clear all clients
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.instancesBroadcastInterval) {
      clearInterval(this.instancesBroadcastInterval);
      this.instancesBroadcastInterval = null;
    }
    // Clear all clients on server shutdown
    this.clients.clear();
  }

  /**
   * @summary Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }
}
