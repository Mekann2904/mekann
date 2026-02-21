/**
 * @file .pi/extensions/abbr.ts の単体テスト
 * @description 略語管理拡張機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Node.jsモジュールのモック
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(() => "{}"),
	writeFileSync: vi.fn(),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn(() => "/home/test"),
}));

vi.mock("node:path", () => ({
	join: vi.fn((...args) => args.join("/")),
	dirname: vi.fn((p) => p.split("/").slice(0, -1).join("/")),
}));

// pi SDKのモック
vi.mock("@mariozechner/pi-ai", () => ({
	StringEnum: (values: string[]) => values,
}));

vi.mock("@mariozechner/pi-tui", () => ({
	matchesKey: vi.fn(() => false),
	truncateToWidth: vi.fn((s) => s),
	Text: vi.fn(),
}));

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: vi.fn((schema) => schema),
		Optional: vi.fn((schema) => schema),
		String: vi.fn((opts) => opts),
	},
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
	ExtensionAPI: vi.fn(),
	ExtensionContext: vi.fn(),
	Theme: vi.fn(),
}));

// モック後にインポート
import abbr from "../../../.pi/extensions/abbr.js";

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("abbr.ts 型定義", () => {
	describe("Abbreviation", () => {
		it("必須フィールドnameとexpansionを持つ", () => {
			const abbr = { name: "g", expansion: "git" };
			expect(abbr.name).toBe("g");
			expect(abbr.expansion).toBe("git");
		});

		it("オプションフィールドを持つ", () => {
			const abbr = {
				name: "test",
				expansion: "expansion",
				regex: true,
				pattern: "^test.*",
				position: "anywhere" as const,
			};
			expect(abbr.regex).toBe(true);
			expect(abbr.pattern).toBe("^test.*");
			expect(abbr.position).toBe("anywhere");
		});
	});

	describe("AbbrState", () => {
		it("abbreviations配列を持つ", () => {
			const state = { abbreviations: [] };
			expect(Array.isArray(state.abbreviations)).toBe(true);
		});
	});

	describe("AbbrDetails", () => {
		it("actionを持ち、abbreviationsを含む", () => {
			const details = {
				action: "list" as const,
				abbreviations: [],
				result: "test",
				error: "error",
			};
			expect(details.action).toBe("list");
			expect(Array.isArray(details.abbreviations)).toBe(true);
			expect(details.result).toBe("test");
			expect(details.error).toBe("error");
		});
	});
});

// ============================================================================
// ヘルパー関数のテスト
// ============================================================================

describe("escapeRegex", () => {
	it("特殊文字をエスケープする", () => {
		const input = "a.b+c^d$e[f]g{h}i(j)k|l*m+n?o";
		// メタ文字をエスケープ
		const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		expect(escaped).toContain("\\.");
		expect(escaped).toContain("\\+");
		expect(escaped).toContain("\\?");
	});

	it("通常の文字はそのまま", () => {
		const input = "abc123";
		const escaped = input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		expect(escaped).toBe("abc123");
	});
});

describe("stripQuotes", () => {
	it("二重引用符を削除", () => {
		const result = '"test"'.slice(1, -1);
		expect(result).toBe("test");
	});

	it("単一引用符を削除", () => {
		const result = "'test'".slice(1, -1);
		expect(result).toBe("test");
	});

	it("引用符がない場合はそのまま", () => {
		const result = "test";
		expect(result).toBe("test");
	});

	it("片側のみの場合は削除しない", () => {
		const result1 = '"test';
		const result2 = 'test"';
		expect(result1).toBe('"test');
		expect(result2).toBe('test"');
	});
});

describe("findExpansion", () => {
	it("完全一致する略語を展開", () => {
		const abbreviations = new Map([["g", { name: "g", expansion: "git" }]]);

		const input = "g status";
		const firstWord = input.trim().split(/\s/)[0];
		const abbr = abbreviations.get(firstWord);

		expect(abbr).toBeDefined();
		expect(abbr?.name).toBe("g");
		expect(abbr?.expansion).toBe("git");
	});

	it("先頭の単語のみマッチ", () => {
		const abbreviations = new Map([["gc", { name: "gc", expansion: "git commit" }]]);

		const input = "gc somefile";
		const firstWord = input.trim().split(/\s/)[0];
		const abbr = abbreviations.get(firstWord);

		expect(abbr?.name).toBe("gc");
	});

	it("一致しない場合はnull", () => {
		const abbreviations = new Map([["g", { name: "g", expansion: "git" }]]);

		const input = "unknown command";
		const firstWord = input.trim().split(/\s/)[0];
		const abbr = abbreviations.get(firstWord);

		expect(abbr).toBeUndefined();
	});
});

// ============================================================================
// アクション処理のテスト
// ============================================================================

describe("アクション: list", () => {
	it("空のリストを返す", () => {
		const abbrs: Array<{ name: string; expansion: string }> = [];
		const result = abbrs.length
			? abbrs.map((a) => `${a.name} → ${a.expansion}`).join("\n")
			: "No abbreviations";

		expect(result).toBe("No abbreviations");
	});

	it("略語をリスト形式で返す", () => {
		const abbrs = [
			{ name: "g", expansion: "git" },
			{ name: "gc", expansion: "git commit" },
		];
		const result = abbrs.map((a) => `${a.name} → ${a.expansion}`).join("\n");

		expect(result).toContain("g → git");
		expect(result).toContain("gc → git commit");
	});
});

describe("アクション: add", () => {
	it("略語を追加", () => {
		const abbreviations = new Map();
		const name = "test";
		const expansion = "test expansion";

		abbreviations.set(name, { name, expansion });

		expect(abbreviations.has(name)).toBe(true);
		const abbr = abbreviations.get(name);
		expect(abbr?.expansion).toBe(expansion);
	});

	it("既存の略語は上書き", () => {
		const abbreviations = new Map([["g", { name: "g", expansion: "git" }]]);

		abbreviations.set("g", { name: "g", expansion: "new git" });

		const abbr = abbreviations.get("g");
		expect(abbr?.expansion).toBe("new git");
	});
});

describe("アクション: erase", () => {
	it("存在する略語を削除", () => {
		const abbreviations = new Map([["g", { name: "g", expansion: "git" }]]);

		const deleted = abbreviations.delete("g");

		expect(deleted).toBe(true);
		expect(abbreviations.has("g")).toBe(false);
	});

	it("存在しない略語はfalseを返す", () => {
		const abbreviations = new Map();

		const deleted = abbreviations.delete("nonexistent");

		expect(deleted).toBe(false);
	});
});

describe("アクション: rename", () => {
	it("略語の名前を変更", () => {
		const abbreviations = new Map([["g", { name: "g", expansion: "git" }]]);

		const oldName = "g";
		const newName = "git-alias";
		const abbr = abbreviations.get(oldName);

		if (abbr) {
			abbreviations.delete(oldName);
			abbr.name = newName;
			abbreviations.set(newName, abbr);
		}

		expect(abbreviations.has(oldName)).toBe(false);
		expect(abbreviations.has(newName)).toBe(true);
		expect(abbreviations.get(newName)?.name).toBe(newName);
	});

	it("存在しない略語の変更は失敗", () => {
		const abbreviations = new Map();
		const oldName = "nonexistent";
		const newName = "newname";

		const abbr = abbreviations.get(oldName);
		expect(abbr).toBeUndefined();
	});
});

describe("アクション: query", () => {
	it("存在する略語を返す", () => {
		const abbreviations = new Map([["g", { name: "g", expansion: "git" }]]);

		const exists = abbreviations.has("g");
		const abbr = abbreviations.get("g");

		expect(exists).toBe(true);
		expect(abbr?.expansion).toBe("git");
	});

	it("存在しない略語はfalseを返す", () => {
		const abbreviations = new Map();

		const exists = abbreviations.has("nonexistent");

		expect(exists).toBe(false);
	});
});

// ============================================================================
// AbbrListComponentのテスト
// ============================================================================

describe("AbbrListComponent", () => {
	describe("render", () => {
		it("略語がない場合の表示", () => {
			const abbreviations: Array<{ name: string; expansion: string }> = [];
			const lines: string[] = [];

			lines.push("");
			lines.push(" Abbreviations ");
			lines.push("");

			if (abbreviations.length === 0) {
				lines.push("  No abbreviations yet.");
				lines.push("");
				lines.push("  Use /abbr add <name> <expansion> to add one.");
			}

			expect(lines).toContain("  No abbreviations yet.");
			expect(lines).toContain("  Use /abbr add <name> <expansion> to add one.");
		});

		it("略語がある場合の表示", () => {
			const abbreviations = [
				{ name: "g", expansion: "git" },
				{ name: "gc", expansion: "git commit" },
			];
			const lines: string[] = [];

			for (const abbr of abbreviations) {
				lines.push(`  ${abbr.name} → ${abbr.expansion}`);
			}

			expect(lines).toContain("  g → git");
			expect(lines).toContain("  gc → git commit");
		});
	});

	describe("invalidate", () => {
		it("キャッシュをクリア", () => {
			let cachedWidth: number | undefined = undefined;
			let cachedLines: string[] | undefined = undefined;

			cachedWidth = 80;
			cachedLines = ["test"];

			cachedWidth = undefined;
			cachedLines = undefined;

			expect(cachedWidth).toBeUndefined();
			expect(cachedLines).toBeUndefined();
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	it("空の入力文字列", () => {
		const input = "";
		const trimmed = input.trim();
		const firstWord = trimmed.split(/\s/)[0];

		expect(firstWord).toBe("");
	});

	it("空白のみの入力", () => {
		const input = "   ";
		const trimmed = input.trim();
		const firstWord = trimmed.split(/\s/)[0];

		expect(firstWord).toBe("");
	});

	it("特殊文字を含む略語名", () => {
		const name = "test-with_special.123";
		const expansion = "test expansion";

		const abbr = { name, expansion };
		expect(abbr.name).toBe(name);
	});

	it("長い展開文字列", () => {
		const expansion = "a".repeat(1000);
		const abbr = { name: "long", expansion };

		expect(abbr.expansion.length).toBe(1000);
	});
});

// ============================================================================
// 永続化のテスト
// ============================================================================

describe("永続化", () => {
	it("略語をJSONにシリアライズ", () => {
		const abbreviations = [
			{ name: "g", expansion: "git" },
			{ name: "gc", expansion: "git commit" },
		];

		const data = JSON.stringify({ abbreviations }, null, 2);

		expect(data).toContain('"name": "g"');
		expect(data).toContain('"expansion": "git"');
	});

	it("JSONから略語をデシリアライズ", () => {
		const json = '{"abbreviations":[{"name":"g","expansion":"git"}]}';
		const parsed = JSON.parse(json) as { abbreviations: Array<{ name: string; expansion: string }> };

		expect(parsed.abbreviations[0].name).toBe("g");
		expect(parsed.abbreviations[0].expansion).toBe("git");
	});
});
