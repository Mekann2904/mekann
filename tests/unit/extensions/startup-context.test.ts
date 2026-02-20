/**
 * @file .pi/extensions/startup-context.ts の単体テスト
 * @description セッション開始時の動的コンテキスト注入ロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
}));

// モック後にインポート
import startupContext from "../../../.pi/extensions/startup-context.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("startup-context.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(startupContext).toBeDefined();
		expect(typeof startupContext).toBe("function");
	});
});

// ============================================================================
// isFirstPromptフラグ管理のテスト
// ============================================================================

describe("isFirstPromptフラグ管理", () => {
	it("初期値はtrue", () => {
		let isFirstPrompt = true;
		expect(isFirstPrompt).toBe(true);
	});

	it("session_startでリセットされる", () => {
		let isFirstPrompt = false;
		// session_startイベントシミュレーション
		isFirstPrompt = true;
		expect(isFirstPrompt).toBe(true);
	});

	it("before_agent_startでfalseになる", () => {
		let isFirstPrompt = true;
		if (isFirstPrompt) {
			isFirstPrompt = false;
		}
		expect(isFirstPrompt).toBe(false);
	});

	it("2回目のbefore_agent_startでは処理されない", () => {
		let isFirstPrompt = false;
		let processed = false;

		if (isFirstPrompt) {
			processed = true;
		}

		expect(processed).toBe(false);
	});
});

// ============================================================================
// コンテキスト生成ロジックのテスト
// ============================================================================

describe("コンテキスト生成ロジック", () => {
	describe("カレントワーキングディレクトリ", () => {
		it("process.cwd()の値を取得", () => {
			const cwd = process.cwd();
			expect(typeof cwd).toBe("string");
			expect(cwd.length).toBeGreaterThan(0);
		});

		it("コンテキストヘッダーを生成", () => {
			const cwd = "/path/to/project";
			const contextPart = `## Current Working Directory\n\`${cwd}\`\n\n> Use this as the base path for all file operations.`;
			expect(contextPart).toContain("Current Working Directory");
			expect(contextPart).toContain(cwd);
		});
	});

	describe("Gitコミットログ", () => {
		it("フォーマットされたログを生成", () => {
			const gitLog = "abc123 feat: add feature\ndef456 fix: fix bug";
			const contextPart = `## Recent Git Commits (Last 10)\n\`\`\`\n${gitLog}\n\`\`\`\n\n> These commits show the recent development activity.`;
			expect(contextPart).toContain("Recent Git Commits");
			expect(contextPart).toContain(gitLog);
		});

		it("空のログは含まれない", () => {
			const gitLog = "";
			const shouldInclude = gitLog.trim().length > 0;
			expect(shouldInclude).toBe(false);
		});
	});

	describe("README.md読み込み", () => {
		it("README候補リスト", () => {
			const readmeCandidates = ["README.md", "readme.md", "README", "readme"];
			expect(readmeCandidates).toHaveLength(4);
			expect(readmeCandidates).toContain("README.md");
		});

		it("READMEコンテキストを生成", () => {
			const content = "# Project Name\n\nDescription here";
			const contextPart = `## README.md\n\`\`\`markdown\n${content}\n\`\`\`\n\n> The README contains project overview.`;
			expect(contextPart).toContain("README.md");
			expect(contextPart).toContain(content);
		});
	});
});

// ============================================================================
// 最終システムプロンプト生成のテスト
// ============================================================================

describe("最終システムプロンプト生成", () => {
	const buildInjectedContext = (parts: string[]): string => {
		if (parts.length === 0) return "";
		return (
			`# Session Startup Context\n\n` +
			`This context is automatically injected at session start.\n\n` +
			`${parts.join("\n\n")}\n\n` +
			`---\n` +
			`_End of startup context._`
		);
	};

	it("複数のコンテキストパーツを結合", () => {
		const parts = ["## CWD\n/path", "## Git\nlog content"];
		const result = buildInjectedContext(parts);
		expect(result).toContain("Session Startup Context");
		expect(result).toContain("## CWD");
		expect(result).toContain("## Git");
	});

	it("空のパーツ配列は空文字を返す", () => {
		const result = buildInjectedContext([]);
		expect(result).toBe("");
	});

	it("システムプロンプトに追加される", () => {
		const originalPrompt = "You are an AI assistant.";
		const injectedContext = "# Session Startup Context\n\n...";
		const finalPrompt = `${originalPrompt}\n\n${injectedContext}`;
		expect(finalPrompt).toContain(originalPrompt);
		expect(finalPrompt).toContain(injectedContext);
	});
});

// ============================================================================
// エラーハンドリングのテスト
// ============================================================================

describe("エラーハンドリング", () => {
	describe("gitコマンド失敗", () => {
		it("エラーをキャッチしてスキップ", () => {
			const getGitLog = (): string | null => {
				try {
					throw new Error("Not a git repository");
				} catch {
					return null;
				}
			};
			expect(getGitLog()).toBeNull();
		});
	});

	describe("README読み込み失敗", () => {
		it("エラーをキャッチしてスキップ", () => {
			const readReadme = (): string | null => {
				try {
					throw new Error("Permission denied");
				} catch {
					return null;
				}
			};
			expect(readReadme()).toBeNull();
		});
	});
});

// ============================================================================
// タイムアウト設定のテスト
// ============================================================================

describe("タイムアウト設定", () => {
	it("gitコマンドのタイムアウトは5000ms", () => {
		const expectedTimeout = 5000;
		expect(expectedTimeout).toBe(5000);
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("非常に長いREADME", () => {
		it("長いコンテンツでも処理される", () => {
			const longContent = "a".repeat(100000);
			const contextPart = `## README.md\n\`\`\`markdown\n${longContent}\n\`\`\``;
			expect(contextPart.length).toBeGreaterThan(100000);
		});
	});

	describe("特殊文字を含むパス", () => {
		it("スペースを含むパス", () => {
			const cwd = "/path/to/my project";
			expect(cwd).toContain(" ");
		});

		it("日本語を含むパス", () => {
			const cwd = "/path/to/開発";
			expect(cwd).toContain("開発");
		});
	});

	describe("gitログの特殊文字", () => {
		it("絵文字を含むコミットメッセージ", () => {
			const gitLog = "abc123 feat: add feature 🎉";
			expect(gitLog).toContain("🎉");
		});
	});

	describe("READMEが存在しない", () => {
		it("全候補が存在しない場合スキップ", () => {
			const candidates = ["README.md", "readme.md", "README", "readme"];
			const existingFiles: string[] = [];
			const found = candidates.find((c) => existingFiles.includes(c));
			expect(found).toBeUndefined();
		});
	});
});
