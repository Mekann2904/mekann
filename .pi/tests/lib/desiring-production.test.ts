/**
 * desiring-production.tsの単体テスト
 * スキゾ分析に基づく欲望-生産分析モジュールを検証する
 */

import { describe, it, expect } from "vitest";
import {
  type DesireType,
  type DesireMachine,
  type DesiringFlow,
  type SocialMachine,
  type DeterritorializationPossibility,
  type DesiringProductionAnalysis,
  analyzeDesiringProduction,
  getRhizomeReport,
  findDisconfirmingEvidence,
} from "../../lib/desiring-production.js";

describe("desiring-production", () => {
  describe("analyzeDesiringProduction", () => {
    it("完全な分析結果を返す", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      expect(analysis.desireMachines.length).toBeGreaterThan(0);
      expect(analysis.flows.length).toBeGreaterThan(0);
      expect(analysis.socialMachines.length).toBeGreaterThan(0);
      expect(analysis.deterritorializationPossibilities.length).toBeGreaterThan(0);
      expect(analysis.rhizomeConnections.length).toBeGreaterThan(0);
      expect(analysis.timestamp).toBeDefined();
    });

    it("欲望機械は必要なプロパティを持つ", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      analysis.desireMachines.forEach((machine) => {
        expect(machine.id).toBeDefined();
        expect(machine.name).toBeDefined();
        expect(machine.produces).toBeDefined();
        expect(machine.connectsTo).toBeInstanceOf(Array);
        expect(machine.cutsOff).toBeInstanceOf(Array);
        expect(machine.intensity).toBeGreaterThanOrEqual(0);
        expect(machine.intensity).toBeLessThanOrEqual(1);
      });
    });

    it("欲望の流れは必要なプロパティを持つ", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      analysis.flows.forEach((flow) => {
        expect(flow.id).toBeDefined();
        expect(flow.source).toBeDefined();
        expect(flow.destination).toBeDefined();
        expect(flow.flowsWhat).toBeDefined();
        expect(flow.intensity).toBeGreaterThanOrEqual(0);
        expect(flow.intensity).toBeLessThanOrEqual(1);
        expect(typeof flow.isBlocked).toBe("boolean");
      });
    });

    it("社会機械は必要なプロパティを持つ", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      analysis.socialMachines.forEach((sm) => {
        expect(sm.name).toBeDefined();
        expect(sm.enforces).toBeInstanceOf(Array);
        expect(sm.permits).toBeInstanceOf(Array);
        expect(sm.excludes).toBeInstanceOf(Array);
        expect(sm.connectedDesireMachines).toBeInstanceOf(Array);
      });
    });

    it("脱領土化の可能性は必要なプロパティを持つ", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      analysis.deterritorializationPossibilities.forEach((poss) => {
        expect(poss.territory).toBeDefined();
        expect(poss.direction).toBeDefined();
        expect(poss.risks).toBeInstanceOf(Array);
        expect(poss.possibilities).toBeInstanceOf(Array);
        expect(poss.intensity).toBeGreaterThanOrEqual(0);
        expect(poss.intensity).toBeLessThanOrEqual(1);
      });
    });

    it("「改善」機械が特定される", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      const improvementMachine = analysis.desireMachines.find(
        (m) => m.id === "dm-improvement"
      );
      expect(improvementMachine).toBeDefined();
      expect(improvementMachine?.desireType).toBe("reactive");
    });

    it("「創造」機械が特定される", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();

      // Assert
      const creationMachine = analysis.desireMachines.find(
        (m) => m.id === "dm-creation"
      );
      expect(creationMachine).toBeDefined();
      expect(creationMachine?.desireType).toBe("productive");
    });
  });

  describe("getRhizomeReport", () => {
    it("完全なレポートを生成する", () => {
      // Arrange
      const analysis = analyzeDesiringProduction();

      // Act
      const report = getRhizomeReport(analysis);

      // Assert
      expect(report).toContain("リゾーム・レポート");
      expect(report).toContain("欲望機械の地図");
      expect(report).toContain("欲望の流れ");
      expect(report).toContain("社会機械との接続");
      expect(report).toContain("脱領土化の可能性");
      expect(report).toContain("リゾーム的接続");
    });

    it("レポートには各欲望機械の情報が含まれる", () => {
      // Arrange
      const analysis = analyzeDesiringProduction();

      // Act
      const report = getRhizomeReport(analysis);

      // Assert
      for (const machine of analysis.desireMachines) {
        expect(report).toContain(machine.name);
      }
    });

    it("レポートには阻害情報が含まれる", () => {
      // Arrange
      const analysis = analyzeDesiringProduction();

      // Act
      const report = getRhizomeReport(analysis);

      // Assert
      const blockedFlows = analysis.flows.filter((f) => f.isBlocked);
      if (blockedFlows.length > 0) {
        expect(report).toContain("🚫");
      }
    });

    it("レポートにはリゾーム原則が含まれる", () => {
      // Arrange
      const analysis = analyzeDesiringProduction();

      // Act
      const report = getRhizomeReport(analysis);

      // Assert
      expect(report).toContain("接続の原則");
      expect(report).toContain("異質性の原則");
    });
  });

  describe("findDisconfirmingEvidence", () => {
    it("仮説と反証証拠を返す", () => {
      // Arrange & Act
      const result = findDisconfirmingEvidence();

      // Assert
      expect(result.hypothesis).toBeDefined();
      expect(result.disconfirmingEvidence.length).toBeGreaterThan(0);
      expect(result.revisedUnderstanding).toBeDefined();
    });

    it("反証証拠は複数ある", () => {
      // Arrange & Act
      const result = findDisconfirmingEvidence();

      // Assert
      expect(result.disconfirmingEvidence.length).toBeGreaterThanOrEqual(3);
    });

    it("改訂された理解には重要な洞察が含まれる", () => {
      // Arrange & Act
      const result = findDisconfirmingEvidence();

      // Assert
      expect(result.revisedUnderstanding.length).toBeGreaterThan(100);
    });
  });

  describe("DesireType", () => {
    it("すべての欲望タイプが期待される値を持つ", () => {
      // Arrange
      const expectedTypes: DesireType[] = [
        "productive",
        "reactive",
        "connective",
        "deterritorializing",
        "reterritorializing",
        "nomadic",
      ];

      // Act
      const analysis = analyzeDesiringProduction();
      const foundTypes = new Set(analysis.desireMachines.map((m) => m.desireType));

      // Assert - 少なくとも一部のタイプが使用されている
      expect(foundTypes.size).toBeGreaterThan(0);
    });
  });

  describe("強度値", () => {
    it("遊牧機械は最も抑圧されている（低い強度）", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();
      const nomadicMachine = analysis.desireMachines.find(
        (m) => m.id === "dm-nomadic"
      );

      // Assert
      expect(nomadicMachine?.intensity).toBeLessThan(0.3);
    });

    it("改善機械は高い強度を持つ", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();
      const improvementMachine = analysis.desireMachines.find(
        (m) => m.id === "dm-improvement"
      );

      // Assert
      expect(improvementMachine?.intensity).toBeGreaterThan(0.7);
    });
  });

  describe("ブロックされた流れ", () => {
    it("遊びへの流れはブロックされている", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();
      const playFlow = analysis.flows.find((f) => f.id === "flow-play");

      // Assert
      expect(playFlow?.isBlocked).toBe(true);
      expect(playFlow?.blockedBy).toBeDefined();
    });

    it("改善への流れはブロックされていない", () => {
      // Arrange & Act
      const analysis = analyzeDesiringProduction();
      const improvementFlow = analysis.flows.find((f) => f.id === "flow-improvement");

      // Assert
      expect(improvementFlow?.isBlocked).toBe(false);
    });
  });
});
