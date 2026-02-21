/**
 * Unit tests for lib/verification-workflow.ts
 * Tests verification workflow with Inspector/Challenger pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isHighStakesTask,
  resolveVerificationConfig,
  shouldTriggerVerification,
  synthesizeVerificationResult,
  buildInspectorPrompt,
  buildChallengerPrompt,
  DEFAULT_VERIFICATION_CONFIG,
  HIGH_STAKES_PATTERNS,
  type VerificationContext,
  type InspectorOutput,
  type ChallengerOutput,
} from "../../../.pi/lib/verification-workflow.js";

// ============================================================================
// isHighStakesTask Tests
// ============================================================================

describe("isHighStakesTask", () => {
  describe("English patterns", () => {
    it("should return true for delete operations", () => {
      expect(isHighStakesTask("delete the user data")).toBe(true);
      expect(isHighStakesTask("remove all files")).toBe(true);
      expect(isHighStakesTask("drop the database table")).toBe(true);
      expect(isHighStakesTask("truncate the logs")).toBe(true);
      expect(isHighStakesTask("wipe the server")).toBe(true);
    });

    it("should return true for production environment tasks", () => {
      expect(isHighStakesTask("deploy to production")).toBe(true);
      expect(isHighStakesTask("release version 2.0")).toBe(true);
      expect(isHighStakesTask("update prod server")).toBe(true);
      expect(isHighStakesTask("push to live environment")).toBe(true);
    });

    it("should return true for security-related tasks", () => {
      expect(isHighStakesTask("update security settings")).toBe(true);
      expect(isHighStakesTask("fix authentication bug")).toBe(true);
      expect(isHighStakesTask("rotate password")).toBe(true);
      expect(isHighStakesTask("update credentials")).toBe(true);
      expect(isHighStakesTask("rotate the secret key")).toBe(true);
      expect(isHighStakesTask("fix vulnerability in code")).toBe(true);
      expect(isHighStakesTask("check for SQL injection")).toBe(true);
    });

    it("should return true for database operations", () => {
      expect(isHighStakesTask("run database migration")).toBe(true);
      expect(isHighStakesTask("alter table schema")).toBe(true);
      expect(isHighStakesTask("grant permissions")).toBe(true);
      expect(isHighStakesTask("revoke access")).toBe(true);
      expect(isHighStakesTask("reset the database")).toBe(true);
      expect(isHighStakesTask("rollback the migration")).toBe(true);
    });

    it("should return true for deployment tasks", () => {
      expect(isHighStakesTask("deploy to kubernetes")).toBe(true);
      expect(isHighStakesTask("scale up the containers")).toBe(true);
      expect(isHighStakesTask("apply terraform changes")).toBe(true);
      expect(isHighStakesTask("update cloudformation stack")).toBe(true);
    });

    it("should return true for irreversible operations", () => {
      expect(isHighStakesTask("force push to main")).toBe(true);
      expect(isHighStakesTask("overwrite the config")).toBe(true);
      expect(isHighStakesTask("bypass the safety check")).toBe(true);
      expect(isHighStakesTask("permanent deletion")).toBe(true);
    });

    it("should return false for normal tasks", () => {
      expect(isHighStakesTask("read the documentation")).toBe(false);
      expect(isHighStakesTask("add a new feature")).toBe(false);
      expect(isHighStakesTask("fix a typo in README")).toBe(false);
      expect(isHighStakesTask("update a unit test")).toBe(false);
      expect(isHighStakesTask("refactor the code")).toBe(false);
    });
  });

  describe("Japanese patterns", () => {
    it("should return true for Japanese delete operations", () => {
      expect(isHighStakesTask("ファイルを削除してください")).toBe(true);
      expect(isHighStakesTask("データを消去する")).toBe(true);
      expect(isHighStakesTask("ログを除去して")).toBe(true);
    });

    it("should return true for Japanese production tasks", () => {
      expect(isHighStakesTask("本番環境にデプロイ")).toBe(true);
      expect(isHighStakesTask("リリース作業")).toBe(true);
      expect(isHighStakesTask("実環境の更新")).toBe(true);
    });

    it("should return true for Japanese security tasks", () => {
      expect(isHighStakesTask("セキュリティ修正")).toBe(true);
      expect(isHighStakesTask("認証システムの更新")).toBe(true);
      expect(isHighStakesTask("パスワードを変更")).toBe(true);
      expect(isHighStakesTask("脆弱性の修正")).toBe(true);
    });

    it("should return true for Japanese database tasks", () => {
      expect(isHighStakesTask("マイグレーションを実行")).toBe(true);
      expect(isHighStakesTask("スキーマを変更")).toBe(true);
      expect(isHighStakesTask("テーブル変更")).toBe(true);
      expect(isHighStakesTask("カラム変更")).toBe(true);
    });

    it("should return true for Japanese deployment tasks", () => {
      expect(isHighStakesTask("デプロイしてください")).toBe(true);
      expect(isHighStakesTask("インフラの更新")).toBe(true);
      expect(isHighStakesTask("コンテナのスケーリング")).toBe(true);
    });

    it("should return true for Japanese irreversible tasks", () => {
      expect(isHighStakesTask("強制的に実行")).toBe(true);
      expect(isHighStakesTask("上書き保存")).toBe(true);
      expect(isHighStakesTask("不可逆的な変更")).toBe(true);
      expect(isHighStakesTask("危険な操作")).toBe(true);
    });

    it("should return false for normal Japanese tasks", () => {
      expect(isHighStakesTask("ドキュメントを読む")).toBe(false);
      expect(isHighStakesTask("機能を追加する")).toBe(false);
      expect(isHighStakesTask("タイポを修正")).toBe(false);
    });
  });
});

// ============================================================================
// resolveVerificationConfig Tests
// ============================================================================

describe("resolveVerificationConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return default config when no env vars are set", () => {
    delete process.env.PI_VERIFICATION_WORKFLOW_MODE;
    delete process.env.PI_VERIFICATION_MIN_CONFIDENCE;
    delete process.env.PI_VERIFICATION_MAX_DEPTH;

    const config = resolveVerificationConfig();

    expect(config.enabled).toBe(DEFAULT_VERIFICATION_CONFIG.enabled);
    expect(config.triggerModes).toEqual(DEFAULT_VERIFICATION_CONFIG.triggerModes);
    expect(config.fallbackBehavior).toBe(DEFAULT_VERIFICATION_CONFIG.fallbackBehavior);
    expect(config.maxVerificationDepth).toBe(DEFAULT_VERIFICATION_CONFIG.maxVerificationDepth);
    expect(config.minConfidenceToSkipVerification).toBe(DEFAULT_VERIFICATION_CONFIG.minConfidenceToSkipVerification);
  });

  it("should return disabled config when PI_VERIFICATION_WORKFLOW_MODE=disabled", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "disabled";

    const config = resolveVerificationConfig();

    expect(config.enabled).toBe(false);
  });

  it("should return disabled config when PI_VERIFICATION_WORKFLOW_MODE=0", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "0";

    const config = resolveVerificationConfig();

    expect(config.enabled).toBe(false);
  });

  it("should return strict config when PI_VERIFICATION_WORKFLOW_MODE=strict", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const config = resolveVerificationConfig();

    expect(config.enabled).toBe(true);
    expect(config.triggerModes).toContain("post-subagent");
    expect(config.triggerModes).toContain("post-team");
    expect(config.triggerModes).toContain("low-confidence");
    expect(config.triggerModes).toContain("high-stakes");
    expect(config.minConfidenceToSkipVerification).toBe(0.95);
    expect(config.fallbackBehavior).toBe("block");
    expect(config.challengerConfig.requiredFlaws).toBe(2);
  });

  it("should return minimal config when PI_VERIFICATION_WORKFLOW_MODE=minimal", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "minimal";

    const config = resolveVerificationConfig();

    expect(config.enabled).toBe(true);
    expect(config.triggerModes).toEqual(["high-stakes"]);
    expect(config.minConfidenceToSkipVerification).toBe(0.7);
    expect(config.fallbackBehavior).toBe("warn");
  });

  it("should respect PI_VERIFICATION_MIN_CONFIDENCE env var", () => {
    process.env.PI_VERIFICATION_MIN_CONFIDENCE = "0.8";

    const config = resolveVerificationConfig();

    expect(config.minConfidenceToSkipVerification).toBe(0.8);
  });

  it("should clamp PI_VERIFICATION_MIN_CONFIDENCE to valid range", () => {
    process.env.PI_VERIFICATION_MIN_CONFIDENCE = "1.5";

    const config = resolveVerificationConfig();

    expect(config.minConfidenceToSkipVerification).toBe(1);

    process.env.PI_VERIFICATION_MIN_CONFIDENCE = "-0.5";

    const config2 = resolveVerificationConfig();

    expect(config2.minConfidenceToSkipVerification).toBe(0);
  });

  it("should respect PI_VERIFICATION_MAX_DEPTH env var", () => {
    process.env.PI_VERIFICATION_MAX_DEPTH = "3";

    const config = resolveVerificationConfig();

    expect(config.maxVerificationDepth).toBe(3);
  });

  it("should clamp PI_VERIFICATION_MAX_DEPTH to valid range", () => {
    process.env.PI_VERIFICATION_MAX_DEPTH = "10";

    const config = resolveVerificationConfig();

    expect(config.maxVerificationDepth).toBe(5);

    process.env.PI_VERIFICATION_MAX_DEPTH = "0";

    const config2 = resolveVerificationConfig();

    expect(config2.maxVerificationDepth).toBe(1);
  });

  it("should ignore invalid PI_VERIFICATION_MIN_CONFIDENCE", () => {
    process.env.PI_VERIFICATION_MIN_CONFIDENCE = "invalid";

    const config = resolveVerificationConfig();

    expect(config.minConfidenceToSkipVerification).toBe(DEFAULT_VERIFICATION_CONFIG.minConfidenceToSkipVerification);
  });
});

// ============================================================================
// shouldTriggerVerification Tests
// ============================================================================

describe("shouldTriggerVerification", () => {
  const defaultContext: VerificationContext = {
    task: "normal task",
    triggerMode: "post-subagent",
  };

  beforeEach(() => {
    // Enable verification by default for tests that need it
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "minimal";
    delete process.env.PI_VERIFICATION_MIN_CONFIDENCE;
    delete process.env.PI_VERIFICATION_MAX_DEPTH;
  });

  afterEach(() => {
    delete process.env.PI_VERIFICATION_WORKFLOW_MODE;
  });

  it("should not trigger when verification is disabled", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "disabled";

    const result = shouldTriggerVerification("some output", 0.5, defaultContext);

    expect(result.trigger).toBe(false);
    expect(result.reason).toBe("Verification workflow disabled");
  });

  it("should skip verification when confidence is high", () => {
    // Use strict mode to get minConfidenceToSkipVerification = 0.95
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const result = shouldTriggerVerification("some output", 0.96, defaultContext);

    expect(result.trigger).toBe(false);
    expect(result.reason).toContain("exceeds threshold");
  });

  it("should not skip high-stakes task even with high confidence", () => {
    // Need a mode with high-stakes trigger mode enabled
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const highStakesContext: VerificationContext = {
      task: "delete all user data",
      triggerMode: "post-subagent",
    };

    const result = shouldTriggerVerification("some output", 0.96, highStakesContext);

    expect(result.trigger).toBe(true);
    expect(result.reason).toBe("High-stakes task detected");
  });

  it("should trigger when confidence is low", () => {
    // Use strict mode to get low-confidence trigger
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const result = shouldTriggerVerification("some output", 0.5, defaultContext);

    expect(result.trigger).toBe(true);
    expect(result.reason).toBe("Low confidence: 0.5");
  });

  it("should trigger for high-stakes task", () => {
    // minimal mode only triggers on high-stakes
    const highStakesContext: VerificationContext = {
      task: "deploy to production",
      triggerMode: "post-subagent",
    };

    const result = shouldTriggerVerification("some output", 0.8, highStakesContext);

    expect(result.trigger).toBe(true);
    expect(result.reason).toBe("High-stakes task detected");
  });

  it("should trigger for post-subagent mode", () => {
    // Use strict mode to get post-subagent trigger
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const context: VerificationContext = {
      task: "normal task",
      triggerMode: "post-subagent",
    };

    const result = shouldTriggerVerification(
      "CLAIM: test\nRESULT: test\nEVIDENCE: some evidence with enough detail to avoid overconfidence detection\nCONFIDENCE: 0.8",
      0.8,
      context
    );

    expect(result.trigger).toBe(true);
    expect(result.reason).toBe("Post-subagent verification triggered");
  });

  it("should trigger for post-team mode", () => {
    // Use strict mode to get post-team trigger
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const context: VerificationContext = {
      task: "normal task",
      triggerMode: "post-team",
    };

    const result = shouldTriggerVerification(
      "CLAIM: test\nRESULT: test\nEVIDENCE: some evidence with enough detail to avoid overconfidence detection\nCONFIDENCE: 0.8",
      0.8,
      context
    );

    expect(result.trigger).toBe(true);
    expect(result.reason).toBe("Post-team verification triggered");
  });

  describe("output pattern detection", () => {
    // Note: checkOutputPatternsは実装の詳細に依存するため、
    // 統合テストとして別途検証する
    it("should trigger for missing alternatives", () => {
      // Use strict mode to get pattern detection
      process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

      const output = "CLAIM: This is the only solution\nCONCLUSION: We must proceed\nCONFIDENCE: 0.95";

      const result = shouldTriggerVerification(output, 0.85, defaultContext);

      expect(result.trigger).toBe(true);
      expect(result.reason).toContain("Missing alternative");
    });
  });
});

// ============================================================================
// synthesizeVerificationResult Tests
// ============================================================================

describe("synthesizeVerificationResult", () => {
  const defaultContext: VerificationContext = {
    task: "test task",
    triggerMode: "explicit",
  };

  beforeEach(() => {
    delete process.env.PI_VERIFICATION_WORKFLOW_MODE;
  });

  it("should return pass when no inspector or challenger output", () => {
    const result = synthesizeVerificationResult(
      "output",
      0.8,
      undefined,
      undefined,
      defaultContext
    );

    expect(result.finalVerdict).toBe("pass");
    expect(result.confidence).toBe(0.8);
    expect(result.requiresReRun).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("should return pass-with-warnings for medium suspicion", () => {
    const inspectorOutput: InspectorOutput = {
      suspicionLevel: "medium",
      detectedPatterns: [],
      summary: "Some concerns found",
      recommendation: "Review recommended",
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      inspectorOutput,
      undefined,
      defaultContext
    );

    expect(result.finalVerdict).toBe("pass-with-warnings");
    expect(result.confidence).toBe(0.7); // Reduced from 0.8
    expect(result.warnings).toHaveLength(1);
  });

  it("should return needs-review for high suspicion", () => {
    const inspectorOutput: InspectorOutput = {
      suspicionLevel: "high",
      detectedPatterns: [],
      summary: "Major concerns detected",
      recommendation: "Manual review required",
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      inspectorOutput,
      undefined,
      defaultContext
    );

    expect(result.finalVerdict).toBe("needs-review");
    expect(result.confidence).toBe(0.5); // Reduced
    expect(result.warnings).toHaveLength(1);
  });

  it("should return needs-review for critical pattern detection", () => {
    const inspectorOutput: InspectorOutput = {
      suspicionLevel: "low",
      detectedPatterns: [
        {
          pattern: "claim-result-mismatch",
          location: "lines 1-5",
          severity: "high",
          description: "Critical mismatch",
        },
      ],
      summary: "Critical issue found",
      recommendation: "Fix required",
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      inspectorOutput,
      undefined,
      defaultContext
    );

    expect(result.finalVerdict).toBe("needs-review");
  });

  it("should return blocked for critical pattern with block fallback", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const inspectorOutput: InspectorOutput = {
      suspicionLevel: "low",
      detectedPatterns: [
        {
          pattern: "claim-result-mismatch",
          location: "lines 1-5",
          severity: "high",
          description: "Critical mismatch",
        },
      ],
      summary: "Critical issue found",
      recommendation: "Fix required",
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      inspectorOutput,
      undefined,
      defaultContext
    );

    expect(result.finalVerdict).toBe("blocked");
    expect(result.requiresReRun).toBe(true);
  });

  it("should return pass-with-warnings for moderate challenger severity", () => {
    const challengerOutput: ChallengerOutput = {
      challengedClaims: [
        {
          claim: "Test claim",
          flaw: "Minor flaw",
          evidenceGap: "Missing evidence",
          alternative: "Alternative interpretation",
          severity: "moderate",
        },
      ],
      overallSeverity: "moderate",
      summary: "Moderate issues found",
      suggestedRevisions: ["Revise claim"],
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      undefined,
      challengerOutput,
      defaultContext
    );

    expect(result.finalVerdict).toBe("pass-with-warnings");
    expect(result.confidence).toBe(0.6);
  });

  it("should return fail for critical challenger severity", () => {
    const challengerOutput: ChallengerOutput = {
      challengedClaims: [
        {
          claim: "Test claim",
          flaw: "Critical flaw",
          evidenceGap: "No evidence",
          alternative: "Completely different interpretation",
          severity: "critical",
        },
      ],
      overallSeverity: "critical",
      summary: "Critical flaws found",
      suggestedRevisions: ["Rewrite entire section"],
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      undefined,
      challengerOutput,
      defaultContext
    );

    expect(result.finalVerdict).toBe("fail");
    expect(result.confidence).toBe(0.3);
  });

  it("should return blocked for critical severity with strict mode", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const challengerOutput: ChallengerOutput = {
      challengedClaims: [
        {
          claim: "Test claim",
          flaw: "Critical flaw",
          evidenceGap: "No evidence",
          alternative: "Different interpretation",
          severity: "critical",
        },
      ],
      overallSeverity: "critical",
      summary: "Critical issues",
      suggestedRevisions: ["Fix needed"],
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      undefined,
      challengerOutput,
      defaultContext
    );

    expect(result.finalVerdict).toBe("blocked");
    expect(result.requiresReRun).toBe(true);
  });

  it("should warn when max verification depth is reached", () => {
    const contextWithDepth: VerificationContext = {
      ...defaultContext,
      previousVerifications: 3,
    };

    const challengerOutput: ChallengerOutput = {
      challengedClaims: [],
      overallSeverity: "minor",
      summary: "Minor issues",
      suggestedRevisions: [],
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      undefined,
      challengerOutput,
      contextWithDepth
    );

    expect(result.warnings).toContain("Max verification depth reached - manual review recommended");
  });

  it("should combine inspector and challenger outputs", () => {
    const inspectorOutput: InspectorOutput = {
      suspicionLevel: "medium",
      detectedPatterns: [],
      summary: "Some concerns",
      recommendation: "Review",
    };

    const challengerOutput: ChallengerOutput = {
      challengedClaims: [
        {
          claim: "Test",
          flaw: "Issue",
          evidenceGap: "Gap",
          alternative: "Alt",
          severity: "moderate",
        },
      ],
      overallSeverity: "moderate",
      summary: "Moderate challenges",
      suggestedRevisions: ["Fix"],
    };

    const result = synthesizeVerificationResult(
      "output",
      0.8,
      inspectorOutput,
      challengerOutput,
      defaultContext
    );

    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBe(0.6); // Min of 0.7 (inspector) and 0.6 (challenger)
  });
});

// ============================================================================
// buildInspectorPrompt Tests
// ============================================================================

describe("buildInspectorPrompt", () => {
  const defaultContext: VerificationContext = {
    task: "test task",
    triggerMode: "explicit",
    agentId: "test-agent",
  };

  it("should include target output in prompt", () => {
    const targetOutput = "This is the target output to inspect";

    const prompt = buildInspectorPrompt(targetOutput, defaultContext);

    expect(prompt).toContain(targetOutput);
  });

  it("should include task context", () => {
    const prompt = buildInspectorPrompt("output", defaultContext);

    expect(prompt).toContain("test task");
    expect(prompt).toContain("test-agent");
  });

  it("should include inspection checklist", () => {
    const prompt = buildInspectorPrompt("output", defaultContext);

    expect(prompt).toContain("INSPECTION CHECKLIST");
    expect(prompt).toContain("CLAIM-RESULT Mismatch");
    expect(prompt).toContain("Overconfidence");
  });

  it("should include output format requirements", () => {
    const prompt = buildInspectorPrompt("output", defaultContext);

    expect(prompt).toContain("INSPECTION_REPORT");
    expect(prompt).toContain("SUSPICION_LEVEL");
    expect(prompt).toContain("SUMMARY");
    expect(prompt).toContain("RECOMMENDATION");
  });

  it("should include focus areas", () => {
    const prompt = buildInspectorPrompt("output", defaultContext);

    expect(prompt).toContain("Claims without sufficient evidence");
    expect(prompt).toContain("Logical inconsistencies");
    expect(prompt).toContain("Confirmation bias");
  });

  it("should use teamId when agentId is not available", () => {
    const teamContext: VerificationContext = {
      task: "team task",
      triggerMode: "post-team",
      teamId: "test-team",
    };

    const prompt = buildInspectorPrompt("output", teamContext);

    expect(prompt).toContain("test-team");
  });
});

// ============================================================================
// buildChallengerPrompt Tests
// ============================================================================

describe("buildChallengerPrompt", () => {
  const defaultContext: VerificationContext = {
    task: "test task",
    triggerMode: "explicit",
    agentId: "test-agent",
  };

  beforeEach(() => {
    delete process.env.PI_VERIFICATION_WORKFLOW_MODE;
  });

  it("should include target output in prompt", () => {
    const targetOutput = "This is the target output to challenge";

    const prompt = buildChallengerPrompt(targetOutput, defaultContext);

    expect(prompt).toContain(targetOutput);
  });

  it("should include task context", () => {
    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("test task");
    expect(prompt).toContain("test-agent");
  });

  it("should include challenge categories", () => {
    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("CHALLENGE CATEGORIES");
    expect(prompt).toContain("Evidence Gaps");
    expect(prompt).toContain("Logical Flaws");
    expect(prompt).toContain("Hidden Assumptions");
  });

  it("should include output format requirements", () => {
    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("CHALLENGED_CLAIM");
    expect(prompt).toContain("FLAW");
    expect(prompt).toContain("EVIDENCE_GAP");
    expect(prompt).toContain("ALTERNATIVE");
    expect(prompt).toContain("SEVERITY");
  });

  it("should include overall severity requirement", () => {
    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("OVERALL_SEVERITY");
  });

  it("should include suggested revisions requirement", () => {
    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("SUGGESTED_REVISIONS");
  });

  it("should include minimum flaws requirement", () => {
    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("at least 1 flaw");
  });

  it("should use strict mode required flaws count when configured", () => {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";

    const prompt = buildChallengerPrompt("output", defaultContext);

    expect(prompt).toContain("at least 2 flaw");
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe("DEFAULT_VERIFICATION_CONFIG", () => {
  it("should have expected default values", () => {
    expect(DEFAULT_VERIFICATION_CONFIG.enabled).toBe(false);
    expect(DEFAULT_VERIFICATION_CONFIG.triggerModes).toContain("post-subagent");
    expect(DEFAULT_VERIFICATION_CONFIG.triggerModes).toContain("low-confidence");
    expect(DEFAULT_VERIFICATION_CONFIG.triggerModes).toContain("high-stakes");
    expect(DEFAULT_VERIFICATION_CONFIG.fallbackBehavior).toBe("warn");
    expect(DEFAULT_VERIFICATION_CONFIG.maxVerificationDepth).toBe(2);
    expect(DEFAULT_VERIFICATION_CONFIG.minConfidenceToSkipVerification).toBe(0.9);
  });

  it("should have complete challenger config", () => {
    expect(DEFAULT_VERIFICATION_CONFIG.challengerConfig.minConfidenceToChallenge).toBe(0.85);
    expect(DEFAULT_VERIFICATION_CONFIG.challengerConfig.requiredFlaws).toBe(1);
    expect(DEFAULT_VERIFICATION_CONFIG.challengerConfig.enabledCategories).toContain("evidence-gap");
    expect(DEFAULT_VERIFICATION_CONFIG.challengerConfig.enabledCategories).toContain("logical-flaw");
  });

  it("should have complete inspector config", () => {
    expect(DEFAULT_VERIFICATION_CONFIG.inspectorConfig.suspicionThreshold).toBe("medium");
    expect(DEFAULT_VERIFICATION_CONFIG.inspectorConfig.requiredPatterns).toContain("claim-result-mismatch");
    expect(DEFAULT_VERIFICATION_CONFIG.inspectorConfig.autoTriggerOnCollapseSignals).toBe(true);
  });
});

describe("HIGH_STAKES_PATTERNS", () => {
  it("should be an array of RegExp", () => {
    expect(Array.isArray(HIGH_STAKES_PATTERNS)).toBe(true);
    HIGH_STAKES_PATTERNS.forEach((pattern) => {
      expect(pattern).toBeInstanceOf(RegExp);
    });
  });

  it("should contain patterns for destructive operations", () => {
    const deletePattern = HIGH_STAKES_PATTERNS.find((p) => p.source.includes("delete"));
    expect(deletePattern).toBeDefined();
  });

  it("should contain patterns for security operations", () => {
    const securityPattern = HIGH_STAKES_PATTERNS.find((p) => p.source.includes("security"));
    expect(securityPattern).toBeDefined();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Verification Workflow Integration", () => {
  beforeEach(() => {
    // Enable verification for integration tests
    process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";
  });

  afterEach(() => {
    delete process.env.PI_VERIFICATION_WORKFLOW_MODE;
  });

  it("should detect high-stakes task and trigger verification", () => {
    const context: VerificationContext = {
      task: "deploy to production and delete old data",
      triggerMode: "high-stakes",
    };

    // First, verify it is detected as high-stakes
    expect(isHighStakesTask(context.task)).toBe(true);

    // Then, verify it triggers verification
    const result = shouldTriggerVerification("output", 0.85, context);

    expect(result.trigger).toBe(true);
    expect(result.reason).toBe("High-stakes task detected");
  });

  it("should build complete verification flow", () => {
    const context: VerificationContext = {
      task: "critical security update",
      triggerMode: "explicit",
      agentId: "security-agent",
    };

    const targetOutput = "CLAIM: Security fix is complete\nRESULT: All vulnerabilities patched\nEVIDENCE: Ran security scan\nCONFIDENCE: 0.9";

    // Build prompts
    const inspectorPrompt = buildInspectorPrompt(targetOutput, context);
    const challengerPrompt = buildChallengerPrompt(targetOutput, context);

    expect(inspectorPrompt).toContain(targetOutput);
    expect(challengerPrompt).toContain(targetOutput);

    // Simulate inspector output
    const inspectorOutput: InspectorOutput = {
      suspicionLevel: "low",
      detectedPatterns: [],
      summary: "No major issues",
      recommendation: "Proceed with caution",
    };

    // Synthesize result
    const result = synthesizeVerificationResult(
      targetOutput,
      0.9,
      inspectorOutput,
      undefined,
      context
    );

    expect(result.triggered).toBe(true);
    expect(result.confidence).toBe(0.9);
  });

  it("should handle strict mode workflow end-to-end", () => {
    const context: VerificationContext = {
      task: "database migration",
      triggerMode: "high-stakes",
    };

    // Verify strict mode is applied
    const config = resolveVerificationConfig();
    expect(config.fallbackBehavior).toBe("block");

    // Simulate critical challenger output
    const challengerOutput: ChallengerOutput = {
      challengedClaims: [
        {
          claim: "Migration is safe",
          flaw: "No rollback plan",
          evidenceGap: "No testing evidence",
          alternative: "Test in staging first",
          severity: "critical",
        },
      ],
      overallSeverity: "critical",
      summary: "Critical flaw: missing rollback strategy",
      suggestedRevisions: ["Add rollback plan", "Test in staging"],
    };

    const result = synthesizeVerificationResult(
      "output",
      0.85,
      undefined,
      challengerOutput,
      context
    );

    expect(result.finalVerdict).toBe("blocked");
    expect(result.requiresReRun).toBe(true);
  });
});
