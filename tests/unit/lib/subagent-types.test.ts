/**
 * Unit tests for lib/subagent-types.ts
 * Tests type exports, interface structures, and type guards.
 */

import { describe, it, expect } from "vitest";
import type {
  SubagentLiveViewMode,
  SubagentLiveStreamView,
  SubagentLiveItem,
  SubagentMonitorLifecycle,
  SubagentMonitorStream,
  SubagentMonitorResource,
  SubagentLiveMonitorController,
  SubagentNormalizedOutput,
  SubagentParallelCapacityResolution,
  DelegationState,
  PrintCommandResult,
} from "../../../.pi/lib/agent/subagent-types.js";

// ============================================================================
// Type Export Tests
// ============================================================================

describe("Subagent Types Export", () => {
  it("should export SubagentLiveViewMode type", () => {
    const mode: SubagentLiveViewMode = "list";
    expect(["list", "detail"]).toContain(mode);
  });

  it("should export SubagentLiveStreamView type", () => {
    const stream: SubagentLiveStreamView = "stdout";
    expect(["stdout", "stderr"]).toContain(stream);
  });
});

// ============================================================================
// SubagentLiveItem Interface Tests
// ============================================================================

describe("SubagentLiveItem", () => {
  it("should create a valid SubagentLiveItem", () => {
    const item: SubagentLiveItem = {
      id: "subagent-123",
      name: "Test Subagent",
      status: "running",
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
    };

    expect(item.id).toBe("subagent-123");
    expect(item.name).toBe("Test Subagent");
    expect(item.status).toBe("running");
  });

  it("should support all status values", () => {
    const statuses: Array<"pending" | "running" | "completed" | "failed"> = [
      "pending",
      "running",
      "completed",
      "failed",
    ];

    statuses.forEach((status) => {
      const item: SubagentLiveItem = {
        id: "test",
        name: "Test",
        status,
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
      };
      expect(item.status).toBe(status);
    });
  });

  it("should support optional fields", () => {
    const item: SubagentLiveItem = {
      id: "subagent-123",
      name: "Test Subagent",
      status: "completed",
      startedAtMs: 1000,
      finishedAtMs: 5000,
      lastChunkAtMs: 4500,
      summary: "Task completed successfully",
      error: undefined,
      stdoutTail: "Final output",
      stderrTail: "",
      stdoutBytes: 500,
      stderrBytes: 0,
      stdoutNewlineCount: 25,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: true,
      stderrEndsWithNewline: false,
    };

    expect(item.startedAtMs).toBe(1000);
    expect(item.finishedAtMs).toBe(5000);
    expect(item.summary).toBe("Task completed successfully");
  });

  it("should support error field", () => {
    const item: SubagentLiveItem = {
      id: "subagent-456",
      name: "Failed Subagent",
      status: "failed",
      error: "Execution timeout after 30s",
      stdoutTail: "",
      stderrTail: "Error: Timeout",
      stdoutBytes: 0,
      stderrBytes: 100,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 1,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: true,
    };

    expect(item.status).toBe("failed");
    expect(item.error).toBe("Execution timeout after 30s");
  });
});

// ============================================================================
// ISP Interface Tests
// ============================================================================

describe("SubagentMonitorLifecycle Interface", () => {
  it("should define markStarted and markFinished methods", () => {
    const lifecycle: SubagentMonitorLifecycle = {
      markStarted: (agentId: string) => {
        expect(typeof agentId).toBe("string");
      },
      markFinished: (agentId, status, summary, error) => {
        expect(typeof agentId).toBe("string");
        expect(["completed", "failed"]).toContain(status);
        expect(typeof summary).toBe("string");
        if (error !== undefined) {
          expect(typeof error).toBe("string");
        }
      },
    };

    lifecycle.markStarted("subagent-123");
    lifecycle.markFinished("subagent-123", "completed", "Done");
    lifecycle.markFinished("subagent-123", "failed", "Failed", "Error");
  });
});

describe("SubagentMonitorStream Interface", () => {
  it("should define appendChunk method", () => {
    const streamMonitor: SubagentMonitorStream = {
      appendChunk: (agentId, stream, chunk) => {
        expect(typeof agentId).toBe("string");
        expect(["stdout", "stderr"]).toContain(stream);
        expect(typeof chunk).toBe("string");
      },
    };

    streamMonitor.appendChunk("subagent-123", "stdout", "output");
    streamMonitor.appendChunk("subagent-123", "stderr", "error");
  });
});

describe("SubagentMonitorResource Interface", () => {
  it("should define close and wait methods", () => {
    const resourceMonitor: SubagentMonitorResource = {
      close: () => {},
      wait: async () => {},
    };

    expect(typeof resourceMonitor.close).toBe("function");
    expect(typeof resourceMonitor.wait).toBe("function");
  });
});

// ============================================================================
// SubagentLiveMonitorController Interface Tests
// ============================================================================

describe("SubagentLiveMonitorController", () => {
  it("should combine all monitor interfaces", () => {
    const controller: SubagentLiveMonitorController = {
      // Lifecycle
      markStarted: () => {},
      markFinished: () => {},
      // Stream
      appendChunk: () => {},
      // Resource
      close: () => {},
      wait: async () => {},
    };

    // Verify all methods exist
    expect(typeof controller.markStarted).toBe("function");
    expect(typeof controller.markFinished).toBe("function");
    expect(typeof controller.appendChunk).toBe("function");
    expect(typeof controller.close).toBe("function");
    expect(typeof controller.wait).toBe("function");
  });
});

// ============================================================================
// SubagentNormalizedOutput Interface Tests
// ============================================================================

