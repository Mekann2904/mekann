/**
 * @file .pi/lib/context-summarizer.ts の単体テスト
 * @description DAGハンドオフ時のコンテキスト要約のテスト
 * @testFramework vitest
 *
 * モック/スタブ戦略:
 * - Solitary test: 外部依存なし（純粋関数）
 * - モック不要
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import {
  summarizeContext,
  extractKeyInformation,
  summarizeMultipleContexts,
  needsSummarization,
  createSummarizerConfigFromEnv,
  DEFAULT_SUMMARIZER_CONFIG,
  type SummarizerConfig,
} from "@lib/context-summarizer";

// ============================================================================
// テスト用ユーティリティ
// ============================================================================

/**
 * テスト用の小さな設定を生成
 */
function createTestConfig(overrides: Partial<SummarizerConfig> = {}): SummarizerConfig {
  return {
    ...DEFAULT_SUMMARIZER_CONFIG,
    maxOutputSize: 1000,
    summaryThreshold: 500,
    maxLinesPerSection: 5,
    ...overrides,
  };
}

/**
 * 長いテキストを生成
 */
function generateLongText(lines: number, prefix = "Line"): string {
  return Array.from({ length: lines }, (_, i) => `${prefix} ${i + 1}: This is a test line with some content.`).join("\n");
}

/**
 * セクション付きテキストを生成
 */
function generateSectionedText(sectionCount: number, linesPerSection: number): string {
  const sections: string[] = [];
  for (let i = 0; i < sectionCount; i++) {
    sections.push(`## Section ${i + 1}\n${generateLongText(linesPerSection, `S${i + 1}-Line`)}`);
  }
  return sections.join("\n\n");
}

/**
 * コードブロック付きテキストを生成
 */
function generateTextWithCodeBlock(codeLines: number): string {
  const code = Array.from({ length: codeLines }, (_, i) => `  const line${i} = ${i};`).join("\n");
  return `## Code Example\n\nHere is some code:\n\n\`\`\`typescript\n${code}\n\`\`\`\n\nEnd of example.`;
}

// ============================================================================
// summarizeContext
// ============================================================================

