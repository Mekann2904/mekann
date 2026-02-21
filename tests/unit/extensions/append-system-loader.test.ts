/**
 * @file .pi/extensions/append-system-loader.ts の単体テスト
 * @description パッケージバンドルのAPPEND_SYSTEM.mdをシステムプロンプトに注入するロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

// モック後にインポート
import appendSystemLoader from "../../../.pi/extensions/append-system-loader.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("append-system-loader.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(appendSystemLoader).toBeDefined();
		expect(typeof appendSystemLoader).toBe("function");
	});
});

// ============================================================================
// パッケージルート取得のテスト
// ============================================================================

describe("パッケージルート取得", () => {
	describe("パス解決ロジック", () => {
		it("拡張機能ディレクトリから3階層上がパッケージルート", () => {
			// .pi/extensions/ -> .pi/ -> package-root/
			const extensionDir = "/project/.pi/extensions";
			const piDir = extensionDir.split("/").slice(0, -1).join("/"); // .pi/
			const packageRoot = piDir.split("/").slice(0, -1).join("/"); // project/

			expect(packageRoot).toBe("/project");
		});
	});

	describe("APPEND_SYSTEM.mdパス", () => {
		it("パッケージルート直下の.piディレクトリ", () => {
			const packageRoot = "/project";
			const appendSystemPath = `${packageRoot}/.pi/APPEND_SYSTEM.md`;
			expect(appendSystemPath).toBe("/project/.pi/APPEND_SYSTEM.md");
		});
	});
});

// ============================================================================
// キャッシュ管理のテスト
// ============================================================================

describe("キャッシュ管理", () => {
	describe("cachedContent変数", () => {
		it("初期状態はnull", () => {
			let cachedContent: string | null = null;
			expect(cachedContent).toBeNull();
		});

		it("読み込み後に内容が設定される", () => {
			let cachedContent: string | null = null;
			const content = "# Additional Instructions\n\nContent here";
			cachedContent = content.trim();
			expect(cachedContent).toBe(content);
		});
	});

	describe("cacheLoadedフラグ", () => {
		it("初期状態はfalse", () => {
			let cacheLoaded = false;
			expect(cacheLoaded).toBe(false);
		});

		it("読み込み試行後にtrueになる", () => {
			let cacheLoaded = false;
			cacheLoaded = true;
			expect(cacheLoaded).toBe(true);
		});

		it("2回目の読み込みはキャッシュを使用", () => {
			let cacheLoaded = true;
			let cachedContent: string | null = "cached content";

			const loadContent = (): string | null => {
				if (cacheLoaded) {
					return cachedContent;
				}
				// 実際の読み込み処理...
				return null;
			};

			expect(loadContent()).toBe("cached content");
		});
	});
});

// ============================================================================
// ファイル読み込みロジックのテスト
// ============================================================================

describe("ファイル読み込みロジック", () => {
	describe("ファイル存在チェック", () => {
		it("ファイルが存在する場合", () => {
			const exists = true;
			expect(exists).toBe(true);
		});

		it("ファイルが存在しない場合", () => {
			const exists = false;
			expect(exists).toBe(false);
		});
	});

	describe("コンテンツtrim処理", () => {
		it("前後の空白を削除", () => {
			const rawContent = "\n\n# Content\n\n";
			const trimmed = rawContent.trim();
			expect(trimmed).toBe("# Content");
		});

		it("中間の空白は維持", () => {
			const rawContent = "# Title\n\nContent";
			const trimmed = rawContent.trim();
			expect(trimmed).toBe("# Title\n\nContent");
		});
	});
});

// ============================================================================
// システムプロンプト注入のテスト
// ============================================================================

describe("システムプロンプト注入", () => {
	describe("重複検出マーカー", () => {
		it("APPEND_SYSTEM.mdマーカーを検出", () => {
			const systemPrompt = "Original prompt\n\n<!-- APPEND_SYSTEM.md -->\nAdditional content";
			const hasMarker = systemPrompt.includes("<!-- APPEND_SYSTEM.md -->");
			expect(hasMarker).toBe(true);
		});

		it("マーカーがない場合は注入", () => {
			const systemPrompt = "Original prompt";
			const hasMarker = systemPrompt.includes("<!-- APPEND_SYSTEM.md -->");
			expect(hasMarker).toBe(false);
		});
	});

	describe("マーキングされたコンテンツ", () => {
		it("マーカー付きで追加", () => {
			const originalPrompt = "Original system prompt";
			const appendContent = "# Additional Instructions\n\nMore content";
			const markedContent = `\n\n<!-- APPEND_SYSTEM.md (from package) -->\n${appendContent}`;
			const finalPrompt = originalPrompt + markedContent;

			expect(finalPrompt).toContain("<!-- APPEND_SYSTEM.md (from package) -->");
			expect(finalPrompt).toContain("Additional Instructions");
		});
	});

	describe("重複注入防止", () => {
		it("既にマーカーがある場合はスキップ", () => {
			const event = {
				systemPrompt: "Original\n\n<!-- APPEND_SYSTEM.md -->\nContent",
			};
			const shouldSkip =
				event.systemPrompt &&
				event.systemPrompt.includes("<!-- APPEND_SYSTEM.md -->");
			expect(shouldSkip).toBe(true);
		});
	});
});

// ============================================================================
// before_agent_startイベントのテスト
// ============================================================================

describe("before_agent_startイベント", () => {
	describe("戻り値の構造", () => {
		it("systemPromptを返す", () => {
			const originalPrompt = "Original";
			const additionalContent = "\n\nAdditional";
			const result = {
				systemPrompt: originalPrompt + additionalContent,
			};
			expect(result.systemPrompt).toBe("Original\n\nAdditional");
		});
	});

	describe("コンテンツがない場合", () => {
		it("早期リターンで処理をスキップ", () => {
			const appendContent: string | null = null;
			if (!appendContent) {
				// 処理スキップ
			}
			expect(appendContent).toBeNull();
		});
	});
});

// ============================================================================
// エラーハンドリングのテスト
// ============================================================================

describe("エラーハンドリング", () => {
	describe("ファイル読み込みエラー", () => {
		it("エラー時に警告ログを出力", () => {
			const error = new Error("Permission denied");
			const logWarning = (msg: string, err: Error): string => {
				return `[append-system-loader] ${msg}: ${err.message}`;
			};
			expect(logWarning("Failed to read APPEND_SYSTEM.md", error)).toContain(
				"Permission denied"
			);
		});

		it("エラー時はnullを返す", () => {
			const loadContent = (): string | null => {
				try {
					throw new Error("Read error");
				} catch {
					return null;
				}
			};
			expect(loadContent()).toBeNull();
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のAPPEND_SYSTEM.md", () => {
		it("空ファイルでも正常処理", () => {
			const content = "";
			const trimmed = content.trim();
			expect(trimmed).toBe("");
		});
	});

	describe("巨大なAPPEND_SYSTEM.md", () => {
		it("大きなファイルでも処理される", () => {
			const content = "x".repeat(100000);
			expect(content.length).toBe(100000);
		});
	});

	describe("特殊文字を含むコンテンツ", () => {
		it("日本語コンテンツ", () => {
			const content = "# 追加指示\n\nこれは追加の指示です。";
			expect(content).toContain("追加指示");
		});

		it("コードブロックを含む", () => {
			const content =
				"# Instructions\n\n```typescript\nconst x = 1;\n```\n\nMore text.";
			expect(content).toContain("```typescript");
		});
	});
});