describe("SubagentNormalizedOutput", () => {
  it("should create a valid normalized output", () => {
    const output: SubagentNormalizedOutput = {
      summary: "Task completed",
      output: "Full output content",
      hasResult: true,
    };

    expect(output.summary).toBe("Task completed");
    expect(output.output).toBe("Full output content");
    expect(output.hasResult).toBe(true);
  });

  it("should support output without result section", () => {
    const output: SubagentNormalizedOutput = {
      summary: "No result",
      output: "Output without result section",
      hasResult: false,
    };

    expect(output.hasResult).toBe(false);
  });
});

// ============================================================================
// SubagentParallelCapacityResolution Tests
// ============================================================================

describe("SubagentParallelCapacityResolution", () => {
  it("should create an approved resolution", () => {
    const resolution: SubagentParallelCapacityResolution = {
      agentId: "subagent-123",
      approvedParallelism: 3,
      approved: true,
    };

    expect(resolution.agentId).toBe("subagent-123");
    expect(resolution.approvedParallelism).toBe(3);
    expect(resolution.approved).toBe(true);
    expect(resolution.reason).toBeUndefined();
  });

  it("should create a rejected resolution with reason", () => {
    const resolution: SubagentParallelCapacityResolution = {
      agentId: "subagent-456",
      approvedParallelism: 0,
      approved: false,
      reason: "Maximum parallelism reached",
    };

    expect(resolution.approved).toBe(false);
    expect(resolution.reason).toBe("Maximum parallelism reached");
  });
});

// ============================================================================
// DelegationState Tests
// ============================================================================

describe("DelegationState", () => {
  it("should create a valid delegation state", () => {
    const state: DelegationState = {
      delegatedThisRequest: false,
      directWriteConfirmedThisRequest: false,
      pendingDirectWriteConfirmUntilMs: 0,
      sessionDelegationCalls: 0,
    };

    expect(state.delegatedThisRequest).toBe(false);
    expect(state.directWriteConfirmedThisRequest).toBe(false);
    expect(state.pendingDirectWriteConfirmUntilMs).toBe(0);
    expect(state.sessionDelegationCalls).toBe(0);
  });

  it("should track delegation state", () => {
    const state: DelegationState = {
      delegatedThisRequest: true,
      directWriteConfirmedThisRequest: false,
      pendingDirectWriteConfirmUntilMs: Date.now() + 60000,
      sessionDelegationCalls: 5,
    };

    expect(state.delegatedThisRequest).toBe(true);
    expect(state.sessionDelegationCalls).toBe(5);
    expect(state.pendingDirectWriteConfirmUntilMs).toBeGreaterThan(Date.now());
  });
});

// ============================================================================
// PrintCommandResult Tests
// ============================================================================

describe("PrintCommandResult", () => {
  it("should create a valid print command result", () => {
    const result: PrintCommandResult = {
      output: "Command output",
      latencyMs: 150,
    };

    expect(result.output).toBe("Command output");
    expect(result.latencyMs).toBe(150);
  });

  it("should support empty output", () => {
    const result: PrintCommandResult = {
      output: "",
      latencyMs: 50,
    };

    expect(result.output).toBe("");
    expect(result.latencyMs).toBe(50);
  });
});

// ============================================================================
// Type Compatibility Tests
// ============================================================================

describe("Type Compatibility", () => {
  it("should allow partial implementation of monitor interfaces", () => {
    // A minimal controller that only implements lifecycle
    const minimalLifecycle: SubagentMonitorLifecycle = {
      markStarted: () => {},
      markFinished: () => {},
    };

    expect(typeof minimalLifecycle.markStarted).toBe("function");
    expect(typeof minimalLifecycle.markFinished).toBe("function");
  });

  it("should ensure ISP compliance - no forced dependencies", () => {
    // Code that only needs stream should not need lifecycle methods
    const streamOnly: SubagentMonitorStream = {
      appendChunk: () => {},
    };

    // Code that only needs resource should not need other methods
    const resourceOnly: SubagentMonitorResource = {
      close: () => {},
      wait: async () => {},
    };

    expect(streamOnly).toBeDefined();
    expect(resourceOnly).toBeDefined();
  });
});

// ============================================================================
// Comparison with Team Types
// ============================================================================

describe("Subagent vs Team Type Differences", () => {
  it("should note subagent items use id instead of key", () => {
    // SubagentLiveItem uses `id` field
    const subagentItem: SubagentLiveItem = {
      id: "subagent-id",
      name: "Test",
      status: "running",
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
    };

    expect(subagentItem.id).toBeDefined();
    // Note: TeamLiveItem uses `key` field instead
  });

  it("should note subagent has no phase field", () => {
    const subagentItem: SubagentLiveItem = {
      id: "subagent-id",
      name: "Test",
      status: "running",
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
    };

    // @ts-expect-error - phase does not exist on SubagentLiveItem
    expect(subagentItem.phase).toBeUndefined();
  });

  it("should note subagent has no partners field", () => {
    const subagentItem: SubagentLiveItem = {
      id: "subagent-id",
      name: "Test",
      status: "running",
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
    };

    // @ts-expect-error - partners does not exist on SubagentLiveItem
    expect(subagentItem.partners).toBeUndefined();
  });

  it("should note subagent has no discussion tracking", () => {
    const subagentItem: SubagentLiveItem = {
      id: "subagent-id",
      name: "Test",
      status: "running",
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
    };

    // @ts-expect-error - discussion fields do not exist on SubagentLiveItem
    expect(subagentItem.discussionTail).toBeUndefined();
    // @ts-expect-error - discussion fields do not exist on SubagentLiveItem
    expect(subagentItem.discussionBytes).toBeUndefined();
  });
});
