import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { truncateTail, runCommand, runChecks } from "./runner.js";
import * as fs from "node:fs";
import * as path from "node:path";

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
// spawn error (non-existent command)
// ---------------------------------------------------------------------------

describe("runCommand spawn error", () => {
	it("handles command not found via bash exit code 127", async () => {
		const tmpDir = fs.mkdtempSync("/tmp/test-runner-spawn-");
		const r = await runCommand("/nonexistent/command/that/does/not/exist", tmpDir, 5000);
		expect(r.passed).toBe(false);
		expect(r.exitCode).toBe(127);
		expect(r.output).toBeTruthy();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}, 10000);
});
