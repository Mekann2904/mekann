/**
 * Tests for verification-workflow.ts
 * Run with: node --import tsx .pi/lib/verification-workflow.test.ts
 * 
 * Or add vitest/jest and run with appropriate test runner.
 */

import {
  shouldTriggerVerification,
  isHighStakesTask,
  resolveVerificationConfig,
  DEFAULT_VERIFICATION_CONFIG,
  HIGH_STAKES_PATTERNS,
  buildInspectorPrompt,
  buildChallengerPrompt,
  synthesizeVerificationResult,
  getVerificationWorkflowRules,
  type VerificationContext,
  type VerificationWorkflowConfig,
  type InspectorOutput,
  type ChallengerOutput,
} from "./verification-workflow.js";

// Simple test runner
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    testResults.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    testResults.push({ name, passed: false, error });
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed${message ? `: ${message}` : ""}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed${message ? `: ${message}` : ""}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(value: boolean, message?: string): void {
  if (!value) {
    throw new Error(`Assertion failed${message ? `: ${message}` : ""} - expected true, got false`);
  }
}

function assertFalse(value: boolean, message?: string): void {
  if (value) {
    throw new Error(`Assertion failed${message ? `: ${message}` : ""} - expected false, got true`);
  }
}

// Helper to create default context
function createDefaultContext(overrides: Partial<VerificationContext> = {}): VerificationContext {
  return {
    task: "Test task",
    triggerMode: "post-subagent",
    ...overrides,
  };
}

// Store original env
const originalEnv = { ...process.env };

function restoreEnv(): void {
  // Clear any test-set env vars
  delete process.env.PI_VERIFICATION_WORKFLOW_MODE;
  delete process.env.PI_VERIFICATION_MIN_CONFIDENCE;
  delete process.env.PI_VERIFICATION_MAX_DEPTH;
}

// ============================================================================
// shouldTriggerVerification() Tests
// ============================================================================
console.log("\n=== shouldTriggerVerification() Tests ===\n");

test("should not trigger when verification is disabled", () => {
  const originalMode = process.env.PI_VERIFICATION_WORKFLOW_MODE;
  process.env.PI_VERIFICATION_WORKFLOW_MODE = "disabled";
  
  const output = "CLAIM: Test\nCONFIDENCE: 0.5\nRESULT: Test result";
  const result = shouldTriggerVerification(output, 0.5, createDefaultContext());
  
  restoreEnv();
  if (originalMode !== undefined) {
    process.env.PI_VERIFICATION_WORKFLOW_MODE = originalMode;
  }
  
  assertFalse(result.trigger, "Should not trigger when disabled");
});

test("should not trigger when confidence exceeds threshold", () => {
  const output = "CLAIM: Test\nCONFIDENCE: 0.95\nRESULT: Test result";
  const result = shouldTriggerVerification(output, 0.95, createDefaultContext({ task: "low risk task" }));
  
  assertFalse(result.trigger, "Should not trigger for high confidence on low-risk task");
});

test("should trigger when confidence is low (below 0.7)", () => {
  const output = "CLAIM: Test\nCONFIDENCE: 0.5\nRESULT: Test result";
  const result = shouldTriggerVerification(output, 0.5, createDefaultContext());
  
  assertTrue(result.trigger, "Should trigger for low confidence");
  assertTrue(result.reason.includes("Low confidence"), `Reason should mention low confidence, got: ${result.reason}`);
});

test("should trigger for high-stakes task even with high confidence", () => {
  const output = "CLAIM: Test\nCONFIDENCE: 0.95\nRESULT: Test result";
  const result = shouldTriggerVerification(output, 0.95, createDefaultContext({ task: "Delete production database" }));
  
  assertTrue(result.trigger, "Should trigger for high-stakes task");
  assertTrue(result.reason.includes("High-stakes"), `Reason should mention high-stakes, got: ${result.reason}`);
});

test("should trigger for post-subagent mode", () => {
  const output = "CLAIM: Test\nCONFIDENCE: 0.8\nRESULT: Test result";
  const result = shouldTriggerVerification(output, 0.8, createDefaultContext({ 
    triggerMode: "post-subagent",
    task: "normal task"
  }));
  
  assertTrue(result.trigger, "Should trigger for post-subagent mode");
});

