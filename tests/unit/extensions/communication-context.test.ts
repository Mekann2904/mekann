/**
 * Tests for communication-context.ts
 */

import { describe, it, expect } from "vitest";
import {
  summarizeForContext,
  buildCommunicationContextV2,
  buildPrecomputedContextMap,
  sanitizeForJson,
  COMMUNICATION_CONTEXT_OTHER_LIMIT,
} from "../../../.pi/extensions/agent-teams/communication-context";
import type { TeamMember, TeamDefinition } from "../../../.pi/extensions/agent-teams/storage";

describe("communication-context", () => {
  describe("summarizeForContext", () => {
    it("should return text as-is if within limit", () => {
      const text = "This is a short summary.";
      expect(summarizeForContext(text, 100)).toBe(text);
    });

    it("should truncate at sentence boundary", () => {
      const text = "First sentence. Second sentence. Third sentence.";
      const result = summarizeForContext(text, 25);
      expect(result).toBe("First sentence.");
    });

    it("should truncate with ellipsis if no sentence boundary", () => {
      const text = "abcdefghijklmnopqrstuvwxyz";
      const result = summarizeForContext(text, 10);
      expect(result.length).toBe(10);
      expect(result.endsWith("...")).toBe(true);
    });

    it("should handle empty text", () => {
      expect(summarizeForContext("", 100)).toBe("");
    });

    it("should handle Japanese sentences", () => {
      const text = "第一文。第二文。第三文。";
      const result = summarizeForContext(text, 20);
      expect(result.length).toBeLessThanOrEqual(20);
      expect(result).toContain("第一文");
    });
  });

  describe("sanitizeForJson", () => {
    it("should remove control characters", () => {
      const text = "Hello\x00World\x1F";
      expect(sanitizeForJson(text)).toBe("HelloWorld");
    });

    it("should preserve normal text", () => {
      const text = "Normal text with 日本語";
      expect(sanitizeForJson(text)).toBe(text);
    });
  });

  describe("buildPrecomputedContextMap", () => {
    it("should build context map from results", () => {
      const results = [
        {
          memberId: "research",
          role: "Researcher",
          status: "completed",
          summary: "Found relevant files",
          output: "CLAIM: This is a claim",
          diagnostics: { confidence: 0.8, evidenceCount: 3 },
        },
      ];

      const map = buildPrecomputedContextMap(results);

      expect(map.size).toBe(1);
      const ctx = map.get("research");
      expect(ctx?.memberId).toBe("research");
      expect(ctx?.role).toBe("Researcher");
      expect(ctx?.status).toBe("completed");
      expect(ctx?.confidence).toBe(0.8);
      expect(ctx?.evidenceCount).toBe(3);
    });

    it("should extract claim from output", () => {
      const results = [
        {
          memberId: "build",
          role: "Implementer",
          status: "completed",
          output: "SUMMARY: Test\nCLAIM: Implement feature X\nRESULT: Done",
        },
      ];

      const map = buildPrecomputedContextMap(results);
      expect(map.get("build")?.claim).toBe("Implement feature X");
    });

    it("should handle missing fields", () => {
      const results = [
        {
          memberId: "review",
          role: "Reviewer",
          status: "failed",
        },
      ];

      const map = buildPrecomputedContextMap(results);
      expect(map.get("review")?.summary).toBe("");
      expect(map.get("review")?.claim).toBe("");
    });
  });

  describe("buildCommunicationContextV2", () => {
    const createTeam = (): TeamDefinition => ({
      id: "test-team",
      name: "Test Team",
      description: "Test team for unit tests",
      enabled: "enabled",
      members: [
        { id: "research", role: "Researcher", description: "Research", enabled: true },
        { id: "build", role: "Implementer", description: "Build", enabled: true },
        { id: "review", role: "Reviewer", description: "Review", enabled: true },
      ],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });

    const createContextMap = () => {
      const results = [
        {
          memberId: "research",
          role: "Researcher",
          status: "completed",
          summary: "Found files",
          output: "CLAIM: This is research claim",
          diagnostics: { confidence: 0.9, evidenceCount: 5 },
        },
        {
          memberId: "build",
          role: "Implementer",
          status: "completed",
          summary: "Built feature",
          output: "CLAIM: This is build claim",
          diagnostics: { confidence: 0.7, evidenceCount: 2 },
        },
      ];
      return buildPrecomputedContextMap(results);
    };

    const commIdEntries = [
      { memberId: "research", commId: "research" },
      { memberId: "build", commId: "build" },
      { memberId: "review", commId: "review" },
    ];

    it("should produce valid JSON in data block", () => {
      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 1,
        partnerIds: ["build", "review"],
        contextMap: createContextMap(),
        commIdEntries,
      });

      const dataMatch = context.match(/```communication-data\n([\s\S]*?)\n```/);
      expect(dataMatch).toBeTruthy();

      const data = JSON.parse(dataMatch![1]);
      expect(data.round).toBe(1);
      expect(data.partners).toHaveLength(2);
    });

    it("should include memberId and commId in partners", () => {
      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 0,
        partnerIds: ["build"],
        contextMap: createContextMap(),
        commIdEntries,
      });

      const dataMatch = context.match(/```communication-data\n([\s\S]*?)\n```/);
      const data = JSON.parse(dataMatch![1]);

      expect(data.partners[0].memberId).toBe("build");
      expect(data.partners[0].commId).toBe("build");
    });

    it("should include instructions section", () => {
      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 0,
        partnerIds: ["build"],
        contextMap: createContextMap(),
        commIdEntries,
      });

      expect(context).toContain("## 連携指示");
      expect(context).toContain("CITED:");
      expect(context).toContain("STANCE:");
    });

    it("should require CITED and STANCE in output format", () => {
      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 0,
        partnerIds: ["build"],
        contextMap: createContextMap(),
        commIdEntries,
      });

      expect(context).toContain("REF(x)");
      expect(context).toContain("CLAIM(x:y)");
      expect(context).toContain("agree|disagree|neutral|unknown");
    });

    it("should include team and member info", () => {
      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 1,
        partnerIds: [],
        contextMap: createContextMap(),
        commIdEntries,
      });

      const dataMatch = context.match(/```communication-data\n([\s\S]*?)\n```/);
      const data = JSON.parse(dataMatch![1]);

      expect(data.teamId).toBe("test-team");
      expect(data.memberId).toBe("research");
      expect(data.memberRole).toBe("Researcher");
    });

    it("should handle empty partners", () => {
      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 0,
        partnerIds: [],
        contextMap: createContextMap(),
        commIdEntries,
      });

      const dataMatch = context.match(/```communication-data\n([\s\S]*?)\n```/);
      const data = JSON.parse(dataMatch![1]);

      expect(data.partners).toHaveLength(0);
    });

    it("should handle others section when available", () => {
      const fullContextMap = new Map([
        ["research", { memberId: "research", role: "Researcher", status: "completed", summary: "Found files", claim: "Research claim", confidence: 0.9, evidenceCount: 5 }],
        ["build", { memberId: "build", role: "Implementer", status: "completed", summary: "Built feature", claim: "Build claim", confidence: 0.7, evidenceCount: 2 }],
        ["review", { memberId: "review", role: "Reviewer", status: "completed", summary: "Reviewed code", claim: "Review claim", confidence: 0.8, evidenceCount: 3 }],
      ]);

      const context = buildCommunicationContextV2({
        team: createTeam(),
        member: createTeam().members[0],
        round: 0,
        partnerIds: ["build"],
        contextMap: fullContextMap,
        commIdEntries,
      });

      const dataMatch = context.match(/```communication-data\n([\s\S]*?)\n```/);
      const data = JSON.parse(dataMatch![1]);

      if (data.others) {
        expect(data.others.length).toBeLessThanOrEqual(COMMUNICATION_CONTEXT_OTHER_LIMIT);
      }
    });
  });
});
