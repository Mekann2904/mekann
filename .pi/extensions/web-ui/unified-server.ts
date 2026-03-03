/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/unified-server.ts
 * @role Unified HTTP server for Web UI (single server architecture)
 * @why Simplify management by consolidating server.ts and standalone-server.ts
 * @related config.ts, routes/*.ts, middleware/*.ts
 * @public_api startUnifiedServer, stopUnifiedServer, isServerRunning, getServerPort, broadcastSSEEvent
 * @invariants Server must clean up on shutdown, SSE clients must be cleaned up on disconnect
 * @side_effects Opens TCP port, serves HTTP requests, accesses shared storage, maintains SSE connections
 * @failure_modes Port in use, file not found, SSE connection failures
 *
 * @abdd.explain
 * @overview Unified Express server that serves static files, API endpoints, and SSE
 * @what_it_does Hosts built Preact app, provides REST API, broadcasts SSE events, manages instances
 * @why_it_exists Replaces dual-server architecture with single, simpler server
 * @scope(in) ExtensionAPI, ExtensionContext, SSE events, shared storage
 * @scope(out) HTTP responses, SSE broadcasts, shared storage updates
 */

import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Middleware
import { securityHeaders, corsMiddleware } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";

// Routes
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerMcpRoutes } from "./routes/mcp.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerInstanceRoutes } from "./routes/instances.js";
import { registerRuntimeRoutes } from "./routes/runtime.js";
import { registerUlWorkflowRoutes } from "./routes/ul-workflow.js";
import { registerSSERoutes } from "./routes/sse.js";

// Lib
import {
  ContextHistoryStorage,
  type ContextHistoryEntry,
} from "./lib/instance-registry.js";
import { SSEEventBus, type SSEEvent, type SSEEventType } from "./lib/sse-bus.js";
import { cleanupDeadOwnerUlWorkflowTasks } from "./lib/server-utils.js";
import { getConfig } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Re-export types for backward compatibility
export type { SSEEventType, SSEEvent };

// Global instances
const sseEventBus = new SSEEventBus();
let contextCleanupInterval: ReturnType<typeof setInterval> | null = null;
let ulTaskCleanupInterval: ReturnType<typeof setInterval> | null = null;
let contextHistoryStorage: ContextHistoryStorage | null = null;

/**
 * @summary Add context history entry and broadcast via SSE
 * @param entry - Context history entry (pid is optional, defaults to process.pid)
 */
export function addContextHistory(entry: Omit<ContextHistoryEntry, "pid"> & { pid?: number }): void {
  const pid = entry.pid ?? process.pid;

  if (!contextHistoryStorage || contextHistoryStorage.getPid() !== pid) {
    contextHistoryStorage?.dispose();
    contextHistoryStorage = new ContextHistoryStorage(pid);
  }

  contextHistoryStorage.add(entry);

  sseEventBus.broadcast({
    type: "context-update",
    data: {
      pid,
      timestamp: entry.timestamp,
      input: entry.input,
      output: entry.output,
    },
    timestamp: Date.now(),
  });
}

interface ServerState {
  server: HttpServer | null;
  port: number;
  pi: ExtensionAPI | null;
  ctx: ExtensionContext | null;
  unsubscribeSessionEvents: (() => void) | null;
}

const state: ServerState = {
  server: null,
  port: 3000,
  pi: null,
  ctx: null,
  unsubscribeSessionEvents: null,
};

/**
 * @summary Get extension context
 */
export function getContext(): ExtensionContext | null {
  return state.ctx;
}

/**
 * @summary Get extension API
 */
export function getPi(): ExtensionAPI | null {
  return state.pi;
}

/**
 * @summary Start unified HTTP server for Web UI
 * @param pi Extension API instance (optional for standalone mode)
 * @param ctx Extension context (optional for standalone mode)
 * @returns HTTP server instance
 */
