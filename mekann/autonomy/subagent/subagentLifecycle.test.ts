import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Mailbox } from "./mailbox.js";
import { AgentRegistry } from "./registry.js";
import { SubagentLifecycle } from "./subagentLifecycle.js";
import type { AgentMetadata } from "./types.js";

function registerAgent(registry: AgentRegistry, cwd: string): AgentMetadata {
  const reservation = registry.reserveSpawnSlot("/root/task");
  const agent: AgentMetadata = {
    agentId: "a1",
    sessionId: "s1",
    agentPath: "/root/task",
    status: "running",
    lastTaskMessage: "start",
    createdAt: 1,
    updatedAt: 1,
    depth: 1,
    open: true,
    cancellationRequested: false,
    workspaceCwd: cwd,
  };
  registry.registerAgent(agent, reservation);
  return agent;
}

describe("SubagentLifecycle", () => {
  it("stores structured subagent results and enqueues a final_result", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "sl-"));
    try {
      const registry = new AgentRegistry(4, 3);
      const mailbox = new Mailbox();
      registerAgent(registry, cwd);
      const lifecycle = new SubagentLifecycle(registry, mailbox, cwd);

      const message = lifecycle.handleFinalText({
        agentId: "a1",
        agentPath: "/root/task",
        callerPath: "/root",
        status: "completed",
        cwd,
        finalText: JSON.stringify({ schema: "subagent.result.v1", outcome: "no_change", summary: "nothing to change" }),
      });

      expect(message).toContain("no_change");
      expect(registry.get("/root/task")?.lastTaskMessage).toBe(message);
      expect(lifecycle.resultStoreFor(cwd).list()).toHaveLength(1);
      expect(mailbox.pendingFor("/root").at(-1)?.kind).toBe("final_result");
      expect(mailbox.allEvents().at(-1)?.type).toBe("agent_final_message");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("falls back to truncated text when final text is not a structured result", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "sl-"));
    try {
      const registry = new AgentRegistry(4, 3);
      const mailbox = new Mailbox();
      registerAgent(registry, cwd);
      const lifecycle = new SubagentLifecycle(registry, mailbox, cwd);

      const message = lifecycle.handleFinalText({ agentId: "a1", agentPath: "/root/task", callerPath: "/root", status: "completed", cwd, finalText: "plain final text" });

      expect(message).toBe("plain final text");
      expect(lifecycle.resultStoreFor(cwd).list()).toHaveLength(0);
      expect(mailbox.pendingFor("/root").at(-1)?.content).toBe("plain final text");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
