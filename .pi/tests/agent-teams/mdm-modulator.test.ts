/**
 * @file MDM Modulatorの単体テスト
 * @summary MDM変調器の動作を検証
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MDMModulator,
  createDefaultMDMConfig,
  type TeamMemberLike,
} from "../../extensions/agent-teams/mdm-modulator";
import type { TeamMemberResult } from "../../extensions/agent-teams/storage";

// Helper to create mock member results
function createMockMemberResult(
  memberId: string,
  confidence: number = 0.5,
  evidenceCount: number = 2,
  contradictionSignals: number = 0,
  conflictSignals: number = 0
): TeamMemberResult {
  return {
    memberId,
    success: true,
    result: "Test result",
    diagnostics: {
      confidence,
      evidenceCount,
      contradictionSignals,
      conflictSignals,
    },
  };
}

describe("MDMModulator", () => {
  let modulator: MDMModulator;

  beforeEach(() => {
    modulator = new MDMModulator();
  });

  describe("createDefaultMDMConfig", () => {
    it("should create config with 4 default dimensions", () => {
      const config = createDefaultMDMConfig();
      expect(config.dimensions).toHaveLength(4);
      expect(config.dimensions.map((d) => d.name)).toEqual([
        "confidence",
        "evidence",
        "stance",
        "temporal",
      ]);
    });

    it("should have weights that sum to 1.0", () => {
      const config = createDefaultMDMConfig();
      const totalWeight = config.dimensions.reduce((sum, d) => sum + d.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });

    it("should use sigmoid modulation function by default", () => {
      const config = createDefaultMDMConfig();
      expect(config.modulationFunction).toBe("sigmoid");
    });

    it("should have valid decay and learning rates", () => {
      const config = createDefaultMDMConfig();
      expect(config.decayRate).toBeGreaterThanOrEqual(0);
      expect(config.decayRate).toBeLessThanOrEqual(1);
      expect(config.learningRate).toBeGreaterThanOrEqual(0);
      expect(config.learningRate).toBeLessThanOrEqual(1);
    });
  });

  describe("initializePositions", () => {
    it("should initialize positions for all members", () => {
      const members: TeamMemberLike[] = [
        { id: "member1", role: "analyst" },
        { id: "member2", role: "reviewer" },
        { id: "member3", role: "implementer" },
      ];

      modulator.initializePositions(members);
      const state = modulator.getState();

      expect(state.positions.size).toBe(3);
      expect(state.positions.has("member1")).toBe(true);
      expect(state.positions.has("member2")).toBe(true);
      expect(state.positions.has("member3")).toBe(true);
    });

    it("should initialize positions at 0.5 for all dimensions", () => {
      const members: TeamMemberLike[] = [{ id: "member1" }];
      modulator.initializePositions(members);

      const state = modulator.getState();
      const position = state.positions.get("member1");

      expect(position).toBeDefined();
      expect(position).toHaveLength(4); // 4 dimensions

      // Each position should be 0.5 (neutral starting point)
      position!.forEach((val) => {
        expect(val).toBe(0.5);
      });
    });

    it("should initialize velocities to zero", () => {
      const members: TeamMemberLike[] = [{ id: "member1" }];
      modulator.initializePositions(members);

      const state = modulator.getState();
      const velocity = state.velocities.get("member1");

      expect(velocity).toBeDefined();
      velocity!.forEach((v) => expect(v).toBe(0));
    });

    it("should handle empty member list", () => {
      modulator.initializePositions([]);
      const state = modulator.getState();

      expect(state.positions.size).toBe(0);
      expect(state.velocities.size).toBe(0);
    });
  });

  describe("updateState", () => {
    it("should update positions based on member results", () => {
      const members: TeamMemberLike[] = [
        { id: "member1" },
        { id: "member2" },
      ];
      modulator.initializePositions(members);

      const results: TeamMemberResult[] = [
        createMockMemberResult("member1", 0.8, 4, 0, 0),
        createMockMemberResult("member2", 0.3, 1, 2, 1),
      ];

      const state = modulator.updateState(results, 1);

      expect(state.round).toBe(1);
      expect(state.positions.size).toBe(2);
    });

    it("should compute velocities for updated members", () => {
      const members: TeamMemberLike[] = [{ id: "member1" }];
      modulator.initializePositions(members);

      const results: TeamMemberResult[] = [
        createMockMemberResult("member1", 0.8, 4, 0, 0),
      ];

      const state = modulator.updateState(results, 1);
      const velocity = state.velocities.get("member1");

      expect(velocity).toBeDefined();
      // Velocity should not be all zeros after update (position changed)
      const hasMovement = velocity!.some((v) => v !== 0);
      expect(hasMovement).toBe(true);
    });

    it("should ignore results for unknown members", () => {
      modulator.initializePositions([{ id: "member1" }]);

      const results: TeamMemberResult[] = [
        createMockMemberResult("unknown_member", 0.8, 4, 0, 0),
      ];

      const state = modulator.updateState(results, 1);

      expect(state.positions.has("unknown_member")).toBe(false);
    });

    it("should set converged flag when positions stabilize", () => {
      const members: TeamMemberLike[] = [{ id: "member1" }];
      modulator.initializePositions(members);

      // Update with same values multiple times
      const results: TeamMemberResult[] = [
        createMockMemberResult("member1", 0.5, 2, 0, 0),
      ];

      modulator.updateState(results, 1);
      modulator.updateState(results, 2);
      modulator.updateState(results, 3);

      const state = modulator.getState();
      // After multiple updates with same values, should converge
      expect(state.converged).toBe(true);
    });
  });

  describe("modulateLinks", () => {
    it("should preserve all links when no positions available", () => {
      const baseLinks = new Map<string, string[]>();
      baseLinks.set("member1", ["member2", "member3"]);

      const state = modulator.getState();
      const modulated = modulator.modulateLinks(baseLinks, state);

      expect(modulated.get("member1")).toEqual(["member2", "member3"]);
    });

    it("should sort links by influence score", () => {
      const members: TeamMemberLike[] = [
        { id: "member1" },
        { id: "member2" },
        { id: "member3" },
      ];
      modulator.initializePositions(members);

      // Update positions to create different influence levels
      const results: TeamMemberResult[] = [
        createMockMemberResult("member2", 0.9, 5, 0, 0), // High influence
        createMockMemberResult("member3", 0.2, 0, 3, 2), // Low influence
      ];
      modulator.updateState(results, 1);

      const baseLinks = new Map<string, string[]>();
      baseLinks.set("member1", ["member2", "member3"]);

      const state = modulator.getState();
      const modulated = modulator.modulateLinks(baseLinks, state);

      // member2 should come first (higher influence)
      expect(modulated.get("member1")![0]).toBe("member2");
    });

    it("should handle empty base links", () => {
      modulator.initializePositions([{ id: "member1" }]);
      const baseLinks = new Map<string, string[]>();
      const state = modulator.getState();

      const modulated = modulator.modulateLinks(baseLinks, state);
      expect(modulated.size).toBe(0);
    });
  });

  describe("calculateInfluence", () => {
    it("should return 0 for unknown member", () => {
      const influence = modulator.calculateInfluence("unknown");
      expect(influence).toBe(0);
    });

    it("should return positive influence for initialized member", () => {
      modulator.initializePositions([{ id: "member1" }]);
      const influence = modulator.calculateInfluence("member1");
      expect(influence).toBeGreaterThan(0);
    });

    it("should return higher influence for higher confidence member", () => {
      const members: TeamMemberLike[] = [
        { id: "high_confidence" },
        { id: "low_confidence" },
      ];
      modulator.initializePositions(members);

      const results: TeamMemberResult[] = [
        createMockMemberResult("high_confidence", 0.9, 5, 0, 0),
        createMockMemberResult("low_confidence", 0.1, 0, 3, 2),
      ];
      modulator.updateState(results, 1);

      const highInfluence = modulator.calculateInfluence("high_confidence");
      const lowInfluence = modulator.calculateInfluence("low_confidence");

      expect(highInfluence).toBeGreaterThan(lowInfluence);
    });
  });

  describe("detectDeadlocks", () => {
    it("should return empty array when no members", () => {
      const deadlocks = modulator.detectDeadlocks();
      expect(deadlocks).toEqual([]);
    });

    it("should return empty array when no deadlocks", () => {
      modulator.initializePositions([
        { id: "member1" },
        { id: "member2" },
        { id: "member3" },
      ]);

      // Update with different positions
      const results: TeamMemberResult[] = [
        createMockMemberResult("member1", 0.9, 5, 0, 0),
        createMockMemberResult("member2", 0.5, 2, 0, 0),
        createMockMemberResult("member3", 0.1, 0, 3, 2),
      ];
      modulator.updateState(results, 1);

      const deadlocks = modulator.detectDeadlocks();
      expect(deadlocks).toHaveLength(0);
    });

    it("should detect deadlock when members have same position", () => {
      modulator.initializePositions([
        { id: "member1" },
        { id: "member2" },
      ]);

      // Both members with identical values
      const results: TeamMemberResult[] = [
        createMockMemberResult("member1", 0.5, 2, 0, 0),
        createMockMemberResult("member2", 0.5, 2, 0, 0),
      ];
      modulator.updateState(results, 1);

      const deadlocks = modulator.detectDeadlocks();
      expect(deadlocks.length).toBeGreaterThan(0);
      expect(deadlocks[0]).toContain("member1");
      expect(deadlocks[0]).toContain("member2");
    });
  });

  describe("reset", () => {
    it("should clear all state", () => {
      modulator.initializePositions([{ id: "member1" }]);
      modulator.updateState([createMockMemberResult("member1", 0.8, 4, 0, 0)], 1);

      modulator.reset();

      const state = modulator.getState();
      expect(state.positions.size).toBe(0);
      expect(state.velocities.size).toBe(0);
      expect(state.history).toEqual([]);
      expect(state.round).toBe(0);
      expect(state.converged).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("should return the configuration", () => {
      const config = modulator.getConfig();
      expect(config).toBeDefined();
      expect(config.dimensions).toBeDefined();
      expect(config.modulationFunction).toBeDefined();
    });

    it("should return custom configuration when provided", () => {
      const customConfig = createDefaultMDMConfig();
      customConfig.learningRate = 0.5;
      customConfig.decayRate = 0.2;

      const customModulator = new MDMModulator(customConfig);
      const config = customModulator.getConfig();

      expect(config.learningRate).toBe(0.5);
      expect(config.decayRate).toBe(0.2);
    });
  });
});
