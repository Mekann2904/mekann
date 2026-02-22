/**
 * Three-Layer Pipeline 関数の単体テスト
 * task-execution.ts: processOutputWithThreeLayerPipeline, ensureOutputStructure
 */
import {
  describe,
  it,
  expect,
} from "vitest";

import {
  processOutputWithThreeLayerPipeline,
  ensureOutputStructure,
  type ThreeLayerPipelineResult,
} from "../../../.pi/extensions/subagents/task-execution";

// ============================================================================
// processOutputWithThreeLayerPipeline テスト
// ============================================================================

describe("processOutputWithThreeLayerPipeline", () => {
  it("processOutputWithThreeLayerPipeline_有効な出力_Layer2通過", () => {
    // Arrange
    const validOutput = `
SUMMARY: Valid summary with enough length
RESULT: Valid result with sufficient content to meet the minimum requirements
`;

    // Act
    const result = processOutputWithThreeLayerPipeline(validOutput);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.appliedLayer).toBe(2);
    expect(result.violations).toHaveLength(0);
  });

  it("processOutputWithThreeLayerPipeline_空出力_Layer3適用", () => {
    // Arrange & Act
    const result = processOutputWithThreeLayerPipeline("");

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.appliedLayer).toBe(3);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.output).toContain("SUMMARY:");
    expect(result.output).toContain("RESULT:");
  });

  it("processOutputWithThreeLayerPipeline_部分出力_Layer3補完", () => {
    // Arrange
    const partialOutput = `
SUMMARY: Summary only without result
`;

    // Act
    const result = processOutputWithThreeLayerPipeline(partialOutput);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.appliedLayer).toBe(3);
    expect(result.output).toContain("SUMMARY: Summary only without result");
    expect(result.output).toContain("RESULT:");
    expect(result.output).toContain("NEXT_STEP:");
  });

  it("processOutputWithThreeLayerPipeline_構造なしテキスト_Layer3適用", () => {
    // Arrange
    const plainText = "This is just plain text without structure.";

    // Act
    const result = processOutputWithThreeLayerPipeline(plainText);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.appliedLayer).toBe(3);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("processOutputWithThreeLayerPipeline_空白のみ_Layer3適用", () => {
    // Arrange & Act
    const result = processOutputWithThreeLayerPipeline("   \n\n   ");

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.appliedLayer).toBe(3);
  });
});

// ============================================================================
// ensureOutputStructure テスト
// ============================================================================

describe("ensureOutputStructure", () => {
  it("ensureOutputStructure_有効な構造_処理不要", () => {
    // Arrange
    const validOutput = `
SUMMARY: Valid summary with enough length
RESULT: Valid result with sufficient content to meet the minimum length requirements
`;

    // Act
    const result = ensureOutputStructure(validOutput);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.appliedLayer).toBe(0);
    expect(result.output).toContain("SUMMARY: Valid summary with enough length");
    expect(result.output).toContain("RESULT: Valid result with sufficient content");
  });

  it("ensureOutputStructure_無効な構造_Layer3適用", () => {
    // Arrange
    const invalidOutput = "No structure here";

    // Act
    const result = ensureOutputStructure(invalidOutput);

    // Assert
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.appliedLayer).toBe(3);
  });
});
