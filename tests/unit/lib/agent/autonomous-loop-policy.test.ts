// Path: tests/unit/lib/agent/autonomous-loop-policy.test.ts
// What: 自律ループ規約ビルダーの内容を検証する単体テスト。
// Why: lead / delegated / internal で必要な運用規約が落ちないようにするため。
// Related: .pi/lib/agent/autonomous-loop-policy.ts, .pi/extensions/autonomous-loop-prompt.ts, tests/unit/extensions/autonomous-loop-prompt.test.ts

import { describe, expect, it } from "vitest";

import { buildAutonomousLoopPolicy } from "../../../../.pi/lib/agent/autonomous-loop-policy.js";

describe("autonomous-loop-policy", () => {
  it("lead 規約に loop の中核原則を含む", () => {
    const policy = buildAutonomousLoopPolicy("lead");

    expect(policy).toContain("One thing per loop");
    expect(policy).toContain("変更前に検索する");
    expect(policy).toContain("placeholder 実装で済ませない");
    expect(policy).toContain("live todo");
  });

  it("delegated 規約に委譲向けの責務制約を含む", () => {
    const policy = buildAutonomousLoopPolicy("delegated");

    expect(policy).toContain("delegated subagent");
    expect(policy).toContain("最重要の1インクリメント");
    expect(policy).toContain("他領域の問題を見つけたら");
  });

  it("internal 規約は英語で簡潔な loop 制約を返す", () => {
    const policy = buildAutonomousLoopPolicy("internal");

    expect(policy).toContain("Autonomous Loop Rules");
    expect(policy).toContain("single highest-priority unfinished item");
    expect(policy).toContain("Do not ship placeholders");
  });
});
