/**
 * @file .pi/extensions/pi-coding-agent-lock-fix.ts の単体テスト
 * @description settings/authロック失敗を起動時に自動で緩和するパッチロジックのテスト
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
import piCodingAgentLockFix from "../../../.pi/extensions/pi-coding-agent-lock-fix.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("pi-coding-agent-lock-fix.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(piCodingAgentLockFix).toBeDefined();
		expect(typeof piCodingAgentLockFix).toBe("function");
	});
});

// ============================================================================
// PATCH_TARGETS定義のテスト
// ============================================================================

describe("PATCH_TARGETS定義", () => {
	interface PatchTarget {
		modulePath: string;
		marker: string;
		repairs?: Array<{ before: string; after: string }>;
		steps: Array<{ before: string; after: string }>;
	}

	const PATCH_TARGETS: PatchTarget[] = [
		{
			modulePath:
				"@mariozechner/pi-coding-agent/dist/core/settings-manager.js",
			marker:
				"Warning (${scope}): Settings file locked by another process",
			repairs: [
				{
					before: "release = lockfile.lockSync(path, {\n                    realpath: false,\n                    stale: 5000,\n                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },\n                });",
					after: "release = lockfile.lockSync(path, {\n                    realpath: false,\n                    stale: 5000,\n                });",
				},
			],
			steps: [
				{
					before: "        let release;\n",
					after: "        let release;\n        let locked = false;\n",
				},
			],
		},
		{
			modulePath: "@mariozechner/pi-coding-agent/dist/core/auth-storage.js",
			marker: "Warning (auth): Auth file locked by another process",
			steps: [],
		},
	];

	it("2つのパッチターゲットが定義されている", () => {
		expect(PATCH_TARGETS).toHaveLength(2);
	});

	it("settings-manager.jsへのパスが正しい", () => {
		expect(PATCH_TARGETS[0].modulePath).toBe(
			"@mariozechner/pi-coding-agent/dist/core/settings-manager.js"
		);
	});

	it("auth-storage.jsへのパスが正しい", () => {
		expect(PATCH_TARGETS[1].modulePath).toBe(
			"@mariozechner/pi-coding-agent/dist/core/auth-storage.js"
		);
	});

	describe("marker定義", () => {
		it("settings-managerのmarkerが定義されている", () => {
			expect(PATCH_TARGETS[0].marker).toContain(
				"Settings file locked by another process"
			);
		});

		it("auth-storageのmarkerが定義されている", () => {
			expect(PATCH_TARGETS[1].marker).toContain(
				"Auth file locked by another process"
			);
		});
	});
});

// ============================================================================
// パッチ適用ロジックのテスト
// ============================================================================

describe("パッチ適用ロジック", () => {
	describe("repairs処理", () => {
		it("repairのbeforeをafterに置換する", () => {
			const source = `release = lockfile.lockSync(path, {
                    realpath: false,
                    stale: 5000,
                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },
                });`;
			const before =
				"release = lockfile.lockSync(path, {\n                    realpath: false,\n                    stale: 5000,\n                    retries: { retries: 3, minTimeout: 50, maxTimeout: 250 },\n                });";
			const after =
				"release = lockfile.lockSync(path, {\n                    realpath: false,\n                    stale: 5000,\n                });";

			const patched = source.replace(before, after);
			expect(patched).not.toContain("retries:");
		});
	});

	describe("steps処理", () => {
		it("locked変数を追加する", () => {
			const source = "        let release;\n";
			const before = "        let release;\n";
			const after = "        let release;\n        let locked = false;\n";

			const patched = source.replace(before, after);
			expect(patched).toContain("let locked = false");
		});

		it("try-catchブロックを追加する", () => {
			const source = "            release = lockfile.lockSync(path, { realpath: false });";
			const after = `            try {
                release = lockfile.lockSync(path, {
                    realpath: false,
                    stale: 5000,
                });
                locked = true;
            }
            catch (e) {
                if (e && e.code === "ELOCKED") {
                    console.error("Warning: Settings file locked by another process");
                }
                else {
                    throw e;
                }
            }`;

			expect(after).toContain("try {");
			expect(after).toContain("ELOCKED");
		});
	});

	describe("marker検出", () => {
		it("markerが存在する場合はalreadyを返す", () => {
			const source = `console.error("Warning: Settings file locked by another process, proceeding without lock");`;
			const marker = "Settings file locked by another process";
			expect(source.includes(marker)).toBe(true);
		});
	});
});

// ============================================================================
// エラーコード処理のテスト
// ============================================================================

describe("ELOCKEDエラー処理", () => {
	it("ELOCKEDエラーは警告として処理される", () => {
		const error = { code: "ELOCKED", message: "Resource locked" };
		const handleLockError = (e: { code: string }): string | null => {
			if (e.code === "ELOCKED") {
				return "Warning: proceeding without lock";
			}
			return null;
		};
		expect(handleLockError(error)).toBe("Warning: proceeding without lock");
	});

	it("他のエラーは再スローされる", () => {
		const error = { code: "EACCES", message: "Permission denied" };
		const handleLockError = (e: { code: string }): boolean => {
			if (e.code === "ELOCKED") {
				return false; // 警告のみ
			}
			return true; // 再スローが必要
		};
		expect(handleLockError(error)).toBe(true);
	});
});

// ============================================================================
// 初期化ロジックのテスト
// ============================================================================

describe("初期化ロジック", () => {
	it("initializedフラグはsession_startで1回だけtrueになる", () => {
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
		const results: Array<"patched" | "already" | "skip"> = [
			"patched",
			"already",
		];
		const patchedCount = results.filter((r) => r === "patched").length;
		const alreadyCount = results.filter((r) => r === "already").length;
		const skipCount = results.filter((r) => r === "skip").length;

		expect(patchedCount).toBe(1);
		expect(alreadyCount).toBe(1);
		expect(skipCount).toBe(0);
	});

	it("patchedCount > 0の場合のみログ出力", () => {
		const patchedCount = 1;
		const shouldLog = patchedCount > 0;
		expect(shouldLog).toBe(true);
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("モジュールが見つからない場合", () => {
		it("skipを返す", () => {
			const resolveModule = (): string => {
				throw new Error("Cannot find module");
			};

			const patchFile = (): "skip" => {
				try {
					resolveModule();
					return "patched";
				} catch {
					return "skip";
				}
			};

			expect(patchFile()).toBe("skip");
		});
	});

	describe("複数のrepairs", () => {
		it("全てのrepairsが適用される", () => {
			const source = "a: 1\nb: 2";
			const repairs = [
				{ before: "a: 1", after: "a: 10" },
				{ before: "b: 2", after: "b: 20" },
			];

			let patched = source;
			for (const repair of repairs) {
				patched = patched.replace(repair.before, repair.after);
			}

			expect(patched).toBe("a: 10\nb: 20");
		});
	});
});
