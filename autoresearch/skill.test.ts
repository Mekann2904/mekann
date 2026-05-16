/**
 * autoresearch/skill.test.ts — skill と package.json の検証テスト。
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// SKILL.md 検証
// ---------------------------------------------------------------------------

describe("skills/autoresearch-create/SKILL.md", () => {
	const skillDir = path.join(ROOT, "skills", "autoresearch-create");
	const skillPath = path.join(skillDir, "SKILL.md");

	it("ファイルが存在する", () => {
		expect(fs.existsSync(skillPath)).toBe(true);
	});

	const content = fs.readFileSync(skillPath, "utf-8");

	it("frontmatter の name が autoresearch-create", () => {
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).toBeTruthy();
		const frontmatter = match![1];
		expect(frontmatter).toContain("name: autoresearch-create");
	});

	it("frontmatter に description がある", () => {
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).toBeTruthy();
		const frontmatter = match![1];
		expect(frontmatter).toContain("description:");
	});

	it("本文に現行ツール名が含まれる", () => {
		expect(content).toContain("autoresearch_init");
		expect(content).toContain("autoresearch_run");
		expect(content).toContain("autoresearch_log");
	});

	it("旧ツール名が本文に残っていない", () => {
		expect(content).not.toContain("init_experiment");
		expect(content).not.toContain("run_experiment");
		expect(content).not.toContain("log_experiment");
	});

	it("本文が日本語で書かれている", () => {
		// ひらがな・カタカナが含まれることで日本語であることを確認
		expect(content).toMatch(/[\u3040-\u309F\u30A0-\u30FF]/);
	});

	it("ループ規則が記載されている", () => {
		expect(content).toContain("keep");
		expect(content).toContain("discard");
		expect(content).toContain("crash");
		expect(content).toContain("checks_failed");
	});

	it("autoresearch.md の作成指示がある", () => {
		expect(content).toContain("autoresearch.md");
	});

	it("autoresearch.sh の作成指示がある", () => {
		expect(content).toContain("autoresearch.sh");
	});

	it("ideas.md の言及がある", () => {
		expect(content).toContain("autoresearch.ideas.md");
	});
});

// ---------------------------------------------------------------------------
// package.json 検証
// ---------------------------------------------------------------------------

describe("package.json pi.skills", () => {
	const pkgPath = path.join(ROOT, "package.json");
	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

	it("pi.skills に ./skills が含まれる", () => {
		expect(pkg.pi).toBeDefined();
		expect(pkg.pi.skills).toBeDefined();
		expect(pkg.pi.skills).toContain("./skills");
	});

	it("pi.extensions に ./autoresearch が含まれる", () => {
		expect(pkg.pi.extensions).toContain("./autoresearch");
	});

	it("package.json が valid JSON", () => {
		// 既に JSON.parse が成功しているので実質的に検証済み
		expect(typeof pkg).toBe("object");
		expect(pkg.name).toBe("@mekann/pi-extensions");
	});
});
