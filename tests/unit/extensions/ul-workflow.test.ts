/**
 * path: tests/unit/extensions/ul-workflow.test.ts
 * role: UL workflow の phase 遷移と commit 導線の回帰を検証する
 * why: annotate 修正、execute_plan 導線、完了後の成果物保持が壊れないようにするため
 * related: .pi/extensions/ul-workflow.ts, .pi/extensions/ul-dual-mode.ts, tests/unit/extensions/ul-dual-mode.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "node:path";

const verificationMockState = vi.hoisted(() => ({
  config: {
    enabled: true,
    requireProofReview: false,
    requireReplanOnRepeatedFailure: false,
  },
  state: {
    dirty: false,
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
  },
  resolvedPlan: {
    runtime: { enabled: false },
    ui: { enabled: false },
  },
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    String: (value?: unknown) => value,
    Optional: (value: unknown) => value,
    Object: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
    Number: (value?: unknown) => value,
    Array: (value: unknown) => value,
  },
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  ExtensionAPI: vi.fn(),
}));

vi.mock("fs", () => {
  const realPath = require("node:path") as typeof import("node:path");
  const files = new Map<string, string>();
  const dirs = new Set<string>(["/"]);

  function normalize(target: string): string {
    return realPath.resolve("/", target);
  }

  function ensureDir(dirPath: string): void {
    const normalized = normalize(dirPath);
    const segments = normalized.split("/").filter(Boolean);
    let current = "/";
    dirs.add(current);
    for (const segment of segments) {
      current = current === "/" ? `/${segment}` : `${current}/${segment}`;
      dirs.add(current);
    }
  }

  function writeFile(target: string, content: string): void {
    const normalized = normalize(target);
    ensureDir(realPath.dirname(normalized));
    files.set(normalized, content);
  }

  function removeTree(target: string): void {
    const normalized = normalize(target);
    for (const filePath of [...files.keys()]) {
      if (filePath === normalized || filePath.startsWith(`${normalized}/`)) {
        files.delete(filePath);
      }
    }
    for (const dirPath of [...dirs]) {
      if (dirPath === normalized || dirPath.startsWith(`${normalized}/`)) {
        dirs.delete(dirPath);
      }
    }
    dirs.add("/");
  }

  return {
    existsSync: vi.fn((target: string) => {
      const normalized = normalize(target);
      return files.has(normalized) || dirs.has(normalized);
    }),
    mkdirSync: vi.fn((target: string) => {
      ensureDir(target);
    }),
    readFileSync: vi.fn((target: string) => {
      const normalized = normalize(target);
      const content = files.get(normalized);
      if (content === undefined) {
        throw new Error(`ENOENT: ${target}`);
      }
      return content;
    }),
    writeFileSync: vi.fn((target: string, content: string) => {
      writeFile(target, String(content));
    }),
    readdirSync: vi.fn((target: string) => {
      const normalized = normalize(target);
      if (!dirs.has(normalized)) {
        throw new Error(`ENOENT: ${target}`);
      }

      const prefix = normalized === "/" ? "/" : `${normalized}/`;
      const entries = new Set<string>();

      for (const dirPath of dirs) {
        if (!dirPath.startsWith(prefix) || dirPath === normalized) continue;
        const remainder = dirPath.slice(prefix.length);
        if (!remainder) continue;
        entries.add(remainder.split("/")[0]!);
      }

      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        const remainder = filePath.slice(prefix.length);
        if (!remainder) continue;
        entries.add(remainder.split("/")[0]!);
      }

      return [...entries];
    }),
    promises: {
      mkdir: vi.fn(async (target: string) => {
        ensureDir(target);
      }),
      readFile: vi.fn(async (target: string) => {
        const normalized = normalize(target);
        const content = files.get(normalized);
        if (content === undefined) {
          throw new Error(`ENOENT: ${target}`);
        }
        return content;
      }),
      writeFile: vi.fn(async (target: string, content: string) => {
        writeFile(target, String(content));
      }),
      rm: vi.fn(async (target: string) => {
        removeTree(target);
      }),
    },
    __reset: () => {
      files.clear();
      dirs.clear();
      dirs.add("/");
    },
  };
});

vi.mock("../../../.pi/lib/storage/storage-lock.js", () => ({
  withFileLock: (_lockPath: string, fn: () => void) => fn(),
  atomicWriteTextFile: (targetPath: string, content: string) => {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf-8");
  },
}));

vi.mock("../../../.pi/lib/workspace-verification.js", () => ({
  isCompletionBlocked: vi.fn((config, state) => Boolean(
    config.enabled && (state.dirty || state.pendingProofReview || state.pendingReviewArtifact || state.replanRequired)
  )),
  loadWorkspaceVerificationConfig: vi.fn(() => verificationMockState.config),
  loadWorkspaceVerificationState: vi.fn(() => verificationMockState.state),
  resolveWorkspaceVerificationPlan: vi.fn(() => verificationMockState.resolvedPlan),
}));

function createPiMock() {
  const tools = new Map<string, any>();
  const commands = new Map<string, any>();
  const handlers = new Map<string, any>();

  return {
    tools,
    commands,
    handlers,
    registerTool: vi.fn((tool: any) => tools.set(tool.name, tool)),
    registerCommand: vi.fn((name: string, command: any) => commands.set(name, command)),
    on: vi.fn((name: string, handler: any) => handlers.set(name, handler)),
  };
}

function updateWorkflowState(taskId: string, updater: (state: Record<string, any>) => Record<string, any>) {
  const statusPath = path.join(".pi", "ul-workflow", "tasks", taskId, "status.json");
  const current = JSON.parse(fs.readFileSync(statusPath, "utf-8") as string) as Record<string, any>;
  const next = updater(current);
  fs.writeFileSync(statusPath, JSON.stringify(next, null, 2), "utf-8");
}

describe("ul-workflow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (fs as unknown as { __reset: () => void }).__reset();
    process.env.PI_SESSION_ID = "test-session";
    verificationMockState.config = {
      enabled: true,
      requireProofReview: false,
      requireReplanOnRepeatedFailure: false,
    };
    verificationMockState.state = {
      dirty: false,
      pendingProofReview: false,
      pendingReviewArtifact: false,
      replanRequired: false,
    };
    verificationMockState.resolvedPlan = {
      runtime: { enabled: false },
      ui: { enabled: false },
    };
  });

  it("annotate フェーズでも plan 修正を受け付ける", async () => {
    const extension = (await import("../../../.pi/extensions/ul-workflow.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const startTool = pi.tools.get("ul_workflow_start");
    const startResult = await startTool.execute("start", { task: "通知バグを修正する" }, undefined, undefined, {});
    const taskId = startResult.details.taskId;

    fs.writeFileSync(
      path.join(".pi", "ul-workflow", "tasks", taskId, "plan.md"),
      "# Plan\n\n初期案\n",
      "utf-8",
    );
    updateWorkflowState(taskId, (state) => ({
      ...state,
      phase: "annotate",
      phaseIndex: 2,
      approvedPhases: ["research", "plan"],
    }));

    const modifyTool = pi.tools.get("ul_workflow_modify_plan");
    const result = await modifyTool.execute(
      "modify",
      { modifications: "検証手順を追加する" },
      undefined,
      undefined,
      {
        executeTool: vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
          expect(toolName).toBe("subagent_run_dag");
          return { content: [{ type: "text", text: "updated" }] };
        }),
      },
    );

    expect(result.details.phase).toBe("annotate");
    expect(result.details.askUser).toBe(true);
    expect(result.content[0].text).toContain("Plan修正完了");
  });

  it("annotate 承認後の案内は execute_plan を指す", async () => {
    const extension = (await import("../../../.pi/extensions/ul-workflow.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const startTool = pi.tools.get("ul_workflow_start");
    const startResult = await startTool.execute("start", { task: "認証バグを修正する" }, undefined, undefined, {});
    const taskId = startResult.details.taskId;

    fs.writeFileSync(
      path.join(".pi", "ul-workflow", "tasks", taskId, "plan.md"),
      "# Plan\n\n承認待ち\n",
      "utf-8",
    );
    updateWorkflowState(taskId, (state) => ({
      ...state,
      phase: "annotate",
      phaseIndex: 2,
      approvedPhases: ["research", "plan"],
    }));

    const approveTool = pi.tools.get("ul_workflow_approve");
    const result = await approveTool.execute("approve", {}, undefined, undefined, {});

    expect(result.details.nextPhase).toBe("implement");
    expect(result.content[0].text).toContain("ul_workflow_execute_plan()");
    expect(result.content[0].text).not.toContain("ul_workflow_implement");
  });

  it("implement フェーズからでも execute_plan を継続実行できる", async () => {
    const extension = (await import("../../../.pi/extensions/ul-workflow.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const startTool = pi.tools.get("ul_workflow_start");
    const startResult = await startTool.execute("start", { task: "支払いバグを修正する" }, undefined, undefined, {});
    const taskId = startResult.details.taskId;

    fs.writeFileSync(
      path.join(".pi", "ul-workflow", "tasks", taskId, "plan.md"),
      "# Plan\n\n実装する\n",
      "utf-8",
    );
    updateWorkflowState(taskId, (state) => ({
      ...state,
      phase: "implement",
      phaseIndex: 3,
      approvedPhases: ["research", "plan", "annotate"],
    }));

    const executePlanTool = pi.tools.get("ul_workflow_execute_plan");
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      expect(toolName).toBe("subagent_run_dag");
      return { content: [{ type: "text", text: "implemented" }] };
    });
    const result = await executePlanTool.execute("execute", {}, undefined, undefined, { executeTool });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.details.phase).toBe("review");
    expect(result.content[0].text).toContain("workspace_verify()");
  });

  it("implement 完了後も task ディレクトリを保持する", async () => {
    const extension = (await import("../../../.pi/extensions/ul-workflow.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const startTool = pi.tools.get("ul_workflow_start");
    const startResult = await startTool.execute("start", { task: "検索不具合を修正する" }, undefined, undefined, {});
    const taskId = startResult.details.taskId;

    updateWorkflowState(taskId, (state) => ({
      ...state,
      phase: "implement",
      phaseIndex: 3,
      approvedPhases: ["research", "plan", "annotate"],
    }));

    const approveTool = pi.tools.get("ul_workflow_approve");
    const result = await approveTool.execute("approve", {}, undefined, undefined, {});

    expect(result.details.nextPhase).toBe("review");
    expect(fs.existsSync(path.join(".pi", "ul-workflow", "tasks", taskId, "status.json"))).toBe(true);
    expect(fs.existsSync(path.join(".pi", "ul-workflow", "tasks", taskId, "task.md"))).toBe(true);
  });

  it("review フェーズでは verify が通るまで completed に進めない", async () => {
    const extension = (await import("../../../.pi/extensions/ul-workflow.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const startTool = pi.tools.get("ul_workflow_start");
    const startResult = await startTool.execute("start", { task: "公開前チェックを修正する" }, undefined, undefined, {});
    const taskId = startResult.details.taskId;

    updateWorkflowState(taskId, (state) => ({
      ...state,
      phase: "review",
      phaseIndex: 4,
      approvedPhases: ["research", "plan", "annotate", "implement"],
    }));
    verificationMockState.state = {
      dirty: true,
      pendingProofReview: false,
      pendingReviewArtifact: false,
      replanRequired: false,
    };

    const approveTool = pi.tools.get("ul_workflow_approve");
    const result = await approveTool.execute("approve", {}, undefined, undefined, {});

    expect(result.details.error).toBe("verification_not_cleared");
    expect(result.content[0].text).toContain("workspace_verify");
  });

  it("ul_workflow_run は annotate で止まり approvedPhases を重複させない", async () => {
    const extension = (await import("../../../.pi/extensions/ul-workflow.js")).default;
    const pi = createPiMock();
    extension(pi as never);

    const runTool = pi.tools.get("ul_workflow_run");
    const executeTool = vi.fn(async ({ toolName }: { toolName: string; params: Record<string, unknown> }) => {
      expect(toolName).toBe("subagent_run_dag");
      return { content: [{ type: "text", text: `output for ${toolName}` }] };
    });

    const result = await runTool.execute(
      "run",
      { task: "通知バグを修正する", mode: "parallel", maxConcurrency: 5 },
      undefined,
      undefined,
      { executeTool },
    );

    const taskId = result.details.taskId;
    const statusPath = path.join(".pi", "ul-workflow", "tasks", taskId, "status.json");
    const savedState = JSON.parse(fs.readFileSync(statusPath, "utf-8") as string) as {
      phase: string;
      approvedPhases: string[];
    };

    expect(result.details.phase).toBe("annotate");
    expect(result.details.modeInput).toBe("parallel");
    expect(result.details.concurrencyHint).toBe(5);
    expect(savedState.phase).toBe("annotate");
    expect(savedState.approvedPhases).toEqual(["research", "plan"]);
  });
});
