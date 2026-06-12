import { describe, it, expect } from "vitest";
import { DeferredJsonParser } from "./index.js";

describe("DeferredJsonParser", () => {
  it("returns empty object for empty/whitespace input", () => {
    const parser = new DeferredJsonParser();
    expect(parser.append("").getResult()).toEqual({});
    parser.reset();
    expect(parser.append("   ").getResult()).toEqual({});
  });

  it("returns parsed object on complete JSON", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"key": "value"}');
    expect(parser.getResult()).toEqual({ key: "value" });
  });

  it("accumulates partial JSON without re-parsing on every append", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"na');
    // No re-parse on intermediate append — getResult returns last known good or empty
    parser.append('me": "te');
    parser.append('st"}');
    expect(parser.getResult()).toEqual({ name: "test" });
  });

  it("handles nested objects", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"outer": {"inner": 42}}');
    expect(parser.getResult()).toEqual({ outer: { inner: 42 } });
  });

  it("handles arrays", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"items": [1, 2, 3]}');
    expect(parser.getResult()).toEqual({ items: [1, 2, 3] });
  });

  it("handles string with escaped quotes", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"text": "hello \\"world\\""}');
    expect(parser.getResult()).toEqual({ text: 'hello "world"' });
  });

  it("handles unicode characters", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"emoji": "🎉"}');
    expect(parser.getResult()).toEqual({ emoji: "🎉" });
  });

  it("tracks append count to verify deferred parsing", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"a');
    parser.append('": 1');
    parser.append(', "b": 2}');
    // Should have recorded 3 appends without intermediate parses
    expect(parser.getAppendCount()).toBe(3);
    // Final parse only on getResult
    expect(parser.getParseCount()).toBe(0); // not yet parsed
    const result = parser.getResult();
    expect(result).toEqual({ a: 1, b: 2 });
    expect(parser.getParseCount()).toBe(1); // parsed once
  });

  it("reset clears accumulated state", () => {
    const parser = new DeferredJsonParser();
    parser.append('{"old": true}');
    parser.reset();
    expect(parser.getAppendCount()).toBe(0);
    expect(parser.getParseCount()).toBe(0);
    parser.append('{"new": 42}');
    expect(parser.getResult()).toEqual({ new: 42 });
  });

  it("returns empty object for malformed JSON", () => {
    const parser = new DeferredJsonParser();
    parser.append("not json at all");
    expect(parser.getResult()).toEqual({});
  });

  it("handles large JSON payload efficiently", () => {
    const parser = new DeferredJsonParser();
    // Simulate streaming of a large JSON (e.g., tool call arguments)
    const entries = Array.from({ length: 50 }, (_, i) => `"key${i}": "value${i}"`);
    const json = `{${entries.join(", ")}}`;
    // Feed in chunks of ~10 chars
    for (let i = 0; i < json.length; i += 10) {
      parser.append(json.slice(i, i + 10));
    }
    expect(parser.getParseCount()).toBe(0); // no intermediate parse
    const result = parser.getResult();
    expect(parser.getParseCount()).toBe(1); // only 1 final parse
    expect(result).toHaveProperty("key0");
    expect(result).toHaveProperty("key49");
  });
});
