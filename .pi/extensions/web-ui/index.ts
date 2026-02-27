/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/index.ts
 * @role Extension entry point for Web UI dashboard
 * @why Provide browser-based monitoring and configuration interface for all pi instances
 * @related server.ts, lib/instance-registry.ts, web/src/app.tsx
 * @public_api default (extension function)
 * @invariants Server lifecycle must be managed properly, instances must be registered
 * @side_effects Starts HTTP server, registers commands and flags, accesses shared storage, subscribes to pi events
 * @failure_modes Port conflict, build missing, permission denied
 *
 * @abdd.explain
 * @overview Registers /web-ui command and auto-starts server on session start (configurable via PI_WEB_UI_AUTO_START)
 * @what_it_does Starts Express server automatically on session start, registers instance, manages lifecycle, broadcasts SSE events
 * @why_it_exists Allows users to monitor all pi instances via browser with real-time updates without manual startup
 * @scope(in) ExtensionAPI, ExtensionContext, pi events, PI_WEB_UI_AUTO_START env var
 * @scope(out) HTTP server, shared storage files, SSE broadcasts
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  startServer,
  stopServer,
  isServerRunning,
  getServerPort,
  getContext,
  broadcastSSEEvent,
  addContextHistory,
  type SSEEvent,
} from "./server.js";
import {
  InstanceRegistry,
  ServerRegistry,
  ThemeStorage,
} from "./lib/instance-registry.js";

const DEFAULT_PORT = 3000;

