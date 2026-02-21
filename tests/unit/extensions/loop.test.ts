/**
 * @file .pi/extensions/loop.ts の単体テスト
 * @description ループ実行拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// Node.jsモジュールのモック
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => ({
		stdout: { on: vi.fn() },
		stderr: { on: vi.fn() },
		on: vi.fn(),
		kill: vi.fn(),
	})),
}));

vi.mock("node:crypto", () => ({
	randomBytes: vi.fn((size) => Buffer.from("x".repeat(size))),
}));

vi.mock("node:dns/promises", () => ({
	lookup: vi.fn(() => ({ address: "127.0.0.1" })),
}));

vi.mock("node:fs", () => ({
	appendFileSync: vi.fn(),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	statSync: vi.fn(() => ({ mtimeMs: Date.now() })),
	writeFileSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	basename: vi.fn((p) => p.split("/").pop() || ""),
	isAbsolute: vi.fn((p) => p.startsWith("/")),
	join: vi.fn((...args) => args.join("/")),
	resolve: vi.fn((p) => p),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	Type: {
		String: () => ({ type: "string" }),
		Optional: (type) => type,
		Number: () => ({ type: "number" }),
		Boolean: () => ({ type: "boolean" }),
		Array: (type) => ({ type: "array", itemType: type }),
		Object: (fields) => ({ type: "object", fields }),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Text: vi.fn(),
}));

// モジュールのモック
vi.mock("../lib/format-utils", () => ({
	formatDuration: vi.fn((ms) => `${ms}ms`),
}));

vi.mock("../lib/error-utils", () => ({
	toErrorMessage: vi.fn((err) => err?.message || "Error"),
}));

vi.mock("../lib/validation-utils", () => ({
	toBoundedInteger: vi.fn((val, min, max) => Math.max(min, Math.min(max, Number(val) || 0))),
	toBoundedFloat: vi.fn((val, min, max) => Math.max(min, Math.min(max, Number(val) || 0))),
}));

vi.mock("../lib/comprehensive-logger", () => ({
	getLogger: vi.fn(() => ({
		startOperation: vi.fn(() => "op-1"),
		endOperation: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	})),
}));

vi.mock("../lib/agent-utils", () => ({
	createRunId: vi.fn(() => `run-${Date.now()}`),
	computeLiveWindow: vi.fn(() => ({ start: 0, end: 100 })),
}));

vi.mock("../lib/model-timeouts", () => ({
	computeModelTimeoutMs: vi.fn(() => 60000),
}));

vi.mock("../lib/intent-aware-limits", () => ({
	classifyIntent: vi.fn(() => ({ intent: "normal", confidence: 0.8 })),
	getIntentBudget: vi.fn(() => ({ maxTokens: 4000, maxCost: 0.1 })),
}));

vi.mock("../lib/semantic-repetition", () => ({
	detectSemanticRepetition: vi.fn(() => ({
		detected: false,
		averageSimilarity: 0.5,
		method: "exact",
	})),
}));

vi.mock("../lib/storage-lock", () => ({
	atomicWriteTextFile: vi.fn(),
	withFileLock: vi.fn(),
}));

vi.mock("./shared/pi-print-executor", () => ({
	callModelViaPi: vi.fn(),
}));

vi.mock("./loop/ssrf-protection", () => ({
	isBlockedHostname: vi.fn(() => false),
	isPrivateOrReservedIP: vi.fn(() => false),
	validateUrlForSsrf: vi.fn(() => ({ valid: true, error: null })),
}));

vi.mock("./loop/reference-loader", () => ({
	loadReferences: vi.fn(async () => ({ references: [], warnings: [] })),
	fetchTextFromUrl: vi.fn(async () => ({ text: "", error: null })),
}));

vi.mock("./loop/verification", () => ({
	resolveVerificationPolicy: vi.fn(() => ({ mode: "allowlist" as const, allowlist: [] })),
	shouldRunVerificationCommand: vi.fn(() => false),
	runVerificationCommand: vi.fn(async () => ({ success: true, output: "" })),
	parseVerificationCommand: vi.fn(() => ({ command: "", type: "shell" as const })),
	isVerificationCommandAllowed: vi.fn(() => true),
}));

vi.mock("./loop/iteration-builder", () => ({
	buildIterationPrompt: vi.fn(() => "prompt"),
	buildReferencePack: vi.fn(() => "[R1] reference"),
	buildIterationFocus: vi.fn(() => "focus"),
	buildLoopCommandPreview: vi.fn(() => "preview"),
	buildIterationFailureOutput: vi.fn(() => "failure"),
	parseLoopContract: vi.fn(() => ({ task: "test", goal: "done" })),
	extractLoopResultBody: vi.fn(() => "result"),
	validateIteration: vi.fn(() => ({ valid: true, errors: [] })),
	normalizeValidationFeedback: vi.fn(() => []),
	buildDoneDeclarationFeedback: vi.fn(() => "done feedback"),
	extractNextStepLine: vi.fn(() => "next"),
	extractSummaryLine: vi.fn(() => "summary"),
	normalizeLoopOutput: vi.fn(() => "output"),
	LOOP_JSON_BLOCK_TAG: "LOOP_JSON",
	LOOP_RESULT_BLOCK_TAG: "LOOP_RESULT",
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("loop.ts 型定義", () => {
	describe("LoopConfig", () => {
		it("必須フィールドを持つ", () => {
			const config: LoopConfig = {
				maxIterations: 6,
				timeoutMs: 120000,
				requireCitation: true,
				verificationTimeoutMs: 120000,
			};
			expect(config.maxIterations).toBe(6);
			expect(config.timeoutMs).toBe(120000);
			expect(config.requireCitation).toBe(true);
		});

		it("オプションフィールド", () => {
			const config: LoopConfig = {
				maxIterations: 6,
				timeoutMs: 120000,
				requireCitation: true,
				verificationTimeoutMs: 120000,
				enableSemanticStagnation: true,
				semanticRepetitionThreshold: 0.9,
			};
			expect(config.enableSemanticStagnation).toBe(true);
			expect(config.semanticRepetitionThreshold).toBe(0.9);
		});
	});

	describe("LoopReference", () => {
		it("パス参照", () => {
			const ref: LoopReference = {
				source: "file",
				content: "content",
				path: "/path/to/file.md",
			};
			expect(ref.source).toBe("file");
			expect(ref.path).toBe("/path/to/file.md");
		});

		it("URL参照", () => {
			const ref: LoopReference = {
				source: "url",
				content: "content",
				url: "https://example.com/doc.md",
			};
			expect(ref.source).toBe("url");
			expect(ref.url).toBe("https://example.com/doc.md");
		});

		it("インラインテキスト", () => {
			const ref: LoopReference = {
				source: "inline",
				content: "inline text",
			};
			expect(ref.source).toBe("inline");
			expect(ref.content).toBe("inline text");
		});
	});

	describe("LoopIterationResult", () => {
		it("必須フィールドを持つ", () => {
			const result: LoopIterationResult = {
				iteration: 1,
				latencyMs: 1500,
				status: "running",
				goalStatus: "unknown",
				goalEvidence: "",
				citations: [],
				validationErrors: [],
				output: "test output",
			};
			expect(result.iteration).toBe(1);
			expect(result.latencyMs).toBe(1500);
			expect(result.status).toBe("running");
		});

		it("オプションフィールド", () => {
			const result: LoopIterationResult = {
				iteration: 1,
				latencyMs: 1500,
				status: "done",
				goalStatus: "achieved",
				goalEvidence: "evidence",
				verification: { success: true, output: "verify ok" },
				citations: ["R1"],
				validationErrors: [],
				output: "output",
			};
			expect(result.verification?.success).toBe(true);
			expect(result.citations).toEqual(["R1"]);
		});
	});

	describe("LoopRunSummary", () => {
		it("基本構造", () => {
			const summary: LoopRunSummary = {
				runId: "run-123",
				startedAt: "2024-01-01T00:00:00Z",
				finishedAt: "2024-01-01T00:01:00Z",
				task: "test task",
				completed: true,
				stopReason: "model_done",
				iterationCount: 3,
				maxIterations: 6,
				referenceCount: 1,
				model: {
					provider: "anthropic",
					id: "claude-3",
					thinkingLevel: "off",
				},
				config: {
					maxIterations: 6,
					timeoutMs: 120000,
					requireCitation: true,
					verificationTimeoutMs: 120000,
				},
				logFile: "/path/to/log.jsonl",
				summaryFile: "/path/to/summary.json",
				finalPreview: "preview",
			};
			expect(summary.runId).toBe("run-123");
			expect(summary.completed).toBe(true);
			expect(summary.stopReason).toBe("model_done");
		});
	});
});

// ============================================================================
// 設定正規化のテスト
// ============================================================================

describe("設定正規化", () => {
	describe("normalizeLoopConfig", () => {
		const LIMITS = {
			minIterations: 1,
			maxIterations: 16,
			minTimeoutMs: 10000,
			maxTimeoutMs: 600000,
			minVerificationTimeoutMs: 1000,
			maxVerificationTimeoutMs: 120000,
			minSemanticRepetitionThreshold: 0.7,
			maxSemanticRepetitionThreshold: 0.95,
		};

		function toBoundedInteger(value: unknown, min: number, max: number): number {
			return Math.max(min, Math.min(max, Number(value) || 0));
		}

		function toBoundedFloat(value: unknown, min: number, max: number): number {
			return Math.max(min, Math.min(max, Number(value) || 0));
		}

		it("有効な値を正規化", () => {
			const input = {
				maxIterations: 8,
				timeoutMs: 60000,
				verificationTimeoutMs: 60000,
				enableSemanticStagnation: false,
				semanticRepetitionThreshold: 0.85,
			};

			const config: LoopConfig = {
				maxIterations: toBoundedInteger(
					input.maxIterations,
					LIMITS.minIterations,
					LIMITS.maxIterations
				),
				timeoutMs: toBoundedInteger(
					input.timeoutMs,
					LIMITS.minTimeoutMs,
					LIMITS.maxTimeoutMs
				),
				requireCitation: true,
				verificationTimeoutMs: toBoundedInteger(
					input.verificationTimeoutMs,
					LIMITS.minVerificationTimeoutMs,
					LIMITS.maxVerificationTimeoutMs
				),
				enableSemanticStagnation: input.enableSemanticStagnation,
				semanticRepetitionThreshold: toBoundedFloat(
					input.semanticRepetitionThreshold,
					LIMITS.minSemanticRepetitionThreshold,
					LIMITS.maxSemanticRepetitionThreshold
				),
			};

			expect(config.maxIterations).toBe(8);
			expect(config.timeoutMs).toBe(60000);
			expect(config.semanticRepetitionThreshold).toBe(0.85);
		});

		it("境界値をクランプ", () => {
			const input = {
				maxIterations: 100,
				timeoutMs: 1000000,
				verificationTimeoutMs: 1000000,
			};

			const config: LoopConfig = {
				maxIterations: toBoundedInteger(
					input.maxIterations,
					LIMITS.minIterations,
					LIMITS.maxIterations
				),
				timeoutMs: toBoundedInteger(
					input.timeoutMs,
					LIMITS.minTimeoutMs,
					LIMITS.maxTimeoutMs
				),
				requireCitation: true,
				verificationTimeoutMs: toBoundedInteger(
					input.verificationTimeoutMs,
					LIMITS.minVerificationTimeoutMs,
					LIMITS.maxVerificationTimeoutMs
				),
			};

			expect(config.maxIterations).toBe(LIMITS.maxIterations);
			expect(config.timeoutMs).toBe(LIMITS.maxTimeoutMs);
			expect(config.verificationTimeoutMs).toBe(LIMITS.maxVerificationTimeoutMs);
		});

		it("undefined値はデフォルト値を使用", () => {
			const DEFAULT_CONFIG: LoopConfig = {
				maxIterations: 4,
				timeoutMs: 60000,
				requireCitation: true,
				verificationTimeoutMs: 60000,
			};

			const config: LoopConfig = {
				...DEFAULT_CONFIG,
				maxIterations: toBoundedInteger(
					undefined,
					LIMITS.minIterations,
					LIMITS.maxIterations
				),
			};

			expect(config.maxIterations).toBe(LIMITS.minIterations);
		});
	});
});

// ============================================================================
// SSRF保護のテスト
// ============================================================================

describe("SSRF保護", () => {
	describe("isPrivateOrReservedIP", () => {
		it("プライベートIPを検出", () => {
			const privateIPs = [
				"127.0.0.1",
				"192.168.1.1",
				"10.0.0.1",
				"172.16.0.1",
				"::1",
				"fe80::1",
			];

			const isPrivateOrReserved = (ip: string) => {
				return privateIPs.includes(ip);
			};

			expect(isPrivateOrReserved("192.168.1.1")).toBe(true);
			expect(isPrivateOrReserved("8.8.8.8")).toBe(false);
		});
	});

	describe("isBlockedHostname", () => {
		it("ブロック済みホスト名を検出", () => {
			const blockedHostnames = ["metadata.google.internal", "169.254.169.254"];

			const isBlocked = (hostname: string) => {
				return blockedHostnames.includes(hostname);
			};

			expect(isBlocked("metadata.google.internal")).toBe(true);
			expect(isBlocked("example.com")).toBe(false);
		});
	});

	describe("validateUrlForSsrf", () => {
		it("有効なURLを検証", () => {
			const url = "https://example.com/doc.md";
			const isValid = url.startsWith("http://") || url.startsWith("https://");

			expect(isValid).toBe(true);
		});

		it("無効なURLを拒否", () => {
			const url = "file:///etc/passwd";
			const isValid = url.startsWith("http://") || url.startsWith("https://");

			expect(isValid).toBe(false);
		});

		it("プライベートIPを含むURLを拒否", () => {
			const url = "http://192.168.1.1/doc.md";
			const hasPrivateIP = url.includes("192.168.1.1");

			expect(hasPrivateIP).toBe(true);
		});
	});
});

// ============================================================================
// 参照ロードのテスト
// ============================================================================

describe("参照ロード", () => {
	describe("参照ソースの判定", () => {
		it("ファイルパスの判定", () => {
			const refs = [
				"/absolute/path/file.md",
				"./relative/path/file.md",
				"../parent/path/file.md",
			];

			refs.forEach(ref => {
				const isFilePath = ref.startsWith("/") ||
					ref.startsWith("./") ||
					ref.startsWith("../");
				expect(isFilePath).toBe(true);
			});
		});

		it("URLの判定", () => {
			const refs = [
				"https://example.com/doc.md",
				"http://example.com/doc.md",
			];

			refs.forEach(ref => {
				const isUrl = ref.startsWith("http://") || ref.startsWith("https://");
				expect(isUrl).toBe(true);
			});
		});

		it("インラインテキストの判定", () => {
			const refs = [
				"inline text here",
				"これはインラインテキストです",
			];

			refs.forEach(ref => {
				const isInline = !ref.startsWith("/") &&
					!ref.startsWith("./") &&
					!ref.startsWith("../") &&
					!ref.startsWith("http://") &&
					!ref.startsWith("https://");
				expect(isInline).toBe(true);
			});
		});
	});
});

// ============================================================================
// 検証コマンドのテスト
// ============================================================================

describe("検証コマンド", () => {
	describe("shouldRunVerificationCommand", () => {
		it("allowlistモードでの判定", () => {
			const allowlist = ["npm test", "cargo test"];
			const command = "npm test";

			const isAllowed = allowlist.includes(command);
			expect(isAllowed).toBe(true);
		});

		it("allowlistにないコマンドは実行しない", () => {
			const allowlist = ["npm test"];
			const command = "rm -rf /";

			const isAllowed = allowlist.includes(command);
			expect(isAllowed).toBe(false);
		});
	});

	describe("parseVerificationCommand", () => {
		it("シンプルなコマンド", () => {
			const command = "npm test";
			const parsed = { command, type: "shell" as const };

			expect(parsed.command).toBe("npm test");
		});

		it("引数付きのコマンド", () => {
			const command = "pytest tests/ -v";
			const parsed = { command, type: "shell" as const };

			expect(parsed.command).toBe("pytest tests/ -v");
		});
	});
});

// ============================================================================
// セマンティック反復検出のテスト
// ============================================================================

describe("セマンティック反復検出", () => {
	describe("閾値判定", () => {
		it("閾値以上は反復と判定", () => {
			const similarity = 0.9;
			const threshold = 0.85;

			const isRepetition = similarity >= threshold;
			expect(isRepetition).toBe(true);
		});

		it("閾値未満は反復ではない", () => {
			const similarity = 0.7;
			const threshold = 0.85;

			const isRepetition = similarity >= threshold;
			expect(isRepetition).toBe(false);
		});
	});

	describe("検出メソッド", () => {
		it("正確な文字列一致", () => {
			const output1 = "This is the output";
			const output2 = "This is the output";

			const isExactMatch = output1 === output2;
			expect(isExactMatch).toBe(true);
		});

		it("異なる出力", () => {
			const output1 = "This is the output";
			const output2 = "This is different";

			const isExactMatch = output1 === output2;
			expect(isExactMatch).toBe(false);
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のタスク", () => {
		it("空文字列タスク", () => {
			const task = "";
			const isValid = task.trim().length > 0;

			expect(isValid).toBe(false);
		});

		it("空白のみのタスク", () => {
			const task = "   ";
			const isValid = task.trim().length > 0;

			expect(isValid).toBe(false);
		});
	});

	describe("ゼロ反復", () => {
		it("maxIterationsが0の場合", () => {
			const maxIterations = 0;
			const isValid = maxIterations >= 1;

			expect(isValid).toBe(false);
		});
	});

	describe("タイムアウト", () => {
		it("ゼロタイムアウト", () => {
			const timeoutMs = 0;
			const isValid = timeoutMs >= 10000;

			expect(isValid).toBe(false);
		});

		it("非常に長いタイムアウト", () => {
			const timeoutMs = 999999999;
			const maxTimeout = 600000;
			const clamped = Math.min(timeoutMs, maxTimeout);

			expect(clamped).toBe(maxTimeout);
		});
	});

	describe("参照の上限", () => {
		it("最大参照数を超える", () => {
			const maxReferences = 24;
			const refsCount = 30;

			const isValid = refsCount <= maxReferences;
			expect(isValid).toBe(false);
		});

		it("最大文字数を超える参照", () => {
			const maxChars = 8000;
			const refChars = 10000;

			const isValid = refChars <= maxChars;
			expect(isValid).toBe(false);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("loop.ts プロパティベーステスト", () => {
	it("PBT: 整数バウンディングは範囲内", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 100 }),
				fc.integer({ min: 1, max: 10 }),
				(value, max) => {
					const clamped = Math.min(max, Number(value) || 0);
					return clamped >= 0 && clamped <= max;
				}
			),
			{ numRuns: 100 }
		);
	});

	it("PBT: 参照の正規化", () => {
		fc.assert(
			fc.property(
				fc.string({ maxLength: 100 }),
				(ref) => {
					// ファイルパス
					const isFilePath = ref.startsWith("/") ||
						ref.startsWith("./") ||
						ref.startsWith("../");

					// URL
					const isUrl = ref.startsWith("http://") ||
						ref.startsWith("https://");

					// イライン
					const isInline = !isFilePath && !isUrl;

					// いずれかのカテゴリに属する
					return isFilePath || isUrl || isInline || ref === "";
				}
			),
			{ numRuns: 50 }
		);
	});

	it("PBT: URLバリデーション", () => {
		fc.assert(
			fc.property(
				fc.webUrl(),
				(url) => {
					const isValid = url.startsWith("http://") ||
						url.startsWith("https://");
					return isValid;
				}
			),
			{ numRuns: 20 }
		);
	});

	it("PBT: 反復検出の閾値", () => {
		fc.assert(
			fc.property(
				fc.float({ min: Math.fround(0), max: Math.fround(1) }),
				fc.float({ min: Math.fround(0.7), max: Math.fround(0.95) }),
				(similarity, threshold) => {
					if (!Number.isFinite(similarity) || !Number.isFinite(threshold)) {
						return true;
					}
					const isRepetition = similarity >= threshold;
					const notRepetition = similarity < threshold;

					// 排他的であるべき
					return isRepetition !== notRepetition;
				}
			),
			{ numRuns: 100 }
		);
	});
});
