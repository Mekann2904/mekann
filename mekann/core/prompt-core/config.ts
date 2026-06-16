/**
 * config.ts — Shared sizing configuration for prompt-core / cache-friendly-prompt.
 *
 * Dynamic context is bounded in two stages. Both constants live here so the
 * relationship is explicit and the cache-friendly-prompt report can attribute
 * truncation to the right stage instead of leaving "which limit wins" implicit.
 *
 * - `DYNAMIC_FRAGMENT_BUDGET_CHARS` ("個別フラグメント上限"): shared budget across
 *   all dynamic fragments rendered into the "Dynamic turn context" section.
 *   Applied per-fragment at render time by `limitDynamicFragments` in render.ts.
 *
 * - `DYNAMIC_TAIL_MAX_CHARS` ("動的末尾全体上限"): hard cap on the whole dynamic
 *   tail just before it is injected into a request. Applied at snapshot time by
 *   `truncateDynamicContext` in request-snapshot.ts.
 *
 * The tail cap must stay `<=` the fragment budget so the snapshot-side cap is the
 * authoritative outer boundary and the render-side budget only shapes per-fragment
 * trimming within that envelope.
 */
export const DYNAMIC_FRAGMENT_BUDGET_CHARS = 24_000;
export const DYNAMIC_TAIL_MAX_CHARS = 12_000;
