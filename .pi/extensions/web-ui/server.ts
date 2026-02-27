/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/server.ts
 * @role HTTP server for Web UI extension
 * @why Serve Preact dashboard to browser
 * @related index.ts, web/src/app.tsx
 * @public_api startServer, stopServer
 * @invariants Server must clean up on shutdown
 * @side_effects Opens TCP port, serves HTTP requests
 * @failure_modes Port in use, file not found
 *
 * @abdd.explain
 * @overview Express server that serves static files and API endpoints
 * @what_it_does Hosts built Preact app and provides REST API for pi state
 * @why_it_exists Allows browser access to pi monitoring/configuration
 * @scope(in) ExtensionAPI, ExtensionContext
 * @scope(out) HTTP responses
 */

import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server as HttpServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerState {
  server: HttpServer | null;
  port: number;
}

const state: ServerState = {
  server: null,
  port: 3000,
};

/**
 * @summary Start HTTP server for Web UI
 * @param port Port number to listen on
 * @param pi Extension API instance
 * @param ctx Extension context
 * @returns HTTP server instance
 */
export function startServer(
  port: number,
  pi: ExtensionAPI,
  ctx: ExtensionContext
): HttpServer {
  const app: Express = express();
  app.use(express.json());

  // API endpoints
  app.get("/api/status", (_req: Request, res: Response) => {
    const contextUsage = ctx.getContextUsage();
    res.json({
      status: {
        model: ctx.model?.id ?? "unknown",
        cwd: ctx.cwd,
        contextUsage: contextUsage?.ratio ?? 0,
        totalTokens: contextUsage?.tokens ?? 0,
        cost: 0, // TODO: integrate with usage tracking
      },
      metrics: {
        toolCalls: 0,
        errors: 0,
        avgResponseTime: 0,
      },
      config: {},
    });
  });

  app.post("/api/config", (req: Request, res: Response) => {
    // TODO: implement config persistence
    res.json({ success: true, config: req.body });
  });

  // Static files - serve from dist directory
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));

  // SPA fallback
  app.get("*", (_req: Request, res: Response) => {
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

  state.server = createServer(app);
  state.port = port;

  state.server.listen(port, () => {
    console.log(`[web-ui] Server running at http://localhost:${port}`);
  });

  return state.server;
}

/**
 * @summary Stop the HTTP server
 */
export function stopServer(): void {
  if (state.server) {
    state.server.close();
    state.server = null;
    console.log("[web-ui] Server stopped");
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