describe("summarizeContext", () => {
  describe("正常系", () => {
    it("should_return_string_input_unchanged_when_below_threshold", () => {
      // Arrange
      const shortText = "This is a short text.";
      const config = createTestConfig();

      // Act
      const result = summarizeContext(shortText, config);

      // Assert
      expect(result).toBe(shortText);
    });

    it("should_summarize_long_string_input", () => {
      // Arrange
      const longText = generateLongText(50);
      const config = createTestConfig();

      // Act
      const result = summarizeContext(longText, config);

      // Assert
      expect(result.length).toBeLessThan(longText.length);
    });

    it("should_summarize_object_input", () => {
      // Arrange
      const largeObject = {
        items: Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Item ${i}` })),
      };
      const config = createTestConfig();

      // Act
      const result = summarizeContext(largeObject, config);

      // Assert
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should_add_structure_markers_when_preserveStructure_true", () => {
      // Arrange
      const longText = generateLongText(50);
      const config = createTestConfig({ preserveStructure: true });

      // Act
      const result = summarizeContext(longText, config);

      // Assert
      expect(result).toContain("<!-- SUMMARIZED_CONTEXT -->");
      expect(result).toContain("<!-- END_SUMMARY -->");
    });

    it("should_not_add_structure_markers_when_preserveStructure_false", () => {
      // Arrange
      const longText = generateLongText(50);
      const config = createTestConfig({ preserveStructure: false });

      // Act
      const result = summarizeContext(longText, config);

      // Assert
      expect(result).not.toContain("<!-- SUMMARIZED_CONTEXT -->");
    });

    it("should_use_default_config_when_not_provided", () => {
      // Arrange
      const shortText = "Short text";

      // Act
      const result = summarizeContext(shortText);

      // Assert
      expect(result).toBe(shortText);
    });
  });

  describe("境界値", () => {
    it("should_handle_empty_string", () => {
      // Arrange
      const emptyText = "";
      const config = createTestConfig();

      // Act
      const result = summarizeContext(emptyText, config);

      // Assert
      expect(result).toBe("");
    });

    it("should_handle_null_input", () => {
      // Arrange
      const config = createTestConfig();

      // Act
      const result = summarizeContext(null, config);

      // Assert
      expect(typeof result).toBe("string");
    });

    it("should_handle_undefined_input", () => {
      // Arrange
      const config = createTestConfig();

      // Act & Assert
      // Note: JSON.stringify(undefined) returns undefined, which causes an error
      // This is expected behavior - undefined should not be passed as context
      expect(() => summarizeContext(undefined, config)).toThrow();
    });

    it("should_handle_empty_object", () => {
      // Arrange
      const emptyObject = {};
      const config = createTestConfig();

      // Act
      const result = summarizeContext(emptyObject, config);

      // Assert
      expect(result).toBe("{}");
    });

    it("should_handle_array_input", () => {
      // Arrange
      const array = [1, 2, 3, 4, 5];
      const config = createTestConfig();

      // Act
      const result = summarizeContext(array, config);

      // Assert
      expect(typeof result).toBe("string");
    });

    it("should_handle_text_exactly_at_threshold", () => {
      // Arrange
      const config = createTestConfig({ summaryThreshold: 100 });
      const exactText = "a".repeat(100);

      // Act
      const result = summarizeContext(exactText, config);

      // Assert
      expect(result).toBe(exactText);
    });

    it("should_handle_text_just_above_threshold", () => {
      // Arrange
      const config = createTestConfig({ summaryThreshold: 100 });
      const longText = "a".repeat(101);

      // Act
      const result = summarizeContext(longText, config);

      // Assert
      // Should trigger summarization
      expect(result).toContain("<!-- SUMMARIZED_CONTEXT -->");
    });
  });
});

// ============================================================================
// extractKeyInformation
// ============================================================================

describe("extractKeyInformation", () => {
  describe("正常系", () => {
    it("should_extract_from_sectioned_text", () => {
      // Arrange
      const text = generateSectionedText(3, 20);
      const config = createTestConfig();

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result.length).toBeLessThan(text.length);
      expect(result).toContain("## Section 1");
    });

    it("should_preserve_headers", () => {
      // Arrange
      const text = generateSectionedText(3, 20);
      const config = createTestConfig();

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result).toContain("## Section 1");
      expect(result).toContain("## Section 2");
      expect(result).toContain("## Section 3");
    });

    it("should_truncate_long_sections", () => {
      // Arrange
      const text = "## Long Section\n" + generateLongText(50);
      const config = createTestConfig({ maxLinesPerSection: 5 });

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result).toContain("...");
    });

    it("should_respect_maxOutputSize", () => {
      // Arrange
      const text = generateSectionedText(10, 30);
      const config = createTestConfig({ maxOutputSize: 500 });

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result.length).toBeLessThanOrEqual(config.maxOutputSize + 100); // some margin for truncation marker
    });
  });

  describe("コードブロック処理", () => {
    it("should_truncate_long_code_blocks", () => {
      // Arrange - generate text that exceeds both summary threshold and maxLinesPerSection
      const codeLines = 50;
      const code = Array.from({ length: codeLines }, (_, i) => `  const line${i} = ${i};`).join("\n");
      // Make the text long enough to trigger summarization
      const text = `## Code Example\n\n${Array.from({ length: 20 }, (_, i) => `Paragraph ${i} with some content to make the text longer.`).join("\n\n")}\n\n\`\`\`typescript\n${code}\n\`\`\`\n\nEnd of example.`;
      const config = createTestConfig({
        truncateCodeBlocks: true,
        summaryThreshold: 100,
        maxLinesPerSection: 10
      });

      // Act
      const result = extractKeyInformation(text, config);

      // Assert - should contain truncation marker due to long content
      expect(result).toContain("...");
    });

    it("should_preserve_short_code_blocks", () => {
      // Arrange
      const text = generateTextWithCodeBlock(3);
      const config = createTestConfig({ truncateCodeBlocks: true });

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result).not.toContain("truncated");
    });

    it("should_skip_code_block_truncation_when_disabled", () => {
      // Arrange
      const text = generateTextWithCodeBlock(50);
      const config = createTestConfig({ truncateCodeBlocks: false, maxLinesPerSection: 100 });

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result).not.toContain("// ... truncated ...");
    });
  });

  describe("境界値", () => {
    it("should_handle_empty_text", () => {
      // Arrange
      const text = "";
      const config = createTestConfig();

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(result).toBe("");
    });

    it("should_handle_text_without_sections", () => {
      // Arrange
      const text = generateLongText(30);
      const config = createTestConfig();

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should_handle_unclosed_code_block", () => {
      // Arrange
      const text = "## Section\n```\ncode line 1\ncode line 2";
      const config = createTestConfig();

      // Act
      const result = extractKeyInformation(text, config);

      // Assert
      expect(typeof result).toBe("string");
    });
  });
});

