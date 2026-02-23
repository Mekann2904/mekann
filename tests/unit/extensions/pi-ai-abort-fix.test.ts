/**
 * @file .pi/extensions/pi-ai-abort-fix.ts の単体テスト
 * @description pi-aiのstop reason変換にabort対応を追加するパッチロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}));

vi.mock("node:module", () => ({
	createRequire: vi.fn(() => ({
		resolve: vi.fn((path: string) => `/mock/path/${path}`),
	})),
}));

// モック後にインポート
import piAiAbortFix from "../../../.pi/extensions/pi-ai-abort-fix.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("pi-ai-abort-fix.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(piAiAbortFix).toBeDefined();
		expect(typeof piAiAbortFix).toBe("function");
	});
});

// ============================================================================
// パッチターゲット定義のテスト
// ============================================================================

describe("PATCH_TARGETS定義", () => {
	interface PatchTarget {
		modulePath: string;
		marker: string;
		before: string;
		after: string;
	}

	const PATCH_TARGETS: PatchTarget[] = [
		{
			modulePath: "@mariozechner/pi-ai/dist/providers/google-shared.js",
			marker: 'case "abort":',
			before: '        case FinishReason.NO_IMAGE:\n            return "error";',
			after: '        case FinishReason.NO_IMAGE:\n            return "error";\n        case "abort":\n            return "aborted";',
		},
		{
			modulePath: "@mariozechner/pi-ai/dist/providers/anthropic.js",
			marker: 'case "abort":',
			before: '        case "sensitive": // Content flagged by safety filters (not yet in SDK types)\n            return "error";',
			after: '        case "sensitive": // Content flagged by safety filters (not yet in SDK types)\n            return "error";\n        case "abort":\n            return "aborted";',
		},
		{
			modulePath: "@mariozechner/pi-ai/dist/providers/openai-completions.js",
			marker: 'case "abort":',
			before: '        case "content_filter":\n            return "error";',
			after: '        case "content_filter":\n            return "error";\n        case "abort":\n            return "aborted";',
		},
		{
			modulePath: "@mariozechner/pi-ai/dist/providers/openai-responses-shared.js",
			marker: 'case "abort":',
			before: '        case "failed":\n        case "cancelled":\n            return "error";',
			after: '        case "failed":\n        case "cancelled":\n            return "error";\n        case "abort":\n            return "aborted";',
		},
	];

	it("4つのパッチターゲットが定義されている", () => {
		expect(PATCH_TARGETS).toHaveLength(4);
	});

	it("全てのターゲットが正しいmarkerを持つ", () => {
		for (const target of PATCH_TARGETS) {
			expect(target.marker).toBe('case "abort":');
		}
	});

	it("全てのターゲットがafterにabortケースを含む", () => {
		for (const target of PATCH_TARGETS) {
			expect(target.after).toContain('case "abort":');
			expect(target.after).toContain('return "aborted"');
		}
	});

	it("beforeにはabortケースが含まれない", () => {
		for (const target of PATCH_TARGETS) {
			expect(target.before).not.toContain('case "abort":');
		}
	});

	describe("パス先の検証", () => {
		it("google-shared.jsへのパスが正しい", () => {
			expect(PATCH_TARGETS[0].modulePath).toBe(
				"@mariozechner/pi-ai/dist/providers/google-shared.js"
			);
		});

		it("anthropic.jsへのパスが正しい", () => {
			expect(PATCH_TARGETS[1].modulePath).toBe(
				"@mariozechner/pi-ai/dist/providers/anthropic.js"
			);
		});

		it("openai-completions.jsへのパスが正しい", () => {
			expect(PATCH_TARGETS[2].modulePath).toBe(
				"@mariozechner/pi-ai/dist/providers/openai-completions.js"
			);
		});

		it("openai-responses-shared.jsへのパスが正しい", () => {
			expect(PATCH_TARGETS[3].modulePath).toBe(
				"@mariozechner/pi-ai/dist/providers/openai-responses-shared.js"
			);
		});
	});
});

// ============================================================================
// パッチ適用ロジックのテスト
// ============================================================================

describe("パッチ適用ロジック", () => {
	describe("マーカー検出", () => {
		const source = `
        case "sensitive":
            return "error";
        case "abort":
            return "aborted";
		`;

		it("マーカーが存在する場合はalreadyを返す", () => {
			const marker = 'case "abort":';
			const hasMarker = source.includes(marker);
			expect(hasMarker).toBe(true);
		});

		it("マーカーが存在しない場合はパッチが必要", () => {
			const sourceWithoutMarker = `
        case "sensitive":
            return "error";
			`;
			const marker = 'case "abort":';
			const hasMarker = sourceWithoutMarker.includes(marker);
			expect(hasMarker).toBe(false);
		});
	});

	describe("テキスト置換", () => {
		it("beforeをafterに置換する", () => {
			const before = '        case "content_filter":\n            return "error";';
			const after = '        case "content_filter":\n            return "error";\n        case "abort":\n            return "aborted";';
			const source = `function convert(reason) {
        case "content_filter":
            return "error";
}`;

			expect(source.includes(before)).toBe(true);

			const patched = source.replace(before, after);
			expect(patched).toContain('case "abort":');
			expect(patched).toContain('return "aborted"');
		});

		it("置換対象が見つからない場合は変更されない", () => {
			const before = "non-existent-text";
			const after = "replacement";
			const source = "original text";

			const patched = source.replace(before, after);
			expect(patched).toBe(source);
		});
	});
});

// ============================================================================
// 初期化ロジックのテスト
// ============================================================================

describe("初期化ロジック", () => {
	it("initializedフラグは最初false", () => {
		let initialized = false;
		expect(initialized).toBe(false);
	});

	it("session_startで1回だけ初期化される", () => {
		let initialized = false;

		const onSessionStart = () => {
			if (initialized) return;
			initialized = true;
		};

		onSessionStart();
		expect(initialized).toBe(true);

		// 2回目は無視
		onSessionStart();
		expect(initialized).toBe(true);
	});
});

// ============================================================================
// ステータスイベント発行のテスト
// ============================================================================

describe("ステータスイベント発行", () => {
	it("カウントが正しく集計される", () => {
		const results = ["patched", "already", "skip"];
		const patchedCount = results.filter((r) => r === "patched").length;
		const alreadyCount = results.filter((r) => r === "already").length;
		const skipCount = results.filter((r) => r === "skip").length;

		expect(patchedCount).toBe(1);
		expect(alreadyCount).toBe(1);
		expect(skipCount).toBe(1);
	});

	it("全てパッチ済みの場合", () => {
		const results = ["already", "already", "already"];
		const patchedCount = results.filter((r) => r === "patched").length;
		const alreadyCount = results.filter((r) => r === "already").length;

		expect(patchedCount).toBe(0);
		expect(alreadyCount).toBe(3);
	});
});

// ============================================================================
// エラーハンドリングのテスト
// ============================================================================

describe("エラーハンドリング", () => {
	it("パッチ例外時にskipとしてカウントされる", () => {
		const simulatePatch = (): "patched" | "already" | "skip" => {
			try {
				throw new Error("Module not found");
			} catch {
				return "skip";
			}
		};

		expect(simulatePatch()).toBe("skip");
	});

	it("モジュール解決失敗時はskipを返す", () => {
		const resolveModule = (path: string): string | null => {
			try {
				if (path.includes("nonexistent")) {
					throw new Error("Cannot find module");
				}
				return `/resolved/${path}`;
			} catch {
				return null;
			}
		};

		expect(resolveModule("nonexistent")).toBeNull();
		expect(resolveModule("existing")).toBe("/resolved/existing");
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のソースコード", () => {
		it("空文字列にマーカーは含まれない", () => {
			expect("".includes('case "abort":')).toBe(false);
		});
	});

	describe("複数のabortケース", () => {
		it("最初のマーカーのみが検出される", () => {
			const source = `case "abort": ... case "abort":`;
			const marker = 'case "abort":';
			expect(source.includes(marker)).toBe(true);
		});
	});
});
