// Path: tests/unit/extensions/task-auto-executor.test.ts
// What: Ralph的な次タスク選択と実行ブリーフを検証する単体テスト。
// Why: 通常時の auto executor が 1ループ1最重要項目 と validation lane 制約を守るようにするため。
// Related: .pi/extensions/task-auto-executor.ts, .pi/extensions/task.ts, AGENTS.md

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../.pi/extensions/ul-workflow.js", () => ({
  getInstanceId: vi.fn(() => "instance-1-123"),
  isProcessAlive: vi.fn(() => true),
  extractPidFromInstanceId: vi.fn(() => 123),
}));

import {
  buildRalphLoopExecutionBrief,
  classifyRalphLoopTaskKind,
  selectNextLoopTask,
} from "../../../.pi/extensions/task-auto-executor.js";

type TaskPriority = "low" | "medium" | "high" | "urgent";
type TaskStatus = "todo" | "in_progress" | "completed" | "cancelled" | "failed";

interface TaskLike {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  ownerInstanceId?: string;
  claimedAt?: string;
}

function createTask(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Implement parser recovery",
    description: overrides.description,
    status: overrides.status ?? "todo",
    priority: overrides.priority ?? "medium",
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? "2026-03-08T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-08T00:00:00.000Z",
    ownerInstanceId: overrides.ownerInstanceId,
    claimedAt: overrides.claimedAt,
  };
}

describe("classifyRalphLoopTaskKind", () => {
  it("実装タスクを implementation と判定する", () => {
    expect(classifyRalphLoopTaskKind(createTask({ title: "Fix parser bug" }) as never)).toBe("implementation");
  });

  it("検証タスクを validation と判定する", () => {
    expect(classifyRalphLoopTaskKind(createTask({ title: "Run tests and typecheck" }) as never)).toBe("validation");
  });
});

describe("selectNextLoopTask", () => {
  it("同じ priority なら validation より implementation を優先する", () => {
    const selection = selectNextLoopTask({
      tasks: [
        createTask({ id: "verify", title: "Run full test suite", priority: "urgent" }),
        createTask({ id: "impl", title: "Implement retry budget fix", priority: "urgent" }),
      ] as never[],
    } as never);

    expect(selection?.task.id).toBe("impl");
    expect(selection?.kind).toBe("implementation");
    expect(selection?.validationLaneLimited).toBe(true);
  });

  it("priority が高ければ validation でも先に選ぶ", () => {
    const selection = selectNextLoopTask({
      tasks: [
        createTask({ id: "verify", title: "Run full test suite", priority: "urgent" }),
        createTask({ id: "impl", title: "Implement retry budget fix", priority: "high" }),
      ] as never[],
    } as never);

    expect(selection?.task.id).toBe("verify");
    expect(selection?.kind).toBe("validation");
    expect(selection?.validationLaneLimited).toBe(false);
  });

  it("validation しかなければ validation を返す", () => {
    const selection = selectNextLoopTask({
      tasks: [
        createTask({ id: "verify", title: "Run full test suite", priority: "urgent" }),
      ] as never[],
    } as never);

    expect(selection?.task.id).toBe("verify");
    expect(selection?.kind).toBe("validation");
    expect(selection?.validationLaneLimited).toBe(false);
  });
});

describe("buildRalphLoopExecutionBrief", () => {
  it("1ループ1項目と validation lane 制約を含む", () => {
    const brief = buildRalphLoopExecutionBrief({
      task: createTask({ id: "impl" }) as never,
      kind: "implementation",
      reason: "one thing per loop: highest priority lane kept at urgent, implementation/research lane preferred over validation lane (implementation)",
      validationLaneLimited: true,
    });

    expect(brief).toContain("One thing per loop");
    expect(brief).toContain("Validation lane は1本に絞る");
    expect(brief).toContain("placeholder 実装は禁止");
  });
});
