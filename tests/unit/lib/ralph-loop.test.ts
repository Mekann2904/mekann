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
      writeFileSync(join(stateDir, ".last-branch"), "feature-one\n");

      const status = inspectRalphLoop({
        cwd,
        getDateStamp: () => "2026-03-09",
      });

      expect(status.archivedTo).toContain("2026-03-09-feature-one");
      expect(readFileSync(join(stateDir, "progress.txt"), "utf-8")).toBe("");
      expect(readFileSync(join(stateDir, ".last-branch"), "utf-8").trim()).toBe("feature-two");
      expect(readFileSync(join(status.archivedTo!, "progress.txt"), "utf-8")).toBe("old progress");
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
      writeFileSync(join(stateDir, "PI.md"), "run the task");

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
      });

      expect(result.completed).toBe(true);
      expect(result.stopReason).toBe("complete");
      expect(result.iterations).toHaveLength(2);
      expect(spawnCommand).toHaveBeenCalledTimes(2);
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
      expect(result.created.prompt).toBe(true);
      expect(result.created.progress).toBe(true);

      expect(existsSync(result.paths.prdPath)).toBe(true);
      expect(existsSync(result.paths.promptPath)).toBe(true);
      expect(existsSync(result.paths.progressPath)).toBe(true);

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

      expect(result.paths.promptPath).toContain("CLAUDE.md");
      const prompt = readFileSync(result.paths.promptPath, "utf-8");
      expect(prompt).toContain("Claude");
    });

    it("AMP用のプロンプトファイルを作成する", () => {
      const cwd = createRepo();

      const result = initRalphLoop({
        cwd,
        runtime: "amp",
        resolveCurrentBranch: () => "main",
      });

      expect(result.paths.promptPath).toContain("prompt.md");
      const prompt = readFileSync(result.paths.promptPath, "utf-8");
      expect(prompt).toContain("AMP");
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
      const message = buildMissingFileMessage("prompt", "/path/to/PI.md", "pi");

      expect(message).toContain("プロンプトファイルが見つかりません");
      expect(message).toContain("PI.md");
      expect(message).toContain("ralph_loop_init");
    });
  });
});
