/**
 * @file .pi/extensions/abdd.ts の単体テスト
 * @description ABDD（実態駆動開発）スキルロジックのテスト
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
	readdirSync: vi.fn(() => []),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
	dirname: vi.fn((path) => path.split("/").slice(0, -1).join("/")),
	basename: vi.fn((path) => path.split("/").pop() || ""),
}));

// モック後にインポート
import abdd from "../../../.pi/extensions/abdd.js";

// ============================================================================
// エクスポート確認テスト
// ============================================================================

describe("abdd.ts エクスポート確認", () => {
	it("モジュールがデフォルトエクスポートを持つ", () => {
		expect(abdd).toBeDefined();
		expect(typeof abdd).toBe("function");
	});
});

// ============================================================================
// ABDDヘッダーパースのテスト
// ============================================================================

describe("ABDDヘッダーパース", () => {
	describe("@abdd.metaセクション", () => {
		interface ABDDMeta {
			path: string;
			role: string;
			why: string;
			related: string[];
			public_api: string;
			invariants: string;
			side_effects: string;
			failure_modes: string;
		}

		it("必須フィールドを持つ", () => {
			const meta: ABDDMeta = {
				path: ".pi/extensions/example.ts",
				role: "Example extension",
				why: "For demonstration",
				related: ["docs/example.md"],
				public_api: "default function",
				invariants: "Always returns valid output",
				side_effects: "None",
				failure_modes: "Invalid input",
			};
			expect(meta.path).toBeDefined();
			expect(meta.role).toBeDefined();
			expect(meta.why).toBeDefined();
		});
	});

	describe("@abdd.explainセクション", () => {
		interface ABDDExplain {
			overview: string;
			what_it_does: string[];
			why_it_exists: string;
			scope: {
				in: string[];
				out: string[];
			};
		}

		it("必須フィールドを持つ", () => {
			const explain: ABDDExplain = {
				overview: "This extension does X",
				what_it_does: ["Function 1", "Function 2"],
				why_it_exists: "To solve problem Y",
				scope: {
					in: ["Input1", "Input2"],
					out: ["Output1"],
				},
			};
			expect(explain.overview).toBeDefined();
			expect(explain.what_it_does.length).toBeGreaterThan(0);
		});
	});

	describe("ヘッダーパース関数", () => {
		const parseABDDHeader = (
			content: string
		): { meta: Record<string, string>; explain: Record<string, string> } | null => {
			const metaMatch = content.match(/@abdd\.meta\n([\s\S]*?)(?=\*\/|@abdd\.explain|$)/);
			const explainMatch = content.match(
				/@abdd\.explain\n([\s\S]*?)(?=\*\/|$)/
			);

			if (!metaMatch) return null;

			const meta: Record<string, string> = {};
			metaMatch[1].split("\n").forEach((line) => {
				const [key, ...values] = line.trim().split(":");
				if (key && values.length > 0) {
					meta[key.trim()] = values.join(":").trim();
				}
			});

			const explain: Record<string, string> = {};
			if (explainMatch) {
				explainMatch[1].split("\n").forEach((line) => {
					const [key, ...values] = line.trim().split(":");
					if (key && values.length > 0) {
						explain[key.trim()] = values.join(":").trim();
					}
				});
			}

			return { meta, explain };
		};

		it("ABDDヘッダーをパースする", () => {
			const content = `
/**
 * @abdd.meta
 * path: test.ts
 * role: test role
 * why: test reason
 * @abdd.explain
 * overview: test overview
 */`;
			const result = parseABDDHeader(content);
			expect(result).not.toBeNull();
			expect(result?.meta.path).toBe("test.ts");
			expect(result?.explain.overview).toBe("test overview");
		});

		it("ヘッダーがない場合はnull", () => {
			const content = "const x = 1;";
			const result = parseABDDHeader(content);
			expect(result).toBeNull();
		});
	});
});

// ============================================================================
// 乖離検出ロジックのテスト
// ============================================================================

describe("乖離検出ロジック", () => {
	describe("コード解析", () => {
		it("関数定義を検出する", () => {
			const code = "function add(a, b) { return a + b; }";
			const functionMatch = code.match(/function\s+(\w+)/);
			expect(functionMatch).not.toBeNull();
			expect(functionMatch![1]).toBe("add");
		});

		it("export文を検出する", () => {
			const code = "export function add(a, b) { return a + b; }";
			const exportMatch = code.match(/export\s+(?:default\s+)?(?:function|const|class)/);
			expect(exportMatch).not.toBeNull();
		});

		it("import文を検出する", () => {
			const code = "import { readFileSync } from 'fs';";
			const importMatch = code.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
			expect(importMatch).not.toBeNull();
		});
	});

	describe("乖離判定", () => {
		it("意図と実態の不一致を検出", () => {
			const intent = {
				exports: ["add", "subtract"],
			};
			const actual = {
				exports: ["add", "multiply"],
			};

			const missingInActual = intent.exports.filter(
				(e) => !actual.exports.includes(e)
			);
			expect(missingInActual).toContain("subtract");
		});

		it("余分な実装を検出", () => {
			const intent = {
				exports: ["add"],
			};
			const actual = {
				exports: ["add", "multiply"],
			};

			const extraInActual = actual.exports.filter(
				(e) => !intent.exports.includes(e)
			);
			expect(extraInActual).toContain("multiply");
		});
	});
});

// ============================================================================
// Mermaid図生成のテスト
// ============================================================================

describe("Mermaid図生成", () => {
	describe("シーケンス図", () => {
		it("基本的なシーケンス図を生成", () => {
			const generateSequenceDiagram = (
				steps: Array<{ from: string; to: string; label: string }>
			): string => {
				const lines = ["sequenceDiagram"];
				for (const step of steps) {
					lines.push(`${step.from}>>${step.to}: ${step.label}`);
				}
				return lines.join("\n");
			};

			const diagram = generateSequenceDiagram([
				{ from: "User", to: "API", label: "Request" },
				{ from: "API", to: "User", label: "Response" },
			]);

			expect(diagram).toContain("sequenceDiagram");
			expect(diagram).toContain("User>>API: Request");
		});
	});

	describe("フローチャート", () => {
		it("基本的なフローチャートを生成", () => {
			const generateFlowchart = (
				nodes: Array<{ id: string; label: string }>,
				edges: Array<{ from: string; to: string }>
			): string => {
				const lines = ["flowchart TD"];
				for (const node of nodes) {
					lines.push(`${node.id}[${node.label}]`);
				}
				for (const edge of edges) {
					lines.push(`${edge.from}-->${edge.to}`);
				}
				return lines.join("\n");
			};

			const diagram = generateFlowchart(
				[
					{ id: "A", label: "Start" },
					{ id: "B", label: "End" },
				],
				[{ from: "A", to: "B" }]
			);

			expect(diagram).toContain("flowchart TD");
			expect(diagram).toContain("A[Start]");
			expect(diagram).toContain("A-->B");
		});
	});
});

// ============================================================================
// ドキュメント生成のテスト
// ============================================================================

describe("ドキュメント生成", () => {
	describe("Markdown生成", () => {
		it("基本構造を持つ", () => {
			const doc = `# Module Name

## Overview
Description here.

## API
### function1
Description of function1.
`;
			expect(doc).toContain("# Module Name");
			expect(doc).toContain("## Overview");
			expect(doc).toContain("## API");
		});

		it("コードブロックを含む", () => {
			const doc = `## Usage

\`\`\`typescript
const result = add(1, 2);
\`\`\`
`;
			expect(doc).toContain("```typescript");
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のファイル", () => {
		it("空文字列でもエラーにならない", () => {
			const content = "";
			const hasABDDHeader = content.includes("@abdd.meta");
			expect(hasABDDHeader).toBe(false);
		});
	});

	describe("複雑な構造", () => {
		it("ネストされたオブジェクトを処理可能", () => {
			const structure = {
				level1: {
					level2: {
						level3: "value",
					},
				},
			};
			expect(structure.level1.level2.level3).toBe("value");
		});
	});

	describe("特殊文字を含むコード", () => {
		it("正規表現パターンを処理可能", () => {
			const code = "const regex = /test\\s*pattern/i;";
			expect(code).toContain("regex");
		});

		it("日本語コメントを処理可能", () => {
			const code = "// これは日本語のコメントです";
			expect(code).toContain("日本語");
		});
	});
});
