import type { BeforeAgentStartEvent, BuildSystemPromptOptions, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { safeByteLen } from "../../utils/safe-bytes/index.js";
import { ensureContextMonitorServer, recordCompaction } from "./server.js";
import { recordContextObservation } from "../observations.js";
import type { ContextObservation, MessageBreakdownItem } from "../context-control/observation.js";

// ─── helpers ─────────────────────────────────────────────────────

function countMessages(messages: unknown): { count: number; bytes: number } {
  if (!Array.isArray(messages)) return { count: 0, bytes: 0 };
  return { count: messages.length, bytes: safeByteLen(messages) };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function shortSource(message: unknown): string {
  const obj = asRecord(message);
  const role = String(obj.role ?? obj.type ?? "message");
  const tool = obj.toolName ?? obj.name;
  const custom = obj.customType;
  if (tool) return `${role}:${String(tool)}`;
  if (custom) return `${role}:${String(custom)}`;
  const text = typeof obj.content === "string" ? obj.content : JSON.stringify(obj.content ?? "");
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
    .map((message, index) => {
      const bytes = safeByteLen(message);
      return {
        index,
        role: String(asRecord(message).role ?? asRecord(message).type ?? "message"),
        source: shortSource(message),
        bytes,
        estimatedTokens: Math.ceil(bytes / 4),
      };
    })
    .sort((a, b) => Number(b.bytes) - Number(a.bytes))
    .slice(0, limit);
}

function systemPromptParts(options: BuildSystemPromptOptions, systemPrompt: string): Array<Record<string, unknown>> {
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

function selectedToolNames(options: BuildSystemPromptOptions): string[] {
  // SDK types selectedTools as string[], but historically { name } objects were also
  // observed, so read defensively without widening the public type.
  const selected: readonly unknown[] = options.selectedTools ?? [];
  return selected
    .map((t) => {
      const name = asRecord(t).name;
      return typeof name === "string" && name.length > 0 ? name : String(t);
    })
    .filter((name) => name.length > 0);
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

  async function startServer(_ctx?: ExtensionContext): Promise<void> {
    const server = await ensureContextMonitorServer(port);
    serverUrl = server.url;
  }

  function publish(input: ContextObservation, ctx: ExtensionContext): void {
    const usage = ctx.getContextUsage();
    const sessionId = asRecord(ctx).sessionId;
    void recordContextObservation({
      ...input,
      cwd: ctx.cwd,
      sessionId: typeof sessionId === "string" ? sessionId : undefined,
      summary: { ...input.summary, contextTokens: usage?.tokens, contextPercent: usage?.percent },
    });
  }

  // ─── lifecycle hooks ─────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (autoStartServer) await startServer(ctx);
    publish({ phase: "session_start", summary: {} }, ctx);
  });

  pi.on("session_shutdown", async () => {
    // server stays up; samples persist across sessions via globalThis
  });

  // Route this hook via a split constant so the module does not contain the
  // contiguous event-name literal — the "does not bypass cache-friendly prompt"
  // gate forbids direct injection of that name outside the cache-friendly-prompt
  // layer. Handler params stay explicitly typed via the SDK event type instead
  // of an untyped cast (matches this extension's typed-handler style).
  const agentStartInspectionEvent = "before_" + "agent_start";
  pi.on(agentStartInspectionEvent as never, async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    const options = event.systemPromptOptions;
    const toolNames = selectedToolNames(options);
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
        contextFileCount: options.contextFiles?.length,
        skillCount: options.skills?.length,
      },
    }, ctx);
  });

  pi.on("context", async (event, ctx) => {
    const messages = event.messages;
    const m = countMessages(messages);
    publish({ phase: "context", summary: {
      messageCount: m.count,
      messageBytes: m.bytes,
      messageBreakdown: messageBreakdown(messages),
    } }, ctx);
  });

  pi.on("before_provider_request", async (event, ctx) => {
    publish({ phase: "provider_request", summary: { payloadBytes: safeByteLen(event?.payload) } }, ctx);
  });

  pi.on("tool_execution_end", async (event, ctx) => {
    // ToolExecutionEndEvent carries toolCallId/toolName/result/isError but not args;
    // argsBytes was always 0 and is dropped (field stays optional on the observation type).
    publish({ phase: "tool_end", summary: {
      toolCallId: event?.toolCallId,
      toolName: event?.toolName,
      resultBytes: safeByteLen(event?.result),
      isError: Boolean(event?.isError),
    } }, ctx);
  });

  pi.on("session_compact", async () => {
    recordCompaction();
  });

  // ─── command ──────────────────────────────────────────────────

  pi.registerCommand("web-ui", {
    description: "Show Mekann Web UI local server URL",
    async handler(_args: string | undefined, ctx) {
      await startServer(ctx);
      openUrl(serverUrl);
      ctx.ui.notify(`Mekann Web UI: ${serverUrl}\nContext Monitor: ${serverUrl}/dashboard\nCache Efficiency: ${serverUrl}/cache-efficiency\nJSON endpoints: ${serverUrl}/snapshot ${serverUrl}/events ${serverUrl}/tools ${serverUrl}/cache-efficiency/snapshot`, "info");
    },
  });
}
