/**
 * tests/unit/extensions/task-flow.test.ts
 * task_delegate の自動エージェント選択ヘルパーを検証する。
 * TurnExecutionContext 由来の preferredSubagentIds が委任先選択に効くことを固定するために存在する。
 * 関連ファイル: .pi/extensions/task-flow.ts, .pi/lib/agent/turn-context-builder.ts, .pi/extensions/subagents/storage.ts
 */

import { describe, expect, it } from "vitest";

import {
  inferTaskDelegateKind,
  selectTaskDelegateAgent,
} from "../../../.pi/extensions/task-flow.ts";

describe("task-flow delegation helpers", () => {
  it("設計タスクを planning と判定する", () => {
    expect(
      inferTaskDelegateKind({
        id: "task-1",
        title: "Design migration plan",
        description: "Prepare architecture options",
        status: "todo",
        priority: "high",
        tags: ["backend"],
        createdAt: "2026-03-07T00:00:00.000Z",
        updatedAt: "2026-03-07T00:00:00.000Z",
      }),
    ).toBe("planning");
  });

  it("preferredSubagentIds の順で enabled agent を選ぶ", () => {
    const selected = selectTaskDelegateAgent(
      [
        {
          id: "implementer",
          name: "Implementer",
          description: "Writes code",
          systemPrompt: "Implement changes",
          enabled: "enabled",
          createdAt: "2026-03-07T00:00:00.000Z",
          updatedAt: "2026-03-07T00:00:00.000Z",
        },
        {
          id: "architect",
          name: "Architect",
          description: "Plans changes",
          systemPrompt: "Design changes",
          enabled: "enabled",
          createdAt: "2026-03-07T00:00:00.000Z",
          updatedAt: "2026-03-07T00:00:00.000Z",
        },
      ],
      ["architect", "researcher"],
    );

    expect(selected?.id).toBe("architect");
  });

  it("preferred が見つからないときは最初の enabled agent に戻す", () => {
    const selected = selectTaskDelegateAgent(
      [
        {
          id: "reviewer",
          name: "Reviewer",
          description: "Reviews risks",
          systemPrompt: "Review changes",
          enabled: "enabled",
          createdAt: "2026-03-07T00:00:00.000Z",
          updatedAt: "2026-03-07T00:00:00.000Z",
        },
        {
          id: "tester",
          name: "Tester",
          description: "Validates changes",
          systemPrompt: "Test changes",
          enabled: "enabled",
          createdAt: "2026-03-07T00:00:00.000Z",
          updatedAt: "2026-03-07T00:00:00.000Z",
        },
      ],
      ["architect"],
    );

    expect(selected?.id).toBe("reviewer");
  });
});
