import type { PromptFragment, PromptInspectionWarning } from "./types.js";
import { estimateTokens } from "./canonicalize.js";
import { isVolatileRuntimeLine } from "./volatile.js";

const volatileWarningTerms = [
  /current time/i,
  /current date/i,
  /now\(\)/i,
  /Date\(/,
  /new Date/i,
  /latest search/i,
  /search result/i,
  /tool result/i,
  /diagnostics/i,
  /continuation/i,
  /git status/i,
  /open files?/i,
  /current file/i,
  /recent (tool|command|search|context)/i,
];
const volatileValuePatterns = [
  /request[_ -]?id\s*[:=]\s*\S+/i,
  /session[_ -]?id\s*[:=]\s*\S+/i,
  /conversation[_ -]?id\s*[:=]\s*\S+/i,
  /run[_ -]?id\s*[:=]\s*\S+/i,
  /timestamp\s*[:=]\s*\S+/i,
  /tokens used\s*[:=]?\s*\d+/i,
  /time used\s*[:=]?\s*\d+/i,
  /remaining tokens\s*[:=]?\s*\d+/i,
  /token budget\s*[:=]?\s*\d+/i,
  /cwd\s*[:=]\s*\S+/i,
  /working directory\s*[:=]\s*\S+/i,
  /\/Users\/[^\s)]+/,
  /\/tmp\/[^\s)]+/,
];
export function containsVolatileSignal(text: string): boolean { return volatileValuePatterns.some((r) => r.test(text)) || volatileWarningTerms.some((r) => r.test(text)); }
function hasVolatileValuePattern(text: string): boolean { return volatileValuePatterns.some((r) => r.test(text)); }
function allowsPolicyReference(fragment: PromptFragment): boolean {
  return fragment.metadata?.volatileTermsArePolicyReferences === true && !hasVolatileValuePattern(fragment.content);
}
function orderingKey(fragment: PromptFragment): string {
  return `${fragment.stability}:${fragment.priority}:${fragment.source}:${fragment.kind}:${fragment.id}`;
}

export function inspectFragmentOrdering(fragments: PromptFragment[]): PromptInspectionWarning[] {
  const warnings: PromptInspectionWarning[] = [];
  const seen = new Map<string, PromptFragment>();
  for (const f of fragments) {
    if (f.enabled === false || f.stability === "dynamic") continue;
    const key = orderingKey(f);
    const prev = seen.get(key);
    if (prev) {
      warnings.push({ severity: "warning", code: "CACHEABLE_FRAGMENT_ORDER_TIE", message: `Cacheable fragments share the same deterministic ordering key; render order falls back to provider input order: ${prev.source}/${prev.id} and ${f.source}/${f.id}`, fragmentId: f.id, source: f.source });
    } else {
      seen.set(key, f);
    }
  }
  return warnings;
}

export function inspectFragments(fragments: PromptFragment[]): PromptInspectionWarning[] {
  const warnings: PromptInspectionWarning[] = [];
  for (const f of fragments) {
    if (f.enabled === false) continue;
    if ((f.stability === "stable" || f.stability === "semi_stable") && containsVolatileSignal(f.content) && !allowsPolicyReference(f)) {
      const error = f.stability === "stable" && hasVolatileValuePattern(f.content);
      warnings.push({ severity: error ? "error" : "warning", code: f.stability === "stable" ? "VOLATILE_VALUE_IN_STABLE_FRAGMENT" : "VOLATILE_VALUE_IN_SEMI_STABLE_FRAGMENT", message: `${f.stability === "stable" ? "Stable" : "Semi-stable"} fragment may contain volatile runtime state: ${f.id}`, fragmentId: f.id, source: f.source });
    }
    if (f.stability === "stable" && f.cacheIntent === "avoid_cache") warnings.push({ severity: "error", code: "STABLE_FRAGMENT_AVOID_CACHE_CONFLICT", message: `Stable fragment cannot avoid cache: ${f.id}`, fragmentId: f.id, source: f.source });
    if (f.stability === "dynamic" && f.cacheIntent === "prefer_cache") warnings.push({ severity: "warning", code: "DYNAMIC_FRAGMENT_CACHE_INTENT", message: `Dynamic fragment should not prefer cache: ${f.id}`, fragmentId: f.id, source: f.source });
    if (f.kind === "unknown" && f.stability === "stable") warnings.push({ severity: "warning", code: "UNKNOWN_FRAGMENT_NOT_STABLE", message: `Unknown fragment should not be stable: ${f.id}`, fragmentId: f.id, source: f.source });
  }
  return warnings;
}
export function inspectStablePrefix(stablePrefixText: string): PromptInspectionWarning[] {
  return estimateTokens(stablePrefixText) < 1024 ? [{ severity: "info", code: "SHORT_STABLE_PREFIX", message: "Stable prefix is short; provider cache benefit may be limited." }] : [];
}

