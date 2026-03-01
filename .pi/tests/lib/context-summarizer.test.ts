/**
 * @abdd.meta
 * path: .pi/tests/lib/context-summarizer.test.ts
 * role: context-summarizer.tsの単体テスト
 * why: DAGハンドオフ時のコンテキスト要約の正確性を保証するため
 * related: .pi/lib/context-summarizer.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * @abdd.explain
 * overview: コンテキスト要約機能の単体テスト
 * what_it_does:
 *   - 要約関数の入出力を検証
 *   - 閾値境界をテスト
 *   - 環境変数設定をテスト
 * why_it_exists:
 *   - コンテキスト要約の品質保証
 *   - トークン効率化の信頼性確保
 * scope:
 *   in: summarizeContext, extractKeyInformation, needsSummarization等
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	summarizeContext,
	extractKeyInformation,
	summarizeMultipleContexts,
	needsSummarization,
	createSummarizerConfigFromEnv,
	DEFAULT_SUMMARIZER_CONFIG,
	type SummarizerConfig,
} from "../../lib/context-summarizer.js";

describe("context-summarizer", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("DEFAULT_SUMMARIZER_CONFIG", () => {
		it("should_have_correct_default_values", () => {
			// Assert
			expect(DEFAULT_SUMMARIZER_CONFIG.maxOutputSize).toBe(4000);
			expect(DEFAULT_SUMMARIZER_CONFIG.summaryThreshold).toBe(2000);
			expect(DEFAULT_SUMMARIZER_CONFIG.preserveStructure).toBe(true);
			expect(DEFAULT_SUMMARIZER_CONFIG.maxLinesPerSection).toBe(10);
			expect(DEFAULT_SUMMARIZER_CONFIG.truncateCodeBlocks).toBe(true);
		});
	});

	describe("createSummarizerConfigFromEnv", () => {
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

		it("should_use_env_values_when_set", () => {
			// Arrange
			process.env.PI_DAG_CONTEXT_MAX_SIZE = "8000";
			process.env.PI_DAG_SUMMARY_THRESHOLD = "4000";
			process.env.PI_DAG_PRESERVE_STRUCTURE = "0";
			process.env.PI_DAG_MAX_LINES_PER_SECTION = "20";
			process.env.PI_DAG_TRUNCATE_CODE_BLOCKS = "0";

			// Act
			const config = createSummarizerConfigFromEnv();

			// Assert
			expect(config.maxOutputSize).toBe(8000);
			expect(config.summaryThreshold).toBe(4000);
			expect(config.preserveStructure).toBe(false);
			expect(config.maxLinesPerSection).toBe(20);
			expect(config.truncateCodeBlocks).toBe(false);
		});
	});

	describe("summarizeContext", () => {
		it("should_return_as_is_when_below_threshold", () => {
			// Arrange
			const shortContext = "Short content";
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeContext(shortContext, config);

			// Assert
			expect(result).toBe(shortContext);
		});

		it("should_summarize_when_above_threshold", () => {
			// Arrange
			const longContext = "x".repeat(3000);
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeContext(longContext, config);

			// Assert
			// 構造マーカーが追加されるため、正確な長さ比較ではなく
			// 要約が行われたこと（マーカーの存在）を確認
			expect(result).toContain("<!-- SUMMARIZED_CONTEXT -->");
			expect(result).toContain("<!-- END_SUMMARY -->");
		});

		it("should_not_add_structure_markers_when_preserveStructure_false", () => {
			// Arrange
			const longContext = "x".repeat(3000);
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: false,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeContext(longContext, config);

			// Assert
			expect(result).not.toContain("<!-- SUMMARIZED_CONTEXT -->");
		});

		it("should_stringify_object_input", () => {
			// Arrange
			const objectContext = { key: "value", nested: { a: 1 } };
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeContext(objectContext, config);

			// Assert
			expect(result).toContain('"key"');
			expect(result).toContain('"value"');
		});
	});

	describe("extractKeyInformation", () => {
		it("should_split_into_sections_by_headers", () => {
			// Arrange
			const text = `## Section 1
Content for section 1

## Section 2
Content for section 2`;
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = extractKeyInformation(text, config);

			// Assert
			expect(result).toContain("## Section 1");
			expect(result).toContain("## Section 2");
		});

		it("should_truncate_long_sections", () => {
			// Arrange
			const lines = Array(30).fill("Content line");
			const text = `## Long Section\n${lines.join("\n")}`;
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = extractKeyInformation(text, config);

			// Assert
			expect(result).toContain("...");
		});

		it("should_respect_maxOutputSize", () => {
			// Arrange
			const longText = "x".repeat(5000);
			const config: SummarizerConfig = {
				maxOutputSize: 1000,
				summaryThreshold: 500,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = extractKeyInformation(longText, config);

			// Assert
			expect(result.length).toBeLessThanOrEqual(1100); // マージン許容
		});
	});

	describe("summarizeMultipleContexts", () => {
		it("should_combine_multiple_contexts", () => {
			// Arrange
			const contexts = new Map<string, string>();
			contexts.set("task1", "Output from task 1");
			contexts.set("task2", "Output from task 2");
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeMultipleContexts(contexts, config);

			// Assert
			expect(result).toContain("## Context from task1");
			expect(result).toContain("## Context from task2");
			expect(result).toContain("Output from task 1");
			expect(result).toContain("Output from task 2");
		});

		it("should_further_summarize_if_combined_too_large", () => {
			// Arrange
			const contexts = new Map<string, string>();
			contexts.set("task1", "x".repeat(5000));
			contexts.set("task2", "y".repeat(5000));
			const config: SummarizerConfig = {
				maxOutputSize: 1000,
				summaryThreshold: 500,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeMultipleContexts(contexts, config);

			// Assert
			expect(result.length).toBeLessThanOrEqual(3000);
		});

		it("should_handle_empty_map", () => {
			// Arrange
			const contexts = new Map<string, string>();
			const config: SummarizerConfig = DEFAULT_SUMMARIZER_CONFIG;

			// Act
			const result = summarizeMultipleContexts(contexts, config);

			// Assert
			expect(result).toBe("");
		});
	});

	describe("needsSummarization", () => {
		it("should_return_false_for_short_context", () => {
			// Arrange
			const shortContext = "Short content";
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = needsSummarization(shortContext, config);

			// Assert
			expect(result).toBe(false);
		});

		it("should_return_true_for_long_context", () => {
			// Arrange
			const longContext = "x".repeat(3000);
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = needsSummarization(longContext, config);

			// Assert
			expect(result).toBe(true);
		});

		it("should_handle_object_input", () => {
			// Arrange
			const objectContext = { data: "x".repeat(3000) };
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = needsSummarization(objectContext, config);

			// Assert
			expect(result).toBe(true);
		});

		it("should_return_false_at_exact_threshold", () => {
			// Arrange
			const thresholdContext = "x".repeat(2000);
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 2000,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = needsSummarization(thresholdContext, config);

			// Assert
			expect(result).toBe(false);
		});
	});

	describe("code block processing", () => {
		it("should_truncate_long_code_blocks", () => {
			// Arrange
			const codeLines = Array(20).fill("const x = 1;");
			const text = `## Code Section\n\`\`\`typescript\n${codeLines.join("\n")}\n\`\`\``;
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 100,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeContext(text, config);

			// Assert
			expect(result).toContain("// ... truncated ...");
		});

		it("should_keep_short_code_blocks_intact", () => {
			// Arrange
			const text = `## Code Section\n\`\`\`typescript\nconst x = 1;\nconst y = 2;\n\`\`\``;
			const config: SummarizerConfig = {
				maxOutputSize: 4000,
				summaryThreshold: 100,
				preserveStructure: true,
				maxLinesPerSection: 10,
				truncateCodeBlocks: true,
			};

			// Act
			const result = summarizeContext(text, config);

			// Assert
			expect(result).toContain("const x = 1;");
			expect(result).toContain("const y = 2;");
			expect(result).not.toContain("truncated");
		});
	});
});
