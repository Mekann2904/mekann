import { describe, expect, it } from "vitest";
import {
  DYNAMIC_FRAGMENT_BUDGET_CHARS,
  DYNAMIC_TAIL_MAX_CHARS,
} from "./config.js";

describe("dynamic context limits (unified config)", () => {
  it("exposes a per-fragment render-side budget (個別フラグメント上限)", () => {
    // Was DYNAMIC_TOTAL_MAX_CHARS in render.ts. Value preserved (24_000).
    expect(DYNAMIC_FRAGMENT_BUDGET_CHARS).toBe(24_000);
  });

  it("exposes a whole-tail snapshot-side cap (動的末尾全体上限)", () => {
    // Was DYNAMIC_CONTEXT_MAX_CHARS in request-snapshot.ts. Value preserved (12_000).
    expect(DYNAMIC_TAIL_MAX_CHARS).toBe(12_000);
  });

  it("keeps the tail cap <= the fragment budget so the snapshot cap is authoritative", () => {
    // The two stages must not invert: the snapshot-side cap is the outer
    // boundary; the render-side budget only shapes per-fragment trimming.
    expect(DYNAMIC_TAIL_MAX_CHARS).toBeLessThanOrEqual(DYNAMIC_FRAGMENT_BUDGET_CHARS);
  });
});
