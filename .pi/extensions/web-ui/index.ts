/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/index.ts
 * @role Extension entry point for Web UI dashboard
 * @why Provide browser-based monitoring and configuration interface for all pi instances
 * @related server.ts, lib/instance-registry.ts, web/src/app.tsx
 * @public_api default (extension function), getServerUrl
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
import { exec } from "child_process";
import { promisify } from "util";
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
import {
  startServer as startApiServer,
  isApiServerRunning,
} from "../server.js";

const execAsync = promisify(exec);

/**
 * 規定のブラウザでURLを開く
 */
const openBrowser = async (url: string): Promise<boolean> => {
  const platform = process.platform;
  let command: string;

  switch (platform) {
    case "darwin":
      command = `open "${url}"`;
      break;
    case "win32":
      command = `start "" "${url}"`;
      break;
    default:
      // Linux and others
      command = `xdg-open "${url}"`;
  }

  try {
    await execAsync(command);
    return true;
  } catch (error) {
    console.error(`[web-ui] Failed to open browser: ${error}`);
    return false;
  }
};

const DEFAULT_PORT = 3000;

/**
 * サーバーのURLを取得する
 * @summary サーバーURL取得
 * @description ローカルサーバーまたはレジストリからサーバー情報を取得し、URLを返す
 * サーバーが実行中でない場合はデフォルトポートのURLを返す（TOCTOU問題を回避）
 * @returns サーバーのURL（常に有効なURLを返す）
 */
function getServerUrl(): string {
  // Check local server first
  if (isServerRunning()) {
    return `http://localhost:${getServerPort()}`;
  }
  // Then check registry
  const registryServer = ServerRegistry.isRunning();
  if (registryServer) {
    return `http://localhost:${registryServer.port}`;
  }
  // Fallback to default port - avoids TOCTOU issues by always returning a valid URL
  return `http://localhost:${DEFAULT_PORT}`;
}

export default function (pi: ExtensionAPI) {
  const registry = new InstanceRegistry(process.cwd());
  let registered = false;

  const ensureRegistered = (modelId?: string) => {
    if (modelId) {
      registry.setModel(modelId);
    }
    // Always call register() - it handles re-registration safely
    // (clears existing heartbeat interval before re-registering)
    registry.register();
    registered = true;
  };

  const ensureUnregistered = () => {
    // Always call unregister() - it's idempotent
    registry.unregister();
    registered = false;
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
          // getServerUrl() always returns a valid URL (fallback to default port if not running)
          const serverUrl = getServerUrl();
          const opened = await openBrowser(serverUrl);
          if (opened) {
            ctx.ui.notify(`Opening Web UI: ${serverUrl}`, "info");
          } else {
            ctx.ui.notify(`Web UI available at ${serverUrl} (could not open browser automatically)`, "warning");
          }
          break;

        case "start":
        default:
          ensureRegistered(ctx.model?.id);

          if (isServerRunning()) {
            const runningPort = getServerPort();
            ctx.ui.notify(`Web UI already running on port ${runningPort}`, "info");
            // 既に起動している場合もブラウザを開く
            await openBrowser(`http://localhost:${runningPort}`);
            return;
          }

          const existingServer = ServerRegistry.isRunning();
          if (existingServer) {
            ctx.ui.notify(
              `Web UI already running on port ${existingServer.port} (pid: ${existingServer.pid})`,
              "info"
            );
            // 既に起動している場合もブラウザを開く
            await openBrowser(`http://localhost:${existingServer.port}`);
            return;
          }

          const portNum = parseInt(process.env.PI_WEB_UI_PORT || "") || DEFAULT_PORT;
          try {
            startServer(portNum, pi, ctx);
            ctx.ui.notify(`Web UI started: http://localhost:${portNum}`, "info");
            // サーバー起動後にブラウザを開く
            await openBrowser(`http://localhost:${portNum}`);
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

    // コンテキスト履歴を記録
    if (contextUsage?.tokens) {
      // Use actual input/output counts if available, otherwise approximate
      const input = ('inputTokens' in contextUsage && typeof contextUsage.inputTokens === 'number')
        ? contextUsage.inputTokens
        : Math.round(contextUsage.tokens * 0.7);
      const output = ('outputTokens' in contextUsage && typeof contextUsage.outputTokens === 'number')
        ? contextUsage.outputTokens
        : Math.round(contextUsage.tokens * 0.3);

      addContextHistory({
        timestamp: new Date().toISOString(),
        input,
        output,
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
      // Auto-start Task API server if not running
      if (!isApiServerRunning()) {
        try {
          const apiPort = parseInt(process.env.PI_API_PORT || "") || 3456;
          await startApiServer(apiPort);
        } catch (error) {
          // Log but don't fail - Web UI can still work without task API
          console.error("[Web UI] Failed to auto-start Task API:", error);
        }
      }

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

      // ブラウザを開く
      const opened = await openBrowser(url);

      return {
        content: [
          {
            type: "text",
            text: opened
              ? `Opening Web UI in browser: ${url}\n\nFeatures:\n- Dashboard: ${url}/\n- Instances: ${url}/instances\n- Theme: ${url}/theme`
              : `Web UI is available at ${url}\n\nFeatures:\n- Dashboard: ${url}/\n- Instances: ${url}/instances\n- Theme: ${url}/theme\n\n(Could not open browser automatically)`,
          },
        ],
        details: { url, browserOpened: opened },
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
