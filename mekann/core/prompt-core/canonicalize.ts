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
/**
 * True if a code point is "high-density" for tokenization: CJK ideographs,
 * kana, hangul, fullwidth forms, and the main emoji/symbol planes. Modern
 * tokenizers split these at roughly 1 token per character, unlike ASCII
 * (~4 chars/token), so a flat `length / 4` badly underestimates Japanese/CJK
 * prompts and suppresses cache-efficiency warnings.
 */
function isHighDensityCodePoint(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303f) || // CJK radicals / Kangxi / CJK symbols & punctuation
    (code >= 0x3040 && code <= 0x33ff) || // Hiragana, Katakana, CJK symbols
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Unified Ideographs Extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xa000 && code <= 0xa4cf) || // Yi syllables/radicals
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK Compatibility Forms
    (code >= 0xff00 && code <= 0xffef) || // Halfwidth & Fullwidth Forms
    (code >= 0x1f000 && code <= 0x1faff) || // Emoji & pictographic symbols
    (code >= 0x20000 && code <= 0x2fffd) // CJK Unified Ideographs Extensions B-F
  );
}

/** Provider-agnostic estimate only; not a tokenizer. Weights by character
 * class so CJK / emoji prompts are not underestimated ~4-8x (ASCII ~4
 * chars/token, CJK/emoji ~1 token/char, other scripts ~2 chars/token). */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  let tokens = 0;
  // for..of iterates by code point, so supplementary emoji (surrogate pairs)
  // are counted as a single character.
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0x7f) tokens += 0.25;
    else if (isHighDensityCodePoint(code)) tokens += 1;
    else tokens += 0.5;
  }
  return Math.ceil(tokens);
}
