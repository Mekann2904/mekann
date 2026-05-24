import { describe, it, expect, vi } from "vitest";
import { fetchCodexWebSearch } from "./search.js";
import { CodexError } from "../codex-shared/errors.js";
import type { CodexWebSearchOptions } from "./search.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSseBody(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const content = events.join("\n\n");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(content));
      controller.close();
    },
  });
}

function createMockFetch(response: {
  ok: boolean;
  status?: number;
  body?: ReadableStream<Uint8Array>;
  text?: string;
}): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: response.ok,
      status: response.status ?? 200,
      text: () => Promise.resolve(response.text ?? ""),
      body: response.body ?? null,
      headers: new Headers(),
    })) as any;
}

function makeOptions(overrides: Partial<CodexWebSearchOptions> = {}): CodexWebSearchOptions {
  return {
    query: "test query",
    token: "test-token",
    accountId: "acct-123",
    model: "test-model",
    fetchImpl: overrides.fetchImpl,
    signal: overrides.signal,
    onTextDelta: overrides.onTextDelta,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SSE event builders
// ---------------------------------------------------------------------------

function createdEvent(id: string): string {
  return `event: response.created\ndata: {"response":{"id":"${id}"}}`;
}

function deltaEvent(text: string): string {
  const escaped = JSON.stringify(text);
  return `event: response.output_text.delta\ndata: {"delta":${escaped}}`;
}

function completedEvent(): string {
  return `event: response.completed\ndata: {"response":{"usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30}}}`;
}

function searchCallAddedEvent(id: string): string {
  return `event: response.output_item.added\ndata: {"item":{"id":"${id}","type":"web_search_call","status":"in_progress"}}`;
}

function searchCallDoneEvent(id: string, query: string): string {
  return `event: response.output_item.done\ndata: {"item":{"id":"${id}","type":"web_search_call","status":"completed","action":{"type":"search","query":"${query}"}}}`;
}

function messageDoneEvent(text: string, annotations: Array<{ title: string; url: string }> = []): string {
  const annJson = JSON.stringify(
    annotations.map((a) => ({
      type: "url_citation",
      title: a.title,
      url: a.url,
      start_index: 0,
      end_index: 1,
    })),
  );
  const textJson = JSON.stringify(text);
  return `event: response.output_item.done\ndata: {"item":{"type":"message","role":"assistant","content":[{"type":"output_text","text":${textJson},"annotations":${annJson}}]}}`;
}

function failedEvent(message: string): string {
  return `event: response.failed\ndata: {"error":{"message":"${message}"}}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchCodexWebSearch", () => {
  it("returns text, searchCalls, citations, and usage on success", async () => {
    const body = createSseBody([
      createdEvent("r1"),
      searchCallAddedEvent("sc1"),
      searchCallDoneEvent("sc1", "test query"),
      messageDoneEvent("The answer is 42", [
        { title: "Wiki", url: "https://wiki.example.com" },
      ]),
      completedEvent(),
    ]);

    const fetchImpl = createMockFetch({ ok: true, body });
    const result = await fetchCodexWebSearch(makeOptions({ fetchImpl }));

    expect(result.responseId).toBe("r1");
    expect(result.text).toBe("The answer is 42");
    expect(result.searchCalls).toHaveLength(1);
    expect(result.searchCalls[0].query).toBe("test query");
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].url).toBe("https://wiki.example.com");
    expect(result.usage?.totalTokens).toBe(30);
  });

  it("calls onTextDelta for streamed text deltas", async () => {
    const body = createSseBody([
      deltaEvent("Hello "),
      deltaEvent("world"),
      completedEvent(),
    ]);

    const onTextDelta = vi.fn();
    const fetchImpl = createMockFetch({ ok: true, body });
    await fetchCodexWebSearch(makeOptions({ fetchImpl, onTextDelta }));

    expect(onTextDelta).toHaveBeenCalledTimes(2);
    expect(onTextDelta).toHaveBeenCalledWith("Hello ");
    expect(onTextDelta).toHaveBeenCalledWith("world");
  });

  it("throws CodexError on non-200 response", async () => {
    const fetchImpl = createMockFetch({
      ok: false,
      status: 401,
      text: "Unauthorized",
    });

    await expect(
      fetchCodexWebSearch(makeOptions({ fetchImpl })),
    ).rejects.toThrow(CodexError);

    try {
      await fetchCodexWebSearch(makeOptions({ fetchImpl }));
    } catch (e) {
      expect(e).toBeInstanceOf(CodexError);
      expect((e as CodexError).kind).toBe("auth");
      expect((e as CodexError).status).toBe(401);
    }
  });

  it("throws CodexError 'transport' when body is null", async () => {
    const fetchImpl = createMockFetch({ ok: true });

    await expect(
      fetchCodexWebSearch(makeOptions({ fetchImpl })),
    ).rejects.toThrow(CodexError);

    try {
      await fetchCodexWebSearch(makeOptions({ fetchImpl }));
    } catch (e) {
      expect(e).toBeInstanceOf(CodexError);
      expect((e as CodexError).kind).toBe("transport");
    }
  });

  it("can be aborted via signal", async () => {
    // Create a body stream that errors when the signal fires,
    // simulating a real fetch that respects AbortSignal.
    const encoder = new TextEncoder();
    const abortController = new AbortController();

    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          encoder.encode("event: response.created\ndata: {\"response\":{\"id\":\"r1\"}}\n\n"),
        );
        // Don't close — keep the reader waiting.
        abortController.signal.addEventListener("abort", () => {
          c.error(new DOMException("The operation was aborted.", "AbortError"));
        });
      },
    });

    const fetchImpl = createMockFetch({ ok: true, body });

    const promise = fetchCodexWebSearch(
      makeOptions({ fetchImpl, signal: abortController.signal }),
    );

    // Abort after a microtask so the stream has started reading
    await new Promise((r) => setTimeout(r, 1));
    abortController.abort();

    await expect(promise).rejects.toThrow();
  });

  it("throws CodexError on response.failed event", async () => {
    const body = createSseBody([
      createdEvent("r1"),
      failedEvent("Model not found"),
    ]);

    const fetchImpl = createMockFetch({ ok: true, body });

    try {
      await fetchCodexWebSearch(makeOptions({ fetchImpl }));
      expect.unreachable("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CodexError);
      expect((e as CodexError).message).toContain("Model not found");
    }
  });
});
