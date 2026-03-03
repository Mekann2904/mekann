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
export type SSEEventType = "status" | "tool-call" | "response" | "heartbeat" | "context-update" | "instances-update";

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
 */
interface SSEClient {
  id: string;
  res: Response;
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
   */
  broadcast(event: SSEEvent): void {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;

    for (const [id, client] of this.clients) {
      try {
        client.res.write(eventStr);
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
   */
  startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: "heartbeat",
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
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
