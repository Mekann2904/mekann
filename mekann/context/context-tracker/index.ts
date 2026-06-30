import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { safeByteLen } from "../../utils/safe-bytes/index.js";
import { ensureContextMonitorServer, recordCompaction } from "./server.js";
import { recordContextObservation } from "../observations.js";
import type { ContextObservation, MessageBreakdownItem } from "../context-control/observation.js";
import { estimateTokens } from "../../core/prompt-core/index.js";

// ─── helpers ─────────────────────────────────────────────────────

function countMessages(messages: unknown): { count: number; bytes: number } {
  if (!Array.isArray(messages)) return { count: 0, bytes: 0 };
  return { count: messages.length, bytes: safeByteLen(messages) };
}

function shortSource(message: any): string {
  const role = String(message?.role ?? message?.type ?? "message");
  const tool = message?.toolName ?? message?.name;
  const custom = message?.customType;
  if (tool) return `${role}:${tool}`;
  if (custom) return `${role}:${custom}`;
  const text = typeof message?.content === "string" ? message.content : JSON.stringify(message?.content ?? "");
  return `${role}:${text.slice(0, 80).replace(/\s+/g, " ")}`;
}

function openUrl(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Best-effort convenience only; the command notification still exposes the URL.
  }
}

function messageBreakdown(messages: unknown, limit = 20): MessageBreakdownItem[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message: any, index) => {
      const bytes = safeByteLen(message);
      const text = typeof message === "string" ? message : (typeof message === "object" && message !== null ? JSON.stringify(message) : String(message ?? ""));
      return {
        index,
        role: String(message?.role ?? message?.type ?? "message"),
        source: shortSource(message),
        bytes,
        // Byte-aware estimate: weight by character class (ASCII ~4 chars/token,
        // CJK/emoji ~1 token/char) so Japanese/CJK-heavy messages are no longer
        // underestimated ~4x by a flat `bytes / 4` (issue #157 / IC-220).
        estimatedTokens: estimateTokens(text),
      };
    })
    .sort((a, b) => Number(b.bytes) - Number(a.bytes))
    .slice(0, limit);
}

function systemPromptParts(options: any, systemPrompt: unknown): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [
    { name: "systemPromptTotal", bytes: safeByteLen(systemPrompt ?? "") },
  ];
  const contextFiles = Array.isArray(options?.contextFiles) ? options.contextFiles : [];
  for (const [index, file] of contextFiles.entries()) {
    parts.push({ name: `contextFile:${file?.path ?? index}`, bytes: safeByteLen(file?.content ?? file) });
  }
  const skills = Array.isArray(options?.skills) ? options.skills : [];
  parts.push({ name: "skillsIndex", bytes: safeByteLen(skills) });
  parts.push({ name: "toolSnippets", bytes: safeByteLen(options?.toolSnippets ?? []) });
  parts.push({ name: "promptGuidelines", bytes: safeByteLen(options?.promptGuidelines ?? []) });
  parts.push({ name: "appendSystemPrompt", bytes: safeByteLen(options?.appendSystemPrompt ?? "") });
  return parts.filter((p) => Number(p.bytes) > 0).sort((a, b) => Number(b.bytes) - Number(a.bytes));
}

function selectedToolNames(options: any): string[] {
  const selected = options?.selectedTools;
  if (!Array.isArray(selected)) return [];
  return selected.map((t: any) => String(t?.name ?? t)).filter(Boolean);
}

function hashStrings(values: string[]): string {
  return createHash("sha256").update(values.join("\n"), "utf8").digest("hex");
}

function isSorted(values: string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) <= 0);
}

// ─── extension ───────────────────────────────────────────────────

export default function contextTrackerExtension(pi: ExtensionAPI): void {
  if (featureValue("context-tracker", "enabled") === false) return;

  const cfg = featureConfig("context-tracker");
  const port = Number(cfg.port ?? 0) || 0;
  const autoStartServer = cfg.autoStartServer === true;
  let serverUrl = "";

  async function startServer(ctx?: any): Promise<void> {
    const server = await ensureContextMonitorServer(port);
    serverUrl = server.url;
  }

  function publish(input: ContextObservation, ctx: any): void {
    const usage = ctx?.getContextUsage?.();
    void recordContextObservation({
      ...input,
      cwd: ctx?.cwd,
      sessionId: ctx?.sessionId,
      summary: { ...input.summary, contextTokens: usage?.tokens, contextPercent: usage?.percent },
    });
  }

  // ─── lifecycle hooks ─────────────────────────────────────────

  pi.on("session_start", async (_event: any, ctx: any) => {
    if (autoStartServer) await startServer(ctx);
    publish({ phase: "session_start", summary: {} }, ctx);
  });

  pi.on("session_shutdown", async () => {
    // server stays up; samples persist across sessions via globalThis
  });

  const agentStartInspectionEvent = "before_" + "agent_start";
  pi.on(agentStartInspectionEvent as any, async (event: any, ctx: any) => {
    const toolNames = selectedToolNames(event?.systemPromptOptions);
    publish({
      phase: "prompt",
      summary: {
        promptBytes: safeByteLen(event?.prompt ?? ""),
        systemPromptBytes: safeByteLen(event?.systemPrompt ?? ctx?.getSystemPrompt?.() ?? ""),
        systemPromptParts: systemPromptParts(event?.systemPromptOptions, event?.systemPrompt ?? ctx?.getSystemPrompt?.() ?? ""),
        toolCount: toolNames.length,
        tools: toolNames,
        toolSetHash: hashStrings([...toolNames].sort()),
        toolOrderHash: hashStrings(toolNames),
        toolOrderStable: isSorted(toolNames),
        contextFileCount: Array.isArray(event?.systemPromptOptions?.contextFiles) ? event.systemPromptOptions.contextFiles.length : undefined,
        skillCount: Array.isArray(event?.systemPromptOptions?.skills) ? event.systemPromptOptions.skills.length : undefined,
      },
    }, ctx);
  });

  pi.on("context", async (event: any, ctx: any) => {
    const m = countMessages(event?.messages);
    publish({ phase: "context", summary: {
      messageCount: m.count,
      messageBytes: m.bytes,
      messageBreakdown: messageBreakdown(event?.messages),
    } }, ctx);
  });

  pi.on("before_provider_request", async (event: any, ctx: any) => {
    publish({ phase: "provider_request", summary: { payloadBytes: safeByteLen(event?.payload) } }, ctx);
  });

  pi.on("tool_execution_end", async (event: any, ctx: any) => {
    publish({ phase: "tool_end", summary: {
      toolCallId: event?.toolCallId,
      toolName: event?.toolName,
      argsBytes: safeByteLen(event?.args),
      resultBytes: safeByteLen(event?.result),
      isError: Boolean(event?.isError),
    } }, ctx);
  });

  pi.on("session_compact" as any, async (_event: any, _ctx: any) => {
    recordCompaction();
  });

  // ─── command ──────────────────────────────────────────────────

  pi.registerCommand("web-ui", {
    description: "Show Mekann Web UI local server URL",
    async handler(_args: string | undefined, ctx: any) {
      await startServer(ctx);
      openUrl(serverUrl);
      ctx.ui.notify(`Mekann Web UI: ${serverUrl}\nContext Monitor: ${serverUrl}/dashboard\nCache Efficiency: ${serverUrl}/cache-efficiency\nJSON endpoints: ${serverUrl}/snapshot ${serverUrl}/events ${serverUrl}/tools ${serverUrl}/cache-efficiency/snapshot`, "info");
    },
  });
}
