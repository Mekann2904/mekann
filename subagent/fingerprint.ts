import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FileFingerprint, PublicSurfaceDelta } from "./types.js";

export async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return `sha256:${createHash("sha256").update(buf).digest("hex")}`;
}

export async function computeFileFingerprints(cwd: string, paths: string[]): Promise<FileFingerprint[]> {
  const out: FileFingerprint[] = [];
  for (const p of paths) out.push({ path: p, hash: await sha256File(path.resolve(cwd, p)) });
  return out;
}

export async function checkBaseFileHashes(cwd: string, files: FileFingerprint[]): Promise<{ ok: true } | { ok: false; path: string; expected: string; actual?: string }> {
  for (const f of files) {
    try {
      const actual = await sha256File(path.resolve(cwd, f.path));
      if (actual !== f.hash) return { ok: false, path: f.path, expected: f.hash, actual };
    } catch { return { ok: false, path: f.path, expected: f.hash }; }
  }
  return { ok: true };
}

export function detectPublicSurfaceFromPatch(patchText: string): PublicSurfaceDelta[] {
  const deltas: PublicSurfaceDelta[] = [];
  const lines = patchText.split(/\r?\n/);
  let current = "";
  for (const line of lines) {
    if (line.startsWith("+++ b/")) current = line.slice(6);
    const rel = current;
    if (/^(package\.json|tsconfig.*\.json)$/.test(path.basename(rel))) deltas.push({ surface: "config_schema", name: rel, change: "modify", compatibility: "unknown" });
    if (/migrations\//.test(rel) || /schema\.graphql$/.test(rel) || /openapi\./.test(rel) || /routes\//.test(rel)) deltas.push({ surface: rel.includes("graphql") ? "graphql_schema" : rel.includes("openapi") || rel.includes("routes/") ? "rest_api" : "database_schema", name: rel, change: "modify", compatibility: "unknown" });
    if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---") && /\.(tsx?|mts|cts)$/.test(rel)) {
      const m = line.slice(1).match(/export\s+(?:async\s+)?(function|class|interface|type|const|enum)\s+([A-Za-z0-9_$]+)/);
      if (m) deltas.push({ surface: "typescript_export", name: m[2], change: line.startsWith("+") ? "add" : "remove", compatibility: line.startsWith("+") ? "compatible" : "breaking" });
    }
  }
  return deltas;
}
