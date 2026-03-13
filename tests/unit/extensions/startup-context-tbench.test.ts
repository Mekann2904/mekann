// path: tests/unit/extensions/startup-context-tbench.test.ts
// role: terminal-bench mode で startup-context が軽量化されることを検証する
// why: benchmark 中に重い startup probe が走る回帰を防ぐため
// related: .pi/extensions/startup-context.ts, .pi/lib/tbench-mode.ts, tests/unit/extensions/startup-context-throttle.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const collectSessionStartContext = vi.fn();
const collectUserPromptDelta = vi.fn();
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
  formatSessionStartAsShell: vi.fn(() => "baseline"),
  formatDeltaAsShell: vi.fn(() => "delta"),
}));

vi.mock("../../../.pi/lib/tool-telemetry-store.js", () => ({
  resetToolTelemetryStore,
}));

describe("startup-context terminal-bench mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PI_TBENCH_MODE = "1";
  });

  afterEach(() => {
    delete process.env.PI_TBENCH_MODE;
    vi.restoreAllMocks();
  });

  it("初回ターンだけ軽量コンテキストを注入し、重い collector を呼ばない", async () => {
    const handlers = new Map<string, Function>();
    const pi = {
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
      getAllTools: vi.fn(() => [{ name: "read" }, { name: "bash" }]),
    };

    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo");
    const module = await import("../../../.pi/extensions/startup-context.js");
    module.default(pi as never);

    await handlers.get("session_start")?.({}, {});
    const first = await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});
    const second = await handlers.get("before_agent_start")?.({ systemPrompt: "base" }, {});

    expect(first?.systemPrompt).toContain("Terminal Bench Mode");
    expect(first?.systemPrompt).toContain("cwd=/repo");
    expect(collectSessionStartContext).not.toHaveBeenCalled();
    expect(collectUserPromptDelta).not.toHaveBeenCalled();
    expect(second).toBeUndefined();

    cwdSpy.mockRestore();
  });
});
