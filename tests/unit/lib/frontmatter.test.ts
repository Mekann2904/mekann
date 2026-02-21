/**
 * frontmatter.tsの単体テスト
 * テスト対象: parseFrontmatter関数
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { parseFrontmatter } from "@lib/frontmatter";

describe("frontmatter.ts - parseFrontmatter", () => {
  describe("正常ケース", () => {
    it("有効なYAML frontmatterとbodyを正しく解析する", () => {
      const content = `---
title: テスト
tags: [test, example]
---

本文`;
      const result = parseFrontmatter<{ title: string; tags: string[] }>(content);
      expect(result.frontmatter).toEqual({ title: "テスト", tags: ["test", "example"] });
      expect(result.body).toBe("本文");
    });

    it("空のfrontmatterを正しく解析する", () => {
      const content = `---
---

本文`;
      const result = parseFrontmatter<Record<string, unknown>>(content);
      expect(result.frontmatter).toEqual({});
      // 空のfrontmatterマーカーも含めてbodyとして返される
      expect(result.body).toBe("---\n---\n\n本文");
    });

    it("frontmatterがない場合は空オブジェクトを返す", () => {
      const content = "本文のみ";
      const result = parseFrontmatter<Record<string, unknown>>(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("本文のみ");
    });

    it("複雑なYAML構造を解析する", () => {
      const content = `---
title: 複雑なテスト
tags:
  - tag1
  - tag2
nested:
  key: value
  number: 123
---

本文`;
      const result = parseFrontmatter<{
        title: string;
        tags: string[];
        nested: { key: string; number: number };
      }>(content);
      expect(result.frontmatter.title).toBe("複雑なテスト");
      expect(result.frontmatter.tags).toEqual(["tag1", "tag2"]);
      expect(result.frontmatter.nested.key).toBe("value");
      expect(result.frontmatter.nested.number).toBe(123);
      expect(result.body).toBe("本文");
    });

    it("bodyが空の場合も正しく処理する", () => {
      const content = `---
title: テスト
---`;
      const result = parseFrontmatter<{ title: string }>(content);
      expect(result.frontmatter).toEqual({ title: "テスト" });
      expect(result.body).toBe("");
    });
  });

  describe("エッジケース", () => {
    it("空文字列を渡した場合は空オブジェクトを返す", () => {
      const result = parseFrontmatter<Record<string, unknown>>("");
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("");
    });

    it("nullを渡した場合は空オブジェクトを返す", () => {
      const result = parseFrontmatter<Record<string, unknown>>(null as unknown as string);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("");
    });

    it("undefinedを渡した場合は空オブジェクトを返す", () => {
      const result = parseFrontmatter<Record<string, unknown>>(undefined as unknown as string);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("");
    });

    it("不正なYAML構文の場合は空オブジェクトを返す", () => {
      const content = `---
title: [unclosed bracket

本文`;
      const result = parseFrontmatter<{ title: string }>(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
    });

    it("frontmatterが配列の場合は空オブジェクトを返す", () => {
      const content = `---
- item1
- item2
---

本文`;
      const result = parseFrontmatter<Record<string, unknown>>(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("本文");
    });

    it("frontmatterが文字列の場合は空オブジェクトを返す", () => {
      const content = `---
just a string
---

本文`;
      const result = parseFrontmatter<Record<string, unknown>>(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe("本文");
    });

    it("閉じタグがない場合は全文をbodyとして返す", () => {
      const content = `---
title: テスト
本文`;
      const result = parseFrontmatter<Record<string, unknown>>(content);
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
    });

    it("改行コードがCRLFの場合も正しく解析する", () => {
      const content = "---\r\ntitle: テスト\r\n---\r\n本文";
      const result = parseFrontmatter<{ title: string }>(content);
      expect(result.frontmatter).toEqual({ title: "テスト" });
      expect(result.body).toBe("本文");
    });
  });

  describe("プロパティベーステスト", () => {
    it("任意の有効な入力で常に有効なオブジェクトを返す", () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const result = parseFrontmatter<Record<string, unknown>>(content);
          expect(result).toHaveProperty("frontmatter");
          expect(result).toHaveProperty("body");
          expect(typeof result.frontmatter).toBe("object");
          expect(Array.isArray(result.frontmatter)).toBe(false);
          expect(typeof result.body).toBe("string");
        })
      );
    });

    it("frontmatterが解析された場合、bodyはfrontmatterを含まない", () => {
      fc.assert(
        fc.property(fc.string(), (content) => {
          const result = parseFrontmatter<Record<string, unknown>>(content);
          // bodyにfrontmatterマーカーが含まれていないことを確認
          expect(result.body).not.toMatch(/^---\s*$/);
          expect(result.body).not.toMatch(/^---/);
        })
      );
    });
  });

  describe("実用的なシナリオ", () => {
    it("ドキュメントテンプレートのfrontmatterを解析する", () => {
      const content = `---
title: ページタイトル
category: getting-started
audience: new-user
last_updated: 2026-02-21
tags: [test, example]
related: [doc1, doc2]
---

# 本文の見出し

本文の内容。`;
      const result = parseFrontmatter<{
        title: string;
        category: string;
        audience: string;
        last_updated: string;
        tags: string[];
        related: string[];
      }>(content);
      expect(result.frontmatter.title).toBe("ページタイトル");
      expect(result.frontmatter.category).toBe("getting-started");
      expect(result.frontmatter.audience).toBe("new-user");
      expect(result.frontmatter.last_updated).toBe("2026-02-21");
      expect(result.frontmatter.tags).toEqual(["test", "example"]);
      expect(result.frontmatter.related).toEqual(["doc1", "doc2"]);
      expect(result.body).toContain("# 本文の見出し");
      expect(result.body).toContain("本文の内容。");
    });

    it("team定義のfrontmatterを解析する", () => {
      const content = `---
id: test-team
name: Test Team
description: A test team
enabled: true
---

Team content here.`;
      const result = parseFrontmatter<{
        id: string;
        name: string;
        description: string;
        enabled: boolean;
      }>(content);
      expect(result.frontmatter.id).toBe("test-team");
      expect(result.frontmatter.name).toBe("Test Team");
      expect(result.frontmatter.description).toBe("A test team");
      expect(result.frontmatter.enabled).toBe(true);
      expect(result.body).toBe("Team content here.");
    });

    it("スキル定義のfrontmatterを解析する", () => {
      const content = `---
id: test-skill
name: Test Skill
---

Skill content here.`;
      const result = parseFrontmatter<{ id: string; name: string }>(content);
      expect(result.frontmatter.id).toBe("test-skill");
      expect(result.frontmatter.name).toBe("Test Skill");
      expect(result.body).toBe("Skill content here.");
    });
  });
});
