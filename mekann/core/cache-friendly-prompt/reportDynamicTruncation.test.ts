import { describe, expect, it } from "vitest";
import type { ParsedLog } from "./reportTypes.js";
import {
  dynamicTruncationStage,
  hasDynamicFragmentTruncation,
  hasDynamicTailTruncation,
  hasDynamicTruncation,
} from "./reportDynamicTruncation.js";

function row(over: Partial<ParsedLog> = {}): ParsedLog {
  // ParsedLog requires `line`; the truncation predicates ignore everything else.
  return { line: 1, ...over } as ParsedLog;
}

const tailTruncated = row({
  dynamicContextTruncated: true,
  dynamicContextOriginalChars: 25000,
  dynamicContextRenderedChars: 12000,
  dynamicContextLimitChars: 12000,
});
const renderTruncated = row({
  warnings: [
    {
      severity: "warning",
      code: "DYNAMIC_CONTEXT_TRUNCATED",
      message: "Dynamic fragment truncated to reduce context: d1",
      fragmentId: "d1",
      source: "s",
    },
  ],
});
// Snapshot-side warning carries NO fragmentId — must NOT count as render-side.
const tailWarningOnly = row({
  warnings: [
    {
      severity: "warning",
      code: "DYNAMIC_CONTEXT_TRUNCATED",
      message: "Dynamic context was truncated from 25000 to 12000 chars before injection.",
    },
  ],
});

describe("hasDynamicTailTruncation", () => {
  it("is true only when the snapshot-side flag is set", () => {
    expect(hasDynamicTailTruncation(tailTruncated)).toBe(true);
    expect(hasDynamicTailTruncation(renderTruncated)).toBe(false);
    expect(hasDynamicTailTruncation(row())).toBe(false);
  });
});

describe("hasDynamicFragmentTruncation", () => {
  it("is true only for a fragmentId-bearing DYNAMIC_CONTEXT_TRUNCATED warning", () => {
    expect(hasDynamicFragmentTruncation(renderTruncated)).toBe(true);
    // A fragmentId-less (snapshot-side) warning must not be miscounted as render-side.
    expect(hasDynamicFragmentTruncation(tailWarningOnly)).toBe(false);
    expect(hasDynamicFragmentTruncation(tailTruncated)).toBe(false);
    expect(hasDynamicFragmentTruncation(row())).toBe(false);
  });
});

describe("hasDynamicTruncation (union)", () => {
  it("is true when either stage fired", () => {
    expect(hasDynamicTruncation(tailTruncated)).toBe(true);
    expect(hasDynamicTruncation(renderTruncated)).toBe(true);
    expect(hasDynamicTruncation(row())).toBe(false);
  });
});

describe("dynamicTruncationStage", () => {
  it("labels each stage combination", () => {
    expect(dynamicTruncationStage(renderTruncated)).toBe("render");
    expect(dynamicTruncationStage(tailTruncated)).toBe("tail");
    expect(dynamicTruncationStage(row())).toBe("—");
    expect(
      dynamicTruncationStage(
        row({
          dynamicContextTruncated: true,
          warnings: renderTruncated.warnings,
        }),
      ),
    ).toBe("render + tail");
  });
});
