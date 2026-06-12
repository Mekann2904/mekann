import { createServer, createConnection, type Server } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";

export interface ModelCatalogItem { provider: string; modelId: string; label: string; providerLabel: string; reasoning: boolean; supportedThinkingLevels: string[]; input: ("text" | "image")[]; source: "built-in" | "custom" | "runtime"; available: boolean; }
export interface ModelCatalogEndpoint { socketPath: string; token: string; close(): Promise<void>; }

export async function startModelCatalogServer(ctx: ExtensionContext): Promise<ModelCatalogEndpoint> {
  const dir = mkdtempSync(join(tmpdir(), "mekann-settings-"));
  const socketPath = join(dir, "models.sock");
  const token = randomBytes(16).toString("hex");
  const server: Server = createServer((socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      if (!buf.includes("\n")) return;
      const line = buf.slice(0, buf.indexOf("\n"));
      try {
        const req = JSON.parse(line) as { token?: string; op?: string };
        if (req.token !== token || req.op !== "models") throw new Error("unauthorized");
        socket.end(JSON.stringify({ ok: true, models: buildCatalog(ctx) }) + "\n");
      } catch (e) { socket.end(JSON.stringify({ ok: false, error: (e as Error).message }) + "\n"); }
    });
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  return { socketPath, token, close: () => new Promise((resolve) => server.close(() => { rmSync(dir, { recursive: true, force: true }); resolve(); })) };
}

function buildCatalog(ctx: ExtensionContext): ModelCatalogItem[] {
  return ctx.modelRegistry.getAvailable().map((m: any) => ({
    provider: m.provider,
    modelId: m.id,
    label: m.name ?? m.id,
    providerLabel: ctx.modelRegistry.getProviderDisplayName(m.provider),
    reasoning: !!m.reasoning,
    supportedThinkingLevels: getSupportedThinkingLevels(m).map(String),
    input: Array.isArray(m.input) ? m.input : ["text"],
    source: "runtime",
    available: true,
  }));
}

export async function fetchModelCatalog(socketPath?: string, token?: string): Promise<ModelCatalogItem[]> {
  if (!socketPath || !token) return [];
  return await new Promise((resolve) => {
    const socket = createConnection(socketPath);
    let buf = "";
    socket.on("connect", () => socket.write(JSON.stringify({ op: "models", token }) + "\n"));
    socket.on("data", (chunk) => { buf += chunk.toString("utf8"); });
    socket.on("error", () => resolve([]));
    socket.on("end", () => { try { const res = JSON.parse(buf.trim()); resolve(res.ok ? res.models : []); } catch { resolve([]); } });
  });
}
