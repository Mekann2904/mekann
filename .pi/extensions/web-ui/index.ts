/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/index.ts
 * @role Extension entry point for Web UI dashboard
 * @why Provide browser-based monitoring and configuration interface
 * @related server.ts, web/src/app.tsx
 * @public_api default (extension function)
 * @invariants Server lifecycle must be managed properly
 * @side_effects Starts HTTP server, registers commands and flags
 * @failure_modes Port conflict, build missing
 *
 * @abdd.explain
 * @overview Registers /web-ui command and --web-ui flag for dashboard access
 * @what_it_does Starts Express server on demand or automatically with flag
 * @why_it_exists Allows users to monitor pi state via browser
 * @scope(in) ExtensionAPI, ExtensionContext
 * @scope(out) HTTP server, browser notifications
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  startServer,
  stopServer,
  isServerRunning,
  getServerPort,
} from "./server.js";

export default function (pi: ExtensionAPI) {
  // Register CLI flag for auto-start
  pi.registerFlag("--web-ui", {
    description: "Auto-start Web UI dashboard on session start",
    type: "boolean",
    default: false,
  });

  // Register command for manual start/stop
  pi.registerCommand("web-ui", {
    description: "Start/stop Web UI dashboard (usage: /web-ui [port])",

    getArgumentCompletions: (prefix: string) => {
      const ports = ["3000", "3001", "8080"];
      const items = ports.map((p) => ({ value: p, label: p }));
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },

    handler: async (args: string, ctx) => {
      if (isServerRunning()) {
        stopServer();
        ctx.ui.notify(`Web UI stopped`, "info");
        return;
      }

      const port = parseInt(args) || 3000;

      try {
        startServer(port, pi, ctx);
        ctx.ui.notify(
          `Web UI started: http://localhost:${port}`,
          "success"
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to start Web UI: ${message}`, "error");
      }
    },
  });

  // Auto-start if flag is set
  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("--web-ui")) {
      const port = 3000;
      try {
        startServer(port, pi, ctx);
        ctx.ui.notify(`Web UI auto-started: http://localhost:${port}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Web UI auto-start failed: ${message}`, "warning");
      }
    }
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    stopServer();
  });

  // Register tool for LLM to open browser
  pi.registerTool({
    name: "open_web_ui",
    label: "Open Web UI",
    description:
      "Open the Web UI dashboard in a browser. Returns the URL if server is running.",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute() {
      if (!isServerRunning()) {
        return {
          content: [
            {
              type: "text",
              text: "Web UI is not running. Start it with /web-ui command first.",
            },
          ],
        };
      }

      const url = `http://localhost:${getServerPort()}`;
      return {
        content: [
          {
            type: "text",
            text: `Web UI is available at ${url}`,
          },
        ],
        details: { url },
      };
    },
  });
}
