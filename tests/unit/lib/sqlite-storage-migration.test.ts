/**
 * path: tests/unit/lib/sqlite-storage-migration.test.ts
 * role: SQLite 専用ストレージの共通動作を検証する
 * why: JSON 後方互換を捨てた後も主要ストアが正しく動くことを保証するため
 * related: .pi/lib/storage/sqlite-state-store.ts, .pi/extensions/subagents/storage.ts, .pi/lib/storage/run-index.ts, .pi/lib/storage/pattern-extraction.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SQLite storage", () => {
  let runtimeDir: string;
  let testCwd: string;
  let originalRuntimeDir: string | undefined;
  let originalUseSQLite: string | undefined;

  beforeEach(() => {
    originalRuntimeDir = process.env.PI_RUNTIME_DIR;
    originalUseSQLite = process.env.PI_USE_SQLITE;
    runtimeDir = mkdtempSync(join(tmpdir(), "pi-sqlite-runtime-"));
    testCwd = mkdtempSync(join(tmpdir(), "pi-sqlite-cwd-"));
    process.env.PI_RUNTIME_DIR = runtimeDir;
    process.env.PI_USE_SQLITE = "1";
    vi.resetModules();
  });

  afterEach(async () => {
    const { closeDatabase } = await import("../../../.pi/lib/storage/sqlite-db.js");
    closeDatabase();
    rmSync(runtimeDir, { recursive: true, force: true });
    rmSync(testCwd, { recursive: true, force: true });
    if (originalRuntimeDir === undefined) {
      delete process.env.PI_RUNTIME_DIR;
    } else {
      process.env.PI_RUNTIME_DIR = originalRuntimeDir;
    }
    if (originalUseSQLite === undefined) {
      delete process.env.PI_USE_SQLITE;
    } else {
      process.env.PI_USE_SQLITE = originalUseSQLite;
    }
  });

  it("readJsonState stores defaults in SQLite and reloads updated values", async () => {
    const { readJsonState, writeJsonState } = await import("../../../.pi/lib/storage/sqlite-state-store.js");
    const { closeDatabase } = await import("../../../.pi/lib/storage/sqlite-db.js");

    const initial = readJsonState<{ tasks: Array<{ id: string }> }>({
      stateKey: "task_storage:test",
      createDefault: () => ({ tasks: [] }),
    });

    expect(initial.tasks).toEqual([]);

    writeJsonState({
      stateKey: "task_storage:test",
      value: { tasks: [{ id: "sqlite-task" }] },
    });

    closeDatabase();

    const { readJsonState: readAgain } = await import("../../../.pi/lib/storage/sqlite-state-store.js");
    const reloaded = readAgain<{ tasks: Array<{ id: string }> }>({
      stateKey: "task_storage:test",
      createDefault: () => ({ tasks: [] }),
    });

    expect(reloaded.tasks).toEqual([{ id: "sqlite-task" }]);
  });

  it("subagent storage persists only in SQLite", async () => {
    const { loadStorage, saveStorage } = await import("../../../.pi/extensions/subagents/storage.js");
    const { readJsonState } = await import("../../../.pi/lib/storage/sqlite-state-store.js");
    const { getSubagentStorageStateKey } = await import("../../../.pi/lib/storage/state-keys.js");

    const loaded = loadStorage(testCwd);
    expect(loaded.agents.length).toBeGreaterThan(0);

    const customAgent = {
      id: "sqlite-only-agent",
      name: "SQLite Only Agent",
      description: "persisted in sqlite",
      systemPrompt: "test",
      enabled: "enabled" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveStorage(testCwd, {
      ...loaded,
      agents: [...loaded.agents, customAgent],
      currentAgentId: customAgent.id,
    });

    expect(existsSync(join(testCwd, ".pi", "subagents", "storage.json"))).toBe(false);

    const persisted = readJsonState<{ agents: Array<{ id: string }>; currentAgentId?: string }>({
      stateKey: getSubagentStorageStateKey(testCwd),
      createDefault: () => ({ agents: [] }),
    });

    expect(persisted.agents.some((agent) => agent.id === customAgent.id)).toBe(true);
    expect(persisted.currentAgentId).toBe(customAgent.id);
  });

  it("index settings persist only in SQLite", async () => {
    const {
      loadIndexSettings,
      saveIndexSettings,
      updateIndexEnabled,
    } = await import("../../../.pi/extensions/web-ui/src/services/index-settings-service.js");
    const { readJsonState } = await import("../../../.pi/lib/storage/sqlite-state-store.js");
    const { getIndexSettingsStateKey } = await import("../../../.pi/lib/storage/state-keys.js");

    const migrated = await loadIndexSettings(testCwd);
    expect(migrated).toEqual({
      locagent: true,
      repograph: true,
      semantic: true,
    });

    await saveIndexSettings(testCwd, {
      locagent: true,
      repograph: false,
      semantic: false,
    });

    const updated = await updateIndexEnabled(testCwd, "semantic", true);
    expect(updated).toEqual({
      locagent: true,
      repograph: false,
      semantic: true,
    });

    const persisted = readJsonState({
      stateKey: getIndexSettingsStateKey(testCwd),
      createDefault: () => null,
    });
    expect(persisted).toEqual({
      locagent: true,
      repograph: false,
      semantic: true,
    });
  });

  it("run index and pattern extraction read runs from SQLite-backed subagent storage", async () => {
    const { writeJsonState } = await import("../../../.pi/lib/storage/sqlite-state-store.js");
    const {
      getSubagentStorageStateKey,
      getRunIndexStateKey,
      getPatternStorageStateKey,
    } = await import("../../../.pi/lib/storage/state-keys.js");
    const { buildRunIndex, saveRunIndex, loadRunIndex } = await import("../../../.pi/lib/storage/run-index.js");
    const { extractAllPatterns, loadPatternStorage } = await import("../../../.pi/lib/storage/pattern-extraction.js");

    writeJsonState({
      stateKey: getSubagentStorageStateKey(testCwd),
      value: {
        agents: [],
        runs: [
          {
            runId: "run-1",
            agentId: "researcher",
            task: "Fix authentication bug in src/auth.ts",
            summary: "Successfully fixed auth issue in src/auth.ts",
            status: "completed",
            startedAt: "2026-03-06T00:00:00.000Z",
            finishedAt: "2026-03-06T00:01:00.000Z",
            outputFile: join(testCwd, ".pi", "subagents", "runs", "run-1.json"),
          },
        ],
      },
    });

    const index = buildRunIndex(testCwd);
    expect(index.runs).toHaveLength(1);
    expect(index.runs[0].runId).toBe("run-1");
    expect(index.runs[0].files).toContain("src/auth.ts");

    saveRunIndex(testCwd, index);
    const persistedIndex = loadRunIndex(testCwd);
    expect(persistedIndex?.runs[0].runId).toBe("run-1");
    expect(persistedIndex ? persistedIndex.version : null).not.toBeNull();

    const patterns = extractAllPatterns(testCwd);
    expect(patterns.patterns.length).toBeGreaterThan(0);
    expect(patterns.patterns.some((pattern) => pattern.examples.some((example) => example.runId === "run-1"))).toBe(true);

    const persistedPatterns = loadPatternStorage(testCwd);
    expect(persistedPatterns.patterns.length).toBeGreaterThan(0);

    const { readJsonState } = await import("../../../.pi/lib/storage/sqlite-state-store.js");
    expect(
      readJsonState({
        stateKey: getRunIndexStateKey(testCwd),
        createDefault: () => null,
      })
    ).not.toBeNull();
    expect(
      readJsonState({
        stateKey: getPatternStorageStateKey(testCwd),
        createDefault: () => null,
      })
    ).not.toBeNull();
  });
});
