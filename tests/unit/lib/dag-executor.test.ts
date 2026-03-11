/**
 * tests/unit/lib/dag-executor.test.ts
 * DAG 実行中の動的ノード追加と依存更新を検証する
 * research の staged follow-up を実行器レベルで支えるために存在する
 * Related: .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts, tests/unit/extensions/ul-workflow.test.ts
 */

import { describe, expect, it } from "vitest";
import { executeDag } from "../../../.pi/lib/dag-executor.js";
import type { TaskPlan } from "../../../.pi/lib/dag-types.js";

describe("dag-executor dynamic mutation", () => {
  it("バッチ完了後フックで follow-up ノードを追加し fan-in を更新できる", async () => {
    const plan: TaskPlan = {
      id: "dynamic-followup",
      description: "dynamic follow-up dag",
      tasks: [
        {
          id: "research-intent",
          description: "clarify intent",
          dependencies: [],
        },
        {
          id: "research-synthesis",
          description: "synthesize findings",
          dependencies: ["research-intent"],
          inputContext: ["research-intent"],
        },
      ],
      metadata: {
        createdAt: Date.now(),
        model: "test",
        totalEstimatedMs: 0,
        maxDepth: 1,
      },
    };

    const started: string[] = [];
    let followupAdded = false;

    const result = await executeDag(
      plan,
      async (task, context) => {
        started.push(task.id);
        if (task.id === "research-synthesis") {
          expect(context).toContain("Result from research-intent");
          expect(context).toContain("Result from research-deep-dive-external");
        }
        return `${task.id}-done`;
      },
      {
        maxConcurrency: 2,
        enableSelfRevision: false,
        enableLocalReplanning: false,
        onBatchSettled: (api, settlement) => {
          if (followupAdded || !settlement.completedTaskIds.includes("research-intent")) {
            return;
          }

          followupAdded = true;
          api.addNode({
            id: "research-deep-dive-external",
            description: "deep dive official docs",
            dependencies: ["research-intent"],
            inputContext: ["research-intent"],
          });
          api.addDependency("research-synthesis", "research-deep-dive-external");
          api.addInputContext("research-synthesis", "research-deep-dive-external");
          api.requeueTask("research-synthesis");
        },
      },
    );

    expect(result.overallStatus).toBe("completed");
    expect(started).toEqual([
      "research-intent",
      "research-deep-dive-external",
      "research-synthesis",
    ]);
    expect(result.completedTaskIds).toEqual([
      "research-intent",
      "research-deep-dive-external",
      "research-synthesis",
    ]);
  });
});
