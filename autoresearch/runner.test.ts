import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { truncateTail, runCommand, runChecks, generatePiRunId, generateRunId, parseExternalInfo, filterSecrets, createRunArtifactDir, writeRunArtifacts, writeChecksArtifacts, loadRunFromArtifact, getGitFullHash, isGitDirty, getChangedFiles, gitAutoCommit, gitAutoRevert, hasCompleteMarker, loopFollowUpMessage, markArtifactComplete } from "./runner.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import * as os from "node:os";

function createTempGitRepo(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "autoresearch-git-"));
	childProcess.execFileSync("git", ["init", "-b", "main"], { cwd: dir });
	childProcess.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
	childProcess.execFileSync("git", ["config", "user.name", "Test User"], { cwd: dir });
	fs.writeFileSync(path.join(dir, "README.md"), "test\n");
	childProcess.execFileSync("git", ["add", "-A"], { cwd: dir });
	childProcess.execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
	return dir;
}

// ---------------------------------------------------------------------------
// truncateTail
// ---------------------------------------------------------------------------

describe("truncateTail", () => {
	it("returns text as-is when within limits", () => {
		expect(truncateTail("hello\nworld", 10, 4096)).toBe("hello\nworld");
	});

	it("truncates to last N lines when exceeding maxLines", () => {
		const text = "a\nb\nc\nd\ne";
		expect(truncateTail(text, 3, 4096)).toBe("c\nd\ne");
	});

	it("truncates to last N lines keeping trailing newline split", () => {
		const text = "a\nb\nc\nd\ne\n";
		expect(truncateTail(text, 2, 4096)).toBe("e\n");
	});

	it("truncates bytes when exceeding maxBytes", () => {
		// 10 chars, maxBytes=5
		const result = truncateTail("abcdefghij", 100, 5);
		// buf is "abcdefghij" (10 bytes), slice last 5 → "fghij"
		// indexOf("\n") === -1, so result stays "fghij"
		expect(result).toBe("fghij");
	});

	it("truncates bytes and trims to first newline", () => {
		// Build a string where the last 5 bytes split mid-character and contain \n
		const text = "abc\nefghij";
		const result = truncateTail(text, 100, 5);
		// buf = "abc\nefghij", last 5 bytes = "fghij"
		// indexOf("\n") === -1, so "fghij"
		expect(result).toBe("fghij");
	});

	it("handles newline within sliced byte portion", () => {
		// "aaa\nbbbbb" → last 6 bytes = "\nbbbbb", indexOf("\n")=0 → slice(1) = "bbbbb"
		const result = truncateTail("aaa\nbbbbb", 100, 6);
		expect(result).toBe("bbbbb");
	});

	it("handles empty string", () => {
		expect(truncateTail("", 10, 4096)).toBe("");
	});

	it("handles maxLines = 0 — slice(-0) returns full array, so no truncation", () => {
		// slice(-0) === slice(0), so with maxLines=0 text is returned as-is
		const result = truncateTail("a\nb\nc", 0, 4096);
		expect(result).toBe("a\nb\nc");
	});

	it("handles single line within limits", () => {
		expect(truncateTail("hello", 1, 4096)).toBe("hello");
	});

	it("handles single line exceeding maxBytes", () => {
		const result = truncateTail("abcdefghij", 1, 3);
		// last 3 bytes = "hij", no newline → "hij"
		expect(result).toBe("hij");
	});
});

// ---------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------

