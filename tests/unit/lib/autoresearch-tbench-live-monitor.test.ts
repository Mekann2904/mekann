/**
 * path: tests/unit/lib/autoresearch-tbench-live-monitor.test.ts
 * role: autoresearch-tbench live monitor の snapshot 集計と activity 抽出を検証する
 * why: 実行中表示が壊れると改善ループの観測性が落ちるため、trial phase と activity の推定を固定するため
 * related: .pi/lib/autoresearch-tbench-live-monitor.ts, .pi/extensions/autoresearch-tbench.ts, tests/unit/lib/autoresearch-tbench.test.ts, scripts/run-terminal-bench.sh
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  collectAutoresearchTbenchLiveSnapshot,
  renderAutoresearchTbenchLiveView,
} from "../../../.pi/lib/autoresearch-tbench-live-monitor.js";

const createdRoots: string[] = [];

function createTempRoot(): string {
  const root = join(process.cwd(), ".tmp-autoresearch-tbench-live-monitor", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(root, { recursive: true });
  createdRoots.push(root);
  return root;
}

function createTrial(root: string, name: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "agent"), { recursive: true });
  mkdirSync(join(dir, "verifier"), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const root of createdRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("autoresearch-tbench live monitor", () => {
  it("trial の setup / running / completed を snapshot に反映する", () => {
    const jobsDir = createTempRoot();
    const jobDir = join(jobsDir, "2026-03-14__00-01-22");
    mkdirSync(jobDir, { recursive: true });

    const setupTrial = createTrial(jobDir, "fix-git__abc");
    writeFileSync(join(setupTrial, "agent", "setup-stdout.txt"), "added 562 packages in 17s\n");

    const runningTrial = createTrial(jobDir, "break-filter-js-from-html__def");
    writeFileSync(
      join(runningTrial, "agent", "pi-events.jsonl"),
      [
        "{\"type\":\"agent_start\"}",
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "thinking_delta",
            partial: {
              content: [{
                type: "thinking",
                thinking: "Trying SVG payloads against the filter",
              }],
            },
          },
        }),
      ].join("\n"),
    );

    const completedTrial = createTrial(jobDir, "cobol-modernization__ghi");
    writeFileSync(join(completedTrial, "result.json"), JSON.stringify({
      task_name: "cobol-modernization",
      started_at: "2026-03-14T00:00:00.000Z",
      finished_at: "2026-03-14T00:10:00.000Z",
      verifier_result: { rewards: { reward: 1.0 } },
      exception_info: null,
    }));

    const snapshot = collectAutoresearchTbenchLiveSnapshot({
      label: "baseline",
      jobsDir,
      taskNames: ["fix-git", "break-filter-js-from-html", "cobol-modernization"],
      startedAtMs: Date.now() - 10_000,
    });

    expect(snapshot.totalTrials).toBe(3);
    expect(snapshot.completedTrials).toBe(1);
    expect(snapshot.successCount).toBe(1);
    expect(snapshot.setupCount).toBe(1);
    expect(snapshot.runningCount).toBe(1);
    expect(snapshot.trials.find((trial) => trial.taskName === "fix-git")?.phase).toBe("setup");
    expect(snapshot.trials.find((trial) => trial.taskName === "break-filter-js-from-html")?.activity).toContain("thinking:");
    expect(snapshot.trials.find((trial) => trial.taskName === "cobol-modernization")?.phase).toBe("completed");
    // LLMメトリクスが含まれていることを確認
    expect(snapshot.totalLlmMetrics).toBeDefined();
    expect(snapshot.trials.every((trial) => trial.llmMetrics !== undefined)).toBe(true);
  });

  it("render は trial 一覧を含む", () => {
    const emptyMetrics = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      apiCalls: 0,
    };

    const lines = renderAutoresearchTbenchLiveView({
      bold: (text: string) => text,
      fg: (_color: string, text: string) => text,
    } as never, {
      label: "run",
      startedAtMs: Date.now() - 3_000,
      elapsedMs: 3_000,
      jobsDir: "/tmp/jobs",
      jobDir: "/tmp/jobs/job-1",
      totalTrials: 2,
      completedTrials: 1,
      successCount: 1,
      failedCount: 0,
      runningCount: 1,
      setupCount: 0,
      pendingCount: 0,
      statusLine: "job=job-1  done=1/2  ok=1  fail=0  run=1  setup=0",
      trials: [
        {
          trialName: "task-a__1",
          taskName: "task-a",
          phase: "running",
          reward: null,
          elapsedMs: 2_000,
          activity: "thinking: checking inputs",
          llmMetrics: { ...emptyMetrics, inputTokens: 1000, outputTokens: 500, totalTokens: 1500, apiCalls: 1 },
        },
        {
          trialName: "task-b__2",
          taskName: "task-b",
          phase: "completed",
          reward: 1,
          elapsedMs: 1_000,
          activity: "reward=1",
          llmMetrics: { ...emptyMetrics, inputTokens: 2000, outputTokens: 800, totalTokens: 2800, apiCalls: 2 },
        },
      ],
      totalLlmMetrics: { ...emptyMetrics, inputTokens: 3000, outputTokens: 1300, totalTokens: 4300, apiCalls: 3 },
    }, 120, 20);

    expect(lines.join("\n")).toContain("Autoresearch Tbench [run]");
    expect(lines.join("\n")).toContain("task-a");
    expect(lines.join("\n")).toContain("thinking: checking inputs");
    // LLMメトリクスが表示されることを確認
    expect(lines.join("\n")).toContain("LLM:");
    expect(lines.join("\n")).toContain("calls=3");
  });
});
