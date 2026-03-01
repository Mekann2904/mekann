/**
 * @jest-environment node
 */
import { describe, it, expect } from "vitest";

// Import from the re-export file to verify it correctly forwards all exports
import {
  // Types
  type VerificationTriggerMode,
  type FallbackBehavior,
  type ChallengeCategory,
  type VerificationVerdict,
  type VerificationResult,
  type VerificationContext,
  type VerificationWorkflowConfig,

  // Constants
  DEFAULT_VERIFICATION_CONFIG,
  HIGH_STAKES_PATTERNS,

  // Configuration
  resolveVerificationConfig,
  getVerificationModeFromEnv,
  REPOAUD_VERIFICATION_CONFIG,

  // Pattern Detection
  detectOverconfidence,
  detectMissingAlternatives,
  isHighStakesTask,
  checkOutputPatterns,

  // Core Workflow
  shouldTriggerVerification,
  synthesizeVerificationResult,
} from "../../lib/verification-workflow.js";

describe("verification-workflow (re-export)", () => {
  describe("type exports", () => {
    it("should_export_verification_trigger_mode_type", () => {
      // This test verifies the type is exported by using it
      const mode: VerificationTriggerMode = "repo-audit";
      expect(mode).toBe("repo-audit");
    });

    it("should_export_fallback_behavior_type", () => {
      const behavior: FallbackBehavior = "skip-verification";
      expect(behavior).toBe("skip-verification");
    });

    it("should_export_challenge_category_type", () => {
      const category: ChallengeCategory = "logical-fallacy";
      expect(category).toBe("logical-fallacy");
    });

    it("should_export_verification_verdict_type", () => {
      const verdict: VerificationVerdict = "verified";
      expect(verdict).toBe("verified");
    });
  });

  describe("constant exports", () => {
    it("should_export_default_verification_config", () => {
      expect(DEFAULT_VERIFICATION_CONFIG).toBeDefined();
      expect(typeof DEFAULT_VERIFICATION_CONFIG).toBe("object");
    });

    it("should_export_high_stakes_patterns", () => {
      expect(HIGH_STAKES_PATTERNS).toBeDefined();
      expect(Array.isArray(HIGH_STAKES_PATTERNS)).toBe(true);
    });
  });

  describe("configuration function exports", () => {
    it("should_export_resolve_verification_config", () => {
      expect(typeof resolveVerificationConfig).toBe("function");
    });

    it("should_export_get_verification_mode_from_env", () => {
      expect(typeof getVerificationModeFromEnv).toBe("function");
    });

    it("should_export_repoaud_verification_config", () => {
      expect(REPOAUD_VERIFICATION_CONFIG).toBeDefined();
    });
  });

  describe("pattern detection function exports", () => {
    it("should_export_detect_overconfidence", () => {
      expect(typeof detectOverconfidence).toBe("function");
    });

    it("should_export_detect_missing_alternatives", () => {
      expect(typeof detectMissingAlternatives).toBe("function");
    });

    it("should_export_is_high_stakes_task", () => {
      expect(typeof isHighStakesTask).toBe("function");
    });

    it("should_export_check_output_patterns", () => {
      expect(typeof checkOutputPatterns).toBe("function");
    });
  });

  describe("core workflow function exports", () => {
    it("should_export_should_trigger_verification", () => {
      expect(typeof shouldTriggerVerification).toBe("function");
    });

    it("should_export_synthesize_verification_result", () => {
      expect(typeof synthesizeVerificationResult).toBe("function");
    });
  });

  describe("function behavior verification", () => {
    it("should_allow_calling_is_high_stakes_task", () => {
      // Arrange
      const highStakesTask = "Delete all files in the repository";
      const normalTask = "Add a comment to the code";

      // Act & Assert
      expect(isHighStakesTask(highStakesTask)).toBe(true);
      expect(isHighStakesTask(normalTask)).toBe(false);
    });

    it("should_allow_calling_detect_overconfidence", () => {
      // Arrange
      const confidentOutput = "This is definitely the correct solution without any doubt.";

      // Act
      const result = detectOverconfidence(confidentOutput);

      // Assert
      expect(result).toBeDefined();
    });

    it("should_allow_calling_get_verification_mode_from_env", () => {
      // Act
      const mode = getVerificationModeFromEnv();

      // Assert
      expect(mode).toBeDefined();
    });

    it("should_allow_calling_should_trigger_verification", () => {
      // Arrange
      const context: VerificationContext = {
        output: "Test output",
        taskType: "implementation",
        triggerMode: "repo-audit",
      };

      // Act
      const result = shouldTriggerVerification(context);

      // Assert
      expect(typeof result).toBe("boolean");
    });
  });
});
