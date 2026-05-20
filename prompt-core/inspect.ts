import type { PromptFragment, PromptInspectionWarning } from "./types.js";
import { estimateTokens } from "./canonicalize.js";

const volatileWarningTerms = [/current time/i, /current date/i, /now\(\)/i, /Date\(/, /new Date/i, /latest search/i, /search result/i, /tool result/i, /diagnostics/i, /continuation/i];
const volatileValuePatterns = [/request[_ ]id\s*[:=]\s*\S+/i, /timestamp\s*[:=]\s*\S+/i, /tokens used\s*[:=]?\s*\d+/i, /time used\s*[:=]?\s*\d+/i, /remaining tokens\s*[:=]?\s*\d+/i];
export function containsVolatileSignal(text: string): boolean { return volatileValuePatterns.some((r) => r.test(text)) || volatileWarningTerms.some((r) => r.test(text)); }
function hasVolatileValuePattern(text: string): boolean { return volatileValuePatterns.some((r) => r.test(text)); }
function allowsPolicyReference(fragment: PromptFragment): boolean {
  return fragment.metadata?.volatileTermsArePolicyReferences === true && !hasVolatileValuePattern(fragment.content);
}
export function inspectFragments(fragments: PromptFragment[]): PromptInspectionWarning[] {
  const warnings: PromptInspectionWarning[] = [];
  for (const f of fragments) {
    if (f.enabled === false) continue;
    if (f.stability === "stable" && containsVolatileSignal(f.content) && !allowsPolicyReference(f)) {
      const error = hasVolatileValuePattern(f.content);
      warnings.push({ severity: error ? "error" : "warning", code: "VOLATILE_VALUE_IN_STABLE_FRAGMENT", message: `Stable fragment may contain volatile runtime state: ${f.id}`, fragmentId: f.id, source: f.source });
    }
    if (f.stability === "dynamic" && f.cacheIntent === "prefer_cache") warnings.push({ severity: "warning", code: "DYNAMIC_FRAGMENT_CACHE_INTENT", message: `Dynamic fragment should not prefer cache: ${f.id}`, fragmentId: f.id, source: f.source });
    if (f.kind === "unknown" && f.stability === "stable") warnings.push({ severity: "warning", code: "UNKNOWN_FRAGMENT_NOT_STABLE", message: `Unknown fragment should not be stable: ${f.id}`, fragmentId: f.id, source: f.source });
  }
  return warnings;
}
export function inspectStablePrefix(stablePrefixText: string): PromptInspectionWarning[] {
  return estimateTokens(stablePrefixText) < 1024 ? [{ severity: "info", code: "SHORT_STABLE_PREFIX", message: "Stable prefix is short; provider cache benefit may be limited." }] : [];
}
export function inspectFinalPayloadText(finalText: string): PromptInspectionWarning[] {
  const marker = "<!-- prompt-fragments:Stable extension instructions -->";
  const i = finalText.indexOf(marker);
  if (i <= 0) return [];
  const before = finalText.slice(Math.max(0, i - 4000), i);
  if (volatileValuePatterns.some((r) => r.test(before))) return [{ severity: "warning", code: "FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END", message: "Final payload appears to contain volatile runtime state before stable fragment section." }];
  return [];
}
