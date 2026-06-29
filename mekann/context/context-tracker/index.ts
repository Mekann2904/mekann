import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { featureConfig, featureValue } from "../../settings/featureConfig.js";
import { ensureContextMonitorServer, recordCompaction } from "./server.js";
import { recordContextObservation } from "../observations.js";
import type { ContextObservation, MessageBreakdownItem } from "../context-control/observation.js";

// ─── helpers ─────────────────────────────────────────────────────

function byteLen(value: unknown): number {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return 0; }
}

function countMessages(messages: unknown): { count: number; bytes: number } {
  if (!Array.isArray(messages)) return { count: 0, bytes: 0 };
  return { count: messages.length, bytes: byteLen(messages) };
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

// Best-effort browser opener. Resolution order (issue #171, IC-221):
//   1. explicit `browserCommand` setting (overridable for exotic setups)
//   2. platform default (open on macOS, cmd/start on Windows)
//   3. candidate list for Linux/WSL/minimal containers (xdg-open → wslview →
//      gio → x-www-browser → sensible-browser)
// The previous version caught only the synchronous spawn throw, so an ENOENT
// from a missing binary (minimal container) escaped as an unhandled 'error'
// event. We now probe with `command -v` and attach an 'error' handler too.
const URL_OPENER_CANDIDATES = ["xdg-open", "wslview", "gio", "x-www-browser", "sensible-browser"];

function commandAvailable(command: string): boolean {
  if (process.platform === "win32") {
    return spawnSync("where", [command], { stdio: "ignore" }).status === 0;
  }
  return spawnSync("sh", ["-c", `command -v "${command}" >/dev/null 2>&1`], { stdio: "ignore" }).status === 0;
}

function resolveOpenCommand(): { command: string; args: (url: string) => string[] } | undefined {
  const cfg = featureConfig("context-tracker");
  const override = typeof cfg.browserCommand === "string" ? cfg.browserCommand.trim() : "";
  if (override) {
    const [command, ...rest] = override.split(/\s+/).filter(Boolean);
    if (command) return { command, args: (url) => [...rest, url] };
  }
  const platform = process.platform;
  if (platform === "darwin") return { command: "open", args: (url) => [url] };
  if (platform === "win32") return { command: "cmd", args: (url) => ["/c", "start", "", url] };
  for (const candidate of URL_OPENER_CANDIDATES) {
    if (commandAvailable(candidate)) return { command: candidate, args: (url) => [url] };
  }
  return undefined;
}

function openUrl(url: string): { ok: true } | { ok: false; reason: string } {
  const resolved = resolveOpenCommand();
  if (!resolved) {
    return {
      ok: false,
      reason: "no URL opener found — set context-tracker.browserCommand or install xdg-open/wslview/gio",
    };
  }
  const child = spawn(resolved.command, resolved.args(url), { detached: true, stdio: "ignore" });
  // ENOENT is emitted asynchronously via 'error'; attach a handler so a missing
  // binary (e.g. an override pointing at nothing) never escapes unhandled.
  child.on("error", () => { /* best-effort convenience only */ });
  child.unref();
  return { ok: true };
}

function messageBreakdown(messages: unknown, limit = 20): MessageBreakdownItem[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message: any, index) => {
      const bytes = byteLen(message);
      return {
        index,
        role: String(message?.role ?? message?.type ?? "message"),
        source: shortSource(message),
        bytes,
        estimatedTokens: Math.ceil(bytes / 4),
      };
    })
    .sort((a, b) => Number(b.bytes) - Number(a.bytes))
    .slice(0, limit);
}

function systemPromptParts(options: any, systemPrompt: unknown): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [
    { name: "systemPromptTotal", bytes: byteLen(systemPrompt ?? "") },
  ];
  const contextFiles = Array.isArray(options?.contextFiles) ? options.contextFiles : [];
  for (const [index, file] of contextFiles.entries()) {
    parts.push({ name: `contextFile:${file?.path ?? index}`, bytes: byteLen(file?.content ?? file) });
  }
  const skills = Array.isArray(options?.skills) ? options.skills : [];
  parts.push({ name: "skillsIndex", bytes: byteLen(skills) });
  parts.push({ name: "toolSnippets", bytes: byteLen(options?.toolSnippets ?? []) });
  parts.push({ name: "promptGuidelines", bytes: byteLen(options?.promptGuidelines ?? []) });
  parts.push({ name: "appendSystemPrompt", bytes: byteLen(options?.appendSystemPrompt ?? "") });
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
        promptBytes: byteLen(event?.prompt ?? ""),
        systemPromptBytes: byteLen(event?.systemPrompt ?? ctx?.getSystemPrompt?.() ?? ""),
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
    publish({ phase: "provider_request", summary: { payloadBytes: byteLen(event?.payload) } }, ctx);
  });

  pi.on("tool_execution_end", async (event: any, ctx: any) => {
    publish({ phase: "tool_end", summary: {
      toolCallId: event?.toolCallId,
      toolName: event?.toolName,
      argsBytes: byteLen(event?.args),
      resultBytes: byteLen(event?.result),
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
      const opened = openUrl(serverUrl);
      const lines = [
        `Mekann Web UI: ${serverUrl}`,
        `Context Monitor: ${serverUrl}/dashboard`,
        `Cache Efficiency: ${serverUrl}/cache-efficiency`,
        `JSON endpoints: ${serverUrl}/snapshot ${serverUrl}/events ${serverUrl}/tools ${serverUrl}/cache-efficiency/snapshot`,
      ];
      if (!opened.ok) lines.push(`(ブラウザを自動起動できませんでした: ${opened.reason})`);
      ctx.ui.notify(lines.join("\n"), opened.ok ? "info" : "warn");
    },
  });
}
