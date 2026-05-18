/**
 * autoresearch/contract.test.ts — Experiment Contract のテスト。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import {
	writeContract,
	readContract,
	contractExists,
	contractFilePath,
	deleteContract,
	validateContract,
	validateGitSafety,
	validateCommand,
	validateChangedFiles,
	buildContract,
	isGitRepo,
	isWorkingTreeClean,
	DEFAULT_ACCEPTANCE,
	DEFAULT_SAFETY,
	DEFAULT_CHECKS,
	type ExperimentContract,
} from "./contract.js";

function gitInitForTest(cwd: string): void {
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
	childProcess.execFileSync("git", ["config", "user.email", "test@example.com"], { cwd, stdio: "ignore" });
	childProcess.execFileSync("git", ["config", "user.name", "Test User"], { cwd, stdio: "ignore" });
}

function createGitTestDir(prefix = "contract-test"): string {
	const testDir = `/tmp/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	fs.mkdirSync(testDir, { recursive: true });
	gitInitForTest(testDir);
	fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
	childProcess.execFileSync("git", ["add", "README.md"], { cwd: testDir, stdio: "ignore" });
	childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });
	return testDir;
}

describe("contract module", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createGitTestDir();
	});

	afterEach(() => {
		try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
	});

	// ── File I/O ─────────────────────────────────────────────

	describe("file I/O", () => {
		it("contractExists returns false when no contract file", () => {
			expect(contractExists(testDir)).toBe(false);
		});

		it("writeContract + readContract roundtrip", () => {
			const contract = buildContract({
				name: "test",
				sessionId: "sess-1",
				metricName: "duration_seconds",
				metricUnit: "seconds",
				direction: "lower",
				metricMethod: "wall_clock",
				benchmarkCommand: "./bench.sh",
			});
			writeContract(testDir, contract);
			expect(contractExists(testDir)).toBe(true);

			const loaded = readContract(testDir);
			expect(loaded).not.toBeNull();
			expect(loaded!.objective).toBe("test");
			expect(loaded!.primaryMetric.name).toBe("duration_seconds");
			expect(loaded!.primaryMetric.direction).toBe("lower");
			expect(loaded!.primaryMetric.method).toBe("wall_clock");
			expect(loaded!.acceptance.mode).toBe("better_than_best");
			expect(loaded!.safety.requireGit).toBe(true);
		});

		it("readContract returns null for non-existent file", () => {
			expect(readContract(testDir)).toBeNull();
		});

		it("deleteContract removes the file", () => {
			const contract = buildContract({
				name: "test", sessionId: "s", metricName: "x", metricUnit: "",
				direction: "lower", metricMethod: "wall_clock", benchmarkCommand: "./x",
			});
			writeContract(testDir, contract);
			expect(contractExists(testDir)).toBe(true);
			deleteContract(testDir);
			expect(contractExists(testDir)).toBe(false);
		});
	});

	// ── Git safety ─────────────────────────────────────────────

	describe("git safety", () => {
		it("isGitRepo returns true for git repo", () => {
			expect(isGitRepo(testDir)).toBe(true);
		});

		it("isGitRepo returns false for non-git dir", () => {
			const nonGit = `/tmp/contract-test-nongit-${Date.now()}`;
			fs.mkdirSync(nonGit, { recursive: true });
			expect(isGitRepo(nonGit)).toBe(false);
			fs.rmSync(nonGit, { recursive: true, force: true });
		});

		it("isWorkingTreeClean returns true for clean repo", () => {
			expect(isWorkingTreeClean(testDir)).toBe(true);
		});

		it("isWorkingTreeClean returns false for dirty repo", () => {
			fs.writeFileSync(path.join(testDir, "dirty.txt"), "dirty");
			expect(isWorkingTreeClean(testDir)).toBe(false);
		});

		it("validateGitSafety passes for clean git repo", () => {
			const violations = validateGitSafety(testDir, DEFAULT_SAFETY);
			expect(violations).toEqual([]);
		});

		it("validateGitSafety fails for non-git dir", () => {
			const nonGit = `/tmp/contract-test-nongit2-${Date.now()}`;
			fs.mkdirSync(nonGit, { recursive: true });
			const violations = validateGitSafety(nonGit, DEFAULT_SAFETY);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("git repo");
			fs.rmSync(nonGit, { recursive: true, force: true });
		});

		it("validateGitSafety fails for dirty repo", () => {
			fs.writeFileSync(path.join(testDir, "dirty.txt"), "dirty");
			const violations = validateGitSafety(testDir, DEFAULT_SAFETY);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("未コミット");
		});

		it("validateGitSafety skips git check when requireGit=false", () => {
			const nonGit = `/tmp/contract-test-nongit3-${Date.now()}`;
			fs.mkdirSync(nonGit, { recursive: true });
			const safety = { ...DEFAULT_SAFETY, requireGit: false };
			const violations = validateGitSafety(nonGit, safety);
			expect(violations).toEqual([]);
			fs.rmSync(nonGit, { recursive: true, force: true });
		});
	});

	// ── Command policy ─────────────────────────────────────────

	describe("command policy", () => {
		it("allows safe commands", () => {
			expect(validateCommand("echo hello", DEFAULT_SAFETY)).toEqual([]);
			expect(validateCommand("npm test", DEFAULT_SAFETY)).toEqual([]);
			expect(validateCommand("./bench.sh", DEFAULT_SAFETY)).toEqual([]);
		});

		it("rejects sudo commands", () => {
			const violations = validateCommand("sudo rm -rf /", DEFAULT_SAFETY);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("sudo");
		});

		it("rejects rm -rf / commands", () => {
			const violations = validateCommand("rm -rf /", DEFAULT_SAFETY);
			expect(violations.length).toBeGreaterThan(0);
		});
	});

	// ── Changed files policy ────────────────────────────────────

	describe("changed files policy", () => {
		it("allows all files when no paths specified", () => {
			expect(validateChangedFiles(["src/a.ts", "lib/b.ts"], DEFAULT_SAFETY)).toEqual([]);
		});

		it("rejects files outside allowedPaths", () => {
			const safety = { ...DEFAULT_SAFETY, allowedPaths: ["^src/"] };
			const violations = validateChangedFiles(["src/a.ts", "lib/b.ts"], safety);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("lib/b.ts");
		});

		it("allows files matching allowedPaths", () => {
			const safety = { ...DEFAULT_SAFETY, allowedPaths: ["^src/"] };
			expect(validateChangedFiles(["src/a.ts", "src/b.ts"], safety)).toEqual([]);
		});

		it("rejects files matching excludedPaths", () => {
			const safety = { ...DEFAULT_SAFETY, excludedPaths: ["\\.env"] };
			const violations = validateChangedFiles(["src/a.ts", ".env"], safety);
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain(".env");
		});
	});

	// ── Contract validation ─────────────────────────────────────

	describe("contract validation", () => {
		it("validates a complete contract", () => {
			const contract = buildContract({
				name: "perf",
				sessionId: "sess-1",
				metricName: "duration_seconds",
				metricUnit: "seconds",
				direction: "lower",
				metricMethod: "wall_clock",
				benchmarkCommand: "./bench.sh",
			});
			const result = validateContract(contract);
			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it("rejects contract without objective", () => {
			const contract = buildContract({
				name: "", sessionId: "s", metricName: "x", metricUnit: "",
				direction: "lower", metricMethod: "wall_clock", benchmarkCommand: "./x",
			});
			contract.objective = "";
			const result = validateContract(contract);
			expect(result.valid).toBe(false);
			expect(result.errors.some(e => e.includes("objective"))).toBe(true);
		});

		it("warns about manual acceptance mode", () => {
			const contract = buildContract({
				name: "test", sessionId: "s", metricName: "x", metricUnit: "",
				direction: "lower", metricMethod: "wall_clock", benchmarkCommand: "./x",
				acceptanceMode: "manual",
			});
			const result = validateContract(contract);
			expect(result.warnings.some(w => w.includes("manual"))).toBe(true);
		});

		it("warns about single wall_clock measurement", () => {
			const contract = buildContract({
				name: "test", sessionId: "s", metricName: "duration_seconds", metricUnit: "s",
				direction: "lower", metricMethod: "wall_clock", benchmarkCommand: "./x",
			});
			const result = validateContract(contract);
			expect(result.warnings.some(w => w.includes("単発"))).toBe(true);
		});

		it("rejects improvement_threshold without minImprovement", () => {
			const contract = buildContract({
				name: "test", sessionId: "s", metricName: "x", metricUnit: "",
				direction: "lower", metricMethod: "wall_clock", benchmarkCommand: "./x",
				acceptanceMode: "improvement_threshold", minImprovement: 0,
			});
			const result = validateContract(contract);
			expect(result.valid).toBe(false);
			expect(result.errors.some(e => e.includes("minImprovement"))).toBe(true);
		});
	});
});
