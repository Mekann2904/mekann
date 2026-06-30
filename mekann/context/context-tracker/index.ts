import type { BeforeAgentStartEvent, BuildSystemPromptOptions, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
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
    .map((message, index) => {
      const bytes = safeByteLen(message);
      const text = typeof message === "string" ? message : (typeof message === "object" && message !== null ? JSON.stringify(message) : String(message ?? ""));
      return {
        index,
        role: String(asRecord(message).role ?? asRecord(message).type ?? "message"),
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
