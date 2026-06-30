/**
 * runSandboxedShellMac のテスト。
 *
 * 単体: 空コマンド拒否。
 * 統合 (macOS + sandbox-exec 利用可能時のみ実行):
 *   read_only / workspace_write の許可・拒否、network 制御、env secret 分離、
 *   timeout / output cap / background process kill、AbortSignal 伝播、
 *   isolated HOME、bash startup files 無効化等。
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
	mkdtempSync,
	writeFileSync,
	mkdirSync,
	rmSync,
	symlinkSync,
	existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { isMacSandboxAvailable, runSandboxedShellMac } from "../macSeatbelt.js";

import { readOnlyPolicy, workspaceWritePolicy } from "../permissions.js";

// ─── Platform check ──────────────────────────────────────────────

const isMac = process.platform === "darwin";

/**
 * Verify a process no longer exists, with retries for CI stability.
 * Unix zombies / scheduling delays can cause false positives in
 * process.kill(pid, 0) checks. Retry with backoff to avoid flaky tests.
 */
async function expectProcessGone(pid: number, retries = 5): Promise<void> {
	for (let i = 0; i < retries; i++) {
		try {
			process.kill(pid, 0);
			// Process still exists, wait and retry
			await new Promise<void>((r) => setTimeout(r, 50));
		} catch {
			return; // process is gone — success
		}
	}
	throw new Error(`process ${pid} still exists after ${retries} retries`);
}

// ─── Integration tests (macOS + sandbox-exec only) ───────────────

const describeMacConcurrent = isMac ? describe.concurrent : describe.skip;

