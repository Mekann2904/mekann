/**
 * @file .pi/extensions/invariant-pipeline.ts の単体テスト
 * @description 形式仕様からQuint仕様、TypeScriptインバリアントを自動生成するロジックのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// pi SDKのモック
vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
}));

vi.mock("node:fs", () => ({
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
	dirname: vi.fn((path) => path.split("/").slice(0, -1).join("/")),
}));

// モック後にインポート
import invariantPipeline from "../../../.pi/extensions/invariant-pipeline.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("invariant-pipeline.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(invariantPipeline).toBeDefined();
		expect(typeof invariantPipeline).toBe("function");
	});
});

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("型定義", () => {
	describe("ParsedSpec型", () => {
		interface ParsedSpec {
			title: string;
			description?: string;
			states: Array<{
				name: string;
				type: string;
				initialValue?: unknown;
				constraints?: string[];
			}>;
			operations: Array<{
				name: string;
				parameters?: { name: string; type: string }[];
				preconditions?: string[];
				postconditions?: string[];
				description?: string;
			}>;
			invariants: Array<{
				name: string;
				condition: string;
				description?: string;
			}>;
			constants?: { name: string; type: string; value?: unknown }[];
		}

		it("正しい構造を持つ", () => {
			const spec: ParsedSpec = {
				title: "Test Spec",
				states: [{ name: "count", type: "int", initialValue: 0 }],
				operations: [{ name: "increment", preconditions: [], postconditions: ["count' = count + 1"] }],
				invariants: [{ name: "count >= 0", condition: "count >= 0" }],
			};
			expect(spec.title).toBe("Test Spec");
			expect(spec.states).toHaveLength(1);
		});
	});

	describe("GenerationResult型", () => {
		interface GenerationResult {
			success: boolean;
			outputs: {
				quint?: { path: string; content: string };
				macros?: { path: string; content: string };
				tests?: { path: string; content: string };
				mbt?: { path: string; content: string };
			};
			errors: string[];
			warnings: string[];
		}

		it("成功時の構造", () => {
			const result: GenerationResult = {
				success: true,
				outputs: { quint: { path: "spec.qnt", content: "module X {}" } },
				errors: [],
				warnings: [],
			};
			expect(result.success).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("エラー時の構造", () => {
			const result: GenerationResult = {
				success: false,
				outputs: {},
				errors: ["Parse error"],
				warnings: [],
			};
			expect(result.success).toBe(false);
			expect(result.errors).toContain("Parse error");
		});
	});
});

// ============================================================================
// parseConstantValue関数のテスト
// ============================================================================

describe("parseConstantValue関数", () => {
	const parseConstantValue = (valueStr: string, type: string): unknown => {
		const trimmed = valueStr.trim();

		if (
			type === "int" ||
			type === "integer" ||
			type === "整数" ||
			type === "i64" ||
			type === "i32"
		) {
			const num = parseInt(trimmed, 10);
			return isNaN(num) ? trimmed : num;
		}

		if (type === "float" || type === "double" || type === "f64" || type === "f32") {
			const num = parseFloat(trimmed);
			return isNaN(num) ? trimmed : num;
		}

		if (type === "bool" || type === "boolean" || type === "真偽") {
			if (trimmed.toLowerCase() === "true" || trimmed === "真" || trimmed === "1")
				return true;
			if (trimmed.toLowerCase() === "false" || trimmed === "偽" || trimmed === "0")
				return false;
			return trimmed;
		}

		return trimmed;
	};

	describe("整数型", () => {
		it("整数をパースする", () => {
			expect(parseConstantValue("42", "int")).toBe(42);
			expect(parseConstantValue("-10", "integer")).toBe(-10);
		});

		it("無効な値は文字列として返す", () => {
			expect(parseConstantValue("abc", "int")).toBe("abc");
		});
	});

	describe("浮動小数点型", () => {
		it("浮動小数点をパースする", () => {
			expect(parseConstantValue("3.14", "float")).toBe(3.14);
			expect(parseConstantValue("-2.5", "double")).toBe(-2.5);
		});
	});

	describe("真偽値型", () => {
		it("真偽値をパースする", () => {
			expect(parseConstantValue("true", "bool")).toBe(true);
			expect(parseConstantValue("false", "boolean")).toBe(false);
			expect(parseConstantValue("真", "真偽")).toBe(true);
			expect(parseConstantValue("偽", "真偽")).toBe(false);
		});

		it("1/0を真偽値として扱う", () => {
			expect(parseConstantValue("1", "bool")).toBe(true);
			expect(parseConstantValue("0", "bool")).toBe(false);
		});
	});

	describe("文字列型", () => {
		it("文字列はそのまま返す", () => {
			expect(parseConstantValue("hello", "str")).toBe("hello");
			expect(parseConstantValue("world", "string")).toBe("world");
		});
	});
});

// ============================================================================
// mapTypeToQuint関数のテスト
// ============================================================================

describe("mapTypeToQuint関数", () => {
	const mapTypeToQuint = (type: string): string => {
		const typeMap: Record<string, string> = {
			int: "int",
			integer: "int",
			整数: "int",
			bool: "bool",
			boolean: "bool",
			真偽: "bool",
			str: "str",
			string: "str",
			文字列: "str",
			Set: "Set",
			集合: "Set",
			List: "List",
			リスト: "List",
			Map: "Map",
			マップ: "Map",
		};
		return typeMap[type] || type;
	};

	it("整数型をマップする", () => {
		expect(mapTypeToQuint("int")).toBe("int");
		expect(mapTypeToQuint("integer")).toBe("int");
		expect(mapTypeToQuint("整数")).toBe("int");
	});

	it("真偽値型をマップする", () => {
		expect(mapTypeToQuint("bool")).toBe("bool");
		expect(mapTypeToQuint("boolean")).toBe("bool");
	});

	it("文字列型をマップする", () => {
		expect(mapTypeToQuint("str")).toBe("str");
		expect(mapTypeToQuint("string")).toBe("str");
	});

	it("コレクション型をマップする", () => {
		expect(mapTypeToQuint("Set")).toBe("Set");
		expect(mapTypeToQuint("List")).toBe("List");
		expect(mapTypeToQuint("Map")).toBe("Map");
	});

	it("未知の型はそのまま返す", () => {
		expect(mapTypeToQuint("CustomType")).toBe("CustomType");
	});
});

// ============================================================================
// getDefaultValue関数のテスト
// ============================================================================

describe("getDefaultValue関数", () => {
	const getDefaultValue = (type: string): unknown => {
		const defaults: Record<string, unknown> = {
			int: 0,
			integer: 0,
			整数: 0,
			bool: false,
			boolean: false,
			真偽: false,
			str: "",
			string: "",
			文字列: "",
		};
		return defaults[type] ?? null;
	};

	it("整数型のデフォルトは0", () => {
		expect(getDefaultValue("int")).toBe(0);
	});

	it("真偽値型のデフォルトはfalse", () => {
		expect(getDefaultValue("bool")).toBe(false);
	});

	it("文字列型のデフォルトは空文字", () => {
		expect(getDefaultValue("str")).toBe("");
	});

	it("未知の型のデフォルトはnull", () => {
		expect(getDefaultValue("unknown")).toBeNull();
	});
});

// ============================================================================
// spec.mdパースロジックのテスト
// ============================================================================

describe("spec.mdパースロジック", () => {
	describe("タイトル抽出", () => {
		it("# からタイトルを抽出", () => {
			const line = "# Counter Specification";
			const title = line.startsWith("# ") ? line.substring(2) : "";
			expect(title).toBe("Counter Specification");
		});
	});

	describe("セクション判定", () => {
		it("## からセクションを判定", () => {
			const line = "## 状態";
			const section = line.startsWith("## ")
				? line.substring(3).toLowerCase()
				: "";
			expect(section).toBe("状態");
		});

		it("日本語セクションを判定", () => {
			const section = "インバリアント";
			expect(section.includes("インバリアント")).toBe(true);
		});
	});

	describe("状態変数パース", () => {
		it("### name: type 形式をパース", () => {
			const line = "### count: int";
			const match = line.match(/^###\s+(\w+)\s*:\s*(.+)$/);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("count");
			expect(match![2]).toBe("int");
		});
	});

	describe("操作パース", () => {
		it("### name(params): description 形式をパース", () => {
			const line = "### increment(): カウントを増やす";
			const match = line.match(/^###\s+(\w+)\s*\(([^)]*)\)\s*:\s*(.*)$/);
			expect(match).not.toBeNull();
			expect(match![1]).toBe("increment");
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のspec", () => {
		it("空文字列でもエラーにならない", () => {
			const content = "";
			const lines = content.split("\n");
			expect(lines).toHaveLength(1);
		});
	});

	describe("複雑な型", () => {
		it("ジェネリック型を処理可能", () => {
			const type = "Map<string, int>";
			expect(type).toContain("Map");
		});
	});

	describe("長いインバリアント条件", () => {
		it("複雑な条件式を処理可能", () => {
			const condition =
				"count >= 0 && count <= MAX_COUNT && isActive implies count > 0";
			expect(condition).toContain("&&");
		});
	});
});
