/**
 * Search Tools Integration Tests (vitest version)
 *
 * Tests for file_candidates, code_search, sym_index, and sym_find tools.
 * Migrated from .pi/tests/legacy/search-tools-test.ts
 *
 * @jest-environment node
 */

import { spawn } from "node:child_process";
import { describe, it, beforeAll, expect } from "vitest";

// ============================================
// Tool Availability (synchronous check)
// ============================================

function checkToolSync(tool: string): boolean {
	try {
		const result = require("node:child_process").spawnSync("which", [tool]);
		return result.status === 0;
	} catch {
		return false;
	}
}

const hasFd = checkToolSync("fd");
const hasRg = checkToolSync("rg");
const hasCtags = checkToolSync("ctags");

// ============================================
// Test Utilities
// ============================================

interface ExecuteResult {
	code: number;
	stdout: string;
	stderr: string;
	time: number;
}

async function execute(
	command: string,
	args: string[] = [],
	options: { cwd?: string; timeout?: number } = {}
): Promise<ExecuteResult> {
	const startTime = Date.now();
	const cwd = options.cwd ?? process.cwd();
	const timeout = options.timeout ?? 30000;

	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";

		const proc = spawn(command, args, {
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const timeoutId = setTimeout(() => {
			proc.kill("SIGTERM");
		}, timeout);

		proc.stdout.on("data", (data: Buffer) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		proc.on("close", (code) => {
			clearTimeout(timeoutId);
			resolve({
				code: code ?? 1,
				stdout,
				stderr,
				time: Date.now() - startTime,
			});
		});

		proc.on("error", (err) => {
			clearTimeout(timeoutId);
			resolve({
				code: 1,
				stdout,
				stderr: err.message,
				time: Date.now() - startTime,
			});
		});
	});
}

interface ToolAvailability {
	fd: boolean;
	rg: boolean;
	ctags: boolean;
}

async function checkToolAvailability(): Promise<ToolAvailability> {
	const fdResult = await execute("which", ["fd"]);
	const rgResult = await execute("which", ["rg"]);
	const ctagsResult = await execute("which", ["ctags"]);

	return {
		fd: fdResult.code === 0,
		rg: rgResult.code === 0,
		ctags: ctagsResult.code === 0,
	};
}

// ============================================
// Test Suite
// ============================================

describe("Search Tools Integration", () => {
	beforeAll(() => {
		console.log("\n=== Tool Availability ===");
		console.log(`fd:     ${hasFd ? "available" : "NOT AVAILABLE"}`);
		console.log(`rg:     ${hasRg ? "available" : "NOT AVAILABLE"}`);
		console.log(`ctags:  ${hasCtags ? "available" : "NOT AVAILABLE"}`);
	});

	// ============================================
	// file_candidates Tests (fd)
	// ============================================
	describe("file_candidates (fd)", () => {
		it.runIf(hasFd)(
			"basic file enumeration",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					".",
					".pi/extensions/search",
					"--max-results",
					"10",
					"--exclude",
					".git",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				expect(lines.length).toBeGreaterThan(0);
				expect(result.time).toBeLessThan(1000);
			}
		);

		it.runIf(hasFd)(
			"with extension filter",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					".",
					".pi/extensions/search",
					"-e",
					"ts",
					"--max-results",
					"20",
					"--exclude",
					".git",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				expect(lines.length).toBeGreaterThan(0);
				for (const line of lines) {
					expect(line.endsWith(".ts")).toBe(true);
				}
			}
		);

		it.runIf(hasFd)(
			"with exclude patterns",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					".",
					".pi",
					"--max-results",
					"20",
					"--exclude",
					".git",
					"--exclude",
					"test",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				for (const line of lines) {
					expect(line.includes("/test/")).toBe(false);
				}
			}
		);

		it.runIf(hasFd)(
			"with maxDepth",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					".",
					".pi",
					"--max-depth",
					"2",
					"--max-results",
					"20",
					"--exclude",
					".git",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				for (const line of lines) {
					const depth = line.split("/").length;
					expect(depth).toBeLessThanOrEqual(3);
				}
			}
		);

		it.runIf(hasFd)(
			"type directory",
			async () => {
				const result = await execute("fd", [
					"-t",
					"d",
					".",
					".pi",
					"--max-depth",
					"2",
					"--max-results",
					"10",
					"--exclude",
					".git",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				expect(lines.length).toBeGreaterThan(0);
			}
		);

		it.runIf(hasFd)(
			"empty result",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					"nonexistent_pattern_xyz123",
					".pi",
					"--max-results",
					"10",
				]);
				expect([0, 1]).toContain(result.code);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				expect(lines.length).toBe(0);
			}
		);

		it.runIf(hasFd)(
			"limit enforcement",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					".",
					".pi",
					"--max-results",
					"5",
					"--exclude",
					".git",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				expect(lines.length).toBeLessThanOrEqual(5);
			}
		);
	});

	// ============================================
	// code_search Tests (rg)
	// ============================================
	describe("code_search (rg)", () => {
		it.runIf(hasRg)(
			"basic search",
			async () => {
				const result = await execute("rg", [
					"--json",
					"import",
					".pi/extensions/search",
					"-c",
				]);
				expect([0, 1]).toContain(result.code);
				expect(result.time).toBeLessThan(1000);
			}
		);

		it.runIf(hasRg)(
			"with type filter",
			async () => {
				const result = await execute("rg", [
					"--json",
					"function",
					".pi",
					"--type",
					"ts",
					"-c",
				]);
				expect([0, 1]).toContain(result.code);
			}
		);

		it.runIf(hasRg)(
			"literal search",
			async () => {
				const result = await execute("rg", [
					"--json",
					"--fixed-strings",
					"execute",
					".pi/extensions/search",
					"-c",
				]);
				expect([0, 1]).toContain(result.code);
			}
		);

		it.runIf(hasRg)(
			"case insensitive",
			async () => {
				const result = await execute("rg", [
					"--json",
					"--ignore-case",
					"EXECUTE",
					".pi/extensions/search",
					"-c",
				]);
				expect([0, 1]).toContain(result.code);
			}
		);

		it.runIf(hasRg)(
			"regex pattern",
			async () => {
				const result = await execute("rg", [
					"--json",
					"export (async )?function \\w+",
					".pi/extensions/search",
					"-c",
				]);
				expect([0, 1]).toContain(result.code);
			}
		);

		it.runIf(hasRg)(
			"context lines",
			async () => {
				const result = await execute("rg", [
					"--json",
					"--context",
					"2",
					"export async function execute",
					".pi/extensions/search/utils/cli.ts",
				]);
				expect([0, 1]).toContain(result.code);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				let hasContext = false;
				for (const line of lines) {
					try {
						const parsed = JSON.parse(line);
						if (parsed.type === "context") hasContext = true;
					} catch {
						// Skip
					}
				}
				expect(hasContext).toBe(true);
			}
		);

		it.runIf(hasRg)(
			"no matches returns exit code 1",
			async () => {
				const result = await execute("rg", [
					"--json",
					"NONEXISTENT_PATTERN_XYZ123",
					".pi/extensions/search",
				]);
				expect(result.code).toBe(1);
			}
		);

		it.runIf(hasRg)(
			"invalid regex returns exit code 2",
			async () => {
				const result = await execute("rg", [
					"--json",
					"[invalid",
					".pi/extensions/search",
				]);
				expect(result.code).toBe(2);
				expect(result.stderr).toContain("regex parse error");
			}
		);
	});

	// ============================================
	// sym_index Tests (ctags)
	// ============================================
	describe("sym_index (ctags)", () => {
		it.runIf(hasCtags)(
			"JSON output format check",
			async () => {
				const helpResult = await execute("ctags", ["--help"]);
				expect(helpResult.stdout).toContain("json");
			}
		);

		it.runIf(hasCtags)(
			"basic indexing",
			async () => {
				const result = await execute("ctags", [
					"--output-format=json",
					"--fields=+n+s+S+k",
					"--extras=+q",
					"--sort=no",
					"-R",
					".pi/extensions/search",
					"--exclude=node_modules",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);
				expect(lines.length).toBeGreaterThan(0);
			}
		);

		it.runIf(hasCtags)(
			"symbol kinds",
			async () => {
				const result = await execute("ctags", [
					"--output-format=json",
					"--fields=+n+s+S+k",
					"--extras=+q",
					"--sort=no",
					"-R",
					".pi/extensions/search",
					"--exclude=node_modules",
				]);
				expect(result.code).toBe(0);
				const lines = result.stdout.trim().split("\n").filter(Boolean);

				const kinds = new Set<string>();
				for (const line of lines) {
					try {
						const parsed = JSON.parse(line);
						if (parsed.kind) kinds.add(parsed.kind);
					} catch {
						// Skip
					}
				}

				expect(kinds.has("function")).toBe(true);
			}
		);
	});

	// ============================================
	// Performance Tests
	// ============================================
	describe("Performance", () => {
		it.runIf(hasFd)(
			"fd cold start < 500ms",
			async () => {
				const result = await execute("fd", [
					"-t",
					"f",
					".",
					".pi/extensions/search",
					"--max-results",
					"100",
					"--exclude",
					".git",
				]);
				expect(result.time).toBeLessThan(500);
			}
		);

		it.runIf(hasRg)(
			"rg cold start < 500ms",
			async () => {
				const result = await execute("rg", [
					"--json",
					"import",
					".pi/extensions/search",
				]);
				expect(result.time).toBeLessThan(500);
			}
		);

		it.runIf(hasCtags)(
			"ctags indexing < 5000ms",
			async () => {
				const result = await execute("ctags", [
					"--output-format=json",
					"--fields=+n+s+S+k",
					"--extras=+q",
					"--sort=no",
					"-R",
					".pi/extensions/search",
					"--exclude=node_modules",
				]);
				expect(result.time).toBeLessThan(5000);
			}
		);

		it.runIf(hasRg)(
			"multiple searches < 1000ms",
			async () => {
				const startTime = Date.now();
				for (let i = 0; i < 5; i++) {
					await execute("rg", [
						"--json",
						"import",
						".pi/extensions/search",
						"-c",
					]);
				}
				const totalTime = Date.now() - startTime;
				expect(totalTime).toBeLessThan(1000);
			}
		);
	});

	// ============================================
	// Integration Tests
	// ============================================
	describe("Integration", () => {
		it.runIf(hasFd || !hasRg)(
			"file_candidates + code_search workflow",
			async () => {
				// Step 1: Find TypeScript files
				const fdResult = await execute("fd", [
					"-t",
					"f",
					".",
					".pi/extensions/search",
					"-e",
					"ts",
					"--max-results",
					"10",
					"--exclude",
					".git",
				]);
				expect(fdResult.code).toBe(0);
				const files = fdResult.stdout.trim().split("\n").filter(Boolean);
				expect(files.length).toBeGreaterThan(0);

				// Step 2: Search for a pattern in first file
				const firstFile = files[0];
				const rgResult = await execute("rg", ["--json", "import", firstFile]);
				expect([0, 1]).toContain(rgResult.code);
			}
		);

		it.runIf(hasCtags)(
			"sym_index + sym_find workflow",
			async () => {
				// Step 1: Generate index
				const indexResult = await execute("ctags", [
					"--output-format=json",
					"--fields=+n+s+S+k",
					"--extras=+q",
					"--sort=no",
					"-R",
					".pi/extensions/search",
					"--exclude=node_modules",
				]);
				expect(indexResult.code).toBe(0);
				const entries = indexResult.stdout.trim().split("\n").filter(Boolean);

				// Step 2: Find function symbols
				const functions: Array<{ name: string; file: string; line: number }> =
					[];
				for (const entry of entries) {
					try {
						const parsed = JSON.parse(entry);
						if (parsed.kind === "function") {
							functions.push({
								name: parsed.name,
								file: parsed.path,
								line: parsed.line,
							});
						}
					} catch {
						// Skip
					}
				}

				expect(functions.length).toBeGreaterThan(0);
			}
		);

		it.runIf(hasFd || !hasRg)(
			"concurrent tool execution",
			async () => {
				const startTime = Date.now();

				// Run fd and rg concurrently
				const [fdResult, rgResult] = await Promise.all([
					execute("fd", [
						"-t",
						"f",
						".",
						".pi/extensions/search",
						"--max-results",
						"50",
						"--exclude",
						".git",
					]),
					execute("rg", ["--json", "export", ".pi/extensions/search", "-c"]),
				]);

				const totalTime = Date.now() - startTime;
				expect(fdResult.code).toBe(0);
				expect([0, 1]).toContain(rgResult.code);
				expect(totalTime).toBeLessThan(1000);
			}
		);
	});
});
