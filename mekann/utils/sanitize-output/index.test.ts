import { describe, it, expect } from "vitest";
import { sanitizeBinaryOutput } from "./index.js";

describe("sanitizeBinaryOutput", () => {
  it("allows tab, newline, carriage return", () => {
    expect(sanitizeBinaryOutput("hello\tworld\nnew\rline")).toBe(
      "hello\tworld\nnew\rline"
    );
  });

  it("strips control characters (0x00-0x1F except tab/LF/CR)", () => {
    const input = "a\x00b\x01c\x07d\x08e\x0bf\x0cg\x0eh\x1fi";
    // tab(0x09), LF(0x0a), CR(0x0d) は許可
    expect(sanitizeBinaryOutput(input)).toBe("abcdefghi");
  });

  it("strips Unicode format characters (U+FFF9-U+FFFB)", () => {
    const input = "hello\u{FFF9}inter\u{FFFA}linear\u{FFFB}end";
    expect(sanitizeBinaryOutput(input)).toBe("hellointerlinearend");
  });

  it("preserves regular text including CJK and emoji", () => {
    const input = "こんにちは世界 🌍 ñ é ü";
    expect(sanitizeBinaryOutput(input)).toBe(input);
  });

  it("preserves surrogate pairs (emoji)", () => {
    const input = "🎉🚀👨‍👩‍👧‍👦";
    expect(sanitizeBinaryOutput(input)).toBe(input);
  });

  it("handles empty string", () => {
    expect(sanitizeBinaryOutput("")).toBe("");
  });

  it("handles string with only allowed whitespace", () => {
    expect(sanitizeBinaryOutput("\t\n\r")).toBe("\t\n\r");
  });

  it("handles string with only forbidden characters", () => {
    expect(sanitizeBinaryOutput("\x00\x01\x1f\u{FFF9}\u{FFFB}")).toBe("");
  });

  it("handles large input efficiently", () => {
    const chunk = "hello world\n";
    const input = chunk.repeat(5000); // ~55KB
    const result = sanitizeBinaryOutput(input);
    expect(result).toBe(input);
  });

  it("strips mixed control chars in realistic bash output", () => {
    const input = "line1\n\x1b[32mgreen\x1b[0m\nline3\x00\n";
    // ESC(0x1b)とNULL(0x00)を除去
    expect(sanitizeBinaryOutput(input)).toBe("line1\n[32mgreen[0m\nline3\n");
  });
});
