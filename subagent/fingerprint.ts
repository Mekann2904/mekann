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

export function safeRepoRelativePath(p: string): string | undefined {
  if (!p || p.includes("\0") || /^[A-Za-z]:[\\/]/.test(p) || path.isAbsolute(p)) return undefined;
  const normalized = path.posix.normalize(p.replace(/\\/g, "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) return undefined;
  if (normalized === ".git" || normalized.startsWith(".git/")) return undefined;
  if (normalized === ".pi" || normalized.startsWith(".pi/subagent-results/")) return undefined;
  return normalized;
}

export type ExtractTouchedPathsResult = { ok: true; paths: string[] } | { ok: false; reason: "unsafe_patch_path"; path: string };

export function extractTouchedPathsFromPatchStrict(patchText: string): ExtractTouchedPathsResult {
  const paths = new Set<string>();
  for (const line of patchText.split(/\r?\n/)) {
    if (!line.startsWith("--- ") && !line.startsWith("+++ ")) continue;
    const raw = line.slice(4).split(/\s+/)[0];
    if (raw === "/dev/null") continue;
    const cleaned = raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw;
    const safe = safeRepoRelativePath(cleaned);
    if (!safe) return { ok: false, reason: "unsafe_patch_path", path: cleaned };
    paths.add(safe);
  }
  return { ok: true, paths: [...paths].sort() };
}

export function extractTouchedPathsFromPatch(patchText: string): string[] {
  const extracted = extractTouchedPathsFromPatchStrict(patchText);
  return extracted.ok ? extracted.paths : [];
}

export function isNewFilePatch(filePath: string, patchText: string): boolean {
  const lines = patchText.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith("--- /dev/null") && lines[i + 1].startsWith("+++ ")) {
      const raw = lines[i + 1].slice(4).split(/\s+/)[0];
      const cleaned = raw.startsWith("b/") ? raw.slice(2) : raw;
      if (cleaned === filePath) return true;
    }
  }
  return false;
}

export function normalizePublicSurfaceDeltas(deltas: PublicSurfaceDelta[]): PublicSurfaceDelta[] {
  const byTarget = new Map<string, PublicSurfaceDelta[]>();
  for (const d of deltas) {
    const key = `${d.surface}:${d.name}`;
    byTarget.set(key, [...(byTarget.get(key) ?? []), d]);
  }
  const out: PublicSurfaceDelta[] = [];
  for (const group of byTarget.values()) {
    const add = group.find((d) => d.change === "add");
    const remove = group.find((d) => d.change === "remove");
    if (add && remove) {
      out.push({ surface: add.surface, name: add.name, change: "modify", compatibility: remove.compatibility === "breaking" ? "breaking" : "unknown" });
      for (const d of group) if (d.change !== "add" && d.change !== "remove") out.push(d);
    } else {
      out.push(...group);
    }
  }
  return out;
}

export function detectPublicSurfaceFromPatch(patchText: string): PublicSurfaceDelta[] {
  const seen = new Set<string>();
  const deltas: PublicSurfaceDelta[] = [];
  const add = (d: PublicSurfaceDelta) => { const k = `${d.surface}:${d.name}:${d.change}`; if (!seen.has(k)) { seen.add(k); deltas.push(d); } };
  const lines = patchText.split(/\r?\n/);
  let current = "";
  let deletedFile = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = safeRepoRelativePath(m?.[2] ?? "") ?? safeRepoRelativePath(m?.[1] ?? "") ?? "";
      deletedFile = false;
      continue;
    }
    if (line.startsWith("--- a/")) {
      current = safeRepoRelativePath(line.slice(6).split(/\s+/)[0]) ?? current;
      continue;
    }
    if (line.startsWith("+++ b/")) {
      current = safeRepoRelativePath(line.slice(6).split(/\s+/)[0]) ?? current;
      deletedFile = false;
      continue;
    }
    if (line.startsWith("+++ /dev/null")) { deletedFile = true; continue; }
    const rel = current;
    if (!rel) continue;
    if (/^(package\.json|tsconfig.*\.json)$/.test(path.basename(rel))) add({ surface: "config_schema", name: rel, change: deletedFile ? "remove" : "modify", compatibility: "unknown" });
    if (/migrations\//.test(rel) || /schema\.graphql$/.test(rel) || /openapi\./.test(rel) || /routes\//.test(rel)) add({ surface: rel.includes("graphql") ? "graphql_schema" : rel.includes("openapi") || rel.includes("routes/") ? "rest_api" : "database_schema", name: rel, change: deletedFile ? "remove" : "modify", compatibility: "unknown" });
    if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---") && /\.(tsx?|mts|cts)$/.test(rel)) {
      const m = line.slice(1).match(/export\s+(?:async\s+)?(function|class|interface|type|const|enum)\s+([A-Za-z0-9_$]+)/);
      if (m) add({ surface: "typescript_export", name: m[2], change: line.startsWith("+") ? "add" : "remove", compatibility: line.startsWith("+") ? "compatible" : "breaking" });
    }
  }
  return deltas;
}
