/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/index.ts
 * @role Extension entry point for Web UI dashboard
 * @why Provide browser-based monitoring and configuration interface for all pi instances
 * @related standalone-server.ts, lib/instance-registry.ts, web/src/app.tsx
 * @public_api default (extension function), getServerUrl
 * @invariants Server lifecycle must be managed properly, instances must be registered
 * @side_effects Starts detached child process server, registers commands and flags, accesses shared storage, subscribes to pi events
 * @failure_modes Port conflict, build missing, permission denied
 *
 * @abdd.explain
 * @overview Registers /web-ui command and auto-starts detached server process on session start
 * @what_it_does Starts standalone server as detached child process, registers instance, manages lifecycle
 * @why_it_exists Allows web UI to persist across pi instance restarts - server survives parent termination
 * @scope(in) ExtensionAPI, ExtensionContext, pi events, PI_WEB_UI_AUTO_START env var
 * @scope(out) Child process server, shared storage files
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { exec, spawn, type ChildProcess } from "child_process";
import { promisify } from "util";
import { join } from "path";
import {
  InstanceRegistry,
  ServerRegistry,
  ContextHistoryStorage,
} from "./lib/instance-registry.js";
import {
  startServer as startApiServer,
  isApiServerRunning,
} from "../server.js";

const execAsync = promisify(exec);

const DEFAULT_PORT = 3000;

/**
 * コンテキスト履歴ストレージのインスタンス
 */
let contextHistoryStorage: ContextHistoryStorage | null = null;

/**
 * スタンドアロンサーバーをdetached子プロセスとして起動
 * @param port - ポート番号
 * @returns 子プロセス
 */
function startStandaloneServerProcess(port: number): ChildProcess | null {
  // サーバースクリプトのパスを取得
  const serverScript = join(import.meta.dirname, "standalone-server.ts");

  // tsxを使用してTypeScriptを直接実行
  const child = spawn("npx", ["tsx", serverScript], {
    detached: true, // 親プロセスが終了しても生き残る
    stdio: "ignore", // 親プロセスと標準入出力を共有しない
    env: {
      ...process.env,
      PI_WEB_UI_PORT: String(port),
    },
  });

  // 親プロセスの参照を解除（親が待機しないように）
  child.unref();

  child.on("error", (error) => {
    console.error(`[web-ui] Failed to start standalone server: ${error}`);
  });

  return child;
}

/**
 * スタンドアロンサーバーを停止（SIGTERMを送信）
 */
function stopStandaloneServerProcess(): void {
  const serverInfo = ServerRegistry.isRunning();
  if (serverInfo) {
    try {
      process.kill(serverInfo.pid, "SIGTERM");
      console.log(`[web-ui] Sent SIGTERM to standalone server (PID: ${serverInfo.pid})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[web-ui] Failed to stop standalone server: ${message}`);
    }
  }
}

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

/**
 * サーバーのURLを取得する
 * @summary サーバーURL取得
 * @description レジストリからサーバー情報を取得し、URLを返す
 * サーバーが実行中でない場合はデフォルトポートのURLを返す（TOCTOU問題を回避）
 * @returns サーバーのURL（常に有効なURLを返す）
 */
function getServerUrl(): string {
  const registryServer = ServerRegistry.isRunning();
  if (registryServer) {
    return `http://localhost:${registryServer.port}`;
  }
  // Fallback to default port - avoids TOCTOU issues by always returning a valid URL
  return `http://localhost:${DEFAULT_PORT}`;
}

