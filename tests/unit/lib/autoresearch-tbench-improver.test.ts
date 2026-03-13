// path: tests/unit/lib/autoresearch-tbench-improver.test.ts
// role: terminal-bench 自動改善向けの失敗要約と prompt 生成を検証する
// why: 自動 loop が benchmark の失敗原因を読み間違えず、改善 agent に渡せるようにするため
// related: .pi/lib/autoresearch-tbench-improver.ts, .pi/lib/autoresearch-tbench.ts, tests/unit/lib/autoresearch-tbench.test.ts

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildAutoresearchTbenchImprovementPrompt,
  readAutoresearchTbenchFailureDigest,
} from "../../../.pi/lib/autoresearch-tbench-improver.js";

function createTempJobDir(): string {
  return mkdtempSync(join(tmpdir(), "autoresearch-tbench-improver-"));
}

describe("autoresearch-tbench improver", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("job result と trial stderr から failure digest を作る", () => {
    const jobDir = createTempJobDir();
    tempDirs.push(jobDir);
    const trialDir = join(jobDir, "fix-git__trial");
    mkdirSync(join(trialDir, "agent"), { recursive: true });

    writeFileSync(join(jobDir, "result.json"), JSON.stringify({
      started_at: "2026-03-14T00:00:00.000Z",
      finished_at: "2026-03-14T00:02:00.000Z",
      n_total_trials: 2,
      stats: {
        n_trials: 2,
        n_errors: 1,
        evals: {
          "pi__terminal-bench": {
            n_trials: 2,
            n_errors: 1,
            metrics: [{ mean: 0.5 }],
            reward_stats: {
              reward: {
                "1.0": ["task-a"],
                "0.0": ["task-b"],
              },
            },
          },
        },
      },
    }));

    writeFileSync(join(trialDir, "result.json"), JSON.stringify({
      task_name: "fix-git",
      trial_name: "fix-git__trial",
      agent_result: {
        metadata: {
          exitCode: 137,
          stderrLog: join(trialDir, "agent", "pi-stderr.txt"),
        },
      },
      exception_info: {
        exception_type: "RuntimeError",
        exception_message: "pi agent run failed with exit code 137",
      },
    }));

    writeFileSync(join(trialDir, "agent", "pi-stderr.txt"), [
      "[invariant-pipeline] Extension loading...",
      "/bin/sh: 1: ps: not found",
      "fatal: not a git repository (or any of the parent directories): .git",
    ].join("\n"));

    const digest = readAutoresearchTbenchFailureDigest(join(jobDir, "result.json"));

    expect(digest).not.toBeNull();
    expect(digest?.successCount).toBe(1);
    expect(digest?.errorCount).toBe(1);
    expect(digest?.failureInsights[0]?.taskName).toBe("fix-git");
    expect(digest?.failureInsights[0]?.stderrExcerpt).toContain("ps: not found");
    expect(digest?.topExceptionTypes[0]).toEqual({ name: "RuntimeError", count: 1 });
  });

  it("改善 prompt に fixed tasks と failure digest を埋め込む", () => {
    const prompt = buildAutoresearchTbenchImprovementPrompt({
      taskNames: ["fix-git", "break-filter-js-from-html"],
      bestScoreLine: "success=2 completed=2/6 mean_reward=0.3333 errors=4 elapsed_ms=120000",
      lastScoreLine: "success=0 completed=6/6 mean_reward=0.0000 errors=6 elapsed_ms=989946",
      failureDigest: {
        totalTrials: 6,
        completedTrials: 6,
        successCount: 0,
        errorCount: 6,
        meanReward: 0,
        elapsedMs: 989946,
        topExceptionTypes: [{ name: "RuntimeError", count: 5 }],
        failureInsights: [{
          taskName: "fix-git",
          trialName: "fix-git__trial",
          exceptionType: "RuntimeError",
          exceptionMessage: "pi agent run failed with exit code 137",
          stderrExcerpt: "/bin/sh: 1: ps: not found",
          stopReason: null,
          exitCode: 137,
        }],
      },
      piImprovementBrief: "health: critical\n- failing feature: startup-context",
    });

    expect(prompt).toContain("Fixed tasks: fix-git, break-filter-js-from-html");
    expect(prompt).toContain("Current best score: success=2");
    expect(prompt).toContain("top_exceptions: RuntimeError(5)");
    expect(prompt).toContain("stderr: /bin/sh: 1: ps: not found");
    expect(prompt).toContain("Do not commit.");
  });
});
