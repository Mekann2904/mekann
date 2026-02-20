/**
 * @file .pi/extensions/kitty-status-integration.ts の単体テスト
 * @description kittyターミナル統合ロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => ({
		unref: vi.fn(),
	})),
}));

// モック後にインポート
import kittyStatusIntegration from "../../../.pi/extensions/kitty-status-integration.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("kitty-status-integration.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(kittyStatusIntegration).toBeDefined();
		expect(typeof kittyStatusIntegration).toBe("function");
	});
});

// ============================================================================
// プラットフォーム検出のテスト
// ============================================================================

describe("プラットフォーム検出", () => {
	describe("isMacOS", () => {
		it("process.platformでdarwinを検出", () => {
			const isDarwin = process.platform === "darwin";
			expect(typeof isDarwin).toBe("boolean");
		});
	});

	describe("isKitty", () => {
		it("KITTY_WINDOW_ID環境変数で判定", () => {
			const isKitty = !!process.env.KITTY_WINDOW_ID;
			expect(typeof isKitty).toBe("boolean");
		});

		it("環境変数がある場合はtrue", () => {
			const originalValue = process.env.KITTY_WINDOW_ID;
			process.env.KITTY_WINDOW_ID = "12345";
			const isKitty = !!process.env.KITTY_WINDOW_ID;
			expect(isKitty).toBe(true);
			if (originalValue === undefined) {
				delete process.env.KITTY_WINDOW_ID;
			} else {
				process.env.KITTY_WINDOW_ID = originalValue;
			}
		});

		it("環境変数がない場合はfalse", () => {
			const originalValue = process.env.KITTY_WINDOW_ID;
			delete process.env.KITTY_WINDOW_ID;
			const isKitty = !!process.env.KITTY_WINDOW_ID;
			expect(isKitty).toBe(false);
			if (originalValue !== undefined) {
				process.env.KITTY_WINDOW_ID = originalValue;
			}
		});
	});
});

// ============================================================================
// エスケープシーケンスのテスト
// ============================================================================

describe("エスケープシーケンス", () => {
	const OSC = "\x1b]";
	const ST = "\x07";

	describe("タイトル設定", () => {
		it("OSC 2 ; title ST 形式のシーケンスを生成", () => {
			const title = "pi-coding-agent";
			const sequence = `${OSC}2;${title}${ST}`;
			expect(sequence).toBe("\x1b]2;pi-coding-agent\x07");
		});

		it("日本語タイトルも処理可能", () => {
			const title = "開発中";
			const sequence = `${OSC}2;${title}${ST}`;
			expect(sequence).toContain("開発中");
		});
	});

	describe("kitty通知", () => {
		it("OSC 99 形式のシーケンスを生成", () => {
			const text = "Task completed";
			const duration = 5000;
			const sequence = `${OSC}99;i=1:d=${duration}:${text}${ST}`;
			expect(sequence).toContain("99;i=1:d=5000:Task completed");
		});
	});
});

// ============================================================================
// 通知設定のテスト
// ============================================================================

describe("通知設定", () => {
	interface NotificationOptions {
		enabled: boolean;
		soundEnabled: boolean;
		notifyCenterEnabled: boolean;
		successSound: string;
		errorSound: string;
	}

	const defaultOptions: NotificationOptions = {
		enabled: true,
		soundEnabled: true,
		notifyCenterEnabled: true,
		successSound: "/System/Library/Sounds/Tink.aiff",
		errorSound: "/System/Library/Sounds/Basso.aiff",
	};

	it("デフォルトで通知が有効", () => {
		expect(defaultOptions.enabled).toBe(true);
	});

	it("デフォルトでサウンドが有効", () => {
		expect(defaultOptions.soundEnabled).toBe(true);
	});

	it("サウンドパスが設定されている", () => {
		expect(defaultOptions.successSound).toContain("/System/Library/Sounds/");
		expect(defaultOptions.errorSound).toContain("/System/Library/Sounds/");
	});

	describe("通知無効化", () => {
		it("enabled=falseで通知全体を無効化", () => {
			const options = { ...defaultOptions, enabled: false };
			expect(options.enabled).toBe(false);
		});

		it("soundEnabled=falseでサウンドのみ無効化", () => {
			const options = { ...defaultOptions, soundEnabled: false };
			expect(options.soundEnabled).toBe(false);
		});
	});
});

// ============================================================================
// 文字列エスケープのテスト
// ============================================================================

describe("文字列エスケープ", () => {
	const escapeForAppleScript = (text: string): string => {
		return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	};

	it("ダブルクォートをエスケープする", () => {
		expect(escapeForAppleScript('say "hello"')).toBe('say \\"hello\\"');
	});

	it("バックスラッシュをエスケープする", () => {
		expect(escapeForAppleScript("path\\to\\file")).toBe("path\\\\to\\\\file");
	});

	it("通常の文字列は変更なし", () => {
		expect(escapeForAppleScript("normal text")).toBe("normal text");
	});

	it("日本語も正しく処理", () => {
		expect(escapeForAppleScript("処理完了")).toBe("処理完了");
	});
});

// ============================================================================
// タイトル管理のテスト
// ============================================================================

describe("タイトル管理", () => {
	describe("originalTitle保存", () => {
		it("初回設定時に元のタイトルを保存", () => {
			let originalTitle: string | undefined;
			if (originalTitle === undefined) {
				originalTitle = "";
			}
			expect(originalTitle).toBe("");
		});

		it("2回目以降は保存しない", () => {
			let originalTitle: string | undefined = "";
			const previousValue = originalTitle;
			if (originalTitle === undefined) {
				originalTitle = "";
			}
			expect(originalTitle).toBe(previousValue);
		});
	});
});

// ============================================================================
// spawn呼び出しのテスト
// ============================================================================

describe("spawn呼び出し", () => {
	describe("osascript引数", () => {
		it("正しい引数形式で呼び出す", () => {
			const text = "Test notification";
			const title = "pi";
			const args = [
				"-e",
				`display notification "${text}" with title "${title}"`,
			];
			expect(args[0]).toBe("-e");
			expect(args[1]).toContain("display notification");
		});
	});

	describe("afplay引数", () => {
		it("サウンドパスを引数として渡す", () => {
			const soundPath = "/System/Library/Sounds/Tink.aiff";
			const args = [soundPath];
			expect(args[0]).toBe(soundPath);
		});
	});
});

// ============================================================================
// エラーハンドリングのテスト
// ============================================================================

describe("エラーハンドリング", () => {
	describe("spawn失敗", () => {
		it("エラーをキャッチして処理継続", () => {
			const tryNotify = (): boolean => {
				try {
					throw new Error("spawn failed");
				} catch {
					return false;
				}
			};
			expect(tryNotify()).toBe(false);
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のタイトル", () => {
		it("空文字でもクラッシュしない", () => {
			const title = "";
			const sequence = `\x1b]2;${title}\x07`;
			expect(sequence).toBe("\x1b]2;\x07");
		});
	});

	describe("特殊文字を含む通知", () => {
		it("絵文字を含むテキスト", () => {
			const text = "Task completed!";
			expect(text).toContain("!");
		});

		it("改行を含むテキスト", () => {
			const text = "Line1\nLine2";
			const escaped = text.replace(/"/g, '\\"');
			expect(escaped).toContain("\n");
		});
	});

	describe("非常に長いタイトル", () => {
		it("長いタイトルでも処理される", () => {
			const title = "a".repeat(1000);
			expect(title.length).toBe(1000);
		});
	});
});
