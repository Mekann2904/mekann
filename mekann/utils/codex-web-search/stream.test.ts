import { describe, it, expect } from "vitest";
import { parseSse } from "./stream.js";

function createSseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = frames.map((f) => encoder.encode(f));
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

describe("parseSse", () => {
  it("parses a normal SSE event with event: + data: lines", async () => {
    const stream = createSseStream([
      "event: response.created\ndata: {\"id\":\"r1\"}\n\n",
    ]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("response.created");
    expect(events[0].data).toEqual({ id: "r1" });
  });

  it("joins multiple data lines with newline", async () => {
    const stream = createSseStream([
      "event: delta\ndata: {\"text\":\ndata:  \"hello\"}\n\n",
    ]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ text: "hello" });
  });

  it("ignores [DONE] events", async () => {
    const stream = createSseStream(["data: [DONE]\n\n"]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(0);
  });

  it("ignores frames with no data lines", async () => {
    const stream = createSseStream(["event: ping\n\n"]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(0);
  });

  it("returns raw string for invalid JSON", async () => {
    const stream = createSseStream(["data: not-json\n\n"]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(1);
    expect(events[0].raw).toBe("not-json");
    expect(events[0].data).toBeUndefined();
  });

  it("does not crash on empty body", async () => {
    const stream = createSseStream([]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(0);
  });

  it("parses multiple events from a single chunk", async () => {
    const stream = createSseStream([
      "event: a\ndata: 1\n\nevent: b\ndata: 2\n\n",
    ]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("a");
    expect(events[0].data).toBe(1);
    expect(events[1].type).toBe("b");
    expect(events[1].data).toBe(2);
  });

  it("handles events split across multiple chunks", async () => {
    const stream = createSseStream([
      "event: a\ndata: 1",
      "\n\nevent: b\ndata: 2\n\n",
    ]);
    const events = await collect(parseSse(stream));
    expect(events).toHaveLength(2);
    expect(events[0].data).toBe(1);
    expect(events[1].data).toBe(2);
  });
});
