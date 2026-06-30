import { describe, it, expect } from "vitest";
import { truncateTail, truncateHead, truncateToBytesFromEnd, truncateToBytesFromStart, safeUtf8Slice } from "./index.js";

// Deterministic LCG so property tests are reproducible.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildRandomContent(rng: () => number, alphabet: string[], opts: { maxLines?: number; maxLineLen?: number; newlineChance?: number } = {}): string {
  const maxLines = opts.maxLines ?? 6;
  const maxLineLen = opts.maxLineLen ?? 30;
  const newlineChance = opts.newlineChance ?? 0.5;
  let out = "";
  const lines = 1 + Math.floor(rng() * maxLines);
  for (let l = 0; l < lines; l++) {
    const len = 1 + Math.floor(rng() * maxLineLen);
    for (let c = 0; c < len; c++) out += alphabet[Math.floor(rng() * alphabet.length)];
    if (rng() < newlineChance) out += "\n";
  }
  return out;
}

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

describe("byte-safe helpers", () => {
  it("truncateToBytesFromStart never exceeds maxBytes and keeps valid UTF-8", () => {
    expect(truncateToBytesFromStart("abc", 10)).toBe("abc");
    expect(truncateToBytesFromStart("abcdef", 3)).toBe("abc");
    // CJK (3 bytes/char): 3 bytes can hold one char, not two.
    expect(Buffer.byteLength(truncateToBytesFromStart("あいう", 3), "utf-8")).toBeLessThanOrEqual(3);
    expect(truncateToBytesFromStart("あいう", 3)).not.toContain("\uFFFD");
    // Emoji (4 bytes/char): never split a surrogate pair.
    expect(truncateToBytesFromStart("😀😁", 5)).not.toContain("\uFFFD");
    expect(Buffer.byteLength(truncateToBytesFromStart("😀😁", 5), "utf-8")).toBeLessThanOrEqual(5);
    expect(truncateToBytesFromStart("x", 0)).toBe("");
  });

  it("truncateToBytesFromEnd never exceeds maxBytes and keeps valid UTF-8", () => {
    expect(truncateToBytesFromEnd("abc", 10)).toBe("abc");
    expect(truncateToBytesFromEnd("abcdef", 3)).toBe("def");
    expect(Buffer.byteLength(truncateToBytesFromEnd("あいう", 3), "utf-8")).toBeLessThanOrEqual(3);
    expect(truncateToBytesFromEnd("あいう", 3)).not.toContain("\uFFFD");
    expect(truncateToBytesFromEnd("😀😁", 5)).not.toContain("\uFFFD");
    expect(Buffer.byteLength(truncateToBytesFromEnd("😀😁", 5), "utf-8")).toBeLessThanOrEqual(5);
    expect(truncateToBytesFromEnd("x", 0)).toBe("");
  });
});

describe("safeUtf8Slice", () => {
  it("returns input unchanged when within budget", () => {
    expect(safeUtf8Slice("abc", 10)).toBe("abc");
    expect(safeUtf8Slice("あいう", 100)).toBe("あいう");
  });

  it("returns empty string for maxBytes <= 0", () => {
    expect(safeUtf8Slice("hello", 0)).toBe("");
    expect(safeUtf8Slice("hello", -1)).toBe("");
    expect(safeUtf8Slice("あ", -5)).toBe("");
  });

  it("head cut lands on a CJK boundary (issue verification example)", () => {
    // 'あ'.repeat(10) = 30 bytes; 5 bytes holds exactly one 'あ' (3 bytes).
    expect(safeUtf8Slice("あ".repeat(10), 5)).toBe("あ");
    expect(Buffer.byteLength(safeUtf8Slice("あ".repeat(10), 5), "utf-8")).toBeLessThanOrEqual(5);
  });

  it("head cut never emits U+FFFD for emoji", () => {
    // 'abc😀def': abc=3B, 😀=4B, def=3B. 5 bytes => 'abc' (no partial emoji).
    const head = safeUtf8Slice("abc😀def", 5, false);
    expect(head).not.toContain("\uFFFD");
    expect(head).toBe("abc");
  });

  it("tail cut never starts mid-character", () => {
    expect(safeUtf8Slice("abc😀def", 5, true)).toBe("def");
    expect(safeUtf8Slice("abc😀def", 6, true)).toBe("def");
    expect(safeUtf8Slice("😀😀😀", 0, true)).toBe("");
  });

  it("keeps pure CJK / pure emoji / mixed within maxBytes (property)", () => {
    const CJK = Array.from("あいうえお漢字表覗");
    const EMOJI = Array.from("😀😁😂🤔😃😄🥳🤯🦄");
    const MIXED = Array.from("abcあ😁de漢😂fgえ");
    const rng = makeRng(777);
    for (let i = 0; i < 300; i++) {
      const alphabet = [CJK, EMOJI, MIXED][i % 3];
      const content = buildRandomContent(rng, alphabet);
      const maxBytes = 1 + Math.floor(rng() * 40);
      for (const fromEnd of [false, true]) {
        const out = safeUtf8Slice(content, maxBytes, fromEnd);
        expect(Buffer.byteLength(out, "utf-8")).toBeLessThanOrEqual(maxBytes);
        expect(out).not.toContain("\uFFFD");
      }
    }
  });
});

describe("CJK / emoji byte-budget property tests", () => {
  const CJK = Array.from("あいうえお漢字表覗");
  const EMOJI = Array.from("😀😁😂🤔😃😄🥳🤯🦄");
  const MIXED = Array.from("abcあ😁de漢😂fgえ");

  for (const [name, alphabet] of [["pure CJK", CJK], ["pure emoji", EMOJI], ["ASCII+CJK+emoji mixed", MIXED]] as const) {
    it(`truncateTail keeps ${name} within maxBytes`, () => {
      const rng = makeRng(123);
      for (let i = 0; i < 300; i++) {
        const content = buildRandomContent(rng, alphabet);
        const maxBytes = 5 + Math.floor(rng() * 60);
        const result = truncateTail(content, { maxLines: 1000, maxBytes });
        expect(Buffer.byteLength(result.content, "utf-8")).toBeLessThanOrEqual(maxBytes);
        expect(result.content).not.toContain("\uFFFD");
      }
    });

    it(`truncateHead keeps ${name} within maxBytes`, () => {
      const rng = makeRng(456);
      for (let i = 0; i < 300; i++) {
        const content = buildRandomContent(rng, alphabet);
        const maxBytes = 5 + Math.floor(rng() * 60);
        const result = truncateHead(content, { maxLines: 1000, maxBytes });
        expect(Buffer.byteLength(result.content, "utf-8")).toBeLessThanOrEqual(maxBytes);
        expect(result.content).not.toContain("\uFFFD");
      }
    });
  }
});
