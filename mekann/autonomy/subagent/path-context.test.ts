import { describe, it, expect } from "vitest";
import {
  isValidSegment,
  resolveTaskPath,
  pathPrefix,
  parentPath,
  pathDepth,
} from "./types.js";
import { extractForkContext, buildContextPreamble } from "./contextFork.js";

describe("agentPath", () => {
  describe("isValidSegment", () => {
    it("accepts normal names", () => {
      expect(isValidSegment("research")).toBe(true);
      expect(isValidSegment("api_scan")).toBe(true);
      expect(isValidSegment("task-1")).toBe(true);
    });

    it("rejects special segments", () => {
      expect(isValidSegment(".")).toBe(false);
      expect(isValidSegment("..")).toBe(false);
      expect(isValidSegment("")).toBe(false);
      expect(isValidSegment("a/b")).toBe(false);
    });
  });

  describe("resolveTaskPath", () => {
    it("resolves relative path from current", () => {
      expect(resolveTaskPath("research/api_scan", "/root")).toBe(
        "/root/research/api_scan",
      );
    });

    it("resolves single segment", () => {
      expect(resolveTaskPath("task1", "/root")).toBe("/root/task1");
    });

    it("accepts absolute path under /root", () => {
      expect(resolveTaskPath("/root/task1", "/root")).toBe("/root/task1");
    });

    it("rejects root path", () => {
      expect(() => resolveTaskPath("/root", "/root")).toThrow(
        "Cannot spawn at root path",
      );
    });

    it("rejects absolute path not under /root", () => {
      expect(() => resolveTaskPath("/other/task1", "/root")).toThrow(
        'must start with "/root/"',
      );
    });

    it("rejects empty task_name", () => {
      expect(() => resolveTaskPath("", "/root")).toThrow("must not be empty");
    });

    it("rejects segments with ..", () => {
      expect(() => resolveTaskPath("a/../b", "/root")).toThrow(
        "Invalid path segment",
      );
    });

    it("resolves from non-root current path", () => {
      expect(resolveTaskPath("subtask", "/root/research")).toBe(
        "/root/research/subtask",
      );
    });
  });

  describe("pathPrefix", () => {
    it("exact match returns true", () => {
      expect(pathPrefix("/root/research", "/root/research")).toBe(true);
    });

    it("child path returns true", () => {
      expect(pathPrefix("/root/research", "/root/research/api")).toBe(true);
    });

    it("sibling path returns false", () => {
      expect(pathPrefix("/root/research", "/root/research2")).toBe(false);
    });

    it("partial segment returns false", () => {
      expect(pathPrefix("/root/re", "/root/research")).toBe(false);
    });
  });

  describe("parentPath", () => {
    it("root has no parent", () => {
      expect(parentPath("/root")).toBeNull();
    });

    it("direct child returns root", () => {
      expect(parentPath("/root/task1")).toBe("/root");
    });

    it("nested returns parent", () => {
      expect(parentPath("/root/research/api")).toBe("/root/research");
    });
  });

  describe("pathDepth", () => {
    it("root is depth 0", () => {
      expect(pathDepth("/root")).toBe(0);
    });

    it("direct child is depth 1", () => {
      expect(pathDepth("/root/task1")).toBe(1);
    });

    it("nested is depth 2", () => {
      expect(pathDepth("/root/research/api")).toBe(2);
    });
  });
});

// ─── contextFork ─────────────────────────────────────────────────

describe("contextFork", () => {
  const sampleMessages = [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there" },
    { role: "user", content: "Do task A" },
    { role: "assistant", content: "Done A" },
    { role: "user", content: "Do task B" },
    { role: "assistant", content: "Done B" },
  ];

  describe("extractForkContext", () => {
    it("returns empty for 'none'", () => {
      expect(extractForkContext(sampleMessages as any, "none")).toEqual([]);
    });

    it("returns empty for 0", () => {
      expect(extractForkContext(sampleMessages as any, 0)).toEqual([]);
    });

    it("returns all for 'all'", () => {
      const result = extractForkContext(sampleMessages as any, "all");
      expect(result).toHaveLength(6);
      expect(result[0]).toEqual({ role: "user", text: "Hello" });
    });

    it("returns last N user turns for numeric N", () => {
      const result = extractForkContext(sampleMessages as any, 1);
      // Should include last user turn + assistant response
      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[result.length - 2].text).toBe("Do task B");
    });

    it("returns last 2 user turns", () => {
      const result = extractForkContext(sampleMessages as any, 2);
      expect(result.length).toBeGreaterThanOrEqual(4);
    });

    it("returns empty for empty messages", () => {
      expect(extractForkContext([], "all")).toEqual([]);
    });

    it("skips non-text content blocks", () => {
      const msgs = [
        {
          role: "user",
          content: [{ type: "image", data: "abc" }],
        },
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
      ];
      const result = extractForkContext(msgs as any, "all");
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("Hello");
    });
  });

  describe("buildContextPreamble", () => {
    it("includes agent path and parent", () => {
      const preamble = buildContextPreamble({
        agentPath: "/root/research",
        parentPath: "/root",
      });
      expect(preamble).toContain("/root/research");
      expect(preamble).toContain("/root");
      expect(preamble).toContain("Default execution style: silent.");
    });

    it("includes role and nickname", () => {
      const preamble = buildContextPreamble({
        agentPath: "/root/research",
        parentPath: "/root",
        role: "researcher",
        nickname: "R1",
      });
      expect(preamble).toContain("researcher");
      expect(preamble).toContain("R1");
    });
  });
});

// ─── Registry ────────────────────────────────────────────────────

