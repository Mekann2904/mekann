/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/routes/runtime.ts
 * @role Runtime API routes for web-ui server
 * @why Provide RESTful API for runtime session management
 * @related server.ts, routes/*.ts
 * @public_api registerRuntimeRoutes
 * @invariants Session IDs must be unique
 * @side_effects Subscribes to session events for SSE
 * @failure_modes Session lookup failures
 *
 * @abdd.explain
 * @overview Runtime session management API endpoints
 * @what_it_does Lists sessions, provides runtime status, SSE for real-time updates
 * @why_it_exists Enables runtime monitoring via web UI
 * @scope(in) HTTP requests with session/task IDs
 * @scope(out) JSON responses with session data, SSE streams
 */

import type { Express, Request, Response } from "express";
import {
  getActiveSessions,
  getSessionStats,
  getSessionByTaskId,
  onSessionEvent,
  type SessionEvent,
} from "../../../lib/runtime-sessions.js";

/**
 * @summary Register runtime routes on Express app
 * @param app - Express application instance
 * @returns Unsubscribe function for session events
 */
export function registerRuntimeRoutes(app: Express): () => void {
  // Runtime SSE clients for session updates
  const runtimeSSEClients = new Map<string, Response>();

  // Subscribe to session events and broadcast to SSE clients
  const unsubscribeSessionEvents = onSessionEvent((event: SessionEvent) => {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;
    for (const [id, clientRes] of runtimeSSEClients) {
      try {
        clientRes.write(eventStr);
      } catch {
        runtimeSSEClients.delete(id);
      }
    }
  });

  /**
   * GET /api/runtime/status - Get current runtime status
   */
  app.get("/api/runtime/status", async (_req: Request, res: Response) => {
    try {
      // Import agent-runtime dynamically
      const { getRuntimeSnapshot } = await import("../../agent-runtime.js");
      const snapshot = getRuntimeSnapshot();
      const sessionStats = getSessionStats();

      res.json({
        success: true,
        data: {
          // Runtime snapshot from agent-runtime.ts
          activeLlm: snapshot.totalActiveLlm,
          activeRequests: snapshot.totalActiveRequests,
          limits: snapshot.limits,
          queuedOrchestrations: snapshot.queuedOrchestrations,
          priorityStats: snapshot.priorityStats,
          // Session stats from runtime-sessions.ts
          sessions: sessionStats,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Fallback to session-only stats if agent-runtime fails
      const sessionStats = getSessionStats();
      res.json({
        success: true,
        data: {
          activeLlm: sessionStats.running,
          activeRequests: sessionStats.total,
          limits: null,
          queuedOrchestrations: 0,
          priorityStats: null,
          sessions: sessionStats,
          warning: `agent-runtime unavailable: ${errorMessage}`,
        },
      });
    }
  });

  /**
   * GET /api/runtime/sessions - Get active sessions
   */
  app.get("/api/runtime/sessions", (_req: Request, res: Response) => {
    try {
      const sessions = getActiveSessions();
      const stats = getSessionStats();

      res.json({
        success: true,
        data: {
          sessions,
          stats,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: "Failed to get sessions",
        details: errorMessage,
      });
    }
  });

  /**
   * GET /api/runtime/sessions/task/:taskId - Get session by task ID
   */
  app.get("/api/runtime/sessions/task/:taskId", (req: Request, res: Response) => {
    try {
      const session = getSessionByTaskId(req.params.taskId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: "No active session for this task",
        });
        return;
      }

      res.json({
        success: true,
        data: session,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: "Failed to get session",
        details: errorMessage,
      });
    }
  });

  /**
   * GET /api/runtime/stream - SSE endpoint for real-time runtime updates
   */
  app.get("/api/runtime/stream", (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Generate client ID
    const clientId = `runtime-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Register client
    runtimeSSEClients.set(clientId, res);

    // Send initial snapshot
    const sessions = getActiveSessions();
    res.write(`event: status_snapshot\ndata: ${JSON.stringify(sessions)}\nid: ${Date.now()}\n\n`);

    // Keep connection alive with periodic comments
    const keepAlive = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(keepAlive);
        runtimeSSEClients.delete(clientId);
      }
    }, 15000);

    // Clean up on close
    const cleanup = () => {
      clearInterval(keepAlive);
      runtimeSSEClients.delete(clientId);
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  });

  return unsubscribeSessionEvents;
}
