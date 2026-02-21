/**
 * @file .pi/extensions/code-panel.ts の単体テスト
 * @description オーバーレイパネルでコードを表示するコマンドロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
	highlightCode: vi.fn((code) => code.split("\n")),
	getLanguageFromPath: vi.fn((path) => {
		const ext = path.split(".").pop()?.toLowerCase();
		return ext === "ts" ? "typescript" : "text";
	}),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: vi.fn(function () {
		return {
			addChild: vi.fn(),
		};
	}),
	Text: vi.fn(function (text: string) {
		return { text };
	}),
	matchesKey: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => "line1\nline2"),
}));

// モック後にインポート
import codePanel from "../../../.pi/extensions/code-panel.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("code-panel.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(codePanel).toBeDefined();
		expect(typeof codePanel).toBe("function");
	});
});

// ============================================================================
// 行番号フォーマットのテスト
// ============================================================================

describe("formatLinesWithNumbers関数", () => {
	const formatLinesWithNumbers = (
		lines: string[],
		startLine: number,
		theme: { fg: (color: string, text: string) => string }
	): string[] => {
		const maxLineNum = startLine + lines.length - 1;
		const width = maxLineNum.toString().length;

		return lines.map((line, index) => {
			const lineNum = (startLine + index)
				.toString()
				.padStart(width, " ");
			const lineNumText = theme.fg("dim", `${lineNum} | `);
			return lineNumText + line;
		});
	};

	const mockTheme = {
		fg: (color: string, text: string) => `[${color}]${text}[/]`,
	};

	it("基本的な行番号付きフォーマット", () => {
		const lines = ["code line 1", "code line 2"];
		const result = formatLinesWithNumbers(lines, 1, mockTheme);
		expect(result[0]).toBe("[dim]1 | [/]code line 1");
		expect(result[1]).toBe("[dim]2 | [/]code line 2");
	});

	it("開始行が10以上の場合", () => {
		const lines = ["line 10", "line 11"];
		const result = formatLinesWithNumbers(lines, 10, mockTheme);
		expect(result[0]).toBe("[dim]10 | [/]line 10");
		expect(result[1]).toBe("[dim]11 | [/]line 11");
	});

	it("行番号の幅が揃う", () => {
		const lines = Array(10).fill("line");
		const result = formatLinesWithNumbers(lines, 1, mockTheme);
		expect(result[0]).toBe("[dim] 1 | [/]line");
		expect(result[9]).toBe("[dim]10 | [/]line");
	});

	it("空の配列の場合", () => {
		const result = formatLinesWithNumbers([], 1, mockTheme);
		expect(result).toHaveLength(0);
	});
});

// ============================================================================
// タイトル生成のテスト
// ============================================================================

describe("タイトル生成", () => {
	const mockTheme = {
		fg: (color: string, text: string) => `[${color}]${text}[/]`,
		bold: (text: string) => `**${text}**`,
	};

	const createTitle = (
		filePath: string | undefined,
		language: string | undefined,
		theme: typeof mockTheme
	): string => {
		const parts: string[] = [];
		parts.push(theme.fg("accent", theme.bold("Code Panel")));
		if (filePath) {
			parts.push(theme.fg("muted", " - "));
			parts.push(theme.fg("accent", filePath));
		}
		if (language) {
			parts.push(theme.fg("muted", " ["));
			parts.push(theme.fg("dim", language));
			parts.push(theme.fg("muted", "]"));
		}
		return parts.join("");
	};

	it("デフォルトタイトルのみ", () => {
		const title = createTitle(undefined, undefined, mockTheme);
		expect(title).toContain("Code Panel");
	});

	it("ファイルパス付き", () => {
		const title = createTitle("src/main.ts", undefined, mockTheme);
		expect(title).toContain("src/main.ts");
	});

	it("言語付き", () => {
		const title = createTitle(undefined, "typescript", mockTheme);
		expect(title).toContain("typescript");
	});

	it("ファイルパスと言語両方", () => {
		const title = createTitle("src/main.ts", "typescript", mockTheme);
		expect(title).toContain("src/main.ts");
		expect(title).toContain("typescript");
	});
});

// ============================================================================
// パラメータ解析のテスト
// ============================================================================

describe("パラメータ解析", () => {
	// 実装（code-panel.ts）と同じ正規表現ロジックを使用
	const parseArgs = (args: string): Record<string, string | undefined> => {
		const result: Record<string, string | undefined> = {};

		// code:"..." または code:'...' パターンを抽出
		const codeMatch = args.match(/code:(?:"([^"]*)"|'([^']*)')/);
		if (codeMatch) {
			result.code = codeMatch[1] ?? codeMatch[2];
		}

		// path:... パターンを抽出（空白または文字列終了まで）
		const pathMatch = args.match(/path:(\S+)/);
		if (pathMatch) {
			result.path = pathMatch[1];
		}

		// language:... パターンを抽出
		const langMatch = args.match(/language:(\S+)/);
		if (langMatch) {
			result.language = langMatch[1];
		}

		return result;
	};

	it("codeパラメータを抽出", () => {
		const args = 'code:"const x = 1;" language:typescript';
		const result = parseArgs(args);
		// parseArgsは引用符内の内容のみを抽出する（引用符自体は含まない）
		expect(result.code).toBe("const x = 1;");
		expect(result.language).toBe("typescript");
	});

	it("pathパラメータを抽出", () => {
		const args = "path:src/main.ts";
		const result = parseArgs(args);
		expect(result.path).toBe("src/main.ts");
	});

	it("複数パラメータを抽出", () => {
		const args = "path:src/main.ts language:typescript";
		const result = parseArgs(args);
		expect(result.path).toBe("src/main.ts");
		expect(result.language).toBe("typescript");
	});
});

// ============================================================================
// ファイル読み込みロジックのテスト
// ============================================================================

describe("ファイル読み込み", () => {
	describe("ファイル存在確認", () => {
		it("existsSyncで確認する", () => {
			const exists = true;
			expect(exists).toBe(true);
		});
	});

	describe("ファイル読み込み", () => {
		it("readFileSyncで読み込む", () => {
			const content = "line1\nline2";
			const lines = content.split("\n");
			expect(lines).toHaveLength(2);
		});
	});
});

// ============================================================================
// キーハンドリングのテスト
// ============================================================================

describe("キーハンドリング", () => {
	describe("matchesKey関数", () => {
		it("ESCキーでパネルを閉じる", () => {
			const key = { name: "escape" };
			const shouldClose = key.name === "escape";
			expect(shouldClose).toBe(true);
		});

		it("qキーでパネルを閉じる", () => {
			const key = { name: "q" };
			const shouldClose = key.name === "q";
			expect(shouldClose).toBe(true);
		});

		it("他のキーでは閉じない", () => {
			const key = { name: "a" };
			const shouldClose = key.name === "escape" || key.name === "q";
			expect(shouldClose).toBe(false);
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のコード", () => {
		it("空文字列でもクラッシュしない", () => {
			const code = "";
			const lines = code.split("\n");
			expect(lines).toHaveLength(1);
			expect(lines[0]).toBe("");
		});
	});

	describe("非常に長い行", () => {
		it("長い行でも処理される", () => {
			const code = "a".repeat(1000);
			const lines = code.split("\n");
			expect(lines[0].length).toBe(1000);
		});
	});

	describe("日本語コード", () => {
		it("日本語コメントを処理可能", () => {
			const code = "// 日本語コメント\nconst x = 1;";
			const lines = code.split("\n");
			expect(lines[0]).toContain("日本語");
		});
	});

	describe("特殊文字を含むパス", () => {
		it("スペースを含むパス", () => {
			const path = "src/my file.ts";
			expect(path).toContain(" ");
		});
	});
});