export default function (pi: ExtensionAPI) {
  const registry = new InstanceRegistry(process.cwd());
  let registered = false;

  const ensureRegistered = (modelId?: string) => {
    if (modelId) {
      registry.setModel(modelId);
    }
    if (!registered) {
      registry.register();
      registered = true;
    }
  };

  const ensureUnregistered = () => {
    if (registered) {
      registry.unregister();
      registered = false;
    }
  };

  // Note: Port is configured via environment variable PI_WEB_UI_PORT or uses default 3000

  // Register command for manual control
  pi.registerCommand("web-ui", {
    description: "Start/stop Web UI dashboard (usage: /web-ui [start|stop|status])",

    getArgumentCompletions: (prefix: string) => {
      const commands = ["start", "stop", "status", "open"];
      const items = commands.map((c) => ({ value: c, label: c }));
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },

    handler: async (args: string, ctx) => {
      const subcommand = args.trim().toLowerCase();

      switch (subcommand) {
        case "stop":
          if (isServerRunning()) {
            stopServer();
            ensureUnregistered();
            ctx.ui.notify("Web UI stopped", "info");
          } else {
            ensureUnregistered();
            ctx.ui.notify("Web UI is not running", "warning");
          }
          break;

        case "status":
          const running = isServerRunning();
          const port = getServerPort();
          const instances = InstanceRegistry.getAll();
          ctx.ui.notify(
            running
              ? `Web UI running on port ${port} (${instances.length} instance(s))`
              : "Web UI is not running",
            "info"
          );
          break;

        case "open":
          if (!isServerRunning()) {
            ctx.ui.notify("Web UI is not running. Use /web-ui start first.", "warning");
            return;
          }
          const url = `http://localhost:${getServerPort()}`;
          ctx.ui.notify(`Web UI available at ${url}`, "info");
          break;

        case "start":
        default:
          ensureRegistered(ctx.model?.id);

          if (isServerRunning()) {
            ctx.ui.notify(`Web UI already running on port ${getServerPort()}`, "info");
            return;
          }

          const existingServer = ServerRegistry.isRunning();
          if (existingServer) {
            ctx.ui.notify(
              `Web UI already running on port ${existingServer.port} (pid: ${existingServer.pid})`,
              "info"
            );
            return;
          }

          const portNum = parseInt(process.env.PI_WEB_UI_PORT || "") || DEFAULT_PORT;
          try {
            startServer(portNum, pi, ctx);
            ctx.ui.notify(`Web UI started: http://localhost:${portNum}`, "info");
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Failed to start Web UI: ${message}`, "error");
          }
          break;
      }
    },
  });

  // Broadcast tool calls via SSE
  pi.on("tool_call", async (event, _ctx) => {
    if (!isServerRunning()) return;

    const toolEvent = event as { toolName: string; toolCallId: string };
    const sseEvent: SSEEvent = {
      type: "tool-call",
      data: {
        toolName: toolEvent.toolName,
        toolCallId: toolEvent.toolCallId,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
    broadcastSSEEvent(sseEvent);
  });

  // Broadcast turn end (LLM response) via SSE
  pi.on("turn_end", async (_event, ctx) => {
    if (!isServerRunning()) return;

    const contextUsage = ctx.getContextUsage();
    const sseEvent: SSEEvent = {
      type: "response",
      data: {
        contextUsage: contextUsage?.percent ?? 0,
        totalTokens: contextUsage?.tokens ?? 0,
        model: ctx.model?.id ?? "unknown",
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
    broadcastSSEEvent(sseEvent);

    // コンテキスト履歴を記録（概算: input 70%, output 30%）
    if (contextUsage?.tokens) {
      addContextHistory({
        timestamp: new Date().toISOString(),
        input: Math.round(contextUsage.tokens * 0.7),
        output: Math.round(contextUsage.tokens * 0.3),
      });
    }
  });

  // Broadcast context updates via SSE (on message_end)
  pi.on("message_end", async (_event, ctx) => {
    if (!isServerRunning()) return;

    const contextUsage = ctx.getContextUsage();
    const sseEvent: SSEEvent = {
      type: "status",
      data: {
        contextUsage: contextUsage?.percent ?? 0,
        totalTokens: contextUsage?.tokens ?? 0,
        model: ctx.model?.id ?? "unknown",
        cwd: ctx.cwd,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };
    broadcastSSEEvent(sseEvent);
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    ensureUnregistered();

    // Only stop server if this is the last instance
    setTimeout(() => {
      const remainingInstances = InstanceRegistry.getCount();

      if (remainingInstances === 0) {
        stopServer();
      }
    }, 500);
  });

  // Register tool for LLM to open browser
  pi.registerTool({
    name: "open_web_ui",
    label: "Open Web UI",
    description:
      "Open the Web UI dashboard in a browser. Returns the URL if server is running.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      // Check if server is running (either local or remote)
      const localRunning = isServerRunning();
      const existingServer = ServerRegistry.isRunning();

      if (!localRunning && !existingServer) {
        return {
          content: [
            {
              type: "text",
              text: "Web UI is not running. Start it with /web-ui command first.",
            },
          ],
          details: {},
        };
      }

      const port = localRunning ? getServerPort() : existingServer!.port;
      const url = `http://localhost:${port}`;

      return {
        content: [
          {
            type: "text",
            text: `Web UI is available at ${url}\n\nFeatures:\n- Dashboard: ${url}/\n- Instances: ${url}/instances\n- Theme: ${url}/theme`,
          },
        ],
        details: { url },
      };
    },
  });

  // Auto-start server on session start (can be disabled via PI_WEB_UI_AUTO_START=false)
  pi.on("session_start", async (_event, ctx) => {
    const autoStart = process.env.PI_WEB_UI_AUTO_START !== "false";

    if (!autoStart) {
      return;
    }

    // Check if already running (another instance may have started it)
    if (isServerRunning()) {
      ensureRegistered(ctx.model?.id);
      return;
    }

    const existingServer = ServerRegistry.isRunning();
    if (existingServer) {
      ensureRegistered(ctx.model?.id);
      return;
    }

    // Start the server
    const portNum = parseInt(process.env.PI_WEB_UI_PORT || "") || DEFAULT_PORT;
    try {
      ensureRegistered(ctx.model?.id);
      startServer(portNum, pi, ctx);
      ctx.ui.notify(`Web UI auto-started: http://localhost:${portNum}`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Web UI auto-start failed: ${message}`, "warning");
    }
  });
}
