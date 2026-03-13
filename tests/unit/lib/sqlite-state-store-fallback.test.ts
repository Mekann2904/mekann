/**
 * path: tests/unit/lib/sqlite-state-store-fallback.test.ts
 * role: SQLite が使えない時に JSON fallback へ切り替わることを検証する
 * why: better-sqlite3 の ABI 不一致でも mekann の主要フローを止めないため
 * related: .pi/lib/storage/sqlite-state-store.ts, .pi/lib/storage/sqlite-db.ts, scripts/run-pi-local.sh, tests/unit/lib/sqlite-storage-migration.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("sqlite-state-store fallback", () => {
  let testCwd: string;

  beforeEach(() => {
    testCwd = mkdtempSync(join(tmpdir(), "pi-json-fallback-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(testCwd, { recursive: true, force: true });
  });

  it("SQLite unavailable 時は repo ローカル JSON へ保存する", async () => {
    vi.doMock("../../../.pi/lib/storage/sqlite-db.js", async () => {
      const actual = await vi.importActual<typeof import("../../../.pi/lib/storage/sqlite-db.js")>("../../../.pi/lib/storage/sqlite-db.js");
      return {
        ...actual,
        getDatabase: vi.fn(() => {
          throw new Error("[sqlite-db] SQLite is not available. Reason: ABI mismatch");
        }),
        isSQLiteAvailable: vi.fn(() => false),
        getSQLiteDisableReason: vi.fn(() => "ABI mismatch"),
      };
    });

    const { readJsonState, writeJsonState, listJsonStateKeys } = await import("../../../.pi/lib/storage/sqlite-state-store.js");

    const stateKey = `task_storage:${testCwd}`;
    const initial = readJsonState({
      stateKey,
      createDefault: () => ({ tasks: [] as Array<{ id: string }> }),
    });
    expect(initial.tasks).toEqual([]);

    writeJsonState({
      stateKey,
      value: { tasks: [{ id: "fallback-task" }] },
    });

    const stored = readJsonState({
      stateKey,
      createDefault: () => ({ tasks: [] as Array<{ id: string }> }),
    });
    expect(stored.tasks).toEqual([{ id: "fallback-task" }]);
    expect(listJsonStateKeys(stateKey)).toContain(stateKey);

    const fallbackDir = join(testCwd, ".pi", "state", "json-state");
    expect(existsSync(fallbackDir)).toBe(true);

    const files = readdirSync(fallbackDir);
    expect(files.length).toBeGreaterThan(0);

    const raw = readFileSync(join(fallbackDir, files[0]), "utf-8");
    expect(raw).toContain("fallback-task");
  });
});
