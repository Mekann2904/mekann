import { describe, it, expect } from "vitest";
import { extractForkContext, extractLastAssistantText, extractTextFromContent, truncateText, buildContextPreamble } from "./contextFork.js";

describe("extractTextFromContent", () => {
  it("returns string content directly", () => {
    expect(extractTextFromContent("hello world")).toBe("hello world");
  });

  it("extracts text from content block array", () => {
    const content = [
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
    ];
    expect(extractTextFromContent(content)).toBe("hello \nworld");
  });

  it("returns null for empty content block array", () => {
    expect(extractTextFromContent([])).toBeNull();
  });

  it("returns null for content blocks with no text type", () => {
    const content = [
      { type: "image", data: "base64..." },
      { type: "tool_use", id: "1", name: "read" },
    ];
    expect(extractTextFromContent(content)).toBeNull();
  });

  it("returns null for number content", () => {
    expect(extractTextFromContent(42)).toBeNull();
  });

  it("returns null for null content", () => {
    expect(extractTextFromContent(null)).toBeNull();
  });

  it("returns null for undefined content", () => {
    expect(extractTextFromContent(undefined)).toBeNull();
  });

  it("handles mixed content blocks with some text", () => {
    const content = [
      { type: "image", data: "base64..." },
      { type: "text", text: "actual text" },
    ];
    expect(extractTextFromContent(content)).toBe("actual text");
  });

  it("ignores serialized tool-call-only text", () => {
    expect(extractTextFromContent('<tool_call UserRepository.ReadFile tool_name read>{"file_path":"x"}</tool_call>')).toBeNull();
    expect(extractTextFromContent('<|pi_token|>begin_token|>tool_use<|pi_token|>read<|pi_token|>filename<|pi_token|>x')).toBeNull();
  });
});

describe("extractLastAssistantText", () => {
  it("skips trailing assistant tool-call-only messages and returns the last textual assistant message", () => {
    const messages = [
      { role: "assistant", content: [{ type: "text", text: "final answer" }] },
      { role: "assistant", content: '<tool_call UserRepository.ReadFile tool_name read>{"file_path":"x"}</tool_call>' },
    ];
    expect(extractLastAssistantText(messages)).toBe("final answer");
  });
});

describe("extractForkContext: forkTurns=0", () => {
  it("returns empty for forkTurns=0", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "hello" }], timestamp: 1 },
    ];
    expect(extractForkContext(msgs as any, 0)).toEqual([]);
  });
});

describe("extractForkContext: forkTurns=number", () => {
  it("returns last N user turns and their responses", () => {
    const msgs: any[] = [];
    for (let i = 0; i < 10; i++) {
      msgs.push({ role: "user", content: [{ type: "text", text: `user ${i}` }] });
      msgs.push({ role: "assistant", content: [{ type: "text", text: `assistant ${i}` }] });
    }
    const result = extractForkContext(msgs, 2);
    // Should contain last 2 user turns + their assistant responses
    const userMsgs = result.filter(r => r.role === "user");
    expect(userMsgs).toHaveLength(2);
    expect(userMsgs[0].text).toContain("user 8");
    expect(userMsgs[1].text).toContain("user 9");
  });

  it("returns empty for N=0", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ];
    expect(extractForkContext(msgs as any, 0)).toEqual([]);
  });

  it("returns empty when no user messages exist", () => {
    const msgs = [
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];
    expect(extractForkContext(msgs as any, 5)).toEqual([]);
  });

  it("handles N larger than available turns", () => {
    const msgs = [
      { role: "user", content: [{ type: "text", text: "u1" }] },
      { role: "assistant", content: [{ type: "text", text: "a1" }] },
    ];
    const result = extractForkContext(msgs as any, 100);
    expect(result.some(r => r.role === "user" && r.text === "u1")).toBe(true);
  });
});

describe("buildContextPreamble", () => {
  it("builds basic preamble", () => {
    const preamble = buildContextPreamble({
      agentPath: "/root/task1",
      parentPath: "/root",
    });
    expect(preamble).toContain("/root/task1");
    expect(preamble).toContain("/root");
    expect(preamble).toContain("Subagent Context");
    expect(preamble).toContain("Default execution style: silent.");
  });

  it("includes role when provided", () => {
    const preamble = buildContextPreamble({
      agentPath: "/root/task1",
      parentPath: "/root",
      role: "researcher",
    });
    expect(preamble).toContain("Role: researcher");
  });

  it("includes nickname when provided", () => {
    const preamble = buildContextPreamble({
      agentPath: "/root/task1",
      parentPath: "/root",
      nickname: "bob",
    });
    expect(preamble).toContain("Nickname: bob");
  });

  it("does not include role/nickname when not provided", () => {
    const preamble = buildContextPreamble({
      agentPath: "/root/task1",
      parentPath: "/root",
    });
    expect(preamble).not.toContain("Role:");
    expect(preamble).not.toContain("Nickname:");
  });

  it("instructs subagents to avoid progress narration by default", () => {
    const preamble = buildContextPreamble({
      agentPath: "/root/task1",
      parentPath: "/root",
    });
    expect(preamble).toContain("Do not emit progress reports");
    expect(preamble).toContain("Use tool calls as needed without announcing them");
    expect(preamble).toContain("Emit an assistant message only for the final result");
    expect(preamble).toContain("Final output is for the parent agent, not a human");
  });
});

describe("truncateText", () => {
  it("handles exact maxChars boundary", () => {
    const text = "a".repeat(100);
    const result = truncateText(text, 100);
    expect(result).toBe(text);
  });

  it("handles maxChars = 80 (minimum space for notice)", () => {
    const text = "a".repeat(200);
    const result = truncateText(text, 80);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toContain("[omitted:");
  });
});