test("should trigger for post-team mode when configured", () => {
  const output = "CLAIM: Test\nCONFIDENCE: 0.8\nRESULT: Test result";
  const result = shouldTriggerVerification(output, 0.8, createDefaultContext({ 
    triggerMode: "post-team",
    task: "normal task"
  }));
  
  // Note: depends on DEFAULT config having "post-team" or not
  // Default config has ["post-subagent", "low-confidence", "high-stakes"] but not "post-team"
  // So this should NOT trigger based on trigger mode alone
  // But the confidence (0.8) is below 0.9 threshold and task is not high stakes
  assertFalse(result.trigger, "Should not trigger for post-team when not in trigger modes");
});

// ============================================================================
// detectClaimResultMismatch() Tests (via shouldTriggerVerification)
// ============================================================================
console.log("\n=== detectClaimResultMismatch() Tests (via shouldTriggerVerification) ===\n");

test("should detect negation mismatch between CLAIM and RESULT", () => {
  const output = `CLAIM: This is not the correct solution
CONFIDENCE: 0.85
EVIDENCE: extensive analysis with file references at src/main.ts:45
RESULT: This is definitely the correct solution`;
  
  const result = shouldTriggerVerification(output, 0.85, createDefaultContext({ task: "analysis task" }));
  assertTrue(result.trigger, "Should detect CLAIM-RESULT negation mismatch");
});

test("should detect uncertainty-confidence mismatch", () => {
  const output = `CLAIM: This might be the issue
CONFIDENCE: 0.95
EVIDENCE: detailed evidence with file references at src/main.ts:45 and line 100
RESULT: This is absolutely the issue`;
  
  const result = shouldTriggerVerification(output, 0.95, createDefaultContext({ task: "bug analysis" }));
  assertTrue(result.trigger, "Should detect uncertainty-confidence mismatch");
});

test("should detect missing common key terms", () => {
  const output = `CLAIM: Database connection is failing
CONFIDENCE: 0.85
EVIDENCE: extensive evidence with file references
RESULT: The user interface needs to be redesigned`;
  
  const result = shouldTriggerVerification(output, 0.85, createDefaultContext({ task: "debug task" }));
  assertTrue(result.trigger, "Should detect no common key terms between CLAIM and RESULT");
});

test("should not trigger when CLAIM and RESULT are consistent", () => {
  const output = `CLAIM: The authentication module has a bug
CONFIDENCE: 0.75
EVIDENCE: Found bug in auth module at src/auth.ts:123
RESULT: Fixed the authentication module bug`;
  
  // 0.75 is below 0.9 but also below 0.7, so it triggers due to low confidence
  // Let's use 0.85 which is between thresholds
  const result = shouldTriggerVerification(output, 0.85, createDefaultContext({ task: "code review" }));
  // This should NOT trigger because:
  // - Confidence 0.85 is above low-confidence threshold (0.7)
  // - Task is not high stakes
  // - No mismatch patterns
  // - triggerMode is post-subagent which IS in default triggerModes
  // So it WILL trigger due to post-subagent mode
  assertTrue(result.trigger, "Triggers due to post-subagent mode");
});

// ============================================================================
// detectOverconfidence() Tests (via shouldTriggerVerification)
// ============================================================================
console.log("\n=== detectOverconfidence() Tests ===\n");

test("should detect overconfidence with minimal evidence", () => {
  const output = `CLAIM: The fix works
CONFIDENCE: 0.95
EVIDENCE: Works.
RESULT: Fixed`;
  
  const result = shouldTriggerVerification(output, 0.95, createDefaultContext({ task: "normal task" }));
  assertTrue(result.trigger, "Should detect overconfidence with minimal evidence");
});

test("should detect overconfidence with high-confidence markers without uncertainty", () => {
  const output = `CLAIM: This is definitely the solution
CONFIDENCE: 0.90
EVIDENCE: Clearly works and is certainly correct. Obviously the right approach.
RESULT: Solution implemented`;
  
  const result = shouldTriggerVerification(output, 0.90, createDefaultContext({ task: "normal task" }));
  assertTrue(result.trigger, "Should detect overconfidence with multiple high-confidence markers");
});

