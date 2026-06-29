import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import { buildExternalSocketPath } from "./subagentSpawner.js";

describe("buildExternalSocketPath (issue #152: socket path length)", () => {
  it("stays well under the macOS sun_path limit (~104) for a long agentId", () => {
    const longAgentId = "sub_1_xyz".repeat(20);
    const socketPath = buildExternalSocketPath(longAgentId);
    expect(socketPath.length).toBeLessThan(90);
  });

  it("lives in a short dedicated directory, not the human-readable log dir", () => {
    const socketPath = buildExternalSocketPath("agent-1");
    expect(socketPath.startsWith(path.join(os.tmpdir(), "pi-sub"))).toBe(true);
    // Should not contain the verbose "pi-subagents" segment used for logs.
    expect(socketPath).not.toContain("pi-subagents");
  });

  it("is deterministic for the same agentId and differs for different ids", () => {
    expect(buildExternalSocketPath("agent-1")).toBe(buildExternalSocketPath("agent-1"));
    expect(buildExternalSocketPath("agent-1")).not.toBe(buildExternalSocketPath("agent-2"));
  });
});
