/**
 * path: tests/unit/lib/autoresearch-tbench.test.ts
 * role: terminal-bench autoresearch の score 比較、result 正規化、stop 状態更新を検証する
 * why: keep/drop 判定と途中停止の制御が壊れず、比較ループを安全に回せるようにするため
 * related: .pi/lib/autoresearch-tbench.ts, scripts/autoresearch-tbench.ts, tests/unit/lib/autoresearch-e2e.test.ts, scripts/run-terminal-bench.sh
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  compareAutoresearchTbenchScores,
  determineAutoresearchTbenchOutcome,
  formatAutoresearchTbenchScore,
  parseTerminalBenchJobReport,
  readAutoresearchTbenchState,
  requestStopAutoresearchTbench,
  writeAutoresearchTbenchState,
} from "../../../.pi/lib/autoresearch-tbench.js";

function createTempRepo(): string {
  return mkdtempSync(join(tmpdir(), "autoresearch-tbench-test-"));
}

function createState() {
  return {
    version: 1,
    createdAt: "2026-03-14T00:00:00.000Z",
    updatedAt: "2026-03-14T00:00:00.000Z",
    tag: "mekann-tbench",
    gitEnabled: false,
    bestCommit: "abc123",
    baselineCommit: "abc123",
    experimentCount: 0,
    runConfig: {
      taskSelector: "easy=2",
      taskNames: ["task-a", "task-b"],
      dataset: "terminal-bench@2.0",
      datasetPath: null,
      agent: "pi",
      agentImportPath: null,
      model: null,
      nConcurrent: 2,
      jobsDir: "/tmp/jobs",
      agentSetupTimeoutMultiplier: 4,
      forceBuild: null,
      excludeTaskNames: [],
    },
  };
}

describe("autoresearch-tbench", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("success 数が増えた候補を improved と判定する", () => {
    const outcome = determineAutoresearchTbenchOutcome(
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 0.75,
        elapsedMs: 12_000,
      },
      {
        successCount: 3,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 0.75,
        elapsedMs: 10_000,
      },
    );

    expect(outcome).toBe("improved");
  });

  it("成功数が同じなら mean reward を優先する", () => {
    const result = compareAutoresearchTbenchScores(
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 1,
        meanReward: 0.9,
        elapsedMs: 15_000,
      },
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 0.8,
        elapsedMs: 2_000,
      },
    );

    expect(result).toBe(1);
  });

  it("成功数が同じなら completed trial 数を mean reward と error より優先する", () => {
    const result = compareAutoresearchTbenchScores(
      {
        successCount: 0,
        completedTrials: 3,
        totalTrials: 6,
        errorCount: 3,
        meanReward: 0,
        elapsedMs: 120_000,
      },
      {
        successCount: 0,
        completedTrials: 1,
        totalTrials: 6,
        errorCount: 1,
        meanReward: 0,
        elapsedMs: 30_000,
      },
    );

    expect(result).toBe(1);
  });

  it("完全同点なら elapsed が短い候補を優先する", () => {
    const result = compareAutoresearchTbenchScores(
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 1,
        elapsedMs: 9_000,
      },
      {
        successCount: 4,
        completedTrials: 6,
        totalTrials: 6,
        errorCount: 0,
        meanReward: 1,
        elapsedMs: 12_000,
      },
    );

    expect(result).toBe(1);
  });

  it("terminal-bench result.json を score に正規化する", () => {
    const parsed = parseTerminalBenchJobReport(JSON.stringify({
      started_at: "2026-03-13T00:00:00.000Z",
      finished_at: "2026-03-13T00:02:00.000Z",
      n_total_trials: 6,
      stats: {
        n_trials: 6,
        n_errors: 1,
        evals: {
          "pi__terminal-bench": {
            n_trials: 6,
            n_errors: 1,
            metrics: [{ mean: 0.75 }],
            reward_stats: {
              reward: {
                "1.0": ["task-a", "task-b", "task-c", "task-d"],
                "0.5": ["task-e"],
                "0.0": ["task-f"],
              },
            },
            exception_stats: {
              AgentTimeoutError: ["task-f"],
            },
          },
        },
      },
    }));

    expect(parsed.score).toEqual({
      successCount: 4,
      completedTrials: 6,
      totalTrials: 6,
      errorCount: 1,
      meanReward: 0.75,
      elapsedMs: 120_000,
    });
    expect(parsed.exceptionBuckets.AgentTimeoutError).toEqual(["task-f"]);
    expect(formatAutoresearchTbenchScore(parsed.score)).toContain("success=4");
  });

  it("eval の n_trials が 0 でも stats.n_trials から completed trial 数を拾う", () => {
    const parsed = parseTerminalBenchJobReport(JSON.stringify({
      started_at: "2026-03-14T00:31:14.200280",
      finished_at: null,
      n_total_trials: 6,
      stats: {
        n_trials: 3,
        n_errors: 3,
        evals: {
          "pi__terminal-bench": {
            n_trials: 0,
            n_errors: 3,
            metrics: [{ mean: 0.0 }],
            reward_stats: {
              reward: {},
            },
            exception_stats: {
              RuntimeError: ["task-a", "task-b", "task-c"],
            },
          },
        },
      },
    }));

    expect(parsed.score.completedTrials).toBe(3);
    expect(parsed.score.errorCount).toBe(3);
    expect(parsed.score.totalTrials).toBe(6);
  });

  it("state が無いと stop を受け付けない", () => {
    const cwd = createTempRepo();
    tempDirs.push(cwd);

    const result = requestStopAutoresearchTbench(cwd);

    expect(result.requested).toBe(false);
    expect(result.reason).toBe("state not initialized");
    expect(result.state).toBeNull();
  });

  it("active run が死んでいたら stale state を掃除する", () => {
    const cwd = createTempRepo();
    tempDirs.push(cwd);
    writeAutoresearchTbenchState(cwd, {
      ...createState(),
      activeRun: {
        pid: 4242,
        label: "baseline",
        startedAt: "2026-03-14T00:01:00.000Z",
      },
    });

    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === 4242 && signal === 0) {
        throw new Error("ESRCH");
      }
      return true;
    }) as typeof process.kill);

    const result = requestStopAutoresearchTbench(cwd);
    const nextState = readAutoresearchTbenchState(cwd);

    expect(result.requested).toBe(false);
    expect(result.reason).toBe("no active autoresearch-tbench run");
    expect(nextState?.activeRun).toBeUndefined();
    expect(nextState?.stopRequestedAt).toBeUndefined();
  });

  it("active run が生きていたら stopRequestedAt を残す", () => {
    const cwd = createTempRepo();
    tempDirs.push(cwd);
    writeAutoresearchTbenchState(cwd, {
      ...createState(),
      activeRun: {
        pid: 5252,
        label: "experiment",
        startedAt: "2026-03-14T00:02:00.000Z",
      },
    });

    vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: number | NodeJS.Signals) => {
      if (pid === 5252 && signal === 0) {
        return true;
      }
      return true;
    }) as typeof process.kill);

    const result = requestStopAutoresearchTbench(cwd);
    const nextState = readAutoresearchTbenchState(cwd);

    expect(result.requested).toBe(true);
    expect(result.reason).toContain("stop requested for pid=5252");
    expect(nextState?.activeRun?.pid).toBe(5252);
    expect(typeof nextState?.stopRequestedAt).toBe("string");
  });
});
