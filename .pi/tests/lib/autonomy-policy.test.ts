// Path: .pi/tests/lib/autonomy-policy.test.ts
// What: 自律実行 policy の判定ロジックを検証するテスト
// Why: permission bundle と gatekeeper の挙動を壊さずに保つため
// Related: .pi/lib/autonomy-policy.ts, tests/unit/extensions/autonomy-policy.test.ts, README.md

import { describe, expect, it } from "vitest";

import {
  applyModeToTools,
  createAutonomyPolicyConfig,
  normalizeAutonomyPolicyConfig,
  resolveAutonomyDecision,
  resolvePermissionKey,
} from "../../lib/autonomy-policy.js";

describe("autonomy policy", () => {
  it("default config は yolo profile を使う", () => {
    const config = createAutonomyPolicyConfig();

    expect(config.profile).toBe("yolo");
    expect(config.permissions.read).toBe("allow");
    expect(config.permissions.command).toBe("allow");
    expect(config.gatekeeper).toBe("off");
  });

  it("yolo profile は全 bundle を allow にする", () => {
    const config = createAutonomyPolicyConfig("yolo");

    expect(Object.values(config.permissions).every((value) => value === "allow")).toBe(true);
  });

  it("subagent_run は subtasks に分類される", () => {
    expect(resolvePermissionKey("subagent_run")).toBe("subtasks");
  });

  it(".env 読み取りは gatekeeper で deny される", () => {
    const config = createAutonomyPolicyConfig("high");
    const decision = resolveAutonomyDecision(config, {
      toolName: "read",
      input: { path: ".env" },
    });

    expect(decision.permissionDecision).toBe("allow");
    expect(decision.finalDecision).toBe("deny");
  });

  it("workspace 外パスは ask になる", () => {
    const config = createAutonomyPolicyConfig("high");
    const decision = resolveAutonomyDecision(
      config,
      {
        toolName: "read",
        input: { path: "../secret.txt" },
      },
      "/repo/app"
    );

    expect(decision.finalDecision).toBe("ask");
  });

  it("destructive bash は deny される", () => {
    const config = normalizeAutonomyPolicyConfig({
      ...createAutonomyPolicyConfig("yolo"),
      gatekeeper: "deterministic",
    });
    const decision = resolveAutonomyDecision(config, {
      toolName: "bash",
      input: { command: "rm -rf /tmp/demo" },
    });

    expect(decision.finalDecision).toBe("deny");
  });

  it("plan mode は command と write を deny する", () => {
    const config = normalizeAutonomyPolicyConfig({
      ...createAutonomyPolicyConfig("high"),
      mode: "plan",
    });
    const decision = resolveAutonomyDecision(config, {
      toolName: "edit",
      input: { path: "a.ts" },
    });

    expect(decision.permissionDecision).toBe("deny");
    expect(decision.finalDecision).toBe("deny");
  });

  it("plan mode の active tools から変更系を外す", () => {
    const tools = applyModeToTools(["read", "bash", "edit", "write", "subagent_run"], "plan");

    expect(tools).toEqual(["read", "subagent_run"]);
  });
});