export function inspectBaseSystemPrompt(baseSystemText: string): PromptInspectionWarning[] {
  const warnings: PromptInspectionWarning[] = [];
  if (!baseSystemText.trim()) return warnings;
  // Per-line volatile runtime detection shares the SAME source as the extraction
  // layer (splitVolatileRuntimeBlock), so any line warned here is also removed
  // from the cacheable base prefix. Broad prose detection stays below.
  const seenVolatileLines = new Set<string>();
  for (const line of baseSystemText.split(/\n/)) {
    if (!isVolatileRuntimeLine(line)) continue;
    const compact = line.trim();
    if (seenVolatileLines.has(compact)) continue;
    seenVolatileLines.add(compact);
    warnings.push({ severity: "warning", code: "BASE_SYSTEM_VOLATILE_RUNTIME_LINE", message: `Base system prompt contains a volatile runtime line that should be moved to the dynamic tail: ${JSON.stringify(compact.slice(0, 120))}` });
  }
  // For the base system prompt, broad volatile terms such as "tool result" or
  // "git status" often appear in stable policy prose. Precise volatile runtime
  // lines are handled above via the shared extraction source, and concrete
  // volatile values (paths, token counts, ids) are still flagged here. Avoid an
  // always-on info warning for mere policy references.
  if (hasVolatileValuePattern(baseSystemText)) warnings.push({ severity: "warning", code: "BASE_SYSTEM_VOLATILE_SIGNAL", message: "Base system prompt contains volatile runtime-like state before cache-friendly fragments." });
  if (/\/Users\/[^\s)<>]+|\/tmp\/[^\s)<>]+/.test(baseSystemText)) warnings.push({ severity: "info", code: "BASE_SYSTEM_ABSOLUTE_PATH", message: "Base system prompt contains absolute paths; consider moving path-heavy runtime context behind cacheable fragments." });
  if (/<available_skills>[\s\S]*?<\/available_skills>/.test(baseSystemText)) warnings.push({ severity: "info", code: "BASE_SYSTEM_AVAILABLE_SKILLS_BLOCK", message: "Base system prompt contains available skills metadata before cache-friendly fragments." });
  return warnings;
}
export function inspectFinalPayloadText(finalText: string, contextLabel?: string): PromptInspectionWarning[] {
  const marker = "<!-- prompt-fragments:Stable extension instructions -->";
  const i = finalText.indexOf(marker);
  if (i <= 0) return [];
  const before = finalText.slice(Math.max(0, i - 4000), i);
  const matched = volatileValuePatterns.find((r) => r.test(before));
  if (!matched) return [];
  const compactSnippet = before.replace(/\s+/g, " ").trim().slice(-220);
  const location = contextLabel ? ` in ${contextLabel}` : "";
  return [{ severity: "warning", code: "FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END", message: `Final payload appears to contain volatile runtime state before stable fragment section${location}; pattern=${matched.source}; snippet=${JSON.stringify(compactSnippet)}` }];
}
