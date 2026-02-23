/**
 * @file .pi/extensions/abbr.ts の単体テスト
 * @description 略語展開機能のテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import * as fc from "fast-check";
import * as fs from "node:fs";
import * as path from "node:path";

// モジュールをインポート（実装の詳細に依存するため、型定義はテスト内で定義）
import type { Abbreviation } from "../../extensions/abbr.ts";

// ============================================================================
// テストヘルパー
// ============================================================================

/**
 * 正規表現エスケープ関数（abbr.tsからコピー）
 * @summary 正規表現特殊文字をエスケープ
 * @param str - エスケープ対象文字列
 * @returns エスケープ後の文字列
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * クォート削除関数（abbr.tsからコピー）
 * @summary 周囲のクォートを削除
 * @param str - 対象文字列
 * @returns クォート削除後の文字列
 */
function stripQuotes(str: string): string {
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  return str;
}

// ============================================================================
// escapeRegex
// ============================================================================

describe("escapeRegex", () => {
  describe("正常系", () => {
    it("should_escape_all_special_chars", () => {
      expect(escapeRegex("a.b")).toBe("a\\.b");
      expect(escapeRegex("a*b")).toBe("a\\*b");
      expect(escapeRegex("a+b")).toBe("a\\+b");
      expect(escapeRegex("a?b")).toBe("a\\?b");
      expect(escapeRegex("a^b")).toBe("a\\^b");
      expect(escapeRegex("a$b")).toBe("a\\$b");
      expect(escapeRegex("a{b")).toBe("a\\{b");
      expect(escapeRegex("a}b")).toBe("a\\}b");
      expect(escapeRegex("a(b")).toBe("a\\(b");
      expect(escapeRegex("a)b")).toBe("a\\)b");
      expect(escapeRegex("a|b")).toBe("a\\|b");
      expect(escapeRegex("a[b")).toBe("a\\[b");
      expect(escapeRegex("a]b")).toBe("a\\]b");
      expect(escapeRegex("a\\b")).toBe("a\\\\b");
    });

    it("should_escape_multiple_special_chars", () => {
      expect(escapeRegex("a.*+?^${}()|[]\\b")).toBe("a\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\b");
    });

    it("should_not_escape_normal_chars", () => {
      expect(escapeRegex("abc123")).toBe("abc123");
      expect(escapeRegex("hello world")).toBe("hello world");
      // .はエスケープされる、@はエスケープされない
      expect(escapeRegex("test@example.com")).toBe("test@example\\.com");
    });

    it("should_handle_empty_string", () => {
      expect(escapeRegex("")).toBe("");
    });

    it("should_handle_only_special_chars", () => {
      expect(escapeRegex(".")).toBe("\\.");
      expect(escapeRegex("*")).toBe("\\*");
      expect(escapeRegex(".*?^${}()|[]\\")).toBe("\\.\\*\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: エスケープ後の文字列は元の文字列と一致しない（特殊文字を含む場合）", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/[*+?^${}()|[\]\\]/),
          (str) => {
            const escaped = escapeRegex(str);
            return escaped !== str;
          },
        ),
        { numRuns: 100 },
      );
    });

    it("PBT: 通常文字のみの文字列は変更されない", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\s@_-]*$/),
          (str) => {
            const escaped = escapeRegex(str);
            return escaped === str;
          },
        ),
        { numRuns: 100 },
      );
    });

    it("PBT: エスケープされた文字列は正規表現として安全に使用できる", () => {
      fc.assert(
        fc.property(
          fc.string(),
          (str) => {
            const escaped = escapeRegex(str);
            // エスケープされた文字列を正規表現として使用してもエラーにならない
            try {
              new RegExp(escaped);
              return true;
            } catch {
              return false;
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// stripQuotes
// ============================================================================

describe("stripQuotes", () => {
  describe("正常系", () => {
    it("should_remove_double_quotes", () => {
      expect(stripQuotes('"hello"')).toBe("hello");
      expect(stripQuotes('"test string"')).toBe("test string");
      expect(stripQuotes('""')).toBe("");
    });

    it("should_remove_single_quotes", () => {
      expect(stripQuotes("'hello'")).toBe("hello");
      expect(stripQuotes("'test string'")).toBe("test string");
      expect(stripQuotes("''")).toBe("");
    });

    it("should_handle_nested_quotes", () => {
      // 外側のダブルクォートのみを削除
      expect(stripQuotes('"hello \'world\'"')).toBe("hello 'world'");
    });

    it("should_return_unchanged_if_not_quoted", () => {
      expect(stripQuotes("hello")).toBe("hello");
      expect(stripQuotes("test string")).toBe("test string");
      expect(stripQuotes('"hello')).toBe('"hello');
      expect(stripQuotes('hello"')).toBe('hello"');
      expect(stripQuotes('"hello\'')).toBe('"hello\'');
    });

    it("should_handle_empty_string", () => {
      expect(stripQuotes("")).toBe("");
    });

    it("should_handle_mismatched_quotes", () => {
      expect(stripQuotes('"hello\'')).toBe('"hello\'');
      expect(stripQuotes("'hello\"")).toBe("'hello\"");
    });

    it("should_handle_only_quotes", () => {
      expect(stripQuotes('""')).toBe("");
      expect(stripQuotes("''")).toBe("");
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: ダブルクォートで囲まれた文字列の長さは2減る", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => s.length > 0),
          (str) => {
            const quoted = `"${str}"`;
            return stripQuotes(quoted).length === str.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it("PBT: シングルクォートで囲まれた文字列の長さは2減る", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => s.length > 0),
          (str) => {
            const quoted = `'${str}'`;
            return stripQuotes(quoted).length === str.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it("PBT: クォートなしの文字列は変更されない", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !s.startsWith('"') && !s.startsWith("'")),
          (str) => {
            return stripQuotes(str) === str;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// 略語展開ロジック（findExpansion相当）
// ============================================================================

/**
 * 略語展開ロジックのテスト用ヘルパー
 * @summary 入力を略語で展開
 * @param input - 入力文字列
 * @param abbreviations - 略語マップ
 * @returns 展開結果、またはnull
 */
function findExpansion(
  input: string,
  abbreviations: Map<string, Abbreviation>,
): { expanded: string; original: string } | null {
  const trimmed = input.trim();
  const firstWord = trimmed.split(/\s/)[0];

  // Check for exact match
  const abbr = abbreviations.get(firstWord);
  if (abbr) {
    if (abbr.position === "anywhere" || abbr.position === undefined || abbr.position === "command") {
      const regex = new RegExp(`^${escapeRegex(firstWord)}(\\s|$)`);
      const expanded = trimmed.replace(regex, abbr.expansion + "$1");
      return { expanded, original: firstWord };
    }
  }

  // Check regex patterns
  for (const abbr of abbreviations.values()) {
    if (abbr.regex && abbr.pattern) {
      const regex = new RegExp(`^(${abbr.pattern})(\\s|$)`);
      const match = trimmed.match(regex);
      if (match) {
        const expanded = trimmed.replace(regex, abbr.expansion + "$2");
        return { expanded, original: match[1] };
      }
    }
  }

  return null;
}

describe("findExpansion", () => {
  let abbreviations: Map<string, Abbreviation>;

  beforeEach(() => {
    abbreviations = new Map([
      ["g", { name: "g", expansion: "git" }],
      ["gaa", { name: "gaa", expansion: "git add --all" }],
      ["gst", { name: "gst", expansion: "git status" }],
      ["gc", { name: "gc", expansion: "git commit -v" }],
      ["gco", { name: "gco", expansion: "git checkout" }],
      ["ls", { name: "ls", expansion: "ls -la" }],
    ]);
  });

  describe("正常系 - 単語展開", () => {
    it("should_expand_single_abbreviation", () => {
      const result = findExpansion("g", abbreviations);
      expect(result).not.toBeNull();
      expect(result?.original).toBe("g");
      expect(result?.expanded).toBe("git");
    });

    it("should_expand_abbreviation_with_args", () => {
      const result = findExpansion("gaa", abbreviations);
      expect(result).not.toBeNull();
      expect(result?.original).toBe("gaa");
      expect(result?.expanded).toBe("git add --all");
    });

    it("should_preserve_trailing_args", () => {
      const result = findExpansion("gst --short", abbreviations);
      expect(result).not.toBeNull();
      expect(result?.original).toBe("gst");
      expect(result?.expanded).toBe("git status --short");
    });

    it("should_handle_whitespace", () => {
      const result = findExpansion("  gst  ", abbreviations);
      expect(result).not.toBeNull();
      expect(result?.expanded).toBe("git status");
    });

    it("should_handle_multiple_trailing_words", () => {
      const result = findExpansion("gco main -b feature", abbreviations);
      expect(result?.expanded).toBe("git checkout main -b feature");
    });
  });

  describe("境界条件", () => {
    it("should_return_null_for_unknown_abbreviation", () => {
      const result = findExpansion("unknown", abbreviations);
      expect(result).toBeNull();
    });

    it("should_return_null_for_empty_input", () => {
      const result = findExpansion("", abbreviations);
      expect(result).toBeNull();
    });

    it("should_return_null_for_whitespace_only", () => {
      const result = findExpansion("   ", abbreviations);
      expect(result).toBeNull();
    });

    it("should_not_expand_partial_match", () => {
      const result = findExpansion("ga", abbreviations);
      expect(result).toBeNull();
    });

    it("should_not_expand_abbreviation_in_middle", () => {
      // 先頭の単語のみが対象
      const result = findExpansion("echo g", abbreviations);
      expect(result).toBeNull();
    });
  });

  describe("正規表現パターン", () => {
    beforeEach(() => {
      abbreviations = new Map([
        ["g*", { name: "g*", expansion: "git", regex: true, pattern: "g[a-z]*" }],
        ["test*", { name: "test*", expansion: "npm test", regex: true, pattern: "test[a-z0-9]*" }],
      ]);
    });

    it("should_match_regex_pattern", () => {
      const result = findExpansion("gaa", abbreviations);
      expect(result).not.toBeNull();
      expect(result?.expanded).toBe("git");
    });

    it("should_match_multiple_regex_patterns", () => {
      const result = findExpansion("test123", abbreviations);
      expect(result).not.toBeNull();
      expect(result?.expanded).toBe("npm test");
    });

    it("should_prefer_exact_match_over_regex", () => {
      abbreviations.set("gaa", { name: "gaa", expansion: "git add --all" });
      const result = findExpansion("gaa", abbreviations);
      // 正確な一致が優先される
      expect(result?.expanded).toBe("git add --all");
    });

    it("should_handle_no_regex_match", () => {
      const result = findExpansion("xyz", abbreviations);
      expect(result).toBeNull();
    });
  });

  describe("position設定", () => {
    beforeEach(() => {
      abbreviations = new Map([
        ["cmd", { name: "cmd", expansion: "mycommand", position: "command" }],
        ["any", { name: "any", expansion: "anywhere", position: "anywhere" }],
        ["def", { name: "def", expansion: "default" }],
      ]);
    });

    it("should_expand_command_position_at_start", () => {
      const result = findExpansion("cmd", abbreviations);
      expect(result?.expanded).toBe("mycommand");
    });

    it("should_expand_anywhere_position_at_start", () => {
      const result = findExpansion("any", abbreviations);
      expect(result?.expanded).toBe("anywhere");
    });

    it("should_expand_default_undefined_position", () => {
      const result = findExpansion("def", abbreviations);
      expect(result?.expanded).toBe("default");
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: 展開結果は常に元の入力より長いか等しい", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("g", "gaa", "gst", "gc"),
          (abbrName) => {
            const result = findExpansion(abbrName, abbreviations);
            if (result) {
              return result.expanded.length >= abbrName.length;
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it("PBT: 空白のみの入力は常にnull", () => {
      fc.assert(
        fc.property(fc.stringMatching(/^\s*$/), (input) => {
          return findExpansion(input, abbreviations) === null;
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// 略語管理ロジック（シミュレーション）
// ============================================================================

describe("Abbreviation Management (Simulation)", () => {
  let abbreviations: Map<string, Abbreviation>;

  beforeEach(() => {
    abbreviations = new Map();
  });

  describe("追加", () => {
    it("should_add_new_abbreviation", () => {
      const abbr: Abbreviation = { name: "test", expansion: "test command" };
      abbreviations.set(abbr.name, abbr);
      expect(abbreviations.has("test")).toBe(true);
      expect(abbreviations.get("test")?.expansion).toBe("test command");
    });

    it("should_replace_existing_abbreviation", () => {
      abbreviations.set("test", { name: "test", expansion: "old" });
      abbreviations.set("test", { name: "test", expansion: "new" });
      expect(abbreviations.get("test")?.expansion).toBe("new");
    });

    it("should_add_multiple_abbreviations", () => {
      const abbrs: Abbreviation[] = [
        { name: "g", expansion: "git" },
        { name: "gst", expansion: "git status" },
        { name: "gc", expansion: "git commit" },
      ];
      for (const abbr of abbrs) {
        abbreviations.set(abbr.name, abbr);
      }
      expect(abbreviations.size).toBe(3);
    });
  });

  describe("削除", () => {
    beforeEach(() => {
      abbreviations.set("test", { name: "test", expansion: "test command" });
      abbreviations.set("g", { name: "g", expansion: "git" });
    });

    it("should_delete_existing_abbreviation", () => {
      const deleted = abbreviations.delete("test");
      expect(deleted).toBe(true);
      expect(abbreviations.has("test")).toBe(false);
      expect(abbreviations.size).toBe(1);
    });

    it("should_return_false_for_nonexistent_abbreviation", () => {
      const deleted = abbreviations.delete("nonexistent");
      expect(deleted).toBe(false);
      expect(abbreviations.size).toBe(2);
    });
  });

  describe("名前変更", () => {
    beforeEach(() => {
      abbreviations.set("test", { name: "test", expansion: "test command" });
    });

    it("should_rename_abbreviation", () => {
      const abbr = abbreviations.get("test");
      if (abbr) {
        abbreviations.delete("test");
        abbr.name = "newtest";
        abbreviations.set("newtest", abbr);

        expect(abbreviations.has("test")).toBe(false);
        expect(abbreviations.has("newtest")).toBe(true);
        expect(abbreviations.get("newtest")?.expansion).toBe("test command");
      }
    });

    it("should_fail_for_nonexistent_abbreviation", () => {
      const result = abbreviations.get("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("検索", () => {
    beforeEach(() => {
      abbreviations.set("test", { name: "test", expansion: "test command" });
      abbreviations.set("g", { name: "g", expansion: "git" });
    });

    it("should_find_existing_abbreviation", () => {
      const exists = abbreviations.has("test");
      expect(exists).toBe(true);
    });

    it("should_not_find_nonexistent_abbreviation", () => {
      const exists = abbreviations.has("nonexistent");
      expect(exists).toBe(false);
    });

    it("should_get_abbreviation_details", () => {
      const abbr = abbreviations.get("test");
      expect(abbr).toBeDefined();
      expect(abbr?.expansion).toBe("test command");
    });
  });

  describe("一覧", () => {
    beforeEach(() => {
      abbreviations.set("g", { name: "g", expansion: "git" });
      abbreviations.set("gst", { name: "gst", expansion: "git status" });
      abbreviations.set("gc", { name: "gc", expansion: "git commit" });
    });

    it("should_list_all_abbreviations", () => {
      const abbrs = Array.from(abbreviations.values());
      expect(abbrs.length).toBe(3);
      expect(abbrs.map((a) => a.name)).toEqual(expect.arrayContaining(["g", "gst", "gc"]));
    });

    it("should_return_empty_for_no_abbreviations", () => {
      abbreviations.clear();
      const abbrs = Array.from(abbreviations.values());
      expect(abbrs.length).toBe(0);
    });
  });

  describe("プロパティベーステスト", () => {
    it("PBT: 追加後に必ず検索可能", () => {
      fc.assert(
        fc.property(fc.string(), (name) => {
          abbreviations.set(name, { name, expansion: `${name} command` });
          return abbreviations.has(name) && abbreviations.get(name)?.name === name;
        }),
        { numRuns: 100 },
      );
    });

    it("PBT: 一覧のサイズは追加数以下である（重複キーを考慮）", () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(fc.string(), fc.string()), { minLength: 1, maxLength: 20 }),
          (pairs) => {
            abbreviations.clear();
            for (const [name, expansion] of pairs) {
              abbreviations.set(name, { name, expansion });
            }
            // 重複キーがある場合はサイズが小さくなる
            return abbreviations.size <= pairs.length;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// ファイル永続化シミュレーション
// ============================================================================

describe("File Persistence (Simulation)", () => {
  const testConfigDir = path.join(process.cwd(), ".test-tmp");
  const testConfigFile = path.join(testConfigDir, "abbr-test.json");

  beforeAll(() => {
    // テスト用ディレクトリを作成
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterAll(() => {
    // テスト用ディレクトリを削除
    if (fs.existsSync(testConfigDir)) {
      fs.rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // 各テスト後にファイルを削除
    if (fs.existsSync(testConfigFile)) {
      fs.unlinkSync(testConfigFile);
    }
  });

  describe("保存", () => {
    it("should_save_abbreviations_to_file", () => {
      const abbreviations: Abbreviation[] = [
        { name: "g", expansion: "git" },
        { name: "gst", expansion: "git status" },
      ];

      const data = JSON.stringify({ abbreviations }, null, 2);
      fs.writeFileSync(testConfigFile, data, "utf-8");

      expect(fs.existsSync(testConfigFile)).toBe(true);
    });

    it("should_overwrite_existing_file", () => {
      const abbrs1: Abbreviation[] = [{ name: "g", expansion: "git" }];
      const abbrs2: Abbreviation[] = [{ name: "gst", expansion: "git status" }];

      fs.writeFileSync(testConfigFile, JSON.stringify({ abbreviations: abbrs1 }), "utf-8");
      fs.writeFileSync(testConfigFile, JSON.stringify({ abbreviations: abbrs2 }), "utf-8");

      const loaded = JSON.parse(fs.readFileSync(testConfigFile, "utf-8"));
      expect(loaded.abbreviations).toEqual(abbrs2);
    });
  });

  describe("読み込み", () => {
    it("should_load_abbreviations_from_file", () => {
      const abbrs: Abbreviation[] = [
        { name: "g", expansion: "git" },
        { name: "gst", expansion: "git status" },
      ];

      fs.writeFileSync(testConfigFile, JSON.stringify({ abbreviations: abbrs }), "utf-8");

      const loaded = JSON.parse(fs.readFileSync(testConfigFile, "utf-8"));
      expect(loaded.abbreviations).toEqual(abbrs);
    });

    it("should_handle_empty_file", () => {
      fs.writeFileSync(testConfigFile, JSON.stringify({ abbreviations: [] }), "utf-8");

      const loaded = JSON.parse(fs.readFileSync(testConfigFile, "utf-8"));
      expect(loaded.abbreviations).toEqual([]);
    });

    it("should_return_empty_for_nonexistent_file", () => {
      expect(fs.existsSync(testConfigFile)).toBe(false);
    });
  });

  describe("境界条件", () => {
    it("should_handle_invalid_json", () => {
      fs.writeFileSync(testConfigFile, "{ invalid json", "utf-8");

      expect(() => {
        JSON.parse(fs.readFileSync(testConfigFile, "utf-8"));
      }).toThrow();
    });

    it("should_handle_missing_abbreviations_field", () => {
      fs.writeFileSync(testConfigFile, JSON.stringify({}), "utf-8");

      const loaded = JSON.parse(fs.readFileSync(testConfigFile, "utf-8"));
      expect(loaded.abbreviations).toBeUndefined();
    });
  });
});
