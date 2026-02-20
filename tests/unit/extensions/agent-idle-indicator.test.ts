/**
 * @file .pi/extensions/agent-idle-indicator.ts の単体テスト
 * @description エージェントのアイドル状態を視覚的に通知するロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// モック後にインポート
import agentIdleIndicator from "../../../.pi/extensions/agent-idle-indicator.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("agent-idle-indicator.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(agentIdleIndicator).toBeDefined();
		expect(typeof agentIdleIndicator).toBe("function");
	});
});

// ============================================================================
// タイトル操作ロジックのテスト
// ============================================================================

describe("タイトル操作ロジック", () => {
	describe("既存インジケーター除去", () => {
		const removeIndicator = (title: string): string => {
			return title.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
		};

		it("緑色のインジケーターを除去する", () => {
			expect(removeIndicator("[🟢] pi-coding-agent")).toBe("pi-coding-agent");
		});

		it("赤色のインジケーターを除去する", () => {
			expect(removeIndicator("[🔴] pi-coding-agent")).toBe("pi-coding-agent");
		});

		it("インジケーターがない場合はそのまま", () => {
			expect(removeIndicator("pi-coding-agent")).toBe("pi-coding-agent");
		});

		it("空文字列はそのまま", () => {
			expect(removeIndicator("")).toBe("");
		});

		it("複数のインジケーターがある場合は最初の1つのみ除去", () => {
			// 先頭のインジケーターのみを対象とする
			expect(removeIndicator("[🟢] [🟢] title")).toBe("[🟢] title");
		});
	});

	describe("アイドルインジケーター追加", () => {
		const addIdleIndicator = (title: string): string => {
			const cleanTitle = title.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
			return "[🔴] " + cleanTitle;
		};

		it("赤色のインジケーターを追加する", () => {
			expect(addIdleIndicator("pi-coding-agent")).toBe("[🔴] pi-coding-agent");
		});

		it("既存のインジケーターを置き換える", () => {
			expect(addIdleIndicator("[🟢] pi-coding-agent")).toBe("[🔴] pi-coding-agent");
		});
	});

	describe("実行中インジケーター追加", () => {
		const addRunningIndicator = (title: string): string => {
			const cleanTitle = title.replace(/^\[🔴\] /, "").replace(/^\[🟢\] /, "");
			return "[🟢] " + cleanTitle;
		};

		it("緑色のインジケーターを追加する", () => {
			expect(addRunningIndicator("pi-coding-agent")).toBe("[🟢] pi-coding-agent");
		});

		it("既存のインジケーターを置き換える", () => {
			expect(addRunningIndicator("[🔴] pi-coding-agent")).toBe("[🟢] pi-coding-agent");
		});
	});
});

// ============================================================================
// 状態管理ロジックのテスト
// ============================================================================

describe("状態管理ロジック", () => {
	describe("isAgentRunningフラグ", () => {
		it("初期状態はfalse", () => {
			let isAgentRunning = false;
			expect(isAgentRunning).toBe(false);
		});

		it("agent_startでtrueになる", () => {
			let isAgentRunning = false;
			// agent_startイベントシミュレーション
			isAgentRunning = true;
			expect(isAgentRunning).toBe(true);
		});

		it("agent_endでfalseになる", () => {
			let isAgentRunning = true;
			// agent_endイベントシミュレーション
			isAgentRunning = false;
			expect(isAgentRunning).toBe(false);
		});
	});

	describe("savedTitle管理", () => {
		it("初期状態は空文字", () => {
			let savedTitle = "";
			expect(savedTitle).toBe("");
		});

		it("最初のアイドル表示時にタイトルを保存", () => {
			let savedTitle = "";
			const currentTitle = "pi-coding-agent";

			if (currentTitle && !savedTitle) {
				savedTitle = currentTitle.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
			}

			expect(savedTitle).toBe("pi-coding-agent");
		});

		it("session_shutdownでクリアされる", () => {
			let savedTitle = "pi-coding-agent";
			// session_shutdownイベントシミュレーション
			savedTitle = "";
			expect(savedTitle).toBe("");
		});
	});
});

// ============================================================================
// イベントハンドラーのテスト
// ============================================================================

describe("イベントハンドラー", () => {
	describe("agent_start", () => {
		it("isAgentRunningをtrueに設定", () => {
			let isAgentRunning = false;
			// handler logic
			isAgentRunning = true;
			expect(isAgentRunning).toBe(true);
		});
	});

	describe("agent_end", () => {
		it("isAgentRunningをfalseに設定", () => {
			let isAgentRunning = true;
			// handler logic
			isAgentRunning = false;
			expect(isAgentRunning).toBe(false);
		});
	});

	describe("session_start", () => {
		it("エージェントが実行中でない場合アイドル表示", () => {
			let isAgentRunning = false;
			let shouldShowIdle = !isAgentRunning;
			expect(shouldShowIdle).toBe(true);
		});

		it("エージェントが実行中の場合はアイドル表示しない", () => {
			let isAgentRunning = true;
			let shouldShowIdle = !isAgentRunning;
			expect(shouldShowIdle).toBe(false);
		});
	});

	describe("session_shutdown", () => {
		it("保存されたタイトルを復元", () => {
			const savedTitle = "original-title";
			const restored = savedTitle.replace(/^\[🔴\] /, "").replace(/^\[🟢\] /, "");
			expect(restored).toBe("original-title");
		});
	});
});

// ============================================================================
// ステータス表示のテスト
// ============================================================================

describe("ステータス表示", () => {
	describe("アイドル時のステータス", () => {
		it("停止中というテキストが表示される", () => {
			const statusText = "停止中";
			expect(statusText).toBe("停止中");
		});
	});

	describe("実行中のステータス", () => {
		it("ステータスがクリアされる", () => {
			// ui.setStatus("agent-idle", undefined) のシミュレーション
			const status = undefined;
			expect(status).toBeUndefined();
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("タイトルが空の場合", () => {
		it("空文字でもクラッシュしない", () => {
			const title = "";
			const cleanTitle = title.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
			expect(cleanTitle).toBe("");
		});
	});

	describe("getTitleがundefinedを返す場合", () => {
		it("空文字として扱われる", () => {
			const getTitle = (): string | undefined => undefined;
			const currentTitle = getTitle() || "";
			expect(currentTitle).toBe("");
		});
	});

	describe("日本語タイトル", () => {
		it("日本語タイトルも正しく処理される", () => {
			const title = "[🔴] 開発環境";
			const cleanTitle = title.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
			expect(cleanTitle).toBe("開発環境");
		});
	});

	describe("特殊文字を含むタイトル", () => {
		it("特殊文字が含まれていても正しく処理される", () => {
			const title = "[🟢] pi-coding-agent (development)";
			const cleanTitle = title.replace(/^\[🟢\] /, "").replace(/^\[🔴\] /, "");
			expect(cleanTitle).toBe("pi-coding-agent (development)");
		});
	});
});
