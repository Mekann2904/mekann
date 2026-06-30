/**
 * ポリシー検証 (validatePolicy) と .git ポインタ解決 (resolveGitdirPaths) のテスト。
 *
 * workspaceRoots / writableRoots の安全性、read_only 制約、symlink 脱出検出、
 * .git ファイルポインタの解決などを検証する。
 */

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveGitdirPaths, validatePolicy } from "../macSeatbelt.js";

import {
	readOnlyPolicy,
	workspaceWritePolicy,
	yoloPolicy,
	type SandboxPolicy,
} from "../permissions.js";

describe("validatePolicy", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-validate-test-"));

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("yolo は常に有効", async () => {
		const policy = yoloPolicy();
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});

	it("read_only は writableRoots が空なら有効", async () => {
		const policy = readOnlyPolicy(tmpDir, [tmpDir]);
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});

	it("workspace_write で writableRoots が workspaceRoots 内なら有効", async () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});

	it("workspace_write で writableRoots が workspaceRoots の外なら無効", async () => {
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-outside-"));
		try {
			const policy = workspaceWritePolicy(tmpDir, [tmpDir], [outsideDir], false);
			await expect(validatePolicy(policy)).rejects.toThrow("writable root");
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	it("workspace_write で / は writableRoots にできない", async () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], ["/"], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	it("workspace_write で $HOME 全体は writableRoots にできない", async () => {
		const home = process.env.HOME ?? "/Users/test";
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [home], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	// ── FIX 1: validatePolicy also validates workspaceRoots for unsafe paths ──

	it("validatePolicy は workspaceRoots に / を拒否する (read_only)", async () => {
		const policy = readOnlyPolicy(tmpDir, ["/"]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /");
	});

	it("validatePolicy は workspaceRoots に / を拒否する (workspace_write)", async () => {
		const policy = workspaceWritePolicy(tmpDir, ["/"], ["/"], false);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /");
	});

	it("validatePolicy は workspaceRoots に $HOME を拒否する", async () => {
		const home = process.env.HOME ?? "/Users/test";
		const policy = readOnlyPolicy(tmpDir, [home]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be $HOME");
	});

	it("validatePolicy は workspaceRoots に /Users を拒否する", async () => {
		const policy = readOnlyPolicy(tmpDir, ["/Users"]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /Users");
	});

	it("validatePolicy は workspaceRoots に /Users/<user> を拒否する", async () => {
		const policy = readOnlyPolicy(tmpDir, ["/Users/testuser"]);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /Users");
	});

	it("validatePolicy は cwd が unsafe でも拒否する (workspaceRoots 空)", async () => {
		const policy = readOnlyPolicy("/", []);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be /");
	});

	it("validatePolicy は cwd が $HOME でも拒否する (workspaceRoots 空)", async () => {
		const home = process.env.HOME ?? "/Users/test";
		const policy = readOnlyPolicy(home, []);
		await expect(validatePolicy(policy)).rejects.toThrow("cannot be $HOME");
	});

	// FIX 1: validatePolicy validates implicit cwd writable root in workspace_write

	it("workspace_write で writableRoots 空 + cwd unsafe は拒否する", async () => {
		const home = process.env.HOME ?? "/Users/test";
		// cwd = $HOME, workspaceRoots empty, writableRoots empty
		// effectiveWritableRoots will be [cwd] = [$HOME] which is unsafe
		const policy = workspaceWritePolicy(home, [], [], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	it("workspace_write で writableRoots 空 + cwd=/ は拒否する", async () => {
		const policy = workspaceWritePolicy("/", [], [], false);
		await expect(validatePolicy(policy)).rejects.toThrow();
	});

	it("workspace_write で cwd != workspaceRoots + writableRoots 空は検証する", async () => {
		// cwd = /tmp/outside, workspaceRoots = [/tmp/project], writableRoots = []
		// effectiveWritableRoots = [cwd] = [/tmp/outside]
		// This should fail because cwd (/tmp/outside) is outside workspaceRoots
		const projectDir = mkdtempSync(join(tmpdir(), "sandbox-project-"));
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-outside3-"));
		try {
			const policy = workspaceWritePolicy(outsideDir, [projectDir], [], false);
			await expect(validatePolicy(policy)).rejects.toThrow("outside workspace roots");
		} finally {
			rmSync(projectDir, { recursive: true, force: true });
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});

describe("resolveGitdirPaths", () => {
	const testGitDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-test-"));

	afterAll(() => {
		rmSync(testGitDir, { recursive: true, force: true });
	});

	it(".git directory はそのパスを返す", async () => {
		const gitDir = join(testGitDir, ".git");
		mkdirSync(gitDir, { recursive: true });

		const paths = await resolveGitdirPaths(testGitDir);
		expect(paths).toHaveLength(1);
		expect(paths[0]).toContain(".git");
	});

	it(".git pointer file は gitdir を解決する", async () => {
		const subDir = join(testGitDir, "pointer-test");
		mkdirSync(subDir, { recursive: true });
		const externalGitdir = join(testGitDir, "external-git");
		mkdirSync(externalGitdir, { recursive: true });

		writeFileSync(join(subDir, ".git"), `gitdir: ${externalGitdir}\n`);

		const paths = await resolveGitdirPaths(subDir);
		expect(paths).toHaveLength(2); // gitdir + pointer file itself
		expect(paths.some((p) => p.includes("external-git"))).toBe(true);
	});

	it(".git が存在しない場合は空配列", async () => {
		const emptyDir = join(testGitDir, "no-git");
		mkdirSync(emptyDir, { recursive: true });

		const paths = await resolveGitdirPaths(emptyDir);
		expect(paths).toHaveLength(0);
	});

	it(".git pointer file with relative gitdir is resolved against workspace root", async () => {
		const subDir = join(testGitDir, "relative-pointer-test");
		mkdirSync(subDir, { recursive: true });
		const externalGitdir = join(testGitDir, "relative-gitdir");
		mkdirSync(externalGitdir, { recursive: true });

		// Use a relative path instead of absolute
		writeFileSync(join(subDir, ".git"), "gitdir: ../relative-gitdir\n");

		const paths = await resolveGitdirPaths(subDir);
		expect(paths).toHaveLength(2);
		expect(paths.some((p) => p.includes("relative-gitdir"))).toBe(true);
	});
});

describe("validatePolicy: read_only mode constraints", () => {
	it("read_only で writableRoots がある場合はエラー", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-readonly-writable-test-"));
		try {
			const policy: SandboxPolicy = {
				mode: "read_only",
				cwd: tmpDir,
				workspaceRoots: [tmpDir],
				writableRoots: [tmpDir], // should not be allowed
				network: false,
			};
			await expect(validatePolicy(policy)).rejects.toThrow("read_only mode must not have writableRoots");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

describe("validatePolicy: symlink-based writable root escape", () => {
	it("symlink で workspace 外を指す writableRoot を検出する", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-symlink-test-"));
		const outsideDir = mkdtempSync(join(tmpdir(), "sandbox-symlink-outside-"));
		const linkPath = join(tmpDir, "escape_link");
		try {
			symlinkSync(outsideDir, linkPath);
			const policy = workspaceWritePolicy(tmpDir, [tmpDir], [linkPath], false);
			await expect(validatePolicy(policy)).rejects.toThrow("outside workspace roots");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});

describe("resolveGitdirPaths: .git file with non-gitdir content", () => {
	it(".git ファイルに gitdir: 行がない場合、ファイルパスのみ返す", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-nocontent-"));
		try {
			writeFileSync(join(tmpDir, ".git"), "not a gitdir file\n");
			const paths = await resolveGitdirPaths(tmpDir);
			// match?.[1] is null → no gitdir pushed, only the .git file path itself
			expect(paths).toHaveLength(1);
			expect(paths[0]).toBe(join(tmpDir, ".git"));
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it(".git ファイルが空の場合、ファイルパスのみ返す", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-empty-"));
		try {
			writeFileSync(join(tmpDir, ".git"), "");
			const paths = await resolveGitdirPaths(tmpDir);
			expect(paths).toHaveLength(1);
			expect(paths[0]).toBe(join(tmpDir, ".git"));
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

describe("resolveGitdirPaths: .git file pointing to nonexistent path", () => {
	it("gitdir が存在しないパスでも resolved path を返す", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-nonexist-"));
		try {
			writeFileSync(join(tmpDir, ".git"), "gitdir: /tmp/nonexistent-gitdir-path-12345\n");
			const paths = await resolveGitdirPaths(tmpDir);
			// realpath fails → catch block uses resolved path as-is
			expect(paths.length).toBeGreaterThanOrEqual(2);
			expect(paths.some((p) => p.includes("nonexistent-gitdir-path-12345"))).toBe(true);
			expect(paths).toContain(join(tmpDir, ".git"));
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("gitdir が絶対パスで存在する場合、realpath で解決される", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-abs-"));
		const gitdirDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-target-"));
		try {
			writeFileSync(join(tmpDir, ".git"), `gitdir: ${gitdirDir}\n`);
			const paths = await resolveGitdirPaths(tmpDir);
			expect(paths.length).toBeGreaterThanOrEqual(2);
			expect(paths.some((p) => p.includes("sandbox-gitdir-target"))).toBe(true);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
			rmSync(gitdirDir, { recursive: true, force: true });
		}
	});
});

describe("validatePolicy: writable root exactly equals workspace root (rel === \"\")", () => {
	it("writableRoot が workspaceRoot と完全一致する場合、検証パスする", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-exact-match-"));
		try {
			// When resolvedWr === root, relative(root, resolvedWr) === "" → isInside = true
			const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
			await expect(validatePolicy(policy)).resolves.toBeUndefined();
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it("複数 workspaceRoots のうち一つと一致すればパスする", async () => {
		const root1 = mkdtempSync(join(tmpdir(), "sandbox-root1-"));
		const root2 = mkdtempSync(join(tmpdir(), "sandbox-root2-"));
		try {
			const policy = workspaceWritePolicy(root1, [root1, root2], [root2], false);
			await expect(validatePolicy(policy)).resolves.toBeUndefined();
		} finally {
			rmSync(root1, { recursive: true, force: true });
			rmSync(root2, { recursive: true, force: true });
		}
	});
});

describe("resolveGitdirPaths: .git file without gitdir", () => {
	it("gitdir 行のない .git ファイルはファイルパスのみ返す", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-nocontent-"));
		try {
			writeFileSync(join(tmpDir, ".git"), "not a gitdir file\n");
			const paths = await resolveGitdirPaths(tmpDir);
			expect(paths).toHaveLength(1);
			expect(paths[0]).toContain(".git");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it(".git ファイルが空の場合はファイルパスのみ返す", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-empty-"));
		try {
			writeFileSync(join(tmpDir, ".git"), "");
			const paths = await resolveGitdirPaths(tmpDir);
			expect(paths).toHaveLength(1);
			expect(paths[0]).toContain(".git");
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it(".git ファイルが存在しない gitdir を指す場合", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-nonexist-"));
		try {
			writeFileSync(join(tmpDir, ".git"), "gitdir: /tmp/nonexistent-gitdir-path-99999\n");
			const paths = await resolveGitdirPaths(tmpDir);
			// realpath will fail for nonexistent path, falls back to resolve
			expect(paths.length).toBeGreaterThanOrEqual(1);
			// Should include the pointer file path itself
			expect(paths.some((p) => p.endsWith(".git"))).toBe(true);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

describe("validatePolicy: read_only with writableRoots", () => {
	const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-validate-ro-w-"));

	afterAll(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("read_only モードで writableRoots が非空の場合エラー", async () => {
		const policy: SandboxPolicy = {
			mode: "read_only",
			cwd: tmpDir,
			workspaceRoots: [tmpDir],
			writableRoots: [tmpDir],
			network: false,
		};
		await expect(validatePolicy(policy)).rejects.toThrow("read_only mode must not have writableRoots");
	});

	it("writable root が workspace root と完全一致する場合 (rel === '')", async () => {
		const policy = workspaceWritePolicy(tmpDir, [tmpDir], [tmpDir], false);
		await expect(validatePolicy(policy)).resolves.toBeUndefined();
	});
});

describe("resolveGitdirPaths: .git is neither file nor directory", () => {
	it(".git が FIFO の場合、空配列を返す", async () => {
		const tmpDir = mkdtempSync(join(tmpdir(), "sandbox-gitdir-fifo-"));
		try {
			// Create a FIFO at .git — stat will show isFile=false, isDirectory=false
			const { execSync } = await import("node:child_process");
			execSync(`mkfifo '${join(tmpDir, ".git")}'`);

			const paths = await resolveGitdirPaths(tmpDir);
			// Neither directory nor file → no results pushed (just empty)
			expect(paths).toHaveLength(0);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

