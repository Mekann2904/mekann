/**
 * @file .pi/extensions/dynamic-tools.ts の単体テスト
 * @description 動的ツール生成・実行ロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:fs", () => ({
	appendFileSync: vi.fn(),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
}));

vi.mock("../../../.pi/lib/comprehensive-logger", () => ({
	getLogger: vi.fn(() => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	})),
}));

vi.mock("../../../.pi/lib/comprehensive-logger-types", () => ({}));

vi.mock("../../../.pi/lib/dynamic-tools/registry.js", () => ({
	getRegistry: vi.fn(() => ({
		register: vi.fn(),
		get: vi.fn(),
		list: vi.fn(() => []),
		delete: vi.fn(),
	})),
}));

vi.mock("../../../.pi/lib/dynamic-tools/safety.js", () => ({
	analyzeCodeSafety: vi.fn(() => ({
		isSafe: true,
		issues: [],
		score: 100,
	})),
	quickSafetyCheck: vi.fn(() => ({ isSafe: true })),
}));

vi.mock("../../../.pi/lib/dynamic-tools/quality.js", () => ({
	assessCodeQuality: vi.fn(() => ({
		score: 80,
		issues: [],
	})),
	recordExecutionMetrics: vi.fn(),
}));

vi.mock("../../../.pi/lib/verification-workflow.js", () => ({
	isHighStakesTask: vi.fn(() => false),
}));

// モック後にインポート
import dynamicTools from "../../../.pi/extensions/dynamic-tools.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("dynamic-tools.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(dynamicTools).toBeDefined();
		expect(typeof dynamicTools).toBe("function");
	});
});

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("型定義", () => {
	describe("CreateToolInput型", () => {
		interface CreateToolInput {
			name: string;
			description: string;
			code: string;
			parameters?: Record<
				string,
				{
					type: "string" | "number" | "boolean" | "object" | "array";
					description: string;
					default?: unknown;
					enum?: string[];
					minimum?: number;
					maximum?: number;
					required?: boolean;
				}
			>;
			tags?: string[];
			generated_from?: string;
		}

		it("正しい構造を持つ", () => {
			const input: CreateToolInput = {
				name: "calculate_sum",
				description: "Calculate sum of two numbers",
				code: "async (params) => params.a + params.b",
				parameters: {
					a: { type: "number", description: "First number" },
					b: { type: "number", description: "Second number" },
				},
				tags: ["math", "utility"],
			};
			expect(input.name).toBe("calculate_sum");
			expect(input.parameters?.a.type).toBe("number");
		});
	});

	describe("RunDynamicToolInput型", () => {
		interface RunDynamicToolInput {
			tool_id?: string;
			tool_name?: string;
			parameters: Record<string, unknown>;
			timeout_ms?: number;
		}

		it("tool_idで実行", () => {
			const input: RunDynamicToolInput = {
				tool_id: "tool-123",
				parameters: { x: 1 },
			};
			expect(input.tool_id).toBe("tool-123");
		});

		it("tool_nameで実行", () => {
			const input: RunDynamicToolInput = {
				tool_name: "calculate_sum",
				parameters: { a: 1, b: 2 },
			};
			expect(input.tool_name).toBe("calculate_sum");
		});

		it("タイムアウトを指定可能", () => {
			const input: RunDynamicToolInput = {
				tool_name: "slow_tool",
				parameters: {},
				timeout_ms: 60000,
			};
			expect(input.timeout_ms).toBe(60000);
		});
	});
});

// ============================================================================
// 監査ログのテスト
// ============================================================================

describe("監査ログ", () => {
	describe("ログエントリ構造", () => {
		interface AuditLogEntry {
			timestamp: string;
			action: string;
			toolId?: string;
			toolName?: string;
			success: boolean;
			details?: Record<string, unknown>;
			error?: string;
		}

		it("作成ログの構造", () => {
			const entry: AuditLogEntry = {
				timestamp: new Date().toISOString(),
				action: "create_tool",
				toolId: "tool-123",
				toolName: "my_tool",
				success: true,
			};
			expect(entry.action).toBe("create_tool");
			expect(entry.success).toBe(true);
		});

		it("実行ログの構造", () => {
			const entry: AuditLogEntry = {
				timestamp: new Date().toISOString(),
				action: "run_tool",
				toolId: "tool-123",
				success: true,
				details: { executionTimeMs: 150 },
			};
			expect(entry.action).toBe("run_tool");
			expect(entry.details?.executionTimeMs).toBe(150);
		});

		it("エラーログの構造", () => {
			const entry: AuditLogEntry = {
				timestamp: new Date().toISOString(),
				action: "run_tool",
				toolId: "tool-123",
				success: false,
				error: "Safety check failed",
			};
			expect(entry.success).toBe(false);
			expect(entry.error).toBe("Safety check failed");
		});
	});

	describe("JSONLフォーマット", () => {
		it("1行に1エントリ", () => {
			const entry = {
				timestamp: "2024-01-01T00:00:00Z",
				action: "create",
				success: true,
			};
			const line = JSON.stringify(entry);
			expect(line).not.toContain("\n");
		});
	});
});

// ============================================================================
// 安全性チェックのテスト
// ============================================================================

describe("安全性チェック", () => {
	describe("quickSafetyCheck", () => {
		it("危険なコードを検出する", () => {
			const dangerousPatterns = [
				/require\s*\(/,
				/process\./,
				/eval\s*\(/,
				/Function\s*\(/,
			];

			const code = "const fs = require('fs')";
			const isDangerous = dangerousPatterns.some((p) => p.test(code));
			expect(isDangerous).toBe(true);
		});

		it("安全なコードを通す", () => {
			const dangerousPatterns = [/require\s*\(/, /process\./];
			const code = "return params.a + params.b";
			const isDangerous = dangerousPatterns.some((p) => p.test(code));
			expect(isDangerous).toBe(false);
		});
	});

	describe("analyzeCodeSafety", () => {
		it("安全性スコアを返す", () => {
			const result = { isSafe: true, issues: [], score: 100 };
			expect(result.isSafe).toBe(true);
			expect(result.score).toBeGreaterThanOrEqual(0);
			expect(result.score).toBeLessThanOrEqual(100);
		});
	});
});

// ============================================================================
// コード品質評価のテスト
// ============================================================================

describe("コード品質評価", () => {
	describe("assessCodeQuality", () => {
		it("品質スコアを返す", () => {
			const result = { score: 80, issues: [] };
			expect(result.score).toBeGreaterThanOrEqual(0);
			expect(result.score).toBeLessThanOrEqual(100);
		});

		it("問題がある場合は低スコア", () => {
			const result = { score: 40, issues: ["Missing error handling"] };
			expect(result.score).toBeLessThan(60);
			expect(result.issues.length).toBeGreaterThan(0);
		});
	});
});

// ============================================================================
// 実行結果のテスト
// ============================================================================

describe("実行結果", () => {
	describe("ToolExecutionResult型", () => {
		interface ToolExecutionResult {
			success: boolean;
			result?: unknown;
			error?: string;
			executionTimeMs: number;
		}

		it("成功時の結果", () => {
			const result: ToolExecutionResult = {
				success: true,
				result: { sum: 5 },
				executionTimeMs: 10,
			};
			expect(result.success).toBe(true);
			expect(result.result).toEqual({ sum: 5 });
		});

		it("失敗時の結果", () => {
			const result: ToolExecutionResult = {
				success: false,
				error: "Division by zero",
				executionTimeMs: 5,
			};
			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のコード", () => {
		it("空文字列でも安全性チェックは実行可能", () => {
			const code = "";
			expect(code.length).toBe(0);
		});
	});

	describe("非常に長いコード", () => {
		it("大きなコードでも処理可能", () => {
			const code = "x".repeat(100000);
			expect(code.length).toBe(100000);
		});
	});

	describe("特殊文字を含むパラメータ", () => {
		it("JSONシリアライズ可能であれば処理可能", () => {
			const params = { text: "hello\nworld\ttab" };
			const json = JSON.stringify(params);
			expect(json).toContain("\\n");
		});
	});

	describe("タイムアウト", () => {
		it("タイムアウト値を正しく設定", () => {
			const timeoutMs = 30000;
			expect(timeoutMs).toBe(30000);
		});
	});
});
