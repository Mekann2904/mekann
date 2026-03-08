/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/sse.ts
 * @role SSE API routes for web-ui server
 * @why Provide SSE endpoint for real-time updates
 * @related server.ts, lib/sse-bus.ts
 * @public_api registerSSERoutes
 * @invariants SSE clients must be cleaned up on disconnect
 * @side_effects Maintains SSE connections
 * @failure_modes Client write failures (handled by removing client)
 *
 * @abdd.explain
 * @overview Server-Sent Events API endpoints
 * @what_it_does Provides SSE endpoint for real-time push notifications
 * @why_it_exists Enables real-time updates in web UI
 * @scope(in) HTTP requests for SSE connection
 * @scope(out) SSE event streams
 */

import type { Express, Request, Response } from "express";
import type { SSEEventBus } from "../lib/sse-bus.js";

/**
 * @summary Register SSE routes on Express app
 * @param app - Express application instance
 * @param sseEventBus - SSE event bus instance
 */
export function registerSSERoutes(app: Express, sseEventBus: SSEEventBus): void {
  /**
   * GET /api/events - Server-Sent Events endpoint for real-time updates
   */
  app.get("/api/events", (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Generate unique client ID
    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Register client
    sseEventBus.addClient(clientId, res);

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: Date.now() })}\n\n`);

    // Handle client disconnect
    req.on("close", () => {
      sseEventBus.removeClient(clientId);
    });

    // Keep connection alive
    if ("setKeepAlive" in req.socket && typeof req.socket.setKeepAlive === "function") {
      req.socket.setKeepAlive(true);
    }
  });
}
