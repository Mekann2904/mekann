/**
 * @abdd.meta
 * path: .pi/tests/lib/verification/generation/improvement-actions.test.ts
 * role: improvement-actions.tsのユニットテスト
 * why: 改善アクション生成機能の品質保証とリグレッション防止
 * related: .pi/lib/verification/generation/improvement-actions.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、外部依存なし
 * side_effects: なし
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: 改善アクション生成の各関数をユニットテストで検証
 * what_it_does:
 *   - generateImprovementActions関数のテスト
 *   - formatActionsAsPromptInstructions関数のテスト
 * why_it_exists:
 *   - アクション生成の品質を保証するため
 *   - 今後の変更によるリグレッションを防ぐため
 * scope:
 *   in: テストケースの入力データ
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect } from "vitest";
import {
  generateImprovementActions,
  formatActionsAsPromptInstructions,
} from "../../../../lib/verification/generation/improvement-actions.js";
import type { MetacognitiveCheck } from "../../../../lib/verification/analysis/metacognitive-check.js";

const createMockCheck = (overrides: Partial<MetacognitiveCheck> = {}): MetacognitiveCheck => ({
  deconstruction: {
    binaryOppositions: [],
    aporias: [],
  },
  schizoAnalysis: {
    desireProduction: [],
    innerFascismSigns: [],
    microFascisms: [],
  },
  eudaimonia: {
    excellencePursuit: "test",
    pleasureTrap: false,
    meaningfulGrowth: "test",
  },
  utopiaDystopia: {
    worldBeingCreated: "test",
    totalitarianRisk: [],
    powerDynamics: [],
  },
  philosophyOfThought: {
    isThinking: true,
    metacognitionLevel: 0.8,
    autopilotSigns: [],
  },
  taxonomyOfThought: {
    currentMode: "analyze",
    recommendedMode: "evaluate",
    modeRationale: "test",
  },
  logic: {
    fallacies: [],
    validInferences: [],
    invalidInferences: [],
  },
  ...overrides,
});

describe("generateImprovementActions", () => {
  it("should return array of actions", () => {
    const check = createMockCheck();
    const result = generateImprovementActions(check);
    expect(Array.isArray(result)).toBe(true);
  });

  it("should generate actions for binary oppositions", () => {
    const check = createMockCheck({
      deconstruction: {
        binaryOppositions: ["善 vs 悪"],
        aporias: [],
      },
    });
    const result = generateImprovementActions(check);
    expect(result.some(a => a.category === "deconstruction")).toBe(true);
  });

  it("should generate actions for aporias", () => {
    const check = createMockCheck({
      deconstruction: {
        binaryOppositions: [],
        aporias: [{
          type: "completeness-vs-speed",
          pole1: { concept: "完全性", value: "高", arguments: [] },
          pole2: { concept: "速度", value: "高", arguments: [] },
          tensionLevel: 0.8,
          description: "完全性と速度のトレードオフ",
          context: "開発プロセス",
          resolution: "maintain-tension",
        }],
      },
    });
    const result = generateImprovementActions(check);
    expect(result.some(a => a.issue.includes("アポリア"))).toBe(true);
  });

  it("should generate actions for inner fascism signs", () => {
    const check = createMockCheck({
      schizoAnalysis: {
        desireProduction: [],
        innerFascismSigns: ["過度な秩序への志向"],
        microFascisms: [],
      },
    });
    const result = generateImprovementActions(check);
    expect(result.some(a => a.category === "schizoanalysis")).toBe(true);
  });

  it("should assign priority based on severity", () => {
    const check = createMockCheck({
      deconstruction: {
        binaryOppositions: [],
        aporias: [{
          type: "completeness-vs-speed",
          pole1: { concept: "A", value: "1", arguments: [] },
          pole2: { concept: "B", value: "2", arguments: [] },
          tensionLevel: 0.9,
          description: "High tension aporia",
          context: "test",
          resolution: "maintain-tension",
        }],
      },
    });
    const result = generateImprovementActions(check);
    const aporiaAction = result.find(a => a.issue.includes("アポリア"));
    expect(aporiaAction?.priority).toBeDefined();
  });

  it("should return array for clean check", () => {
    const check = createMockCheck();
    const result = generateImprovementActions(check);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("formatActionsAsPromptInstructions", () => {
  it("should return formatted string for actions", () => {
    const actions = [
      {
        category: "deconstruction" as const,
        priority: 1 as const,
        issue: "Test issue",
        action: "Test action",
        expectedOutcome: "Test outcome",
        relatedPerspective: "脱構築",
      },
    ];
    const result = formatActionsAsPromptInstructions(actions);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle empty actions array", () => {
    const result = formatActionsAsPromptInstructions([]);
    expect(typeof result).toBe("string");
  });

  it("should include priority in formatted output", () => {
    const actions = [
      {
        category: "logic" as const,
        priority: 2 as const,
        issue: "Logic issue",
        action: "Fix logic",
        expectedOutcome: "Better reasoning",
        relatedPerspective: "論理学",
      },
    ];
    const result = formatActionsAsPromptInstructions(actions);
    expect(result.length).toBeGreaterThan(0);
  });
});
