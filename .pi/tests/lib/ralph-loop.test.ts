/**
 * @file .pi/lib/ralph-loop.ts の単体テスト
 * @description Ralph Loop コアライブラリのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  type RalphLoopOptions,
  type RalphLoopRuntime,
  type RalphLoopStatus,
  type RalphLoopRunResult,
  type SpawnCommandInput,
  inspectRalphLoop,
  runRalphLoop,
  initRalphLoop,
  buildMissingFileMessage,
} from "../../lib/ralph-loop.js";

// spawn をモックするためのヘルパー
const createMockSpawnCommand = (overrides?: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}) => {
  return async (_input: SpawnCommandInput): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> => {
    return {
      stdout: overrides?.stdout ?? "",
      stderr: overrides?.stderr ?? "",
      exitCode: overrides?.exitCode ?? 0,
    };
  };
};

describe("ralph-loop", () => {
  let tempDir: string;
  let stateDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync("/tmp/ralph-loop-test-");
    stateDir = ".pi/ralph";
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("initRalphLoop", () => {
    describe("正常系", () => {
      it("should initialize with default runtime (pi)", () => {
        const result = initRalphLoop({ cwd: tempDir });

        expect(result.created.prd).toBe(true);
        expect(result.created.prompt).toBe(true);
        expect(result.created.progress).toBe(true);
        expect(existsSync(result.paths.prdPath)).toBe(true);
        expect(existsSync(result.paths.promptPath)).toBe(true);
        expect(existsSync(result.paths.progressPath)).toBe(true);
      });

      it("should initialize with claude runtime", () => {
        const result = initRalphLoop({ cwd: tempDir, runtime: "claude" });

        expect(result.created.prd).toBe(true);
        expect(result.created.prompt).toBe(true);
        expect(existsSync(result.paths.promptPath)).toBe(true);
        // Claude runtime uses CLAUDE.md
        expect(result.paths.promptPath.endsWith("CLAUDE.md")).toBe(true);
      });

      it("should initialize with amp runtime", () => {
        const result = initRalphLoop({ cwd: tempDir, runtime: "amp" });

        expect(result.created.prd).toBe(true);
        expect(result.created.prompt).toBe(true);
        expect(existsSync(result.paths.promptPath)).toBe(true);
        // AMP runtime uses prompt.md
        expect(result.paths.promptPath.endsWith("prompt.md")).toBe(true);
      });

      it("should not overwrite existing files without force", () => {
        initRalphLoop({ cwd: tempDir });
        const result = initRalphLoop({ cwd: tempDir });

        expect(result.created.prd).toBe(false);
        expect(result.created.prompt).toBe(false);
        expect(result.created.progress).toBe(false);
      });

      it("should overwrite existing files with force: true", () => {
        initRalphLoop({ cwd: tempDir });
        const result = initRalphLoop({ cwd: tempDir, force: true });

        expect(result.created.prd).toBe(true);
        expect(result.created.prompt).toBe(true);
        expect(result.created.progress).toBe(true);
      });

      it("should use custom prdContent", () => {
        const result = initRalphLoop({
          cwd: tempDir,
          prdContent: {
            title: "Custom Project",
            tasks: [{ id: "custom-1", title: "Custom Task", status: "pending", priority: "high" }],
          },
        });

        const prdContent = JSON.parse(readFileSync(result.paths.prdPath, "utf-8"));
        expect(prdContent.title).toBe("Custom Project");
        expect(prdContent.tasks[0].id).toBe("custom-1");
      });

      it("should use custom promptContent", () => {
        const customPrompt = "# Custom Prompt\n\nThis is a custom prompt.";
        const result = initRalphLoop({
          cwd: tempDir,
          promptContent: customPrompt,
        });

        const promptContent = readFileSync(result.paths.promptPath, "utf-8");
        expect(promptContent).toBe(customPrompt);
      });
    });
  });

  describe("inspectRalphLoop", () => {
    describe("正常系", () => {
      it("should return status for initialized loop", () => {
        initRalphLoop({ cwd: tempDir });

        const status = inspectRalphLoop({ cwd: tempDir });

        expect(status.runtime).toBe("pi");
        expect(status.activeBranch).toBeDefined();
        expect(status.previousBranch).toBeNull();
        expect(status.prdExists).toBe(true);
        expect(status.promptExists).toBe(true);
        expect(status.progressExists).toBe(true);
      });

      it("should detect branch change and archive", () => {
        // Initialize with first branch
        initRalphLoop({
          cwd: tempDir,
          prdContent: { branchName: "feature/first" },
        });

        // First inspection
        inspectRalphLoop({ cwd: tempDir });

        // Change branch in prd
        const prdPath = join(tempDir, stateDir, "prd.json");
        const prd = JSON.parse(readFileSync(prdPath, "utf-8"));
        prd.branchName = "feature/second";
        writeFileSync(prdPath, JSON.stringify(prd, null, 2));

        // Second inspection should archive
        const status = inspectRalphLoop({ cwd: tempDir });

        expect(status.previousBranch).toBe("feature/first");
        expect(status.activeBranch).toBe("feature/second");
        expect(status.archivedTo).not.toBeNull();
      });

      it("should use custom resolveCurrentBranch when prd has no branchName", () => {
        // Initialize with custom resolveCurrentBranch
        // When branchName is empty, initRalphLoop uses resolveCurrentBranch to set it
        const result = initRalphLoop({
          cwd: tempDir,
          prdContent: { branchName: "" },
          resolveCurrentBranch: () => "init-branch",
        });

        // Verify prd was set with the custom branch
        expect(result.created.prd).toBe(true);
        const prdPath = join(tempDir, stateDir, "prd.json");
        const prd = JSON.parse(readFileSync(prdPath, "utf-8"));
        expect(prd.branchName).toBe("init-branch");

        // Now test inspectRalphLoop with a different resolveCurrentBranch
        // Since prd has branchName, it should use that instead
        const status = inspectRalphLoop({
          cwd: tempDir,
          resolveCurrentBranch: () => "custom-branch",
        });

        // Should use prd.branchName, not the custom resolver
        expect(status.activeBranch).toBe("init-branch");
      });
    });
  });

  describe("runRalphLoop", () => {
    describe("異常系", () => {
      it("should throw error when prd.json is missing", async () => {
        await expect(runRalphLoop({ cwd: tempDir })).rejects.toThrow(/prd\.json/);
      });

      it("should throw error when prompt file is missing", async () => {
        initRalphLoop({ cwd: tempDir });
        // Remove prompt file
        const promptPath = join(tempDir, stateDir, "PI.md");
        rmSync(promptPath);

        await expect(runRalphLoop({ cwd: tempDir })).rejects.toThrow(/プロンプト/);
      });
    });

    describe("正常系", () => {
      it("should complete when COMPLETE signal is found", async () => {
        initRalphLoop({ cwd: tempDir });

        const mockSpawn = createMockSpawnCommand({
          stdout: "Task completed\nCOMPLETE",
          stderr: "",
          exitCode: 0,
        });

        const result = await runRalphLoop({
          cwd: tempDir,
          maxIterations: 5,
          spawnCommand: mockSpawn,
        });

        expect(result.completed).toBe(true);
        expect(result.stopReason).toBe("complete");
        expect(result.iterations.length).toBe(1);
        expect(result.iterations[0].completed).toBe(true);
      });

      it("should stop at maxIterations when no COMPLETE signal", async () => {
        initRalphLoop({ cwd: tempDir });

        const mockSpawn = createMockSpawnCommand({
          stdout: "Working...",
          stderr: "",
          exitCode: 0,
        });

        const result = await runRalphLoop({
          cwd: tempDir,
          maxIterations: 3,
          sleepMs: 0,
          spawnCommand: mockSpawn,
        });

        expect(result.completed).toBe(false);
        expect(result.stopReason).toBe("max_iterations");
        expect(result.iterations.length).toBe(3);
      });

      it("should pass custom executable and args to spawnCommand", async () => {
        initRalphLoop({ cwd: tempDir });

        let capturedInput: SpawnCommandInput | undefined;
        const mockSpawn = async (input: SpawnCommandInput): Promise<{
          stdout: string;
          stderr: string;
          exitCode: number;
        }> => {
          capturedInput = input;
          return { stdout: "COMPLETE", stderr: "", exitCode: 0 };
        };

        await runRalphLoop({
          cwd: tempDir,
          maxIterations: 1,
          spawnCommand: mockSpawn,
        });

        expect(capturedInput).toBeDefined();
        expect(capturedInput!.cwd).toBe(tempDir);
        expect(capturedInput!.runtime).toBe("pi");
      });
    });
  });

  describe("buildMissingFileMessage", () => {
    it("should generate message for missing prd", () => {
      const message = buildMissingFileMessage("prd", "/path/to/prd.json", "pi");

      expect(message).toContain("prd.json");
      expect(message).toContain("ralph_loop_init");
    });

    it("should generate message for missing prompt", () => {
      const message = buildMissingFileMessage("prompt", "/path/to/PI.md", "pi");

      expect(message).toContain("プロンプト");
      expect(message).toContain("PI.md");
    });

    it("should include correct prompt filename for claude runtime", () => {
      const message = buildMissingFileMessage("prompt", "/path/to/CLAUDE.md", "claude");

      expect(message).toContain("CLAUDE.md");
    });
  });
});

// ============================================================================
// Backpressure Control Tests (Ralph Wiggum Technique)
// ============================================================================

import {
  type TaskType,
  type SubagentConfig,
  type PlaceholderPattern,
  DEFAULT_SUBAGENT_CONFIG,
  DEFAULT_PLACEHOLDER_PATTERNS,
  getMaxParallelForTaskType,
  requiresBackpressure,
  executeWithBackpressure,
  detectPlaceholders,
  logSearchEntry,
  readSearchLog,
  logNotImplementedReason,
} from "../../lib/ralph-loop.js";

describe("Backpressure Control Functions", () => {
  describe("getMaxParallelForTaskType", () => {
    it("should return correct max parallel for explore tasks", () => {
      expect(getMaxParallelForTaskType("explore")).toBe(DEFAULT_SUBAGENT_CONFIG.maxParallelExplore);
    });

    it("should return correct max parallel for build tasks", () => {
      expect(getMaxParallelForTaskType("build")).toBe(DEFAULT_SUBAGENT_CONFIG.maxParallelBuild);
    });

    it("should return correct max parallel for test tasks", () => {
      expect(getMaxParallelForTaskType("test")).toBe(DEFAULT_SUBAGENT_CONFIG.maxParallelTest);
    });

    it("should use custom config when provided", () => {
      const customConfig: SubagentConfig = {
        ...DEFAULT_SUBAGENT_CONFIG,
        maxParallelExplore: 50,
      };
      expect(getMaxParallelForTaskType("explore", customConfig)).toBe(50);
    });
  });

  describe("requiresBackpressure", () => {
    it("should return true for build tasks by default", () => {
      expect(requiresBackpressure("build")).toBe(true);
    });

    it("should return true for test tasks by default", () => {
      expect(requiresBackpressure("test")).toBe(true);
    });

    it("should return false for explore tasks by default", () => {
      expect(requiresBackpressure("explore")).toBe(false);
    });
  });

  describe("executeWithBackpressure", () => {
    it("should execute tasks in parallel for explore tasks", async () => {
      const tasks = [1, 2, 3, 4, 5];
      const executionOrder: number[] = [];

      const result = await executeWithBackpressure(
        tasks,
        "explore",
        async (task, index) => {
          executionOrder.push(index);
          return task * 2;
        },
        { ...DEFAULT_SUBAGENT_CONFIG, maxParallelExplore: 3, rateLimitMs: 0 },
      );

      expect(result).toEqual([2, 4, 6, 8, 10]);
    });

    it("should execute tasks sequentially for build tasks", async () => {
      const tasks = [1, 2, 3];
      const executionOrder: number[] = [];

      const result = await executeWithBackpressure(
        tasks,
        "build",
        async (task, index) => {
          executionOrder.push(index);
          return task * 2;
        },
        { ...DEFAULT_SUBAGENT_CONFIG, rateLimitMs: 0 },
      );

      expect(result).toEqual([2, 4, 6]);
      expect(executionOrder).toEqual([0, 1, 2]);
    });
  });
});

describe("Placeholder Detection Functions", () => {
  describe("detectPlaceholders", () => {
    it("should detect TODO comments", () => {
      const content = `// TODO: implement this
function foo() {}`;
      const result = detectPlaceholders(content, "test.ts");

      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("TODO"))).toBe(true);
    });

    it("should detect FIXME comments", () => {
      const content = `// FIXME: broken
function bar() {}`;
      const result = detectPlaceholders(content, "test.ts");

      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("FIXME"))).toBe(true);
    });

    it("should detect placeholder keywords", () => {
      const content = `function placeholder() {}`;
      const result = detectPlaceholders(content, "test.ts");

      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("PLACEHOLDER_KEYWORD"))).toBe(true);
    });

    it("should detect Not implemented errors", () => {
      const content = `throw new Error("Not implemented")`;
      const result = detectPlaceholders(content, "test.ts");

      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("NOT_IMPLEMENTED"))).toBe(true);
    });

    it("should return empty for clean code", () => {
      const content = `function cleanCode() {
  return 42;
}`;
      const result = detectPlaceholders(content, "test.ts");

      expect(result.detected).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  });
});

describe("Search Logging Functions", () => {
  let tempLogDir: string;

  beforeEach(() => {
    tempLogDir = mkdtempSync("/tmp/search-log-test-");
  });

  afterEach(() => {
    if (existsSync(tempLogDir)) {
      rmSync(tempLogDir, { recursive: true, force: true });
    }
  });

  describe("logSearchEntry and readSearchLog", () => {
    it("should log and read search entries", () => {
      const logPath = join(tempLogDir, "search-log.json");

      logSearchEntry(
        {
          timestamp: new Date().toISOString(),
          query: "test query",
          type: "code",
          resultsFound: 5,
          filesChecked: ["file1.ts", "file2.ts"],
        },
        logPath,
      );

      const entries = readSearchLog(logPath);

      expect(entries.length).toBe(1);
      expect(entries[0].query).toBe("test query");
      expect(entries[0].resultsFound).toBe(5);
    });

    it("should append multiple entries", () => {
      const logPath = join(tempLogDir, "search-log.json");

      logSearchEntry(
        {
          timestamp: new Date().toISOString(),
          query: "query1",
          type: "code",
          resultsFound: 1,
          filesChecked: [],
        },
        logPath,
      );

      logSearchEntry(
        {
          timestamp: new Date().toISOString(),
          query: "query2",
          type: "symbol",
          resultsFound: 2,
          filesChecked: [],
        },
        logPath,
      );

      const entries = readSearchLog(logPath);

      expect(entries.length).toBe(2);
      expect(entries[0].query).toBe("query1");
      expect(entries[1].query).toBe("query2");
    });
  });

  describe("logNotImplementedReason", () => {
    it("should log not implemented reason", () => {
      const logPath = join(tempLogDir, "search-log.json");

      logNotImplementedReason("search term", "No matching files found", ["file1.ts", "file2.ts"], logPath);

      const entries = readSearchLog(logPath);

      expect(entries.length).toBe(1);
      expect(entries[0].query).toBe("search term");
      expect(entries[0].notImplementedReason).toBe("No matching files found");
      expect(entries[0].resultsFound).toBe(0);
    });
  });
});

// ============================================================================
// Context Monitoring Tests (Phase 2 High)
// ============================================================================

import {
  checkOutputSize,
  calculateContextOccupancy,
  checkContextStatus,
  formatFixPlanEntry,
  appendFixPlanEntry,
  readFixPlan,
  DEFAULT_CONTEXT_MONITOR,
} from "../../lib/ralph-loop.js";

describe("Context Monitoring Functions", () => {
  describe("checkOutputSize", () => {
    it("should not truncate small output", () => {
      const output = "Hello, World!";
      const result = checkOutputSize(output);

      expect(result.truncated).toBe(false);
      expect(result.output).toBe(output);
    });

    it("should truncate large output", () => {
      const largeOutput = "x".repeat(100000); // 100KB
      const result = checkOutputSize(largeOutput, 50 * 1024);

      expect(result.truncated).toBe(true);
      expect(result.output.length).toBeLessThan(100000);
      expect(result.output).toContain("TRUNCATED");
    });

    it("should report original bytes", () => {
      const output = "Hello";
      const result = checkOutputSize(output);

      expect(result.originalBytes).toBeGreaterThan(0);
    });
  });

  describe("calculateContextOccupancy", () => {
    it("should calculate occupancy correctly", () => {
      const monitor = calculateContextOccupancy(50000, 100000);

      expect(monitor.contextOccupancy).toBe(0.5);
    });

    it("should handle zero max tokens", () => {
      const monitor = calculateContextOccupancy(50000, 0);

      expect(monitor.contextOccupancy).toBe(Infinity);
    });
  });

  describe("checkContextStatus", () => {
    it("should return ok for low occupancy", () => {
      const monitor: ContextUsageMonitor = {
        ...DEFAULT_CONTEXT_MONITOR,
        contextOccupancy: 0.5,
      };
      expect(checkContextStatus(monitor)).toBe("ok");
    });

    it("should return warning for medium occupancy", () => {
      const monitor: ContextUsageMonitor = {
        ...DEFAULT_CONTEXT_MONITOR,
        contextOccupancy: 0.8,
      };
      expect(checkContextStatus(monitor)).toBe("warning");
    });

    it("should return error for high occupancy", () => {
      const monitor: ContextUsageMonitor = {
        ...DEFAULT_CONTEXT_MONITOR,
        contextOccupancy: 0.95,
      };
      expect(checkContextStatus(monitor)).toBe("error");
    });
  });
});

describe("Fix Plan Functions", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync("/tmp/fix-plan-test-");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("formatFixPlanEntry", () => {
    it("should format entry as markdown", () => {
      const entry = {
        timestamp: "2024-01-01T00:00:00Z",
        problem: "Test problem",
        rootCause: "Test root cause",
        solution: "Test solution",
        verification: "Test verification",
        relatedFiles: ["file1.ts", "file2.ts"],
      };

      const result = formatFixPlanEntry(entry);

      expect(result).toContain("## 2024-01-01T00:00:00Z");
      expect(result).toContain("### 問題");
      expect(result).toContain("Test problem");
      expect(result).toContain("### 根本原因");
      expect(result).toContain("### 解決策");
      expect(result).toContain("### 検証方法");
      expect(result).toContain("### 関連ファイル");
      expect(result).toContain("- file1.ts");
    });

    it("should include lesson learned if provided", () => {
      const entry = {
        timestamp: "2024-01-01T00:00:00Z",
        problem: "Test problem",
        rootCause: "Test root cause",
        solution: "Test solution",
        verification: "Test verification",
        relatedFiles: [],
        lessonLearned: "Always check for null",
      };

      const result = formatFixPlanEntry(entry);

      expect(result).toContain("### 学んだこと");
      expect(result).toContain("Always check for null");
    });
  });

  describe("appendFixPlanEntry and readFixPlan", () => {
    it("should append entry and read back", () => {
      const fixPlanPath = join(tempDir, "fix_plan.md");
      const entry = {
        timestamp: "2024-01-01T00:00:00Z",
        problem: "Test problem",
        rootCause: "Test root cause",
        solution: "Test solution",
        verification: "Test verification",
        relatedFiles: ["file1.ts"],
      };

      appendFixPlanEntry(entry, fixPlanPath);
      const content = readFixPlan(fixPlanPath);

      expect(content).toContain("Test problem");
      expect(content).toContain("Test solution");
    });

    it("should append multiple entries", () => {
      const fixPlanPath = join(tempDir, "fix_plan.md");

      appendFixPlanEntry(
        {
          timestamp: "2024-01-01T00:00:00Z",
          problem: "Problem 1",
          rootCause: "Root cause 1",
          solution: "Solution 1",
          verification: "Verification 1",
          relatedFiles: [],
        },
        fixPlanPath,
      );

      appendFixPlanEntry(
        {
          timestamp: "2024-01-02T00:00:00Z",
          problem: "Problem 2",
          rootCause: "Root cause 2",
          solution: "Solution 2",
          verification: "Verification 2",
          relatedFiles: [],
        },
        fixPlanPath,
      );

      const content = readFixPlan(fixPlanPath);

      expect(content).toContain("Problem 1");
      expect(content).toContain("Problem 2");
    });
  });
});

// ============================================================================
// Phase 3 (Medium) Tests: Git Workflow, AGENT.md, Workspace Verify
// ============================================================================

import {
  type GitCommitConfig,
  type AutoCommitResult,
  type AgentMdEntry,
  type WorkspaceVerifyResult,
  DEFAULT_GIT_COMMIT_CONFIG,
  autoCommitOnTestPass,
  appendAgentMdLearning,
  readAgentMd,
  runWorkspaceVerify,
  isAllVerificationPassed,
  DEFAULT_WORKSPACE_VERIFICATION,
} from "../../lib/ralph-loop.js";

describe("Git Workflow Integration", () => {
  describe("autoCommitOnTestPass", () => {
    it("should not commit when disabled", () => {
      const config: GitCommitConfig = {
        ...DEFAULT_GIT_COMMIT_CONFIG,
        enabled: false,
      };
      const result = autoCommitOnTestPass("/tmp", true, config);
      expect(result.committed).toBe(false);
    });

    it("should not commit when test failed and commitOnTestPassOnly is true", () => {
      const config: GitCommitConfig = {
        ...DEFAULT_GIT_COMMIT_CONFIG,
        commitOnTestPassOnly: true,
      };
      const result = autoCommitOnTestPass("/tmp", false, config);
      expect(result.committed).toBe(false);
    });

    it("should return error when not in git repo", () => {
      const result = autoCommitOnTestPass("/tmp/nonexistent", true);
      expect(result.committed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe("AGENT.md Self-Update", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync("/tmp/agent-md-test-");
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("appendAgentMdLearning and readAgentMd", () => {
    it("should append learning to AGENT.md", () => {
      const agentMdPath = join(tempDir, "AGENT.md");
      const entry: AgentMdEntry = {
        timestamp: "2024-01-01T00:00:00Z",
        learning: "Always check for null before accessing properties",
        rule: "Use optional chaining for nullable values",
        relatedFiles: ["src/utils.ts"],
        tags: ["typescript", "null-safety"],
      };

      appendAgentMdLearning(entry, agentMdPath);
      const content = readAgentMd(agentMdPath);

      expect(content).toContain("Always check for null");
      expect(content).toContain("Use optional chaining");
      expect(content).toContain("src/utils.ts");
      expect(content).toContain("typescript");
    });

    it("should append multiple learnings", () => {
      const agentMdPath = join(tempDir, "AGENT.md");

      appendAgentMdLearning(
        {
          timestamp: "2024-01-01T00:00:00Z",
          learning: "Learning 1",
        },
        agentMdPath,
      );

      appendAgentMdLearning(
        {
          timestamp: "2024-01-02T00:00:00Z",
          learning: "Learning 2",
        },
        agentMdPath,
      );

      const content = readAgentMd(agentMdPath);

      expect(content).toContain("Learning 1");
      expect(content).toContain("Learning 2");
    });
  });
});

describe("Workspace Verify Integration", () => {
  describe("runWorkspaceVerify", () => {
    it("should not execute when disabled", () => {
      const config = {
        ...DEFAULT_WORKSPACE_VERIFICATION,
        enabled: false,
      };
      const result = runWorkspaceVerify("/tmp", config);
      expect(result.executed).toBe(false);
    });

    it("should execute and return results when enabled", () => {
      // Skip actual commands to avoid timeout in tests
      const config = {
        ...DEFAULT_WORKSPACE_VERIFICATION,
        testCommand: "echo test",
        lintCommand: "echo lint",
        typecheckCommand: "echo typecheck",
      };
      const result = runWorkspaceVerify(process.cwd(), config, 5000);
      expect(result.executed).toBe(true);
      expect(result.testPassed).toBe(true);
    });
  });

  describe("isAllVerificationPassed", () => {
    it("should return true when verification not executed", () => {
      const result: WorkspaceVerifyResult = { executed: false };
      expect(isAllVerificationPassed(result)).toBe(true);
    });

    it("should return true when all checks passed", () => {
      const result: WorkspaceVerifyResult = {
        executed: true,
        testPassed: true,
        lintPassed: true,
        typecheckPassed: true,
      };
      expect(isAllVerificationPassed(result)).toBe(true);
    });

    it("should return false when any check failed", () => {
      const result: WorkspaceVerifyResult = {
        executed: true,
        testPassed: true,
        lintPassed: false,
        typecheckPassed: true,
      };
      expect(isAllVerificationPassed(result)).toBe(false);
    });

    it("should return false when test failed", () => {
      const result: WorkspaceVerifyResult = {
        executed: true,
        testPassed: false,
      };
      expect(isAllVerificationPassed(result)).toBe(false);
    });
  });
});
