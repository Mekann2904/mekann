/**
 * path: tests/unit/lib/background-processes.test.ts
 * role: background-processes ライブラリの単体テスト
 * why: detached 起動と状態更新の退行を防ぐため
 * related: .pi/lib/background-processes.ts, .pi/lib/storage/state-keys.ts, tests/unit/extensions/background-process.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  storage: new Map<string, unknown>(),
  spawned: [] as Array<{ command: string; args: string[]; options: Record<string, unknown> }>,
  killBehavior: new Map<number, boolean>(),
  killSignals: [] as Array<{ pid: number; signal: string | number | undefined }>,
  readFiles: new Map<string, string>(),
  nextPid: 4100,
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
    const pid = mockState.nextPid++;
    mockState.spawned.push({ command, args, options });
    return {
      pid,
      unref: vi.fn(),
    };
  }),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => mockState.readFiles.has(path)),
  mkdirSync: vi.fn(),
  openSync: vi.fn(() => 17),
  closeSync: vi.fn(),
  readFileSync: vi.fn((path: string) => mockState.readFiles.get(path) ?? ""),
}));

vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn(async () => undefined),
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
  withFileLock: vi.fn((_targetFile: string, fn: () => unknown) => fn()),
}));

describe("background-processes", () => {
  let killSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockState.storage.clear();
    mockState.spawned.length = 0;
    mockState.killBehavior.clear();
    mockState.killSignals.length = 0;
    mockState.readFiles.clear();
    mockState.nextPid = 4100;
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");
    killSpy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (signal === 0) {
        if (mockState.killBehavior.get(pid) === false) {
          throw new Error("ESRCH");
        }
        return true;
      }

      mockState.killSignals.push({ pid, signal });
      mockState.killBehavior.set(pid, false);
      return true;
    });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    killSpy.mockRestore();
  });

  it("starts a detached process and persists the record", async () => {
    const {
      startBackgroundProcess,
      listBackgroundProcesses,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");

    saveBackgroundProcessConfig("/repo", { enabled: true });

    const result = await startBackgroundProcess({
      command: "npm run dev",
      cwd: "/repo",
      label: "dev-server",
    });

    const record = result.record;
    expect(record.status).toBe("running");
    expect(record.label).toBe("dev-server");
    expect(record.pid).toBe(4100);
    expect(mockState.spawned[0]?.options.detached).toBe(true);

    mockState.killBehavior.set(4100, true);
    const listed = listBackgroundProcesses({ cwd: "/repo", includeExited: false });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(record.id);
  });

  it("blocks dangerous command patterns", async () => {
    const { startBackgroundProcess, saveBackgroundProcessConfig } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true });

    await expect(
      startBackgroundProcess({
        command: "rm -rf /tmp/demo",
        cwd: "/repo",
      }),
    ).rejects.toThrow(/dangerous command pattern/);
  });

  it("marks missing processes as exited during listing", async () => {
    const {
      startBackgroundProcess,
      listBackgroundProcesses,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true });

    const { record } = await startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
    });

    mockState.killBehavior.set(record.pid, false);
    const listed = listBackgroundProcesses({ cwd: "/repo", includeExited: true });
    expect(listed[0]?.status).toBe("exited");
  });

  it("stops a running process with graceful shutdown", async () => {
    const {
      startBackgroundProcess,
      stopBackgroundProcess,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true });

    const { record } = await startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
      keepAliveOnShutdown: false,
    });

    mockState.killBehavior.set(record.pid, true);
    const result = await stopBackgroundProcess({
      id: record.id,
      cwd: "/repo",
    });

    expect(result?.record.status).toBe("stopped");
    expect(mockState.killSignals[0]).toEqual({ pid: record.pid, signal: "SIGTERM" });
  });

  it("normalizes ESRCH during stop as exited", async () => {
    const {
      startBackgroundProcess,
      stopBackgroundProcess,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true });

    const { record } = await startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
      keepAliveOnShutdown: false,
    });

    killSpy
      .mockImplementationOnce((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          return true;
        }
        return true;
      })
      .mockImplementationOnce((_pid: number, signal?: string | number) => {
        if (signal === 0) {
          return true;
        }
        const error = Object.assign(new Error("ESRCH"), { code: "ESRCH" });
        throw error;
      });

    const result = await stopBackgroundProcess({
      id: record.id,
      cwd: "/repo",
    });

    expect(result?.record.status).toBe("exited");
    expect(result?.signal).toBe("none");
  });

  it("reads log tail for tracked process", async () => {
    const {
      startBackgroundProcess,
      readBackgroundProcessLog,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true });

    const { record } = await startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
    });

    mockState.killBehavior.set(record.pid, true);
    mockState.readFiles.set(record.logPath, "line-1\nline-2\nline-3\n");

    const log = readBackgroundProcessLog({
      id: record.id,
      cwd: "/repo",
      maxLines: 2,
    });

    expect(log?.content).toBe("line-2\nline-3");
  });

  it("requires explicit enablement", async () => {
    const { startBackgroundProcess } = await import("../../../.pi/lib/background-processes.js");

    await expect(startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
    })).rejects.toThrow(/disabled/);
  });

  it("waits for ready pattern and marks record ready", async () => {
    const {
      startBackgroundProcess,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true, defaultStartupTimeoutMs: 100 });

    const logPath = "/repo/.pi/test-ready.log";
    mockState.readFiles.set(logPath, "booting...\nserver ready\n");
    const result = await startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
      logFile: ".pi/test-ready.log",
      readyPattern: "server ready",
    });

    expect(result.ready).toBe(true);
    expect(result.record.readinessStatus).toBe("ready");
    expect(result.record.readyPattern).toBe("server ready");
  });

  it("can skip ready wait and keep readiness pending", async () => {
    const {
      startBackgroundProcess,
      saveBackgroundProcessConfig,
    } = await import("../../../.pi/lib/background-processes.js");
    saveBackgroundProcessConfig("/repo", { enabled: true, defaultStartupTimeoutMs: 100 });

    const result = await startBackgroundProcess({
      command: "node server.js",
      cwd: "/repo",
      readyPattern: "server ready",
      waitForReady: false,
    });

    expect(result.ready).toBe(false);
    expect(result.record.status).toBe("running");
    expect(result.record.readinessStatus).toBe("pending");
    expect(result.record.readyPattern).toBe("server ready");
  });
});
