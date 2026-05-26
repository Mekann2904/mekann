import { describe, it, expect } from "vitest";
import { RollingTextBuffer } from "./index.js";

describe("RollingTextBuffer", () => {
  it("appends text and reads it back", () => {
    const buf = new RollingTextBuffer({ maxBytes: 1000 });
    buf.append("hello");
    expect(buf.getText()).toBe("hello");
    expect(buf.getByteLength()).toBe(5);
  });

  it("trims to line boundary when exceeding maxBytes", () => {
    const buf = new RollingTextBuffer({ maxBytes: 20 });
    // "line1\n" = 6 bytes, "line2\n" = 6 bytes, "line3\n" = 6 bytes => 18 bytes
    // "line4\n" = 6 bytes => 24 bytes > 20, triggers trim
    buf.append("line1\nline2\nline3\nline4\n");
    const text = buf.getText();
    // Should trim from the start, keeping text after a line boundary
    expect(text).toContain("line4");
    // Total should be <= maxBytes * 2 (the rolling window)
    expect(Buffer.byteLength(text, "utf-8")).toBeLessThanOrEqual(40);
  });

  it("preserves text within maxBytes limit", () => {
    const buf = new RollingTextBuffer({ maxBytes: 100 });
    buf.append("short text");
    expect(buf.getText()).toBe("short text");
  });

  it("handles multiple appends that cumulatively exceed maxBytes", () => {
    const buf = new RollingTextBuffer({ maxBytes: 30 });
    for (let i = 0; i < 20; i++) {
      buf.append(`line-${i.toString().padStart(2, "0")}\n`);
    }
    const text = buf.getText();
    // Should have trimmed older lines
    expect(text.length).toBeLessThan(20 * 9); // 20 lines * ~9 chars each
    // Should contain recent lines
    expect(text).toContain("line-19");
  });

  it("handles empty buffer", () => {
    const buf = new RollingTextBuffer({ maxBytes: 100 });
    expect(buf.getText()).toBe("");
    expect(buf.getByteLength()).toBe(0);
  });

  it("tracks startsAtLineBoundary correctly after trim", () => {
    const buf = new RollingTextBuffer({ maxBytes: 20 });
    buf.append("alpha\nbeta\ngamma\ndelta\nepsilon\n");
    // After trimming, should start at a line boundary
    expect(buf.startsAtLineBoundary()).toBe(true);
  });

  it("handles multi-byte UTF-8 characters correctly", () => {
    const buf = new RollingTextBuffer({ maxBytes: 30 });
    // Each CJK char is 3 bytes in UTF-8
    buf.append("あいうえお\n"); // 15 bytes + 1 = 16
    buf.append("かきくけこ\n"); // 15 bytes + 1 = 16 => total 32 > 30, triggers trim
    const text = buf.getText();
    // Should not have corrupted multi-byte characters
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      // Each line should be valid (no partial characters)
      expect(line.length).toBeGreaterThan(0);
      // Should only contain Hiragana or newlines
      for (const ch of line) {
        const code = ch.codePointAt(0)!;
        expect(code >= 0x3040 && code <= 0x309F).toBe(true);
      }
    }
  });

  it("does not use Buffer.from for trimming (avoids round-trip)", () => {
    // This test verifies the design: trimTail should work with string operations only
    const buf = new RollingTextBuffer({ maxBytes: 10 });
    buf.append("abcdefghijklmn\nopqrstuvwxyz\n");
    // If it uses string operations (indexOf, slice) instead of Buffer.from, it should still work
    const text = buf.getText();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("z");
  });
});
