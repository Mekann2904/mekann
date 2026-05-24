import { describe, it, expect } from "vitest";
import { formatResultText } from "./result.js";
import type { CodexWebSearchResult } from "./search.js";

function makeResult(overrides: Partial<CodexWebSearchResult> = {}): CodexWebSearchResult {
  return {
    responseId: "r1",
    model: "test-model",
    text: "Hello world",
    searchCalls: [],
    citations: [],
    ...overrides,
  };
}

describe("formatResultText", () => {
  it("returns text only when there are no citations", () => {
    const result = makeResult();
    expect(formatResultText(result)).toBe("Hello world");
  });

  it("appends Sources section when citations exist", () => {
    const result = makeResult({
      citations: [
        { title: "OpenAI", url: "https://openai.com", startIndex: 0, endIndex: 5 },
      ],
    });
    const output = formatResultText(result);
    expect(output).toContain("Hello world");
    expect(output).toContain("Sources:");
    expect(output).toContain("[1] OpenAI — https://openai.com");
  });

  it("deduplicates citations by URL", () => {
    const result = makeResult({
      citations: [
        { title: "A", url: "https://example.com" },
        { title: "B", url: "https://example.com" },
      ],
    });
    const output = formatResultText(result);
    expect(output).toContain("[1] A — https://example.com");
    expect(output).not.toContain("[2]");
  });

  it("shows URL only when title is missing", () => {
    const result = makeResult({
      citations: [{ url: "https://example.com" }],
    });
    const output = formatResultText(result);
    expect(output).toContain("[1] https://example.com");
    expect(output).not.toContain("— https://example.com");
  });

  it("omits Sources section when citations array is empty", () => {
    const result = makeResult({ citations: [] });
    expect(formatResultText(result)).not.toContain("Sources:");
  });

  it("returns empty string when text is empty and citations are empty", () => {
    const result = makeResult({ text: "" });
    expect(formatResultText(result)).toBe("");
  });
});