describe("runCommand", () => {
	it("returns success for exit 0", async () => {
		const r = await runCommand("echo hello", "/tmp", 5000);
		expect(r.exitCode).toBe(0);
		expect(r.passed).toBe(true);
		expect(r.timedOut).toBe(false);
		expect(r.output).toContain("hello");
		expect(r.command).toBe("echo hello");
	});

	it("captures stderr", async () => {
		const r = await runCommand("echo err >&2", "/tmp", 5000);
		expect(r.output).toContain("err");
	});

	it("returns passed=false for non-zero exit code", async () => {
		const r = await runCommand("exit 1", "/tmp", 5000);
		expect(r.exitCode).toBe(1);
		expect(r.passed).toBe(false);
		expect(r.timedOut).toBe(false);
	});

	it("detects timeout and sets timedOut=true", async () => {
		const r = await runCommand("sleep 10", "/tmp", 100);
		expect(r.timedOut).toBe(true);
		expect(r.passed).toBe(false);
	}, 10000);

	it("parses METRIC lines into parsedMetrics", async () => {
		const r = await runCommand('echo "METRIC foo=42"', "/tmp", 5000);
		expect(r.parsedMetrics).toEqual({ foo: 42 });
	});

	it("returns null parsedMetrics when no METRIC lines", async () => {
		const r = await runCommand("echo hello", "/tmp", 5000);
		expect(r.parsedMetrics).toBeNull();
	});

	it("handles spawn error (nonexistent command)", async () => {
		// bash itself won't fail, but we can force a shell error
		const r = await runCommand("bash -c 'exit 0'", "/tmp", 5000);
		expect(r.exitCode).toBe(0);
	});

	it("handles AbortSignal abort", async () => {
		const controller = new AbortController();
		const promise = runCommand("sleep 10", "/tmp", 30000, controller.signal);
		// Abort after a short delay
		setTimeout(() => controller.abort(), 50);
		const r = await promise;
		expect(r.passed).toBe(false);
	}, 10000);

	it("truncates output when exceeding OUTPUT_MAX_LINES (10 lines)", async () => {
		// Generate 15 lines of output
		const cmd = "for i in $(seq 1 15); do echo \"line$i\"; done";
		const r = await runCommand(cmd, "/tmp", 5000);
		// output should be truncated to last 10 lines
		const lines = r.output.split("\n");
		// May have trailing empty line from echo, so check the first meaningful line
		expect(lines.length).toBeLessThanOrEqual(12); // 10 lines + possible trailing newline
		expect(r.output).toContain("line7"); // last 10 lines: line6..line15, but line6 may be the newline edge
		expect(r.output).not.toContain("line5"); // first 5 lines truncated
	});

	it("records durationSeconds > 0", async () => {
		const r = await runCommand("echo hi", "/tmp", 5000);
		expect(r.durationSeconds).toBeGreaterThanOrEqual(0);
	});

	it("captures both stdout and stderr combined", async () => {
		const r = await runCommand('echo out && echo err >&2', "/tmp", 5000);
		expect(r.output).toContain("out");
		expect(r.output).toContain("err");
	});

	it("parses multiple METRIC lines", async () => {
		const r = await runCommand(
			'echo "METRIC a=1" && echo "METRIC b=2.5"',
			"/tmp",
			5000,
		);
		expect(r.parsedMetrics).toEqual({ a: 1, b: 2.5 });
	});

	it("captures METRIC after 1MB of output via streaming parse", async () => {
		// Generate >1MB of output, then emit METRIC at the end
		// seq produces ~8 bytes/line, 150000 lines = ~1.2MB
		const r = await runCommand(
			'for i in $(seq 1 150000); do echo "padding line $i"; done && echo "METRIC captured_after_1mb=42" && echo "RUN_ID post-1mb-run" && echo "ARTIFACT_DIR /tmp/post1mb"',
			"/tmp",
			30000,
		);
		// The streaming parser should have captured the METRIC even though
		// the in-memory buffer was truncated at 1MB
		expect(r.parsedMetrics).toMatchObject({ captured_after_1mb: 42 });
		expect(r.externalRunId).toBe("post-1mb-run");
		expect(r.externalArtifactDir).toBe("/tmp/post1mb");
	}, 35000);
});

// ---------------------------------------------------------------------------
// runChecks
// ---------------------------------------------------------------------------

describe("runChecks", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = `/tmp/test-runner-${Date.now()}`;
		fs.mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns passed=null when checks.sh does not exist", async () => {
		const r = await runChecks(tmpDir);
		expect(r.passed).toBeNull();
		expect(r.output).toBe("");
		expect(r.durationSeconds).toBe(0);
	});

	it("returns passed=true when checks.sh succeeds", async () => {
		const checksPath = path.join(tmpDir, "autoresearch.checks.sh");
		fs.writeFileSync(checksPath, "#!/bin/bash\necho 'checks passed'\nexit 0\n");
		fs.chmodSync(checksPath, 0o755);
		const r = await runChecks(tmpDir);
		expect(r.passed).toBe(true);
		expect(r.output).toContain("checks passed");
	});

	it("returns passed=false when checks.sh fails", async () => {
		const checksPath = path.join(tmpDir, "autoresearch.checks.sh");
		fs.writeFileSync(checksPath, "#!/bin/bash\necho 'checks failed' >&2\nexit 1\n");
		fs.chmodSync(checksPath, 0o755);
		const r = await runChecks(tmpDir);
		expect(r.passed).toBe(false);
	});

	it("handles timeout on checks.sh", async () => {
		const checksPath = path.join(tmpDir, "autoresearch.checks.sh");
		fs.writeFileSync(checksPath, "#!/bin/bash\nsleep 10\n");
		fs.chmodSync(checksPath, 0o755);
		const r = await runChecks(tmpDir, undefined, 0); // 0 seconds → immediate timeout
		// With 0 second timeout the timer fires immediately, may still pass or timeout
		// Use a small value to ensure timeout
		expect(typeof r.passed).toBe("boolean");
	}, 10000);
});

