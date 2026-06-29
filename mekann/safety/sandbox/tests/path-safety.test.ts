/**
 * パス安全性プリミティブのテスト。
 *
 * isProtectedPath / assertPathInsideRoot / resolveRealPaths /
 * resolveSafeRealPath / validateWorkspaceRoot を検証する。
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assertPathInsideRoot, isProtectedPath, resolveRealPaths } from "../permissions.js";

describe("isProtectedPath", () => {
	it(".git 配下を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.git/hooks/pre-commit")).toBe(true);
		expect(isProtectedPath("/tmp/project/.git")).toBe(true);
	});

	it(".codex 配下を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.codex/config")).toBe(true);
	});

	it(".agents 配下を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.agents/state")).toBe(true);
	});

	it(".pi 配下を保護対象として判定する (issue #80 C-005)", () => {
		expect(isProtectedPath("/tmp/project/.pi/ledger.json")).toBe(true);
		expect(isProtectedPath("/tmp/project/.pi")).toBe(true);
	});

	it("通常のパスは保護対象ではない", () => {
		expect(isProtectedPath("/tmp/project/src/index.ts")).toBe(false);
		expect(isProtectedPath("/tmp/project/.github/workflows")).toBe(false);
	});
});

describe("assertPathInsideRoot", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-path-test-"));

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("ルート配下のパスはパスする", async () => {
		const filePath = join(tmpDir, "file.txt");
		writeFileSync(filePath, "test");
		await expect(assertPathInsideRoot(filePath, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート配下のネストしたパスはパスする", async () => {
		const subDir = join(tmpDir, "sub", "dir");
		mkdirSync(subDir, { recursive: true });
		await expect(assertPathInsideRoot(subDir, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート外のパスはエラーを投げる", async () => {
		await expect(assertPathInsideRoot("/etc/hosts", tmpDir)).rejects.toThrow(
			"path escapes sandbox root",
		);
	});

	it("ルート自身はパスする", async () => {
		await expect(assertPathInsideRoot(tmpDir, tmpDir)).resolves.toBeUndefined();
	});
});

describe("resolveRealPaths", () => {
	it("絶対パスを realpath で解決する", async () => {
		const paths = await resolveRealPaths(["/tmp"]);
		expect(paths).toHaveLength(1);
		expect(paths[0]).toMatch(/^\/private\/tmp$|^\/tmp$/);
	});
});

describe("validateWorkspaceRoot", () => {
	it("正常な project directory は pass する", async () => {
		const projectDir = mkdtempSync(join(tmpdir(), "sandbox-project-"));
		try {
			const { validateWorkspaceRoot } = await import("../permissions.js");
			await expect(validateWorkspaceRoot(projectDir)).resolves.toBeUndefined();
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
		}
	});

	it("workspace root に / は不可", async () => {
		const { validateWorkspaceRoot } = await import("../permissions.js");
		await expect(validateWorkspaceRoot("/")).rejects.toThrow("cannot be /");
	});

	it("workspace root に $HOME は不可", async () => {
		const { validateWorkspaceRoot } = await import("../permissions.js");
		const home = process.env.HOME ?? "/Users/test";
		await expect(validateWorkspaceRoot(home)).rejects.toThrow("cannot be $HOME");
	});

	it("workspace root に /Users は不可", async () => {
		const { validateWorkspaceRoot } = await import("../permissions.js");
		await expect(validateWorkspaceRoot("/Users")).rejects.toThrow("cannot be /Users");
	});

	it("workspace root に /Users/<user> は不可", async () => {
		const { validateWorkspaceRoot } = await import("../permissions.js");
		await expect(validateWorkspaceRoot("/Users/testuser")).rejects.toThrow("cannot be /Users");
	});
});

describe("resolveSafeRealPath", () => {
	it("存在するパスは realpath を返す", async () => {
		const { resolveSafeRealPath } = await import("../permissions.js");
		const result = await resolveSafeRealPath("/tmp");
		expect(result).toMatch(/^\/private\/tmp$|^\/tmp$/);
	});

	it("存在しないパスは resolve の結果を返す", async () => {
		const { resolveSafeRealPath } = await import("../permissions.js");
		const result = await resolveSafeRealPath("/nonexistent/path/to/file");
		expect(result).toBe("/nonexistent/path/to/file");
	});
});

