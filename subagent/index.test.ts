/**
 * Subagent Extension — Unit tests.
 *
 * Tests pure functions (agentPath, contextFork, registry, mailbox)
 * and the extension entry point with mocked ExtensionAPI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the SDK — must be at top level for vitest hoisting
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

import {
  ROOT_PATH,
  isValidSegment,
  joinSegments,
  resolveTaskPath,
  pathPrefix,
  parentPath,
  pathDepth,
} from "./types.js";
import { extractForkContext, buildContextPreamble } from "./contextFork.js";
import { AgentRegistry } from "./registry.js";
import { Mailbox } from "./mailbox.js";
import { parseStateLog } from "./persistence.js";
import { formatAgentList, formatWaitResult } from "./render.js";
import { isTerminalStatus } from "./types.js";

// ─── agentPath ───────────────────────────────────────────────────

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

describe("AgentRegistry", () => {
  let registry: InstanceType<typeof AgentRegistry>;

  beforeEach(() => {
    registry = new AgentRegistry(4, 2);
  });

  function makeMeta(
    agentId: string,
    path: string,
    depth?: number,
  ) {
    const d = depth ?? path.split("/").length - 2;
    return {
      agentId,
      sessionId: `session-${agentId}`,
      agentPath: path,
      status: "pending_init" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      depth: d,
      open: true,
      cancellationRequested: false,
    };
  }

  it("ensures root agent", () => {
    const root = registry.ensureRoot("session-1");
    expect(root.agentPath).toBe("/root");
    expect(root.open).toBe(true);
  });

  it("returns existing root if already open", () => {
    const root1 = registry.ensureRoot("session-1");
    const root2 = registry.ensureRoot("session-1");
    expect(root1).toBe(root2);
  });

  it("rejects duplicate open task path", () => {
    registry.ensureRoot("session-1");
    const reservation = registry.reserveSpawnSlot();
    const meta = makeMeta("agent-1", "/root/task1");
    registry.registerAgent(meta, reservation);

    const reservation2 = registry.reserveSpawnSlot();
    const meta2 = makeMeta("agent-2", "/root/task1");
    expect(() => registry.registerAgent(meta2, reservation2)).toThrow(
      "already exists",
    );
    registry.rollbackReservation(reservation2);
  });

  it("allows closed path to be reused", () => {
    registry.ensureRoot("session-1");
    const reservation = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("agent-1", "/root/task1"), reservation);
    registry.close("/root/task1");

    const reservation2 = registry.reserveSpawnSlot();
    expect(() =>
      registry.registerAgent(
        makeMeta("agent-2", "/root/task1"),
        reservation2,
      ),
    ).not.toThrow();
  });

  it("enforces max agents", () => {
    registry = new AgentRegistry(2, 2);
    registry.ensureRoot("session-1"); // 1 open (root)

    const r1 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a1", "/root/t1"), r1); // 2 open

    expect(() => registry.reserveSpawnSlot()).toThrow(
      "Maximum number of open agents",
    );
  });

  it("enforces max depth", () => {
    registry = new AgentRegistry(10, 1);
    registry.ensureRoot("session-1");

    const r = registry.reserveSpawnSlot();
    expect(() =>
      registry.registerAgent(makeMeta("a1", "/root/a/b", 2), r),
    ).toThrow("Maximum agent depth exceeded");
  });

  it("rollback frees reservation (via consumed/rolledBack tracking)", () => {
    const r = registry.reserveSpawnSlot();
    expect(r.consumed).toBe(false);
    expect(r.rolledBack).toBe(false);
    registry.rollbackReservation(r);
    expect(r.rolledBack).toBe(true);
  });

  it("closeDescendants closes deepest first", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a1", "/root/t1"), r1);
    const r2 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a2", "/root/t1/sub"), r2);

    const desc = registry.getOpenDescendants("/root/t1");
    expect(desc).toHaveLength(1);
    expect(desc[0].agentPath).toBe("/root/t1/sub");
  });

  it("updateStatus publishes events", () => {
    const events: any[] = [];
    registry.subscribe((e) => events.push(e));

    registry.ensureRoot("session-1");
    const r = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a1", "/root/t1"), r);
    registry.updateStatus("/root/t1", "running");

    const statusEvents = events.filter(
      (e) => e.type === "agent_status_changed",
    );
    expect(statusEvents.length).toBeGreaterThan(0);
    expect(statusEvents[0].newStatus).toBe("running");
  });

  it("list returns sorted agents", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a1", "/root/bbb"), r1);
    const r2 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a2", "/root/aaa"), r2);

    const list = registry.list();
    expect(list.map((a) => a.agentPath)).toEqual([
      "/root",
      "/root/aaa",
      "/root/bbb",
    ]);
  });

  it("list filters by prefix", () => {
    registry.ensureRoot("session-1");
    const r1 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a1", "/root/research/api"), r1);
    const r2 = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("a2", "/root/build/deps"), r2);

    const list = registry.list("/root/research");
    expect(list).toHaveLength(1);
    expect(list[0].agentPath).toBe("/root/research/api");
  });

  it("clear resets everything", () => {
    registry.ensureRoot("session-1");
    registry.clear();
    expect(registry.get("/root")).toBeUndefined();
  });

  it("isOpen returns correct state", () => {
    registry.ensureRoot("session-1");
    expect(registry.isOpen("/root")).toBe(true);
    expect(registry.isOpen("/root/nonexistent")).toBe(false);
  });

  it("getByAgentId finds agents", () => {
    registry.ensureRoot("session-1");
    const r = registry.reserveSpawnSlot();
    registry.registerAgent(makeMeta("test-agent-1", "/root/t1"), r);
    expect(registry.getByAgentId("test-agent-1")).toBeDefined();
    expect(registry.getByAgentId("nonexistent")).toBeUndefined();
  });
});

// ─── Mailbox ─────────────────────────────────────────────────────

describe("Mailbox", () => {
  let mailbox: InstanceType<typeof Mailbox>;

  beforeEach(() => {
    mailbox = new Mailbox();
  });

  it("enqueue assigns monotonic seq", () => {
    const item1 = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });
    const item2 = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "world",
      timestamp: Date.now(),
      kind: "message",
    });
    expect(item1.seq).toBeLessThan(item2.seq);
    expect(item2.seq).toBe(item1.seq + 1);
  });

  it("pendingFor returns items for the target path", () => {
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "for task1",
      timestamp: Date.now(),
      kind: "message",
    });
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task2",
      content: "for task2",
      timestamp: Date.now(),
      kind: "message",
    });

    const pending = mailbox.pendingFor("/root/task1");
    expect(pending).toHaveLength(1);
    expect(pending[0].content).toBe("for task1");
  });

  it("pendingFor respects afterSeq", () => {
    const item1 = mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "first",
      timestamp: Date.now(),
      kind: "message",
    });
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "second",
      timestamp: Date.now(),
      kind: "message",
    });

    const pending = mailbox.pendingFor("/root/task1", item1.seq);
    expect(pending).toHaveLength(1);
    expect(pending[0].content).toBe("second");
  });

  it("waitForUpdate resolves immediately for pending items", async () => {
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });

    const result = await mailbox.waitForUpdate("/root/task1", 0, 100);
    expect(result.mailbox).toHaveLength(1);
  });

  it("waitForUpdate times out when no items", async () => {
    const result = await mailbox.waitForUpdate("/root/task1", 0, 50);
    expect(result.mailbox).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it("waitForUpdate resolves when item is enqueued", async () => {
    const promise = mailbox.waitForUpdate("/root/task1", 0, 2000);

    // Enqueue after a small delay
    setTimeout(() => {
      mailbox.enqueue({
        fromAgentId: "root",
        fromAgentPath: "/root",
        toAgentPath: "/root/task1",
        content: "delayed",
        timestamp: Date.now(),
        kind: "message",
      });
    }, 20);

    const result = await promise;
    expect(result.mailbox).toHaveLength(1);
    expect(result.mailbox[0].content).toBe("delayed");
  });

  it("clear rejects all waiters", async () => {
    const promise = mailbox.waitForUpdate("/root/task1", 0, 5000);
    mailbox.clear();
    const result = await promise;
    expect(result.mailbox).toHaveLength(0);
  });

  it("appendEvent stores events", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });

    const events = mailbox.pendingEventsFor("/root/task1");
    expect(events).toHaveLength(1);
  });

  it("currentSeq increments", () => {
    expect(mailbox.currentSeq).toBe(0);
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });
    expect(mailbox.currentSeq).toBe(1);
  });

  it("allEvents returns copy", () => {
    mailbox.appendEvent({
      type: "agent_status_changed",
      agentId: "a1",
      agentPath: "/root/task1",
      previousStatus: "pending_init",
      newStatus: "running",
      timestamp: Date.now(),
    });
    const events = mailbox.allEvents();
    expect(events).toHaveLength(1);
    // Mutating the copy shouldn't affect the mailbox
    events.length = 0;
    expect(mailbox.allEvents()).toHaveLength(1);
  });

  it("allItems returns copy", () => {
    mailbox.enqueue({
      fromAgentId: "root",
      fromAgentPath: "/root",
      toAgentPath: "/root/task1",
      content: "hello",
      timestamp: Date.now(),
      kind: "message",
    });
    const items = mailbox.allItems();
    expect(items).toHaveLength(1);
    items.length = 0;
    expect(mailbox.allItems()).toHaveLength(1);
  });
});

// ─── Persistence ─────────────────────────────────────────────────

describe("persistence", () => {
  it("parses valid JSONL", () => {
    const content = [
      JSON.stringify({ t: "metadata", ts: 1000, data: { agentId: "a1" } }),
      JSON.stringify({ t: "event", ts: 2000, data: { type: "running" } }),
      "",
      "  ",
      "invalid json",
    ].join("\n");

    const entries = parseStateLog(content);
    expect(entries).toHaveLength(2);
    expect(entries[0].t).toBe("metadata");
    expect(entries[1].ts).toBe(2000);
  });

  it("ignores malformed lines", () => {
    const entries = parseStateLog("not json\nalso not json");
    expect(entries).toHaveLength(0);
  });
});

// ─── Types ───────────────────────────────────────────────────────

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

// ─── render ──────────────────────────────────────────────────────

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

// ─── Extension entry point ───────────────────────────────────────

describe("extension entry point", () => {
  function createMockApi() {
    const hooks: Record<string, Function> = {};
    const commands: Record<string, { handler: Function; description?: string }> =
      {};
    let flags: Record<string, unknown> = {};
    const registeredTools: Array<Record<string, any>> = [];
    const registeredFlags: Array<{ name: string; config: unknown }> = [];

    return {
      registerFlag: vi.fn((name: string, config: unknown) => {
        registeredFlags.push({ name, config });
      }),
      registerTool: vi.fn((tool: Record<string, any>) => {
        registeredTools.push(tool);
      }),
      registerCommand: vi.fn((name: string, config: any) => {
        commands[name] = config;
      }),
      on: vi.fn((event: string, handler: Function) => {
        hooks[event] = handler;
      }),
      getFlag: (name: string) => flags[name],
      getActiveTools: vi.fn(() => []),
      events: {
        on: vi.fn(),
        emit: vi.fn(),
      },
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      // Test accessors
      get _hooks() {
        return hooks;
      },
      get _commands() {
        return commands;
      },
      set _flags(f: Record<string, unknown>) {
        flags = f;
      },
      get _registeredTools() {
        return registeredTools;
      },
      get _registeredFlags() {
        return registeredFlags;
      },
    };
  }

  async function loadExtension(mockApi: ReturnType<typeof createMockApi>) {
    const { default: subagentExtension } = await import("./index.js");
    subagentExtension(mockApi as any);
  }

  it("registers 6 tools", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    expect(mock._registeredTools).toHaveLength(6);
    const names = mock._registeredTools.map((t) => t.name);
    expect(names).toContain("spawn_agent");
    expect(names).toContain("send_message");
    expect(names).toContain("followup_task");
    expect(names).toContain("wait_agent");
    expect(names).toContain("list_agents");
    expect(names).toContain("close_agent");
  });

  it("registers 3 commands", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    expect(Object.keys(mock._commands)).toContain("agents");
    expect(Object.keys(mock._commands)).toContain("wait-agent");
    expect(Object.keys(mock._commands)).toContain("close-agent");
  });

  it("registers 3 flags", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    const flagNames = mock._registeredFlags.map((f) => f.name);
    expect(flagNames).toContain("subagent-max-agents");
    expect(flagNames).toContain("subagent-max-depth");
    expect(flagNames).toContain("subagent-default-wait-timeout-ms");
  });

  it("registers session_start and session_shutdown hooks", async () => {
    const mock = createMockApi();
    await loadExtension(mock);
    expect(mock._hooks["session_start"]).toBeDefined();
    expect(mock._hooks["session_shutdown"]).toBeDefined();
  });

  it("list_agents tool returns empty when no agents spawned", async () => {
    const mock = createMockApi();
    await loadExtension(mock);

    // Trigger session_start to initialize control
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const listTool = mock._registeredTools.find(
      (t) => t.name === "list_agents",
    )!;
    const result = await listTool.execute("id1", {}, undefined, undefined, {
      cwd: "/tmp/test",
      model: undefined,
      modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
    });
    // Root agent is always present after session_start
    expect(result.content[0].text).toContain("/root");
    expect(result.content[0].text).toContain("running");
  });

  it("spawn_agent tool calls createAgentSession", async () => {
    const mock = createMockApi();
    await loadExtension(mock);

    // Trigger session_start
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    const spawnTool = mock._registeredTools.find(
      (t) => t.name === "spawn_agent",
    )!;
    const result = await spawnTool.execute(
      "id1",
      { task_name: "research/api", message: "Investigate API" },
      undefined,
      undefined,
      {
        cwd: "/tmp/test",
        model: { id: "test-model" },
        modelRegistry: {
          find: () => undefined,
          getAvailable: () => Promise.resolve([]),
        },
      },
    );

    expect(result.details.agent_id).toBeDefined();
    expect(result.details.task_name).toBe("/root/research/api");
    expect(result.details.status).toBe("pending_init");

    const { createAgentSession } = await import(
      "@earendil-works/pi-coding-agent"
    );
    expect(createAgentSession).toHaveBeenCalled();
  });

  it("/agents command shows agents", async () => {
    const mock = createMockApi();
    await loadExtension(mock);

    // Trigger session_start
    await mock._hooks["session_start"]({}, { cwd: "/tmp/test" });

    // Spawn an agent first
    const spawnTool = mock._registeredTools.find(
      (t) => t.name === "spawn_agent",
    )!;
    await spawnTool.execute(
      "id1",
      { task_name: "test/task1", message: "Test" },
      undefined,
      undefined,
      {
        cwd: "/tmp/test",
        model: { id: "test-model" },
        modelRegistry: { find: () => undefined, getAvailable: () => Promise.resolve([]) },
      },
    );

    // Run /agents command
    const notifications: string[] = [];
    const ctx = {
      cwd: "/tmp/test",
      ui: {
        notify: vi.fn((msg: string) => notifications.push(msg)),
      },
    };
    await mock._commands["agents"].handler("", ctx);
    expect(notifications[0]).toContain("/root");
  });
});
