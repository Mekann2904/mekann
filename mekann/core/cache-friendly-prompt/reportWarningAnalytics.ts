import type { ParsedLog, WarningBreakdownEntry, WarningCategoryBreakdown } from "./reportTypes.js";

/** How many warning code/severity rows to surface in the report Top-N tables. */
export const WARNING_BREAKDOWN_TOP_N = 15;

/**
 * Warning codes whose origin is a Mekann cacheable fragment (content volatility,
 * ordering, or placement relative to the stable section), as opposed to
 * base-system-prompt noise or the dynamic tail. Keep in sync with the codes
 * emitted by prompt-core; codes not listed here intentionally fall into "other"
 * (dynamic/size signals such as DYNAMIC_CONTEXT_TRUNCATED,
 * DYNAMIC_FRAGMENT_CACHE_INTENT, SHORT_STABLE_PREFIX).
 */
export const FRAGMENT_WARNING_CODES = new Set<string>([
  "VOLATILE_VALUE_IN_STABLE_FRAGMENT",
  "VOLATILE_VALUE_IN_SEMI_STABLE_FRAGMENT",
  "FINAL_PAYLOAD_VOLATILE_BEFORE_STABLE_END",
  "CACHEABLE_FRAGMENT_ORDER_TIE",
  "STABLE_FRAGMENT_AVOID_CACHE_CONFLICT",
  "UNKNOWN_FRAGMENT_NOT_STABLE",
]);

/** Classify a warning code by its origin so base-system noise can be separated from fragment noise. */
export function categorizeWarningCode(code: string | undefined): "baseSystem" | "fragment" | "other" {
  const c = code ?? "";
  if (c.startsWith("BASE_SYSTEM_")) return "baseSystem";
  if (FRAGMENT_WARNING_CODES.has(c)) return "fragment";
  return "other";
}

/** Aggregate warnings by code+severity and return the Top N entries (highest count first). */
export function computeWarningBreakdown(rows: ParsedLog[], topN = WARNING_BREAKDOWN_TOP_N): WarningBreakdownEntry[] {
  const counts = new Map<string, WarningBreakdownEntry>();
  for (const row of rows) {
    for (const w of row.warnings ?? []) {
      const key = `${w.code ?? "UNKNOWN"}\u0000${w.severity ?? "unknown"}`;
      const cur = counts.get(key);
      if (cur) cur.count++;
      else counts.set(key, { code: w.code ?? "UNKNOWN", severity: w.severity ?? "unknown", count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity)).slice(0, topN);
}

/** Split warning occurrences into base-system / fragment / other buckets. */
export function computeWarningCategories(rows: ParsedLog[]): WarningCategoryBreakdown {
  const breakdown: WarningCategoryBreakdown = { baseSystem: 0, fragment: 0, other: 0, total: 0 };
  for (const row of rows) {
    for (const w of row.warnings ?? []) {
      breakdown[categorizeWarningCode(w.code)]++;
      breakdown.total++;
    }
  }
  return breakdown;
}
