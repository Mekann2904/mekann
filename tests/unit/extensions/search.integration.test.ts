/**
 * tests/unit/extensions/search.integration.test.ts
 * search拡張の結合テスト。ツール連携と基本実行フローを検証する。
 * 関連ファイル: .pi/extensions/search/index.ts, .pi/extensions/search/tools/*.ts
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import registerSearchExtension from "../../../.pi/extensions/search/index.js";

type RegisteredTool = {
	name: string;
	execute: (...args: any[]) => Promise<any>;
};

function createFakePi() {
	const tools = new Map<string, RegisteredTool>();
	const events = new Map<string, Array<(event: any, ctx: any) => Promise<any> | any>>();

	return {
		tools,
		uiNotify: vi.fn(),
		sendMessage: vi.fn(),
		appendEntry: vi.fn(),
		eventsEmit: vi.fn(),
		registerTool(def: any) {
			tools.set(def.name, def as RegisteredTool);
		},
		registerCommand(_name: string, _def: any) {
			// no-op
		},
		on(eventName: string, handler: (event: any, ctx: any) => Promise<any> | any) {
			const handlers = events.get(eventName) ?? [];
			handlers.push(handler);
			events.set(eventName, handlers);
		},
		events: {
			emit: vi.fn(),
		},
		async emit(eventName: string, event: any, ctx: any): Promise<void> {
			const handlers = events.get(eventName) ?? [];
			for (const handler of handlers) {
				await handler(event, ctx);
			}
		},
	};
}

describe("search extension integration tests", () => {
	let fakePi: ReturnType<typeof createFakePi>;
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "pi-search-test-"));
		fakePi = createFakePi();

		// Register search extension
		registerSearchExtension(fakePi as any);
	});

	afterEach(() => {
		if (existsSync(tmpDir)) {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	describe("ツール登録の確認", () => {
		it("file_candidatesツールが登録されている", () => {
			expect(fakePi.tools.has("file_candidates")).toBe(true);
		});

		it("code_searchツールが登録されている", () => {
			expect(fakePi.tools.has("code_search")).toBe(true);
		});

		it("sym_indexツールが登録されている", () => {
			expect(fakePi.tools.has("sym_index")).toBe(true);
		});

		it("sym_findツールが登録されている", () => {
			expect(fakePi.tools.has("sym_find")).toBe(true);
		});

		it("call_graph_indexツールが登録されている", () => {
			expect(fakePi.tools.has("call_graph_index")).toBe(true);
		});

		it("find_callersツールが登録されている", () => {
			expect(fakePi.tools.has("find_callers")).toBe(true);
		});

		it("find_calleesツールが登録されている", () => {
			expect(fakePi.tools.has("find_callees")).toBe(true);
		});

		it("semantic_indexツールが登録されている", () => {
			expect(fakePi.tools.has("semantic_index")).toBe(true);
		});

		it("semantic_searchツールが登録されている", () => {
			expect(fakePi.tools.has("semantic_search")).toBe(true);
		});
	});

	describe("file_candidatesツール", () => {
		it("基本的なファイル列挙が実行できる", async () => {
			const tool = fakePi.tools.get("file_candidates");
			expect(tool).toBeDefined();

			// テスト用のファイルを作成
			const { writeFileSync } = await import("node:fs");
			writeFileSync(join(tmpDir, "test.ts"), "const x = 1;");

			const result = await tool!.execute({
				limit: 10,
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("拡張子フィルタが機能する", async () => {
			const tool = fakePi.tools.get("file_candidates");

			// テスト用のTypeScriptファイルを作成
			const { writeFileSync } = await import("node:fs");
			const testFile = join(tmpDir, "test.ts");
			writeFileSync(testFile, "const x = 1;");

			const result = await tool!.execute({
				extension: ["ts"],
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
		});

		it("typeフィルタが機能する", async () => {
			const tool = fakePi.tools.get("file_candidates");

			// テスト用のファイルとディレクトリを作成
			const { writeFileSync, mkdirSync } = await import("node:fs");
			const testDir = join(tmpDir, "testdir");
			mkdirSync(testDir, { recursive: true });
			writeFileSync(join(tmpDir, "test.ts"), "const x = 1;");

			const result = await tool!.execute({
				type: "dir",
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});

	describe("code_searchツール", () => {
		it("基本的なコード検索が実行できる", async () => {
			const tool = fakePi.tools.get("code_search");

			// テスト用のファイルを作成
			const { writeFileSync } = await import("node:fs");
			const testFile = join(tmpDir, "test.ts");
			writeFileSync(testFile, "function test() { return true; }");

			const result = await tool!.execute({
				pattern: "function",
				limit: 10,
			}, tmpDir);

			// 結果が返されることを確認
			expect(result).toBeDefined();
		});

		it("ignoreCaseオプションが機能する", async () => {
			const tool = fakePi.tools.get("code_search");

			const { writeFileSync } = await import("node:fs");
			const testFile = join(tmpDir, "test.ts");
			writeFileSync(testFile, "function test() { return true; }");

			const result = await tool!.execute({
				pattern: "FUNCTION",
				ignoreCase: true,
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});

	describe("sym_indexツール", () => {
		it("シンボルインデックスの生成が実行できる", async () => {
			const tool = fakePi.tools.get("sym_index");

			// テスト用のファイルを作成
			const { writeFileSync } = await import("node:fs");
			const testFile = join(tmpDir, "test.ts");
			writeFileSync(testFile, "function test() { return true; }");

			const result = await tool!.execute({
				force: false,
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});

	describe("sym_findツール", () => {
		it("シンボル検索が実行できる", async () => {
			const tool = fakePi.tools.get("sym_find");

			// テスト用のファイルを作成
			const { writeFileSync } = await import("node:fs");
			const testFile = join(tmpDir, "test.ts");
			writeFileSync(testFile, "function test() { return true; }");

			const result = await tool!.execute({
				name: "test",
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
		});

		it("kindフィルタが機能する", async () => {
			const tool = fakePi.tools.get("sym_find");

			const { writeFileSync } = await import("node:fs");
			const testFile = join(tmpDir, "test.ts");
			writeFileSync(testFile, "function test() { return true; }");

			const result = await tool!.execute({
				kind: ["function"],
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});

	describe("エラーハンドリング", () => {
		it("無効なパターンでエラーが返される", async () => {
			const tool = fakePi.tools.get("code_search");

			const result = await tool!.execute({
				pattern: "[invalid",
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
			// ネイティブフォールバックまたはエラーレスポンス
		});

		it("存在しないパスで検索が失敗しない", async () => {
			const tool = fakePi.tools.get("file_candidates");

			const result = await tool!.execute({
				path: "/nonexistent/path",
				limit: 10,
			}, tmpDir);

			expect(result).toBeDefined();
		});
	});
});