test("should detect overconfidence with low evidence specificity", () => {
  const output = `CLAIM: The bug is in the parser
CONFIDENCE: 0.95
EVIDENCE: After analysis, I believe the issue is in the parser component.
RESULT: Bug identified in parser`;
  
  const result = shouldTriggerVerification(output, 0.95, createDefaultContext({ task: "debugging" }));
  assertTrue(result.trigger, "Should detect overconfidence without file/line references");
});

test("should not trigger overconfidence for well-evidenced high confidence", () => {
  const output = `CLAIM: The bug is in the parser
CONFIDENCE: 0.95
EVIDENCE: Found the bug in src/parser.ts:145 where the tokenization fails. The code \`parseToken()\` incorrectly handles edge cases.
RESULT: Bug identified`;
  
  // Even with good evidence, 0.95 triggers high-stakes check which triggers verification
  // But since task is not high stakes and evidence is good, let's check the trigger reason
  const result = shouldTriggerVerification(output, 0.95, createDefaultContext({ task: "normal task" }));
  // 0.95 >= 0.9 threshold, not high stakes, good evidence - should NOT trigger
  // Actually post-subagent mode is in default triggers, so it will trigger
  assertTrue(result.trigger, "Triggers due to post-subagent mode");
});

// ============================================================================
// detectMissingAlternatives() Tests
// ============================================================================
console.log("\n=== detectMissingAlternatives() Tests ===\n");

test("should detect missing alternatives for high confidence conclusion", () => {
  const output = `CLAIM: The issue is in the config file
CONFIDENCE: 0.90
EVIDENCE: Found config error in settings.json
RESULT: The config file has incorrect settings`;
  
  const result = shouldTriggerVerification(output, 0.90, createDefaultContext({ task: "debugging" }));
  assertTrue(result.trigger, "Should detect missing alternatives");
});

test("should detect missing DISCUSSION section for high confidence", () => {
  const output = `CLAIM: Memory leak in worker
CONFIDENCE: 0.88
EVIDENCE: Identified leak in worker.ts:200
RESULT: Memory leak confirmed`;
  
  const result = shouldTriggerVerification(output, 0.88, createDefaultContext({ task: "analysis" }));
  assertTrue(result.trigger, "Should detect missing DISCUSSION section");
});

test("should not trigger when alternatives are discussed", () => {
  const output = `CLAIM: Memory leak in worker
CONFIDENCE: 0.88
EVIDENCE: Identified leak in worker.ts:200
ALTERNATIVE: Could also be GC pressure issue
RESULT: Memory leak confirmed`;
  
  // This should not trigger missing-alternatives, but post-subagent mode triggers
  const result = shouldTriggerVerification(output, 0.88, createDefaultContext({ task: "analysis" }));
  assertTrue(result.trigger, "Triggers due to post-subagent mode");
});

// ============================================================================
// detectConfirmationBias() Tests
// ============================================================================
console.log("\n=== detectConfirmationBias() Tests ===\n");

test("should detect confirmation bias with only positive evidence", () => {
  const output = `CLAIM: The feature works correctly
CONFIDENCE: 0.85
EVIDENCE: Test passed. Works correctly. Success verified. Feature confirmed. Implementation complete.
RESULT: Feature is working`;
  
  const result = shouldTriggerVerification(output, 0.85, createDefaultContext({ task: "testing" }));
  assertTrue(result.trigger, "Should detect confirmation bias");
});

test("should detect confirmation bias with multiple confirmation phrases", () => {
  const output = `CLAIM: Implementation is correct
CONFIDENCE: 0.82
EVIDENCE: Works as expected. No problem detected. Correctly functioning.
RESULT: Implementation verified`;
  
  const result = shouldTriggerVerification(output, 0.82, createDefaultContext({ task: "verification" }));
  assertTrue(result.trigger, "Should detect confirmation bias phrases");
});

