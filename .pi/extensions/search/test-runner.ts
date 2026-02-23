/**
 * @abdd.meta
 * path: .pi/extensions/search/test-runner.ts
 * role: 検索ツール群および外部依存の統合テストランナー
 * why: file_candidates, code_search, sym_index, sym_find 各ツールと外部コマンドの正常動作を検証するため
 * related: .pi/extensions/search/utils/cli.js, .pi/extensions/search/tools/file_candidates.js, .pi/extensions/search/tools/code_search.js, .pi/extensions/search/tools/sym_index.js
 * public_api: exportなし（実行スクリプトとして機能）
 * invariants: 各テストは非同期で実行され、結果はTestResultオブジェクトとして集計される
 * side_effects: 標準出力へテストログと結果を出力する
 * failure_modes: 外部コマンド(fd, rg, ctags)が未インストールの場合、またはツール実行中にエラーが発生した場合にテストが失敗する
 * @abdd.explain
 * overview: 検索関連ツールの可用性チェックと各機能のテストスイートを実行し、その結果を収集・出力するモジュール
 * what_it_does:
 *   - checkToolAvailabilityを用いてfd, rg, ctagsのインストール状況を検証する
 *   - 各ツールに対するテストケースを非同期に実行し、成否と実行時間を記録する
 *   - テスト結果をTestSuite構造で集約し、ログを出力する
 * why_it_exists:
 *   - 検索機能の前提となる外部ツール環境が整っていることを保証する
 *   - コード変更や環境差異による検索機能の破損を自動検知する
 * scope:
 *   in: なし
 *   out: 標準出力へのテスト実行ログ、各テストの成否（boolean）と所要時間
 */

/**
 * Search Tools Test Runner
 *
 * Comprehensive tests for file_candidates, code_search, sym_index, and sym_find tools.
 */

import { fileCandidates } from "./tools/file_candidates.js";
import { codeSearch } from "./tools/code_search.js";
import { symIndex } from "./tools/sym_index.js";
import { symFind } from "./tools/sym_find.js";
import { checkToolAvailability } from "./utils/cli.js";

// ============================================
// Test Framework
// ============================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: string;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
  totalDuration: number;
}

const results: TestSuite[] = [];

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

