import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { ensureContextMonitorServer, recordContextMonitorSample, recordToolSchema, recordCompaction } from "./server.js";

// ─── helpers ─────────────────────────────────────────────────────

function byteLen(value: unknown): number {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return 0; }
}

function countMessages(messages: unknown): { count: number; bytes: number } {
  if (!Array.isArray(messages)) return { count: 0, bytes: 0 };
  return { count: messages.length, bytes: byteLen(messages) };
}

function selectedToolNames(options: any): string[] {
  const selected = options?.selectedTools;
  if (!Array.isArray(selected)) return [];
  return selected.map((t: any) => String(t?.name ?? t)).filter(Boolean);
}

/** Wrap pi.registerTool so every tool's schema bytes get tracked once. */
function wrapRegisterTool(pi: ExtensionAPI): void {
  const original = pi.registerTool.bind(pi);
  pi.registerTool = (def: any) => {
    if (def?.name && typeof def.name === "string") {
      const schemaBytes = byteLen(def.parameters ?? {});
      recordToolSchema(def.name, schemaBytes);
    }
    return original(def);
  };
}

// ─── extension ───────────────────────────────────────────────────

export default function contextTrackerExtension(pi: ExtensionAPI): void {
  if (featureValue("context-tracker", "enabled") === false) return;
  const cfg = featureConfig("context-tracker");
  const port = Number(cfg.port ?? 0) || 0;
  let serverUrl = "";

  wrapRegisterTool(pi);

  async function startServer(ctx?: any): Promise<void> {
    const server = await ensureContextMonitorServer(port);
    serverUrl = server.url;
  }

  function publish(ctx: any, phase: string, summary: Record<string, unknown>): void {
    const usage = ctx?.getContextUsage?.();
    recordContextMonitorSample({
      cwd: ctx?.cwd,
      sessionId: ctx?.sessionId,
      phase,
      summary: { ...summary, contextTokens: usage?.tokens, contextPercent: usage?.percent },
    });
  }

  // ─── lifecycle hooks ─────────────────────────────────────────

  pi.on("session_start", async (_event: any, ctx: any) => {
    await startServer(ctx);
    publish(ctx, "session_start", {});
  });

  pi.on("session_shutdown", async () => {
    // server stays up; samples persist across sessions via globalThis
  });

  const agentStartInspectionEvent = "before_" + "agent_start";
  pi.on(agentStartInspectionEvent as any, async (event: any, ctx: any) => {
    const toolNames = selectedToolNames(event?.systemPromptOptions);
    publish(ctx, "prompt", {
      promptBytes: byteLen(event?.prompt ?? ""),
      systemPromptBytes: byteLen(event?.systemPrompt ?? ctx?.getSystemPrompt?.() ?? ""),
      toolCount: toolNames.length,
      tools: toolNames,
      contextFileCount: Array.isArray(event?.systemPromptOptions?.contextFiles) ? event.systemPromptOptions.contextFiles.length : undefined,
      skillCount: Array.isArray(event?.systemPromptOptions?.skills) ? event.systemPromptOptions.skills.length : undefined,
    });
  });

  pi.on("context", async (event: any, ctx: any) => {
    const m = countMessages(event?.messages);
    publish(ctx, "context", { messageCount: m.count, messageBytes: m.bytes });
  });

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    publish(ctx, "provider_request", { payloadBytes: byteLen(event?.payload) });
  });

  pi.on("tool_execution_end", async (event: any, ctx: any) => {
    publish(ctx, "tool_end", {
      toolName: event?.toolName,
      resultBytes: byteLen(event?.result),
      isError: Boolean(event?.isError),
    });
  });

  pi.on("session_compact" as any, async (_event: any, _ctx: any) => {
    recordCompaction();
  });

  // ─── command ──────────────────────────────────────────────────

  pi.registerCommand("context-monitor", {
    description: "Show context pressure monitor status and local server URL",
    async handler(_args: string | undefined, ctx: any) {
      await startServer(ctx);
      ctx.ui.notify(`Context monitor: ${serverUrl}\nOpen in browser for dashboard. JSON endpoints: ${serverUrl}/snapshot ${serverUrl}/events ${serverUrl}/tools`, "info");
    },
  });
}