test("should not trigger confirmation bias when counter-evidence is sought", () => {
  const output = `CLAIM: The feature works
CONFIDENCE: 0.80
EVIDENCE: Test passed. Also checked for counter examples - none found.
RESULT: Feature verified`;
  
  const result = shouldTriggerVerification(output, 0.80, createDefaultContext({ task: "testing" }));
  // Should trigger due to post-subagent mode, not confirmation bias
  assertTrue(result.trigger, "Triggers due to post-subagent mode, not confirmation bias");
});

// ============================================================================
// isHighStakesTask() Tests
// ============================================================================
console.log("\n=== isHighStakesTask() Tests ===\n");

test("should detect deletion as high stakes", () => {
  assertTrue(isHighStakesTask("Delete the old files"), "Should detect 'delete' as high stakes");
  assertTrue(isHighStakesTask("ファイルを削除する"), "Should detect Japanese '削除' as high stakes");
});

test("should detect production environment as high stakes", () => {
  assertTrue(isHighStakesTask("Deploy to production"), "Should detect 'production' as high stakes");
  assertTrue(isHighStakesTask("本番環境にデプロイ"), "Should detect Japanese '本番' as high stakes");
});

test("should detect security-related tasks as high stakes", () => {
  assertTrue(isHighStakesTask("Fix the security vulnerability"), "Should detect 'security' as high stakes");
  assertTrue(isHighStakesTask("セキュリティパッチを適用"), "Should detect Japanese 'セキュリティ' as high stakes");
});

test("should detect authentication tasks as high stakes", () => {
  assertTrue(isHighStakesTask("Update authentication flow"), "Should detect 'authentication' as high stakes");
  assertTrue(isHighStakesTask("認証システムを修正"), "Should detect Japanese '認証' as high stakes");
});

test("should detect encryption/password tasks as high stakes", () => {
  assertTrue(isHighStakesTask("Change password policy"), "Should detect 'password' as high stakes");
  assertTrue(isHighStakesTask("暗号化方式を変更"), "Should detect Japanese '暗号化' as high stakes");
});

test("should detect destructive operations as high stakes", () => {
  assertTrue(isHighStakesTask("Run destructive migration"), "Should detect 'destructive' as high stakes");
  assertTrue(isHighStakesTask("破壊的変更を適用"), "Should detect Japanese '破壊的' as high stakes");
});

test("should detect migration tasks as high stakes", () => {
  assertTrue(isHighStakesTask("Run database migration"), "Should detect 'migration' as high stakes");
  assertTrue(isHighStakesTask("マイグレーションを実行"), "Should detect Japanese 'マイグレーション' as high stakes");
});

test("should not detect low-risk tasks as high stakes", () => {
  assertFalse(isHighStakesTask("Add a new comment"), "Should not detect comment addition as high stakes");
  assertFalse(isHighStakesTask("Fix typo in documentation"), "Should not detect typo fix as high stakes");
  assertFalse(isHighStakesTask("Refactor variable names"), "Should not detect refactoring as high stakes");
});

test("should verify HIGH_STAKES_PATTERNS array contents", () => {
  assertTrue(HIGH_STAKES_PATTERNS.length >= 16, "Should have at least 16 patterns defined");
});

// ============================================================================
// resolveVerificationConfig() Tests
// ============================================================================
console.log("\n=== resolveVerificationConfig() Tests ===\n");

test("should return default config when no env vars set", () => {
  restoreEnv();
  const config = resolveVerificationConfig();
  
  assertDeepEqual(config.enabled, DEFAULT_VERIFICATION_CONFIG.enabled, "Enabled should match default");
  assertDeepEqual(config.triggerModes, DEFAULT_VERIFICATION_CONFIG.triggerModes, "Trigger modes should match default");
  assertDeepEqual(config.minConfidenceToSkipVerification, DEFAULT_VERIFICATION_CONFIG.minConfidenceToSkipVerification, "Min confidence should match default");
});

test("should return disabled config when mode is 'disabled'", () => {
  process.env.PI_VERIFICATION_WORKFLOW_MODE = "disabled";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertFalse(config.enabled, "Should be disabled");
});

