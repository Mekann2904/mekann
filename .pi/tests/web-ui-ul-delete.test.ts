/**
 * path: .pi/tests/web-ui-ul-delete.test.ts
 * role: Web UI の UL タスク削除ロジックを検証するテスト
 * why: ul-* タスクが通常 task API ではなく UL API に流れることを保証するため
 * related: .pi/extensions/web-ui/src/routes/ul-workflow.ts, .pi/extensions/web-ui/web/src/hooks/useTaskDataNew.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { deleteUlWorkflowTaskFiles } from "../extensions/web-ui/src/routes/ul-workflow.js";
import { buildDeleteTaskEndpoint } from "../extensions/web-ui/web/src/hooks/useTaskDataNew.js";

describe("web-ui UL delete", () => {
  let testDir = "";

  beforeEach(async () => {
    testDir = await fsPromises.mkdtemp(path.join(tmpdir(), "web-ui-ul-delete-"));
  });

  afterEach(async () => {
    await fsPromises.rm(testDir, { recursive: true, force: true });
  });

  it("routes ul task deletion to ul-workflow endpoint", () => {
    expect(buildDeleteTaskEndpoint("ul-abc123")).toBe("/api/v2/ul-workflow/tasks/ul-abc123");
    expect(buildDeleteTaskEndpoint("task-123")).toBe("/api/v2/tasks/task-123");
  });

  it("deletes UL task directory and clears matching active entry", async () => {
    const workflowDir = path.join(testDir, ".pi", "ul-workflow");
    const taskDir = path.join(workflowDir, "tasks", "task-1");
    await fsPromises.mkdir(taskDir, { recursive: true });
    await fsPromises.writeFile(
      path.join(taskDir, "status.json"),
      JSON.stringify({
        taskId: "task-1",
        taskDescription: "test",
        phase: "annotate",
        ownerInstanceId: "instance-a-123",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      "utf-8",
    );
    await fsPromises.writeFile(
      path.join(workflowDir, "active.json"),
      JSON.stringify({
        activeTaskId: "task-1",
        ownerInstanceId: "instance-a-123",
        updatedAt: new Date().toISOString(),
        activeByInstance: {
          "instance-a-123": {
            activeTaskId: "task-1",
            ownerInstanceId: "instance-a-123",
            updatedAt: new Date().toISOString(),
          },
          "instance-b-456": {
            activeTaskId: "task-2",
            ownerInstanceId: "instance-b-456",
            updatedAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      }),
      "utf-8",
    );

    const deleted = deleteUlWorkflowTaskFiles(testDir, "ul-task-1");

    expect(deleted).toBe(true);
    expect(fs.existsSync(taskDir)).toBe(false);

    const registry = JSON.parse(
      fs.readFileSync(path.join(workflowDir, "active.json"), "utf-8"),
    ) as {
      activeTaskId: string | null;
      activeByInstance?: Record<string, { activeTaskId: string | null }>;
    };

    expect(registry.activeByInstance?.["instance-a-123"]).toBeUndefined();
    expect(registry.activeTaskId).toBe("task-2");
  });
});
