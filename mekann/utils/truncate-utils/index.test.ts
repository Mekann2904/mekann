import { describe, it, expect } from "vitest";
import { truncateTail, truncateHead } from "./index.js";

describe("truncateTail", () => {
  it("returns content unchanged when within limits", () => {
    const content = "line1\nline2\nline3";
    const result = truncateTail(content, { maxLines: 10, maxBytes: 1024 });
    expect(result.content).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("truncates to last N lines", () => {
    const content = "a\nb\nc\nd\ne";
    const result = truncateTail(content, { maxLines: 2, maxBytes: 1024 });
    expect(result.content).toBe("d\ne");
    expect(result.truncated).toBe(true);
    expect(result.truncatedBy).toBe("lines");
  });

  it("truncates by bytes when line limit not hit", () => {
    // Single long line exceeding byte limit
    const longLine = "x".repeat(200);
    const result = truncateTail(longLine, { maxLines: 10, maxBytes: 50 });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content, "utf-8")).toBeLessThanOrEqual(50);
  });

  it("handles empty string", () => {
    const result = truncateTail("", { maxLines: 10, maxBytes: 1024 });
    expect(result.content).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("preserves trailing newline correctly", () => {
    const content = "a\nb\nc\n";
    const result = truncateTail(content, { maxLines: 10, maxBytes: 1024 });
    expect(result.content).toBe("a\nb\nc\n");
  });

  it("counts total lines correctly", () => {
    const content = "a\nb\nc\nd\ne";
    const result = truncateTail(content, { maxLines: 2, maxBytes: 1024 });
    expect(result.totalLines).toBe(5);
  });
});

describe("truncateHead", () => {
  it("returns content unchanged when within limits", () => {
    const content = "line1\nline2\nline3";
    const result = truncateHead(content, { maxLines: 10, maxBytes: 1024 });
    expect(result.content).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("truncates to first N lines", () => {
    const content = "a\nb\nc\nd\ne";
    const result = truncateHead(content, { maxLines: 2, maxBytes: 1024 });
    expect(result.content).toBe("a\nb");
    expect(result.truncated).toBe(true);
    expect(result.truncatedBy).toBe("lines");
  });

  it("truncates by bytes from the head", () => {
    const longLine = "x".repeat(200);
    const result = truncateHead(longLine, { maxLines: 10, maxBytes: 50 });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.content, "utf-8")).toBeLessThanOrEqual(50);
  });

  it("handles empty string", () => {
    const result = truncateHead("", { maxLines: 10, maxBytes: 1024 });
    expect(result.content).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("counts total lines correctly", () => {
    const content = "a\nb\nc\nd\ne";
    const result = truncateHead(content, { maxLines: 2, maxBytes: 1024 });
    expect(result.totalLines).toBe(5);
  });
});
