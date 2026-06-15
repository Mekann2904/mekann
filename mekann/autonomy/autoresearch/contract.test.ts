/**
 * autoresearch/contract.test.ts — V1 contract builder + safety のテスト。
 *
 * legacy ExperimentContract shape は廃止済み。本テストは V1 builder (buildContractV1) と
 * V1 safety helpers (validateScopeGitSafety, validateCommandString, validateWritePaths) を検証する。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import {
	buildContractV1,
	validateContractV1,
	normalizeAcceptanceMode,
	normalizeAggregate,
	validateScopeGitSafety,
	validateCommandString,
	DEFAULT_FORBIDDEN_COMMAND_PATTERNS,
	validateWritePaths,
	type InitContractV1Params,
} from "./contractV1.js";

function gitInitForTest(cwd: string): void {
	// Test git identity is injected via env vars in vitest.setup.ts (issue #39).
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
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

function baseInitParams(overrides?: Partial<InitContractV1Params>): InitContractV1Params {
	return {
		name: "test",
		metricName: "duration_seconds",
		metricUnit: "seconds",
		direction: "lower",
		metricMethod: "wall_clock",
		benchmarkCommand: "./autoresearch.sh",
		...overrides,
	};
}

describe("V1 contract builder + safety", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createGitTestDir();
	});

	afterEach(() => {
		try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
	});

	// ── Builder ─────────────────────────────────────────────

	describe("buildContractV1", () => {
		it("builds a valid V1 contract", () => {
			const contract = buildContractV1(baseInitParams());
			expect(contract.schemaVersion).toBe("autoresearch/v1");
			expect(contract.objective.summary).toBe("test");
			expect(contract.evaluation.primaryMetric.name).toBe("duration_seconds");
			expect(contract.evaluation.primaryMetric.direction).toBe("lower");
			expect(contract.evaluation.benchmark.command.argv).toEqual(["bash", "./autoresearch.sh"]);
			expect(contract.acceptance.mode).toBe("better_than_baseline");
			expect(contract.scope.requireGit).toBe(true);
			const validation = validateContractV1(contract);
			expect(validation.valid).toBe(true);
		});

		it("uses metric_line source for stdout_metric method", () => {
			const contract = buildContractV1(baseInitParams({ metricMethod: "stdout_metric" }));
			expect(contract.evaluation.primaryMetric.source.type).toBe("metric_line");
		});

		it("uses wall_clock source for wall_clock method", () => {
			const contract = buildContractV1(baseInitParams({ metricMethod: "wall_clock" }));
			expect(contract.evaluation.primaryMetric.source.type).toBe("wall_clock");
		});

		it("builds checks when checksMode is not none", () => {
			const contract = buildContractV1(baseInitParams({ checksMode: "script" }));
			expect(contract.evaluation.checks.length).toBe(1);
		});

		it("builds empty checks when checksMode is none", () => {
			const contract = buildContractV1(baseInitParams({ checksMode: "none" }));
			expect(contract.evaluation.checks.length).toBe(0);
		});
	});

	// ── Mode / aggregate normalization ───────────────────────

	describe("normalizeAcceptanceMode", () => {
		it("passes through better_than_best", () => {
			expect(normalizeAcceptanceMode("better_than_best")).toBe("better_than_best");
		});
		it("passes through better_than_baseline", () => {
			expect(normalizeAcceptanceMode("better_than_baseline")).toBe("better_than_baseline");
		});
		it("maps legacy manual to better_than_best", () => {
			expect(normalizeAcceptanceMode("manual")).toBe("better_than_best");
		});
		it("maps legacy improvement_threshold to better_than_baseline", () => {
			expect(normalizeAcceptanceMode("improvement_threshold")).toBe("better_than_baseline");
		});
		it("defaults to better_than_baseline for undefined", () => {
			expect(normalizeAcceptanceMode(undefined)).toBe("better_than_baseline");
		});
	});

	describe("normalizeAggregate", () => {
		it("passes through valid V1 aggregates", () => {
			expect(normalizeAggregate("median")).toBe("median");
			expect(normalizeAggregate("mean")).toBe("mean");
			expect(normalizeAggregate("min")).toBe("min");
			expect(normalizeAggregate("max")).toBe("max");
		});
		it("maps legacy single to median", () => {
			expect(normalizeAggregate("single")).toBe("median");
		});
		it("defaults to median for undefined", () => {
			expect(normalizeAggregate(undefined)).toBe("median");
		});
	});

	// ── Git safety (V1 scope) ───────────────────────────────

	describe("validateScopeGitSafety", () => {
		it("passes for clean git repo", () => {
			const violations = validateScopeGitSafety(testDir, { requireGit: true, requireCleanGitWorktree: true });
			expect(violations).toEqual([]);
		});

		it("fails for non-git dir when requireGit=true", () => {
			const nonGit = `/tmp/contract-test-nongit2-${Date.now()}`;
			fs.mkdirSync(nonGit, { recursive: true });
			const violations = validateScopeGitSafety(nonGit, { requireGit: true, requireCleanGitWorktree: true });
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("git repo");
			fs.rmSync(nonGit, { recursive: true, force: true });
		});

		it("fails for dirty repo when requireCleanGitWorktree=true", () => {
			fs.writeFileSync(path.join(testDir, "dirty.txt"), "dirty");
			const violations = validateScopeGitSafety(testDir, { requireGit: true, requireCleanGitWorktree: true });
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("未コミット");
		});

		it("skips git check when requireGit=false", () => {
			const nonGit = `/tmp/contract-test-nongit3-${Date.now()}`;
			fs.mkdirSync(nonGit, { recursive: true });
			const violations = validateScopeGitSafety(nonGit, { requireGit: false, requireCleanGitWorktree: true });
			expect(violations).toEqual([]);
			fs.rmSync(nonGit, { recursive: true, force: true });
		});
	});

	// ── Command policy (string command, autoresearch_run 向け) ────

	describe("validateCommandString", () => {
		it("allows safe commands", () => {
			expect(validateCommandString("echo hello")).toEqual([]);
			expect(validateCommandString("npm test")).toEqual([]);
			expect(validateCommandString("./autoresearch.sh")).toEqual([]);
		});

		it("rejects sudo commands", () => {
			const violations = validateCommandString("sudo rm -rf /");
			expect(violations.length).toBeGreaterThan(0);
			expect(violations[0]).toContain("sudo");
		});

		it("rejects rm -rf / commands", () => {
			const violations = validateCommandString("rm -rf /");
			expect(violations.length).toBeGreaterThan(0);
		});

		it("uses DEFAULT_FORBIDDEN_COMMAND_PATTERNS by default", () => {
			expect(DEFAULT_FORBIDDEN_COMMAND_PATTERNS.length).toBeGreaterThan(0);
		});
	});

	// ── Write paths validation (V1) ─────────────────────────

	describe("validateWritePaths", () => {
		it("allows all files when no paths specified", () => {
			expect(validateWritePaths(["src/a.ts", "lib/b.ts"], [], []).violations).toEqual([]);
		});

		it("rejects files not matching allowedWritePaths", () => {
			const result = validateWritePaths(["src/a.ts", "lib/b.ts"], ["src/"], []);
			expect(result.violations.length).toBeGreaterThan(0);
		});

		it("allows files matching allowedWritePaths", () => {
			expect(validateWritePaths(["src/a.ts", "src/b.ts"], ["src/"], []).violations).toEqual([]);
		});

		it("rejects files matching forbiddenWritePaths", () => {
			const result = validateWritePaths(["src/a.ts", ".env"], [], [".env"]);
			expect(result.violations.length).toBeGreaterThan(0);
			expect(result.violations[0]).toContain(".env");
		});
	});
});
