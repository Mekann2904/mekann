/**
 * @abdd.meta
 * @path .pi/tests/lib/long-running-support.test.ts
 * @role Test suite for long-running thinking session management
 * @why Verify session lifecycle, stagnation detection, and creative disruption
 * @related ../../lib/long-running-support.ts, ../../lib/thinking-process.ts
 * @public_api Tests for all exported functions
 * @invariants Tests should not depend on external state
 * @side_effects None expected (all state is internal)
 * @failure_modes None expected
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  manageThinkingSession,
  checkThinkingStagnation,
  injectCreativeDisruption,
  getSessionStats,
  getAvailableDisruptionTypes,
  evaluateDisruptionResult,
  type ThinkingSession,
  type StagnationCheck,
  type CreativeDisruption,
  type SessionOptions,
} from "../../lib/long-running-support";
import type { ThinkingStep, ThinkingMode, ThinkingPhase } from "../../lib/thinking-process";

// Mock selectThinkingMode
vi.mock("../../lib/thinking-process", () => ({
  selectThinkingMode: vi.fn(() => "analytical" as ThinkingMode),
}));

describe("long-running-support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create a thinking step
  function createStep(
    thought: string,
    mode: ThinkingMode = "analytical",
    phase: ThinkingPhase = "problem-discovery",
    confidence: number = 0.5
  ): ThinkingStep {
    return {
      thought,
      mode,
      phase,
      confidence,
      timestamp: Date.now(),
    };
  }

  // Helper to create a session with history
  function createSessionWithHistory(
    thoughts: string[],
    mode: ThinkingMode = "analytical",
    phase: ThinkingPhase = "problem-discovery",
    confidence: number = 0.5
  ): ThinkingSession {
    const session = manageThinkingSession("Test task", {
      initialMode: mode,
      initialPhase: phase,
    });

    thoughts.forEach((thought) => {
      session.updateSession(createStep(thought, mode, phase, confidence));
    });

    return session.session;
  }

  describe("manageThinkingSession", () => {
    it("manageThinkingSession_createsSession_withDefaultOptions", () => {
      const manager = manageThinkingSession("Test task");

      expect(manager.session).toBeDefined();
      expect(manager.session.task).toBe("Test task");
      expect(manager.session.status).toBe("active");
      expect(manager.session.history).toEqual([]);
      expect(manager.session.stagnationCount).toBe(0);
      expect(manager.session.disruptionHistory).toEqual([]);
    });

    it("manageThinkingSession_createsSession_withCustomOptions", () => {
      const options: SessionOptions = {
        initialPhase: "strategy-development",
        initialMode: "creative",
        stagnationThreshold: 0.2,
        maxStagnationCount: 5,
        autoDisruption: false,
      };

      const manager = manageThinkingSession("Test task", options);

      expect(manager.session.currentPhase).toBe("strategy-development");
      expect(manager.session.currentMode).toBe("creative");
    });

    it("manageThinkingSession_generatesUniqueId", () => {
      const manager1 = manageThinkingSession("Task 1");
      const manager2 = manageThinkingSession("Task 2");

      expect(manager1.session.id).not.toBe(manager2.session.id);
    });

    it("manageThinkingSession_returnsSessionManager_withAllMethods", () => {
      const manager = manageThinkingSession("Test task");

      expect(typeof manager.updateSession).toBe("function");
      expect(typeof manager.checkStagnation).toBe("function");
      expect(typeof manager.injectDisruption).toBe("function");
      expect(typeof manager.advancePhase).toBe("function");
      expect(typeof manager.completeSession).toBe("function");
      expect(typeof manager.getSessionSummary).toBe("function");
    });

    it("updateSession_addsStepToHistory", () => {
      const manager = manageThinkingSession("Test task");
      const step = createStep("First thought");

      manager.updateSession(step);

      expect(manager.session.history).toHaveLength(1);
      expect(manager.session.history[0]).toEqual(step);
    });

    it("updateSession_updatesLastUpdateTime", () => {
      const manager = manageThinkingSession("Test task");
      const beforeUpdate = manager.session.lastUpdateTime;

      // Small delay to ensure time difference
      const step = createStep("First thought");
      manager.updateSession(step);

      expect(manager.session.lastUpdateTime.getTime()).toBeGreaterThanOrEqual(
        beforeUpdate.getTime()
      );
    });

    it("updateSession_updatesCurrentModeAndPhase", () => {
      const manager = manageThinkingSession("Test task");

      manager.updateSession(
        createStep("Thought", "critical", "solution-evaluation", 0.8)
      );

      expect(manager.session.currentMode).toBe("critical");
      expect(manager.session.currentPhase).toBe("solution-evaluation");
    });

    it("updateSession_detectsStagnation_andIncrementsCount", () => {
      const manager = manageThinkingSession("Test task", {
        stagnationThreshold: 0.01,
        maxStagnationCount: 10, // High enough to avoid auto-disruption
        autoDisruption: false, // Disable auto-disruption
      });

      // Add similar thoughts to trigger repetition stagnation
      for (let i = 0; i < 5; i++) {
        manager.updateSession(
          createStep(
            "This is a similar thought about the problem",
            "analytical",
            "problem-discovery",
            0.5
          )
        );
      }

      // Stagnation should be detected and count incremented
      expect(manager.session.stagnationCount).toBeGreaterThan(0);
    });

    it("updateSession_autoDisruption_whenMaxStagnationExceeded", () => {
      const manager = manageThinkingSession("Test task", {
        stagnationThreshold: 0.01,
        maxStagnationCount: 1,
        autoDisruption: true,
      });

      // Add similar thoughts to trigger stagnation
      for (let i = 0; i < 10; i++) {
        manager.updateSession(
          createStep(
            "This is a similar thought about the problem",
            "analytical",
            "problem-discovery",
            0.5
          )
        );
      }

      // Auto disruption should have been triggered
      expect(manager.session.disruptionHistory.length).toBeGreaterThanOrEqual(1);
    });

    it("checkStagnation_returnsStagnationCheck", () => {
      const manager = manageThinkingSession("Test task");

      const result = manager.checkStagnation();

      expect(result).toHaveProperty("isStagnant");
      expect(result).toHaveProperty("stagnationType");
      expect(result).toHaveProperty("evidence");
      expect(result).toHaveProperty("recommendedAction");
    });

    it("injectDisruption_addsToDisruptionHistory", () => {
      const manager = manageThinkingSession("Test task");

      const disruption = manager.injectDisruption();

      expect(manager.session.disruptionHistory).toHaveLength(1);
      expect(manager.session.disruptionHistory[0]).toEqual(disruption);
    });

    it("injectDisruption_resetsStagnationCount", () => {
      const manager = manageThinkingSession("Test task");

      // Manually set stagnation count
      manager.session.stagnationCount = 5;

      manager.injectDisruption();

      expect(manager.session.stagnationCount).toBe(0);
    });

    it("injectDisruption_changesStatusToDisrupted", () => {
      const manager = manageThinkingSession("Test task");

      manager.injectDisruption();

      expect(manager.session.status).toBe("disrupted");
    });

    it("injectDisruption_withForcedType_usesSpecifiedType", () => {
      const manager = manageThinkingSession("Test task");

      const disruption = manager.injectDisruption("mode-switch");

      expect(disruption.type).toBe("mode-switch");
    });

    it("advancePhase_movesToNextPhase", () => {
      const manager = manageThinkingSession("Test task", {
        initialPhase: "problem-discovery",
      });

      expect(manager.session.currentPhase).toBe("problem-discovery");

      manager.advancePhase();
      expect(manager.session.currentPhase).toBe("problem-formulation");

      manager.advancePhase();
      expect(manager.session.currentPhase).toBe("strategy-development");

      manager.advancePhase();
      expect(manager.session.currentPhase).toBe("solution-evaluation");
    });

    it("advancePhase_staysAtLastPhase", () => {
      const manager = manageThinkingSession("Test task", {
        initialPhase: "solution-evaluation",
      });

      manager.advancePhase();

      expect(manager.session.currentPhase).toBe("solution-evaluation");
    });

    it("completeSession_setsStatusToCompleted", () => {
      const manager = manageThinkingSession("Test task");

      const completed = manager.completeSession();

      expect(completed.status).toBe("completed");
      expect(manager.session.status).toBe("completed");
    });

    it("getSessionSummary_returnsFormattedString", () => {
      const manager = manageThinkingSession("Test task");
      manager.updateSession(createStep("First thought"));

      const summary = manager.getSessionSummary();

      expect(summary).toContain("Test task");
      expect(summary).toContain("active");
      expect(summary).toContain("ステップ数");
    });
  });

  describe("checkThinkingStagnation", () => {
    it("checkThinkingStagnation_withLessThan3Steps_returnsNotStagnant", () => {
      const session = createSessionWithHistory(["Thought 1", "Thought 2"]);

      const result = checkThinkingStagnation(session);

      expect(result.isStagnant).toBe(false);
      expect(result.evidence).toContain("履歴が不足");
    });

    it("checkThinkingStagnation_withRepetitiveThoughts_detectsRepetition", () => {
      const session = createSessionWithHistory([
        "This is a thought about the problem",
        "This is a thought about the problem",
        "This is a thought about the problem",
      ]);

      const result = checkThinkingStagnation(session);

      expect(result.isStagnant).toBe(true);
      expect(result.stagnationType).toBe("repetition");
    });

    it("checkThinkingStagnation_withLowProgress_detectsLowProgress", () => {
      const manager = manageThinkingSession("Test task", {
        stagnationThreshold: 0.5,
      });

      // Add 5 steps with very low confidence change and distinct content
      const thoughts = [
        "Initial exploration of the problem domain space",
        "Second analysis of the core system components",
        "Third investigation of the technical constraints",
        "Fourth review of the implementation options",
        "Fifth assessment of the solution feasibility",
      ];

      for (let i = 0; i < 5; i++) {
        manager.updateSession(
          createStep(
            thoughts[i],
            ["analytical", "critical", "practical", "creative", "social"][i] as ThinkingMode,
            "problem-discovery",
            0.5 + i * 0.01 // Very small progress
          )
        );
      }

      const result = checkThinkingStagnation(manager.session);

      expect(result.isStagnant).toBe(true);
      expect(result.stagnationType).toBe("low-progress");
    });

    it("checkThinkingStagnation_withModeFixation_detectsFixation", () => {
      const manager = manageThinkingSession("Test task");

      // Add 5 steps with same mode but distinctly different content
      const thoughts = [
        "Analyzing the problem structure and components",
        "Examining the data flow and dependencies",
        "Investigating potential bottlenecks in the system",
        "Reviewing architectural patterns and best practices",
        "Evaluating trade-offs between different approaches",
      ];

      for (let i = 0; i < 5; i++) {
        manager.updateSession(
          createStep(
            thoughts[i],
            "analytical", // Same mode
            "problem-discovery",
            0.3 + i * 0.15 // Good progress to avoid low-progress detection
          )
        );
      }

      const result = checkThinkingStagnation(manager.session);

      expect(result.isStagnant).toBe(true);
      expect(result.stagnationType).toBe("mode-fixation");
    });

    it("checkThinkingStagnation_withHighConfidencePlateau_detectsPlateau", () => {
      const manager = manageThinkingSession("Test task");

      // Add steps with high, stable confidence and mode variety
      // Need enough variation to avoid low-progress detection (threshold 0.1)
      // but maintain high average (>0.85) and max (>0.9) for plateau detection
      const thoughts = [
        "Comprehensive analysis confirming the solution approach",
        "Detailed validation of the implementation strategy",
        "Final verification of all critical success factors",
        "Confirmation of alignment with business requirements",
        "Validation of technical feasibility and risks",
      ];

      const modes: ThinkingMode[] = ["analytical", "critical", "practical", "creative", "social"];

      for (let i = 0; i < 5; i++) {
        manager.updateSession(
          createStep(
            thoughts[i],
            modes[i],
            "problem-discovery",
            0.85 + i * 0.03 // 0.85, 0.88, 0.91, 0.94, 0.97 - variation > 0.1
          )
        );
      }

      const result = checkThinkingStagnation(manager.session);

      expect(result.isStagnant).toBe(true);
      expect(result.stagnationType).toBe("confidence-plateau");
    });

    it("checkThinkingStagnation_withTimeSinceLastUpdate_detectsStagnation", () => {
      const session = createSessionWithHistory([
        "First unique thought about the domain",
        "Second distinct analysis of the problem",
        "Third different perspective on the solution",
      ]);

      // Manually set lastUpdateTime to 6 minutes ago
      session.lastUpdateTime = new Date(Date.now() - 6 * 60 * 1000);

      const result = checkThinkingStagnation(session);

      expect(result.isStagnant).toBe(true);
      // Time-based stagnation reports low-progress type
      expect(result.stagnationType).toBe("low-progress");
    });

    it("checkThinkingStagnation_withGoodProgress_returnsNotStagnant", () => {
      const manager = manageThinkingSession("Test task");

      // Add steps with moderate progress (avoiding confidence-plateau at high values)
      // and mode variety, with distinctly different content to avoid repetition detection
      const thoughts = [
        "Initial analysis of the problem domain and constraints",
        "Critical review of potential solution approaches",
        "Practical implementation strategy for the chosen path",
        "Creative exploration of alternative viewpoints",
        "Social impact assessment and stakeholder considerations",
      ];

      const modes: ThinkingMode[] = [
        "analytical",
        "critical",
        "practical",
        "creative",
        "social",
      ];

      for (let i = 0; i < 5; i++) {
        manager.updateSession(
          createStep(
            thoughts[i],
            modes[i],
            "problem-discovery",
            0.4 + i * 0.1 // Moderate progress: 0.4 -> 0.8, avoids 0.9+ plateau
          )
        );
      }

      const result = checkThinkingStagnation(manager.session);

      expect(result.isStagnant).toBe(false);
    });
  });

  describe("injectCreativeDisruption", () => {
    it("injectCreativeDisruption_returnsDisruptionWithRequiredFields", () => {
      const session = createSessionWithHistory(["Thought 1", "Thought 2"]);

      const disruption = injectCreativeDisruption(session);

      expect(disruption.timestamp).toBeInstanceOf(Date);
      expect(disruption.type).toBeDefined();
      expect(disruption.content).toBeDefined();
      expect(disruption.result).toBeDefined();
    });

    it("injectCreativeDisruption_withForcedType_returnsSpecifiedType", () => {
      const session = createSessionWithHistory(["Thought 1"]);

      const disruption = injectCreativeDisruption(session, "mode-switch");

      expect(disruption.type).toBe("mode-switch");
    });

    it("injectCreativeDisruption_modeSwitch_generatesModeContent", () => {
      const session = createSessionWithHistory(["Thought 1"], "analytical");

      const disruption = injectCreativeDisruption(session, "mode-switch");

      expect(disruption.content).toContain("思考モード切り替え");
      // Content mentions current mode and suggests a different mode
      expect(disruption.content).toContain("モードに切り替えてください");
    });

    it("injectCreativeDisruption_assumptionChallenge_generatesAssumptionContent", () => {
      const manager = manageThinkingSession("Test task");

      // Add steps with assumption pattern
      for (let i = 0; i < 6; i++) {
        manager.updateSession(
          createStep(
            `前提として、このアプローチが最適だと考えます。 thought ${i}`,
            "analytical",
            "problem-discovery",
            0.5
          )
        );
      }

      const disruption = injectCreativeDisruption(manager.session, "assumption-challenge");

      expect(disruption.content).toContain("前提への挑戦");
    });

    it("injectCreativeDisruption_analogy_generatesAnalogyContent", () => {
      const session = createSessionWithHistory(["Thought 1"]);

      const disruption = injectCreativeDisruption(session, "analogy");

      expect(disruption.content).toContain("アナロジー");
    });

    it("injectCreativeDisruption_randomInjection_generatesRandomQuestion", () => {
      const session = createSessionWithHistory(["Thought 1"]);

      const disruption = injectCreativeDisruption(session, "random-injection");

      expect(disruption.content).toContain("ランダム問い");
    });

    it("injectCreativeDisruption_withoutForcedType_selectsApplicableStrategy", () => {
      const session = createSessionWithHistory(["Thought 1", "Thought 2", "Thought 3"]);

      const disruption = injectCreativeDisruption(session);

      expect([
        "mode-switch",
        "assumption-challenge",
        "analogy",
        "random-injection",
      ]).toContain(disruption.type);
    });
  });

  describe("getSessionStats", () => {
    it("getSessionStats_withEmptyHistory_returnsZeroStats", () => {
      const manager = manageThinkingSession("Test task");

      const stats = getSessionStats(manager.session);

      expect(stats.stepCount).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.disruptionCount).toBe(0);
    });

    it("getSessionStats_withHistory_returnsCorrectStats", () => {
      const manager = manageThinkingSession("Test task");

      manager.updateSession(createStep("Thought 1", "analytical", "problem-discovery", 0.5));
      manager.updateSession(createStep("Thought 2", "critical", "problem-formulation", 0.7));
      manager.updateSession(createStep("Thought 3", "practical", "strategy-development", 0.9));

      const stats = getSessionStats(manager.session);

      expect(stats.stepCount).toBe(3);
      expect(stats.avgConfidence).toBeCloseTo(0.7, 1);
    });

    it("getSessionStats_calculatesModeDistribution", () => {
      const manager = manageThinkingSession("Test task");

      manager.updateSession(createStep("Thought 1", "analytical", "problem-discovery", 0.5));
      manager.updateSession(createStep("Thought 2", "analytical", "problem-discovery", 0.6));
      manager.updateSession(createStep("Thought 3", "critical", "problem-discovery", 0.7));

      const stats = getSessionStats(manager.session);

      expect(stats.modeDistribution["analytical"]).toBe(2);
      expect(stats.modeDistribution["critical"]).toBe(1);
      expect(stats.modeDistribution["creative"]).toBe(0);
    });

    it("getSessionStats_includesDisruptionCount", () => {
      const manager = manageThinkingSession("Test task");

      manager.updateSession(createStep("Thought 1"));
      manager.injectDisruption();
      manager.injectDisruption();

      const stats = getSessionStats(manager.session);

      expect(stats.disruptionCount).toBe(2);
    });

    it("getSessionStats_calculatesDuration", () => {
      const manager = manageThinkingSession("Test task");

      // Simulate time passage
      manager.session.startTime = new Date(Date.now() - 5000);

      const stats = getSessionStats(manager.session);

      expect(stats.duration).toBeGreaterThanOrEqual(5000);
    });
  });

  describe("getAvailableDisruptionTypes", () => {
    it("getAvailableDisruptionTypes_returnsAllTypes", () => {
      const types = getAvailableDisruptionTypes();

      expect(types).toHaveLength(4);
      expect(types.map((t) => t.type)).toContain("mode-switch");
      expect(types.map((t) => t.type)).toContain("assumption-challenge");
      expect(types.map((t) => t.type)).toContain("analogy");
      expect(types.map((t) => t.type)).toContain("random-injection");
    });

    it("getAvailableDisruptionTypes_includesDescriptions", () => {
      const types = getAvailableDisruptionTypes();

      types.forEach((type) => {
        expect(type.description).toBeDefined();
        expect(type.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe("evaluateDisruptionResult", () => {
    it("evaluateDisruptionResult_withFewSteps_returnsNeutral", () => {
      const manager = manageThinkingSession("Test task");
      manager.updateSession(createStep("Thought 1"));

      const disruption: CreativeDisruption = {
        timestamp: new Date(Date.now() - 1000),
        type: "mode-switch",
        content: "Test disruption",
        result: "neutral",
      };

      const result = evaluateDisruptionResult(disruption, manager.session);

      expect(result.result).toBe("neutral");
    });

    it("evaluateDisruptionResult_withPositiveProgress_returnsProductive", () => {
      const manager = manageThinkingSession("Test task");

      const disruptionTime = Date.now() - 2000;

      // Steps before disruption
      manager.updateSession(createStep("Thought 1", "analytical", "problem-discovery", 0.3));

      // Steps after disruption with progress
      manager.updateSession(
        createStep("Thought 2", "critical", "problem-discovery", 0.3)
      );
      manager.updateSession(
        createStep("Thought 3", "creative", "problem-formulation", 0.5)
      );

      const disruption: CreativeDisruption = {
        timestamp: new Date(disruptionTime),
        type: "mode-switch",
        content: "Test disruption",
        result: "neutral",
      };

      const result = evaluateDisruptionResult(disruption, manager.session);

      expect(result.result).toBe("productive");
    });

    it("evaluateDisruptionResult_withNegativeProgress_returnsCounterproductive", () => {
      const manager = manageThinkingSession("Test task");

      const disruptionTime = Date.now() - 2000;

      // Steps after disruption with no progress and no mode change
      manager.updateSession(
        createStep("Thought 1", "analytical", "problem-discovery", 0.5)
      );
      manager.updateSession(
        createStep("Thought 2", "analytical", "problem-discovery", 0.3)
      );

      const disruption: CreativeDisruption = {
        timestamp: new Date(disruptionTime),
        type: "mode-switch",
        content: "Test disruption",
        result: "neutral",
      };

      const result = evaluateDisruptionResult(disruption, manager.session);

      expect(result.result).toBe("counterproductive");
    });
  });

  describe("integration tests", () => {
    it("full session lifecycle with stagnation and disruption", () => {
      const manager = manageThinkingSession("Solve complex problem", {
        stagnationThreshold: 0.1,
        maxStagnationCount: 2,
        autoDisruption: true,
      });

      // Initial phase
      expect(manager.session.status).toBe("active");
      expect(manager.session.currentPhase).toBe("problem-discovery");

      // Add steps with gradual progress
      for (let i = 0; i < 3; i++) {
        manager.updateSession(
          createStep(
            `Exploring the problem space ${i}`,
            "analytical",
            "problem-discovery",
            0.3 + i * 0.1
          )
        );
      }

      // Advance phase
      manager.advancePhase();
      expect(manager.session.currentPhase).toBe("problem-formulation");

      // Add more steps
      for (let i = 0; i < 3; i++) {
        manager.updateSession(
          createStep(
            `Formulating the problem ${i}`,
            "critical",
            "problem-formulation",
            0.6 + i * 0.1
          )
        );
      }

      // Check stagnation
      const stagnation = manager.checkStagnation();
      expect(stagnation.isStagnant).toBeDefined();

      // Complete session
      const completed = manager.completeSession();
      expect(completed.status).toBe("completed");

      // Get summary
      const summary = manager.getSessionSummary();
      expect(summary).toContain("Solve complex problem");
      expect(summary).toContain("completed");
    });

    it("session with forced disruptions at different phases", () => {
      const manager = manageThinkingSession("Test task");

      // Add initial steps
      manager.updateSession(createStep("Initial thought"));

      // Force disruptions at different phases
      const disruptions: CreativeDisruption[] = [];

      manager.advancePhase();
      disruptions.push(manager.injectDisruption("mode-switch"));

      manager.advancePhase();
      disruptions.push(manager.injectDisruption("analogy"));

      manager.advancePhase();
      disruptions.push(manager.injectDisruption("random-injection"));

      expect(disruptions).toHaveLength(3);
      expect(disruptions[0].type).toBe("mode-switch");
      expect(disruptions[1].type).toBe("analogy");
      expect(disruptions[2].type).toBe("random-injection");

      // Verify disruption history
      expect(manager.session.disruptionHistory).toHaveLength(3);
    });

    it("session stats reflect complete journey", () => {
      const manager = manageThinkingSession("Complex task");

      // Add steps in different modes
      const modes: ThinkingMode[] = [
        "analytical",
        "creative",
        "critical",
        "practical",
        "social",
      ];

      modes.forEach((mode, i) => {
        manager.updateSession(
          createStep(`Thought in ${mode} mode`, mode, "problem-discovery", 0.3 + i * 0.15)
        );
      });

      // Inject disruption
      manager.injectDisruption();

      // Complete
      manager.completeSession();

      const stats = getSessionStats(manager.session);

      expect(stats.stepCount).toBe(5);
      expect(stats.disruptionCount).toBe(1);
      expect(stats.finalStatus).toBe("completed");

      // Mode distribution should have entries
      const totalModes = Object.values(stats.modeDistribution).reduce((a, b) => a + b, 0);
      expect(totalModes).toBe(5);
    });
  });
});
