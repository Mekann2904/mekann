/**
 * Unit tests for lib/team-types.ts
 * Tests type exports, interface structures, and type guards.
 */

import { describe, it, expect } from "vitest";
import type {
  TeamLivePhase,
  TeamLiveViewMode,
  TeamLiveItem,
  TeamMonitorLifecycle,
  TeamMonitorPhase,
  TeamMonitorEvents,
  TeamMonitorStream,
  TeamMonitorDiscussion,
  TeamMonitorResource,
  AgentTeamLiveMonitorController,
  TeamNormalizedOutput,
  TeamParallelCapacityCandidate,
  TeamParallelCapacityResolution,
  TeamFrontmatter,
  TeamMemberFrontmatter,
  ParsedTeamMarkdown,
} from "../../../.pi/lib/team-types.js";

// ============================================================================
// Type Export Tests
// ============================================================================

describe("Team Types Export", () => {
  it("should export TeamLivePhase type", () => {
    const phase: TeamLivePhase = "queued";
    expect(["queued", "initial", "communication", "judge", "finished"]).toContain(phase);
  });

  it("should export TeamLiveViewMode type", () => {
    const mode: TeamLiveViewMode = "list";
    expect(["list", "detail", "discussion"]).toContain(mode);
  });
});

// ============================================================================
// TeamLiveItem Interface Tests
// ============================================================================

describe("TeamLiveItem", () => {
  it("should create a valid TeamLiveItem", () => {
    const item: TeamLiveItem = {
      key: "team1/member1",
      label: "Member 1",
      partners: ["member2"],
      status: "running",
      phase: "initial",
      stdoutTail: "",
      stderrTail: "",
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutNewlineCount: 0,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: false,
      stderrEndsWithNewline: false,
      events: [],
      discussionTail: "",
      discussionBytes: 0,
      discussionNewlineCount: 0,
      discussionEndsWithNewline: false,
    };

    expect(item.key).toBe("team1/member1");
    expect(item.phase).toBe("initial");
    expect(item.partners).toContain("member2");
  });

  it("should support all TeamLivePhase values", () => {
    const phases: TeamLivePhase[] = [
      "queued",
      "initial",
      "communication",
      "judge",
      "finished",
    ];

    phases.forEach((phase) => {
      const item: TeamLiveItem = {
        key: "test/test",
        label: "Test",
        partners: [],
        status: "running",
        phase,
        stdoutTail: "",
        stderrTail: "",
        stdoutBytes: 0,
        stderrBytes: 0,
        stdoutNewlineCount: 0,
        stderrNewlineCount: 0,
        stdoutEndsWithNewline: false,
        stderrEndsWithNewline: false,
        events: [],
        discussionTail: "",
        discussionBytes: 0,
        discussionNewlineCount: 0,
        discussionEndsWithNewline: false,
      };
      expect(item.phase).toBe(phase);
    });
  });

  it("should support optional fields", () => {
    const item: TeamLiveItem = {
      key: "team1/member1",
      label: "Member 1",
      partners: [],
      status: "completed",
      phase: "finished",
      startedAtMs: 1000,
      finishedAtMs: 2000,
      lastChunkAtMs: 1500,
      lastEventAtMs: 1800,
      lastEvent: "Task completed",
      summary: "Successfully completed task",
      error: undefined,
      stdoutTail: "output",
      stderrTail: "",
      stdoutBytes: 100,
      stderrBytes: 0,
      stdoutNewlineCount: 5,
      stderrNewlineCount: 0,
      stdoutEndsWithNewline: true,
      stderrEndsWithNewline: false,
      events: ["event1", "event2"],
      discussionTail: "discussion content",
      discussionBytes: 50,
      discussionNewlineCount: 2,
      discussionEndsWithNewline: true,
      phaseRound: 2,
    };

    expect(item.startedAtMs).toBe(1000);
    expect(item.finishedAtMs).toBe(2000);
    expect(item.phaseRound).toBe(2);
    expect(item.summary).toBe("Successfully completed task");
  });
});

// ============================================================================
// ISP Interface Tests
// ============================================================================

describe("TeamMonitorLifecycle Interface", () => {
  it("should define markStarted and markFinished methods", () => {
    const lifecycle: TeamMonitorLifecycle = {
      markStarted: (itemKey: string) => {
        expect(typeof itemKey).toBe("string");
      },
      markFinished: (itemKey, status, summary, error) => {
        expect(typeof itemKey).toBe("string");
        expect(["completed", "failed"]).toContain(status);
        expect(typeof summary).toBe("string");
        if (error !== undefined) {
          expect(typeof error).toBe("string");
        }
      },
    };

    lifecycle.markStarted("test/key");
    lifecycle.markFinished("test/key", "completed", "Done");
    lifecycle.markFinished("test/key", "failed", "Failed", "Error message");
  });
});

