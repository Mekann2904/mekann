/**
 * path: tests/unit/lib/ul-workflow/workflow-regression.test.ts
 * role: UL workflow の保存・承認導線の回帰を検証する
 * why: lock 前 mkdir、execute_plan 導線、完了後の成果物保持を壊さないため
 * related: .pi/lib/ul-workflow/adapters/storage/file-workflow-repo.ts, .pi/lib/ul-workflow/application/workflow-service.ts, .pi/lib/ul-workflow/adapters/tools/approve-tool.ts
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileWorkflowRepository } from "../../../../.pi/lib/ul-workflow/adapters/storage/file-workflow-repo.js";
import { createApproveTool } from "../../../../.pi/lib/ul-workflow/adapters/tools/approve-tool.js";
import { WorkflowService } from "../../../../.pi/lib/ul-workflow/application/workflow-service.js";
import { getInstanceId, resetInstanceIdCache } from "../../../../.pi/lib/ul-workflow/domain/ownership.js";
import type { WorkflowState } from "../../../../.pi/lib/ul-workflow/domain/workflow-state.js";

describe("ul workflow regression guards", () => {
  beforeEach(() => {
    process.env.PI_SESSION_ID = "workflow-regression-test";
    resetInstanceIdCache();
  });

  afterEach(() => {
    rmSync(join(".pi", "ul-workflow", "tasks", "task-save-sync"), { recursive: true, force: true });
    resetInstanceIdCache();
  });

  it("FileWorkflowRepository.saveSync は task dir がなくても保存できる", () => {
    const repository = new FileWorkflowRepository();
    const ownerInstanceId = getInstanceId();
    const statusPath = join(".pi", "ul-workflow", "tasks", "task-save-sync", "status.json");
    const state: WorkflowState = {
      taskId: "task-save-sync",
      taskDescription: "saveSync regression test",
      phase: "research",
      phases: ["research", "plan", "annotate", "implement", "review", "completed"],
      phaseIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedPhases: [],
      annotationCount: 0,
      ownerInstanceId,
    };

    expect(() => repository.saveSync(state)).not.toThrow();
    expect(existsSync(statusPath)).toBe(true);
  });

  it("WorkflowService.approve は implement への次アクションで execute_plan を返す", async () => {
    const ownerInstanceId = getInstanceId();
    const state: WorkflowState = {
      taskId: "task-approve",
      taskDescription: "approve regression test",
      phase: "annotate",
      phases: ["research", "plan", "annotate", "implement", "review", "completed"],
      phaseIndex: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedPhases: ["research", "plan"],
      annotationCount: 0,
      ownerInstanceId,
    };

    const repository = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => state),
      getCurrent: vi.fn(async () => state),
      setCurrent: vi.fn(async () => {}),
      createTaskFile: vi.fn(async () => {}),
      readPlanFile: vi.fn(async () => ""),
      delete: vi.fn(async () => {}),
    };

    const service = new WorkflowService({ repository });
    const result = await service.approve();

    expect(result.success).toBe(true);
    expect(result.nextPhase).toBe("implement");
    expect(result.nextAction).toBe("ul_workflow_execute_plan()");
  });

  it("WorkflowService.approve は completed でも task 削除を呼ばない", async () => {
    const ownerInstanceId = getInstanceId();
    const state: WorkflowState = {
      taskId: "task-complete",
      taskDescription: "complete regression test",
      phase: "review",
      phases: ["research", "plan", "annotate", "implement", "review", "completed"],
      phaseIndex: 4,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvedPhases: ["research", "plan", "annotate", "implement"],
      annotationCount: 0,
      ownerInstanceId,
    };

    const repository = {
      save: vi.fn(async () => {}),
      load: vi.fn(async () => state),
      getCurrent: vi.fn(async () => state),
      setCurrent: vi.fn(async () => {}),
      createTaskFile: vi.fn(async () => {}),
      readPlanFile: vi.fn(async () => ""),
      delete: vi.fn(async () => {}),
    };

    const service = new WorkflowService({ repository });
    const result = await service.approve();

    expect(result.success).toBe(true);
    expect(result.nextPhase).toBe("completed");
    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.setCurrent).toHaveBeenCalledWith(null);
  });

  it("approve tool は古い ul_workflow_implement を案内しない", async () => {
    const tool = createApproveTool({
      approve: vi.fn(async () => ({
        success: true,
        previousPhase: "annotate",
        nextPhase: "implement",
      })),
      getStatus: vi.fn(async () => ({
        taskId: "task-tool",
        taskDescription: "tool regression test",
      })),
    } as unknown as WorkflowService);

    const result = await tool.execute("approve", {}, undefined, undefined, {});
    const text = String(result.content[0]?.text ?? "");

    expect(text).toContain("ul_workflow_execute_plan()");
    expect(text).not.toContain("ul_workflow_implement");
  });
});