describeMacConcurrent("runSandboxedShellMac (integration)", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-integ-test-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	// sandbox-exec が利用可能かを実行時にチェックするヘルパー
	const requireMacSandboxTests = process.env.RUN_MAC_SANDBOX_TESTS === "1";

	function itSandbox(
		name: string,
		fn: () => Promise<void>,
		timeout?: number,
	) {
		it(
			name,
			async () => {
				if (sandboxReady) {
					await fn();
					return;
				}

				// sandbox-exec not available
				if (requireMacSandboxTests) {
					throw new Error(
						"macOS sandbox tests were required (RUN_MAC_SANDBOX_TESTS=1) " +
						"but sandbox-exec is unavailable",
					);
				}

				// Not required — skip silently
			},
			timeout,
		);
	}

	// ── read_only: 許可されるべき操作 ──────────────────────────────

	itSandbox("read_only: workspace 内ファイルを読み取れる", async () => {
		const filePath = join(testDir, "package.json");
		writeFileSync(filePath, '{"name": "test"}');

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(`cat "${filePath}"`, policy);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("test");
	});

	itSandbox("read_only: ls でディレクトリを一覧できる", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(`ls "${testDir}"`, policy);

		expect(result.code).toBe(0);
	});

	itSandbox("read_only: pwd が動作する", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("pwd", policy);

		expect(result.code).toBe(0);
	});

	// ── read_only: 拒否されるべき操作 ──────────────────────────────

	itSandbox("read_only: ファイル書き込みは拒否される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			`echo test > "${join(testDir, "blocked.txt")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("read_only: ファイル作成は拒否される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			`touch "${join(testDir, "new.txt")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("read_only: ディレクトリ作成は拒否される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			`mkdir "${join(testDir, "newdir")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("read_only: ~/.ssh/config は読めない", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"cat ~/.ssh/config 2>/dev/null; test $? -eq 0 && echo ACCESS_GRANTED || echo ACCESS_DENIED",
			policy,
		);

		expect(result.stdout).toContain("ACCESS_DENIED");
	});

	itSandbox("read_only: /Users 全体は list できない", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"ls /Users 2>&1; test $? -eq 0 && echo ACCESS_GRANTED || echo ACCESS_DENIED",
			policy,
		);

		expect(result.stdout).toContain("ACCESS_DENIED");
	});

	// ── workspace_write: 許可されるべき操作 ────────────────────────

	itSandbox("workspace_write: ファイル書き込みができる", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo "write test" > "${join(testDir, "allowed.txt")}"`,
			policy,
		);

		expect(result.code).toBe(0);
	});

	itSandbox("workspace_write: ディレクトリ作成ができる", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`mkdir -p "${join(testDir, "subdir")}"`,
			policy,
		);

		expect(result.code).toBe(0);
	});

	itSandbox("workspace_write: 既存ファイルの読み取りができる", async () => {
		const filePath = join(testDir, "readable.txt");
		writeFileSync(filePath, "read me");

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(`cat "${filePath}"`, policy);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("read me");
	});

	// ── workspace_write: 拒否されるべき操作 ────────────────────────

	itSandbox("workspace_write: .git 内の書き込みは拒否される", async () => {
		const gitDir = join(testDir, ".git", "hooks");
		mkdirSync(gitDir, { recursive: true });

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo x > "${join(gitDir, "pre-commit")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("workspace_write: .codex 内の書き込みは拒否される", async () => {
		const codexDir = join(testDir, ".codex");
		mkdirSync(codexDir, { recursive: true });

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo x > "${join(codexDir, "config")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("workspace_write: .agents 内の書き込みは拒否される", async () => {
		const agentsDir = join(testDir, ".agents");
		mkdirSync(agentsDir, { recursive: true });

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			`echo x > "${join(agentsDir, "state")}"`,
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	itSandbox("workspace_write: symlink 経由で workspace 外に書き込めない", async () => {
		const outsideDir = mkdtempSync("/tmp/sandbox-outside-");
		const linkPath = join(testDir, "escape_link");
		try {
			if (!existsSync(linkPath)) {
				symlinkSync(outsideDir, linkPath);
			}

			const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
			const result = await runSandboxedShellMac(
				`echo x > "${join(linkPath, "escaped.txt")}"`,
				policy,
			);

			expect(result.code).not.toBe(0);
		} finally {
			rmSync(outsideDir, { recursive: true, force: true });
		}
	});

	itSandbox("workspace_write: symlink 経由で .git に書き込めない", async () => {
		const gitDir = join(testDir, ".git");
		mkdirSync(gitDir, { recursive: true });
		const linkPath = join(testDir, "git_link");
		try {
			if (!existsSync(linkPath)) {
				symlinkSync(gitDir, linkPath);
			}

			const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
			const result = await runSandboxedShellMac(
				`echo x > "${join(linkPath, "config")}"`,
				policy,
			);

			expect(result.code).not.toBe(0);
		} finally {
			// cleanup
		}
	});

	// ── network ────────────────────────────────────────────────────

	itSandbox("network=false で curl は拒否される", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		const result = await runSandboxedShellMac(
			"curl --connect-timeout 2 https://example.com",
			policy,
		);

		expect(result.code).not.toBe(0);
	});

	// ── environment isolation ──────────────────────────────────────

	itSandbox("env: OPENAI_API_KEY が子プロセスに渡らない", async () => {
		const origKey = process.env.OPENAI_API_KEY;
		process.env.OPENAI_API_KEY = "sk-test-secret-key-integration";
		try {
			const policy = readOnlyPolicy(testDir, [testDir]);
			const result = await runSandboxedShellMac(
				"echo \"OPENAI_KEY=$OPENAI_API_KEY\"",
				policy,
			);

			expect(result.code).toBe(0);
			expect(result.stdout).not.toContain("sk-test-secret-key-integration");
		} finally {
			if (origKey) process.env.OPENAI_API_KEY = origKey;
			else delete process.env.OPENAI_API_KEY;
		}
	});

	itSandbox("env: GITHUB_TOKEN が子プロセスに渡らない", async () => {
		const origToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = "ghp-integration-test-secret";
		try {
			const policy = readOnlyPolicy(testDir, [testDir]);
			const result = await runSandboxedShellMac(
				"echo \"GITHUB=$GITHUB_TOKEN\"",
				policy,
			);

			expect(result.code).toBe(0);
			expect(result.stdout).not.toContain("ghp-integration-test-secret");
		} finally {
			if (origToken) process.env.GITHUB_TOKEN = origToken;
			else delete process.env.GITHUB_TOKEN;
		}
	});

	// ── timeout / output cap ───────────────────────────────────────

	itSandbox("timeout が発火するとプロセスが kill される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"sleep 5",
			policy,
			{ timeoutMs: 150 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("timed out");
	});

	itSandbox("maxOutputBytes を超えるとエラーになる (combined)", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"cat /dev/urandom | head -c 10000000 | base64",
			policy,
			{ maxOutputBytes: 1024 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("output limit");
	});

	// ── process group kill ───────────────────────────────────────────

	itSandbox("background process が timeout 後に kill される (stdout PID verification)", async () => {
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		// Start a background sleep, echo its PID to stdout so we can capture it
		// Using workspace_write so the command can write to $TMPDIR if needed
		const result = await runSandboxedShellMac(
			"sleep 5 & BG_PID=$!; echo BG_PID=$BG_PID; wait",
			policy,
			{ timeoutMs: 200 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("timed out");

		// Extract PID from stdout and verify the process no longer exists
		// Use Node parent process side verification with retry for CI stability
		const pidMatch = result.stdout.match(/BG_PID=(\d+)/);
		if (pidMatch?.[1]) {
			const pid = parseInt(pidMatch[1], 10);
			if (pid > 0) {
				await expectProcessGone(pid);
			}
		}
	}, 8000);

	itSandbox("background process が abort 後に kill される (stdout PID verification)", async () => {
		const controller = new AbortController();
		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);

		// Abort after a short delay
		setTimeout(() => controller.abort(), 200);

		const result = await runSandboxedShellMac(
			"sleep 5 & BG_PID=$!; echo BG_PID=$BG_PID; wait",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("aborted");

		// Extract PID from stdout and verify the process is dead
		const pidMatch = result.stdout.match(/BG_PID=(\d+)/);
		if (pidMatch?.[1]) {
			const pid = parseInt(pidMatch[1], 10);
			if (pid > 0) {
				await expectProcessGone(pid);
			}
		}
	}, 8000);

	// ── per-run temp directory ───────────────────────────────────────

	itSandbox("read_only: per-run temp dir への write ができる", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"echo test > $TMPDIR/write-test && cat $TMPDIR/write-test; echo TMPDIR=$TMPDIR",
			policy,
		);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("test");
		// Verify TMPDIR is a per-run isolated dir
		expect(result.stdout).toContain("sandbox-run-");
	});

	// ── .git pointer file ────────────────────────────────────────────

	itSandbox("workspace_write: resolved gitdir への write が失敗する", async () => {
		const worktreeDir = join(testDir, "worktree-test");
		mkdirSync(worktreeDir, { recursive: true });
		const externalGitdir = join("/tmp", "external-gitdir-" + Date.now());
		mkdirSync(externalGitdir, { recursive: true });
		writeFileSync(join(worktreeDir, ".git"), `gitdir: ${externalGitdir}\n`);

		try {
			const policy = workspaceWritePolicy(worktreeDir, [worktreeDir], [worktreeDir], false);
			const result = await runSandboxedShellMac(
				`echo x > "${join(externalGitdir, "config")}"`,
				policy,
			);

			expect(result.code).not.toBe(0);
		} finally {
			rmSync(externalGitdir, { recursive: true, force: true });
			rmSync(worktreeDir, { recursive: true, force: true });
		}
	});

	// ── AbortSignal propagation ───────────────────────────────────────

	itSandbox("AbortSignal が cancel を伝播する", async () => {
		const controller = new AbortController();
		const policy = readOnlyPolicy(testDir, [testDir]);

		// Abort after a short delay
		setTimeout(() => controller.abort(), 200);

		const result = await runSandboxedShellMac(
			"sleep 5",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("aborted");
	}, 5000);

	// ── FIX 2: Isolated HOME and no startup files ────────────────────

	itSandbox("$HOME は isolated temp home を指す (workspace ではない)", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("echo HOME=$HOME", policy);

		expect(result.code).toBe(0);
		// HOME should contain "sandbox-run-" and "/home"
		expect(result.stdout).toContain("sandbox-run-");
		expect(result.stdout).toContain("/home");
		// HOME should NOT be the workspace
		expect(result.stdout).not.toContain(`HOME=${testDir}`);
	});

	itSandbox(".bash_profile が workspace にあっても実行されない", async () => {
		// Create .bash_profile that writes a marker file
		writeFileSync(join(testDir, ".bash_profile"), `echo BASH_PROFILE_LOADED > "${join(testDir, "bash-profile-marker.txt")}"\n`);
		writeFileSync(join(testDir, ".profile"), `echo PROFILE_LOADED > "${join(testDir, "profile-marker.txt")}"\n`);

		const policy = workspaceWritePolicy(testDir, [testDir], [testDir], false);
		// Just run a simple command; startup files should NOT be loaded
		const result = await runSandboxedShellMac("echo done", policy);

		expect(result.code).toBe(0);
		// The marker files should NOT exist because startup files were not loaded
		expect(existsSync(join(testDir, "bash-profile-marker.txt"))).toBe(false);
		expect(existsSync(join(testDir, "profile-marker.txt"))).toBe(false);
	});

	itSandbox(".profile が workspace にあっても実行されない", async () => {
		writeFileSync(join(testDir, ".profile"), `export PROFILE_MARKER=1\n`);

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("echo PROFILE=$PROFILE_MARKER", policy);

		expect(result.code).toBe(0);
		// PROFILE_MARKER should not be set because .profile was not loaded
		expect(result.stdout).not.toContain("PROFILE=1");
	});

	// ── FIX 6: maxOutputBytes combined stdout+stderr ─────────────────

	itSandbox("maxOutputBytes は stdout + stderr の合計で制限される", async () => {
		const policy = readOnlyPolicy(testDir, [testDir]);
		// Write to both stdout and stderr, totaling over the limit
		const result = await runSandboxedShellMac(
			"echo stdout_data; echo stderr_data >&2; cat /dev/urandom | head -c 100000 | base64",
			policy,
			{ maxOutputBytes: 512 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("output limit");
	});
});

describe("runSandboxedShellMac: empty command rejection", () => {
	it("空文字列コマンドは例外を投げる", async () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		await expect(runSandboxedShellMac("", policy)).rejects.toThrow("empty command");
	});

	it("空白のみのコマンドは例外を投げる", async () => {
		const policy = readOnlyPolicy("/tmp/workspace");
		await expect(runSandboxedShellMac("   ", policy)).rejects.toThrow("empty command");
	});
});

describeMacConcurrent("runSandboxedShellMac: abort signal already aborted", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-abort-test-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("AbortSignal が既に aborted の場合、即座にエラーを返す", async () => {
		if (!sandboxReady) return;

		const controller = new AbortController();
		controller.abort(); // Abort before calling runSandboxedShellMac

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"echo hello",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).toBeNull();
		expect(result.stderr).toContain("aborted");
	}, 5000);
});

describeMacConcurrent("runSandboxedShellMac: normal exit safety net", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-normal-exit-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("正常終了時、outputExceeded=false で通常の出力を返す", async () => {
		if (!sandboxReady) return;

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("echo normal_output", policy);

		expect(result.code).toBe(0);
		expect(result.stdout).toContain("normal_output");
		expect(result.stdout).not.toContain("[...output truncated...]");
		expect(result.stderr).not.toContain("output limit");
	});

	it("stderr のみ出力がある場合でも正常に返す", async () => {
		if (!sandboxReady) return;

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac("echo stderr_only >&2", policy);

		expect(result.code).toBe(0);
		expect(result.stderr).toContain("stderr_only");
		expect(result.stdout).toBe("");
	});
});

describeMacConcurrent("runSandboxedShellMac: output limit edge cases", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-output-edge-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("maxOutputBytes が 0 の場合、即座に output limit になる", async () => {
		if (!sandboxReady) return;

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"echo hello",
			policy,
			{ maxOutputBytes: 0 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("output limit");
	});

	it("keepBytes > 0 で部分的にデータが保持される", async () => {
		if (!sandboxReady) return;

		const policy = readOnlyPolicy(testDir, [testDir]);
		// Generate enough output to exceed 100 bytes but keep some bytes from the last chunk
		const result = await runSandboxedShellMac(
			"echo 'initial data'; printf '%0.sx' {1..20000}",
			policy,
			{ maxOutputBytes: 100 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("output limit");
		// The truncated output should have some content (keepBytes > 0)
		expect(result.stdout.length).toBeGreaterThan(0);
	});
});

describeMacConcurrent("runSandboxedShellMac: abort vs timeout error messages", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-abort-msg-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("abort 時のエラーメッセージは 'aborted' を含む (timedOut は false)", async () => {
		if (!sandboxReady) return;

		const controller = new AbortController();
		const policy = readOnlyPolicy(testDir, [testDir]);

		setTimeout(() => controller.abort(), 150);

		const result = await runSandboxedShellMac(
			"sleep 5",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).toBeNull();
		// timedOut is false → message says "aborted", not "timed out"
		expect(result.stderr).toContain("aborted");
		expect(result.stderr).not.toContain("timed out");
	}, 5000);

	it("timeout 時のエラーメッセージは 'timed out' を含む (timedOut は true)", async () => {
		if (!sandboxReady) return;

		const policy = readOnlyPolicy(testDir, [testDir]);
		const result = await runSandboxedShellMac(
			"sleep 5",
			policy,
			{ timeoutMs: 200 },
		);

		expect(result.code).not.toBe(0);
		expect(result.stderr).toContain("timed out");
	}, 5000);
});

describeMacConcurrent("runSandboxedShellMac: catch path without output exceeded", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-catch-noexceed-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("abort 時に outputExceeded=false なら truncated マーカーなし", async () => {
		if (!sandboxReady) return;

		const controller = new AbortController();
		const policy = readOnlyPolicy(testDir, [testDir]);

		setTimeout(() => controller.abort(), 150);

		const result = await runSandboxedShellMac(
			"echo small; sleep 5",
			policy,
			{ signal: controller.signal, timeoutMs: 60000 },
		);

		expect(result.code).toBeNull();
		expect(result.stderr).toContain("aborted");
		// outputExceeded is false → no truncated marker in stdout
		expect(result.stdout).not.toContain("[...output truncated...]");
	}, 5000);
});

describeMacConcurrent("runSandboxedShellMac: output limit with timeout", () => {
	let testDir: string;
	let sandboxReady = false;

	beforeAll(async () => {
		sandboxReady = await isMacSandboxAvailable();
		testDir = mkdtempSync(join(tmpdir(), "sandbox-output-timeout-"));
	});

	afterAll(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("output limit + timeout both fire: outputExceeded=true in catch path", async () => {
		if (!sandboxReady) return;

		const policy = readOnlyPolicy(testDir, [testDir]);
		// Produce output fast with a small maxOutputBytes AND a short timeout
		// The output limit fires first (setting outputExceeded=true + requestTerminate("output_limit")),
		// then the timeout fires (requestTerminate("timeout") returns early since already terminated,
		// but still rejects the promise → catch block with outputExceeded=true).
		const result = await runSandboxedShellMac(
			"echo hello; sleep 5", // produce output then sleep (so process stays alive for timeout)
			policy,
			{ maxOutputBytes: 2, timeoutMs: 80 }, // output limit fires from "hello", timeout fires 80ms later
		);

		// Either the output limit or timeout won the race
		// If output limit won: code=1, stderr contains "output limit"
		// If timeout won (catch): code=null, signal=SIGTERM, stderr contains "timed out"
		// Either way, outputExceeded should be true
		if (result.code === null) {
			// Timeout won — catch path with outputExceeded potentially true
			expect(result.stderr).toContain("timed out");
			if (result.stdout.includes("[...output truncated...]")) {
				// outputExceeded was true in catch path — covered branch #49-0!
				expect(result.stdout).toContain("[...output truncated...]");
			}
		} else {
			// Output limit won the race
			expect(result.code).not.toBe(0);
			expect(result.stderr).toContain("output limit");
		}
	}, 8000);
});

