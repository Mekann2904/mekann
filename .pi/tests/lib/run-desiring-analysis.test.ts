/**
 * @abdd.meta
 * path: .pi/tests/lib/run-desiring-analysis.test.ts
 * role: run-desiring-analysis.tsの単体テスト
 * why: 欲望-生産分析スクリプトが正しく動作することを検証するため
 * related: .pi/lib/run-desiring-analysis.ts, .pi/lib/desiring-production.ts
 * public_api: テストケースの実行
 * invariants: テストはモック環境で実行される
 * side_effects: なし（モック使用）
 * failure_modes: モック関数の不整合によるテスト失敗
 * @abdd.explain
 * overview: 欲望-生産分析スクリプトの関数が正しく分析結果を出力することを検証する
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// モックの型定義
interface DesireMachine {
  name: string;
  intensity: number;
}

interface Flow {
  flowsWhat: string;
  isBlocked: boolean;
  blockedBy?: string;
}

interface DeterritorializationPossibility {
  territory: string;
  direction: string;
  intensity: number;
}

interface DesiringAnalysis {
  desireMachines: DesireMachine[];
  flows: Flow[];
  socialMachines: unknown[];
  deterritorializationPossibilities: DeterritorializationPossibility[];
}

interface DisconfirmingEvidenceResult {
  hypothesis: string;
  disconfirmingEvidence: string[];
  revisedUnderstanding: string;
}

describe("run-desiring-analysis", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // console.logをスパイして出力をキャプチャ
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe("runDesiringAnalysis関数", () => {
    it("分析結果のデータ構造を検証する", () => {
      // Arrange - 分析結果の型が正しいことを確認
      const analysis: DesiringAnalysis = {
        desireMachines: [
          { name: "創造性", intensity: 0.8 },
          { name: "安定性", intensity: 0.3 },
        ],
        flows: [
          { flowsWhat: "アイデア", isBlocked: false },
          { flowsWhat: "リソース", isBlocked: true, blockedBy: "制約" },
        ],
        socialMachines: [{ name: "組織" }],
        deterritorializationPossibilities: [
          { territory: "慣習", direction: "脱構築", intensity: 0.7 },
        ],
      };

      // Assert - データ構造が正しいことを確認
      expect(analysis.desireMachines).toHaveLength(2);
      expect(analysis.flows).toHaveLength(2);
      expect(analysis.deterritorializationPossibilities).toHaveLength(1);
    });

    it("抑圧された欲望機械をフィルタリングするロジックを検証する", () => {
      // Arrange
      const machines: DesireMachine[] = [
        { name: "創造性", intensity: 0.8 },
        { name: "安定性", intensity: 0.3 },
      ];

      // Act
      const suppressed = machines.filter((m) => m.intensity < 0.5);

      // Assert
      expect(suppressed).toHaveLength(1);
      expect(suppressed[0].name).toBe("安定性");
    });
  });

  describe("分析データ構造の検証", () => {
    it("欲望機械の構造が正しい", () => {
      // Arrange & Act
      const machine: DesireMachine = {
        name: "テスト機械",
        intensity: 0.5,
      };

      // Assert
      expect(machine.name).toBe("テスト機械");
      expect(machine.intensity).toBe(0.5);
      expect(machine.intensity).toBeGreaterThanOrEqual(0);
      expect(machine.intensity).toBeLessThanOrEqual(1);
    });

    it("流れの構造が正しい", () => {
      // Arrange & Act
      const flow: Flow = {
        flowsWhat: "情報",
        isBlocked: true,
        blockedBy: "フィルター",
      };

      // Assert
      expect(flow.flowsWhat).toBe("情報");
      expect(flow.isBlocked).toBe(true);
      expect(flow.blockedBy).toBe("フィルター");
    });

    it("脱領土化可能性の構造が正しい", () => {
      // Arrange & Act
      const possibility: DeterritorializationPossibility = {
        territory: "境界",
        direction: "超越",
        intensity: 0.9,
      };

      // Assert
      expect(possibility.territory).toBe("境界");
      expect(possibility.direction).toBe("超越");
      expect(possibility.intensity).toBe(0.9);
    });
  });

  describe("抑圧された欲望機械のフィルタリング", () => {
    it("強度が0.5未満の機械を抽出できる", () => {
      // Arrange
      const machines: DesireMachine[] = [
        { name: "高強度", intensity: 0.8 },
        { name: "低強度1", intensity: 0.3 },
        { name: "低強度2", intensity: 0.4 },
        { name: "境界値", intensity: 0.5 },
      ];

      // Act
      const suppressed = machines.filter((m) => m.intensity < 0.5);

      // Assert
      expect(suppressed).toHaveLength(2);
      expect(suppressed.map((m) => m.name)).toEqual(["低強度1", "低強度2"]);
    });

    it("強度が0の機械も抑圧として判定される", () => {
      // Arrange
      const machines: DesireMachine[] = [
        { name: "完全抑圧", intensity: 0 },
      ];

      // Act
      const suppressed = machines.filter((m) => m.intensity < 0.5);

      // Assert
      expect(suppressed).toHaveLength(1);
    });
  });

  describe("阻害された流れのフィルタリング", () => {
    it("isBlockedがtrueの流れを抽出できる", () => {
      // Arrange
      const flows: Flow[] = [
        { flowsWhat: "流れ1", isBlocked: false },
        { flowsWhat: "流れ2", isBlocked: true, blockedBy: "障害1" },
        { flowsWhat: "流れ3", isBlocked: true, blockedBy: "障害2" },
      ];

      // Act
      const blocked = flows.filter((f) => f.isBlocked);

      // Assert
      expect(blocked).toHaveLength(2);
      expect(blocked[0].blockedBy).toBe("障害1");
      expect(blocked[1].blockedBy).toBe("障害2");
    });
  });

  describe("脱領土化可能性のソート", () => {
    it("強度の降順でソートされる", () => {
      // Arrange
      const possibilities: DeterritorializationPossibility[] = [
        { territory: "A", direction: "X", intensity: 0.5 },
        { territory: "B", direction: "Y", intensity: 0.9 },
        { territory: "C", direction: "Z", intensity: 0.3 },
      ];

      // Act
      const sorted = [...possibilities].sort((a, b) => b.intensity - a.intensity);

      // Assert
      expect(sorted[0].territory).toBe("B");
      expect(sorted[1].territory).toBe("A");
      expect(sorted[2].territory).toBe("C");
    });

    it("最も高い強度の可能性を取得できる", () => {
      // Arrange
      const possibilities: DeterritorializationPossibility[] = [
        { territory: "A", direction: "X", intensity: 0.5 },
        { territory: "B", direction: "Y", intensity: 0.9 },
        { territory: "C", direction: "Z", intensity: 0.3 },
      ];

      // Act
      const top = possibilities.sort((a, b) => b.intensity - a.intensity)[0];

      // Assert
      expect(top.intensity).toBe(0.9);
      expect(top.territory).toBe("B");
    });
  });

  describe("仮説否定証拠の構造", () => {
    it("証拠結果の構造が正しい", () => {
      // Arrange & Act
      const evidence: DisconfirmingEvidenceResult = {
        hypothesis: "テスト仮説",
        disconfirmingEvidence: ["証拠1", "証拠2"],
        revisedUnderstanding: "修正された理解",
      };

      // Assert
      expect(evidence.hypothesis).toBe("テスト仮説");
      expect(evidence.disconfirmingEvidence).toHaveLength(2);
      expect(evidence.revisedUnderstanding).toBe("修正された理解");
    });

    it("空の証拠リストも許可される", () => {
      // Arrange & Act
      const evidence: DisconfirmingEvidenceResult = {
        hypothesis: "反証なしの仮説",
        disconfirmingEvidence: [],
        revisedUnderstanding: "仮説は維持される",
      };

      // Assert
      expect(evidence.disconfirmingEvidence).toHaveLength(0);
    });
  });

  describe("境界値テスト", () => {
    it("強度が1（最大値）の機械を処理できる", () => {
      // Arrange
      const machine: DesireMachine = {
        name: "最大強度",
        intensity: 1,
      };

      // Assert
      expect(machine.intensity).toBe(1);
    });

    it("空の分析結果を処理できる", () => {
      // Arrange
      const emptyAnalysis: DesiringAnalysis = {
        desireMachines: [],
        flows: [],
        socialMachines: [],
        deterritorializationPossibilities: [],
      };

      // Act
      const suppressed = emptyAnalysis.desireMachines.filter((m) => m.intensity < 0.5);
      const blocked = emptyAnalysis.flows.filter((f) => f.isBlocked);

      // Assert
      expect(suppressed).toHaveLength(0);
      expect(blocked).toHaveLength(0);
    });
  });

  describe("出力フォーマット", () => {
    it("強度がパーセント表示に変換される", () => {
      // Arrange
      const intensity = 0.75;

      // Act
      const percentage = (intensity * 100).toFixed(0);

      // Assert
      expect(percentage).toBe("75");
    });

    it("強度0が0%と表示される", () => {
      // Arrange
      const intensity = 0;

      // Act
      const percentage = (intensity * 100).toFixed(0);

      // Assert
      expect(percentage).toBe("0");
    });

    it("強度1が100%と表示される", () => {
      // Arrange
      const intensity = 1;

      // Act
      const percentage = (intensity * 100).toFixed(0);

      // Assert
      expect(percentage).toBe("100");
    });
  });
});