describe("TeamMonitorPhase Interface", () => {
  it("should define markPhase method", () => {
    const phaseMonitor: TeamMonitorPhase = {
      markPhase: (itemKey, phase, round) => {
        expect(typeof itemKey).toBe("string");
        expect(["queued", "initial", "communication", "judge", "finished"]).toContain(phase);
        if (round !== undefined) {
          expect(typeof round).toBe("number");
        }
      },
    };

    phaseMonitor.markPhase("test/key", "communication");
    phaseMonitor.markPhase("test/key", "communication", 2);
  });
});

describe("TeamMonitorEvents Interface", () => {
  it("should define event logging methods", () => {
    const eventsMonitor: TeamMonitorEvents = {
      appendEvent: (itemKey, event) => {
        expect(typeof itemKey).toBe("string");
        expect(typeof event).toBe("string");
      },
      appendBroadcastEvent: (event) => {
        expect(typeof event).toBe("string");
      },
    };

    eventsMonitor.appendEvent("test/key", "Started execution");
    eventsMonitor.appendBroadcastEvent("All members notified");
  });
});

describe("TeamMonitorStream Interface", () => {
  it("should define appendChunk method", () => {
    const streamMonitor: TeamMonitorStream = {
      appendChunk: (itemKey, stream, chunk) => {
        expect(typeof itemKey).toBe("string");
        expect(["stdout", "stderr", "discussion"]).toContain(stream);
        expect(typeof chunk).toBe("string");
      },
    };

    streamMonitor.appendChunk("test/key", "stdout", "output data");
    streamMonitor.appendChunk("test/key", "stderr", "error data");
  });
});

describe("TeamMonitorDiscussion Interface", () => {
  it("should define appendDiscussion method", () => {
    const discussionMonitor: TeamMonitorDiscussion = {
      appendDiscussion: (itemKey, discussion) => {
        expect(typeof itemKey).toBe("string");
        expect(typeof discussion).toBe("string");
      },
    };

    discussionMonitor.appendDiscussion("test/key", "Agent discussion content");
  });
});

describe("TeamMonitorResource Interface", () => {
  it("should define close and wait methods", () => {
    const resourceMonitor: TeamMonitorResource = {
      close: () => {},
      wait: async () => {},
    };

    expect(typeof resourceMonitor.close).toBe("function");
    expect(typeof resourceMonitor.wait).toBe("function");
  });
});

// ============================================================================
// AgentTeamLiveMonitorController Interface Tests
// ============================================================================

describe("AgentTeamLiveMonitorController", () => {
  it("should combine all monitor interfaces", () => {
    const controller: AgentTeamLiveMonitorController = {
      // Lifecycle
      markStarted: () => {},
      markFinished: () => {},
      // Phase
      markPhase: () => {},
      // Events
      appendEvent: () => {},
      appendBroadcastEvent: () => {},
      // Stream
      appendChunk: () => {},
      // Discussion
      appendDiscussion: () => {},
      // Resource
      close: () => {},
      wait: async () => {},
    };

    // Verify all methods exist
    expect(typeof controller.markStarted).toBe("function");
    expect(typeof controller.markFinished).toBe("function");
    expect(typeof controller.markPhase).toBe("function");
    expect(typeof controller.appendEvent).toBe("function");
    expect(typeof controller.appendBroadcastEvent).toBe("function");
    expect(typeof controller.appendChunk).toBe("function");
    expect(typeof controller.appendDiscussion).toBe("function");
    expect(typeof controller.close).toBe("function");
    expect(typeof controller.wait).toBe("function");
  });
});

// ============================================================================
// TeamNormalizedOutput Interface Tests
// ============================================================================

describe("TeamNormalizedOutput", () => {
  it("should create a valid normalized output", () => {
    const output: TeamNormalizedOutput = {
      summary: "Task completed successfully",
      output: "Full output content...",
      evidenceCount: 5,
      hasDiscussion: true,
    };

    expect(output.summary).toBe("Task completed successfully");
    expect(output.evidenceCount).toBe(5);
    expect(output.hasDiscussion).toBe(true);
  });

  it("should support output without discussion", () => {
    const output: TeamNormalizedOutput = {
      summary: "Simple task output",
      output: "Output without discussion",
      evidenceCount: 0,
      hasDiscussion: false,
    };

    expect(output.hasDiscussion).toBe(false);
  });
});

// ============================================================================
// Team Parallel Capacity Types Tests
// ============================================================================