export function startUnifiedServer(
  pi?: ExtensionAPI,
  ctx?: ExtensionContext
): HttpServer {
  const config = getConfig();
  const app: Express = express();

  // Security middleware
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json());

  // Store API references if provided (internal mode)
  if (pi && ctx) {
    state.pi = pi;
    state.ctx = ctx;
  }

  // Cleanup UL tasks owned by inactive instances
  const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
  if (cleanedCount > 0) {
    console.log(`[web-ui] Cleaned up ${cleanedCount} UL task(s) from inactive instances`);
  }

  // ============= Register API Routes =============

  // Instance and status routes
  registerInstanceRoutes(app, () => state.ctx);

  // SSE routes
  registerSSERoutes(app, sseEventBus);

  // MCP routes
  registerMcpRoutes(app);

  // Task routes
  registerTaskRoutes(app);

  // Analytics routes
  registerAnalyticsRoutes(app);

  // UL Workflow routes
  registerUlWorkflowRoutes(app);

  // Runtime routes (returns unsubscribe function)
  if (pi && ctx) {
    state.unsubscribeSessionEvents = registerRuntimeRoutes(app);
  }

  // ============= Server Registry =============

  // Register server in shared storage (for multi-instance management)
  import("./lib/instance-registry.js").then(({ ServerRegistry }) => {
    ServerRegistry.register(process.pid, config.port);
  });

  // ============= Static Files =============

  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));

  // ============= Error Handlers =============

  // 404 handler for API routes
  app.use("/api/*", notFoundHandler);

  // SPA fallback (must be after API routes)
  app.get("*", (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) {
        res.status(404).send(`
          <html>
            <body style="background:#0d1117;color:#f0f6fc;font-family:sans-serif;padding:2rem;">
              <h1>Build Required</h1>
              <p>Run <code style="background:#21262d;padding:0.25rem 0.5rem;border-radius:4px;">npm run build</code> in the web-ui directory first.</p>
            </body>
          </html>
        `);
      }
    });
  });

  // Global error handler
  app.use(errorHandler);

  // ============= Start Server =============

  state.server = createServer(app);
  state.port = config.port;

  state.server.listen(config.port, () => {
    // Initialize context history storage
    contextHistoryStorage?.dispose();
    contextHistoryStorage = new ContextHistoryStorage(process.pid);

    // Start SSE heartbeat
    sseEventBus.startHeartbeat();

    // Start instance broadcast
    import("./lib/instance-registry.js").then(({ InstanceRegistry }) => {
      sseEventBus.startInstancesBroadcast(() => InstanceRegistry.getAll());
    });

    // Periodic cleanup of old history files
    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
    }
    contextCleanupInterval = setInterval(() => {
      ContextHistoryStorage.cleanup();
    }, config.cleanupInterval);

    // Periodic cleanup of UL tasks owned by inactive instances
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
    }
    ulTaskCleanupInterval = setInterval(() => {
      const cleanedCount = cleanupDeadOwnerUlWorkflowTasks();
      if (cleanedCount > 0) {
        console.log(`[web-ui] Periodic cleanup: removed ${cleanedCount} UL task(s) from inactive instances`);
      }
    }, config.ulTaskCleanupInterval);

    console.log(`[web-ui] Unified server started on port ${config.port}`);
  });

  return state.server;
}

/**
 * @summary Stop the HTTP server
 */
export function stopUnifiedServer(): void {
  if (state.server) {
    // Unsubscribe from session events
    if (state.unsubscribeSessionEvents) {
      state.unsubscribeSessionEvents();
      state.unsubscribeSessionEvents = null;
    }

    sseEventBus.stopHeartbeat();

    if (contextCleanupInterval) {
      clearInterval(contextCleanupInterval);
      contextCleanupInterval = null;
    }
    if (ulTaskCleanupInterval) {
      clearInterval(ulTaskCleanupInterval);
      ulTaskCleanupInterval = null;
    }
    state.server.close();
    state.server = null;

    // Flush buffer and remove event listeners
    if (contextHistoryStorage) {
      contextHistoryStorage.dispose();
      contextHistoryStorage = null;
    }

    // Unregister server from shared storage
    import("./lib/instance-registry.js").then(({ ServerRegistry }) => {
      ServerRegistry.unregister();
    });

    console.log("[web-ui] Unified server stopped");
  }
}

/**
 * @summary Check if server is running
 */
export function isServerRunning(): boolean {
  return state.server !== null;
}

/**
 * @summary Get current server port
 */
export function getServerPort(): number {
  return state.port;
}

/**
 * @summary Broadcast SSE event to all connected clients
 */
export function broadcastSSEEvent(event: SSEEvent): void {
  sseEventBus.broadcast(event);
}

/**
 * @summary Get connected SSE client count
 */
export function getSSEClientCount(): number {
  return sseEventBus.getClientCount();
}

// ============= Signal Handlers for Detached Mode =============

/**
 * Handle graceful shutdown signals
 */
function setupSignalHandlers(): void {
  const shutdown = (signal: string) => {
    console.log(`[web-ui] Received ${signal}, shutting down...`);
    stopUnifiedServer();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============= CLI Entry Point =============

/**
 * Start unified server in standalone mode (when run directly)
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  setupSignalHandlers();
  startUnifiedServer();
}
