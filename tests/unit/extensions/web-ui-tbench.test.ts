// path: tests/unit/extensions/web-ui-tbench.test.ts
// role: terminal-bench mode で web-ui の自動観測が抑制されることを検証する
// why: benchmark container で sidecar 起動や履歴書き込みが増える回帰を防ぐため
// related: .pi/extensions/web-ui/index.ts, .pi/lib/tbench-mode.ts, tests/unit/extensions/web-ui-benchmark-route.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerSpy = vi.fn();
const unregisterSpy = vi.fn();
const setModelSpy = vi.fn();
const addHistorySpy = vi.fn();
const disposeHistorySpy = vi.fn();
const startApiServerSpy = vi.fn();
const isApiServerRunningSpy = vi.fn(() => true);

vi.mock("../../../.pi/extensions/web-ui/lib/instance-registry.js", () => ({
  InstanceRegistry: class {
    setModel = setModelSpy;
    register = registerSpy;
    unregister = unregisterSpy;
    static getAll() {
      return [];
    }
    static getCount() {
      return 0;
    }
  },
  ServerRegistry: {
    isRunning: vi.fn(() => null),
  },
  ContextHistoryStorage: class {
    getPid() {
      return process.pid;
    }
    add = addHistorySpy;
    dispose = disposeHistorySpy;
  },
}));

vi.mock("../../../.pi/extensions/server.js", () => ({
  startServer: startApiServerSpy,
  isApiServerRunning: isApiServerRunningSpy,
}));

vi.mock("child_process", () => ({
  exec: vi.fn(),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    on: vi.fn(),
  })),
}));

describe("web-ui terminal-bench mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PI_TBENCH_MODE = "1";
  });

  afterEach(() => {
    delete process.env.PI_TBENCH_MODE;
    vi.restoreAllMocks();
  });

  it("session_start で auto-start せず、turn_end でも履歴を書かない", async () => {
    const handlers = new Map<string, Function>();
    const pi = {
      on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
      registerCommand: vi.fn(),
      registerTool: vi.fn(),
    };
    const notify = vi.fn();

    const module = await import("../../../.pi/extensions/web-ui/index.js");
    module.default(pi as never);

    await handlers.get("session_start")?.({}, {
      model: { id: "zai/glm-5" },
      ui: { notify },
    });
    await handlers.get("turn_end")?.({}, {
      getContextUsage: () => ({
        tokens: 100,
        inputTokens: 70,
        outputTokens: 30,
      }),
    });

    expect(registerSpy).not.toHaveBeenCalled();
    expect(addHistorySpy).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(startApiServerSpy).not.toHaveBeenCalled();
  });
});
