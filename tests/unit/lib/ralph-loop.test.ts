/**
 * path: tests/unit/lib/ralph-loop.test.ts
 * role: Ralph loop の file-based orchestration を検証する
 * why: branch archive と fresh-process loop が参照元の責務に沿って壊れないようにするため
 * related: .pi/lib/ralph-loop.ts, .pi/extensions/ralph-loop.ts, tests/unit/extensions/ralph-loop.test.ts, WORKFLOW.md
 *
 * @summary Ralph Loopライブラリのユニットテスト
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  initRalphLoop,
  inspectRalphLoop,
  runRalphLoop,
  buildMissingFileMessage,
} from "../../../.pi/lib/ralph-loop.js";

/**
 * テスト用の一時リポジトリを作成する
 * @returns 一時ディレクトリのパス
 */
function createRepo(): string {
  return mkdtempSync(join(tmpdir(), "mekann-ralph-"));
}

describe("ralph-loop lib", () => {
  describe("inspectRalphLoop", () => {
    it("branch が変わると state snapshot を archive して progress を初期化する", () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(
        join(stateDir, "prd.json"),
        JSON.stringify({ branchName: "feature-two" }, null, 2)
      );
      writeFileSync(join(stateDir, "progress.txt"), "old progress");
      writeFileSync(join(stateDir, "IMPLEMENTATION_PLAN.md"), "# old plan");
      writeFileSync(join(stateDir, ".last-branch"), "feature-one\n");

      const status = inspectRalphLoop({
        cwd,
        getDateStamp: () => "2026-03-09",
      });

      expect(status.archivedTo).toContain("2026-03-09-feature-one");
      expect(readFileSync(join(stateDir, "progress.txt"), "utf-8")).toBe("");
      expect(readFileSync(join(stateDir, "IMPLEMENTATION_PLAN.md"), "utf-8")).toContain(
        "# IMPLEMENTATION_PLAN"
      );
      expect(readFileSync(join(stateDir, ".last-branch"), "utf-8").trim()).toBe("feature-two");
      expect(readFileSync(join(status.archivedTo!, "progress.txt"), "utf-8")).toBe("old progress");
      expect(readFileSync(join(status.archivedTo!, "IMPLEMENTATION_PLAN.md"), "utf-8")).toBe("# old plan");
    });
  });

  describe("runRalphLoop", () => {
    it("COMPLETE を受け取った反復で loop を停止する", async () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(
        join(stateDir, "prd.json"),
        JSON.stringify({ branchName: "feature-one" }, null, 2)
      );
      writeFileSync(join(stateDir, "progress.txt"), "");
      writeFileSync(join(stateDir, "PROMPT_build.md"), "run the task");

      const spawnCommand = vi
        .fn()
        .mockResolvedValueOnce({ stdout: "still working", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "COMPLETE", stderr: "", exitCode: 0 });

      const result = await runRalphLoop({
        cwd,
        runtime: "pi",
        maxIterations: 5,
        sleepMs: 0,
        spawnCommand,
        resolveCurrentBranch: () => "feature-one",
        subagentConfig: {
          maxParallelExplore: 100,
          maxParallelImplement: 10,
          maxParallelBuild: 1,
          maxParallelTest: 1,
          maxParallelReview: 3,
          backpressureTypes: ["build", "test", "lint"],
          rateLimitMs: 0, // テスト用にレート制限を無効化
        },
      });

      expect(result.completed).toBe(true);
      expect(result.mode).toBe("build");
      expect(result.promptPathUsed).toContain("PROMPT_build.md");
      expect(result.stopReason).toBe("complete");
      expect(result.iterations).toHaveLength(2);
      expect(spawnCommand).toHaveBeenCalledTimes(2);
    });

    it("各 iteration ごとに prompt を読み直す", async () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(join(stateDir, "prd.json"), JSON.stringify({ branchName: "feature-one" }, null, 2));
      writeFileSync(join(stateDir, "progress.txt"), "");
      writeFileSync(join(stateDir, "PROMPT_build.md"), "first prompt");

      const seenPrompts: string[] = [];
      const spawnCommand = vi.fn(async (input: { prompt: string }) => {
        seenPrompts.push(input.prompt);
        if (seenPrompts.length === 1) {
          writeFileSync(join(stateDir, "PROMPT_build.md"), "second prompt");
          return { stdout: "continue", stderr: "", exitCode: 0 };
        }
        return { stdout: "COMPLETE", stderr: "", exitCode: 0 };
      });

      await runRalphLoop({
        cwd,
        runtime: "pi",
        maxIterations: 3,
        sleepMs: 0,
        spawnCommand,
        resolveCurrentBranch: () => "feature-one",
      });

      expect(seenPrompts).toEqual(["first prompt", "second prompt"]);
    });

    it("prd.json がない場合、親切なエラーメッセージを投げる", async () => {
      const cwd = createRepo();

      await expect(
        runRalphLoop({
          cwd,
          runtime: "pi",
          resolveCurrentBranch: () => "main",
        })
      ).rejects.toThrow("prd.json が見つかりません");
    });

    it("プロンプトファイルがない場合、親切なエラーメッセージを投げる", async () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(join(stateDir, "prd.json"), JSON.stringify({ branchName: "main" }, null, 2));

      await expect(
        runRalphLoop({
          cwd,
          runtime: "pi",
          resolveCurrentBranch: () => "main",
        })
      ).rejects.toThrow("プロンプトファイルが見つかりません");
    });

    it("plan-work は workScope が必須", async () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      writeFileSync(join(stateDir, "prd.json"), JSON.stringify({ branchName: "feature-scope" }, null, 2));
      writeFileSync(join(stateDir, "PROMPT_plan_work.md"), "scope=${WORK_SCOPE}");

      await expect(
        runRalphLoop({
          cwd,
          mode: "plan-work",
          resolveCurrentBranch: () => "feature-scope",
        })
      ).rejects.toThrow("workScope");
    });
  });

  describe("initRalphLoop", () => {
    it("必要なファイルをすべて作成する", () => {
      const cwd = createRepo();

      const result = initRalphLoop({
        cwd,
        runtime: "pi",
        resolveCurrentBranch: () => "feature/test",
      });

      expect(result.created.prd).toBe(true);
      expect(result.created.progress).toBe(true);
      expect(result.created.promptPlan).toBe(true);
      expect(result.created.promptBuild).toBe(true);
      expect(result.created.promptPlanWork).toBe(true);
      expect(result.created.implementationPlan).toBe(true);
      expect(result.created.agentMd).toBe(true);

      expect(existsSync(result.paths.prdPath)).toBe(true);
      expect(existsSync(result.paths.progressPath)).toBe(true);
      expect(existsSync(result.paths.promptPlanPath)).toBe(true);
      expect(existsSync(result.paths.promptBuildPath)).toBe(true);
      expect(existsSync(result.paths.promptPlanWorkPath)).toBe(true);
      expect(existsSync(result.paths.implementationPlanPath)).toBe(true);
      expect(existsSync(result.paths.agentMdPath)).toBe(true);
      expect(result.paths.agentMdPath).toContain("AGENTS.md");

      // prd.jsonの内容を確認
      const prd = JSON.parse(readFileSync(result.paths.prdPath, "utf-8"));
      expect(prd.branchName).toBe("feature/test");
      expect(prd.title).toBeDefined();
      expect(Array.isArray(prd.tasks)).toBe(true);
    });

    it("既存のファイルを上書きしない（force: false）", () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      const existingPrd = { branchName: "existing", title: "Existing Project" };
      writeFileSync(join(stateDir, "prd.json"), JSON.stringify(existingPrd, null, 2));

      const result = initRalphLoop({
        cwd,
        runtime: "pi",
        force: false,
        resolveCurrentBranch: () => "main",
      });

      expect(result.created.prd).toBe(false);

      const prd = JSON.parse(readFileSync(result.paths.prdPath, "utf-8"));
      expect(prd.branchName).toBe("existing");
    });

    it("force: true で既存のファイルを上書きする", () => {
      const cwd = createRepo();
      const stateDir = join(cwd, ".pi", "ralph");
      mkdirSync(stateDir, { recursive: true });

      const existingPrd = { branchName: "existing", title: "Existing Project" };
      writeFileSync(join(stateDir, "prd.json"), JSON.stringify(existingPrd, null, 2));

      const result = initRalphLoop({
        cwd,
        runtime: "pi",
        force: true,
        prdContent: { branchName: "new-branch" },
        resolveCurrentBranch: () => "main",
      });

      expect(result.created.prd).toBe(true);

      const prd = JSON.parse(readFileSync(result.paths.prdPath, "utf-8"));
      expect(prd.branchName).toBe("new-branch");
    });

    it("カスタムPRD内容を反映する", () => {
      const cwd = createRepo();

      const result = initRalphLoop({
        cwd,
        runtime: "pi",
        prdContent: {
          title: "カスタムプロジェクト",
          tasks: [
            { id: "task-1", title: "タスク1", status: "pending" },
            { id: "task-2", title: "タスク2", status: "pending" },
          ],
        },
        resolveCurrentBranch: () => "main",
      });

      const prd = JSON.parse(readFileSync(result.paths.prdPath, "utf-8"));
      expect(prd.title).toBe("カスタムプロジェクト");
      expect(prd.tasks).toHaveLength(2);
    });

    it("Claude用のプロンプトファイルを作成する", () => {
      const cwd = createRepo();

      const result = initRalphLoop({
        cwd,
        runtime: "claude",
        resolveCurrentBranch: () => "main",
      });

      expect(result.paths.promptBuildPath).toContain("PROMPT_build.md");
      const prompt = readFileSync(result.paths.promptBuildPath, "utf-8");
      expect(prompt).toContain("IMPLEMENTATION_PLAN");
    });

    it("AMP用のプロンプトファイルを作成する", () => {
      const cwd = createRepo();

      const result = initRalphLoop({
        cwd,
        runtime: "amp",
        resolveCurrentBranch: () => "main",
      });

      expect(result.paths.promptBuildPath).toContain("PROMPT_build.md");
      const prompt = readFileSync(result.paths.promptBuildPath, "utf-8");
      expect(prompt).toContain("required tests");
    });
  });

  describe("buildMissingFileMessage", () => {
    it("prd.json 用のメッセージを生成する", () => {
      const message = buildMissingFileMessage("prd", "/path/to/prd.json", "pi");

      expect(message).toContain("prd.json が見つかりません");
      expect(message).toContain("ralph_loop_init");
      expect(message).toContain("/path/to/prd.json");
    });

    it("プロンプトファイル用のメッセージを生成する", () => {
      const message = buildMissingFileMessage("prompt", "/path/to/PROMPT_build.md", "pi");

      expect(message).toContain("プロンプトファイルが見つかりません");
      expect(message).toContain("PROMPT_build.md");
      expect(message).toContain("ralph_loop_init");
    });
  });

  describe("バックプレッシャー制御", () => {
    it("タスク種別に応じた並列数を取得する", async () => {
      const { getMaxParallelForTaskType, DEFAULT_SUBAGENT_CONFIG } = await import("../../../.pi/lib/ralph-loop.js");

      expect(getMaxParallelForTaskType("explore", DEFAULT_SUBAGENT_CONFIG)).toBe(100);
      expect(getMaxParallelForTaskType("implement", DEFAULT_SUBAGENT_CONFIG)).toBe(10);
      expect(getMaxParallelForTaskType("build", DEFAULT_SUBAGENT_CONFIG)).toBe(1);
      expect(getMaxParallelForTaskType("test", DEFAULT_SUBAGENT_CONFIG)).toBe(1);
      expect(getMaxParallelForTaskType("review", DEFAULT_SUBAGENT_CONFIG)).toBe(3);
    });
  });

  describe("プレースホルダー検出", () => {
    it("TODOコメントを検出する", async () => {
      const { detectPlaceholders, DEFAULT_PLACEHOLDER_PATTERNS } = await import("../../../.pi/lib/ralph-loop.js");

      const content = "// TODO: 後で実装する\nfunction foo() {}";
      const result = detectPlaceholders(content, "test.ts", DEFAULT_PLACEHOLDER_PATTERNS);

      expect(result.detected.length).toBeGreaterThan(0);
      expect(result.detected[0].pattern.name).toBe("TODO_COMMENT");
    });

    it("PLACEHOLDERキーワードを検出する", async () => {
      const { detectPlaceholders, DEFAULT_PLACEHOLDER_PATTERNS } = await import("../../../.pi/lib/ralph-loop.js");

      const content = "const x = placeholder;";
      const result = detectPlaceholders(content, "test.ts", DEFAULT_PLACEHOLDER_PATTERNS);

      const placeholderResult = result.detected.find(d => d.pattern.name === "PLACEHOLDER_KEYWORD");
      expect(placeholderResult).toBeDefined();
    });
  });

  describe("検索ログ", () => {
    it("検索エントリを記録して読み込む", async () => {
      const { logSearchEntry, readSearchLog } = await import("../../../.pi/lib/ralph-loop.js");
      const cwd = createRepo();
      const searchLogPath = join(cwd, "search-log.json");

      logSearchEntry({
        timestamp: new Date().toISOString(),
        query: "test query",
        type: "code",
        resultsFound: 5,
        filesChecked: ["file1.ts", "file2.ts"],
      }, searchLogPath);

      const entries = readSearchLog(searchLogPath);
      expect(entries.length).toBe(1);
      expect(entries[0].query).toBe("test query");
      expect(entries[0].resultsFound).toBe(5);
    });
  });
});