describe("TeamParallelCapacityCandidate", () => {
  it("should create a valid capacity candidate", () => {
    const candidate: TeamParallelCapacityCandidate = {
      teamId: "team-123",
      parallelism: 4,
    };

    expect(candidate.teamId).toBe("team-123");
    expect(candidate.parallelism).toBe(4);
  });
});

describe("TeamParallelCapacityResolution", () => {
  it("should create an approved resolution", () => {
    const resolution: TeamParallelCapacityResolution = {
      teamId: "team-123",
      approvedParallelism: 4,
      approved: true,
    };

    expect(resolution.approved).toBe(true);
    expect(resolution.reason).toBeUndefined();
  });

  it("should create a rejected resolution with reason", () => {
    const resolution: TeamParallelCapacityResolution = {
      teamId: "team-456",
      approvedParallelism: 0,
      approved: false,
      reason: "Insufficient capacity",
    };

    expect(resolution.approved).toBe(false);
    expect(resolution.reason).toBe("Insufficient capacity");
  });
});

// ============================================================================
// Team Frontmatter Types Tests
// ============================================================================

describe("TeamFrontmatter", () => {
  it("should create a valid team frontmatter", () => {
    const frontmatter: TeamFrontmatter = {
      id: "code-review-team",
      name: "Code Review Team",
      description: "A team for code review",
      enabled: "enabled",
      strategy: "parallel",
      skills: ["code-review", "git-workflow"],
      members: [
        {
          id: "reviewer-1",
          role: "Code Reviewer",
          description: "Reviews code",
          enabled: true,
        },
      ],
    };

    expect(frontmatter.id).toBe("code-review-team");
    expect(frontmatter.strategy).toBe("parallel");
    expect(frontmatter.skills).toContain("code-review");
    expect(frontmatter.members).toHaveLength(1);
  });

  it("should support disabled team", () => {
    const frontmatter: TeamFrontmatter = {
      id: "disabled-team",
      name: "Disabled Team",
      description: "A disabled team",
      enabled: "disabled",
      members: [],
    };

    expect(frontmatter.enabled).toBe("disabled");
    expect(frontmatter.strategy).toBeUndefined();
    expect(frontmatter.skills).toBeUndefined();
  });
});

describe("TeamMemberFrontmatter", () => {
  it("should create a valid member frontmatter", () => {
    const member: TeamMemberFrontmatter = {
      id: "tech-debt-detector",
      role: "Tech Debt Detector",
      description: "Detects technical debt",
      enabled: true,
      provider: "openai",
      model: "gpt-4",
      skills: ["code-review"],
    };

    expect(member.id).toBe("tech-debt-detector");
    expect(member.provider).toBe("openai");
    expect(member.model).toBe("gpt-4");
    expect(member.enabled).toBe(true);
  });

  it("should support minimal member configuration", () => {
    const member: TeamMemberFrontmatter = {
      id: "simple-member",
      role: "Simple Member",
      description: "A simple member",
    };

    expect(member.enabled).toBeUndefined();
    expect(member.provider).toBeUndefined();
    expect(member.model).toBeUndefined();
    expect(member.skills).toBeUndefined();
  });
});

describe("ParsedTeamMarkdown", () => {
  it("should create a valid parsed team markdown", () => {
    const parsed: ParsedTeamMarkdown = {
      frontmatter: {
        id: "test-team",
        name: "Test Team",
        description: "Test",
        enabled: "enabled",
        members: [],
      },
      content: "# Team Instructions\n\nThis is the team content.",
      filePath: "/teams/test-team.md",
    };

    expect(parsed.frontmatter.id).toBe("test-team");
    expect(parsed.content).toContain("Team Instructions");
    expect(parsed.filePath).toBe("/teams/test-team.md");
  });
});

// ============================================================================
// Type Compatibility Tests
// ============================================================================

describe("Type Compatibility", () => {
  it("should allow partial implementation of monitor interfaces", () => {
    // A minimal controller that only implements lifecycle
    const minimalLifecycle: TeamMonitorLifecycle = {
      markStarted: () => {},
      markFinished: () => {},
    };

    expect(typeof minimalLifecycle.markStarted).toBe("function");
    expect(typeof minimalLifecycle.markFinished).toBe("function");
  });

  it("should ensure ISP compliance - no forced dependencies", () => {
    // Code that only needs events should not need stream methods
    const eventsOnly: TeamMonitorEvents = {
      appendEvent: () => {},
      appendBroadcastEvent: () => {},
    };

    // Code that only needs stream should not need event methods
    const streamOnly: TeamMonitorStream = {
      appendChunk: () => {},
    };

    expect(eventsOnly).toBeDefined();
    expect(streamOnly).toBeDefined();
  });
});
