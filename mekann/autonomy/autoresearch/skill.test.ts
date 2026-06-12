/**
 * autoresearch/skill.test.ts — skill と package.json の検証テスト。
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const MEKANN_ROOT = path.join(ROOT, "mekann");

// ---------------------------------------------------------------------------
// SKILL.md 検証
// ---------------------------------------------------------------------------

describe("skills/autoresearch-create/SKILL.md", () => {
	const skillDir = path.join(MEKANN_ROOT, "skills", "autoresearch-create");
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

	it("frontmatter に disable-model-invocation: true がある", () => {
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		expect(match).toBeTruthy();
		const frontmatter = match![1];
		expect(frontmatter).toContain("disable-model-invocation: true");
	});

	it("モード無効なら開始しない旨が冒頭に記載されている", () => {
		const body = content.replace(/^---[\s\S]*?---\n/, "");
		expect(body).toContain("モードが無効な場合は実験を開始しない");
	});

	it("skill のセットアップ手順に /autoresearch on の実行指示がない", () => {
		const setupSection = content.match(/## セットアップ手順[\s\S]*?(?=## )/);
		expect(setupSection).toBeTruthy();
		// 前提説明には /autoresearch on が言及されるが、手順番号の中にはない
		const steps = setupSection![0];
		// 手順番号付きの行に /autoresearch on が含まれていないこと
		const numberedLines = steps.split("\n").filter((l) => /^\d+\./.test(l.trim()));
		for (const line of numberedLines) {
			expect(line).not.toContain("/autoresearch on");
		}
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

	it("pi.skills に ./mekann/skills が含まれる", () => {
		expect(pkg.pi).toBeDefined();
		expect(pkg.pi.skills).toBeDefined();
		expect(pkg.pi.skills).toContain("./mekann/skills");
	});

	it("pi.extensions に統合 wrapper ./mekann が含まれる", () => {
		expect(pkg.pi.extensions).toContain("./mekann");
	});

	it("package.json が valid JSON", () => {
		// 既に JSON.parse が成功しているので実質的に検証済み
		expect(typeof pkg).toBe("object");
		expect(pkg.name).toBe("@mekann/pi-extensions");
	});
});
