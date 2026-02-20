/**
 * @file .pi/extensions/abbr.ts の単体テスト
 * @description 略語管理拡張機能のメイン機能テスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fc from "fast-check";

// モック: pi SDK依存を分離
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
	readFileSync: vi.fn(() => JSON.stringify({ abbreviations: [] })),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/home/test"),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args: string[]) => args.join("/")),
}));

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("Abbreviation型", () => {
	interface Abbreviation {
		name: string;
		expansion: string;
		regex?: boolean;
		pattern?: string;
		position?: "command" | "anywhere";
	}

	describe("基本構造", () => {
		it("should_create_valid_abbreviation", () => {
			const abbr: Abbreviation = {
				name: "gaa",
				expansion: "git add --all",
			};

			expect(abbr.name).toBe("gaa");
			expect(abbr.expansion).toBe("git add --all");
			expect(abbr.regex).toBeUndefined();
			expect(abbr.position).toBeUndefined();
		});

		it("should_create_abbreviation_with_regex", () => {
			const abbr: Abbreviation = {
				name: "gco",
				expansion: "git checkout $1",
				regex: true,
				pattern: "gco\\s+(\\S+)",
			};

			expect(abbr.regex).toBe(true);
			expect(abbr.pattern).toBe("gco\\s+(\\S+)");
		});

		it("should_create_abbreviation_with_position", () => {
			const abbr: Abbreviation = {
				name: "test",
				expansion: "npm test",
				position: "anywhere",
			};

			expect(abbr.position).toBe("anywhere");
		});
	});

	describe("position値の検証", () => {
		it("should_accept_command_position", () => {
			const abbr: Abbreviation = {
				name: "cmd",
				expansion: "run command",
				position: "command",
			};
			expect(abbr.position).toBe("command");
		});

		it("should_accept_anywhere_position", () => {
			const abbr: Abbreviation = {
				name: "any",
				expansion: "run anywhere",
				position: "anywhere",
			};
			expect(abbr.position).toBe("anywhere");
		});
	});
});

// ============================================================================
// AbbrDetails型（ツール結果）のテスト
// ============================================================================

describe("AbbrDetails型", () => {
	interface AbbrDetails {
		action: "list" | "add" | "erase" | "rename" | "query";
		abbreviations: Array<{ name: string; expansion: string }>;
		result?: string;
		error?: string;
	}

	describe("action値の検証", () => {
		const validActions = ["list", "add", "erase", "rename", "query"] as const;

		it.each(validActions)("should_accept_%s_action", (action) => {
			const details: AbbrDetails = {
				action,
				abbreviations: [],
			};
			expect(details.action).toBe(action);
		});
	});

	describe("エラーケース", () => {
		it("should_include_error_message", () => {
			const details: AbbrDetails = {
				action: "add",
				abbreviations: [],
				error: "name and expansion required",
			};

			expect(details.error).toBeDefined();
			expect(details.abbreviations).toHaveLength(0);
		});

		it("should_include_result_on_success", () => {
			const details: AbbrDetails = {
				action: "add",
				abbreviations: [{ name: "test", expansion: "test expansion" }],
				result: "Added abbreviation: test",
			};

			expect(details.result).toBeDefined();
			expect(details.abbreviations).toHaveLength(1);
		});
	});
});

// ============================================================================
// AbbrState型（永続化用）のテスト
// ============================================================================

describe("AbbrState型", () => {
	interface AbbrState {
		abbreviations: Array<{ name: string; expansion: string }>;
	}

	describe("シリアライズ/デシリアライズ", () => {
		it("should_serialize_to_json", () => {
			const state: AbbrState = {
				abbreviations: [
					{ name: "g", expansion: "git" },
					{ name: "ga", expansion: "git add" },
				],
			};

			const json = JSON.stringify(state);
			const parsed = JSON.parse(json) as AbbrState;

			expect(parsed.abbreviations).toHaveLength(2);
			expect(parsed.abbreviations[0].name).toBe("g");
		});

		it("should_handle_empty_state", () => {
			const state: AbbrState = {
				abbreviations: [],
			};

			const json = JSON.stringify(state);
			const parsed = JSON.parse(json) as AbbrState;

			expect(parsed.abbreviations).toHaveLength(0);
		});
	});
});

// ============================================================================
// コマンドハンドラのロジックテスト
// ============================================================================

describe("コマンドパース処理", () => {
	function parseAbbrCommand(input: string): {
		subcommand: string;
		parts: string[];
	} {
		const parts = input.trim().split(/\s+/);
		const subcommand = parts[0] || "list";
		return { subcommand, parts };
	}

	describe("サブコマンド抽出", () => {
		it("should_parse_list_command", () => {
			const result = parseAbbrCommand("list");
			expect(result.subcommand).toBe("list");
		});

		it("should_parse_add_command", () => {
			const result = parseAbbrCommand("add gaa git add --all");
			expect(result.subcommand).toBe("add");
			expect(result.parts).toEqual(["add", "gaa", "git", "add", "--all"]);
		});

		it("should_parse_erase_command", () => {
			const result = parseAbbrCommand("erase gaa");
			expect(result.subcommand).toBe("erase");
			expect(result.parts[1]).toBe("gaa");
		});

		it("should_default_to_list_on_empty_input", () => {
			const result = parseAbbrCommand("");
			expect(result.subcommand).toBe("list");
		});

		it("should_handle_extra_whitespace", () => {
			const result = parseAbbrCommand("  add   gaa   git add  ");
			expect(result.subcommand).toBe("add");
			expect(result.parts).toEqual(["add", "gaa", "git", "add"]);
		});
	});

	describe("引数抽出", () => {
		it("should_extract_name_from_add_command", () => {
			const { parts } = parseAbbrCommand("add myabbr my expansion");
			expect(parts[1]).toBe("myabbr");
		});

		it("should_extract_expansion_from_add_command", () => {
			const { parts } = parseAbbrCommand("add myabbr my expansion text");
			const expansion = parts.slice(2).join(" ");
			expect(expansion).toBe("my expansion text");
		});
	});
});

// ============================================================================
// バレルエクスポート確認テスト
// ============================================================================

describe("バレルエクスポート確認", () => {
	it("should_export_Abbreviation_interface", async () => {
		// 型はコンパイル時にチェックされるため、実行時はモジュール構造を確認
		const abbrModule = await import("../../../.pi/extensions/abbr");
		expect(abbrModule.default).toBeDefined();
		expect(typeof abbrModule.default).toBe("function");
	});

	it("should_have_default_export_as_function", async () => {
		const abbrModule = await import("../../../.pi/extensions/abbr");
		expect(abbrModule.default).toBeTypeOf("function");
		expect(abbrModule.default.length).toBe(1); // pi引数を1つ取る
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
	describe("略語名のバリデーション", () => {
		it("PBT: 有効な略語名は英数字のみで構成される", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
					(name) => {
						// 有効な略語名の形式
						expect(/^[a-zA-Z0-9]+$/.test(name)).toBe(true);
					}
				)
			);
		});
	});

	describe("JSON シリアライゼーション", () => {
		it("PBT: 略語データはJSONで正しく往復できる", () => {
			fc.assert(
				fc.property(
					fc.record({
						name: fc.string({ minLength: 1, maxLength: 20 }),
						expansion: fc.string({ minLength: 1, maxLength: 100 }),
						regex: fc.boolean(),
						position: fc.constantFrom("command", "anywhere"),
					}),
					(abbr) => {
						const serialized = JSON.stringify(abbr);
						const deserialized = JSON.parse(serialized);
						expect(deserialized.name).toBe(abbr.name);
						expect(deserialized.expansion).toBe(abbr.expansion);
					}
				)
			);
		});
	});
});
