/**
 * path: tests/unit/lib/workspace-verification.test.ts
 * role: workspace-verification ライブラリの状態管理とコマンド解析を検証する
 * why: dirty 判定と自動実行条件の退行を防ぐため
 * related: .pi/lib/workspace-verification.ts, .pi/lib/storage/state-keys.ts, tests/unit/extensions/workspace-verification.test.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  files: new Map<string, string>(),
  dirs: new Set<string>(),
}));

vi.mock("../../../.pi/lib/storage/sqlite-state-store.js", () => ({
  readJsonState: vi.fn(({ stateKey, createDefault }) => {
    if (!mockState.storage.has(stateKey)) {
      mockState.storage.set(stateKey, createDefault());
    }
    return mockState.storage.get(stateKey);
  }),
  writeJsonState: vi.fn(({ stateKey, value }) => {
    mockState.storage.set(stateKey, value);
  }),
}));

vi.mock("../../../.pi/lib/storage/storage-lock.js", () => ({
  withFileLock: vi.fn((_target: string, fn: () => unknown) => fn()),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => mockState.files.has(path) || mockState.dirs.has(path)),
  mkdirSync: vi.fn((path: string) => {
    mockState.dirs.add(path);
  }),
  readFileSync: vi.fn((path: string) => mockState.files.get(path) ?? ""),
  readdirSync: vi.fn((path: string) => {
    const prefix = `${path}/`;
    const names = new Set<string>();
    for (const file of mockState.files.keys()) {
      if (file.startsWith(prefix)) {
        names.add(file.slice(prefix.length).split("/")[0] ?? "");
      }
    }
    return [...names];
  }),
  statSync: vi.fn(() => ({
    mtimeMs: Date.now(),
    isDirectory: () => true,
  })),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockState.files.set(path, content);
  }),
}));

describe("workspace-verification library", () => {
  beforeEach(() => {
    mockState.storage.clear();
    mockState.files.clear();
    mockState.dirs.clear();
    vi.restoreAllMocks();
  });

  it("parses quoted commands", async () => {
    const { parseWorkspaceCommand } = await import("../../../.pi/lib/workspace-verification.js");
    const parsed = parseWorkspaceCommand('npm run test -- --grep "api smoke"');

    expect(parsed.executable).toBe("npm");
    expect(parsed.args).toEqual(["run", "test", "--", "--grep", "api smoke"]);
  });

  it("rejects shell operators", async () => {
    const { parseWorkspaceCommand } = await import("../../../.pi/lib/workspace-verification.js");
    const parsed = parseWorkspaceCommand("npm test && npm run lint");

    expect(parsed.error).toContain("shell operators");
  });

  it("marks workspace dirty and clears it after successful verification", async () => {
    const {
      markWorkspaceDirty,
      loadWorkspaceVerificationState,
      finalizeVerificationRun,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const dirtyState = markWorkspaceDirty({ cwd: "/repo", toolName: "edit" });
    expect(dirtyState.dirty).toBe(true);
    expect(dirtyState.lastWriteTool).toBe("edit");

    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        trigger: "manual",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt: "2026-03-07T00:00:10.000Z",
        success: true,
        stepResults: [],
      },
    });

    const finalState = loadWorkspaceVerificationState("/repo");
    expect(finalState.dirty).toBe(false);
    expect(finalState.lastVerifiedAt).toBe("2026-03-07T00:00:10.000Z");
  });

  it("auto-runs only when the last write is newer than the last run", async () => {
    const {
      createWorkspaceVerificationConfig,
      shouldAutoRunVerification,
      markWorkspaceDirty,
      finalizeVerificationRun,
      loadWorkspaceVerificationState,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const config = createWorkspaceVerificationConfig();
    markWorkspaceDirty({ cwd: "/repo", toolName: "write" });

    let state = loadWorkspaceVerificationState("/repo");
    expect(shouldAutoRunVerification(config, state)).toBe(true);

    const writeTimestamp = Date.parse(state.lastWriteAt ?? "");
    const finishedAt = Number.isFinite(writeTimestamp)
      ? new Date(writeTimestamp + 5_000).toISOString()
      : new Date().toISOString();

    finalizeVerificationRun({
      cwd: "/repo",
      run: {
        trigger: "auto",
        startedAt: "2026-03-07T00:00:00.000Z",
        finishedAt,
        success: false,
        stepResults: [],
      },
    });

    state = loadWorkspaceVerificationState("/repo");
    expect(shouldAutoRunVerification(config, state)).toBe(false);
  });

  it("extracts a web-app runbook from package.json and plans", async () => {
    mockState.files.set("/repo/package.json", JSON.stringify({
      scripts: {
        lint: "eslint .",
        typecheck: "tsc --noEmit",
        test: "vitest run",
        build: "vite build",
        dev: "vite --port 4173",
      },
      devDependencies: {
        vite: "^6.0.0",
        react: "^19.0.0",
      },
    }));
    mockState.files.set("/repo/AGENTS.md", "# AGENTS.md\n");
    mockState.files.set("/repo/plans/feature.md", [
      "# Acceptance Criteria",
      "- UI が壊れていないこと",
      "# Test & Verification",
      "- `npm run lint`",
      "- `npm run typecheck`",
      "- `npm test`",
      "- `npm run dev`",
      "- http://127.0.0.1:4173",
    ].join("\n"));

    const {
      buildWorkspaceVerificationRunbook,
      resolveWorkspaceVerificationPlan,
      createWorkspaceVerificationConfig,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const runbook = buildWorkspaceVerificationRunbook("/repo");
    expect(runbook.profile).toBe("web-app");
    expect(runbook.runtime.enabled).toBe(true);
    expect(runbook.runtime.readyPort).toBe(4173);
    expect(runbook.ui.enabled).toBe(true);

    const resolved = resolveWorkspaceVerificationPlan(createWorkspaceVerificationConfig(), "/repo");
    expect(Boolean(resolved.commands.build)).toBe(true);
    expect(resolved.sources.length).toBeGreaterThan(0);
  });

  it("persists verification artifacts", async () => {
    const {
      persistWorkspaceVerificationArtifacts,
      createWorkspaceVerificationConfig,
    } = await import("../../../.pi/lib/workspace-verification.js");

    const run = persistWorkspaceVerificationArtifacts("/repo", createWorkspaceVerificationConfig(), {
      trigger: "manual",
      startedAt: "2026-03-07T00:00:00.000Z",
      finishedAt: "2026-03-07T00:00:10.000Z",
      success: true,
      resolvedPlan: {
        profile: "library",
        commands: {},
        runtime: {
          enabled: false,
          command: "",
          label: "workspace-dev-server",
          startupTimeoutMs: 1000,
          keepAliveOnShutdown: true,
        },
        ui: {
          enabled: false,
          timeoutMs: 1000,
          commands: [],
        },
        acceptanceCriteria: [],
        validationCommands: [],
        sources: [],
      },
      stepResults: [{
        step: "test",
        success: true,
        skipped: false,
        durationMs: 10,
        command: "npm test",
        stdout: "ok",
        stderr: "",
      }],
    });

    expect(run.artifactDir).toContain(".pi/verification-runs");
    expect([...mockState.files.keys()].some((path) => path.endsWith("summary.json"))).toBe(true);
    expect(run.stepResults[0]?.artifactPath).toContain(".log");
  });
});