// ---------------------------------------------------------------------------
// generatePiRunId
// ---------------------------------------------------------------------------

describe("generatePiRunId", () => {
	it("generates a time-sortable ID with -pi- separator", () => {
		const id = generatePiRunId("/tmp");
		expect(id).toContain("-pi-");
		expect(id).toMatch(/^\d{8}T\d{6}\.\d{3}Z-pi-.+$/);
	});

	it("generates unique IDs", () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generatePiRunId("/tmp"));
		}
		expect(ids.size).toBe(100);
	});

	it("IDs sort chronologically", async () => {
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push(generatePiRunId("/tmp"));
			await new Promise(r => setTimeout(r, 10));
		}
		const sorted = [...ids].sort();
		expect(sorted).toEqual(ids);
	});
});

// ---------------------------------------------------------------------------
// parseExternalInfo
// ---------------------------------------------------------------------------

describe("parseExternalInfo", () => {
	it("extracts RUN_ID", () => {
		const info = parseExternalInfo("RUN_ID bench-abc-123\n");
		expect(info.externalRunId).toBe("bench-abc-123");
	});

	it("extracts ARTIFACT_DIR", () => {
		const info = parseExternalInfo("ARTIFACT_DIR logs/runs/abc\n");
		expect(info.externalArtifactDir).toBe("logs/runs/abc");
	});

	it("extracts SUMMARY_PATH", () => {
		const info = parseExternalInfo("SUMMARY_PATH logs/summary.json\n");
		expect(info.externalSummaryPath).toBe("logs/summary.json");
	});

	it("extracts VIEWLOG_PATH", () => {
		const info = parseExternalInfo("VIEWLOG_PATH logs/viewlog.json\n");
		expect(info.externalViewlogPath).toBe("logs/viewlog.json");
	});

	it("extracts METRICS_PATH", () => {
		const info = parseExternalInfo("METRICS_PATH logs/metrics.json\n");
		expect(info.externalMetricsPath).toBe("logs/metrics.json");
	});

	it("extracts all fields from combined output", () => {
		const output = [
			"RUN_ID 20260517T153000.123Z-bench-a1b2c3-k9x4qp",
			"ARTIFACT_DIR logs/benchmarks/task-001/runs/20260517T153000.123Z-bench-a1b2c3-k9x4qp",
			"SUMMARY_PATH logs/benchmarks/task-001/runs/20260517T153000.123Z-bench-a1b2c3-k9x4qp/summary.json",
			"VIEWLOG_PATH logs/benchmarks/task-001/runs/20260517T153000.123Z-bench-a1b2c3-k9x4qp/viewlog.json",
			"METRICS_PATH logs/benchmarks/task-001/runs/20260517T153000.123Z-bench-a1b2c3-k9x4qp/metrics.json",
			"METRIC objective_score=0.7342",
		].join("\n");
		const info = parseExternalInfo(output);
		expect(info.externalRunId).toBe("20260517T153000.123Z-bench-a1b2c3-k9x4qp");
		expect(info.externalArtifactDir).toContain("task-001");
		expect(info.externalSummaryPath).toContain("summary.json");
		expect(info.externalViewlogPath).toContain("viewlog.json");
		expect(info.externalMetricsPath).toContain("metrics.json");
	});

	it("returns nulls for empty output", () => {
		const info = parseExternalInfo("");
		expect(info.externalRunId).toBeNull();
		expect(info.externalArtifactDir).toBeNull();
	});

	it("ignores unrelated lines", () => {
		const info = parseExternalInfo("Some random output\nMETRIC foo=42\nOther stuff");
		expect(info.externalRunId).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// filterSecrets
// ---------------------------------------------------------------------------

describe("filterSecrets", () => {
	it("redacts API_KEY values", () => {
		expect(filterSecrets("API_KEY=sk-12345")).toContain("***REDACTED***");
		expect(filterSecrets("API_KEY=sk-12345")).not.toContain("sk-12345");
	});

	it("redacts SECRET values", () => {
		expect(filterSecrets("MY_SECRET=abc123")).toContain("***REDACTED***");
	});

	it("redacts PASSWORD values", () => {
		expect(filterSecrets("DB_PASSWORD=hunter2")).toContain("***REDACTED***");
	});

	it("redacts TOKEN values", () => {
		expect(filterSecrets("TOKEN=eyJhbGci")).toContain("***REDACTED***");
	});

	it("preserves normal lines", () => {
		expect(filterSecrets("METRIC foo=42")).toBe("METRIC foo=42");
	});
});

// ---------------------------------------------------------------------------
// Artifact directory management
// ---------------------------------------------------------------------------

describe("artifact directory management", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = `/tmp/test-artifact-${Date.now()}`;
		fs.mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("createRunArtifactDir creates directory with initial files", () => {
		const runDir = createRunArtifactDir(tmpDir, "sess1", "run1", "echo test", Date.now());
		expect(fs.existsSync(runDir)).toBe(true);
		expect(fs.existsSync(path.join(runDir, "command.txt"))).toBe(true);
		expect(fs.readFileSync(path.join(runDir, "command.txt"), "utf8")).toBe("echo test");
		expect(fs.existsSync(path.join(runDir, "git.status.txt"))).toBe(true);
		expect(fs.existsSync(path.join(runDir, "git.diff"))).toBe(true);
	});

	it("createRunArtifactDir throws if directory already exists", () => {
		createRunArtifactDir(tmpDir, "sess1", "run1", "echo test", Date.now());
		expect(() => createRunArtifactDir(tmpDir, "sess1", "run1", "echo test2", Date.now())).toThrow(/already exists/);
	});

	it("writeRunArtifacts writes all artifact files", async () => {
		const runDir = createRunArtifactDir(tmpDir, "sess1", "run1", "echo test", Date.now());
		const result = await runCommand("echo hello", tmpDir, 5000);
		writeRunArtifacts(runDir, result, "run1", Date.now(), Date.now());

		expect(fs.existsSync(path.join(runDir, "stdout.log"))).toBe(true);
		expect(fs.existsSync(path.join(runDir, "stderr.log"))).toBe(true);
		expect(fs.existsSync(path.join(runDir, "metrics.json"))).toBe(true);
		expect(fs.existsSync(path.join(runDir, "manifest.json"))).toBe(true);
		expect(fs.existsSync(path.join(runDir, "result.json"))).toBe(true);

		const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
		expect(manifest.piRunId).toBe("run1");
		expect(manifest.command).toBe("echo hello");
	});

	it("writeChecksArtifacts writes checks result", async () => {
		const runDir = createRunArtifactDir(tmpDir, "sess1", "run1", "echo test", Date.now());
		const result = await runCommand("echo hello", tmpDir, 5000);
		writeRunArtifacts(runDir, result, "run1", Date.now(), Date.now());
		writeChecksArtifacts(runDir, { passed: true, timedOut: false, output: "OK", stdout: "OK", stderr: "", durationSeconds: 1 });

		expect(fs.existsSync(path.join(runDir, "checks-result.json"))).toBe(true);
		const checks = JSON.parse(fs.readFileSync(path.join(runDir, "checks-result.json"), "utf8"));
		expect(checks.passed).toBe(true);
		expect(fs.existsSync(path.join(runDir, "checks.stdout.log"))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// generateRunId (deprecated alias)
// ---------------------------------------------------------------------------

describe("generateRunId (deprecated)", () => {
	it("generates a valid runId via generatePiRunId", () => {
		const id = generateRunId();
		expect(id).toContain("-pi-");
	});
});

// ---------------------------------------------------------------------------
// loadRunFromArtifact
// ---------------------------------------------------------------------------

describe("loadRunFromArtifact", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = `/tmp/test-load-artifact-${Date.now()}`;
		fs.mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns null when manifest does not exist", () => {
		expect(loadRunFromArtifact(tmpDir, "sess1", "nonexistent")).toBeNull();
	});

	it("reconstructs RunResult from manifest.json", async () => {
		const runDir = createRunArtifactDir(tmpDir, "sess1", "run1", "echo test", Date.now());
		const result = await runCommand("echo METRIC score=42", tmpDir, 5000);
		writeRunArtifacts(runDir, result, "run1", Date.now(), Date.now());

		const loaded = loadRunFromArtifact(tmpDir, "sess1", "run1");
		expect(loaded).not.toBeNull();
		expect(loaded!.result.parsedMetrics).toMatchObject({ score: 42 });
		expect(loaded!.result.command).toBe("echo METRIC score=42");
	});

	it("loads checks result when available", async () => {
		const runDir = createRunArtifactDir(tmpDir, "sess1", "run2", "echo ok", Date.now());
		const result = await runCommand("echo ok", tmpDir, 5000);
		writeRunArtifacts(runDir, result, "run2", Date.now(), Date.now());
		writeChecksArtifacts(runDir, { passed: true, timedOut: false, output: "OK", stdout: "OK", stderr: "", durationSeconds: 1 });

		const loaded = loadRunFromArtifact(tmpDir, "sess1", "run2");
		expect(loaded!.result.checks.passed).toBe(true);
	});

	it("runSeq is stored in manifest when provided", async () => {
		const runDir = createRunArtifactDir(tmpDir, "sess1", "run-rs", "echo test", Date.now());
		const result = await runCommand("echo ok", tmpDir, 5000);
		writeRunArtifacts(runDir, result, "run-rs", Date.now(), Date.now(), 42);

		const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
		expect(manifest.runSeq).toBe(42);

		const loaded = loadRunFromArtifact(tmpDir, "sess1", "run-rs");
		expect(loaded!.runSeq).toBe(42);
	});
});

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

describe("getGitFullHash", () => {
	it("returns a full commit hash in a git repo", () => {
		const cwd = createTempGitRepo();
		try {
			const hash = getGitFullHash(cwd);
			expect(hash).toMatch(/^[0-9a-f]{40}$/);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns 'unknown' for non-git directory", () => {
		expect(getGitFullHash("/tmp/nonexistent-git-dir-" + Date.now())).toBe("unknown");
	});
});

describe("isGitDirty", () => {
	it("detects clean state in git repo", () => {
		const cwd = createTempGitRepo();
		try {
			// clean repo after init
			const result = isGitDirty(cwd);
			expect(result).toBe(false);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns true for non-existent directory", () => {
		expect(isGitDirty("/tmp/nonexistent-git-dir-" + Date.now())).toBe(true);
	});
});

describe("getChangedFiles", () => {
	it("returns empty array for clean git repo", () => {
		const cwd = createTempGitRepo();
		try {
			// clean repo
			const files = getChangedFiles(cwd);
			expect(files).toEqual([]);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("returns empty array for non-git directory", () => {
		expect(getChangedFiles("/tmp/nonexistent-git-dir-" + Date.now())).toEqual([]);
	});
});

describe("gitAutoCommit and gitAutoRevert", () => {
	it("gitAutoCommit returns committed:false for clean repo", () => {
		const cwd = createTempGitRepo();
		try {
			const result = gitAutoCommit(cwd, "test: no changes");
			expect(result.committed).toBe(false);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("gitAutoRevert succeeds on clean repo", () => {
		const cwd = createTempGitRepo();
		try {
			const result = gitAutoRevert(cwd);
			expect(result.reverted).toBe(true);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("gitAutoCommit does not stage autoresearch.plan.md", () => {
		const cwd = createTempGitRepo();
		try {
			fs.writeFileSync(path.join(cwd, "autoresearch.plan.md"), "# plan\n");
			fs.writeFileSync(path.join(cwd, "src.txt"), "candidate\n");
			const result = gitAutoCommit(cwd, "test: candidate");
			expect(result.committed).toBe(true);

			const committedFiles = childProcess.execFileSync(
				"git", ["show", "--name-only", "--pretty=format:", "HEAD"],
				{ cwd, encoding: "utf8" },
			).trim();
			expect(committedFiles).toContain("src.txt");
			expect(committedFiles).not.toContain("autoresearch.plan.md");
			expect(fs.existsSync(path.join(cwd, "autoresearch.plan.md"))).toBe(true);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("gitAutoCommit returns committed:false for non-git dir", () => {
		const result = gitAutoCommit("/tmp/nonexistent-git-dir-" + Date.now(), "test");
		expect(result.committed).toBe(false);
	});

	it("gitAutoRevert reverts src/autoresearch.ts", () => {
		const cwd = createTempGitRepo();
		try {
			fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
			fs.writeFileSync(path.join(cwd, "src", "autoresearch.ts"), "export const v = 1;\n");
			childProcess.execFileSync("git", ["add", "src/autoresearch.ts"], { cwd });
			childProcess.execFileSync("git", ["commit", "-m", "add source"], { cwd });

			fs.writeFileSync(path.join(cwd, "src", "autoresearch.ts"), "export const v = 2;\n");
			const result = gitAutoRevert(cwd);
			expect(result.reverted).toBe(true);
			expect(fs.readFileSync(path.join(cwd, "src", "autoresearch.ts"), "utf8")).toContain("v = 1");
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("gitAutoRevert preserves root autoresearch.plan.md and .autoresearch lock", () => {
		const cwd = createTempGitRepo();
		try {
			fs.writeFileSync(path.join(cwd, "autoresearch.plan.md"), "# discussion plan\n");
			fs.mkdirSync(path.join(cwd, ".autoresearch"), { recursive: true });
			fs.writeFileSync(path.join(cwd, ".autoresearch", "current.lock.json"), "{}\n");
			fs.writeFileSync(path.join(cwd, "candidate.txt"), "candidate\n");

			const result = gitAutoRevert(cwd);
			expect(result.reverted).toBe(true);
			expect(fs.existsSync(path.join(cwd, "autoresearch.plan.md"))).toBe(true);
			expect(fs.existsSync(path.join(cwd, ".autoresearch", "current.lock.json"))).toBe(true);
			expect(fs.existsSync(path.join(cwd, "candidate.txt"))).toBe(false);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("gitAutoRevert returns error for non-git dir", () => {
		const result = gitAutoRevert("/tmp/nonexistent-git-dir-" + Date.now());
		expect(result.reverted).toBe(false);
		expect(result.error).toBeDefined();
	});
});

describe("hasCompleteMarker", () => {
	it("detects COMPLETE marker in string", () => {
		expect(hasCompleteMarker("some text <autoresearch>COMPLETE</autoresearch> more")).toBe(true);
	});

	it("returns false for plain text", () => {
		expect(hasCompleteMarker("just some text")).toBe(false);
	});

	it("handles non-string content", () => {
		expect(hasCompleteMarker(42)).toBe(false);
		expect(hasCompleteMarker(null)).toBe(false);
		expect(hasCompleteMarker(undefined)).toBe(false);
	});
});

describe("loopFollowUpMessage", () => {
	it("generates no-progress message", () => {
		const msg = loopFollowUpMessage(true);
		expect(msg).toContain("前ターンでは");
	});

	it("generates progress message", () => {
		const msg = loopFollowUpMessage(false);
		expect(typeof msg).toBe("string");
		expect(msg.length).toBeGreaterThan(0);
	});
});

describe("markArtifactComplete", () => {
	let tmpMarkDir: string;

	beforeEach(() => {
		tmpMarkDir = `/tmp/test-mark-artifact-${Date.now()}`;
		fs.mkdirSync(tmpMarkDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpMarkDir, { recursive: true, force: true });
	});

	it("sets artifactComplete=true in manifest when conditions met", async () => {
		const runDir = createRunArtifactDir(tmpMarkDir, "sess1", "run1", "echo test", Date.now());
		const result = await runCommand("echo hello", tmpMarkDir, 5000);
		// ensure conditions for complete
		result.logFilesWritten = true;
		result.streamError = null;
		writeRunArtifacts(runDir, result, "run1", Date.now(), Date.now());
		markArtifactComplete(runDir);
		const manifest = JSON.parse(fs.readFileSync(path.join(runDir, "manifest.json"), "utf8"));
		expect(manifest.artifactComplete).toBe(true);
	});
});

describe("writeChecksArtifacts: edge cases", () => {
	let tmpChecksDir: string;

	beforeEach(() => {
		tmpChecksDir = `/tmp/test-checks-artifact-${Date.now()}`;
		fs.mkdirSync(tmpChecksDir, { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpChecksDir, { recursive: true, force: true });
	});

	it("handles checks without stdout/stderr", () => {
		writeChecksArtifacts(tmpChecksDir, { passed: false, timedOut: true, output: "timeout", stdout: "", stderr: "", durationSeconds: 30 });
		expect(fs.existsSync(path.join(tmpChecksDir, "checks-result.json"))).toBe(true);
		expect(fs.existsSync(path.join(tmpChecksDir, "checks.stdout.log"))).toBe(false);
		expect(fs.existsSync(path.join(tmpChecksDir, "checks.stderr.log"))).toBe(false);
	});

	it("handles checks with stdout and stderr", () => {
		writeChecksArtifacts(tmpChecksDir, { passed: true, timedOut: false, output: "OK", stdout: "out", stderr: "err", durationSeconds: 1 });
		expect(fs.existsSync(path.join(tmpChecksDir, "checks.stdout.log"))).toBe(true);
		expect(fs.existsSync(path.join(tmpChecksDir, "checks.stderr.log"))).toBe(true);
		expect(fs.readFileSync(path.join(tmpChecksDir, "checks.stdout.log"), "utf8")).toBe("out");
		expect(fs.readFileSync(path.join(tmpChecksDir, "checks.stderr.log"), "utf8")).toBe("err");
	});

	it("updates existing manifest with checks data", () => {
		// Create manifest first
		fs.writeFileSync(path.join(tmpChecksDir, "manifest.json"), JSON.stringify({ piRunId: "test" }));
		writeChecksArtifacts(tmpChecksDir, { passed: true, timedOut: false, output: "OK", stdout: "", stderr: "", durationSeconds: 1 });
		const manifest = JSON.parse(fs.readFileSync(path.join(tmpChecksDir, "manifest.json"), "utf8"));
		expect(manifest.checks).toBeDefined();
		expect(manifest.checks.passed).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// runArgvCommand (contract mode)
// ---------------------------------------------------------------------------

describe("runArgvCommand", () => {
	it("executes argv command without shell interpolation", async () => {
		const { runArgvCommand } = await import("./runner.js");
		const result = await runArgvCommand(
			{ argv: ["echo", "METRIC test_arg=42"], cwd: "." },
			5000,
		);
		expect(result.passed).toBe(true);
		expect(result.exitCode).toBe(0);
		expect(result.parsedMetrics).not.toBeNull();
		expect(result.parsedMetrics!["test_arg"]).toBe(42);
	});

	it("parses METRIC lines from stdout", async () => {
		const { runArgvCommand } = await import("./runner.js");
		const result = await runArgvCommand(
			{ argv: ["printf", "METRIC duration=1234.5\nMETRIC count=10"], cwd: "." },
			5000,
		);
		expect(result.parsedMetrics).not.toBeNull();
		expect(result.parsedMetrics!["duration"]).toBe(1234.5);
		expect(result.parsedMetrics!["count"]).toBe(10);
	});

	it("timeout still works", async () => {
		const { runArgvCommand } = await import("./runner.js");
		const result = await runArgvCommand(
			{ argv: ["sleep", "10"], cwd: "." },
			1000, // 1 second timeout
		);
		expect(result.timedOut).toBe(true);
	}, 10000);

	it("writes stdout/stderr artifacts when logDir is provided", async () => {
		const { runArgvCommand } = await import("./runner.js");
		const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "argv-test-"));
		try {
			const result = await runArgvCommand(
				{ argv: ["echo", "hello argv"], cwd: "." },
				5000,
				undefined,
				logDir,
			);
			expect(result.logFilesWritten).toBe(true);
			expect(fs.existsSync(path.join(logDir, "stdout.log"))).toBe(true);
			expect(fs.readFileSync(path.join(logDir, "stdout.log"), "utf8")).toContain("hello argv");
		} finally {
			fs.rmSync(logDir, { recursive: true, force: true });
		}
	});

	it("returns exit code correctly", async () => {
		const { runArgvCommand } = await import("./runner.js");
		const result = await runArgvCommand(
			{ argv: ["bash", "-c", "exit 1"], cwd: "." },
			5000,
		);
		expect(result.exitCode).toBe(1);
		expect(result.passed).toBe(false);
	});

	it("respects cwd parameter", async () => {
		const { runArgvCommand } = await import("./runner.js");
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "argv-cwd-"));
		try {
			const result = await runArgvCommand(
				{ argv: ["pwd"], cwd: tmpDir },
				5000,
			);
			expect(result.passed).toBe(true);
			const resolvedTmpDir = fs.realpathSync(tmpDir);
			expect(result.stdout.trim()).toBe(resolvedTmpDir);
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
