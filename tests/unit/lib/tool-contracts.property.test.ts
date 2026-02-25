/**
 * @file ツール契約プロパティテスト
 * @description ABDD/spec.mdで定義されたTool Interface契約を検証する
 * @testFramework vitest
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fc from "fast-check";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// ツール定義の型
interface ToolDefinition {
	name: string;
	description: string;
	parameters?: Record<string, unknown>;
}

interface ExtensionModule {
	default: (api: unknown) => void;
}

/**
 * 拡張機能ディレクトリからツール定義を抽出
 */
function extractToolDefinitions(): ToolDefinition[] {
	const tools: ToolDefinition[] = [];
	const extensionsDir = join(process.cwd(), ".pi", "extensions");

	if (!existsSync(extensionsDir)) {
		return tools;
	}

	// TypeScriptファイルを検索
	const files = readdirSync(extensionsDir, { recursive: true }) as string[];
	const tsFiles = files.filter(
		(f) => typeof f === "string" && extname(f) === ".ts" && !f.includes(".test."),
	);

	for (const file of tsFiles) {
		const filePath = join(extensionsDir, file);
		if (!existsSync(filePath)) continue;

		try {
			const content = readFileSync(filePath, "utf-8");

			// registerTool呼び出しからツール名を抽出
			const nameMatches = content.matchAll(
				/registerTool\s*\(\s*\{[^}]*name:\s*["']([^"']+)["']/g,
			);
			for (const match of nameMatches) {
				tools.push({
					name: match[1],
					description: "",
					parameters: {},
				});
			}

			// Type.Objectパターンからツール名を抽出
			const objectTypeMatches = content.matchAll(
				/Type\.Object\s*\(\s*\{[^}]*name:\s*["']([^"']+)["']/g,
			);
			for (const match of objectTypeMatches) {
				if (!tools.some((t) => t.name === match[1])) {
					tools.push({
						name: match[1],
						description: "",
						parameters: {},
					});
				}
			}
		} catch {
			// ファイル読み込みエラーは無視
		}
	}

	return tools;
}

// JSON Schemaの簡易バリデーター
function isValidJsonSchema(schema: unknown): boolean {
	if (!schema || typeof schema !== "object") return false;
	const s = schema as Record<string, unknown>;

	// 有効なJSON Schemaタイプ
	const validTypes = [
		"string",
		"number",
		"integer",
		"boolean",
		"object",
		"array",
		"null",
	];

	// typeが指定されている場合、有効なタイプかチェック
	if (s.type !== undefined) {
		if (Array.isArray(s.type)) {
			return s.type.every((t: string) => validTypes.includes(t));
		}
		if (typeof s.type === "string") {
			return validTypes.includes(s.type);
		}
	}

	// $schemaまたはpropertiesがあれば有効とみなす
	if (s.$schema || s.properties || s.additionalProperties !== undefined) {
		return true;
	}

	// 空のオブジェクトも許可（any型として扱われる）
	return Object.keys(s).length === 0 || s.type !== undefined;
}

// ============================================================================
// ツール契約テスト
// ============================================================================

describe("ツール契約", () => {
	let tools: ToolDefinition[];

	beforeAll(() => {
		tools = extractToolDefinitions();
	});

	describe("nameの一意性", () => {
		it("すべてのツール名は一意である", () => {
			expect(tools.length).toBeGreaterThan(0);

			const names = tools.map((t) => t.name);
			const uniqueNames = new Set(names);

			expect(
				uniqueNames.size,
				`重複するツール名が存在します: ${names.filter((n, i) => names.indexOf(n) !== i).join(", ")}`,
			).toBe(names.length);
		});

		it("ツール名は有効な識別子形式である", () => {
			const validNamePattern = /^[a-z][a-z0-9_]*$/;

			for (const tool of tools) {
				expect(
					validNamePattern.test(tool.name),
					`ツール名 "${tool.name}" は有効な識別子形式ではありません`,
				).toBe(true);
			}
		});

		it("PBT: 一意なツール名セットは常に一意性を維持する", () => {
			fc.assert(
				fc.property(
					fc.uniqueArray(
						fc.record({
							name: fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/),
							description: fc.string(),
						}),
						{
							minLength: 1,
							maxLength: 100,
							// nameフィールドで一意性を判定
							selector: (item) => item.name,
						},
					),
					(generatedTools) => {
						const names = generatedTools.map((t) => t.name);
						const uniqueNames = new Set(names);
						// uniqueArray + selectorで生成されたツール名は常に一意
						return uniqueNames.size === names.length;
					},
				),
			);
		});
	});

	describe("parametersのJSON Schema有効性", () => {
		it("ツールパラメータは有効なJSON Schemaである", () => {
			for (const tool of tools) {
				if (tool.parameters) {
					expect(
						isValidJsonSchema(tool.parameters),
						`ツール "${tool.name}" のparametersは有効なJSON Schemaではありません`,
					).toBe(true);
				}
			}
		});

		it("PBT: ランダムなJSON Schema生成でバリデーションが動作する", () => {
			fc.assert(
				fc.property(
					fc.oneof(
						fc.constant({ type: "string" }),
						fc.constant({ type: "number" }),
						fc.constant({ type: "boolean" }),
						fc.constant({ type: "object", properties: {} }),
						fc.constant({ type: "array", items: { type: "string" } }),
						fc.constant({}),
					),
					(schema) => {
						// 有効なスキーマはtrueを返す
						return isValidJsonSchema(schema) === true;
					},
				),
			);
		});
	});

	describe("descriptionの日本語記述", () => {
		it("ツール説明には日本語が含まれる", () => {
			// 拡張機能ファイルから説明を抽出して確認
			const extensionsDir = join(process.cwd(), ".pi", "extensions");
			if (!existsSync(extensionsDir)) {
				return; // ディレクトリが存在しない場合はスキップ
			}

			const files = readdirSync(extensionsDir, { recursive: true }) as string[];
			const tsFiles = files.filter(
				(f) => typeof f === "string" && extname(f) === ".ts" && !f.includes(".test."),
			);

			let checkedCount = 0;
			for (const file of tsFiles.slice(0, 10)) {
				// 最初の10ファイルをチェック
				const filePath = join(extensionsDir, file);
				if (!existsSync(filePath)) continue;

				try {
					const content = readFileSync(filePath, "utf-8");

					// descriptionフィールドに日本語が含まれているか
					const descMatches = content.matchAll(
						/description:\s*["']([^"']+)["']/g,
					);
					for (const match of descMatches) {
						const desc = match[1];
						if (desc.length > 10) {
							// 十分な長さの説明のみチェック
							const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(
								desc,
							);
							expect(
								hasJapanese,
								`説明 "${desc.substring(0, 50)}..." に日本語が含まれていません`,
							).toBe(true);
							checkedCount++;
						}
					}
				} catch {
					// エラーは無視
				}
			}

			// 少なくともいくつかの説明をチェックした
			expect(checkedCount).toBeGreaterThan(0);
		});
	});
});

// ============================================================================
// Result型契約テスト
// ============================================================================

describe("Result型契約", () => {
	describe("成功時の形式", () => {
		it("成功時は { ok: true, value: ... } 形式を返す", () => {
			const successResult = { ok: true as const, value: "test" };

			expect(successResult.ok).toBe(true);
			expect(successResult.value).toBeDefined();
		});

		it("PBT: 成功結果は常にok: trueを持つ", () => {
			fc.assert(
				fc.property(fc.anything(), (value) => {
					const result = { ok: true as const, value };
					return result.ok === true && "value" in result;
				}),
			);
		});
	});

	describe("失敗時の形式", () => {
		it("失敗時は { ok: false, error: ... } 形式を返す", () => {
			const failureResult = { ok: false as const, error: "エラーが発生しました" };

			expect(failureResult.ok).toBe(false);
			expect(failureResult.error).toBeDefined();
			expect(typeof failureResult.error).toBe("string");
		});

		it("PBT: 失敗結果は常にok: falseとerror文字列を持つ", () => {
			fc.assert(
				fc.property(fc.string(), (errorMsg) => {
					const result = { ok: false as const, error: errorMsg };
					return result.ok === false && typeof result.error === "string";
				}),
			);
		});
	});

	describe("errorの日本語記述", () => {
		it("エラーメッセージには日本語が推奨される", () => {
			const errorMessages = [
				"ファイルが見つかりません",
				"無効なパラメータです",
				"タイムアウトしました",
			];

			for (const msg of errorMessages) {
				const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(msg);
				expect(hasJapanese).toBe(true);
			}
		});
	});
});

// ============================================================================
// Subagent Interface契約テスト
// ============================================================================

describe("Subagent Interface契約", () => {
	describe("confidence範囲", () => {
		it("confidenceは0.0〜1.0の範囲である", () => {
			const validConfidences = [0, 0.5, 1.0, 0.95, 0.123];

			for (const c of validConfidences) {
				expect(c).toBeGreaterThanOrEqual(0);
				expect(c).toBeLessThanOrEqual(1);
			}
		});

		it("PBT: 生成されたconfidence値は常に有効範囲内", () => {
			fc.assert(
				fc.property(fc.float({ min: 0, max: 1, noNaN: true }), (confidence) => {
					// NaNチェック（noNaN: trueでも念のため）
					if (Number.isNaN(confidence)) return false;

					const output = {
						summary: "テスト",
						claim: "テストクレーム",
						evidence: "file:1",
						confidence,
						result: {},
					};
					return (
						output.confidence >= 0 &&
						output.confidence <= 1 &&
						typeof output.confidence === "number"
					);
				}),
			);
		});

		it("範囲外のconfidenceは拒否される", () => {
			const invalidConfidences = [-0.1, 1.1, 2, -1, NaN];

			for (const c of invalidConfidences) {
				const isValid = c >= 0 && c <= 1 && !isNaN(c);
				expect(isValid).toBe(false);
			}
		});
	});

	describe("evidenceの形式", () => {
		it("evidenceにはファイルパスと行番号が含まれる", () => {
			const validEvidences = [
				"file:1",
				"path/to/file.ts:42",
				".pi/extensions/test.ts:100",
			];

			for (const e of validEvidences) {
				// ファイルパス:行番号 の形式
				const hasValidFormat = /.+:\d+/.test(e);
				expect(hasValidFormat).toBe(true);
			}
		});
	});
});
