// Path: tests/unit/extensions/plan-loop-focus.test.ts
// What: plan の current focus ブロック生成を検証する単体テスト。
// Why: 毎ターンの deterministic stack に current focus を積む挙動を固定するため。
// Related: .pi/extensions/plan.ts, AGENTS.md, tests/unit/extensions/plan.test.ts

import { describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
}));

vi.mock("@mariozechner/pi-ai", () => ({
  Type: {
    String: () => ({ type: "string" }),
    Boolean: () => ({ type: "boolean" }),
    Optional: (type: unknown) => type,
    Object: (fields: unknown) => ({ type: "object", fields }),
    Array: (type: unknown) => ({ type: "array", itemType: type }),
  },
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  ExtensionAPI: vi.fn(),
}));

vi.mock("@mariozechner/pi-agent-core", () => ({
  AgentMessage: {},
}));

vi.mock("../../../.pi/lib/comprehensive-logger", () => ({
  getLogger: vi.fn(() => ({
    startOperation: vi.fn(() => "op-1"),
    endOperation: vi.fn(),
  })),
}));

vi.mock("../../../.pi/lib/plan-mode-shared", () => ({
  PLAN_MODE_POLICY: "PLAN MODE POLICY TEXT",
  isBashCommandAllowed: vi.fn(() => true),
  validatePlanModeState: vi.fn(() => true),
  createPlanModeState: vi.fn((enabled: boolean) => ({ enabled, checksum: "abc123" })),
  PLAN_MODE_CONTEXT_TYPE: "plan-mode-context",
  PLAN_MODE_STATUS_KEY: "PLAN_MODE",
  PLAN_MODE_ENV_VAR: "PI_PLAN_MODE_ENABLED",
}));

describe("buildPlanLoopFocusBlock", () => {
  it("current focus と one thing per loop を含む", async () => {
    const { buildPlanLoopFocusBlock } = await import("../../../.pi/extensions/plan.js");

    const text = buildPlanLoopFocusBlock({
      planId: "plan-1",
      planName: "Autonomous hardening",
      currentStepTitle: "Implement runtime gate",
      currentStepId: "step-2",
      nextStepTitle: "Run focused verification",
      nextStepId: "step-3",
      recentProgress: ["2026-03-08 planner: Initial plan created"],
    });

    expect(text).toContain("Current Plan Focus");
    expect(text).toContain("Implement runtime gate");
    expect(text).toContain("One thing per loop");
    expect(text).toContain("Verify the touched unit before widening the scope");
  });
});
