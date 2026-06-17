import { describe, expect, it } from "vitest";
import {
  isVolatileRuntimeLine,
  splitVolatileLines,
  volatileRuntimeLinePatterns,
} from "./volatile.js";
import { inspectBaseSystemPrompt } from "./inspect.js";

// Representative header lines for every shared pattern. Used to prove the
// extraction set and the inspection set share ONE source: each line below must
// be BOTH extracted (splitVolatileLines) AND flagged (inspectBaseSystemPrompt).
const representativeVolatileHeaderLines = [
  "Current date: 2026-06-17",
  "Current time: 12:00:00",
  "Current working directory: /tmp/x",
  "Current cwd: /tmp/x",
  "cwd: /tmp/x",
  "Working directory: /tmp/x",
  "Current file: src/render.ts",
  "Open files: a.ts, b.ts",
  "Recent tool: bash",
  "Git status: clean",
  "Continuation: turn 2",
  "Tokens used: 42",
  "Time used: 5s",
  "Remaining tokens: 100",
  "Token budget: 200000",
];

describe("volatileRuntimeLinePatterns (shared source)", () => {
  it("matches the previously-missing header lines (current file / open files / recent / git status / continuation)", () => {
    // These were warned by inspect.ts volatileWarningTerms but NOT removed by the
    // old 4-pattern splitVolatileRuntimeBlock. They must now be covered.
    const previouslyMissing = [
      "Current file: src/render.ts",
      "Open files: a.ts",
      "Recent context: foo",
      "Git status: clean",
      "Continuation: turn 2",
    ];
    for (const line of previouslyMissing) {
      expect(isVolatileRuntimeLine(line)).toBe(true);
    }
  });

  it("still matches the original 4 header lines", () => {
    expect(isVolatileRuntimeLine("Current date: 2026-05-27")).toBe(true);
    expect(isVolatileRuntimeLine("Current working directory: /tmp")).toBe(true);
    expect(isVolatileRuntimeLine("Current cwd: /tmp")).toBe(true);
    expect(isVolatileRuntimeLine("Working directory: /tmp")).toBe(true);
  });

  it("does NOT over-extract stable policy prose that merely mentions a volatile term (threshold)", () => {
    // Line-anchoring + ':' separator is the threshold that avoids over-extraction.
    expect(isVolatileRuntimeLine("When asked for the current date, run a command.")).toBe(false);
    expect(isVolatileRuntimeLine("See git status output below for changes.")).toBe(false);
    expect(isVolatileRuntimeLine("Track tokens used across the session in a summary.")).toBe(false);
    expect(isVolatileRuntimeLine("This is a continuation of the previous turn.")).toBe(false);
  });
});

describe("splitVolatileLines", () => {
  it("separates volatile header lines from stable lines", () => {
    const { stableLines, volatileLines } = splitVolatileLines(
      "BASE POLICY\nCurrent date: 2026-06-17\nCurrent file: render.ts\nMORE POLICY",
    );
    expect(stableLines).toEqual(["BASE POLICY", "MORE POLICY"]);
    expect(volatileLines).toEqual(["Current date: 2026-06-17", "Current file: render.ts"]);
  });

  it("returns all lines as stable when none are volatile", () => {
    const { stableLines, volatileLines } = splitVolatileLines("JUST\nSTABLE");
    expect(stableLines).toEqual(["JUST", "STABLE"]);
    expect(volatileLines).toEqual([]);
  });
});

describe("extraction and inspection share one source (commonization invariant)", () => {
  it("every representative volatile header is both extracted and warned by BASE_SYSTEM_VOLATILE_RUNTIME_LINE", () => {
    // The core invariant from issue #95: a line inspection warns about must also
    // be removed by extraction, because both consume volatileRuntimeLinePatterns.
    for (const line of representativeVolatileHeaderLines) {
      const { volatileLines } = splitVolatileLines(line);
      expect(volatileLines, `extraction should remove: ${line}`).toEqual([line]);

      const warnings = inspectBaseSystemPrompt(line);
      expect(
        warnings.some((w) => w.code === "BASE_SYSTEM_VOLATILE_RUNTIME_LINE"),
        `inspection should warn: ${line}`,
      ).toBe(true);
    }
  });

  it("volatileRuntimeLinePatterns is non-empty and every pattern matches at least one representative line", () => {
    // Guards against a pattern being added to the array but never satisfiable.
    expect(volatileRuntimeLinePatterns.length).toBeGreaterThan(0);
    for (const re of volatileRuntimeLinePatterns) {
      const matched = representativeVolatileHeaderLines.some((l) => re.test(l));
      expect(matched, `pattern with no representative sample: ${re}`).toBe(true);
    }
  });
});
