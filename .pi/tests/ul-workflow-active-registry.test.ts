/**
 * path: .pi/tests/ul-workflow-active-registry.test.ts
 * role: UL active registry の純粋ロジックを検証するテスト
 * why: 複数 pi インスタンスが active workflow を独立して持てることを保証するため
 * related: .pi/extensions/ul-workflow.ts, .pi/tests/ownership.test.ts
 */

import { describe, expect, it } from "vitest";

import {
  resolveInstanceActiveTaskId,
  updateActiveWorkflowRegistryForInstance,
  type ActiveWorkflowRegistryEntry,
} from "../extensions/ul-workflow.js";

interface TestWorkflowState {
  taskId: string;
  taskDescription: string;
  phase: "research" | "plan" | "annotate" | "implement" | "completed" | "aborted";
  phases: string[];
  phaseIndex: number;
  createdAt: string;
  updatedAt: string;
  approvedPhases: string[];
  annotationCount: number;
  ownerInstanceId: string;
}

interface TestRegistry {
  activeTaskId: string | null;
  ownerInstanceId: string | null;
  updatedAt: string;
  activeByInstance?: Record<string, ActiveWorkflowRegistryEntry>;
}

function createWorkflow(taskId: string, ownerInstanceId: string): TestWorkflowState {
  const now = new Date().toISOString();
  return {
    taskId,
    taskDescription: `task:${taskId}`,
    phase: "research",
    phases: ["research", "plan", "annotate", "implement", "completed"],
    phaseIndex: 0,
    createdAt: now,
    updatedAt: now,
    approvedPhases: [],
    annotationCount: 0,
    ownerInstanceId,
  };
}

describe("UL active registry", () => {
  it("returns each instance's own active task id", () => {
    const workflowA = createWorkflow("task-a", `instance-a-${process.pid}`);
    const workflowB = createWorkflow("task-b", `instance-b-${process.pid}`);

    let registry: TestRegistry = {
      activeTaskId: null,
      ownerInstanceId: null,
      updatedAt: new Date().toISOString(),
      activeByInstance: {},
    };

    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-a-${process.pid}`, workflowA);
    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-b-${process.pid}`, workflowB);

    expect(resolveInstanceActiveTaskId(registry, `instance-a-${process.pid}`)).toBe("task-a");
    expect(resolveInstanceActiveTaskId(registry, `instance-b-${process.pid}`)).toBe("task-b");
  });

  it("clears only the target instance entry", () => {
    const workflowA = createWorkflow("task-a", `instance-a-${process.pid}`);
    const workflowB = createWorkflow("task-b", `instance-b-${process.pid}`);

    let registry: TestRegistry = {
      activeTaskId: null,
      ownerInstanceId: null,
      updatedAt: new Date().toISOString(),
      activeByInstance: {},
    };

    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-a-${process.pid}`, workflowA);
    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-b-${process.pid}`, workflowB);
    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-b-${process.pid}`, null);

    expect(resolveInstanceActiveTaskId(registry, `instance-b-${process.pid}`)).toBeNull();
    expect(resolveInstanceActiveTaskId(registry, `instance-a-${process.pid}`)).toBe("task-a");
  });

  it("stores per-instance registry entries separately", () => {
    const workflowA = createWorkflow("task-a", `instance-a-${process.pid}`);
    const workflowB = createWorkflow("task-b", `instance-b-${process.pid}`);

    let registry: TestRegistry = {
      activeTaskId: null,
      ownerInstanceId: null,
      updatedAt: new Date().toISOString(),
      activeByInstance: {},
    };

    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-a-${process.pid}`, workflowA);
    registry = updateActiveWorkflowRegistryForInstance(registry, `instance-b-${process.pid}`, workflowB);

    expect(registry.activeByInstance?.[`instance-a-${process.pid}`]?.activeTaskId).toBe("task-a");
    expect(registry.activeByInstance?.[`instance-b-${process.pid}`]?.activeTaskId).toBe("task-b");
  });
});