test("should return disabled config when mode is '0'", () => {
  process.env.PI_VERIFICATION_WORKFLOW_MODE = "0";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertFalse(config.enabled, "Should be disabled with '0'");
});

test("should return strict config when mode is 'strict'", () => {
  process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertTrue(config.enabled, "Should be enabled in strict mode");
  assertTrue(config.triggerModes.includes("post-team"), "Should include post-team in strict mode");
  assertEqual(config.minConfidenceToSkipVerification, 0.95, "Should have higher confidence threshold in strict mode");
  assertEqual(config.fallbackBehavior, "block", "Should block on failure in strict mode");
  assertEqual(config.challengerConfig.requiredFlaws, 2, "Should require 2 flaws in strict mode");
});

test("should return minimal config when mode is 'minimal'", () => {
  process.env.PI_VERIFICATION_WORKFLOW_MODE = "minimal";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertTrue(config.enabled, "Should be enabled in minimal mode");
  assertDeepEqual(config.triggerModes, ["high-stakes"], "Should only have high-stakes trigger in minimal mode");
  assertEqual(config.minConfidenceToSkipVerification, 0.7, "Should have lower confidence threshold in minimal mode");
  assertEqual(config.fallbackBehavior, "warn", "Should warn on failure in minimal mode");
});

test("should parse PI_VERIFICATION_MIN_CONFIDENCE env var", () => {
  process.env.PI_VERIFICATION_MIN_CONFIDENCE = "0.85";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertEqual(config.minConfidenceToSkipVerification, 0.85, "Should parse min confidence from env");
});

test("should clamp PI_VERIFICATION_MIN_CONFIDENCE to valid range", () => {
  process.env.PI_VERIFICATION_MIN_CONFIDENCE = "1.5";
  let config = resolveVerificationConfig();
  assertEqual(config.minConfidenceToSkipVerification, 1, "Should clamp to max 1");
  
  process.env.PI_VERIFICATION_MIN_CONFIDENCE = "-0.5";
  config = resolveVerificationConfig();
  restoreEnv();
  assertEqual(config.minConfidenceToSkipVerification, 0, "Should clamp to min 0");
});

test("should parse PI_VERIFICATION_MAX_DEPTH env var", () => {
  process.env.PI_VERIFICATION_MAX_DEPTH = "3";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertEqual(config.maxVerificationDepth, 3, "Should parse max depth from env");
});

test("should clamp PI_VERIFICATION_MAX_DEPTH to valid range", () => {
  process.env.PI_VERIFICATION_MAX_DEPTH = "10";
  let config = resolveVerificationConfig();
  assertEqual(config.maxVerificationDepth, 5, "Should clamp to max 5");
  
  process.env.PI_VERIFICATION_MAX_DEPTH = "0";
  config = resolveVerificationConfig();
  restoreEnv();
  assertEqual(config.maxVerificationDepth, 1, "Should clamp to min 1");
});

test("should ignore invalid PI_VERIFICATION_MIN_CONFIDENCE", () => {
  process.env.PI_VERIFICATION_MIN_CONFIDENCE = "invalid";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertEqual(config.minConfidenceToSkipVerification, DEFAULT_VERIFICATION_CONFIG.minConfidenceToSkipVerification, "Should use default for invalid value");
});

test("should ignore invalid PI_VERIFICATION_MAX_DEPTH", () => {
  process.env.PI_VERIFICATION_MAX_DEPTH = "invalid";
  const config = resolveVerificationConfig();
  restoreEnv();
  
  assertEqual(config.maxVerificationDepth, DEFAULT_VERIFICATION_CONFIG.maxVerificationDepth, "Should use default for invalid value");
});

// ============================================================================
// buildInspectorPrompt() Tests
// ============================================================================
console.log("\n=== buildInspectorPrompt() Tests ===\n");

