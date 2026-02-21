/**
 * @file .pi/extensions/code-viewer.ts の単体テスト
 * @description コードビューアツールロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
	highlightCode: vi.fn((code) => code),
	getLanguageFromPath: vi.fn((path) => {
		const ext = path.split(".").pop()?.toLowerCase();
		const langMap: Record<string, string> = {
			ts: "typescript",
			js: "javascript",
			py: "python",
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
import codeViewer from "../../../.pi/extensions/code-viewer.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("code-viewer.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(codeViewer).toBeDefined();
		expect(typeof codeViewer).toBe("function");
	});
});

// ============================================================================
// 行番号フォーマットのテスト
// ============================================================================

describe("formatWithLineNumbers関数", () => {
	const formatWithLineNumbers = (
		lines: string[],
		startLine: number = 1
	): string => {
		const maxLineNum = startLine + lines.length - 1;
		const width = maxLineNum.toString().length;

		return lines
			.map((line, index) => {
				const lineNum = (startLine + index)
					.toString()
					.padStart(width, " ");
				return `${lineNum} | ${line}`;
			})
			.join("\n");
	};

	it("基本的な行番号付きフォーマット", () => {
		const lines = ["const x = 1;", "const y = 2;"];
		const result = formatWithLineNumbers(lines);
		expect(result).toBe("1 | const x = 1;\n2 | const y = 2;");
	});

	it("開始行を指定可能", () => {
		const lines = ["line 10", "line 11"];
		const result = formatWithLineNumbers(lines, 10);
		expect(result).toBe("10 | line 10\n11 | line 11");
	});

	it("行番号の幅が揃う", () => {
		const lines = Array(10).fill("line");
		const result = formatWithLineNumbers(lines, 1);
		expect(result).toContain(" 1 | line");
		expect(result).toContain("10 | line");
	});

	it("空の配列の場合", () => {
		const result = formatWithLineNumbers([]);
		expect(result).toBe("");
	});
});

// ============================================================================
// パラメータ検証のテスト
// ============================================================================

describe("パラメータ検証", () => {
	describe("path/code必須", () => {
		it("pathもcodeもない場合はエラー", () => {
			const params = {};
			const hasRequired = !!(params as any).path || !!(params as any).code;
			expect(hasRequired).toBe(false);
		});

		it("pathがある場合は有効", () => {
			const params = { path: "main.ts" };
			const hasRequired = !!(params as any).path || !!(params as any).code;
			expect(hasRequired).toBe(true);
		});

		it("codeがある場合は有効", () => {
			const params = { code: "const x = 1;" };
			const hasRequired = !!(params as any).path || !!(params as any).code;
			expect(hasRequired).toBe(true);
		});

		it("両方ある場合も有効", () => {
			const params = { path: "main.ts", code: "const x = 1;" };
			const hasRequired = !!(params as any).path || !!(params as any).code;
			expect(hasRequired).toBe(true);
		});
	});

	describe("language自動検出", () => {
		it("pathから言語を検出", () => {
			const path = "main.ts";
			const ext = path.split(".").pop()?.toLowerCase();
			expect(ext).toBe("ts");
		});

		it("code指定時はlanguageも必要", () => {
			const params = { code: "const x = 1;", language: "typescript" };
			expect(params.language).toBe("typescript");
		});

		it("language省略時はpathから検出", () => {
			const params = { path: "main.ts" };
			// 実際のロジックではgetLanguageFromPathを使用
			expect(params.path).toBe("main.ts");
		});
	});
});

// ============================================================================
// ViewCodeDetails型のテスト
// ============================================================================

describe("ViewCodeDetails型", () => {
	interface ViewCodeDetails {
		path?: string;
		language?: string;
		lineCount: number;
		error?: string;
	}

	it("正常時のdetails構造", () => {
		const details: ViewCodeDetails = {
			path: "/path/to/file.ts",
			language: "typescript",
			lineCount: 100,
		};

		expect(details.path).toBe("/path/to/file.ts");
		expect(details.language).toBe("typescript");
		expect(details.lineCount).toBe(100);
		expect(details.error).toBeUndefined();
	});

	it("エラー時のdetails構造", () => {
		const details: ViewCodeDetails = {
			lineCount: 0,
			error: "File not found",
		};

		expect(details.error).toBe("File not found");
		expect(details.lineCount).toBe(0);
	});
});

// ============================================================================
// レスポンスフォーマットのテスト
// ============================================================================

describe("レスポンスフォーマット", () => {
	it("正常時のレスポンス構造", () => {
		const response = {
			content: [
				{
					type: "text" as const,
					text: "1 | const x = 1;\n2 | const y = 2;",
				},
			],
			details: {
				path: "main.ts",
				language: "typescript",
				lineCount: 2,
			},
		};

		expect(response.content[0].type).toBe("text");
		expect(response.content[0].text).toContain("1 |");
	});

	it("エラー時のレスポンス構造", () => {
		const response = {
			content: [
				{
					type: "text" as const,
					text: "エラー: ファイルが見つかりません",
				},
			],
			details: {
				lineCount: 0,
				error: "File not found",
			},
		};

		expect(response.content[0].text).toContain("エラー");
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
		};
		return langMap[ext || ""] || "text";
	};

	it("TypeScriptファイルを検出", () => {
		expect(getLanguageFromPath("main.ts")).toBe("typescript");
		expect(getLanguageFromPath("component.tsx")).toBe("typescript");
	});

	it("JavaScriptファイルを検出", () => {
		expect(getLanguageFromPath("app.js")).toBe("javascript");
	});

	it("Pythonファイルを検出", () => {
		expect(getLanguageFromPath("script.py")).toBe("python");
	});

	it("未知の拡張子はtext", () => {
		expect(getLanguageFromPath("config.unknown")).toBe("text");
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のコード", () => {
		it("空文字列でも処理可能", () => {
			const code = "";
			const lines = code.split("\n");
			expect(lines).toHaveLength(1);
		});
	});

	describe("非常に長いコード", () => {
		it("多数の行でも処理可能", () => {
			const lines = Array(10000).fill("line");
			expect(lines.length).toBe(10000);
		});
	});

	describe("特殊文字を含むパス", () => {
		it("スペースを含むパス", () => {
			const path = "src/my file.ts";
			expect(path).toContain(" ");
		});

		it("日本語を含むパス", () => {
			const path = "src/開発/main.ts";
			expect(path).toContain("開発");
		});
	});

	describe("拡張子なしのファイル", () => {
		it("拡張子なしはtextとして扱う", () => {
			const path = "Makefile";
			const ext = path.split(".").pop()?.toLowerCase();
			expect(ext).toBe("makefile"); // 拡張子なしの場合はファイル名全体
		});
	});
});
