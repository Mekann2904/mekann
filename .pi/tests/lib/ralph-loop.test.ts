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
