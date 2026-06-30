/**
 * subagentCostPolicy.test.ts — spawn cost advice のテスト。
 *
 * issue #147: 日本語「簡単/小さい/少し」等の小タスク表現が英語専用 `\b(...)`
 * に抜けてコスト助言が出ない問題をカバーする。
 */
import { describe, expect, it } from "vitest";
import {
  evaluateSpawnCost,
  subagentBudgetHint,
  type SpawnCostPolicyInput,
} from "./subagentCostPolicy.js";
import type { SpawnParams } from "./types.js";

function makeInput(overrides: Partial<SpawnParams> = {}, policy: Partial<SpawnCostPolicyInput> = {}): SpawnCostPolicyInput {
  const params: SpawnParams = {
    task_name: "scout",
    message: "explore the codebase for relevant files",
    roi_category: "parallel_search",
    justification: "independent evidence",
    ...overrides,
  };
  return {
    params,
    sessionSpawnCount: 0,
    openSubagents: 0,
    queuedSubagents: 0,
    ...policy,
  };
}

describe("evaluateSpawnCost", () => {
  it("returns level none for a well-justified high-ROI spawn", () => {
    const advice = evaluateSpawnCost(makeInput());
    expect(advice.level).toBe("none");
    expect(advice.reasons).toEqual([]);
  });

  it("warns when roi_category and justification are missing", () => {
    const advice = evaluateSpawnCost(makeInput({ roi_category: undefined, justification: undefined }));
    expect(advice.level).toBe("warning");
    expect(advice.reasons).toContain("roi_category is missing");
    expect(advice.reasons).toContain("justification is missing");
  });

  // ── English small-task wording (regression guard) ────────────

  it("flags English small-task wording (simple/quick/just)", () => {
    const advice = evaluateSpawnCost(makeInput({ message: "this is a simple quick task, just do it" }));
    expect(advice.reasons).toContain("task wording looks small; direct tools may be cheaper");
  });

  // ── Japanese small-task wording (issue #147) ─────────────────

  it.each([
    ["簡単", "これは簡単な修正です"],
    ["小さい", "小さいタスクなのでお願いします"],
    ["少し", "少し調べるだけ"],
    ["ちょっと", "ちょっと確認したい"],
    ["単純", "単純な作業"],
    ["軽い", "軽いリファクタリング"],
  ])("flags Japanese small-task wording (%s)", (_label, message) => {
    const advice = evaluateSpawnCost(makeInput({ message }));
    expect(advice.reasons).toContain("task wording looks small; direct tools may be cheaper");
  });

  it("does not flag neutral Japanese messages", () => {
    const advice = evaluateSpawnCost(makeInput({ message: "コードベース全体を探索して関連ファイルを洗い出す" }));
    expect(advice.reasons).not.toContain("task wording looks small; direct tools may be cheaper");
  });
});

describe("subagentBudgetHint", () => {
  it("returns undefined below the soft hint threshold", () => {
    expect(subagentBudgetHint(1)).toBeUndefined();
  });

  it("returns a soft hint after a few spawns", () => {
    expect(subagentBudgetHint(3)).toContain("prefer direct tools");
  });

  it("returns a strong hint after many spawns", () => {
    expect(subagentBudgetHint(5)).toContain("confirm the next spawn is genuinely needed");
  });
});
