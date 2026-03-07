/**
 * path: .pi/extensions/background-process.ts
 * role: 長時間実行プロセス用の start/list/stop/log ツールを pi に追加する
 * why: サーバーなどを pi 終了後も残して、後続検証を続けられるようにするため
 * related: .pi/lib/background-processes.ts, .pi/lib/process-utils.ts, tests/unit/extensions/background-process.test.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import {
  isLongRunningCommand,
  listBackgroundProcesses,
  loadBackgroundProcessConfig,
  readBackgroundProcessLog,
  saveBackgroundProcessConfig,
  startBackgroundProcess,
  stopAllBackgroundProcesses,
  stopBackgroundProcess,
  stopBackgroundProcessesForOwner,
  type BackgroundProcessRecord,
} from "../lib/background-processes.js";

let isInitialized = false;

function buildBackgroundProcessGuidance(): string {
  return [
    "## Background Process Usage",
    "",
    "長時間動かし続けるプロセスは、通常の bash ではなく background_process_* ツールを優先して使うこと。",
    "",
    "使うべきケース:",
    "- 開発サーバー",
    "- APIサーバー",
    "- mock server",
    "- worker",
    "- watcher",
    "- 後続テストやブラウザ確認まで生かしておく必要があるプロセス",
    "",
    "基本手順:",
    "1. background_process_config(action=\"update\", enabled=true) で有効化する",
    "2. background_process_start(...) で起動する",
    "3. 可能なら readyPort または readyPattern を指定する",
    "4. 続きの作業を進める",
    "5. 必要に応じて background_process_log / background_process_list を使う",
    "6. 不要になったら background_process_stop または background_process_stop_all を使う",
    "",
    "判断ルール:",
    "- コマンドがすぐ終わるなら通常の bash でよい",
    "- 起動後に別作業を続けるなら background_process_start を使う",
    "- npm run dev, vite, next dev, rails s, tsc --watch のような常駐系は background を優先する",
  ].join("\n");
}

function formatRecord(record: BackgroundProcessRecord): string {
  return [
    `id: ${record.id}`,
    `label: ${record.label}`,
    `status: ${record.status}`,
    `pid: ${record.pid}`,
    `cwd: ${record.cwd}`,
    `command: ${record.command}`,
    `log: ${record.logPath}`,
    `keep_alive_on_shutdown: ${record.keepAliveOnShutdown}`,
    `readiness: ${record.readinessStatus}`,
    `ready_port: ${record.readyPort ?? "-"}`,
    `ready_pattern: ${record.readyPattern ?? "-"}`,
    `started_at: ${record.startedAt}`,
    `updated_at: ${record.updatedAt}`,
  ].join("\n");
}

function formatList(records: BackgroundProcessRecord[]): string {
  if (records.length === 0) {
    return "No background processes.";
  }

  return records
    .map((record) => {
      return [
        `[${record.status}] ${record.label}`,
        `  id=${record.id}`,
        `  pid=${record.pid}`,
        `  cwd=${record.cwd}`,
        `  command=${record.command}`,
        `  readiness=${record.readinessStatus}`,
      ].join("\n");
    })
    .join("\n\n");
}

export default function registerBackgroundProcessExtension(pi: ExtensionAPI) {
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  pi.on("before_agent_start", async (event, _ctx) => {
    const systemPrompt = event.systemPrompt ?? "";
    const marker = "<!-- BACKGROUND_PROCESS_GUIDANCE -->";
    if (systemPrompt.includes(marker)) {
      return;
    }

    return {
      systemPrompt: `${systemPrompt}\n\n${marker}\n${buildBackgroundProcessGuidance()}`.trim(),
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    const toolName = String(event?.toolName ?? "").toLowerCase();
    if (toolName !== "bash") {
      return;
    }

    const config = loadBackgroundProcessConfig(ctx?.cwd ?? process.cwd());
    if (!config.enabled) {
      return;
    }

    const input = typeof event?.input === "object" && event?.input !== null
      ? event.input as Record<string, unknown>
      : {};
    const command = typeof input.command === "string" ? input.command : "";

    if (!isLongRunningCommand(command)) {
      return;
    }

    return {
      block: true,
      reason: `Long-running command detected. Use background_process_start instead: ${command}`,
    };
  });

  pi.registerTool({
    name: "background_process_start",
    label: "Background Process Start",
    description: "Start a detached process that can continue after the current pi session exits.",
    parameters: Type.Object({
      command: Type.String({ description: "Shell command to run in the background" }),
      cwd: Type.Optional(Type.String({ description: "Working directory override" })),
      label: Type.Optional(Type.String({ description: "Short label for display" })),
      logFile: Type.Optional(Type.String({ description: "Optional log file path relative to cwd" })),
      keepAliveOnShutdown: Type.Optional(Type.Boolean({
        description: "Keep process alive after this pi session shuts down (default: true)",
      })),
      startupTimeoutMs: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 300000,
        description: "How long to wait for readiness before returning",
      })),
      readyPattern: Type.Optional(Type.String({
        description: "Regex string to search for in the log before marking ready",
      })),
      readyPort: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 65535,
        description: "TCP port to probe on localhost before marking ready",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await startBackgroundProcess({
        command: params.command,
        cwd: params.cwd ?? ctx.cwd,
        label: params.label,
        logFile: params.logFile,
        keepAliveOnShutdown: params.keepAliveOnShutdown,
        startupTimeoutMs: params.startupTimeoutMs,
        readyPattern: params.readyPattern,
        readyPort: params.readyPort,
      });

      return {
        content: [{
          type: "text",
          text: result.ready
            ? `Background process started and is ready.\n\n${formatRecord(result.record)}`
            : `Background process started, but readiness was not confirmed yet.\n\n${formatRecord(result.record)}`,
        }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "background_process_list",
    label: "Background Process List",
    description: "List tracked background processes for the current workspace.",
    parameters: Type.Object({
      cwd: Type.Optional(Type.String({ description: "Working directory override" })),
      includeExited: Type.Optional(Type.Boolean({
        description: "Include exited and stopped processes (default: true)",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const records = listBackgroundProcesses({
        cwd: params.cwd ?? ctx.cwd,
        includeExited: params.includeExited,
      });

      return {
        content: [{ type: "text", text: formatList(records) }],
        details: { count: records.length, records },
      };
    },
  });

  pi.registerTool({
    name: "background_process_stop",
    label: "Background Process Stop",
    description: "Stop a tracked background process by id.",
    parameters: Type.Object({
      id: Type.String({ description: "Background process id" }),
      cwd: Type.Optional(Type.String({ description: "Working directory override" })),
      force: Type.Optional(Type.Boolean({
        description: "Use SIGKILL immediately instead of graceful shutdown",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await stopBackgroundProcess({
        id: params.id,
        cwd: params.cwd ?? ctx.cwd,
        force: params.force,
      });

      if (!result) {
        return {
          content: [{ type: "text", text: `Background process not found: ${params.id}` }],
          details: {},
        };
      }

      return {
        content: [{
          type: "text",
          text: `Background process stopped with ${result.signal}.\n\n${formatRecord(result.record)}`,
        }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "background_process_log",
    label: "Background Process Log",
    description: "Read the tail of a tracked background process log file.",
    parameters: Type.Object({
      id: Type.String({ description: "Background process id" }),
      cwd: Type.Optional(Type.String({ description: "Working directory override" })),
      maxLines: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 500,
        description: "How many trailing log lines to return",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const log = readBackgroundProcessLog({
        id: params.id,
        cwd: params.cwd ?? ctx.cwd,
        maxLines: params.maxLines,
      });

      if (!log) {
        return {
          content: [{ type: "text", text: `Background process not found: ${params.id}` }],
          details: {},
        };
      }

      return {
        content: [{
          type: "text",
          text: `${formatRecord(log.record)}\n\n[log]\n${log.content}`,
        }],
        details: log,
      };
    },
  });

  pi.registerTool({
    name: "background_process_stop_all",
    label: "Background Process Stop All",
    description: "Stop all running background processes in the current workspace.",
    parameters: Type.Object({
      cwd: Type.Optional(Type.String({ description: "Working directory override" })),
      includePersistent: Type.Optional(Type.Boolean({
        description: "Also stop processes marked to survive session shutdown",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const stopped = await stopAllBackgroundProcesses({
        cwd: params.cwd ?? ctx.cwd,
        includePersistent: params.includePersistent,
      });

      return {
        content: [{ type: "text", text: stopped.length > 0 ? formatList(stopped) : "No running background processes were stopped." }],
        details: { count: stopped.length, stopped },
      };
    },
  });

  pi.registerTool({
    name: "background_process_config",
    label: "Background Process Config",
    description: "Show or update background process settings for this workspace.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("show"),
        Type.Literal("update"),
      ]),
      cwd: Type.Optional(Type.String({ description: "Working directory override" })),
      enabled: Type.Optional(Type.Boolean({ description: "Enable background process support" })),
      maxRunningProcesses: Type.Optional(Type.Integer({
        minimum: 1,
        maximum: 32,
        description: "Maximum concurrent running background processes",
      })),
      defaultKeepAliveOnShutdown: Type.Optional(Type.Boolean({
        description: "Default keepAliveOnShutdown value for new processes",
      })),
      defaultStartupTimeoutMs: Type.Optional(Type.Integer({
        minimum: 0,
        maximum: 300000,
        description: "Default readiness wait timeout",
      })),
      cleanupOnSessionShutdown: Type.Optional(Type.Boolean({
        description: "Whether shutdown cleanup is active for owned non-persistent processes",
      })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = params.cwd ?? ctx.cwd;
      if (params.action === "update") {
        const updated = saveBackgroundProcessConfig(cwd, {
          enabled: params.enabled,
          maxRunningProcesses: params.maxRunningProcesses,
          defaultKeepAliveOnShutdown: params.defaultKeepAliveOnShutdown,
          defaultStartupTimeoutMs: params.defaultStartupTimeoutMs,
          cleanupOnSessionShutdown: params.cleanupOnSessionShutdown,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(updated, null, 2) }],
          details: updated,
        };
      }

      const current = loadBackgroundProcessConfig(cwd);
      return {
        content: [{ type: "text", text: JSON.stringify(current, null, 2) }],
        details: current,
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const config = loadBackgroundProcessConfig(ctx.cwd);
    const running = listBackgroundProcesses({
      cwd: ctx.cwd,
      includeExited: false,
    });

    if (!config.enabled) {
      return;
    }

    if (running.length > 0) {
      ctx.ui?.notify?.(
        `${running.length} background process(es) active in this workspace`,
        "info",
      );
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    const config = loadBackgroundProcessConfig(ctx?.cwd ?? process.cwd());
    if (!config.cleanupOnSessionShutdown) {
      isInitialized = false;
      return;
    }

    await stopBackgroundProcessesForOwner({
      cwd: ctx?.cwd ?? process.cwd(),
      ownerPid: process.pid,
    });
    isInitialized = false;
  });
}
