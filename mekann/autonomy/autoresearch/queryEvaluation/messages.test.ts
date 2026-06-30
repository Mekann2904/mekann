/**
 * messages.test.ts — i18n catalog for static query evaluation (issue #162, IC-267).
 *
 * Verifies the catalog is complete (every id resolves), placeholder formatting
 * is correct, and the empty-state branch sources its strings from the catalog.
 */

import { describe, expect, it } from "vitest";
import {
  directionWord,
  formatMessage,
  messageText,
  queryEvalMessages,
  type QueryEvalMessageId,
} from "./messages.js";
// Sibling import (not "./queryEvaluation.js"): from inside this folder that
// specifier does not resolve under Node ESM and only works via vite's lenient
// resolver; the canonical target is the sibling evaluate module.
import { evaluateQueryStatically } from "./evaluate.js";

describe("queryEvaluation messages catalog (IC-267)", () => {
  it("every catalog id resolves to a non-empty ja string", () => {
    const ids = Object.keys(queryEvalMessages.ja) as QueryEvalMessageId[];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(messageText(id).length, `ja text for ${id}`).toBeGreaterThan(0);
    }
  });

  it("formatMessage interpolates placeholders and preserves unreplaced text", () => {
   	expect(formatMessage("block.safety_risk", { flag: "X" })).toBe("安全上の問題: X");
   	expect(
   		formatMessage("rewrite.needs_metric_extraction", { metric: "duration_ms" }),
   	).toContain("METRIC duration_ms=<value>");
   	expect(formatMessage("rewrite.needs_command", { metric: "score", directionWord: "higher" })).toContain(
   		"主指標は score で、higher is better",
   	);
  });

  it("formatMessage without params returns the raw template (placeholders intact)", () => {
   	// Useful when a caller wants to inspect the template form.
   	expect(formatMessage("block.safety_risk")).toBe("安全上の問題: {flag}");
  });

  it("directionWord maps higher→higher and everything else→lower", () => {
   	expect(directionWord("higher")).toBe("higher");
   	expect(directionWord("lower")).toBe("lower");
   	expect(directionWord("unknown")).toBe("lower");
  });

  it("the empty-state branch sources its strings from the catalog (no hardcoded duplicates)", () => {
   	const r = evaluateQueryStatically("");
   	expect(r.blockingIssues).toEqual([messageText("block.empty_objective")]);
   	expect(r.warnings).toEqual([messageText("warn.checks_unspecified"), messageText("warn.scope_unspecified")]);
   	expect(r.ambiguityFlags).toEqual([messageText("ambig.scope_unknown")]);
   	expect(r.suggestedRewrite).toBe(messageText("rewrite.needs_metric_design"));
   	expect(r.clarifyingQuestions).toEqual([
   		messageText("q.metric_priority"),
   		messageText("q.benchmark_command"),
   		messageText("q.scope"),
   	]);
  });
});
