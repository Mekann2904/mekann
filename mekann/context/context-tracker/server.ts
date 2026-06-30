import http from "node:http";
import type { AddressInfo } from "node:net";
import { state, type ContextMonitorSample } from "../context-control/state.js";
import type { ContextScope as ContextMonitorScope } from "../context-control/observation.js";
import { currentContextScope, scopedContextSamples } from "../context-control/query.js";
import { recordContextObservation as appendContextObservation } from "../context-control/store.js";
import { getToolSchemaSnapshot, recordToolSchemaCurrent } from "../context-control/tool-schemas.js";
import { getContextIntelligenceReport, recordContextDecision } from "../context-control/report.js";
import { getContextMonitorSnapshot } from "../context-control/snapshot.js";
import { readCacheEfficiencySummary, readCacheEfficiencySvg, renderCacheEfficiencyDashboard, renderDashboard, renderHome } from "../context-control/views/dashboard.js";

export { getContextIntelligenceReport } from "../context-control/report.js";
export { getContextMonitorSnapshot } from "../context-control/snapshot.js";

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body, null, 2));
}

function html(res: http.ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function svg(res: http.ServerResponse, body: string): void {
  res.writeHead(200, { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function scopedSamples(scope: ContextMonitorScope = currentContextScope()): ContextMonitorSample[] {
  return scopedContextSamples(scope);
}

function scopeFromQuery(url: URL): ContextMonitorScope {
  const fallback = currentContextScope();
  return {
    cwd: url.searchParams.get("cwd") ?? fallback.cwd,
    sessionId: url.searchParams.get("sessionId") ?? fallback.sessionId,
    mode: url.searchParams.get("scopeMode") === "include-global" ? "include-global" : "strict",
  } satisfies ContextMonitorScope;
}

// ─── request security helpers ───────────────────────────────────

function isAllowedHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

/**
 * Accept only loopback Host headers to mitigate DNS-rebinding attacks that would
 * let an attacker page issue requests to the local monitor server.
 */
function isAllowedHost(header: string): boolean {
  let hostname = header.trim();
  if (hostname.startsWith("[")) {
    // IPv6 literal, e.g. [::1]:4321
    const end = hostname.indexOf("]");
    hostname = end > 0 ? hostname.slice(1, end) : hostname.slice(1);
  } else {
    const colon = hostname.indexOf(":");
    if (colon > 0) hostname = hostname.slice(0, colon);
  }
  return isAllowedHostname(hostname);
}

/**
 * Accept only same-origin (loopback) Origin headers for write requests to mitigate
 * CSRF. Browser always sends Origin on cross-site POSTs.
 */
function isAllowedOrigin(header: string | undefined): boolean {
  if (!header) return false;
  try {
    return isAllowedHostname(new URL(header).hostname);
  } catch {
    return false;
  }
}

async function readRequestBody(req: http.IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk as Buffer);
    total += buffer.length;
    if (total > maxBytes) throw new Error(`request body exceeds ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length === 0) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export function recordContextMonitorSample(sample: Omit<ContextMonitorSample, "id" | "at"> & { at?: number }): ContextMonitorSample {
  return appendContextObservation({ cwd: sample.cwd, sessionId: sample.sessionId, at: sample.at, phase: sample.phase, summary: sample.summary });
}

export function recordToolSchema(name: string, schemaBytes: number): void {
  recordToolSchemaCurrent(name, schemaBytes);
}

export function recordCompaction(): void {
  state.compactionCount++;
  state.lastCompactionAt = Date.now();
}

export async function ensureContextMonitorServer(preferredPort = 0): Promise<{ port: number; url: string; reused: boolean }> {
  if (state.server?.listening && state.port) return { port: state.port, url: `http://127.0.0.1:${state.port}`, reused: true };

  state.server = http.createServer((req, res) => {
    void (async () => {
      // Mitigate DNS rebinding: only accept requests addressed to loopback hosts.
      if (!isAllowedHost(req.headers.host ?? "")) {
        return json(res, 403, { error: "forbidden_host" });
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const method = req.method ?? "GET";
      const scope = scopeFromQuery(url);

      // Write endpoint: POST-only + same-origin check (CSRF mitigation).
      if (url.pathname === "/llm/context-decision") {
        if (method !== "POST") {
          return json(res, 405, { error: "method_not_allowed", method });
        }
        if (!isAllowedOrigin(req.headers.origin)) {
          return json(res, 403, { error: "forbidden_origin" });
        }
        recordContextDecision(await readRequestBody(req));
        return json(res, 200, { ok: true });
      }

      // Every other endpoint is read-only; reject non-GET verbs so CSRF / rebinding
      // cannot trigger side effects through GET routes.
      if (method !== "GET") {
        return json(res, 405, { error: "method_not_allowed", method });
      }

      if (url.pathname === "/") return html(res, renderHome());
      if (url.pathname === "/dashboard") return html(res, renderDashboard(scope));
      if (url.pathname === "/cache-efficiency") return html(res, await renderCacheEfficiencyDashboard(scope));
      if (url.pathname === "/cache-efficiency/snapshot") return json(res, 200, await readCacheEfficiencySummary(scope));
      if (url.pathname.startsWith("/cache-efficiency/artifacts/")) {
        const name = decodeURIComponent(url.pathname.slice("/cache-efficiency/artifacts/".length));
        const body = await readCacheEfficiencySvg(name, scope);
        if (body !== null) return svg(res, body);
        return json(res, 404, { error: "not_found" });
      }
      if (url.pathname === "/health") return json(res, 200, { ok: true });
      if (url.pathname === "/snapshot") return json(res, 200, getContextMonitorSnapshot(scope));
      if (url.pathname === "/events") return json(res, 200, { scope, samples: scopedSamples(scope) });
      if (url.pathname === "/tools") {
        const toolSchemas = getToolSchemaSnapshot();
        return json(res, 200, { tools: toolSchemas.tools, totalBytes: toolSchemas.totalBytes });
      }
      if (url.pathname === "/llm/context-report") return json(res, 200, getContextIntelligenceReport(String(url.searchParams.get("action") ?? "report"), Number(url.searchParams.get("limit") ?? 20), scope));
      if (url.pathname === "/llm/context-health") return json(res, 200, getContextIntelligenceReport("health", 20, scope));
      if (url.pathname === "/llm/context-top-contributors") return json(res, 200, getContextIntelligenceReport("top_contributors", Number(url.searchParams.get("limit") ?? 20), scope));
      if (url.pathname === "/llm/context-timeline") return json(res, 200, getContextIntelligenceReport("timeline", Number(url.searchParams.get("limit") ?? 50), scope));
      if (url.pathname === "/llm/context-recommendations") return json(res, 200, getContextIntelligenceReport("recommendations", 20, scope));
      if (url.pathname === "/llm/context-budget") return json(res, 200, getContextIntelligenceReport("budget", 20, scope));
      if (url.pathname === "/llm/context-plan") return json(res, 200, getContextIntelligenceReport("budget", Number(url.searchParams.get("limit") ?? 20), scope));
      return json(res, 404, { error: "not_found", endpoints: ["/", "/dashboard", "/cache-efficiency", "/cache-efficiency/snapshot", "/health", "/snapshot", "/events", "/tools", "/llm/context-report", "/llm/context-plan", "/llm/context-recommendations"] });
    })().catch((error) => {
      // Never leak internal error detail to clients; surface only a stable category.
      const message = String(error?.message ?? "");
      if (message.includes("request body exceeds")) {
        return json(res, 413, { error: "payload_too_large" });
      }
      console.error("[context-tracker] internal error:", error);
      return json(res, 500, { error: "internal_error" });
    });
  });
  state.server.unref();

  await new Promise<void>((resolve, reject) => {
    state.server!.once("error", reject);
    state.server!.listen(preferredPort, "127.0.0.1", () => resolve());
  });
  state.port = (state.server.address() as AddressInfo).port;
  return { port: state.port, url: `http://127.0.0.1:${state.port}`, reused: false };
}