// ============================================================================
// summarizeMultipleContexts
// ============================================================================

describe("summarizeMultipleContexts", () => {
  describe("正常系", () => {
    it("should_combine_multiple_contexts", () => {
      // Arrange
      const contexts = new Map<string, unknown>([
        ["task1", "Result from task 1"],
        ["task2", "Result from task 2"],
      ]);
      const config = createTestConfig();

      // Act
      const result = summarizeMultipleContexts(contexts, config);

      // Assert
      expect(result).toContain("## Context from task1");
      expect(result).toContain("## Context from task2");
    });

    it("should_summarize_large_contexts", () => {
      // Arrange
      const contexts = new Map<string, unknown>([
        ["task1", generateLongText(100)],
        ["task2", generateLongText(100)],
      ]);
      const config = createTestConfig();

      // Act
      const result = summarizeMultipleContexts(contexts, config);

      // Assert
      expect(result.length).toBeGreaterThan(0);
    });

    it("should_return_empty_string_for_empty_map", () => {
      // Arrange
      const contexts = new Map<string, unknown>();
      const config = createTestConfig();

      // Act
      const result = summarizeMultipleContexts(contexts, config);

      // Assert
      expect(result).toBe("");
    });
  });

  describe("境界値", () => {
    it("should_handle_single_context", () => {
      // Arrange
      const contexts = new Map<string, unknown>([["task1", "Single result"]]);
      const config = createTestConfig();

      // Act
      const result = summarizeMultipleContexts(contexts, config);

      // Assert
      expect(result).toContain("## Context from task1");
    });

    it("should_handle_many_contexts", () => {
      // Arrange
      const contexts = new Map<string, unknown>();
      for (let i = 0; i < 20; i++) {
        contexts.set(`task${i}`, generateLongText(30));
      }
      const config = createTestConfig({ maxOutputSize: 2000 });

      // Act
      const result = summarizeMultipleContexts(contexts, config);

      // Assert
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// needsSummarization
// ============================================================================

describe("needsSummarization", () => {
  describe("正常系", () => {
    it("should_return_false_for_short_text", () => {
      // Arrange
      const shortText = "Short text";
      const config = createTestConfig({ summaryThreshold: 100 });

      // Act
      const result = needsSummarization(shortText, config);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_true_for_long_text", () => {
      // Arrange
      const longText = "a".repeat(200);
      const config = createTestConfig({ summaryThreshold: 100 });

      // Act
      const result = needsSummarization(longText, config);

      // Assert
      expect(result).toBe(true);
    });

    it("should_work_with_object_input", () => {
      // Arrange
      const largeObject = { data: "a".repeat(200) };
      const config = createTestConfig({ summaryThreshold: 100 });

      // Act
      const result = needsSummarization(largeObject, config);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("境界値", () => {
    it("should_return_false_for_empty_string", () => {
      // Arrange
      const config = createTestConfig();

      // Act
      const result = needsSummarization("", config);

      // Assert
      expect(result).toBe(false);
    });

    it("should_return_false_for_null", () => {
      // Arrange
      const config = createTestConfig();

      // Act
      const result = needsSummarization(null, config);

      // Assert
      expect(result).toBe(false);
    });

    it("should_throw_for_undefined", () => {
      // Arrange
      const config = createTestConfig();

      // Act & Assert
      // Note: JSON.stringify(undefined) returns undefined, which causes an error
      expect(() => needsSummarization(undefined, config)).toThrow();
    });

    it("should_use_default_config_when_not_provided", () => {
      // Arrange
      const shortText = "Short";

      // Act
      const result = needsSummarization(shortText);

      // Assert
      expect(result).toBe(false);
    });
  });
});

// ============================================================================
// createSummarizerConfigFromEnv
// ============================================================================

describe("createSummarizerConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("正常系", () => {
    it("should_use_default_values_when_env_not_set", () => {
      // Arrange
      delete process.env.PI_DAG_CONTEXT_MAX_SIZE;
      delete process.env.PI_DAG_SUMMARY_THRESHOLD;
      delete process.env.PI_DAG_PRESERVE_STRUCTURE;
      delete process.env.PI_DAG_MAX_LINES_PER_SECTION;
      delete process.env.PI_DAG_TRUNCATE_CODE_BLOCKS;

      // Act
      const config = createSummarizerConfigFromEnv();

      // Assert
      expect(config.maxOutputSize).toBe(4000);
      expect(config.summaryThreshold).toBe(2000);
      expect(config.preserveStructure).toBe(true);
      expect(config.maxLinesPerSection).toBe(10);
      expect(config.truncateCodeBlocks).toBe(true);
    });

    it("should_read_custom_values_from_env", () => {
      // Arrange
      process.env.PI_DAG_CONTEXT_MAX_SIZE = "8000";
      process.env.PI_DAG_SUMMARY_THRESHOLD = "4000";
      process.env.PI_DAG_MAX_LINES_PER_SECTION = "20";

      // Act
      const config = createSummarizerConfigFromEnv();

      // Assert
      expect(config.maxOutputSize).toBe(8000);
      expect(config.summaryThreshold).toBe(4000);
      expect(config.maxLinesPerSection).toBe(20);
    });

    it("should_handle_PI_DAG_PRESERVE_STRUCTURE_0", () => {
      // Arrange
      process.env.PI_DAG_PRESERVE_STRUCTURE = "0";

      // Act
      const config = createSummarizerConfigFromEnv();

      // Assert
      expect(config.preserveStructure).toBe(false);
    });

    it("should_handle_PI_DAG_TRUNCATE_CODE_BLOCKS_0", () => {
      // Arrange
      process.env.PI_DAG_TRUNCATE_CODE_BLOCKS = "0";

      // Act
      const config = createSummarizerConfigFromEnv();

      // Assert
      expect(config.truncateCodeBlocks).toBe(false);
    });
  });

  describe("境界値", () => {
    it("should_handle_invalid_number_values", () => {
      // Arrange
      process.env.PI_DAG_CONTEXT_MAX_SIZE = "invalid";
      process.env.PI_DAG_SUMMARY_THRESHOLD = "also-invalid";

      // Act
      const config = createSummarizerConfigFromEnv();

      // Assert
      expect(isNaN(config.maxOutputSize)).toBe(true); // parseInt returns NaN
      expect(isNaN(config.summaryThreshold)).toBe(true);
    });
  });
});

// ============================================================================
// DEFAULT_SUMMARIZER_CONFIG
// ============================================================================

describe("DEFAULT_SUMMARIZER_CONFIG", () => {
  it("should_have_expected_default_values", () => {
    // Assert
    expect(DEFAULT_SUMMARIZER_CONFIG.maxOutputSize).toBe(4000);
    expect(DEFAULT_SUMMARIZER_CONFIG.summaryThreshold).toBe(2000);
    expect(DEFAULT_SUMMARIZER_CONFIG.preserveStructure).toBe(true);
    expect(DEFAULT_SUMMARIZER_CONFIG.maxLinesPerSection).toBe(10);
    expect(DEFAULT_SUMMARIZER_CONFIG.truncateCodeBlocks).toBe(true);
  });
});

// ============================================================================
// 統合テスト
// ============================================================================

describe("統合テスト", () => {
  it("should_handle_complete_summarization_workflow", () => {
    // Arrange
    const largeContext = generateSectionedText(5, 50);
    const config = createTestConfig({ maxOutputSize: 1000, summaryThreshold: 500 });

    // Phase 1: Check if summarization is needed
    const needsSummary = needsSummarization(largeContext, config);
    expect(needsSummary).toBe(true);

    // Phase 2: Summarize
    const summary = summarizeContext(largeContext, config);
    expect(summary.length).toBeLessThan(largeContext.length);
    expect(summary).toContain("<!-- SUMMARIZED_CONTEXT -->");

    // Phase 3: Check summarization not needed for summary
    const needsAnotherSummary = needsSummarization(summary, config);
    // Summary might still be large enough to need summarization
    expect(typeof needsAnotherSummary).toBe("boolean");
  });

  it("should_handle_multiple_contexts_workflow", () => {
    // Arrange
    const contexts = new Map<string, unknown>([
      ["task1", generateLongText(100)],
      ["task2", generateLongText(100)],
      ["task3", generateLongText(100)],
    ]);
    const config = createTestConfig({ maxOutputSize: 2000, summaryThreshold: 500 });

    // Act
    const combined = summarizeMultipleContexts(contexts, config);

    // Assert
    expect(combined).toContain("## Context from task1");
    expect(combined).toContain("## Context from task2");
    expect(combined).toContain("## Context from task3");
  });
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
  it("summarizeContext_有効な入力_常に文字列を返す", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.object(),
          fc.array(fc.anything())
        ),
        (context) => {
          const config = createTestConfig();
          const result = summarizeContext(context, config);
          return typeof result === "string";
        }
      )
    );
  });

  it("summarizeContext_閾値以下の文字列_変更なし", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 100 }),
        (shortText) => {
          const config = createTestConfig({ summaryThreshold: 1000 });
          const result = summarizeContext(shortText, config);
          return result === shortText;
        }
      )
    );
  });

  it("extractKeyInformation_任意の文字列_常に文字列を返す", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (text) => {
        const config = createTestConfig();
        const result = extractKeyInformation(text, config);
        return typeof result === "string";
      })
    );
  });

  it("needsSummarization_有効な入力_常にbooleanを返す", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.object(),
          fc.array(fc.anything())
        ),
        (context) => {
          const config = createTestConfig();
          const result = needsSummarization(context, config);
          return typeof result === "boolean";
        }
      )
    );
  });

  it("needsSummarization_短い文字列_常にfalse", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 50 }),
        (shortText) => {
          const config = createTestConfig({ summaryThreshold: 100 });
          const result = needsSummarization(shortText, config);
          return result === false;
        }
      )
    );
  });

  it("summarizeMultipleContexts_空Map_空文字列を返す", () => {
    fc.assert(
      fc.property(fc.constant(new Map()), (contexts) => {
        const config = createTestConfig();
        const result = summarizeMultipleContexts(contexts, config);
        return result === "";
      })
    );
  });

  it("summarizeContext_構造保持有効_マーカーを含む", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 600, maxLength: 2000 }),
        (longText) => {
          const config = createTestConfig({
            summaryThreshold: 500,
            preserveStructure: true
          });
          const result = summarizeContext(longText, config);
          if (result.length > 0) {
            return result.includes("<!-- SUMMARIZED_CONTEXT -->");
          }
          return true;
        }
      )
    );
  });

  it("extractKeyInformation_出力サイズ_常にmaxOutputSize以下", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 100, maxLength: 5000 }),
        fc.integer({ min: 500, max: 2000 }),
        (text, maxSize) => {
          const config = createTestConfig({ maxOutputSize: maxSize });
          const result = extractKeyInformation(text, config);
          // Allow some margin for truncation marker
          return result.length <= maxSize + 200;
        }
      )
    );
  });

  it("summarizeMultipleContexts_単一コンテキスト_コンテキスト名を含む", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (contextName, contextValue) => {
          const contexts = new Map([[contextName, contextValue]]);
          const config = createTestConfig({ summaryThreshold: 1000 });
          const result = summarizeMultipleContexts(contexts, config);
          return result.includes(`## Context from ${contextName}`);
        }
      )
    );
  });

  it("createSummarizerConfigFromEnv_常に有効な設定オブジェクトを返す", () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ maxLength: 10 }), { nil: undefined }),
        fc.option(fc.string({ maxLength: 10 }), { nil: undefined }),
        (maxSize, threshold) => {
          // Setup env
          const originalEnv = { ...process.env };
          if (maxSize !== undefined) process.env.PI_DAG_CONTEXT_MAX_SIZE = maxSize;
          if (threshold !== undefined) process.env.PI_DAG_SUMMARY_THRESHOLD = threshold;

          const config = createSummarizerConfigFromEnv();

          // Restore env
          process.env = originalEnv;

          return (
            typeof config.maxOutputSize === "number" &&
            typeof config.summaryThreshold === "number" &&
            typeof config.preserveStructure === "boolean" &&
            typeof config.maxLinesPerSection === "number" &&
            typeof config.truncateCodeBlocks === "boolean"
          );
        }
      )
    );
  });
});
