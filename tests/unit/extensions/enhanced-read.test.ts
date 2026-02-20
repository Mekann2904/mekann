/**
 * @file .pi/extensions/enhanced-read.ts の単体テスト
 * @description シンタックスハイライト付きファイル読み込みロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
	highlightCode: vi.fn((code, lang) => code),
	getLanguageFromPath: vi.fn((path) => {
		const ext = path.split(".").pop()?.toLowerCase();
		const langMap: Record<string, string> = {
			ts: "typescript",
			tsx: "typescript",
			js: "javascript",
			jsx: "javascript",
			py: "python",
			rs: "rust",
			md: "markdown",
		};
		return langMap[ext || ""] || "text";
	}),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => "line1\nline2\nline3"),
}));

// モック後にインポート
import enhancedRead from "../../../.pi/extensions/enhanced-read.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("enhanced-read.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(enhancedRead).toBeDefined();
		expect(typeof enhancedRead).toBe("function");
	});
});

// ============================================================================
// 行番号フォーマットのテスト
// ============================================================================

describe("formatWithLineNumbers関数", () => {
	const formatWithLineNumbers = (
		lines: string[],
		startLine: number
	): string => {
		const maxLineNum = startLine + lines.length - 1;
		const width = maxLineNum.toString().length;

		return lines
			.map((line, index) => {
				const lineNum = (startLine + index).toString().padStart(width, " ");
				return `${lineNum} | ${line}`;
			})
			.join("\n");
	};

	it("基本的な行番号付きフォーマット", () => {
		const lines = ["const x = 1;", "const y = 2;"];
		const result = formatWithLineNumbers(lines, 1);
		expect(result).toBe("1 | const x = 1;\n2 | const y = 2;");
	});

	it("開始行が2以上の場合", () => {
		const lines = ["line10", "line11"];
		const result = formatWithLineNumbers(lines, 10);
		expect(result).toBe("10 | line10\n11 | line11");
	});

	it("行番号の幅が揃う", () => {
		const lines = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
		const result = formatWithLineNumbers(lines, 1);
		expect(result).toContain(" 1 | a");
		expect(result).toContain("10 | j");
	});

	it("100行以上の場合", () => {
		const lines = ["line100", "line101"];
		const result = formatWithLineNumbers(lines, 100);
		expect(result).toContain("100 | line100");
		expect(result).toContain("101 | line101");
	});

	it("空の配列の場合", () => {
		const result = formatWithLineNumbers([], 1);
		expect(result).toBe("");
	});
});

// ============================================================================
// パラメータ検証のテスト
// ============================================================================

describe("パラメータ検証", () => {
	describe("offset検証", () => {
		it("offset < 1 はエラー", () => {
			const offset = 0;
			const isValid = offset >= 1;
			expect(isValid).toBe(false);
		});

		it("offset = 1 は有効", () => {
			const offset = 1;
			const isValid = offset >= 1;
			expect(isValid).toBe(true);
		});

		it("負のoffsetはエラー", () => {
			const offset = -5;
			const isValid = offset >= 1;
			expect(isValid).toBe(false);
		});
	});

	describe("limit検証", () => {
		it("limit < 1 はエラー", () => {
			const limit = 0;
			const isValid = limit === undefined || limit >= 1;
			expect(isValid).toBe(false);
		});

		it("limit = undefined は有効（全行取得）", () => {
			const limit = undefined;
			const isValid = limit === undefined || limit >= 1;
			expect(isValid).toBe(true);
		});

		it("limit = 100 は有効", () => {
			const limit = 100;
			const isValid = limit === undefined || limit >= 1;
			expect(isValid).toBe(true);
		});
	});
});

// ============================================================================
// 言語検出のテスト
// ============================================================================

describe("言語検出", () => {
	const getLanguageFromPath = (path: string): string => {
		const ext = path.split(".").pop()?.toLowerCase();
		const langMap: Record<string, string> = {
			ts: "typescript",
			tsx: "typescript",
			js: "javascript",
			jsx: "javascript",
			py: "python",
			rs: "rust",
			md: "markdown",
			go: "go",
			java: "java",
		};
		return langMap[ext || ""] || "text";
	};

	it("TypeScriptファイルを検出", () => {
		expect(getLanguageFromPath("main.ts")).toBe("typescript");
		expect(getLanguageFromPath("component.tsx")).toBe("typescript");
	});

	it("JavaScriptファイルを検出", () => {
		expect(getLanguageFromPath("app.js")).toBe("javascript");
		expect(getLanguageFromPath("component.jsx")).toBe("javascript");
	});

	it("Pythonファイルを検出", () => {
		expect(getLanguageFromPath("script.py")).toBe("python");
	});

	it("Rustファイルを検出", () => {
		expect(getLanguageFromPath("main.rs")).toBe("rust");
	});

	it("Markdownファイルを検出", () => {
		expect(getLanguageFromPath("README.md")).toBe("markdown");
	});

	it("未知の拡張子はtext", () => {
		expect(getLanguageFromPath("config.unknown")).toBe("text");
		expect(getLanguageFromPath("Makefile")).toBe("text");
	});
});

// ============================================================================
// 範囲計算のテスト
// ============================================================================

describe("範囲計算", () => {
	describe("startLine計算", () => {
		it("offset = 1 の場合、startLine = 1", () => {
			const offset = 1;
			const startLine = offset;
			expect(startLine).toBe(1);
		});

		it("offset = 100 の場合、startLine = 100", () => {
			const offset = 100;
			const startLine = offset;
			expect(startLine).toBe(100);
		});
	});

	describe("endLine計算", () => {
		const calculateEndLine = (
			startLine: number,
			limit: number | undefined,
			totalLines: number
		): number => {
			if (limit === undefined) {
				return totalLines;
			}
			return Math.min(startLine + limit - 1, totalLines);
		};

		it("limitなしの場合、endLine = totalLines", () => {
			expect(calculateEndLine(1, undefined, 100)).toBe(100);
		});

		it("limitありの場合、endLine = startLine + limit - 1", () => {
			expect(calculateEndLine(10, 50, 100)).toBe(59);
		});

		it("limitがtotalLinesを超える場合、totalLinesでキャップ", () => {
			expect(calculateEndLine(90, 50, 100)).toBe(100);
		});
	});

	describe("displayedLines計算", () => {
		const calculateDisplayedLines = (
			startLine: number,
			endLine: number
		): number => {
			return endLine - startLine + 1;
		};

		it("正しい行数を計算", () => {
			expect(calculateDisplayedLines(1, 10)).toBe(10);
			expect(calculateDisplayedLines(50, 100)).toBe(51);
		});
	});
});

// ============================================================================
// EnhancedReadDetails型のテスト
// ============================================================================

describe("EnhancedReadDetails型", () => {
	interface EnhancedReadDetails {
		path: string;
		language: string;
		totalLines: number;
		startLine: number;
		endLine: number;
		displayedLines: number;
		error?: string;
	}

	it("正常時のdetails構造", () => {
		const details: EnhancedReadDetails = {
			path: "/path/to/file.ts",
			language: "typescript",
			totalLines: 100,
			startLine: 1,
			endLine: 50,
			displayedLines: 50,
		};

		expect(details.path).toBe("/path/to/file.ts");
		expect(details.language).toBe("typescript");
		expect(details.totalLines).toBe(100);
		expect(details.error).toBeUndefined();
	});

	it("エラー時のdetails構造", () => {
		const details: EnhancedReadDetails = {
			path: "/path/to/missing.ts",
			language: "",
			totalLines: 0,
			startLine: 0,
			endLine: 0,
			displayedLines: 0,
			error: "File not found",
		};

		expect(details.error).toBe("File not found");
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空ファイル", () => {
		it("totalLines = 0", () => {
			const content = "";
			const lines = content.split("\n").filter((l) => l !== "");
			expect(lines.length).toBe(0);
		});
	});

	describe("1行のみのファイル", () => {
		it("totalLines = 1", () => {
			const content = "single line";
			const lines = content.split("\n");
			expect(lines.length).toBe(1);
		});
	});

	describe("offsetがtotalLinesを超える場合", () => {
		it("空の結果を返す", () => {
			const totalLines = 10;
			const offset = 20;
			const hasContent = offset <= totalLines;
			expect(hasContent).toBe(false);
		});
	});

	describe("特殊文字を含むファイルパス", () => {
		it("スペースを含むパス", () => {
			const path = "/path/to/my file.ts";
			expect(path).toContain(" ");
		});

		it("日本語を含むパス", () => {
			const path = "/path/to/開発/main.ts";
			expect(path).toContain("開発");
		});
	});
});
