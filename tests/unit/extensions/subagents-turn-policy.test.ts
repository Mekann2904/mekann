/**
 * tests/unit/extensions/subagents-turn-policy.test.ts
 * subagents 拡張の turn policy 由来ヘルパーを検証する。
 * 自動委任時の task kind 推定と preferred agent 並び替えを固定するために存在する。
 * 関連ファイル: .pi/extensions/subagents.ts, .pi/lib/agent/turn-context-builder.ts, .pi/extensions/subagents/storage.ts
 */

import { describe, expect, it } from "vitest";

import {
  inferDelegationTaskKind,
  resolveTurnParallelism,
  selectPreferredAgents,
} from "../../../.pi/extensions/subagents.ts";

describe("subagents turn policy helpers", () => {
  it("task と extraContext から planning を推定する", () => {
    expect(
      inferDelegationTaskKind(
        "Migrate authentication flow",
        "Need design and migration strategy first",
      ),
    ).toBe("planning");
  });

  it("task から review を推定する", () => {
    expect(inferDelegationTaskKind("Review security risks and audit the changes")).toBe("review");
  });

  it("preferredSubagentIds の順に enabled agents を返す", () => {
    const agents = selectPreferredAgents(
      {
        agents: [
          {
            id: "implementer",
            name: "Implementer",
            description: "Writes code",
            systemPrompt: "Implement changes",
            enabled: "enabled",
            createdAt: "2026-03-07T00:00:00.000Z",
            updatedAt: "2026-03-07T00:00:00.000Z",
          },
          {
            id: "researcher",
            name: "Researcher",
            description: "Investigates code",
            systemPrompt: "Research changes",
            enabled: "enabled",
            createdAt: "2026-03-07T00:00:00.000Z",
            updatedAt: "2026-03-07T00:00:00.000Z",
          },
          {
            id: "tester",
            name: "Tester",
            description: "Validates work",
            systemPrompt: "Test changes",
            enabled: "disabled",
            createdAt: "2026-03-07T00:00:00.000Z",
            updatedAt: "2026-03-07T00:00:00.000Z",
          },
        ],
        runs: [],
        currentAgentId: "implementer",
        defaultsVersion: 1,
      },
      ["researcher", "tester", "implementer"],
    );

    expect(agents.map((agent) => agent.id)).toEqual(["researcher", "implementer"]);
  });

  it("parallelism は turn policy と runtime 上限の両方で絞る", () => {
    expect(
      resolveTurnParallelism({
        requestedMaxConcurrency: 8,
        runtimeParallelLimit: 6,
        taskCount: 5,
        providerParallelLimit: 4,
        policyParallelLimit: 2,
      }),
    ).toBe(2);
  });
});
