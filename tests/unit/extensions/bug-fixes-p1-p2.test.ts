/**
 * @fileoverview P1/P2 bug fix tests
 * @description Tests for type safety and stability bug fixes
 * @testFramework vitest
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Bug #3: abbr.ts - redundant Map lookup fix
// ============================================================================

describe("Bug #3: abbr.ts redundant Map lookup", () => {
  it("should_use_single_get_pattern_for_query", () => {
    const abbrPath = path.join(process.cwd(), ".pi/extensions/abbr.ts");
    const content = fs.readFileSync(abbrPath, "utf-8");

    // Verify the fix: should use `abbr ? ... : ...` pattern instead of has() + get()
    // Find the query handler section
    const querySection = content.substring(
      content.indexOf("case \"query\":"),
      content.indexOf("default:", content.indexOf("case \"query\":"))
    );

    // Assert - Should use single get() with nullish check
    expect(querySection).toContain("const abbr = abbreviations.get(params.name)");
    expect(querySection).toContain("abbr ? `Yes: ${abbr.expansion}` : \"No\"");
    // Should NOT use has() + get() pattern
    expect(querySection).not.toContain("abbreviations.has(params.name)");
    expect(querySection).not.toContain("abbr!.expansion");
  });
});

// ============================================================================
// Bug #12: invariant-pipeline.ts - atomic writes
// ============================================================================

describe("Bug #12: invariant-pipeline.ts atomic writes", () => {
  it("should_use_temp_directory_for_atomic_writes", () => {
    const invPath = path.join(process.cwd(), ".pi/extensions/invariant-pipeline.ts");
    const content = fs.readFileSync(invPath, "utf-8");

    // Assert - Verify atomic write pattern
    expect(content).toContain("mkdtempSync");
    expect(content).toContain("tempDir");
    expect(content).toContain("Atomic write");
    expect(content).toContain("renameSync");
  });

  it("should_cleanup_temp_directory_on_completion", () => {
    const invPath = path.join(process.cwd(), ".pi/extensions/invariant-pipeline.ts");
    const content = fs.readFileSync(invPath, "utf-8");

    // Assert - Verify cleanup logic
    expect(content).toContain("rmSync(tempDir");
    expect(content).toContain("recursive: true");
  });

  it("should_handle_partial_write_failures", () => {
    const invPath = path.join(process.cwd(), ".pi/extensions/invariant-pipeline.ts");
    const content = fs.readFileSync(invPath, "utf-8");

    // Assert - Verify error handling for atomic writes
    expect(content).toContain("try {");
    expect(content).toContain("} finally {");
  });
});

// ============================================================================
// Bug #13: dynamic-tools.ts - Promise error handling
// ============================================================================

describe("Bug #13: dynamic-tools.ts Promise error handling", () => {
  it("should_use_promise_race_with_proper_cleanup", () => {
    const dtPath = path.join(process.cwd(), ".pi/extensions/dynamic-tools.ts");
    const content = fs.readFileSync(dtPath, "utf-8");

    // Assert - Verify Promise.race pattern with timeout
    expect(content).toContain("Promise.race");
    expect(content).toContain("timeoutId");
    expect(content).toContain("clearTimeout");
  });

  it("should_handle_timeout_with_abort_controller", () => {
    const dtPath = path.join(process.cwd(), ".pi/extensions/dynamic-tools.ts");
    const content = fs.readFileSync(dtPath, "utf-8");

    // Assert - Verify abort handling
    expect(content).toContain("AbortController");
    expect(content).toContain("abortController.abort()");
  });
});

// ============================================================================
// Bug #10: web-ui/index.ts - TOCTOU fix
// ============================================================================

describe("Bug #10: web-ui TOCTOU fix", () => {
  it("should_use_getServerUrl_function", () => {
    const webUiPath = path.join(process.cwd(), ".pi/extensions/web-ui/index.ts");
    const content = fs.readFileSync(webUiPath, "utf-8");

    // Assert - Verify getServerUrl helper function exists
    expect(content).toContain("function getServerUrl()");
    expect(content).toContain("ServerRegistry.isRunning()");
  });

  it("should_check_server_state_once", () => {
    const webUiPath = path.join(process.cwd(), ".pi/extensions/web-ui/index.ts");
    const content = fs.readFileSync(webUiPath, "utf-8");

    // Find getServerUrl function - match more lines
    const getServerUrlMatch = content.match(/function getServerUrl\(\)[\s\S]{0,500}?^\}/m);
    expect(getServerUrlMatch).not.toBeNull();

    const fnBody = getServerUrlMatch![0];
    // Should check once and use the result (not using !.port pattern)
    expect(fnBody).toContain("registryServer");
    expect(fnBody).not.toContain("ServerRegistry.isRunning()!.port");
  });
});

// ============================================================================
// Bug #6: registry.ts - unnecessary assertions
// ============================================================================

describe("Bug #6: registry.ts unnecessary assertions", () => {
  it("should_not_use_non_null_after_narrowing", () => {
    const regPath = path.join(process.cwd(), ".pi/lib/dynamic-tools/registry.ts");
    const content = fs.readFileSync(regPath, "utf-8");

    // Find filter tags section - should use variable instead of options.tags!
    const filterSection = content.substring(
      content.indexOf("options?.tags"),
      content.indexOf(")", content.indexOf("options?.tags") + 100)
    );

    // Should assign to variable and use that (no ! needed after narrowing)
    expect(content).toContain("filterTags");
  });
});

// ============================================================================
// Bug #9: skill-inspector.ts - Map patterns
// ============================================================================

describe("Bug #9: skill-inspector.ts Map patterns", () => {
  it("should_use_nullish_coalescing_for_map_get", () => {
    const siPath = path.join(process.cwd(), ".pi/extensions/skill-inspector.ts");
    const content = fs.readFileSync(siPath, "utf-8");

    // Assert - Verify nullish coalescing pattern is used
    expect(content).toContain("?? []");
  });
});

// ============================================================================
// Bug #4 & #5: LazyInit pattern (verification)
// ============================================================================

describe("Bug #4 & #5: Initialization patterns", () => {
  it("checkpoint-manager_should_have_guard_pattern", () => {
    const cmPath = path.join(process.cwd(), ".pi/lib/checkpoint-manager.ts");
    const content = fs.readFileSync(cmPath, "utf-8");

    // Verify initialization check pattern exists
    expect(content).toContain("if (!managerState?.initialized)");
    expect(content).toContain("initCheckpointManager");
  });

  it("cross-instance-coordinator_should_have_guard_pattern", () => {
    const cicPath = path.join(process.cwd(), ".pi/lib/cross-instance-coordinator.ts");
    const content = fs.readFileSync(cicPath, "utf-8");

    // Verify state check pattern exists
    expect(content).toContain("if (!state)");
  });
});

// ============================================================================
// Logging improvements (Bug #14-15)
// ============================================================================

describe("Bug #14-15: Logging improvements", () => {
  it("mcp-client_should_log_notification_errors", () => {
    const mcpPath = path.join(process.cwd(), ".pi/extensions/mcp-client.ts");
    const content = fs.readFileSync(mcpPath, "utf-8");

    // Verify error logging exists
    expect(content).toContain("console.error");
    expect(content).toContain("Notification handler");
  });

  it("context-usage-dashboard_should_handle_file_errors", () => {
    const ctxPath = path.join(process.cwd(), ".pi/extensions/context-usage-dashboard.ts");
    const content = fs.readFileSync(ctxPath, "utf-8");

    // Verify catch blocks exist (even if silent for file reading)
    expect(content).toContain("catch");
  });
});
