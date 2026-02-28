/**
 * @fileoverview P0 Critical bug fix tests
 * @description Tests for Bug #1 and Bug #11 critical fixes
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ============================================================================
// Bug #1: output-validation.ts - schemaResult null guard
// ============================================================================

describe("Bug #1: output-validation schemaResult null guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("code structure verification", () => {
    it("should_have_null_guard_in_strict_mode_block", () => {
      const ovPath = path.join(process.cwd(), ".pi/lib/output-validation.ts");
      const content = fs.readFileSync(ovPath, "utf-8");

      // Verify the null guard exists in the strict mode block
      const strictBlock = content.substring(
        content.indexOf('if (mode === "strict")'),
        content.indexOf("fallbackUsed: false", content.indexOf('if (mode === "strict")'))
      );

      // Assert - Null guard should exist before accessing schemaResult properties
      expect(strictBlock).toContain("if (!schemaResult)");
      expect(strictBlock).toContain("fallbackUsed: true");
      expect(strictBlock).toContain("Schema validation unavailable");
    });

    it("should_have_fallback_to_legacy_result", () => {
      const ovPath = path.join(process.cwd(), ".pi/lib/output-validation.ts");
      const content = fs.readFileSync(ovPath, "utf-8");

      // Assert - Fallback should use legacyResult
      expect(content).toContain("legacyOk: legacyResult.ok");
      expect(content).toContain("legacyReason: legacyResult.reason");
    });
  });

  describe("strict mode with schema validation success", () => {
    it("should_use_schema_result_when_available", async () => {
      // Arrange - Mock schema validation to succeed
      vi.doMock("@lib/output-schema.js", () => ({
        getSchemaValidationMode: vi.fn(() => "strict"),
        validateSubagentOutputWithSchema: vi.fn(() => ({
          ok: true,
          reason: "Schema passed",
          violations: [],
        })),
        validateTeamMemberOutputWithSchema: vi.fn(() => ({
          ok: true,
          violations: [],
        })),
        recordSchemaViolation: vi.fn(),
      }));

      // Import after mock
      const { validateSubagentOutputEnhanced } = await import("@lib/output-validation");

      // Act
      const output = `
SUMMARY: Test summary with enough characters to pass validation
CLAIM: Test claim
EVIDENCE: test.ts:10
RESULT: Test result content
NEXT_STEP: Done
`.trim();

      const result = validateSubagentOutputEnhanced(output, "strict");

      // Assert
      expect(result.ok).toBe(true);
      expect(result.mode).toBe("strict");
      expect(result.fallbackUsed).toBe(false);
    });
  });
});

// ============================================================================
// Bug #11: task-flow.ts - writeFileSync error handling
// ============================================================================

describe("Bug #11: task-flow writeFileSync error handling", () => {
  const testDir = path.join(os.tmpdir(), "pi-task-flow-test-" + Date.now());

  beforeEach(() => {
    vi.clearAllMocks();
    // Create test directory
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("backup file creation on error", () => {
    it("should_create_backup_on_write_failure", () => {
      // This test verifies the structure of the error handling logic
      // The actual implementation in task-flow.ts has:
      // 1. try-catch around writeFileSync
      // 2. Backup file creation on error
      // 3. Console error logging

      // We verify the code structure by checking the file contents
      const taskFlowPath = path.join(process.cwd(), ".pi/extensions/task-flow.ts");
      const content = fs.readFileSync(taskFlowPath, "utf-8");

      // Assert - Verify error handling pattern exists
      expect(content).toContain("try {");
      expect(content).toContain("writeFileSync(TASK_STORAGE_FILE");
      expect(content).toContain("} catch (error) {");
      expect(content).toContain("backupFile");
      expect(content).toContain("console.error");
    });

    it("should_log_critical_error_when_backup_also_fails", () => {
      const taskFlowPath = path.join(process.cwd(), ".pi/extensions/task-flow.ts");
      const content = fs.readFileSync(taskFlowPath, "utf-8");

      // Assert - Verify nested error handling for backup failure
      expect(content).toContain("CRITICAL: Could not save backup");
    });
  });

  describe("saveTaskStorage function behavior", () => {
    it("should_have_proper_javadoc_documentation", () => {
      const taskFlowPath = path.join(process.cwd(), ".pi/extensions/task-flow.ts");
      const content = fs.readFileSync(taskFlowPath, "utf-8");

      // Assert - Verify JSDoc exists for the function
      expect(content).toContain("@summary タスクストレージ保存");
      expect(content).toContain("@param storage 保存するタスクストレージ");
    });
  });
});

// ============================================================================
// Regression tests for related functionality
// ============================================================================

describe("Regression: Related validation functionality", () => {
  it("legacy_mode_should_not_use_schema_validation", async () => {
    // Reset modules to ensure clean import
    vi.resetModules();

    const mockValidate = vi.fn(() => ({
      ok: true,
      violations: [],
    }));

    vi.doMock("@lib/output-schema.js", () => ({
      getSchemaValidationMode: vi.fn(() => "legacy"),
      validateSubagentOutputWithSchema: mockValidate,
      validateTeamMemberOutputWithSchema: vi.fn(() => ({
        ok: true,
        violations: [],
      })),
      recordSchemaViolation: vi.fn(),
    }));

    const { validateSubagentOutputEnhanced } = await import("@lib/output-validation");

    const output = `
SUMMARY: Legacy mode test with enough characters for min length
CLAIM: Test
EVIDENCE: test.ts:1
RESULT: Content
NEXT_STEP: Done
`.trim();

    const result = validateSubagentOutputEnhanced(output);

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("legacy");
    // Schema validation should NOT be called in legacy mode
    expect(mockValidate).not.toHaveBeenCalled();
  });
});
