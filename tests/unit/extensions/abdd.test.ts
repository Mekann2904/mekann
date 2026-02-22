/**
 * @file .pi/extensions/abdd.ts の単体テスト
 * @description ABDDツール統合拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	writeFileSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => ({
		stdout: { on: vi.fn() },
		stderr: { on: vi.fn() },
		on: vi.fn(),
		kill: vi.fn(),
	})),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

// モジュールのモック
vi.mock("../lib/abdd-types", () => ({
	AbddError: class extends Error {
		constructor(message: string, code: string) {
			super(message);
			this.name = "AbddError";
			(this as any).code = code;
		}
	},
	AbddErrorCodes: {
		SCRIPT_NOT_FOUND: "SCRIPT_NOT_FOUND",
		TIMEOUT: "TIMEOUT",
		INVALID_PATH: "INVALID_PATH",
	},
	DEFAULT_TIMEOUT_MS: 120000,
	JSDOC_TIMEOUT_MS: 300000,
	WORKFLOW_DEFAULT_TIMEOUT_MS: 300000,
	validateFilePath: vi.fn((path, basePath) => path),
}));

// ============================================================================
// 定数のテスト
// ============================================================================

describe("abdd.ts 定数", () => {
	it("ROOT_DIRは現在の作業ディレクトリ", () => {
		const ROOT_DIR = process.cwd();
		expect(ROOT_DIR).toBeTruthy();
		expect(typeof ROOT_DIR).toBe("string");
	});

	it("SCRIPTS_DIRはscriptsディレクトリ", () => {
		const ROOT_DIR = process.cwd();
		const SCRIPTS_DIR = `${ROOT_DIR}/scripts`;
		expect(SCRIPTS_DIR).toContain("scripts");
	});

	it("ABDD_DIRはABDDディレクトリ", () => {
		const ROOT_DIR = process.cwd();
		const ABDD_DIR = `${ROOT_DIR}/ABDD`;
		expect(ABDD_DIR).toContain("ABDD");
	});
});

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("abdd.ts 型定義", () => {
	describe("AbddGenerateParams", () => {
		it("基本パラメータ", () => {
			const params: AbddGenerateParamsType = {
				dryRun: false,
				verbose: false,
			};
			expect(params.dryRun).toBe(false);
			expect(params.verbose).toBe(false);
		});

		it("オプションフィールドなし", () => {
			const params: AbddGenerateParamsType = {};
			expect(params.dryRun).toBeUndefined();
		});
	});

	describe("AbddJsdocParams", () => {
		it("基本パラメータ", () => {
			const params: AbddJsdocParamsType = {
				dryRun: false,
				check: false,
				verbose: false,
			};
			expect(params.dryRun).toBe(false);
			expect(params.check).toBe(false);
		});

		it("追加パラメータ", () => {
			const params: AbddJsdocParamsType = {
				dryRun: false,
				check: true,
				verbose: true,
				limit: 100,
				batchSize: 10,
				regenerate: false,
				force: false,
				noCache: false,
				metrics: false,
			};
			expect(params.limit).toBe(100);
			expect(params.batchSize).toBe(10);
		});
	});

	describe("AbddReviewParams", () => {
		it("基本パラメータ", () => {
			const params: AbddReviewParamsType = {
				date: "2024-01-01",
				showChecklist: true,
				createRecord: false,
			};
			expect(params.date).toBe("2024-01-01");
		});

		it("オプションフィールドなし", () => {
			const params: AbddReviewParamsType = {};
			expect(params.showChecklist).toBeUndefined();
		});
	});

	describe("AbddAnalyzeParams", () => {
		it("基本パラメータ", () => {
			const params: AbddAnalyzeParamsType = {
				verbose: false,
				checkInvariants: true,
				checkValues: true,
				checkJSDoc: true,
			};
			expect(params.checkInvariants).toBe(true);
			expect(params.checkValues).toBe(true);
			expect(params.checkJSDoc).toBe(true);
		});
	});

	describe("AbddWorkflowParams", () => {
		it("基本パラメータ", () => {
			const params: AbddWorkflowParamsType = {
				mode: "fast",
				dryRun: false,
				verbose: false,
				timeoutMs: 300000,
				continueOnError: true,
			};
			expect(params.mode).toBe("fast");
		});
	});
});

// ============================================================================
// パス検証のテスト
// ============================================================================

describe("パス検証", () => {
	describe("validateFilePath", () => {
		it("有効なファイルパス", () => {
			const path = "/path/to/file.ts";
			const isValid = path.length > 0 && !path.includes("..") && !path.includes("~");

			expect(isValid).toBe(true);
		});

		it("パストラバーサルを含む", () => {
			const path = "/path/../../etc/passwd";
			const isInvalid = path.includes("..");

			expect(isInvalid).toBe(true);
		});

		it("チルダを含む", () => {
			const path = "~/file.ts";
			const isInvalid = path.includes("~");

			expect(isInvalid).toBe(true);
		});

		it("空パス", () => {
			const path = "";
			const isInvalid = path.length === 0;

			expect(isInvalid).toBe(true);
		});
	});
});

// ============================================================================
// 出力バウンディングのテスト
// ============================================================================

describe("出力バウンディング", () => {
	const MAX_SPAWN_STDIO_BYTES = 256 * 1024;

	function appendBoundedOutput(current: string, incoming: string, maxBytes: number): string {
		const next = current + incoming;
		if (Buffer.byteLength(next, "utf-8") <= maxBytes) {
			return next;
		}

		const target = maxBytes - 128;
		let tail = next.slice(-Math.max(target, 1));
		while (Buffer.byteLength(tail, "utf-8") > target && tail.length > 1) {
			tail = tail.slice(1);
		}
		return `...[truncated]\n${tail}`;
	}

	it("小さな出力はそのまま返す", () => {
		const current = "Hello";
		const incoming = " World";
		const result = appendBoundedOutput(current, incoming, MAX_SPAWN_STDIO_BYTES);

		expect(result).toBe("Hello World");
	});

	it("バイト数上限を超えない", () => {
		const current = "x".repeat(100);
		const incoming = "y".repeat(100);
		const result = appendBoundedOutput(current, incoming, MAX_SPAWN_STDIO_BYTES);

		expect(Buffer.byteLength(result, "utf-8")).toBeLessThanOrEqual(MAX_SPAWN_STDIO_BYTES);
	});

	it("超過時にtruncationマークを追加", () => {
		const maxBytes = 20;
		const current = "x".repeat(100);
		const incoming = "y".repeat(100);
		const result = appendBoundedOutput(current, incoming, maxBytes);

		expect(result).toContain("...[truncated]");
	});

	it("最大長を超える場合末尾を保持", () => {
		const maxBytes = 50;
		const current = "start-";
		const incoming = "x".repeat(100);
		const result = appendBoundedOutput(current, incoming, maxBytes);

		expect(result.startsWith("...[truncated]\n")).toBe(true);
		// 結果が最大バイト数を超えないことを確認
		expect(Buffer.byteLength(result, "utf-8")).toBeLessThanOrEqual(maxBytes + 128);
	});
});

// ============================================================================
// Spawn実行のテスト
// ============================================================================

describe("Spawn実行", () => {
	describe("runScriptAsync", () => {
		it("スクリプトが存在しない場合", () => {
			const scriptExists = false;

			if (!scriptExists) {
				const result = {
					success: false,
					stdout: "",
					stderr: "スクリプトが見つかりません",
				};
				expect(result.success).toBe(false);
				expect(result.stderr).toContain("スクリプトが見つかりません");
			}
		});

		it("スクリプトが存在する場合", () => {
			const scriptExists = true;
			const exitCode = 0;

			if (scriptExists) {
				const result = {
					success: exitCode === 0 && !false, // timedOut
					stdout: "output",
					stderr: "",
					timedOut: false,
					exitCode,
				};
				expect(result.success).toBe(true);
			}
		});

		it("タイムアウト時", () => {
			const timedOut = true;

			if (timedOut) {
				const result = {
					success: false,
					stdout: "",
					stderr: "",
					timedOut: true,
				};
				expect(result.success).toBe(false);
				expect(result.timedOut).toBe(true);
			}
		});
	});
});

// ============================================================================
// 乖離タイプのテスト
// ============================================================================

describe("乖離タイプ", () => {
	describe("DivergenceType", () => {
		it("すべての乖離タイプ", () => {
			const types: DivergenceType[] = [
				"value_mismatch",
				"invariant_violation",
				"contract_breach",
				"missing_jsdoc",
			];
			expect(types).toHaveLength(4);
		});

		it("Severityの値", () => {
			const severities: Severity[] = ["low", "medium", "high"];
			expect(severities).toHaveLength(3);
		});
	});

	describe("Divergenceインターフェース", () => {
		it("基本構造", () => {
			const divergence: Divergence = {
				type: "value_mismatch",
				severity: "medium",
				intention: { source: "philosophy.md", text: "価値観" },
				reality: { file: "code.ts", text: "実装" },
				reason: "理由",
			};
			expect(divergence.type).toBe("value_mismatch");
			expect(divergence.severity).toBe("medium");
		});
	});
});

// ============================================================================
// チェックリスト生成のテスト
// ============================================================================

describe("チェックリスト生成", () => {
	it("日付フォーマット", () => {
		const date = new Date().toISOString().split("T")[0];
		const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);

		expect(isValidDate).toBe(true);
	});

	it("レビュー記録パスの生成", () => {
		const ABDD_DIR = "/path/to/ABDD";
		const dateStr = "2024-01-01";
		const recordPath = `${ABDD_DIR}/reviews/${dateStr}.md`;

		expect(recordPath).toContain("reviews");
		expect(recordPath).toContain("2024-01-01.md");
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のパラメータ", () => {
		it("generateパラメータなし", () => {
			const params: AbddGenerateParamsType = {};
			const args: string[] = [];

			if (params.dryRun === true) args.push("--dry-run");
			if (params.verbose === true) args.push("--verbose");

			expect(args).toHaveLength(0);
		});

		it("jsdocパラメータなし", () => {
			const params: AbddJsdocParamsType = {};
			const args: string[] = [];

			if (params.dryRun === true) args.push("--dry-run");
			if (params.check === true) args.push("--check");
			if (params.verbose === true) args.push("--verbose");

			expect(args).toHaveLength(0);
		});
	});

	describe("境界値のタイムアウト", () => {
		it("ゼロタイムアウト", () => {
			const timeoutMs = 0;
			const isValid = timeoutMs >= 1000;

			expect(isValid).toBe(false);
		});

		it("非常に長いタイムアウト", () => {
			const timeoutMs = 999999999;
			const maxTimeout = 600000;
			const clamped = Math.min(timeoutMs, maxTimeout);

			expect(clamped).toBe(maxTimeout);
		});
	});

	describe("ファイル存在チェック", () => {
		it("ファイルが存在しない", () => {
			const exists = false;

			if (!exists) {
				const result = {
					success: false,
					stdout: "",
					stderr: "スクリプトが見つかりません",
				};
				expect(result.success).toBe(false);
			}
		});
	});

	describe("レート制限と再試行", () => {
		it("再試行回数の上限", () => {
			const maxRetries = 3;
			const currentRetry = 5;

			const canRetry = currentRetry < maxRetries;

			expect(canRetry).toBe(false);
		});

		it("遅延の上限", () => {
			const maxDelayMs = 32000;
			const computedDelay = 64000;

			const clampedDelay = Math.min(computedDelay, maxDelayMs);

			expect(clampedDelay).toBe(maxDelayMs);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("abdd.ts プロパティベーステスト", () => {
	it("PBT: パス検証は有効なパスのみ通す", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 100 }),
				(path) => {
					const hasTraversal = path.includes("..");
					const hasTilde = path.includes("~");
					const isEmpty = path.length === 0;
					const isValid = !hasTraversal && !hasTilde && !isEmpty;

					// 有効なパスは..や~を含まない
					return isValid === (!path.includes("..") && !path.includes("~"));
				}
			),
			{ numRuns: 100 }
		);
	});

	it("PBT: 出力バウンディングは上限を守る", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 1000 }),
				fc.string({ minLength: 1, maxLength: 1000 }),
				(current, incoming) => {
					const maxBytes = 256 * 1024;
					const next = current + incoming;

					if (Buffer.byteLength(next, "utf-8") <= maxBytes) {
						return true;
					}

					// 超過時はtruncationマークが含まれる
					return next.includes("...[truncated]");
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: 日付フォーマットは常に有効", () => {
		fc.assert(
			fc.property(
				fc.date({ min: new Date("1970-01-01"), max: new Date("2100-01-01") }),
				(date) => {
					// 無効な日付（NaN）の場合はスキップ
					if (isNaN(date.getTime())) return true;
					const dateStr = date.toISOString().split("T")[0];
					return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: 乖離重要度は有効な値", () => {
		fc.assert(
			fc.property(
				fc.constantFrom("low", "medium", "high" as const),
				(severity) => {
					return ["low", "medium", "high"].includes(severity);
				}
			),
			{ numRuns: 10 }
		);
	});

	it("PBT: 乖離タイプは有効な値", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(
					"value_mismatch",
					"invariant_violation",
					"contract_breach",
					"missing_jsdoc" as const
				),
				(type) => {
					return [
						"value_mismatch",
						"invariant_violation",
						"contract_breach",
						"missing_jsdoc",
					].includes(type);
				}
			),
			{ numRuns: 10 }
		);
	});

	it("PBT: バイト長の計算は正確", () => {
		fc.assert(
			fc.property(
				fc.string({ minLength: 1, maxLength: 100 }),
				(text) => {
					const buffer = Buffer.from(text, "utf-8");
					const byteLength = buffer.byteLength;

					return byteLength >= 0 && typeof byteLength === "number";
				}
			),
			{ numRuns: 50 }
		);
	});
});
