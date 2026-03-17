/**
 * path: tests/unit/lib/autoresearch-e2e.test.ts
 * role: autoresearch e2e のスコア比較と結果判定を検証する
 * why: commit/reset の keep/drop 判断が退行しないようにするため
 * related: .pi/lib/autoresearch-e2e.ts, scripts/autoresearch-e2e.ts, tests/e2e/README.md, .pi/skills/autoresearch-e2e/SKILL.md
 */

import { describe, expect, it } from "vitest";

import {
  compareAutoresearchScores,
  determineAutoresearchOutcome,
  formatAutoresearchScore,
  parseVitestJsonReport,
} from "../../../.pi/lib/autoresearch-e2e.js";

describe("autoresearch-e2e", () => {
  it("failed 数が減った候補を improved と判定する", () => {
    const outcome = determineAutoresearchOutcome(
      { failed: 1, passed: 12, total: 13, durationMs: 1000 },
      { failed: 2, passed: 12, total: 14, durationMs: 900 },
    );

    expect(outcome).toBe("improved");
  });

  it("failed が同じなら passed 数を優先する", () => {
    const result = compareAutoresearchScores(
      { failed: 1, passed: 10, total: 12, durationMs: 1500 },
      { failed: 1, passed: 9, total: 12, durationMs: 500 },
    );

    expect(result).toBe(1);
  });

  it("完全同点なら equal と判定する", () => {
    const outcome = determineAutoresearchOutcome(
      { failed: 0, passed: 14, total: 14, durationMs: 1200 },
      { failed: 0, passed: 14, total: 14, durationMs: 1200 },
    );

    expect(outcome).toBe("equal");
  });

  it("vitest json を score に正規化する", () => {
    const parsed = parseVitestJsonReport(JSON.stringify({
      numFailedTests: 1,
      numPassedTests: 5,
      numTotalTests: 6,
      testResults: [
        {
          assertionResults: [
            { status: "passed", duration: 100 },
            { status: "failed", duration: 200 },
          ],
        },
      ],
    }));

    expect(parsed).not.toBeNull();
    expect(parsed!.score).toEqual({
      failed: 1,
      passed: 5,
      total: 6,
      durationMs: 300,
    });
    expect(formatAutoresearchScore(parsed!.score)).toContain("failed=1");
  });

  it("不正なJSON入力に対してnullを返す", () => {
    // 切り詰められたJSON
    const truncatedJson = '{"numFailedTests": 1, "numPasse';
    const result = parseVitestJsonReport(truncatedJson);
    expect(result).toBeNull();
  });

  it("空文字列入力に対してnullを返す", () => {
    const result = parseVitestJsonReport("");
    expect(result).toBeNull();
  });

  it("JSONとして有効だがオブジェクトでない入力に対して正常動作する", () => {
    // 配列やプリミティブ値など
    const result = parseVitestJsonReport("[]");
    // エラーにはならず、デフォルト値で処理される
    expect(result).not.toBeNull();
    expect(result!.score.failed).toBe(0);
    expect(result!.score.passed).toBe(0);
  });
});
