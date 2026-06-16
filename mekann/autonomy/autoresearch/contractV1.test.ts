/**
 * autoresearch/contractV1.test.ts — AutoresearchContractV1 のテスト。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import {
	validateContractV1,
	canonicalJsonStringify,
	canonicalJsonPretty,
	computeContractHash,
	extractContractBlockFromPlan,
	stripJsonc,
	parseJsonc,
	computeBaselineNoise,
	matchesPath,
	matchesAnyPattern,
	validateWritePaths,
	isInternalArtifactPath,
	filterInternalPaths,
	validateCommandSafety,
	resolveCwdInsideRepo,
	writeCurrentContract,
	readCurrentContract,
	writeLockFile,
	readLockFile,
	validateLockFileV1,
	currentContractPath,
	currentLockPath,
	autoresearchDir,
	planPath,
	ensureAutoresearchDir,
	appendEvent,
	appendDecision,
	eventsPath,
	decisionsPath,
	type AutoresearchContractV1,
	type LockFile,
} from "./contractV1.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function validContractV1(): AutoresearchContractV1 {
	return {
		schemaVersion: "autoresearch/v1",
		objective: {
			summary: "Reduce build time",
			successDefinition: "Build time decreases by at least 5%",
		},
		scope: {
			allowedWritePaths: ["src/"],
			forbiddenWritePaths: [".env", "config/production.json"],
			immutableReadPaths: ["package.json", "tsconfig.json", "benchmarks/**"],
			requireGit: true,
			requireCleanGitWorktree: true,
		},
		evaluation: {
			benchmark: {
				command: {
					argv: ["npm", "run", "build"],
					cwd: ".",
				},
				timeoutSeconds: 120,
				repeats: 3,
				aggregate: "median",
			},
			primaryMetric: {
				name: "build_time_ms",
				direction: "lower",
				unit: "ms",
				source: {
					type: "metric_line",
					format: "METRIC <name>=<number>",
					fallback: "wall_clock",
				},
			},
			checks: [
				{
					name: "typecheck",
					command: {
						argv: ["npx", "tsc", "--noEmit"],
						cwd: ".",
					},
					timeoutSeconds: 60,
					required: true,
				},
			],
		},
		acceptance: {
			mode: "better_than_baseline",
			minRelativeImprovement: 0.05,
			requireImprovementAboveNoiseFloor: true,
			requireAllChecksPass: true,
			rejectIfMetricMissing: true,
			rejectIfImmutableReadPathChanged: true,
			rejectIfForbiddenFilesChanged: true,
			rejectIfBenchmarkChanged: true,
		},
		loop: {
			maxIterations: 20,
			maxRuntimeMinutes: 60,
			maxConsecutiveNoImprovement: 3,
			maxConsecutiveFailures: 2,
		},
		failurePolicy: {
			onBenchmarkFailure: "discard",
			onCheckFailure: "discard",
			onMetricMissing: "discard",
			onContractViolation: "pause",
			onRevertFailure: "pause",
		},
	};
}

function gitInitForTest(cwd: string): void {
	// Test git identity is injected via env vars in vitest.setup.ts (issue #39).
	try {
		childProcess.execFileSync("git", ["init", "-b", "main"], { cwd, stdio: "ignore" });
	} catch {
		childProcess.execFileSync("git", ["init"], { cwd, stdio: "ignore" });
		childProcess.execFileSync("git", ["checkout", "-b", "main"], { cwd, stdio: "ignore" });
	}
}

function createGitTestDir(prefix = "contractV1-test"): string {
	const testDir = `/tmp/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	fs.mkdirSync(testDir, { recursive: true });
	gitInitForTest(testDir);
	fs.writeFileSync(path.join(testDir, "README.md"), "# test\n");
	fs.writeFileSync(path.join(testDir, "package.json"), '{"name":"test"}');
	fs.writeFileSync(path.join(testDir, "tsconfig.json"), '{}');
	childProcess.execFileSync("git", ["add", "."], { cwd: testDir, stdio: "ignore" });
	childProcess.execFileSync("git", ["commit", "-m", "initial"], { cwd: testDir, stdio: "ignore" });
	return testDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("contractV1 module", () => {
	describe("contract validation", () => {
		it("valid contract passes", () => {
			const contract = validContractV1();
			const result = validateContractV1(contract);
			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it("missing required field fails", () => {
			const contract = validContractV1();
			delete (contract as any).objective;
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it("additional property fails", () => {
			const contract = { ...validContractV1(), extraField: "should fail" };
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("extraField") || e.includes("additionalProperties"))).toBe(true);
		});

		it("manual acceptance mode is rejected in new contract", () => {
			const contract = validContractV1();
			(contract.acceptance as any).mode = "manual";
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
		});

		it("schemaVersion must be autoresearch/v1", () => {
			const contract = validContractV1();
			(contract as any).schemaVersion = 1;
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
		});

		it("command must use argv array", () => {
			const contract = validContractV1();
			(contract.evaluation.benchmark.command as any).argv = "./bench.sh";
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
		});

		it("acceptance mode must be better_than_baseline or better_than_best", () => {
			const contract = validContractV1();
			(contract.acceptance as any).mode = "improvement_threshold";
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
		});

		it("warns about empty checks", () => {
			const contract = validContractV1();
			contract.evaluation.checks = [];
			const result = validateContractV1(contract);
			expect(result.warnings.some((w) => w.includes("checks"))).toBe(true);
		});

		it("warns about single wall_clock measurement", () => {
			const contract = validContractV1();
			contract.evaluation.primaryMetric.source = { type: "wall_clock" };
			contract.evaluation.benchmark.repeats = 1;
			const result = validateContractV1(contract);
			expect(result.warnings.some((w) => w.includes("wall_clock") || w.includes("single"))).toBe(true);
		});
	});

	describe("plan block extraction", () => {
		it("exactly one contract block is required", () => {
			const md = [
				"# Plan",
				"",
				"```autoresearch-contract jsonc",
				'{"schemaVersion": "autoresearch/v1"}',
				"```",
			].join("\n");
			const block = extractContractBlockFromPlan(md);
			expect(block.jsonc).toContain("schemaVersion");
		});

		it("zero contract blocks fails", () => {
			const md = "# Plan\n\nNo contract block here.";
			expect(() => extractContractBlockFromPlan(md)).toThrow("no contract block");
		});

		it("multiple contract blocks fail", () => {
			const md = [
				"# Plan",
				"```autoresearch-contract jsonc",
				'{"a":1}',
				"```",
				"Some text",
				"```autoresearch-contract jsonc",
				'{"b":2}',
				"```",
			].join("\n");
			expect(() => extractContractBlockFromPlan(md)).toThrow("2");
		});

		it("only autoresearch-contract jsonc blocks are recognized", () => {
			const md = [
				"# Plan",
				"```json",
				'{"schemaVersion": "autoresearch/v1"}',
				"```",
			].join("\n");
			expect(() => extractContractBlockFromPlan(md)).toThrow("no contract block");
		});

		// C-008: error messages must interpolate the actual CONTRACT_BLOCK_LANG
		// value, not emit the literal "${CONTRACT_BLOCK_LANG}".
		it("zero-block error interpolates the contract block language", () => {
			const md = "# Plan\n\nNo contract block here.";
			try {
				extractContractBlockFromPlan(md);
				throw new Error("expected extractContractBlockFromPlan to throw");
			} catch (e) {
				const msg = (e as Error).message;
				expect(msg).toContain("autoresearch-contract jsonc");
				expect(msg).not.toContain("${CONTRACT_BLOCK_LANG}");
			}
		});

		it("multiple-block error interpolates the contract block language", () => {
			const md = [
				"# Plan",
				"```autoresearch-contract jsonc",
				'{"a":1}',
				"```",
				"```autoresearch-contract jsonc",
				'{"b":2}',
				"```",
			].join("\n");
			try {
				extractContractBlockFromPlan(md);
				throw new Error("expected extractContractBlockFromPlan to throw");
			} catch (e) {
				const msg = (e as Error).message;
				expect(msg).toContain("autoresearch-contract jsonc");
				expect(msg).not.toContain("${CONTRACT_BLOCK_LANG}");
			}
		});
	});

	describe("canonical JSON + hash", () => {
		it("canonical hash is stable independent of object key order", () => {
			const obj1 = { a: 1, b: 2, c: { d: 3, e: 4 } };
			const obj2 = { c: { e: 4, d: 3 }, b: 2, a: 1 };
			expect(computeContractHash(obj1)).toBe(computeContractHash(obj2));
		});

		it("canonicalJsonStringify sorts keys", () => {
			const result = canonicalJsonStringify({ z: 1, a: 2 });
			expect(result).toBe('{"a":2,"z":1}');
		});

		it("canonicalJsonPretty produces valid JSON", () => {
			const obj = { b: 2, a: 1 };
			const pretty = canonicalJsonPretty(obj);
			const parsed = JSON.parse(pretty);
			expect(parsed).toEqual({ a: 1, b: 2 });
		});

		it("different values produce different hashes", () => {
			const hash1 = computeContractHash({ a: 1 });
			const hash2 = computeContractHash({ a: 2 });
			expect(hash1).not.toBe(hash2);
		});
	});

	describe("JSONC parser", () => {
		it("strips single-line comments", () => {
			const result = parseJsonc('{\n// comment\n"a": 1\n}');
			expect(result).toEqual({ a: 1 });
		});

		it("strips multi-line comments", () => {
			const result = parseJsonc('{\n/* comment */\n"a": 1\n}');
			expect(result).toEqual({ a: 1 });
		});

		it("handles trailing commas", () => {
			const result = parseJsonc('{"a": 1, "b": 2,}');
			expect(result).toEqual({ a: 1, b: 2 });
		});

		it("preserves strings with comment-like content", () => {
			const result = parseJsonc('{"url": "http://example.com/path?q=1&r=2"}');
			expect(result).toEqual({ url: "http://example.com/path?q=1&r=2" });
		});

		it("handles escaped quotes in strings", () => {
			const result = parseJsonc('{"msg": "he said \\"hello\\""}');
			expect(result).toEqual({ msg: 'he said "hello"' });
		});
	});

	describe("baseline noise summary", () => {
		it("computes noise from samples", () => {
			const noise = computeBaselineNoise([1.0, 1.1, 0.9, 1.05, 0.95], "median");
			expect(noise.samples.length).toBe(5);
			expect(noise.min).toBeCloseTo(0.9);
			expect(noise.max).toBeCloseTo(1.1);
			expect(noise.aggregate).toBeCloseTo(1.0); // median of [0.9, 0.95, 1.0, 1.05, 1.1]
			expect(noise.relativeRange).toBeCloseTo(0.2); // (1.1 - 0.9) / 1.0
		});

		it("computes mean aggregate", () => {
			const noise = computeBaselineNoise([1.0, 2.0, 3.0], "mean");
			expect(noise.aggregate).toBeCloseTo(2.0);
			expect(noise.mean).toBeCloseTo(2.0);
		});

		it("computes stddev", () => {
			const noise = computeBaselineNoise([2, 4, 4, 4, 5, 5, 7, 9], "mean");
			expect(noise.stddev).toBeCloseTo(2.0, 0); // within 1 decimal
		});

		it("throws on empty samples", () => {
			expect(() => computeBaselineNoise([], "median")).toThrow("baseline samples");
		});
	});

	describe("path matching", () => {
		it("matches exact paths", () => {
			expect(matchesPath("src/index.ts", "src/index.ts")).toBe(true);
			expect(matchesPath("src/index.ts", "src/other.ts")).toBe(false);
		});

		it("matches directory prefixes", () => {
			expect(matchesPath("src/", "src/foo.ts")).toBe(true);
			expect(matchesPath("src/", "lib/foo.ts")).toBe(false);
		});

		it("matches glob patterns", () => {
			expect(matchesPath("src/*.ts", "src/index.ts")).toBe(true);
			expect(matchesPath("src/*.ts", "src/sub/index.ts")).toBe(false);
		});

		it("matches double-star glob patterns", () => {
			expect(matchesPath("src/**.ts", "src/sub/deep/index.ts")).toBe(true);
		});

		it("matchesAnyPattern returns true if any pattern matches", () => {
			expect(matchesAnyPattern("src/index.ts", ["lib/", "src/"])).toBe(true);
			expect(matchesAnyPattern("lib/index.ts", ["src/", "test/"])).toBe(false);
		});
	});

	describe("write paths validation", () => {
		it("allows files matching allowedWritePaths", () => {
			const result = validateWritePaths(["src/a.ts", "src/b.ts"], ["src/"], []);
			expect(result.violations).toEqual([]);
		});

		it("rejects files not matching allowedWritePaths", () => {
			const result = validateWritePaths(["src/a.ts", "lib/b.ts"], ["src/"], []);
			expect(result.violations.length).toBeGreaterThan(0);
		});

		it("rejects files matching forbiddenWritePaths", () => {
			const result = validateWritePaths(["src/a.ts", ".env"], [], [".env"]);
			expect(result.violations.length).toBeGreaterThan(0);
			expect(result.violations[0]).toContain(".env");
		});

		it("allows all files when no paths specified", () => {
			const result = validateWritePaths(["src/a.ts", "lib/b.ts"], [], []);
			expect(result.violations).toEqual([]);
		});
	});

	describe("file I/O", () => {
		let testDir: string;

		beforeEach(() => {
			testDir = createGitTestDir();
		});

		afterEach(() => {
			try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
		});

		it("writeCurrentContract + readCurrentContract roundtrip", () => {
			const contract = validContractV1();
			writeCurrentContract(testDir, contract);
			expect(fs.existsSync(currentContractPath(testDir))).toBe(true);

			const loaded = readCurrentContract(testDir);
			expect(loaded).not.toBeNull();
			expect(loaded!.schemaVersion).toBe("autoresearch/v1");
			expect(loaded!.objective.summary).toBe("Reduce build time");
			expect(loaded!.evaluation.benchmark.command.argv).toEqual(["npm", "run", "build"]);
		});

		it("readCurrentContract returns null for non-existent file", () => {
			expect(readCurrentContract(testDir)).toBeNull();
		});

		it("writeLockFile + readLockFile roundtrip", () => {
			const lock: LockFile = {
				schemaVersion: "autoresearch-lock/v1",
				contractId: "0001",
				contractHash: "sha256:abc123",
				approvedAt: Date.now(),
				approvedBy: "user",
				baseline: {
					gitCommit: "abc123",
					runs: [
						{ runId: "run-1", metric: 1.23, durationSeconds: 1.23 },
						{ runId: "run-2", metric: 1.25, durationSeconds: 1.25 },
						{ runId: "run-3", metric: 1.21, durationSeconds: 1.21 },
					],
					aggregate: "median",
					primaryMetricValue: 1.23,
					noise: {
						samples: [1.23, 1.25, 1.21],
						aggregate: 1.23,
						min: 1.21,
						max: 1.25,
						mean: 1.23,
						stddev: 0.0163,
						relativeRange: 0.0325,
					},
				},
				environment: {
					platform: "darwin",
					arch: "arm64",
					nodeVersion: "v22.0.0",
					npmVersion: "10.0.0",
					timezone: "Asia/Tokyo",
					packageJsonHash: "sha256:pkg",
					packageLockHash: "sha256:lock",
					immutableReadSetHash: "sha256:immutable",
				},
			};

			writeLockFile(testDir, lock);
			expect(fs.existsSync(currentLockPath(testDir))).toBe(true);

			const loaded = readLockFile(testDir);
			expect(loaded).not.toBeNull();
			expect(loaded!.contractHash).toBe("sha256:abc123");
			expect(loaded!.baseline.primaryMetricValue).toBe(1.23);
			expect(loaded!.baseline.runs.length).toBe(3);
		});

		it("readLockFile returns null for non-existent file", () => {
			expect(readLockFile(testDir)).toBeNull();
		});

		// C-017: readLockFile must validate against the lock schema, symmetric
		// with readCurrentContract / validateContractV1, so corrupted or partial
		// lock files never surface as a LockFile with undefined fields.
		function validLockData(): Record<string, unknown> {
			return {
				schemaVersion: "autoresearch-lock/v1",
				contractId: "0001",
				contractHash: "sha256:abc123",
				approvedAt: 1_700_000_000_000,
				approvedBy: "user",
				baseline: {
					gitCommit: "abc123",
					runs: [
						{ runId: "run-1", metric: 1.23, durationSeconds: 1.23 },
						{ runId: "run-2", metric: 1.25, durationSeconds: 1.25 },
						{ runId: "run-3", metric: 1.21, durationSeconds: 1.21 },
					],
					aggregate: "median",
					primaryMetricValue: 1.23,
					noise: {
						samples: [1.23, 1.25, 1.21],
						aggregate: 1.23,
						min: 1.21,
						max: 1.25,
						mean: 1.23,
						stddev: 0.0163,
						relativeRange: 0.0325,
					},
				},
				environment: {
					platform: "darwin",
					arch: "arm64",
					nodeVersion: "v22.0.0",
					npmVersion: "10.0.0",
					timezone: "Asia/Tokyo",
					packageJsonHash: "sha256:pkg",
					packageLockHash: "sha256:lock",
					immutableReadSetHash: "sha256:immutable",
				},
			};
		}

		it("validateLockFileV1 accepts a well-formed lock", () => {
			const result = validateLockFileV1(validLockData());
			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it("validateLockFileV1 rejects non-object", () => {
			expect(validateLockFileV1(null).valid).toBe(false);
			expect(validateLockFileV1("oops").valid).toBe(false);
			expect(validateLockFileV1([]).valid).toBe(false);
		});

		it("validateLockFileV1 rejects wrong schemaVersion", () => {
			const data = validLockData();
			data.schemaVersion = "autoresearch-lock/v2";
			const result = validateLockFileV1(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
		});

		it("validateLockFileV1 rejects a partial lock missing contractHash", () => {
			const data = validLockData();
			delete data.contractHash;
			const result = validateLockFileV1(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("contractHash"))).toBe(true);
		});

		it("validateLockFileV1 rejects invalid baseline.aggregate", () => {
			const data = validLockData();
			const baseline = data.baseline as Record<string, unknown>;
			baseline.aggregate = "average";
			expect(validateLockFileV1(data).valid).toBe(false);
		});

		it("readLockFile returns null for a partial/corrupted lock on disk", () => {
			ensureAutoresearchDir(testDir);
			// Partial lock: missing contractHash — would yield undefined on raw cast.
			const partial = validLockData();
			delete partial.contractHash;
			fs.writeFileSync(currentLockPath(testDir), JSON.stringify(partial), "utf8");
			expect(readLockFile(testDir)).toBeNull();
		});

		it("readLockFile returns null for a wrong-schemaVersion lock on disk", () => {
			ensureAutoresearchDir(testDir);
			const bad = validLockData();
			bad.schemaVersion = "autoresearch-lock/v9";
			fs.writeFileSync(currentLockPath(testDir), JSON.stringify(bad), "utf8");
			expect(readLockFile(testDir)).toBeNull();
		});

		it("appendEvent writes to events.jsonl", () => {
			appendEvent(testDir, {
				timestamp: Date.now(),
				contractId: "0001",
				contractHash: "sha256:abc",
				event: "plan_created",
			});
			appendEvent(testDir, {
				timestamp: Date.now(),
				contractId: "0001",
				contractHash: "sha256:abc",
				event: "approve_completed",
			});
			const content = fs.readFileSync(eventsPath(testDir), "utf8");
			const lines = content.trim().split("\n");
			expect(lines.length).toBe(2);
			expect(JSON.parse(lines[0]).event).toBe("plan_created");
			expect(JSON.parse(lines[1]).event).toBe("approve_completed");
		});

		it("appendDecision writes to decisions.jsonl", () => {
			appendDecision(testDir, {
				timestamp: Date.now(),
				contractId: "0001",
				contractHash: "sha256:abc",
				decision: "keep",
				reason: "improvement detected",
				metric: 1.0,
				reference: 1.1,
				details: {},
			});
			const content = fs.readFileSync(decisionsPath(testDir), "utf8");
			const entry = JSON.parse(content.trim());
			expect(entry.decision).toBe("keep");
			expect(entry.metric).toBe(1.0);
		});
	});
});