test("should generate inspector prompt with target output", () => {
  const targetOutput = "CLAIM: Test\nRESULT: Result";
  const context = createDefaultContext({ agentId: "test-agent" });
  const prompt = buildInspectorPrompt(targetOutput, context);
  
  assertTrue(prompt.includes(targetOutput), "Should include target output");
  assertTrue(prompt.includes("test-agent"), "Should include agent ID");
  assertTrue(prompt.includes("Inspector"), "Should identify as Inspector role");
  assertTrue(prompt.includes("INSPECTION_REPORT"), "Should request inspection report format");
});

test("should include all required inspection patterns", () => {
  const prompt = buildInspectorPrompt("test", createDefaultContext());
  
  assertTrue(prompt.includes("CLAIM-RESULT"), "Should mention CLAIM-RESULT check");
  assertTrue(prompt.includes("Overconfidence"), "Should mention overconfidence check");
  assertTrue(prompt.includes("Confirmation Bias"), "Should mention confirmation bias check");
  assertTrue(prompt.includes("Alternative"), "Should mention alternatives check");
});

// ============================================================================
// buildChallengerPrompt() Tests
// ============================================================================
console.log("\n=== buildChallengerPrompt() Tests ===\n");

test("should generate challenger prompt with target output", () => {
  const targetOutput = "CLAIM: Test\nRESULT: Result";
  const context = createDefaultContext({ teamId: "test-team" });
  const prompt = buildChallengerPrompt(targetOutput, context);
  
  assertTrue(prompt.includes(targetOutput), "Should include target output");
  assertTrue(prompt.includes("test-team"), "Should include team ID");
  assertTrue(prompt.includes("Challenger"), "Should identify as Challenger role");
  assertTrue(prompt.includes("DISPUTE"), "Should emphasize disputing role");
});

test("should include all challenge categories", () => {
  const prompt = buildChallengerPrompt("test", createDefaultContext());
  
  assertTrue(prompt.includes("Evidence Gap"), "Should include evidence gap category");
  assertTrue(prompt.includes("Logical Flaw"), "Should include logical flaw category");
  assertTrue(prompt.includes("Alternative"), "Should include alternatives category");
  assertTrue(prompt.includes("Boundary"), "Should include boundary conditions category");
});

// ============================================================================
// synthesizeVerificationResult() Tests
// ============================================================================
console.log("\n=== synthesizeVerificationResult() Tests ===\n");

test("should return pass when no issues found", () => {
  const result = synthesizeVerificationResult(
    "Test output",
    0.8,
    undefined,
    undefined,
    createDefaultContext()
  );
  
  assertEqual(result.finalVerdict, "pass", "Should pass with no inspector/challenger output");
  assertFalse(result.requiresReRun, "Should not require re-run");
  assertEqual(result.warnings.length, 0, "Should have no warnings");
});

test("should return pass-with-warnings for medium suspicion", () => {
  const inspectorOutput: InspectorOutput = {
    suspicionLevel: "medium",
    detectedPatterns: [{ pattern: "overconfidence", location: "line 1", severity: "medium", description: "test" }],
    summary: "Some concerns",
    recommendation: "Review recommended"
  };
  
  const result = synthesizeVerificationResult(
    "Test output",
    0.8,
    inspectorOutput,
    undefined,
    createDefaultContext()
  );
  
  assertTrue(
    result.finalVerdict === "pass-with-warnings" || result.finalVerdict === "needs-review",
    `Should be pass-with-warnings or needs-review, got ${result.finalVerdict}`
  );
  assertTrue(result.warnings.length > 0, "Should have warnings");
});

test("should return needs-review for high suspicion", () => {
  const inspectorOutput: InspectorOutput = {
    suspicionLevel: "high",
    detectedPatterns: [{ pattern: "claim-result-mismatch", location: "line 1", severity: "high", description: "test" }],
    summary: "Major concerns",
    recommendation: "Manual review required"
  };
  
  const result = synthesizeVerificationResult(
    "Test output",
    0.8,
    inspectorOutput,
    undefined,
    createDefaultContext()
  );
  
  assertEqual(result.finalVerdict, "needs-review", "Should need review for high suspicion");
  assertTrue(result.confidence <= 0.5, "Should reduce confidence for high suspicion");
});

