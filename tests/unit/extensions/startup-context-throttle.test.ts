/**
 * path: tests/unit/extensions/startup-context-throttle.test.ts
 * role: startup-context の差分収集スロットリングを検証する
 * why: 通常入力ごとに高コストな git 差分収集が走る回帰を防ぐため
 * related: .pi/extensions/startup-context.ts, .pi/lib/startup-context-collectors.ts, .pi/lib/startup-context-types.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const collectSessionStartContext = vi.fn();
const collectUserPromptDelta = vi.fn();
const formatSessionStartAsShell = vi.fn(() => "baseline");
const formatDeltaAsShell = vi.fn(() => "delta");
const applyPromptStack = vi.fn((systemPrompt: string, entries: Array<{ content: string }>) => ({
  systemPrompt: `${systemPrompt}\n${entries.map((entry) => entry.content).join("\n")}`,
  appliedEntries: entries,
}));
const buildTurnExecutionContext = vi.fn(() => ({ kind: "turn" }));
const buildTurnExecutionRuntimeSection = vi.fn(() => "runtime");
const formatTurnExecutionContextBlock = vi.fn(() => "turn-context");
const createRuntimeNotification = vi.fn(() => null);
const formatRuntimeNotificationBlock = vi.fn(() => "runtime-notification");
const startSession = vi.fn();
const resetToolTelemetryStore = vi.fn();
const resetRuntimeEnvironmentCache = vi.fn();

vi.mock("../../../.pi/lib/context-breakdown-utils.js", () => ({
  startSession,
}));

vi.mock("../../../.pi/lib/agent/prompt-stack.js", () => ({
  applyPromptStack,
}));

vi.mock("../../../.pi/lib/agent/runtime-notifications.js", () => ({
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
}));

vi.mock("../../../.pi/lib/agent/turn-context-builder.js", () => ({
  buildTurnExecutionContext,
  buildTurnExecutionRuntimeSection,
  formatTurnExecutionContextBlock,
}));

vi.mock("../../../.pi/lib/runtime-environment-cache.js", () => ({
  getRuntimeEnvironmentCache: () => ({
    reset: resetRuntimeEnvironmentCache,
  }),
}));

vi.mock("../../../.pi/lib/startup-context-collectors.js", () => ({
  collectSessionStartContext,
  collectUserPromptDelta,
  formatSessionStartAsShell,
  formatDeltaAsShell,
}));

vi.mock("../../../.pi/lib/tool-telemetry-store.js", () => ({
  resetToolTelemetryStore,
}));

describe("startup-context delta throttling", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.PI_STARTUP_CONTEXT_DELTA_MIN_INTERVAL_MS;

    collectSessionStartContext.mockReturnValue({
      metadata: { captured_at: "2026-03-13T00:00:00.000Z" },
      user: { cwd: "/repo" },
    });
    collectUserPromptDelta.mockReturnValue({
      metadata: { captured_at: "2026-03-13T00:00:01.000Z" },
      datetime: {},
      git_delta: {
        branch_changed: false,
        commits_since_last: 1,
        dirty_state: { staged: 0, modified: 1, untracked: 0 },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("短時間の連続ターンでは差分収集を再実行しない", async () => {
    const times = [1000, 1000, 2000, 2000, 3000, 3000];
    vi.spyOn(Date, "now").mockImplementation(() => times.shift() ?? 3000);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");

    const handlers = new Map<string, Function>();
    const pi = {
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
      getAllTools: vi.fn(() => []),
    };

    const module = await import("../../../.pi/extensions/startup-context.js");
    module.default(pi as never);

    await handlers.get("session_start")?.({}, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});

    expect(collectSessionStartContext).toHaveBeenCalledTimes(1);
    expect(collectUserPromptDelta).toHaveBeenCalledTimes(1);
  });

  it("cwd が変わった場合は間隔内でも差分収集を再実行する", async () => {
    process.env.PI_STARTUP_CONTEXT_DELTA_MIN_INTERVAL_MS = "60000";
    const times = [1000, 1000, 2000, 2000, 3000, 3000];
    vi.spyOn(Date, "now").mockImplementation(() => times.shift() ?? 3000);

    const cwdSpy = vi.spyOn(process, "cwd");
    cwdSpy.mockReturnValueOnce("/repo");
    cwdSpy.mockReturnValueOnce("/repo-renamed");
    cwdSpy.mockReturnValue("/repo-renamed");

    const handlers = new Map<string, Function>();
    const pi = {
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
      getAllTools: vi.fn(() => []),
    };

    const module = await import("../../../.pi/extensions/startup-context.js");
    module.default(pi as never);

    await handlers.get("session_start")?.({}, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});

    expect(collectUserPromptDelta).toHaveBeenCalledTimes(2);
  });

  it("session_switch(new) の後は fresh session として baseline から再開する", async () => {
    const times = [1000, 1000, 2000, 2000, 3000, 3000];
    vi.spyOn(Date, "now").mockImplementation(() => times.shift() ?? 3000);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");

    const handlers = new Map<string, Function>();
    const pi = {
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
      getAllTools: vi.fn(() => []),
    };

    const module = await import("../../../.pi/extensions/startup-context.js");
    module.default(pi as never);

    await handlers.get("session_start")?.({}, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    await handlers.get("session_switch")?.({ type: "session_switch", reason: "new" }, {});
    await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});

    expect(collectSessionStartContext).toHaveBeenCalledTimes(2);
    expect(collectUserPromptDelta).not.toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledTimes(2);
    expect(resetToolTelemetryStore).toHaveBeenCalledTimes(2);
    expect(resetRuntimeEnvironmentCache).toHaveBeenCalledTimes(2);
  });
});