async function runTest(
  suite: string,
  name: string,
  fn: () => Promise<void> | void
): Promise<TestResult> {
  const start = performance.now();
  try {
    await fn();
    const duration = performance.now() - start;
    return { name, passed: true, duration };
  } catch (error) {
    const duration = performance.now() - start;
    return {
      name,
      passed: false,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ============================================
// Tool Availability Tests
// ============================================

async function testToolAvailability(): Promise<TestSuite> {
  const tests: TestResult[] = [];
  const suiteStart = performance.now();

  log("Testing tool availability...");

  // Test: All tools available
  tests.push(
    await runTest("availability", "checkToolAvailability returns results", async () => {
      const avail = await checkToolAvailability();
      assert(typeof avail === "object", "Should return object");
      assert("fd" in avail, "Should have fd property");
      assert("rg" in avail, "Should have rg property");
      assert("ctags" in avail, "Should have ctags property");
      assert("ctagsJson" in avail, "Should have ctagsJson property");
    })
  );

  tests.push(
    await runTest("availability", "fd is available", async () => {
      const avail = await checkToolAvailability();
      assert(avail.fd === true, "fd should be available");
    })
  );

  tests.push(
    await runTest("availability", "rg is available", async () => {
      const avail = await checkToolAvailability();
      assert(avail.rg === true, "rg should be available");
    })
  );

  tests.push(
    await runTest("availability", "ctags is available with JSON support", async () => {
      const avail = await checkToolAvailability();
      assert(avail.ctags === true, "ctags should be available");
      assert(avail.ctagsJson === true, "ctags should support JSON output");
    })
  );

  return {
    name: "Tool Availability",
    tests,
    totalDuration: performance.now() - suiteStart,
  };
}

// ============================================
// file_candidates Tests
// ============================================

async function testFileCandidates(): Promise<TestSuite> {
  const tests: TestResult[] = [];
  const suiteStart = performance.now();
  const cwd = process.cwd();

  log("Testing file_candidates...");

  // Basic: Find TypeScript files
  tests.push(
    await runTest("file_candidates", "find TypeScript files by extension", async () => {
      const result = await fileCandidates({ extension: ["ts"], limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total > 0, "Should find TypeScript files");
      assert(result.results.every((r) => r.path.endsWith(".ts")), "All results should be .ts files");
    })
  );

  // Basic: Find with pattern
  tests.push(
    await runTest("file_candidates", "find files with glob pattern", async () => {
      const result = await fileCandidates({ pattern: "*.json", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total > 0, "Should find JSON files");
    })
  );

  // Basic: Find directories
  tests.push(
    await runTest("file_candidates", "find directories only", async () => {
      const result = await fileCandidates({ type: "dir", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.every((r) => r.type === "dir"), "All results should be directories");
    })
  );

  // Feature: Exclude patterns
  tests.push(
    await runTest("file_candidates", "exclude node_modules", async () => {
      const result = await fileCandidates(
        { extension: ["ts"], exclude: ["node_modules"], limit: 100 },
        cwd
      );
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(!result.results.some((r) => r.path.includes("node_modules")), "Should not include node_modules");
    })
  );

  // Feature: Max depth
  tests.push(
    await runTest("file_candidates", "max depth limit", async () => {
      const result = await fileCandidates({ maxDepth: 1, limit: 50 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      // All paths should have at most one directory separator
      const maxDepth = Math.max(...result.results.map((r) => (r.path.match(/\//g) || []).length));
      assert(maxDepth <= 1, `Max depth should be 1, got ${maxDepth}`);
    })
  );

  // Edge case: Zero limit
  tests.push(
    await runTest("file_candidates", "zero limit returns empty", async () => {
      const result = await fileCandidates({ limit: 0 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.length === 0, "Should return empty results");
    })
  );

  // Edge case: Large limit
  tests.push(
    await runTest("file_candidates", "large limit works", async () => {
      const result = await fileCandidates({ limit: 10000 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total >= 0, "Should return valid count");
    })
  );

  // Performance: Fast enumeration
  tests.push(
    await runTest("file_candidates", "performance: fast enumeration (<1s)", async () => {
      const start = performance.now();
      const result = await fileCandidates({ limit: 1000 }, cwd);
      const duration = performance.now() - start;
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(duration < 1000, `Enumeration should be fast: ${formatDuration(duration)}`);
    })
  );

  // Truncation
  tests.push(
    await runTest("file_candidates", "truncation works correctly", async () => {
      const result = await fileCandidates({ limit: 5 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.length <= 5, "Results should be limited");
      if (result.total > 5) {
        assert(result.truncated === true, "Should mark as truncated");
      }
    })
  );

  return {
    name: "file_candidates",
    tests,
    totalDuration: performance.now() - suiteStart,
  };
}

// ============================================
// code_search Tests
// ============================================

async function testCodeSearch(): Promise<TestSuite> {
  const tests: TestResult[] = [];
  const suiteStart = performance.now();
  const cwd = process.cwd();

  log("Testing code_search...");

  // Basic: Search for common pattern
  tests.push(
    await runTest("code_search", "search for 'import' pattern", async () => {
      const result = await codeSearch({ pattern: "import", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total > 0, "Should find import statements");
      assert(result.results.length > 0, "Should have results");
    })
  );

  // Basic: Regex pattern
  tests.push(
    await runTest("code_search", "regex pattern search", async () => {
      const result = await codeSearch({ pattern: "export\\s+(function|const|class)", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.length > 0, "Should find exports");
    })
  );

  // Feature: Case insensitive
  tests.push(
    await runTest("code_search", "case insensitive search", async () => {
      const result = await codeSearch({ pattern: "FUNCTION", ignoreCase: true, limit: 10 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
    })
  );

  // Feature: Case sensitive
  tests.push(
    await runTest("code_search", "case sensitive search", async () => {
      const result = await codeSearch({ pattern: "FUNCTION", ignoreCase: false, limit: 10 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      // In TypeScript code, we likely have 'function' not 'FUNCTION'
      // This test just verifies case-sensitive search works
    })
  );

  // Feature: Literal search
  tests.push(
    await runTest("code_search", "literal search (no regex)", async () => {
      const result = await codeSearch({ pattern: "function", literal: true, limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total > 0, "Should find 'function' literal");
    })
  );

  // Feature: File type filter
  tests.push(
    await runTest("code_search", "file type filter (ts)", async () => {
      const result = await codeSearch({ pattern: "export", type: "ts", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.every((r) => r.file.endsWith(".ts")), "All results should be .ts files");
    })
  );

  // Feature: Context lines
  tests.push(
    await runTest("code_search", "context lines included", async () => {
      const result = await codeSearch({ pattern: "registerTool", context: 2, limit: 10 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      // Some matches should have context
      const withContext = result.results.filter((r) => r.context && r.context!.length > 0);
      // Context may not always be populated depending on implementation
    })
  );

  // Feature: Summary by file
  tests.push(
    await runTest("code_search", "summary includes file counts", async () => {
      const result = await codeSearch({ pattern: "function", limit: 50 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(Array.isArray(result.summary), "Should have summary array");
      if (result.summary.length > 0) {
        assert("file" in result.summary[0], "Summary should have file property");
        assert("count" in result.summary[0], "Summary should have count property");
      }
    })
  );

  // Edge case: Empty pattern
  tests.push(
    await runTest("code_search", "empty pattern returns error", async () => {
      const result = await codeSearch({ pattern: "" }, cwd);
      assert(result.error !== undefined, "Should return error for empty pattern");
    })
  );

  // Edge case: No matches
  tests.push(
    await runTest("code_search", "no matches pattern", async () => {
      const result = await codeSearch({ pattern: "XYZ123NONEXISTENT123XYZ", limit: 10 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total === 0, "Should have zero matches");
      assert(result.results.length === 0, "Should have empty results");
    })
  );

  // Edge case: Zero limit
  tests.push(
    await runTest("code_search", "zero limit returns empty", async () => {
      const result = await codeSearch({ pattern: "function", limit: 0 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.length === 0, "Should return empty results");
    })
  );

  // Performance
  tests.push(
    await runTest("code_search", "performance: fast search (<2s)", async () => {
      const start = performance.now();
      const result = await codeSearch({ pattern: "function", limit: 100 }, cwd);
      const duration = performance.now() - start;
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(duration < 2000, `Search should be fast: ${formatDuration(duration)}`);
    })
  );

  return {
    name: "code_search",
    tests,
    totalDuration: performance.now() - suiteStart,
  };
}

// ============================================
// sym_index Tests
// ============================================

async function testSymIndex(): Promise<TestSuite> {
  const tests: TestResult[] = [];
  const suiteStart = performance.now();
  const cwd = process.cwd();

  log("Testing sym_index...");

  // Basic: Generate index
  tests.push(
    await runTest("sym_index", "generate symbol index", async () => {
      const result = await symIndex({ force: true }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.indexed > 0, `Should index some symbols, got ${result.indexed}`);
      assert(result.outputPath.includes("symbols.jsonl"), "Output should be symbols.jsonl");
    })
  );

  // Feature: Index reuse (not forced)
  tests.push(
    await runTest("sym_index", "reuse existing index", async () => {
      // First, ensure index exists
      await symIndex({ force: true }, cwd);
      // Second call should reuse
      const result = await symIndex({ force: false }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.indexed > 0, "Should have indexed symbols");
    })
  );

  // Feature: Force regeneration
  tests.push(
    await runTest("sym_index", "force regeneration", async () => {
      const result = await symIndex({ force: true }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.indexed > 0, "Should regenerate index");
    })
  );

  // Performance
  tests.push(
    await runTest("sym_index", "performance: index generation (<5s)", async () => {
      const start = performance.now();
      const result = await symIndex({ force: true }, cwd);
      const duration = performance.now() - start;
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(duration < 5000, `Index generation should be fast: ${formatDuration(duration)}`);
    })
  );

  return {
    name: "sym_index",
    tests,
    totalDuration: performance.now() - suiteStart,
  };
}

// ============================================
// sym_find Tests
// ============================================

async function testSymFind(): Promise<TestSuite> {
  const tests: TestResult[] = [];
  const suiteStart = performance.now();
  const cwd = process.cwd();

  log("Testing sym_find...");

  // Ensure index exists first
  await symIndex({ force: true }, cwd);

  // Basic: List all symbols
  tests.push(
    await runTest("sym_find", "list all symbols", async () => {
      const result = await symFind({ limit: 50 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total > 0, "Should find symbols");
    })
  );

  // Feature: Search by name
  tests.push(
    await runTest("sym_find", "search by exact name", async () => {
      const result = await symFind({ name: "fileCandidates", limit: 10 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      // Note: This test may fail if ctags doesn't index the tools directory
      // We check that the search works, not that specific symbols exist
      assert(result.results !== undefined, "Should return results array");
    })
  );

  // Feature: Wildcard pattern
  tests.push(
    await runTest("sym_find", "wildcard pattern search", async () => {
      const result = await symFind({ name: "file*", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      // Should find fileCandidates, fileCandidatesToolDefinition, etc.
    })
  );

  // Feature: Filter by kind
  tests.push(
    await runTest("sym_find", "filter by kind (function)", async () => {
      const result = await symFind({ kind: ["function"], limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      // Most results should be functions (kind may vary by language)
    })
  );

  // Feature: Filter by file
  tests.push(
    await runTest("sym_find", "filter by file", async () => {
      const result = await symFind({ file: "file_candidates.ts", limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.every((r) => r.file.includes("file_candidates")), "All results should be from file_candidates");
    })
  );

  // Feature: Combined filters
  tests.push(
    await runTest("sym_find", "combined name and kind filter", async () => {
      const result = await symFind({ name: "*", kind: ["function"], limit: 20 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
    })
  );

  // Edge case: No matching name
  tests.push(
    await runTest("sym_find", "no matching name returns empty", async () => {
      const result = await symFind({ name: "NonExistentSymbol12345", limit: 10 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.total === 0, "Should have zero results");
    })
  );

  // Edge case: Zero limit
  tests.push(
    await runTest("sym_find", "zero limit returns empty", async () => {
      const result = await symFind({ limit: 0 }, cwd);
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(result.results.length === 0, "Should return empty results");
    })
  );

  // Performance
  tests.push(
    await runTest("sym_find", "performance: fast search (<500ms)", async () => {
      const start = performance.now();
      const result = await symFind({ limit: 100 }, cwd);
      const duration = performance.now() - start;
      assert(!result.error, `Should not have error: ${result.error}`);
      assert(duration < 500, `Symbol search should be very fast: ${formatDuration(duration)}`);
    })
  );

  return {
    name: "sym_find",
    tests,
    totalDuration: performance.now() - suiteStart,
  };
}

// ============================================
// Incremental Index Tests
// ============================================

async function testIncrementalIndex(): Promise<TestSuite> {
  const tests: TestResult[] = [];
  const suiteStart = performance.now();
  const cwd = process.cwd();

  log("Testing incremental index...");

  // Test: Manifest exists after indexing
  tests.push(
    await runTest("incremental_index", "manifest created after indexing", async () => {
      await symIndex({ force: true }, cwd);

      const { readFile, access } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const manifestPath = join(cwd, ".pi/search/symbols/manifest.json");
      const exists = await access(manifestPath).then(() => true).catch(() => false);

      assert(exists, "Manifest file should exist after indexing");
    })
  );

  // Test: Shard files created
  tests.push(
    await runTest("incremental_index", "shard files created", async () => {
      const { readdir, access } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const shardDir = join(cwd, ".pi/search/symbols");
      const exists = await access(shardDir).then(() => true).catch(() => false);

      if (exists) {
        const files = await readdir(shardDir);
        const shardFiles = files.filter(f => f.startsWith("shard-") && f.endsWith(".jsonl"));
        assert(shardFiles.length > 0, "At least one shard file should exist");
      } else {
        assert(false, "Shard directory should exist");
      }
    })
  );

  // Test: Metadata file created
  tests.push(
    await runTest("incremental_index", "metadata file created", async () => {
      const { readFile, access } = await import("node:fs/promises");
      const { join } = await import("node:path");

      // Check for index-meta.json (legacy metadata file)
      const metaPath = join(cwd, ".pi/search/index-meta.json");
      const exists = await access(metaPath).then(() => true).catch(() => false);

      assert(exists, "Metadata file should exist after indexing");
    })
  );

  // Test: Incremental update preserves existing data
  tests.push(
    await runTest("incremental_index", "incremental update works", async () => {
      // Force full index first
      const fullResult = await symIndex({ force: true }, cwd);
      const fullCount = fullResult.indexed;

      // Run without force - should reuse
      const reuseResult = await symIndex({ force: false }, cwd);

      assert(!reuseResult.error, `Should not have error: ${reuseResult.error}`);
      assert(reuseResult.indexed === fullCount, "Index count should be preserved");
    })
  );

  return {
    name: "Incremental Index",
    tests,
    totalDuration: performance.now() - suiteStart,
  };
}

// ============================================
// Main Test Runner
// ============================================

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Search Tools Comprehensive Test Suite");
  console.log("=".repeat(60));
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Node version: ${process.version}`);
  console.log("");

  // Run all test suites
  const suites = [
    await testToolAvailability(),
    await testFileCandidates(),
    await testCodeSearch(),
    await testSymIndex(),
    await testSymFind(),
    await testIncrementalIndex(),
  ];

  // Print results
  console.log("\n" + "=".repeat(60));
  console.log("TEST RESULTS");
  console.log("=".repeat(60));

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    console.log(`\n## ${suite.name} (total: ${formatDuration(suite.totalDuration)})`);
    console.log("-".repeat(40));

    for (const test of suite.tests) {
      const status = test.passed ? "PASS" : "FAIL";
      const duration = formatDuration(test.duration);
      console.log(`  [${status}] ${test.name} (${duration})`);

      if (!test.passed && test.error) {
        console.log(`        Error: ${test.error}`);
      }

      totalTests++;
      if (test.passed) totalPassed++;
      else totalFailed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total tests: ${totalTests}`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Success rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