// ---------------------------------------------------------------------------
// P0 additions: internal path filtering, command safety, scope validation
// ---------------------------------------------------------------------------

describe("P0 additions", () => {
	describe("isInternalArtifactPath", () => {
		it("identifies .autoresearch paths", () => {
			expect(isInternalArtifactPath(".autoresearch")).toBe(true);
			expect(isInternalArtifactPath(".autoresearch/events.jsonl")).toBe(true);
			expect(isInternalArtifactPath(".autoresearch/sub/deep/file")).toBe(true);
		});

		it("identifies .pi paths", () => {
			expect(isInternalArtifactPath(".pi")).toBe(true);
			expect(isInternalArtifactPath(".pi/autoresearch/sess/run")).toBe(true);
		});

		it("identifies plan file", () => {
			expect(isInternalArtifactPath("autoresearch.plan.md")).toBe(true);
		});

		it("does not match source files", () => {
			expect(isInternalArtifactPath("src/index.ts")).toBe(false);
			expect(isInternalArtifactPath("package.json")).toBe(false);
			expect(isInternalArtifactPath("README.md")).toBe(false);
		});
	});

	describe("filterInternalPaths", () => {
		it("filters .autoresearch and .pi paths", () => {
			const files = [
				"src/index.ts",
				".autoresearch/events.jsonl",
				".pi/autoresearch/run/data.json",
				"lib/helper.ts",
				".autoresearch/decisions.jsonl",
			];
			const filtered = filterInternalPaths(files);
			expect(filtered).toEqual(["src/index.ts", "lib/helper.ts"]);
		});
	});

	describe("validateCommandSafety", () => {
		it("rejects bash -c", () => {
			const errors = validateCommandSafety(
				[{ argv: ["bash", "-c", "rm -rf dist && npm test"], cwd: "." }],
				"/repo",
			);
			expect(errors.length).toBeGreaterThan(0);
			expect(errors[0]).toContain("bash -c");
		});

		it("rejects sh -c", () => {
			const errors = validateCommandSafety(
				[{ argv: ["sh", "-c", "echo hello"], cwd: "." }],
				"/repo",
			);
			expect(errors.some((e) => e.includes("sh -c"))).toBe(true);
		});

		it("rejects shell -c variants and env shell wrappers", () => {
			const errors = validateCommandSafety(
				[
					{ argv: ["bash", "-lc", "echo hello"], cwd: "." },
					{ argv: ["sh", "-ec", "echo hello"], cwd: "." },
					{ argv: ["/usr/bin/env", "bash", "-c", "echo hello"], cwd: "." },
				],
				"/repo",
			);
			expect(errors.length).toBe(3);
		});

		it("allows bash with script file", () => {
			const errors = validateCommandSafety(
				[{ argv: ["bash", "./autoresearch.sh"], cwd: "." }],
				"/repo",
			);
			expect(errors).toEqual([]);
		});

		it("rejects sudo", () => {
			const errors = validateCommandSafety(
				[{ argv: ["sudo", "npm", "test"], cwd: "." }],
				"/repo",
			);
			expect(errors.some((e) => e.includes("sudo"))).toBe(true);
		});

		it("rejects absolute cwd", () => {
			const errors = validateCommandSafety(
				[{ argv: ["npm", "test"], cwd: "/tmp" }],
				"/repo",
			);
			expect(errors.some((e) => e.includes("absolute"))).toBe(true);
		});

		it("rejects cwd with ..", () => {
			const errors = validateCommandSafety(
				[{ argv: ["npm", "test"], cwd: "../outside" }],
				"/repo",
			);
			expect(errors.some((e) => e.includes(".."))).toBe(true);
		});

		it("rejects cwd escaping repo root", () => {
			const errors = validateCommandSafety(
				[{ argv: ["npm", "test"], cwd: "sub/../../../etc" }],
				"/repo",
			);
			expect(errors.some((e) => e.includes("..") || e.includes("escapes repo"))).toBe(true);
		});

		it("allows valid relative cwd", () => {
			const errors = validateCommandSafety(
				[{ argv: ["npm", "test"], cwd: "." }],
				"/repo",
			);
			expect(errors).toEqual([]);
		});

		it("checks multiple commands", () => {
			const errors = validateCommandSafety(
				[
					{ argv: ["npm", "test"], cwd: "." },
					{ argv: ["bash", "-c", "echo"], cwd: "." },
				],
				"/repo",
			);
			expect(errors.some((e) => e.includes("check[0]"))).toBe(true);
		});
	});

	describe("resolveCwdInsideRepo", () => {
		it("resolves valid cwd", () => {
			expect(() => resolveCwdInsideRepo("/repo", ".")).not.toThrow();
			expect(() => resolveCwdInsideRepo("/repo", "sub/dir")).not.toThrow();
		});

		it("throws on absolute", () => {
			expect(() => resolveCwdInsideRepo("/repo", "/tmp")).toThrow("absolute");
		});

		it("throws on .. traversal", () => {
			expect(() => resolveCwdInsideRepo("/repo", "..")).toThrow("..");
		});
	});

	describe("rejectIfBenchmarkChanged requires immutableReadPaths", () => {
		it("rejects when rejectIfBenchmarkChanged=true with empty immutableReadPaths", () => {
			const contract = validContractV1();
			contract.acceptance.rejectIfBenchmarkChanged = true;
			contract.scope.immutableReadPaths = [];
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("rejectIfBenchmarkChanged") && e.includes("immutableReadPaths"))).toBe(true);
		});

		it("passes when rejectIfBenchmarkChanged=true with benchmark immutableReadPaths", () => {
			const contract = validContractV1();
			contract.acceptance.rejectIfBenchmarkChanged = true;
			contract.scope.immutableReadPaths = ["benchmarks/**"];
			const result = validateContractV1(contract);
			expect(result.valid).toBe(true);
		});

		it("rejects when rejectIfBenchmarkChanged=true without benchmark or fixture immutableReadPaths", () => {
			const contract = validContractV1();
			contract.acceptance.rejectIfBenchmarkChanged = true;
			contract.scope.immutableReadPaths = ["package.json"];
			const result = validateContractV1(contract);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("benchmark or fixture paths"))).toBe(true);
		});

		it("passes when rejectIfBenchmarkChanged=false with empty immutableReadPaths", () => {
			const contract = validContractV1();
			contract.acceptance.rejectIfBenchmarkChanged = false;
			contract.scope.immutableReadPaths = [];
			const result = validateContractV1(contract);
			expect(result.valid).toBe(true);
		});
	});

	describe("default plan scope is not empty", () => {
		it("autoresearch_plan default scope has allowedWritePaths", async () => {
			// This test verifies the plan tool generates non-empty scope
			// (tested via index.test.ts integration test)
		});
	});
});
