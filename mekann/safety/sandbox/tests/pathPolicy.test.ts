/**
 * Sandbox Path Policy の独立テスト。
 *
 * isProtectedPath, assertPathInsideRoot, resolveRealPaths,
 * validateWritableRoots, validateWorkspaceRoot を体系的に検証する。
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	isProtectedPath,
	assertPathInsideRoot,
	resolveRealPaths,
	validateWorkspaceRoot,
	safeRepoRelativePath,
	protectedDirsSbplAlternation,
	PROTECTED_DIRS,
} from "../permissions.js";

// ─── isProtectedPath ──────────────────────────────────────────────

describe("isProtectedPath", () => {
	it(".git を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.git")).toBe(true);
	});

	it(".git/ 内のパスを保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.git/HEAD")).toBe(true);
		expect(isProtectedPath("/tmp/project/.git/hooks/pre-commit")).toBe(true);
		expect(isProtectedPath("/tmp/project/.git/objects/ab/cdef123456")).toBe(true);
	});

	it(".codex を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.codex")).toBe(true);
		expect(isProtectedPath("/tmp/project/.codex/config.json")).toBe(true);
	});

	it(".agents を保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/.agents")).toBe(true);
		expect(isProtectedPath("/tmp/project/.agents/state.json")).toBe(true);
	});

	it(".pi を保護対象として判定する (issue #80 C-005)", () => {
		expect(isProtectedPath("/tmp/project/.pi")).toBe(true);
		expect(isProtectedPath("/tmp/project/.pi/subagent-results/x.json")).toBe(true);
		expect(isProtectedPath("/tmp/project/.pi/ledger.json")).toBe(true);
	});

	it("ネストされた .git パスを保護対象として判定する", () => {
		expect(isProtectedPath("/tmp/project/submodule/.git")).toBe(true);
		expect(isProtectedPath("/tmp/project/deep/nested/.git/config")).toBe(true);
	});

	it("通常のパスは保護対象ではない", () => {
		expect(isProtectedPath("/tmp/project/src/index.ts")).toBe(false);
		expect(isProtectedPath("/tmp/project/README.md")).toBe(false);
		expect(isProtectedPath("/tmp/project/.github/workflows")).toBe(false);
	});

	it(".gitignore は保護対象ではない", () => {
		expect(isProtectedPath("/tmp/project/.gitignore")).toBe(false);
	});

	it(".gitconfig は保護対象ではない", () => {
		expect(isProtectedPath("/tmp/project/.gitconfig")).toBe(false);
	});

	it("空文字列は保護対象ではない", () => {
		expect(isProtectedPath("")).toBe(false);
	});

	it("/ 直下の .git は保護対象", () => {
		expect(isProtectedPath("/.git")).toBe(true);
	});
});

// ─── safeRepoRelativePath (shared path-safety primitive) ────────

describe("safeRepoRelativePath", () => {
	it("accepts normal relative paths", () => {
		expect(safeRepoRelativePath("src/index.ts")).toBe("src/index.ts");
		expect(safeRepoRelativePath("a/b/c.ts")).toBe("a/b/c.ts");
	});

	it("normalizes backslashes to forward slashes", () => {
		expect(safeRepoRelativePath("src\\a.ts")).toBe("src/a.ts");
	});

	it("normalizes ./ prefix and double slashes", () => {
		expect(safeRepoRelativePath("./src/a.ts")).toBe("src/a.ts");
		expect(safeRepoRelativePath("src//a.ts")).toBe("src/a.ts");
	});

	it("rejects empty, null bytes, absolute, drive-letter paths", () => {
		expect(safeRepoRelativePath("")).toBeUndefined();
		expect(safeRepoRelativePath("src\0evil.ts")).toBeUndefined();
		expect(safeRepoRelativePath("/tmp/x.ts")).toBeUndefined();
		expect(safeRepoRelativePath("C:\\Users\\x.ts")).toBeUndefined();
		expect(safeRepoRelativePath("c:/x.ts")).toBeUndefined();
		// backslash-leading path that becomes absolute after slash normalization
		expect(safeRepoRelativePath("\\evil\\x.ts")).toBeUndefined();
	});

	it("rejects parent traversal", () => {
		expect(safeRepoRelativePath("..")).toBeUndefined();
		expect(safeRepoRelativePath(".")).toBeUndefined();
		expect(safeRepoRelativePath("../x.ts")).toBeUndefined();
		expect(safeRepoRelativePath("a/../../b.ts")).toBeUndefined();
		expect(safeRepoRelativePath("../../x.ts")).toBeUndefined();
	});

	it("rejects protected metadata dirs at top level (issue #80 C-004)", () => {
		for (const dir of PROTECTED_DIRS) {
			expect(safeRepoRelativePath(dir)).toBeUndefined();
			expect(safeRepoRelativePath(`${dir}/config`)).toBeUndefined();
		}
		// .pi explicitly: subagent/autoresearch now share this protection
		expect(safeRepoRelativePath(".pi")).toBeUndefined();
		expect(safeRepoRelativePath(".pi/state.json")).toBeUndefined();
		expect(safeRepoRelativePath(".codex")).toBeUndefined();
		expect(safeRepoRelativePath(".agents/state.json")).toBeUndefined();
	});

	it("does NOT reject look-alike names (.github/.gitignore/.gitconfig)", () => {
		expect(safeRepoRelativePath(".github/workflows/ci.yml")).toBe(".github/workflows/ci.yml");
		expect(safeRepoRelativePath(".gitignore")).toBe(".gitignore");
		expect(safeRepoRelativePath(".gitconfig")).toBe(".gitconfig");
	});
});

// ─── protectedDirsSbplAlternation (single source for SBPL regex) ──

describe("protectedDirsSbplAlternation", () => {
	it("escapes every PROTECTED_DIRS entry and joins with |", () => {
		const alt = protectedDirsSbplAlternation();
		for (const dir of PROTECTED_DIRS) {
			const escaped = dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			expect(alt).toContain(escaped);
		}
		// .pi must be present so SBPL enforcement matches subagent protection (issue #80 C-005)
		expect(alt).toContain("\\.pi");
	});
});

// ─── assertPathInsideRoot ─────────────────────────────────────────

describe("assertPathInsideRoot", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-path-policy-test-"));

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("ルート配下のファイルはパスする", async () => {
		const filePath = join(tmpDir, "file.txt");
		writeFileSync(filePath, "test");
		await expect(assertPathInsideRoot(filePath, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート配下のネストしたパスはパスする", async () => {
		const subDir = join(tmpDir, "sub", "dir");
		mkdirSync(subDir, { recursive: true });
		await expect(assertPathInsideRoot(subDir, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート自身はパスする", async () => {
		await expect(assertPathInsideRoot(tmpDir, tmpDir)).resolves.toBeUndefined();
	});

	it("ルート外のパスはエラーを投げる", async () => {
		await expect(assertPathInsideRoot("/etc/hosts", tmpDir)).rejects.toThrow("path escapes sandbox root");
	});

	it("親ディレクトリはエラーを投げる", async () => {
		await expect(assertPathInsideRoot(join(tmpDir, ".."), tmpDir)).rejects.toThrow("path escapes sandbox root");
	});

	it("symlink 経由の脱出を検出する", async () => {
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-outside-link-"));
		const linkPath = join(tmpDir, "escape_link");
		try {
			symlinkSync(outsideDir, linkPath);
			await expect(assertPathInsideRoot(linkPath, tmpDir)).rejects.toThrow("path escapes sandbox root");
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});

// ─── resolveRealPaths ──────────────────────────────────────────────

describe("resolveRealPaths", () => {
	it("存在するパスを realpath で解決する", async () => {
		const paths = await resolveRealPaths(["/tmp"]);
		expect(paths).toHaveLength(1);
		expect(paths[0]).toMatch(/^\/private\/tmp$|^\/tmp$/);
	});

	it("存在しないパスは resolve の結果を返す", async () => {
		const paths = await resolveRealPaths(["/nonexistent/path"]);
		expect(paths).toEqual(["/nonexistent/path"]);
	});

	it("複数のパスを処理する", async () => {
		const paths = await resolveRealPaths(["/tmp", "/nonexistent"]);
		expect(paths).toHaveLength(2);
	});

	it("空配列は空配列を返す", async () => {
		const paths = await resolveRealPaths([]);
		expect(paths).toEqual([]);
	});

	it("相対パスを絶対パスに解決する", async () => {
		const paths = await resolveRealPaths(["."]);
		expect(paths[0]).toMatch(/^\//);
	});
});

// ─── validateWorkspaceRoot ────────────────────────────────────────

describe("validateWorkspaceRoot", () => {
	it("正常なディレクトリは有効", async () => {
		const projectDir = mkdtempSync(join(tmpdir(), "sandbox-project-"));
		try {
			await expect(validateWorkspaceRoot(projectDir)).resolves.toBeUndefined();
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
		}
	});

	it("/ は無効", async () => {
		await expect(validateWorkspaceRoot("/")).rejects.toThrow("cannot be /");
	});

	it("$HOME は無効", async () => {
		const home = process.env.HOME ?? "/Users/test";
		await expect(validateWorkspaceRoot(home)).rejects.toThrow("cannot be $HOME");
	});

	it("/Users は無効", async () => {
		await expect(validateWorkspaceRoot("/Users")).rejects.toThrow("cannot be /Users");
	});

	it("/Users/<user> は無効", async () => {
		await expect(validateWorkspaceRoot("/Users/testuser")).rejects.toThrow("cannot be /Users");
	});

	it("/Users/<user>/projects は有効", async () => {
		// /Users/<user> 配下のサブディレクトリは OK
		const projectDir = "/Users/dev/my-project";
		// 実際にディレクトリが存在しない場合は resolveSafe が resolve の結果を返す
		// バリデーションロジックは /Users/<user> のみをブロックする
		// 存在しないパスでも resolve 後に /Users/testuser パターンにマッチしなければ OK
		try {
			await validateWorkspaceRoot(projectDir);
		} catch (e) {
			// /Users/dev/my-project は /Users/<user> パターンにマッチしないので OK
			// expect が到達しないことを確認
			expect((e as Error).message).not.toContain("/Users");
		}
	});

	it("存在しないディレクトリでも resolve 済みで検証する", async () => {
		await expect(validateWorkspaceRoot("/nonexistent/project")).resolves.toBeUndefined();
	});
});

// ─── HOME undefined edge case ─────────────────────────────────────

describe("validateWorkspaceRoot: HOME undefined", () => {
	it("HOME が undefined の場合でも workspace root を検証できる", async () => {
		const origHome = process.env.HOME;
		delete process.env.HOME;
		try {
			const projectDir = mkdtempSync(join(tmpdir(), "sandbox-nohome-"));
			try {
				await expect(validateWorkspaceRoot(projectDir)).resolves.toBeUndefined();
			} finally {
				rmSync(projectDir, { recursive: true, force: true });
			}
		} finally {
			process.env.HOME = origHome;
		}
	});
});
