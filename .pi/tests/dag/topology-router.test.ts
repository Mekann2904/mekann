/**
 * @abdd.meta
 * path: .pi/tests/dag/topology-router.test.ts
 * role: トポロジールーターの単体テスト
 * why: Algorithm 1の正確性と、各種DAG構造に対する適切なトポロジー選択を検証
 * related:
 *   - .pi/lib/dag/topology-router.ts (実装)
 * public_api: なし（テストファイル）
 */

import { describe, it, expect } from "vitest";
import { 
  routeTopology, 
  calculateDAGMetrics, 
  topologicalLayers,
  enrichPlanWithTopology,
  THRESHOLDS 
} from "../../lib/dag/topology-router.js";
import { DAGPlan, DAGTask } from "../../lib/dag/types.js";

function createPlan(tasks: DAGTask[]): DAGPlan {
  return {
    id: "test-plan",
    description: "Test plan",
    tasks,
  };
}

describe("topology-router", () => {
  describe("topologicalLayers", () => {
    it("空のタスクリストは空のレイヤーを返す", () => {
      const result = topologicalLayers([]);
      expect(result).toEqual([]);
    });
    
    it("依存なしのタスクは単一レイヤー", () => {
      const tasks: DAGTask[] = [
        { id: "a", description: "Task A", dependencies: [] },
        { id: "b", description: "Task B", dependencies: [] },
        { id: "c", description: "Task C", dependencies: [] },
      ];
      const layers = topologicalLayers(tasks);
      expect(layers).toHaveLength(1);
      expect(layers[0].map(t => t.id)).toEqual(["a", "b", "c"]);
    });
    
    it("線形依存は複数レイヤー", () => {
      const tasks: DAGTask[] = [
        { id: "a", description: "Task A", dependencies: [] },
        { id: "b", description: "Task B", dependencies: ["a"] },
        { id: "c", description: "Task C", dependencies: ["b"] },
      ];
      const layers = topologicalLayers(tasks);
      expect(layers).toHaveLength(3);
      expect(layers[0][0].id).toBe("a");
      expect(layers[1][0].id).toBe("b");
      expect(layers[2][0].id).toBe("c");
    });
    
    it("ダイヤモンド構造を正しくレイヤリング", () => {
      const tasks: DAGTask[] = [
        { id: "root", description: "Root", dependencies: [] },
        { id: "left", description: "Left", dependencies: ["root"] },
        { id: "right", description: "Right", dependencies: ["root"] },
        { id: "merge", description: "Merge", dependencies: ["left", "right"] },
      ];
      const layers = topologicalLayers(tasks);
      expect(layers).toHaveLength(3);
      expect(layers[0].map(t => t.id)).toContain("root");
      expect(layers[1].map(t => t.id)).toEqual(expect.arrayContaining(["left", "right"]));
      expect(layers[2].map(t => t.id)).toContain("merge");
    });
    
    it("循環依存を検出してエラー", () => {
      const tasks: DAGTask[] = [
        { id: "a", description: "Task A", dependencies: ["b"] },
        { id: "b", description: "Task B", dependencies: ["a"] },
      ];
      expect(() => topologicalLayers(tasks)).toThrow("Circular dependency");
    });
  });
  
  describe("calculateDAGMetrics", () => {
    it("完全並列DAGのメトリクス", () => {
      const plan = createPlan([
        { id: "a", description: "A", dependencies: [], estimatedTokens: 1000 },
        { id: "b", description: "B", dependencies: [], estimatedTokens: 1000 },
        { id: "c", description: "C", dependencies: [], estimatedTokens: 1000 },
      ]);
      const metrics = calculateDAGMetrics(plan);
      
      expect(metrics.parallelismWidth).toBe(3);
      expect(metrics.criticalPathDepth).toBe(1000); // 最大重み
      expect(metrics.couplingDensity).toBe(0);
      expect(metrics.nodeCount).toBe(3);
      expect(metrics.edgeCount).toBe(0);
    });
    
    it("完全順次DAGのメトリクス", () => {
      const plan = createPlan([
        { id: "a", description: "A", dependencies: [], estimatedTokens: 1000 },
        { id: "b", description: "B", dependencies: ["a"], estimatedTokens: 1000 },
        { id: "c", description: "C", dependencies: ["b"], estimatedTokens: 1000 },
      ]);
      const metrics = calculateDAGMetrics(plan);
      
      expect(metrics.parallelismWidth).toBe(1);
      expect(metrics.criticalPathDepth).toBe(3000); // 合計
      expect(metrics.couplingDensity).toBeGreaterThan(0);
      expect(metrics.nodeCount).toBe(3);
      expect(metrics.edgeCount).toBe(2);
    });
    
    it("結合強度が密度に反映される", () => {
      const plan = createPlan([
        { 
          id: "a", 
          description: "A", 
          dependencies: [], 
          coupling: "critical",
          estimatedTokens: 1000 
        },
        { 
          id: "b", 
          description: "B", 
          dependencies: ["a"], 
          coupling: "strong",
          estimatedTokens: 1000 
        },
      ]);
      const metrics = calculateDAGMetrics(plan);
      
      // bのcouplingが使用される
      expect(metrics.couplingDensity).toBe(0.7); // strong
    });
  });
  
  describe("routeTopology", () => {
    it("依存なし → parallel", () => {
      const plan = createPlan([
        { id: "a", description: "A", dependencies: [] },
        { id: "b", description: "B", dependencies: [] },
      ]);
      expect(routeTopology(plan)).toBe("parallel");
    });
    
    it("線形依存 → sequential", () => {
      const plan = createPlan([
        { id: "a", description: "A", dependencies: [] },
        { id: "b", description: "B", dependencies: ["a"] },
        { id: "c", description: "C", dependencies: ["b"] },
      ]);
      expect(routeTopology(plan)).toBe("sequential");
    });
    
    it("高結合かつ大規模 → hierarchical", () => {
      const tasks: DAGTask[] = [];
      for (let i = 0; i < 6; i++) {
        tasks.push({
          id: `task-${i}`,
          description: `Task ${i}`,
          dependencies: i > 0 ? [`task-${i-1}`] : [],
          coupling: "critical",
        });
      }
      const plan = createPlan(tasks);
      expect(routeTopology(plan)).toBe("hierarchical");
    });
    
    it("広い並列性かつ低結合 → parallel", () => {
      const tasks: DAGTask[] = [
        { id: "root", description: "Root", dependencies: [], coupling: "weak" },
        { id: "a", description: "A", dependencies: ["root"], coupling: "none" },
        { id: "b", description: "B", dependencies: ["root"], coupling: "none" },
        { id: "c", description: "C", dependencies: ["root"], coupling: "none" },
      ];
      const plan = createPlan(tasks);
      expect(routeTopology(plan)).toBe("parallel");
    });
    
    it("中間的な構造 → hybrid", () => {
      // ダイヤモンド構造
      const plan = createPlan([
        { id: "root", description: "Root", dependencies: [] },
        { id: "left", description: "Left", dependencies: ["root"] },
        { id: "right", description: "Right", dependencies: ["root"] },
        { id: "merge", description: "Merge", dependencies: ["left", "right"] },
      ]);
      expect(routeTopology(plan)).toBe("hybrid");
    });
    
    it("単一タスク → sequential（デフォルト安全）", () => {
      const plan = createPlan([
        { id: "only", description: "Only", dependencies: [] },
      ]);
      expect(routeTopology(plan)).toBe("sequential");
    });
    
    it("空プラン → sequential（デフォルト安全）", () => {
      const plan = createPlan([]);
      expect(routeTopology(plan)).toBe("sequential");
    });
  });
  
  describe("enrichPlanWithTopology", () => {
    it("トポロジーとメトリクスを付与", () => {
      const plan = createPlan([
        { id: "a", description: "A", dependencies: [] },
        { id: "b", description: "B", dependencies: [] },
      ]);
      
      const enriched = enrichPlanWithTopology(plan);
      
      expect(enriched.topology).toBeDefined();
      expect(enriched.metrics).toBeDefined();
      expect(enriched.metrics?.nodeCount).toBe(2);
    });
    
    it("hybrid時はレイヤー情報も付与", () => {
      const plan = createPlan([
        { id: "root", description: "Root", dependencies: [] },
        { id: "child", description: "Child", dependencies: ["root"] },
      ]);
      
      const enriched = enrichPlanWithTopology(plan);
      
      if (enriched.topology === "hybrid") {
        expect(enriched.layers).toBeDefined();
        expect(enriched.layers!.length).toBeGreaterThan(0);
      }
    });
  });
});
