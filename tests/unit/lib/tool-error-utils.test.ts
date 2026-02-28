/**
 * @file tests/unit/lib/tool-error-utils.test.ts
 * @description tool-error-utils.ts の単体テスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isExitOneAllowed,
  safeBash,
  findTextLine,
  findSimilarFiles,
  safeRead,
  getToolCriticality,
  evaluateToolResult,
  evaluateAgentRunResults,
  type BashOptions,
} from "../../../.pi/lib/tool-error-utils.js";
import {
  isBashErrorTolerated,
  parseToolFailureCount,
  reevaluateAgentRunFailure,
  evaluateAgentRunOutcome,
} from "../../../.pi/lib/agent/agent-errors.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("tool-error-utils", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `tool-error-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ===========================================================================
  // isExitOneAllowed
  // ===========================================================================
  describe("isExitOneAllowed", () => {
    it("diff コマンドは exit 1 を許容する", () => {
      expect(isExitOneAllowed("diff file1.txt file2.txt")).toBe(true);
      expect(isExitOneAllowed("git diff HEAD~1")).toBe(true);
    });

    it("grep コマンドは exit 1 を許容する", () => {
      expect(isExitOneAllowed("grep pattern file.txt")).toBe(true);
      expect(isExitOneAllowed("grep -r 'TODO' src/")).toBe(true);
    });

    it("test コマンドは exit 1 を許容する", () => {
      expect(isExitOneAllowed("test -f file.txt")).toBe(true);
      expect(isExitOneAllowed("[ -d dir ]")).toBe(true);
    });

    it("その他のコマンドは exit 1 を許容しない", () => {
      expect(isExitOneAllowed("npm test")).toBe(false);
      expect(isExitOneAllowed("node script.js")).toBe(false);
    });
  });

  // ===========================================================================
  // safeBash
  // ===========================================================================
  describe("safeBash", () => {
    it("成功するコマンドは ok を返す", () => {
      const result = safeBash({ command: "echo hello" });
      expect(result.status).toBe("ok");
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("hello");
    });

    it("diff コマンドの exit 1 は許容される", () => {
      const file1 = join(tempDir, "a.txt");
      const file2 = join(tempDir, "b.txt");
      writeFileSync(file1, "content a");
      writeFileSync(file2, "content b");

      const result = safeBash({ command: `diff "${file1}" "${file2}"` });
      expect(result.status).toBe("ok");
      expect(result.isNonZeroAllowed).toBe(true);
      expect(result.exitCode).toBe(1);
    });

    it("allowExitOne: true で exit 1 を明示的に許容できる", () => {
      const result = safeBash({
        command: "exit 1",
        allowExitOne: true,
      });
      expect(result.status).toBe("ok");
      expect(result.isNonZeroAllowed).toBe(true);
    });

    it("allowedExitCodes で複数の終了コードを許容できる", () => {
      const result = safeBash({
        command: "exit 2",
        allowedExitCodes: [0, 1, 2],
      });
      expect(result.status).toBe("ok");
      expect(result.exitCode).toBe(2);
    });
  });

  // ===========================================================================
  // findTextLine
  // ===========================================================================
  describe("findTextLine", () => {
    it("テキストが見つかった行番号を返す（1始まり）", () => {
      const content = "line1\nline2\nline3\n";
      expect(findTextLine(content, "line2")).toBe(2);
    });

    it("複数行テキストも検索できる", () => {
      const content = "line1\nline2\nline3\n";
      expect(findTextLine(content, "line2\nline3")).toBe(2);
    });

    it("見つからない場合は部分一致を試す", () => {
      const content = "function hello() {\n  return 'world';\n}";
      const result = findTextLine(content, "function hello");
      expect(result).toBe(1);
    });

    it("全く見つからない場合は null を返す", () => {
      const content = "line1\nline2\nline3";
      expect(findTextLine(content, "not-found")).toBeNull();
    });
  });

  // ===========================================================================
  // safeRead
  // ===========================================================================
  describe("safeRead", () => {
    it("存在するファイルを読み込める", () => {
      const filePath = join(tempDir, "test.txt");
      writeFileSync(filePath, "test content");

      const result = safeRead({ path: filePath });
      expect(result.status).toBe("ok");
      expect(result.content).toBe("test content");
    });

    it("存在しないファイルはエラーを返す", () => {
      const result = safeRead({ path: join(tempDir, "not-exist.txt") });
      expect(result.status).toBe("error");
      expect(result.error).toContain("ENOENT");
    });

    it("ディレクトリを指定した場合はエラーを返す", () => {
      const result = safeRead({ path: tempDir });
      expect(result.status).toBe("error");
      expect(result.error).toContain("EISDIR");
      expect(result.directoryContents).toBeDefined();
    });

    it("offset と limit が機能する", () => {
      const filePath = join(tempDir, "multi.txt");
      writeFileSync(filePath, "line1\nline2\nline3\nline4\nline5");

      const result = safeRead({ path: filePath, offset: 2, limit: 2 });
      expect(result.status).toBe("ok");
      expect(result.content).toBe("line2\nline3");
    });
  });

  // ===========================================================================
  // getToolCriticality
  // ===========================================================================
  describe("getToolCriticality", () => {
    it("write, edit は critical", () => {
      expect(getToolCriticality("write")).toBe("critical");
      expect(getToolCriticality("edit")).toBe("critical");
      expect(getToolCriticality("core:edit")).toBe("critical");
    });

    it("agent_team_run, subagent_run は critical", () => {
      expect(getToolCriticality("agent_team_run")).toBe("critical");
      expect(getToolCriticality("agent-teams:agent_team_run")).toBe("critical");
    });

    it("read, bash は informational", () => {
      expect(getToolCriticality("read")).toBe("informational");
      expect(getToolCriticality("core:bash")).toBe("informational");
      expect(getToolCriticality("bash")).toBe("informational");
    });

    it("code_search, file_candidates は informational", () => {
      expect(getToolCriticality("code_search")).toBe("informational");
      expect(getToolCriticality("file_candidates")).toBe("informational");
    });

    it("その他は non-critical", () => {
      expect(getToolCriticality("unknown_tool")).toBe("non-critical");
      expect(getToolCriticality("question")).toBe("non-critical");
    });
  });

  // ===========================================================================
  // evaluateToolResult
  // ===========================================================================
  describe("evaluateToolResult", () => {
    it("成功したツールは isCritical: false, shouldFailAgentRun: false", () => {
      const result = evaluateToolResult("edit", "ok");
      expect(result.isCritical).toBe(true);
      expect(result.shouldFailAgentRun).toBe(false);
      expect(result.downgradeToWarning).toBe(false);
    });

    it("critical ツールの失敗は shouldFailAgentRun: true", () => {
      const result = evaluateToolResult("edit", "error", "Text not found");
      expect(result.isCritical).toBe(true);
      expect(result.shouldFailAgentRun).toBe(true);
      expect(result.downgradeToWarning).toBe(false);
    });

    it("informational ツールの失敗は downgradeToWarning: true", () => {
      const result = evaluateToolResult("bash", "error", "exit code 1");
      expect(result.isCritical).toBe(false);
      expect(result.shouldFailAgentRun).toBe(false);
      expect(result.downgradeToWarning).toBe(true);
    });
  });

  // ===========================================================================
  // evaluateAgentRunResults
  // ===========================================================================
  describe("evaluateAgentRunResults", () => {
    it("全ツール成功の場合は ok", () => {
      const results = [
        { toolName: "read", status: "ok" as const },
        { toolName: "edit", status: "ok" as const },
        { toolName: "bash", status: "ok" as const },
      ];

      const evaluation = evaluateAgentRunResults(results);
      expect(evaluation.status).toBe("ok");
      expect(evaluation.failedCount).toBe(0);
    });

    it("informational ツールのみ失敗の場合は warning", () => {
      const results = [
        { toolName: "read", status: "ok" as const },
        { toolName: "edit", status: "ok" as const },
        { toolName: "bash", status: "error" as const, errorMessage: "exit code 1" },
      ];

      const evaluation = evaluateAgentRunResults(results);
      expect(evaluation.status).toBe("warning");
      expect(evaluation.failedCount).toBe(1);
      expect(evaluation.shouldFailAgentRun).toBe(false);
    });

    it("critical ツールが失敗した場合は error", () => {
      const results = [
        { toolName: "read", status: "ok" as const },
        { toolName: "edit", status: "error" as const, errorMessage: "Text not found" },
        { toolName: "bash", status: "ok" as const },
      ];

      const evaluation = evaluateAgentRunResults(results);
      expect(evaluation.status).toBe("error");
      expect(evaluation.criticalFailureCount).toBe(1);
      expect(evaluation.shouldFailAgentRun).toBe(true);
    });
  });
});

// ===========================================================================
// agent-errors extended functions
// ===========================================================================
describe("agent-errors extended", () => {
  describe("isBashErrorTolerated", () => {
    it("diff の exit code 1 は許容される", () => {
      expect(isBashErrorTolerated("diff file1 file2\nCommand exited with code 1")).toBe(true);
    });

    it("grep の exit code 1 は許容される", () => {
      expect(isBashErrorTolerated("grep pattern file\nexited with code 1")).toBe(true);
    });

    it("npm audit warning は許容される", () => {
      expect(isBashErrorTolerated("# npm audit report\nSeverity: moderate")).toBe(true);
    });

    it("その他のエラーは許容されない", () => {
      expect(isBashErrorTolerated("Error: Something went wrong")).toBe(false);
    });
  });

  describe("parseToolFailureCount", () => {
    it("正常にパースできる", () => {
      expect(parseToolFailureCount("3/17 tool calls failed")).toEqual({ failed: 3, total: 17 });
      expect(parseToolFailureCount("1/5 tool call failed")).toEqual({ failed: 1, total: 5 });
    });

    it("マッチしない場合は null", () => {
      expect(parseToolFailureCount("Some other error")).toBeNull();
    });
  });

  describe("reevaluateAgentRunFailure", () => {
    it("失敗率10%以下は警告に降格", () => {
      const result = reevaluateAgentRunFailure("1/17 tool calls failed");
      expect(result.shouldDowngrade).toBe(true);
      expect(result.suggestedStatus).toBe("warning");
      expect(result.originalFailure).toEqual({ failed: 1, total: 17 });
    });

    it("失敗率20%以下で3以下は警告に降格", () => {
      const result = reevaluateAgentRunFailure("3/20 tool calls failed");
      expect(result.shouldDowngrade).toBe(true);
      expect(result.suggestedStatus).toBe("warning");
    });

    it("失敗率高い場合は降格しない", () => {
      const result = reevaluateAgentRunFailure("10/20 tool calls failed");
      expect(result.shouldDowngrade).toBe(false);
      expect(result.suggestedStatus).toBe("error");
    });
  });

  describe("evaluateAgentRunOutcome", () => {
    it("bash エラーの多くは許容される", () => {
      const results = [
        { toolName: "core:bash", status: "error" as const, errorMessage: "diff file1 file2\nCommand exited with code 1" },
        { toolName: "core:read", status: "ok" as const },
        { toolName: "core:edit", status: "ok" as const },
      ];

      const evaluation = evaluateAgentRunOutcome(results);
      // diff exit code 1 is tolerated (counted but not critical)
      expect(evaluation.status).toBe("warning");
      expect(evaluation.shouldFail).toBe(false);
    });

    it("critical ツール失敗は全体を失敗にする", () => {
      const results = [
        { toolName: "core:bash", status: "ok" as const },
        { toolName: "core:edit", status: "error" as const, errorMessage: "Text not found" },
      ];

      const evaluation = evaluateAgentRunOutcome(results);
      expect(evaluation.status).toBe("error");
      expect(evaluation.criticalFailureCount).toBe(1);
      expect(evaluation.shouldFail).toBe(true);
    });

    it("非クリティカルツールの失敗は警告", () => {
      const results = [
        { toolName: "core:bash", status: "error" as const, errorMessage: "Some error" },
        { toolName: "core:read", status: "ok" as const },
      ];

      const evaluation = evaluateAgentRunOutcome(results);
      expect(evaluation.status).toBe("warning");
      expect(evaluation.shouldFail).toBe(false);
    });
  });
});
