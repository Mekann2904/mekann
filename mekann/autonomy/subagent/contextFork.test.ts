/**
 * Feature audit tests — ContextFork edge cases.
 *
 * Validates SA-04-T1 through SA-04-T4 from the feature list.
 */

import { describe, it, expect } from "vitest";
import {
	extractForkContext,
	truncateText,
	FORK_CONTEXT_MAX_CHARS,
	FORK_CONTEXT_MESSAGE_MAX_CHARS,
} from "./contextFork.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(text: string) {
	return { role: "user" as const, content: [{ type: "text" as const, text }] };
}
function makeAssistant(text: string) {
	return { role: "assistant" as const, content: [{ type: "text" as const, text }] };
}

// ---------------------------------------------------------------------------
// SA-04-T1: FORK_CONTEXT_MAX_CHARS enforcement
// ---------------------------------------------------------------------------

describe("SA-04-T1: fork_turns='all' respects FORK_CONTEXT_MAX_CHARS", () => {
	it("truncates old messages when total exceeds limit", () => {
		// Create messages that would exceed 12,000 chars total
		const msgs: any[] = [];
		for (let i = 0; i < 20; i++) {
			// Each pair: ~1000 chars → 20 pairs = ~20,000 chars > 12,000
			msgs.push(makeUser(`User message ${i}: ` + "x".repeat(450)));
			msgs.push(makeAssistant(`Assistant reply ${i}: ` + "y".repeat(450)));
		}

		const result = extractForkContext(msgs, "all");

		// Total text should be within FORK_CONTEXT_MAX_CHARS (plus overhead)
		const totalChars = result.reduce((sum, r) => sum + r.text.length, 0);
		expect(totalChars).toBeLessThanOrEqual(FORK_CONTEXT_MAX_CHARS + result.length * 100);
	});

	it("includes [omitted] prefix when messages are dropped", () => {
		const msgs: any[] = [];
		for (let i = 0; i < 20; i++) {
			msgs.push(makeUser(`User message ${i}: ` + "x".repeat(450)));
			msgs.push(makeAssistant(`Assistant reply ${i}: ` + "y".repeat(450)));
		}

		const result = extractForkContext(msgs, "all");

		// First message should be the [omitted] notice
		expect(result[0].role).toBe("assistant");
		expect(result[0].text).toContain("[omitted:");
	});
});

// ---------------------------------------------------------------------------
// SA-04-T2: FORK_CONTEXT_MESSAGE_MAX_CHARS enforcement
// ---------------------------------------------------------------------------

describe("SA-04-T2: individual messages are truncated to FORK_CONTEXT_MESSAGE_MAX_CHARS", () => {
	it("truncates a single very long message", () => {
		const longText = "a".repeat(5000);
		const msgs = [makeUser(longText)];

		const result = extractForkContext(msgs, "all");

		expect(result).toHaveLength(1);
		expect(result[0].text.length).toBeLessThan(longText.length);
		expect(result[0].text).toContain("[omitted:");
	});

	it("preserves short messages intact", () => {
		const shortText = "Hello, this is fine.";
		const msgs = [makeUser(shortText)];

		const result = extractForkContext(msgs, "all");

		expect(result).toHaveLength(1);
		expect(result[0].text).toBe(shortText);
	});
});

// ---------------------------------------------------------------------------
// SA-04-T3: toolResult/toolCall exclusion
// ---------------------------------------------------------------------------

describe("SA-04-T3: toolResult and toolCall messages are excluded", () => {
	it("excludes tool_result role messages", () => {
		const msgs = [
			makeUser("Hello"),
			makeAssistant("I'll help"),
			{ role: "tool_result", content: [{ type: "text", text: "file contents" }] },
			makeUser("Thanks"),
		];

		const result = extractForkContext(msgs as any, "all");

		expect(result.every((r) => r.role === "user" || r.role === "assistant")).toBe(true);
		expect(result).toHaveLength(3); // user, assistant, user
	});

	it("excludes messages with only non-text content blocks", () => {
		const msgs = [
			{ role: "user", content: [{ type: "tool_use", id: "1", name: "read" }] },
			makeUser("Actual text"),
		];

		const result = extractForkContext(msgs as any, "all");

		expect(result).toHaveLength(1);
		expect(result[0].text).toBe("Actual text");
	});
});

// ---------------------------------------------------------------------------
// SA-04-T4: omission notice format
// ---------------------------------------------------------------------------

describe("SA-04-T4: omission notice includes count of dropped messages", () => {
	it("includes the count in the notice text", () => {
		const msgs: any[] = [];
		for (let i = 0; i < 30; i++) {
			msgs.push(makeUser(`User ${i}: ` + "x".repeat(400)));
			msgs.push(makeAssistant(`Assistant ${i}: ` + "y".repeat(400)));
		}

		const result = extractForkContext(msgs, "all");

		// Should have [omitted] as first entry
		const notice = result[0];
		expect(notice.text).toMatch(/\[omitted: \d+ older forked messages/);
	});
});

// ---------------------------------------------------------------------------
// truncateText unit test
// ---------------------------------------------------------------------------

describe("truncateText", () => {
	it("returns text unchanged if under limit", () => {
		expect(truncateText("hello", 10)).toBe("hello");
	});

	it("truncates with notice if over limit", () => {
		const result = truncateText("a".repeat(100), 50);
		expect(result.length).toBeLessThanOrEqual(50);
		expect(result).toContain("[omitted:");
	});
});
