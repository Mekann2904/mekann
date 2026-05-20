import type { PromptCacheIntent, PromptFragment, PromptStability } from "./types.js";

export function canonicalizeText(text: string): string {
  let out = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+$/g, "")).join("\n");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out ? `${out}\n` : "";
}

function stableValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value instanceof Date) return "[Date]";
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const v = stableValue(obj[key]);
      if (v !== undefined) result[key] = v;
    }
    return result;
  }
  return value;
}
export function canonicalizeJson(value: unknown): string { return JSON.stringify(stableValue(value), null, 2); }

function defaultIntent(stability: PromptStability): PromptCacheIntent {
  if (stability === "stable") return "prefer_cache";
  if (stability === "semi_stable") return "neutral";
  return "avoid_cache";
}
export function normalizeFragment(fragment: PromptFragment): PromptFragment { return { ...fragment, content: canonicalizeText(fragment.content), cacheIntent: fragment.cacheIntent ?? defaultIntent(fragment.stability) }; }
const stabilityRank: Record<PromptStability, number> = { stable: 0, semi_stable: 1, dynamic: 2 };
export function sortFragments(fragments: PromptFragment[]): PromptFragment[] {
  return fragments.map((f, i) => ({ f, i })).sort((a, b) =>
    stabilityRank[a.f.stability] - stabilityRank[b.f.stability] || a.f.priority - b.f.priority || a.f.source.localeCompare(b.f.source) || a.f.kind.localeCompare(b.f.kind) || a.f.id.localeCompare(b.f.id) || a.i - b.i,
  ).map((x) => x.f);
}
/** Provider-agnostic estimate only; not a tokenizer. */
export function estimateTokens(text: string): number { return Math.ceil(text.length / 4); }
