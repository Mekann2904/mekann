import type { ParsedLog } from "./reportTypes.js";

/**
 * Dynamic truncation detection (render-side vs snapshot/tail-side).
 *
 * Dynamic context can be truncated in two stages, each with its own limit
 * (see prompt-core/config.ts):
 *   - render-side (`DYNAMIC_FRAGMENT_BUDGET_CHARS`): per-fragment trimming
 *     inside the "Dynamic turn context" section, emitted as a
 *     `DYNAMIC_CONTEXT_TRUNCATED` warning that CARRIES a `fragmentId`.
 *   - snapshot/tail-side (`DYNAMIC_TAIL_MAX_CHARS`): hard cap on the whole tail
 *     just before injection, recorded via the `dynamicContextTruncated` flag
 *     (and a matching fragmentId-less `DYNAMIC_CONTEXT_TRUNCATED` warning).
 *
 * These predicates let the report capture BOTH stages so "which limit won" is
 * no longer implicit. Peer module to {@link ./reportWarningAnalytics.ts}.
 */

/** A row whose dynamic tail was truncated at snapshot/injection time. */
export function hasDynamicTailTruncation(row: ParsedLog): boolean {
  return row.dynamicContextTruncated === true;
}

/** A row whose dynamic fragments were trimmed at render time (warning carries a fragmentId). */
export function hasDynamicFragmentTruncation(row: ParsedLog): boolean {
  return (row.warnings ?? []).some(
    (w) => w.code === "DYNAMIC_CONTEXT_TRUNCATED" && w.fragmentId,
  );
}

/** A row truncated at either dynamic stage. */
export function hasDynamicTruncation(row: ParsedLog): boolean {
  return hasDynamicTailTruncation(row) || hasDynamicFragmentTruncation(row);
}

/** Human-readable stage label for the §7 table (`render`, `tail`, `render + tail`, or `—`). */
export function dynamicTruncationStage(row: ParsedLog): string {
  const render = hasDynamicFragmentTruncation(row);
  const tail = hasDynamicTailTruncation(row);
  if (render && tail) return "render + tail";
  if (render) return "render";
  if (tail) return "tail";
  return "—";
}
