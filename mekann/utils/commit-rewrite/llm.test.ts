import { describe, expect, it } from "vitest";
import { buildPromptContext } from "./llm.js";

describe("buildPromptContext", () => {
	it("embeds the diff and original subject in the user turn", () => {
		const ctx = buildPromptContext({ sha: "abc123", subject: "add", author: "mek", diff: "+console.log('hi')" });
		expect(ctx.messages).toHaveLength(1);
		const user = ctx.messages[0];
		expect(user.role).toBe("user");
		const content = typeof user.content === "string" ? user.content : "";
		expect(content).toContain("add");
		expect(content).toContain("abc123");
		expect(content).toContain("+console.log('hi')");
	});

	it("requires a Conventional Commits format in the system prompt", () => {
		const ctx = buildPromptContext({ sha: "x", subject: "wip", author: "a", diff: "" });
		expect(ctx.systemPrompt).toMatch(/Conventional Commits/);
	});

	it("sets a numeric timestamp on the user message", () => {
		const ctx = buildPromptContext({ sha: "x", subject: "wip", author: "a", diff: "" });
		expect(typeof ctx.messages[0].timestamp).toBe("number");
	});
});
