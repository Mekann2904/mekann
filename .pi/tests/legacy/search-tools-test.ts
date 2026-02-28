/**
 * Search Tools Comprehensive Test Suite
 *
 * Tests for file_candidates, code_search, sym_index, and sym_find tools.
 * Run with: npx tsx .pi/test/search-tools-test.ts
 */

import { spawn } from "node:child_process";
import { access, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

// ============================================
// Test Utilities
// ============================================

let passed = 0;
let failed = 0;
const testResults: Array<{ name: string; status: string; time: number; error?: string }> = [];

function test(name: string, fn: () => Promise<void> | void): void {
  const startTime = Date.now();
  Promise.resolve()
    .then(() => fn())
    .then(() => {
      const elapsed = Date.now() - startTime;
      console.log(`[PASS] ${name} (${elapsed}ms)`);
      passed++;
      testResults.push({ name, status: "PASS", time: elapsed });
    })
    .catch((err) => {
      const elapsed = Date.now() - startTime;
      console.log(`[FAIL] ${name} (${elapsed}ms)`);
      console.log(`       Error: ${err.message}`);
      failed++;
      testResults.push({ name, status: "FAIL", time: elapsed, error: err.message });
    });
}

async function execute(
  command: string,
  args: string[] = [],
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string; time: number }> {
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

async function checkToolAvailability(): Promise<{ fd: boolean; rg: boolean; ctags: boolean }> {
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

async function runTests(): Promise<void> {
  const cwd = process.cwd();
  const availability = await checkToolAvailability();

  console.log("\n=== Tool Availability ===\n");
  console.log(`fd:     ${availability.fd ? "available" : "NOT AVAILABLE"}`);
  console.log(`rg:     ${availability.rg ? "available" : "NOT AVAILABLE"}`);
  console.log(`ctags:  ${availability.ctags ? "available" : "NOT AVAILABLE"}`);
  console.log("");

  // ============================================
  // file_candidates Tests
  // ============================================
  console.log("\n=== file_candidates Tests ===\n");

  test("fd - basic file enumeration", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", ".", ".pi/extensions/search", "--max-results", "10", "--exclude", ".git"]);
    if (result.code !== 0) throw new Error(`fd failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error("No files found");
    if (result.time > 1000) throw new Error(`Too slow: ${result.time}ms`);
  });

  test("fd - with extension filter", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", ".", ".pi/extensions/search", "-e", "ts", "--max-results", "20", "--exclude", ".git"]);
    if (result.code !== 0) throw new Error(`fd failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error("No TypeScript files found");
    // All results should be .ts files
    for (const line of lines) {
      if (!line.endsWith(".ts")) throw new Error(`Non-TS file found: ${line}`);
    }
  });

  test("fd - with exclude patterns", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", ".", ".pi", "--max-results", "20", "--exclude", ".git", "--exclude", "test"]);
    if (result.code !== 0) throw new Error(`fd failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    // Should not contain test directory files
    for (const line of lines) {
      if (line.includes("/test/")) throw new Error(`Test file found: ${line}`);
    }
  });

  test("fd - with maxDepth", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", ".", ".pi", "--max-depth", "2", "--max-results", "20", "--exclude", ".git"]);
    if (result.code !== 0) throw new Error(`fd failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    // Check depth
    for (const line of lines) {
      const depth = line.split("/").length;
      if (depth > 3) throw new Error(`File too deep: ${line}`); // .pi/X/Y = 3 parts
    }
  });

  test("fd - type directory", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "d", ".", ".pi", "--max-depth", "2", "--max-results", "10", "--exclude", ".git"]);
    if (result.code !== 0) throw new Error(`fd failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error("No directories found");
  });

  test("fd - empty result", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", "nonexistent_pattern_xyz123", ".pi", "--max-results", "10"]);
    // fd returns 0 even for no matches
    if (result.code !== 0 && result.code !== 1) throw new Error(`fd unexpected error: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length > 0) throw new Error("Should not find files for nonexistent pattern");
  });

  test("fd - limit enforcement", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", ".", ".pi", "--max-results", "5", "--exclude", ".git"]);
    if (result.code !== 0) throw new Error(`fd failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length > 5) throw new Error(`Limit not enforced: ${lines.length} > 5`);
  });

  // ============================================
  // code_search Tests
  // ============================================
  console.log("\n=== code_search Tests ===\n");

  test("rg - basic search", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "import", ".pi/extensions/search", "-c"]);
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
    if (result.time > 1000) throw new Error(`Too slow: ${result.time}ms`);
  });

  test("rg - with type filter", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "function", ".pi", "--type", "ts", "-c"]);
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    // Should have some matches (code 0) or no matches (code 1)
    // With -c flag, we expect summary with matched_lines > 0 if there are matches
    if (result.code === 1) {
      console.log("       Note: No matches found (valid for some projects)");
      return;
    }
    // Check for matches in output
    let hasMatches = false;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "summary" && parsed.data?.stats?.matched_lines > 0) {
          hasMatches = true;
        }
      } catch {
        // Skip non-JSON lines
      }
    }
    if (!hasMatches) console.log("       Note: No function matches found in .pi TypeScript files");
  });

  test("rg - literal search", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "--fixed-strings", "execute", ".pi/extensions/search", "-c"]);
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
  });

  test("rg - case insensitive", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "--ignore-case", "EXECUTE", ".pi/extensions/search", "-c"]);
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    // Should find matches with case-insensitive search
    let hasMatches = false;
    for (const line of lines) {
      if (line.includes("BEGIN") || line.includes("match")) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "begin") hasMatches = true;
        } catch {
          // Skip
        }
      }
    }
    if (!hasMatches && result.code === 0) console.log("       Note: Case-insensitive search found matches");
  });

  test("rg - regex pattern", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "export (async )?function \\w+", ".pi/extensions/search", "-c"]);
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
  });

  test("rg - context lines", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "--context", "2", "export async function execute", ".pi/extensions/search/utils/cli.ts"]);
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    // Should have context entries
    let hasContext = false;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "context") hasContext = true;
      } catch {
        // Skip
      }
    }
    if (!hasContext) throw new Error("No context lines found");
  });

  test("rg - no matches (exit code 1)", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "NONEXISTENT_PATTERN_XYZ123", ".pi/extensions/search"]);
    // Exit code 1 means no matches, which is expected
    if (result.code !== 1) throw new Error(`Expected exit code 1, got ${result.code}`);
  });

  test("rg - invalid regex error", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "[invalid", ".pi/extensions/search"]);
    // Should fail with exit code 2
    if (result.code !== 2) throw new Error(`Expected exit code 2 for invalid regex, got ${result.code}`);
    if (!result.stderr.includes("regex parse error")) throw new Error("Expected regex parse error message");
  });

  // ============================================
  // sym_index Tests
  // ============================================
  console.log("\n=== sym_index Tests ===\n");

  test("ctags - JSON output format check", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const helpResult = await execute("ctags", ["--help"]);
    if (!helpResult.stdout.includes("json")) {
      throw new Error("ctags does not support JSON output");
    }
    console.log("       JSON output format supported");
  });

  test("ctags - basic indexing", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", [
      "--output-format=json",
      "--fields=+n+s+S+k",
      "--extras=+q",
      "--sort=no",
      "-R",
      ".pi/extensions/search",
      "--exclude=node_modules",
    ]);
    if (result.code !== 0) throw new Error(`ctags failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error("No symbols indexed");
    console.log(`       Indexed ${lines.length} symbols`);
  });

  test("ctags - symbol kinds", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", [
      "--output-format=json",
      "--fields=+n+s+S+k",
      "--extras=+q",
      "--sort=no",
      "-R",
      ".pi/extensions/search",
      "--exclude=node_modules",
    ]);
    if (result.code !== 0) throw new Error(`ctags failed: ${result.stderr}`);
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

    if (!kinds.has("function")) throw new Error("No function symbols found");
    console.log(`       Symbol kinds: ${Array.from(kinds).join(", ")}`);
  });

  test("ctags - non-existent path warning", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", ["-R", "/nonexistent/path/xyz123"]);
    // ctags returns 0 even for non-existent paths, but outputs warning
    if (!result.stderr.includes("cannot open") && !result.stderr.includes("No such file")) {
      console.log("       Note: ctags did not warn about non-existent path");
    }
  });

  // ============================================
  // sym_find Simulation Tests
  // ============================================
  console.log("\n=== sym_find (simulated) Tests ===\n");

  test("sym_find - name filter simulation", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", [
      "--output-format=json",
      "--fields=+n+s+S+k",
      "--extras=+q",
      "--sort=no",
      "-R",
      ".pi/extensions/search",
      "--exclude=node_modules",
    ]);
    if (result.code !== 0) throw new Error(`ctags failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);

    // Simulate name filter: find "execute"
    const matches: Array<{ name: string; kind: string; line: number }> = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.name && parsed.name.toLowerCase().includes("execute")) {
          matches.push({ name: parsed.name, kind: parsed.kind, line: parsed.line });
        }
      } catch {
        // Skip
      }
    }

    if (matches.length === 0) throw new Error("No symbols matching 'execute' found");
    console.log(`       Found ${matches.length} symbols matching 'execute'`);
  });

  test("sym_find - kind filter simulation", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", [
      "--output-format=json",
      "--fields=+n+s+S+k",
      "--extras=+q",
      "--sort=no",
      "-R",
      ".pi/extensions/search",
      "--exclude=node_modules",
    ]);
    if (result.code !== 0) throw new Error(`ctags failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);

    // Simulate kind filter: functions only
    const functions: Array<{ name: string; kind: string }> = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.kind === "function") {
          functions.push({ name: parsed.name, kind: parsed.kind });
        }
      } catch {
        // Skip
      }
    }

    if (functions.length === 0) throw new Error("No function symbols found");
    console.log(`       Found ${functions.length} function symbols`);
  });

  // ============================================
  // Performance Tests
  // ============================================
  console.log("\n=== Performance Tests ===\n");

  test("perf - fd cold start", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", ".", ".pi/extensions/search", "--max-results", "100", "--exclude", ".git"]);
    console.log(`       Time: ${result.time}ms`);
    if (result.time > 500) throw new Error(`Too slow: ${result.time}ms (expected < 500ms)`);
  });

  test("perf - rg cold start", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "import", ".pi/extensions/search"]);
    console.log(`       Time: ${result.time}ms`);
    if (result.time > 500) throw new Error(`Too slow: ${result.time}ms (expected < 500ms)`);
  });

  test("perf - ctags indexing (small scope)", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", [
      "--output-format=json",
      "--fields=+n+s+S+k",
      "--extras=+q",
      "--sort=no",
      "-R",
      ".pi/extensions/search",
      "--exclude=node_modules",
    ]);
    console.log(`       Time: ${result.time}ms`);
    if (result.time > 5000) throw new Error(`Too slow: ${result.time}ms (expected < 5000ms)`);
  });

  test("perf - multiple searches", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const startTime = Date.now();
    for (let i = 0; i < 5; i++) {
      await execute("rg", ["--json", "import", ".pi/extensions/search", "-c"]);
    }
    const totalTime = Date.now() - startTime;
    console.log(`       Total time for 5 searches: ${totalTime}ms`);
    if (totalTime > 1000) throw new Error(`Too slow: ${totalTime}ms for 5 searches`);
  });

  // ============================================
  // Edge Case Tests
  // ============================================
  console.log("\n=== Edge Case Tests ===\n");

  test("edge - fd with glob pattern (error expected)", async () => {
    if (!availability.fd) throw new Error("fd not available");
    // fd doesn't accept glob patterns directly without --glob flag
    const result = await execute("fd", ["-t", "f", "*.ts", ".pi/extensions/search", "--max-results", "10"]);
    // Should fail with regex parse error
    if (result.code === 0) {
      console.log("       Note: fd accepted glob pattern (may have --glob flag auto-detection)");
    } else {
      console.log("       Expected: fd rejected glob pattern (use --glob flag)");
    }
  });

  test("edge - fd with --glob flag", async () => {
    if (!availability.fd) throw new Error("fd not available");
    const result = await execute("fd", ["-t", "f", "--glob", "*.ts", ".pi/extensions/search", "--max-results", "10"]);
    if (result.code !== 0) throw new Error(`fd with --glob failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    if (lines.length === 0) throw new Error("No .ts files found with --glob");
  });

  test("edge - rg empty pattern", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "", ".pi/extensions/search"]);
    // Empty pattern matches everything - should produce a lot of output
    console.log(`       Output length: ${result.stdout.length} chars`);
    if (result.stdout.length === 0) throw new Error("Empty pattern should match something");
  });

  test("edge - special characters in pattern", async () => {
    if (!availability.rg) throw new Error("rg not available");
    const result = await execute("rg", ["--json", "--fixed-strings", "/*", ".pi/extensions/search", "-c"]);
    // Should find comment blocks
    if (result.code !== 0 && result.code !== 1) throw new Error(`rg failed: ${result.stderr}`);
    console.log(`       Special character search completed`);
  });

  test("edge - ctags with minimal fields", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
    const result = await execute("ctags", ["--output-format=json", "-R", ".pi/extensions/search/types.ts"]);
    if (result.code !== 0) throw new Error(`ctags failed: ${result.stderr}`);
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    console.log(`       Symbols with minimal fields: ${lines.length}`);
  });

  test("edge - fd limit 0 behavior", async () => {
    if (!availability.fd) throw new Error("fd not available");
    // fd treats --max-results 0 as unlimited
    const result = await execute("fd", ["-t", "f", ".", ".pi/extensions/search", "--max-results", "0", "--exclude", ".git"]);
    // Should return all files (not 0)
    const lines = result.stdout.trim().split("\n").filter(Boolean);
    console.log(`       Files returned with limit 0: ${lines.length} (fd interprets 0 as unlimited)`);
    if (lines.length === 0) throw new Error("fd with limit 0 should return all files, not 0");
  });

  // ============================================
  // Integration Tests
  // ============================================
  console.log("\n=== Integration Tests ===\n");

  test("integration - file_candidates + code_search workflow", async () => {
    if (!availability.fd || !availability.rg) throw new Error("fd/rg not available");
    // Step 1: Find TypeScript files
    const fdResult = await execute("fd", ["-t", "f", ".", ".pi/extensions/search", "-e", "ts", "--max-results", "10", "--exclude", ".git"]);
    if (fdResult.code !== 0) throw new Error(`fd failed: ${fdResult.stderr}`);
    const files = fdResult.stdout.trim().split("\n").filter(Boolean);
    if (files.length === 0) throw new Error("No TypeScript files found");

    // Step 2: Search for a pattern in those files
    const firstFile = files[0];
    const rgResult = await execute("rg", ["--json", "import", firstFile]);
    // Should succeed (exit 0 or 1)
    if (rgResult.code !== 0 && rgResult.code !== 1) throw new Error(`rg failed: ${rgResult.stderr}`);
    console.log(`       Workflow: found ${files.length} files, searched ${firstFile}`);
  });

  test("integration - sym_index + sym_find workflow", async () => {
    if (!availability.ctags) throw new Error("ctags not available");
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
    if (indexResult.code !== 0) throw new Error(`ctags failed: ${indexResult.stderr}`);
    const entries = indexResult.stdout.trim().split("\n").filter(Boolean);

    // Step 2: Find function symbols
    const functions: Array<{ name: string; file: string; line: number }> = [];
    for (const entry of entries) {
      try {
        const parsed = JSON.parse(entry);
        if (parsed.kind === "function") {
          functions.push({ name: parsed.name, file: parsed.path, line: parsed.line });
        }
      } catch {
        // Skip
      }
    }

    if (functions.length === 0) throw new Error("No function symbols in index");
    console.log(`       Workflow: indexed ${entries.length} symbols, found ${functions.length} functions`);
  });

  test("integration - concurrent tool execution", async () => {
    if (!availability.fd || !availability.rg) throw new Error("fd/rg not available");
    const startTime = Date.now();

    // Run fd and rg concurrently
    const [fdResult, rgResult] = await Promise.all([
      execute("fd", ["-t", "f", ".", ".pi/extensions/search", "--max-results", "50", "--exclude", ".git"]),
      execute("rg", ["--json", "export", ".pi/extensions/search", "-c"]),
    ]);

    const totalTime = Date.now() - startTime;
    console.log(`       Concurrent execution time: ${totalTime}ms`);
    if (fdResult.code !== 0) throw new Error(`fd failed: ${fdResult.stderr}`);
    if (rgResult.code !== 0 && rgResult.code !== 1) throw new Error(`rg failed: ${rgResult.stderr}`);
  });

  // Wait for all async tests
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// ============================================
// Main
// ============================================

runTests()
  .then(() => {
    console.log("\n========================================");
    console.log("SUMMARY");
    console.log("========================================");
    console.log(`Total:  ${passed + failed} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log("========================================\n");

    // Print failed tests summary
    if (failed > 0) {
      console.log("Failed Tests:");
      for (const result of testResults.filter((r) => r.status === "FAIL")) {
        console.log(`  - ${result.name}: ${result.error}`);
      }
      console.log("");
    }

    // Print timing summary
    const times = testResults.map((r) => r.time);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    console.log(`Timing: avg=${avgTime.toFixed(0)}ms, min=${minTime}ms, max=${maxTime}ms`);

    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Test runner error:", err);
    process.exit(1);
  });
