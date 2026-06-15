/**
 * index.types-render.test.ts — 型関数 (agentPath/terminal status/parentPath) と render (formatAgentList/formatWaitResult) のテスト
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

import { ROOT_PATH, parentPath, formatAgentList, formatWaitResult, isTerminalStatus } from "./types.js";

describe("types", () => {
  it("identifies terminal statuses", () => {
    expect(isTerminalStatus("completed")).toBe(true);
    expect(isTerminalStatus("errored")).toBe(true);
    expect(isTerminalStatus("shutdown")).toBe(true);
    expect(isTerminalStatus("interrupted")).toBe(true);
    expect(isTerminalStatus("running")).toBe(false);
    expect(isTerminalStatus("pending_init")).toBe(false);
  });
});

describe("render", () => {
  describe("formatAgentList", () => {
    it("shows no agents message", () => {
      expect(formatAgentList([])).toEqual(["(no agents)"]);
    });

    it("formats agents with status icons", () => {
      const lines = formatAgentList([
        makeRenderAgent("/root/task1", "running", true, "Do research"),
        makeRenderAgent("/root/task2", "completed", false, "Done"),
      ]);
      expect(lines[0]).toContain("●"); // open
      expect(lines[0]).toContain("running");
      expect(lines[1]).toContain("○"); // closed
      expect(lines[1]).toContain("completed");
    });

    it("includes nickname and role", () => {
      const lines = formatAgentList([
        {
          ...makeRenderAgent("/root/task1", "running", true),
          nickname: "R1",
          role: "researcher",
        },
      ]);
      expect(lines[0]).toContain("(R1)");
      expect(lines[0]).toContain("[researcher]");
    });

    function makeRenderAgent(
      path: string,
      status: string,
      open: boolean,
      lastTask?: string,
    ) {
      return {
        agentId: "a1",
        sessionId: "s1",
        agentPath: path,
        status: status as any,
        lastTaskMessage: lastTask,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        depth: 1,
        open,
        cancellationRequested: false,
      };
    }
  });

  describe("formatWaitResult", () => {
    it("shows timed out message", () => {
      const lines = formatWaitResult([], [], true);
      expect(lines[0]).toContain("timed out");
    });

    it("shows no updates message", () => {
      const lines = formatWaitResult([], [], false);
      expect(lines).toContain("(no updates)");
    });

    it("shows mailbox items", () => {
      const lines = formatWaitResult(
        [],
        [
          {
            seq: 1,
            fromAgentId: "a1",
            fromAgentPath: "/root/t1",
            toAgentPath: "/root",
            content: "result text",
            timestamp: Date.now(),
            kind: "final_result",
          },
        ],
        false,
      );
      expect(lines.some((l) => l.includes("result text"))).toBe(true);
    });

    it("shows status change events", () => {
      const lines = formatWaitResult(
        [
          {
            type: "agent_status_changed" as const,
            agentId: "a1",
            agentPath: "/root/t1",
            previousStatus: "running" as const,
            newStatus: "completed" as const,
            timestamp: Date.now(),
          },
        ],
        [],
        false,
      );
      expect(
        lines.some((l) => l.includes("running") && l.includes("completed")),
      ).toBe(true);
    });
  });
});

describe("render additional", () => {
  it("formatAgentList truncates long messages (>60 chars)", () => {
    const longMessage = "A".repeat(100);
    const lines = formatAgentList([
      {
        agentId: "a1",
        sessionId: "s1",
        agentPath: "/root/task1",
        status: "running",
        lastTaskMessage: longMessage,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        depth: 1,
        open: true,
        cancellationRequested: false,
      },
    ]);
    expect(lines[0]).toContain("…");
    expect(lines[0].length).toBeLessThan(longMessage.length + 50);
  });

  it("formatWaitResult with final_message events", () => {
    const lines = formatWaitResult(
      [
        {
          type: "agent_final_message" as const,
          agentId: "a1",
          agentPath: "/root/task1",
          message: "Task completed successfully",
          status: "completed" as const,
          timestamp: Date.now(),
        },
      ],
      [],
      false,
    );
    expect(lines.some((l) => l.includes("Task completed successfully"))).toBe(true);
  });

  it("formatWaitResult shows no-updates when no events and not timed out", () => {
    const lines = formatWaitResult([], [], false);
    expect(lines).toContain("(no updates)");
  });
});

describe("parentPath edge cases", () => {
  // Line 240: lastSlash === 0 means path like "/foo" (single segment after /)
  // But our paths are always /root/... so lastSlash >= 5.
  // The only way to hit lastSlash === 0 is a path like "/x"
  it("returns ROOT_PATH for direct child of / (lastSlash === 0)", () => {
    // This path has lastIndexOf('/') === 0
    expect(parentPath("/x")).toBe("/root");
  });
});
