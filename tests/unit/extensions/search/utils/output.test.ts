/**
 * search/utils/output.ts 単体テスト
 * テスト対象: truncateResults, truncateHead, parseFdOutput, formatFileCandidates,
 *            parseRgOutput, parseCtagsOutput, parseCtagsTraditional,
 *            formatCodeSearch, formatSymbols, createErrorResponse,
 *            createCodeSearchError, formatError, escapeText, truncateText, relativePath,
 *            enhanceOutput, suggestNextAction, createHints, calculateSimpleConfidence,
 *            createSimpleHints, formatEnhancedOutput
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
	truncateResults,
	truncateHead,
	parseFdOutput,
	formatFileCandidates,
	parseRgOutput,
	summarizeResults,
	formatCodeSearch,
	parseCtagsOutput,
	parseCtagsTraditional,
	formatSymbols,
	createErrorResponse,
	createCodeSearchError,
	formatError,
	escapeText,
	truncateText,
	relativePath,
	enhanceOutput,
	suggestNextAction,
	createHints,
	calculateSimpleConfidence,
	createSimpleHints,
	formatEnhancedOutput,
	type SearchResponse,
	type FileCandidate,
	type CodeSearchMatch,
	type CodeSearchSummary,
	type SymbolDefinition,
} from "@ext/search/utils/output.js";

// ============================================================================
// truncateResults Tests
// ============================================================================

describe("truncateResults", () => {
	it("結果数が制限未満の場合は切り詰めない", () => {
		// Arrange
		const results = [1, 2, 3];
		const limit = 10;

		// Act
		const response = truncateResults(results, limit);

		// Assert
		expect(response.total).toBe(3);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual(results);
	});

	it("結果数が制限と等しい場合は切り詰めない", () => {
		// Arrange
		const results = [1, 2, 3];
		const limit = 3;

		// Act
		const response = truncateResults(results, limit);

		// Assert
		expect(response.total).toBe(3);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual(results);
	});

	it("結果数が制限を超える場合は切り詰める", () => {
		// Arrange
		const results = [1, 2, 3, 4, 5];
		const limit = 3;

		// Act
		const response = truncateResults(results, limit);

		// Assert
		expect(response.total).toBe(5);
		expect(response.truncated).toBe(true);
		expect(response.results).toEqual([1, 2, 3]);
	});

	it("空配列は切り詰めない", () => {
		// Arrange
		const results: number[] = [];
		const limit = 10;

		// Act
		const response = truncateResults(results, limit);

		// Assert
		expect(response.total).toBe(0);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual([]);
	});
});

// ============================================================================
// truncateHead Tests
// ============================================================================

describe("truncateHead", () => {
	it("結果数が制限未満の場合は切り詰めない", () => {
		// Arrange
		const results = [1, 2, 3];
		const limit = 10;

		// Act
		const response = truncateHead(results, limit);

		// Assert
		expect(response.total).toBe(3);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual(results);
	});

	it("結果数が制限を超える場合は末尾を残す", () => {
		// Arrange
		const results = [1, 2, 3, 4, 5];
		const limit = 3;

		// Act
		const response = truncateHead(results, limit);

		// Assert
		expect(response.total).toBe(5);
		expect(response.truncated).toBe(true);
		expect(response.results).toEqual([3, 4, 5]);
	});
});

// ============================================================================
// parseFdOutput Tests
// ============================================================================

describe("parseFdOutput", () => {
	it("空文字列を空配列にパースする", () => {
		// Arrange
		const stdout = "";

		// Act
		const results = parseFdOutput(stdout, "file");

		// Assert
		expect(results).toEqual([]);
	});

	it("1行を1つのファイル候補にパースする", () => {
		// Arrange
		const stdout = "src/index.ts\n";

		// Act
		const results = parseFdOutput(stdout, "file");

		// Assert
		expect(results).toHaveLength(1);
		expect(results[0].path).toBe("src/index.ts");
		expect(results[0].type).toBe("file");
	});

	it("複数行を複数のファイル候補にパースする", () => {
		// Arrange
		const stdout = "src/index.ts\nsrc/utils.ts\n";

		// Act
		const results = parseFdOutput(stdout, "file");

		// Assert
		expect(results).toHaveLength(2);
		expect(results[0].path).toBe("src/index.ts");
		expect(results[1].path).toBe("src/utils.ts");
	});

	it("デフォルトタイプはfileである", () => {
		// Arrange
		const stdout = "src/index.ts\n";

		// Act
		const results = parseFdOutput(stdout);

		// Assert
		expect(results[0].type).toBe("file");
	});

	it("typeパラメータを反映する", () => {
		// Arrange
		const stdout = "src/\n";

		// Act
		const results = parseFdOutput(stdout, "dir");

		// Assert
		expect(results[0].type).toBe("dir");
	});
});

// ============================================================================
// formatFileCandidates Tests
// ============================================================================

describe("formatFileCandidates", () => {
	it("ファイル候補を正しくフォーマットする", () => {
		// Arrange
		const output: SearchResponse<FileCandidate> = {
			total: 2,
			truncated: false,
			results: [
				{ path: "src/index.ts", type: "file" },
				{ path: "src/utils", type: "dir" },
			],
		};

		// Act
		const formatted = formatFileCandidates(output);

		// Assert
		expect(formatted).toContain("Found 2 entries");
		expect(formatted).toContain("[F] src/index.ts");
		expect(formatted).toContain("[D] src/utils");
	});

	it("truncatedフラグを表示する", () => {
		// Arrange
		const output: SearchResponse<FileCandidate> = {
			total: 100,
			truncated: true,
			results: [{ path: "src/index.ts", type: "file" }],
		};

		// Act
		const formatted = formatFileCandidates(output);

		// Assert
		expect(formatted).toContain("(truncated)");
	});

	it("エラーを表示する", () => {
		// Arrange
		const output: SearchResponse<FileCandidate> = {
			total: 0,
			truncated: false,
			results: [],
			error: "Permission denied",
		};

		// Act
		const formatted = formatFileCandidates(output);

		// Assert
		expect(formatted).toContain("Error: Permission denied");
	});
});

// ============================================================================
// parseRgOutput Tests
// ============================================================================

describe("parseRgOutput", () => {
	it("空文字列を空の結果にパースする", () => {
		// Arrange
		const stdout = "";

		// Act
		const { matches, summary } = parseRgOutput(stdout);

		// Assert
		expect(matches).toEqual([]);
		expect(summary.size).toBe(0);
	});

	it("無効なJSONをスキップする", () => {
		// Arrange
		const stdout = "invalid json\n";

		// Act
		const { matches, summary } = parseRgOutput(stdout);

		// Assert
		expect(matches).toEqual([]);
		expect(summary.size).toBe(0);
	});

	it("有効なJSONを正しくパースする", () => {
		// Arrange
		const stdout = JSON.stringify({
			type: "match",
			data: {
				path: { text: "test.ts" },
				lines: { text: "function test() {}" },
				line_number: 1,
				submatches: [{ match: { text: "test" }, start: 9, end: 13 }],
			},
		}) + "\n";

		// Act
		const { matches, summary } = parseRgOutput(stdout);

		// Assert
		expect(matches).toHaveLength(1);
		expect(matches[0].file).toBe("test.ts");
		expect(matches[0].line).toBe(1);
		expect(matches[0].text).toBe("function test() {}");
		expect(matches[0].column).toBe(10);
		expect(summary.get("test.ts")).toBe(1);
	});
});

// ============================================================================
// summarizeResults Tests
// ============================================================================

describe("summarizeResults", () => {
	it("サマリーマップを配列に変換する", () => {
		// Arrange
		const summary = new Map([
			["file1.ts", 5],
			["file2.ts", 3],
		]);

		// Act
		const result = summarizeResults(summary);

		// Assert
		expect(result).toHaveLength(2);
		expect(result).toContainEqual({ file: "file1.ts", count: 5 });
		expect(result).toContainEqual({ file: "file2.ts", count: 3 });
	});

	it("カウント順にソートする", () => {
		// Arrange
		const summary = new Map([
			["file1.ts", 1],
			["file2.ts", 3],
			["file3.ts", 2],
		]);

		// Act
		const result = summarizeResults(summary);

		// Assert
		expect(result[0].count).toBe(3);
		expect(result[1].count).toBe(2);
		expect(result[2].count).toBe(1);
	});
});

// ============================================================================
// parseCtagsOutput Tests
// ============================================================================

describe("parseCtagsOutput", () => {
	it("空文字列を空配列にパースする", () => {
		// Arrange
		const stdout = "";

		// Act
		const results = parseCtagsOutput(stdout);

		// Assert
		expect(results).toEqual([]);
	});

	it("無効なJSONをスキップする", () => {
		// Arrange
		const stdout = "invalid json\n";

		// Act
		const results = parseCtagsOutput(stdout);

		// Assert
		expect(results).toEqual([]);
	});

	it("有効なJSONを正しくパースする", () => {
		// Arrange
		const stdout = JSON.stringify({
			name: "testFunc",
			kind: "function",
			path: "test.ts",
			line: 10,
			signature: "(): void",
			scope: "TestClass",
		}) + "\n";

		// Act
		const results = parseCtagsOutput(stdout);

		// Assert
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({
			name: "testFunc",
			kind: "function",
			file: "test.ts",
			line: 10,
			signature: "(): void",
			scope: "TestClass",
		});
	});
});

// ============================================================================
// parseCtagsTraditional Tests
// ============================================================================

describe("parseCtagsTraditional", () => {
	it("コメント行をスキップする", () => {
		// Arrange
		const stdout = "!_TAG_FILE_FORMAT\t2\n";

		// Act
		const results = parseCtagsTraditional(stdout);

		// Assert
		expect(results).toEqual([]);
	});

	it("通常のエントリを正しくパースする", () => {
		// Arrange
		const stdout = "testFunc\ttest.ts\t/^function testFunc()/;\"\tf";

		// Act
		const results = parseCtagsTraditional(stdout);

		// Assert
		expect(results).toHaveLength(1);
		expect(results[0].name).toBe("testFunc");
		expect(results[0].file).toBe("test.ts");
		expect(results[0].kind).toBe("f");
	});
});

// ============================================================================
// formatSymbols Tests
// ============================================================================

describe("formatSymbols", () => {
	it("シンボルを種類別にグループ化してフォーマットする", () => {
		// Arrange
		const output: SearchResponse<SymbolDefinition> = {
			total: 3,
			truncated: false,
			results: [
				{ name: "func1", kind: "function", file: "test.ts", line: 10 },
				{ name: "class1", kind: "class", file: "test.ts", line: 1 },
				{ name: "func2", kind: "function", file: "test.ts", line: 20 },
			],
		};

		// Act
		const formatted = formatSymbols(output);

		// Assert
		expect(formatted).toContain("Found 3 symbols");
		expect(formatted).toContain("function:");
		expect(formatted).toContain("class:");
		expect(formatted).toContain("func1");
		expect(formatted).toContain("class1");
	});

	it("エラーを表示する", () => {
		// Arrange
		const output: SearchResponse<SymbolDefinition> = {
			total: 0,
			truncated: false,
			results: [],
			error: "Index not found",
		};

		// Act
		const formatted = formatSymbols(output);

		// Assert
		expect(formatted).toContain("Error: Index not found");
	});
});

// ============================================================================
// Error Response Tests
// ============================================================================

describe("createErrorResponse", () => {
	it("エラーレスポンスを作成する", () => {
		// Arrange
		const errorMessage = "Test error";

		// Act
		const response = createErrorResponse<number>(errorMessage);

		// Assert
		expect(response.error).toBe(errorMessage);
		expect(response.total).toBe(0);
		expect(response.truncated).toBe(false);
		expect(response.results).toEqual([]);
	});
});

describe("createCodeSearchError", () => {
	it("コード検索エラーを作成する", () => {
		// Arrange
		const errorMessage = "Pattern not found";

		// Act
		const response = createCodeSearchError(errorMessage);

		// Assert
		expect(response.error).toBe(errorMessage);
		expect(response.total).toBe(0);
		expect(response.truncated).toBe(false);
		expect(response.summary).toEqual([]);
		expect(response.results).toEqual([]);
	});
});

describe("formatError", () => {
	it("Errorオブジェクトをフォーマットする", () => {
		// Arrange
		const tool = "rg";
		const error = new Error("Command failed");

		// Act
		const formatted = formatError(tool, error);

		// Assert
		expect(formatted).toBe("rg error: Command failed");
	});

	it("文字列をフォーマットする", () => {
		// Arrange
		const tool = "fd";
		const error = "Unknown error";

		// Act
		const formatted = formatError(tool, error);

		// Assert
		expect(formatted).toBe("fd error: Unknown error");
	});
});

// ============================================================================
// Text Utilities Tests
// ============================================================================

describe("escapeText", () => {
	it("改行文字をエスケープする", () => {
		// Arrange
		const text = "line1\nline2";

		// Act
		const escaped = escapeText(text);

		// Assert
		expect(escaped).toBe("line1\\nline2");
	});

	it("キャリッジリターンをエスケープする", () => {
		// Arrange
		const text = "text\r";

		// Act
		const escaped = escapeText(text);

		// Assert
		expect(escaped).toBe("text\\r");
	});

	it("タブをエスケープする", () => {
		// Arrange
		const text = "text\ttab";

		// Act
		const escaped = escapeText(text);

		// Assert
		expect(escaped).toBe("text\\ttab");
	});
});

describe("truncateText", () => {
	it("短いテキストは変更しない", () => {
		// Arrange
		const text = "short";
		const maxLength = 10;

		// Act
		const truncated = truncateText(text, maxLength);

		// Assert
		expect(truncated).toBe("short");
	});

	it("長いテキストを切り詰める", () => {
		// Arrange
		const text = "this is a long text";
		const maxLength = 10;

		// Act
		const truncated = truncateText(text, maxLength);

		// Assert
		expect(truncated).toBe("this is...");
		expect(truncated.length).toBe(10);
	});
});

describe("relativePath", () => {
	it("絶対パスから相対パスを計算する", () => {
		// Arrange
		const absolute = "/home/user/project/src/index.ts";
		const cwd = "/home/user/project";

		// Act
		const rel = relativePath(absolute, cwd);

		// Assert
		expect(rel).toBe("src/index.ts");
	});

	it("異なるルートパスは絶対パスを返す", () => {
		// Arrange
		const absolute = "/other/path/file.ts";
		const cwd = "/home/user/project";

		// Act
		const rel = relativePath(absolute, cwd);

		// Assert
		expect(rel).toBe("/other/path/file.ts");
	});
});

// ============================================================================
// enhanceOutput Tests
// ============================================================================

describe("enhanceOutput", () => {
	it("拡張出力を生成する", () => {
		// Arrange
		const response: SearchResponse<number> = {
			total: 5,
			truncated: false,
			results: [1, 2, 3, 4, 5],
		};
		const metrics = {
			filesSearched: 100,
			durationMs: 500,
		};

		// Act
		const enhanced = enhanceOutput(response, metrics);

		// Assert
		expect(enhanced.results).toEqual([1, 2, 3, 4, 5]);
		expect(enhanced.total).toBe(5);
		expect(enhanced.truncated).toBe(false);
		expect(enhanced.hints.confidence).toBeGreaterThan(0);
		expect(enhanced.stats.filesSearched).toBe(100);
		expect(enhanced.stats.durationMs).toBe(500);
	});
});

// ============================================================================
// suggestNextAction Tests
// ============================================================================

describe("suggestNextAction", () => {
	it("結果が0件の場合はexpand_scopeを提案する", () => {
		// Arrange
		const response: SearchResponse<number> = {
			total: 0,
			truncated: false,
			results: [],
		};

		// Act
		const action = suggestNextAction(response);

		// Assert
		expect(action).toBe("expand_scope");
	});

	it("大幅に切り詰められた場合はrefine_patternを提案する", () => {
		// Arrange
		const response: SearchResponse<number> = {
			total: 201,
			truncated: true,
			results: [],
		};

		// Act
		const action = suggestNextAction(response);

		// Assert
		expect(action).toBe("refine_pattern");
	});

	it("切り詰められた場合はincrease_limitを提案する", () => {
		// Arrange
		const response: SearchResponse<number> = {
			total: 110,
			truncated: true,
			results: [],
		};

		// Act
		const action = suggestNextAction(response);

		// Assert
		expect(action).toBe("increase_limit");
	});

	it("結果が十分な場合はundefinedを返す", () => {
		// Arrange
		const response: SearchResponse<number> = {
			total: 10,
			truncated: false,
			results: [],
		};

		// Act
		const action = suggestNextAction(response);

		// Assert
		expect(action).toBeUndefined();
	});
});

// ============================================================================
// createHints Tests
// ============================================================================

describe("createHints", () => {
	it("結果に基づいたヒントを生成する", () => {
		// Arrange
		const response: SearchResponse<number> = {
			total: 0,
			truncated: false,
			results: [],
		};
		const metrics = {
			filesSearched: 100,
			durationMs: 500,
		};

		// Act
		const hints = createHints(response, metrics, "code_search");

		// Assert
		expect(hints.confidence).toBeGreaterThan(0);
		expect(hints.suggestedNextAction).toBeDefined();
	});
});

// ============================================================================
// calculateSimpleConfidence Tests
// ============================================================================

describe("calculateSimpleConfidence", () => {
	it("結果数0の場合は低い信頼度を返す", () => {
		// Act
		const confidence = calculateSimpleConfidence(0, false);

		// Assert
		expect(confidence).toBe(0.1);
	});

	it("多くの結果または切り詰めの場合は高い信頼度を返す", () => {
		// Act
		const confidence1 = calculateSimpleConfidence(60, false);
		const confidence2 = calculateSimpleConfidence(10, true);

		// Assert
		expect(confidence1).toBe(0.9);
		expect(confidence2).toBe(0.9);
	});

	it("中程度の結果数は中程度の信頼度を返す", () => {
		// Act
		const confidence = calculateSimpleConfidence(20, false);

		// Assert
		expect(confidence).toBeGreaterThan(0.1);
		expect(confidence).toBeLessThan(0.9);
	});
});

// ============================================================================
// createSimpleHints Tests
// ============================================================================

describe("createSimpleHints", () => {
	it("結果に基づいたシンプルなヒントを生成する", () => {
		// Arrange
		const toolName = "file_candidates";
		const resultCount = 0;
		const truncated = false;

		// Act
		const hints = createSimpleHints(toolName, resultCount, truncated, "*.ts");

		// Assert
		expect(hints.confidence).toBe(0.1);
		expect(hints.suggestedNextAction).toBeDefined();
	});
});

// ============================================================================
// formatEnhancedOutput Tests
// ============================================================================

describe("formatEnhancedOutput", () => {
	it("拡張出力をフォーマットする", () => {
		// Arrange
		const output = {
			results: [1, 2, 3],
			total: 3,
			truncated: false,
			hints: {
				confidence: 0.9,
				suggestedNextAction: "refine_pattern",
			},
			stats: {
				filesSearched: 100,
				durationMs: 500,
			},
		};
		const formatResult = (v: number) => `Result: ${v}`;

		// Act
		const formatted = formatEnhancedOutput(output, formatResult);

		// Assert
		expect(formatted).toContain("Results: 3 (Complete)");
		expect(formatted).toContain("Result: 1");
		expect(formatted).toContain("Result: 2");
		expect(formatted).toContain("Result: 3");
		expect(formatted).toContain("Confidence: 90%");
	});

	it("統計情報を含める", () => {
		// Arrange
		const output = {
			results: [],
			total: 0,
			truncated: false,
			hints: { confidence: 0.5 },
			stats: {
				filesSearched: 100,
				durationMs: 500,
			},
		};
		const formatResult = (v: number) => `Result: ${v}`;

		// Act
		const formatted = formatEnhancedOutput(output, formatResult);

		// Assert
		expect(formatted).toContain("--- Statistics ---");
		expect(formatted).toContain("Duration: 500ms");
		expect(formatted).toContain("Files searched: 100");
	});
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe("truncateResults プロパティベーステスト", () => {
	it("結果のtotalは常に元の配列長と一致する", () => {
		fc.assert(
			fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 100 }), (results, limit) => {
				const response = truncateResults(results, limit);
				return response.total === results.length;
			})
		);
	});

	it("truncatedフラグは配列長 > limitの場合のみtrue", () => {
		fc.assert(
			fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 100 }), (results, limit) => {
				const response = truncateResults(results, limit);
				return response.truncated === (results.length > limit);
			})
		);
	});

	it("resultsの長さはlimit以下である", () => {
		fc.assert(
			fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 100 }), (results, limit) => {
				const response = truncateResults(results, limit);
				return response.results.length <= limit;
			})
		);
	});
});

describe("truncateText プロパティベーステスト", () => {
	it("切り詰められたテキストの長さはmaxLength以下である", () => {
		fc.assert(
			fc.property(fc.string(), fc.integer({ min: 1, max: 100 }), (text, maxLength) => {
				const truncated = truncateText(text, maxLength);
				return truncated.length <= maxLength;
			})
		);
	});

	it("短いテキストは変更されない", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 50 }),
				fc.integer({ min: 50, max: 100 }),
				(text, maxLength) => {
					const truncated = truncateText(text, maxLength);
					return truncated === text;
				}
			)
		);
	});
});

describe("calculateSimpleConfidence プロパティベーステスト", () => {
	it("信頼度は常に0.0から1.0の間である", () => {
		fc.assert(
			fc.property(fc.integer({ min: 0, max: 100 }), fc.boolean(), (count, truncated) => {
				const confidence = calculateSimpleConfidence(count, truncated);
				return confidence >= 0.0 && confidence <= 1.0;
			})
		);
	});

	it("count=0の場合は常に0.1である", () => {
		fc.assert(
			fc.property(fc.boolean(), (truncated) => {
				const confidence = calculateSimpleConfidence(0, truncated);
				return confidence === 0.1;
			})
		);
	});

	it("truncated=trueの場合は常に0.9である（count>50の場合）", () => {
		fc.assert(
			fc.property(fc.integer({ min: 51, max: 100 }), (count) => {
				const confidence = calculateSimpleConfidence(count, true);
				return confidence === 0.9;
			})
		);
	});
});

describe("escapeText プロパティベーステスト", () => {
	it("特殊文字はエスケープされる", () => {
		fc.assert(
			fc.property(fc.tuple(fc.string(), fc.constantFrom("\n", "\r", "\t"), fc.string()), ([before, special, after]) => {
				const text = `${before}${special}${after}`;
				const escaped = escapeText(text);
				return !escaped.includes("\n") && !escaped.includes("\r") && !escaped.includes("\t");
			}),
			{ numRuns: 100 }
		);
	});
});