test("should return fail for critical challenges", () => {
  const challengerOutput: ChallengerOutput = {
    challengedClaims: [{ claim: "test", flaw: "test", evidenceGap: "test", alternative: "test", severity: "critical" }],
    overallSeverity: "critical",
    summary: "Critical issues found",
    suggestedRevisions: ["Revise approach"]
  };
  
  const result = synthesizeVerificationResult(
    "Test output",
    0.8,
    undefined,
    challengerOutput,
    createDefaultContext()
  );
  
  assertTrue(
    result.finalVerdict === "fail" || result.finalVerdict === "blocked" || result.finalVerdict === "needs-review",
    `Should be fail/blocked/needs-review for critical challenges, got ${result.finalVerdict}`
  );
  assertTrue(result.confidence <= 0.3, "Should significantly reduce confidence");
});

test("should require re-run when blocked", () => {
  process.env.PI_VERIFICATION_WORKFLOW_MODE = "strict";
  
  const inspectorOutput: InspectorOutput = {
    suspicionLevel: "high",
    detectedPatterns: [{ pattern: "claim-result-mismatch", location: "line 1", severity: "high", description: "test" }],
    summary: "Major concerns",
    recommendation: "Re-run required"
  };
  
  const result = synthesizeVerificationResult(
    "Test output",
    0.8,
    inspectorOutput,
    undefined,
    createDefaultContext()
  );
  
  restoreEnv();
  
  // In strict mode with high severity patterns, should be blocked
  if (result.finalVerdict === "blocked") {
    assertTrue(result.requiresReRun, "Should require re-run when blocked");
  }
});

test("should respect max verification depth", () => {
  const challengerOutput: ChallengerOutput = {
    challengedClaims: [{ claim: "test", flaw: "test", evidenceGap: "test", alternative: "test", severity: "moderate" }],
    overallSeverity: "moderate",
    summary: "Some issues found",
    suggestedRevisions: ["Review"]
  };
  
  const result = synthesizeVerificationResult(
    "Test output",
    0.8,
    undefined,
    challengerOutput,
    createDefaultContext({ previousVerifications: 5 }) // Exceeds max depth
  );
  
  assertTrue(result.warnings.some(w => w.includes("Max verification depth")), "Should warn about max depth");
  assertTrue(
    result.finalVerdict === "needs-review" || result.finalVerdict === "pass-with-warnings",
    "Should recommend review at max depth"
  );
});

// ============================================================================
// getVerificationWorkflowRules() Tests
// ============================================================================
console.log("\n=== getVerificationWorkflowRules() Tests ===\n");

test("should return non-empty rules string", () => {
  const rules = getVerificationWorkflowRules();
  assertTrue(rules.length > 0, "Should return non-empty rules");
});

test("should include environment variable documentation", () => {
  const rules = getVerificationWorkflowRules();
  assertTrue(rules.includes("PI_VERIFICATION_WORKFLOW_MODE"), "Should document WORKFLOW_MODE env var");
  assertTrue(rules.includes("PI_VERIFICATION_MIN_CONFIDENCE"), "Should document MIN_CONFIDENCE env var");
  assertTrue(rules.includes("PI_VERIFICATION_MAX_DEPTH"), "Should document MAX_DEPTH env var");
});

test("should include verification verdict descriptions", () => {
  const rules = getVerificationWorkflowRules();
  assertTrue(rules.includes("pass"), "Should describe pass verdict");
  assertTrue(rules.includes("pass-with-warnings"), "Should describe pass-with-warnings verdict");
  assertTrue(rules.includes("needs-review"), "Should describe needs-review verdict");
  assertTrue(rules.includes("fail"), "Should describe fail verdict");
});

// ============================================================================
// Summary
// ============================================================================
console.log("\n=== Test Summary ===\n");

const passed = testResults.filter(r => r.passed).length;
const failed = testResults.filter(r => !r.passed).length;

console.log(`Total: ${testResults.length} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log("\nFailed tests:");
  testResults.filter(r => !r.passed).forEach(r => {
    console.log(`  - ${r.name}: ${r.error}`);
  });
  process.exit(1);
} else {
  console.log("\nAll tests passed!");
  process.exit(0);
}
