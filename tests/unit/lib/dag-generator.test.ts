/**
 * tests/unit/lib/dag-generator.test.ts
 * 自動 DAG 生成とエージェント向け DAG 実行の回帰を検証する
 * 壊れやすい自動分解と fan-out / fan-in の挙動を固定する
 * Related: .pi/lib/dag-generator.ts, .pi/lib/dag-executor.ts, .pi/extensions/subagents.ts
 */

import { describe, expect, it } from "vitest";
import { generateDagFromTask } from "../../../.pi/lib/dag-generator.js";
import { executeDag } from "../../../.pi/lib/dag-executor.js";

describe("dag-generator", () => {
  it("明示的な調査タスクだけを research fan-out し synthesis に集約する", async () => {
    const plan = await generateDagFromTask("Investigate authentication flow and compare options");

    const researchTasks = plan.tasks.filter((task) => task.assignedAgent === "researcher");
    const synthesisTask = plan.tasks.find((task) => task.id.startsWith("research-synthesis-"));

    expect(researchTasks.length).toBeGreaterThanOrEqual(3);
    expect(synthesisTask).toBeDefined();
    expect(synthesisTask?.dependencies).toEqual(researchTasks.map((task) => task.id));
  });

  it("通常の実装とテストは不要な research なしで fan-in 付き DAG に分解する", async () => {
    const plan = await generateDagFromTask("Implement authentication and add tests");

    const researchTasks = plan.tasks.filter((task) => task.assignedAgent === "researcher");
    const implementTasks = plan.tasks.filter((task) => task.assignedAgent === "implementer");
    const testerTasks = plan.tasks.filter((task) => task.assignedAgent === "tester");

    expect(researchTasks.length).toBe(0);
    expect(implementTasks.length).toBeGreaterThan(0);
    expect(testerTasks.length).toBe(1);
    expect(testerTasks[0]?.dependencies).toEqual(implementTasks.map((task) => task.id));
  });

  it("複数の実装句を並列な implement タスクへ分解する", async () => {
    const plan = await generateDagFromTask(
      "Add auth endpoint, add user endpoint, add billing endpoint",
    );

    const implementTasks = plan.tasks.filter((task) => task.assignedAgent === "implementer");

    expect(implementTasks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(implementTasks.map((task) => task.id)).size).toBe(implementTasks.length);
  });

  it("preferredAgents がある場合は利用可能なエージェントに寄せる", async () => {
    const plan = await generateDagFromTask("Investigate auth flow and add tests", {
      preferredAgents: ["researcher", "implementer"],
    });

    expect(plan.tasks.every((task) => ["researcher", "implementer"].includes(task.assignedAgent || ""))).toBe(true);
  });
});

describe("dag execution from generated plan", () => {
  it("research 後に implement を並列実行し、その後 review を実行する", async () => {
    const plan = await generateDagFromTask(
      "Research API surface, add auth endpoint, add user endpoint, review the result",
    );

    const events: string[] = [];
    const started: string[] = [];

    const result = await executeDag(
      plan,
      async (task, context) => {
        started.push(task.id);
        events.push(`start:${task.id}`);

        if (task.assignedAgent === "reviewer") {
          expect(context).toContain("Result from");
        }

        await new Promise((resolve) => setTimeout(resolve, task.assignedAgent === "researcher" ? 5 : 1));

        events.push(`end:${task.id}`);
        return `${task.id}-done`;
      },
      { maxConcurrency: 3 },
    );

    const reviewTask = plan.tasks.find((task) => task.assignedAgent === "reviewer");
    const researchTasks = plan.tasks.filter((task) => task.assignedAgent === "researcher");
    const synthesisTask = plan.tasks.find((task) => task.id.startsWith("research-synthesis-"));
    const implementTasks = plan.tasks.filter((task) => task.assignedAgent === "implementer");

    expect(result.overallStatus).toBe("completed");
    expect(researchTasks.length).toBeGreaterThan(0);
    expect(synthesisTask).toBeDefined();
    expect(implementTasks.length).toBeGreaterThanOrEqual(2);
    expect(reviewTask).toBeDefined();
    expect(result.completedTaskIds).toContain(reviewTask!.id);
    expect(result.completedTaskIds).toContain(synthesisTask!.id);
    expect(started).toEqual(expect.arrayContaining(implementTasks.map((task) => task.id)));
  });
});