export default function (pi: ExtensionAPI) {
  const registry = new InstanceRegistry(process.cwd());

  const ensureRegistered = (modelId?: string) => {
    if (modelId) {
      registry.setModel(modelId);
    }
    // Always call register() - it handles re-registration safely
    // (clears existing heartbeat interval before re-registering)
    registry.register();
  };

  const ensureUnregistered = () => {
    // Always call unregister() - it's idempotent
    registry.unregister();
  };

  // コンテキスト履歴ストレージを初期化
  if (!contextHistoryStorage) {
    contextHistoryStorage = new ContextHistoryStorage(process.pid);
  }

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
          // 強制停止（スタンドアロンサーバーを停止）
          stopStandaloneServerProcess();
          ensureUnregistered();
          ctx.ui.notify("Web UI stopped", "info");
          break;

        case "status":
          const existingServer = ServerRegistry.isRunning();
          const instances = InstanceRegistry.getAll();
          ctx.ui.notify(
            existingServer
              ? `Web UI running on port ${existingServer.port} (${instances.length} instance(s), PID: ${existingServer.pid})`
              : "Web UI is not running",
            "info"
          );
          break;

        case "open":
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

          const existingServerForStart = ServerRegistry.isRunning();
          if (existingServerForStart) {
            ctx.ui.notify(
              `Web UI already running on port ${existingServerForStart.port} (PID: ${existingServerForStart.pid})`,
              "info"
            );
            // 既に起動している場合もブラウザを開く
            await openBrowser(`http://localhost:${existingServerForStart.port}`);
            return;
          }

          const portNum = parseInt(process.env.PI_WEB_UI_PORT || "") || DEFAULT_PORT;
          try {
            startStandaloneServerProcess(portNum);
            ctx.ui.notify(`Web UI started: http://localhost:${portNum}`, "info");
            // サーバー起動後にブラウザを開く（少し待機してサーバーの準備を待つ）
            setTimeout(async () => {
              await openBrowser(`http://localhost:${portNum}`);
            }, 1000);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.ui.notify(`Failed to start Web UI: ${message}`, "error");
          }
          break;
      }
    },
  });

  // コンテキスト履歴を記録（turn_endイベント）
  pi.on("turn_end", async (_event, ctx) => {
    const contextUsage = ctx.getContextUsage();

    if (contextUsage?.tokens && contextHistoryStorage) {
      // Use actual input/output counts if available, otherwise approximate
      const input = ('inputTokens' in contextUsage && typeof contextUsage.inputTokens === 'number')
        ? contextUsage.inputTokens
        : Math.round(contextUsage.tokens * 0.7);
      const output = ('outputTokens' in contextUsage && typeof contextUsage.outputTokens === 'number')
        ? contextUsage.outputTokens
        : Math.round(contextUsage.tokens * 0.3);

      contextHistoryStorage.add({
        timestamp: new Date().toISOString(),
        input,
        output,
      });
    }
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    ensureUnregistered();

    // Only stop server if this is the last instance
    // Wait a bit for other instances to register their heartbeat
    setTimeout(() => {
      const remainingInstances = InstanceRegistry.getCount();

      if (remainingInstances === 0) {
        console.log("[web-ui] No remaining instances, stopping standalone server...");
        stopStandaloneServerProcess();
      } else {
        console.log(`[web-ui] ${remainingInstances} instance(s) still running, keeping server alive`);
      }
    }, 1000); // 1秒待機（他のインスタンスのハートビートを待つ）
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

      // Check if server is running
      const existingServer = ServerRegistry.isRunning();

      if (!existingServer) {
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

      const port = existingServer.port;
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

    // Register this instance first
    ensureRegistered(ctx.model?.id);

    // Check if already running (another instance may have started it)
    const existingServer = ServerRegistry.isRunning();
    if (existingServer) {
      console.log(`[web-ui] Server already running on port ${existingServer.port} (PID: ${existingServer.pid})`);
      return;
    }

    // Start the standalone server as a detached child process
    const portNum = parseInt(process.env.PI_WEB_UI_PORT || "") || DEFAULT_PORT;
    try {
      startStandaloneServerProcess(portNum);
      ctx.ui.notify(`Web UI auto-started: http://localhost:${portNum}`, "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Web UI auto-start failed: ${message}`, "warning");
    }
  });
}
