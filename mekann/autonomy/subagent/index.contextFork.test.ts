/**
 * index.contextFork.test.ts — contextFork (extractForkContext/buildContextPreamble) のテスト
 *
 * subagent/index.test.ts から仕様領域ごとに分割された focused suite。
 * 共有ヘルパーは ./test-helpers.ts を参照。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
  createAgentSession: vi.fn(() =>
    Promise.resolve({
      session: {
        sessionId: "mock-session-id",
        subscribe: vi.fn(() => vi.fn()),
        prompt: vi.fn(() => Promise.resolve()),
        sendCustomMessage: vi.fn(() => Promise.resolve()),
        sendUserMessage: vi.fn(() => Promise.resolve()),
        isStreaming: false,
        abort: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
    }),
  ),
  SessionManager: {
    inMemory: vi.fn(() => ({})),
  },
}));

import { extractForkContext } from "./contextFork.js";

describe("contextFork branch coverage", () => {
  it("extractForkContext handles messages with string content", () => {
    const msgs = [
      { role: "user", content: "Hello string content" },
    ];
    const result = extractForkContext(msgs as any, "all");
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello string content");
  });

  // Line 95: return null for non-string, non-array content (e.g. number)
  it("extractTextFromContent returns null for non-string non-array content", async () => {
    const { extractTextFromContent } = await import("./contextFork.js");
    expect(extractTextFromContent(42 as any)).toBeNull();
    expect(extractTextFromContent(null as any)).toBeNull();
    expect(extractTextFromContent(undefined as any)).toBeNull();
  });

  // Line 95: return null for array with no text blocks
  it("extractTextFromContent returns null for array with no text blocks", async () => {
    const { extractTextFromContent } = await import("./contextFork.js");
    expect(extractTextFromContent([{ type: "image", data: "abc" }])).toBeNull();
    expect(extractTextFromContent([])).toBeNull();
  });
});

describe("extractForkContext: skips messages with non-text content", () => {
	it("skips user message with image-only content (text is null)", () => {
		const msgs = [
			{ role: "user", content: [{ type: "image", data: "base64..." }] },
			{ role: "assistant", content: [{ type: "text", text: "I see the image" }] },
		];
		const result = extractForkContext(msgs as any, "all");
		// User message has null text → skipped, only assistant included
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("assistant");
		expect(result[0].text).toBe("I see the image");
	});

	it("skips assistant message with no text content", () => {
		const msgs = [
			{ role: "user", content: [{ type: "text", text: "Hello" }] },
			{ role: "assistant", content: [{ type: "image", data: "base64..." }] },
		];
		const result = extractForkContext(msgs as any, "all");
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("user");
	});
});
