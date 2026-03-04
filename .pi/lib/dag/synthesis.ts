/**
 * @abdd.meta
 * path: .pi/lib/dag/synthesis.ts
 * role: 並列エージェント出力の整合性評価と統合
 * why: AdaptOrchのAdaptive Synthesis Protocolを実装し、複数エージェント出力の品質保証を行う
 * related:
 *   - .pi/lib/dag/types.ts (型定義)
 *   - .pi/lib/dag/executors/*.ts (各エグゼキュータから呼び出される)
 * public_api:
 *   - calculateConsistencyScore(TaskOutput[]): Promise<number>
 *   - synthesizeOutputs(TaskOutput[], TopologyType): Promise<SynthesisResult>
 *   - llmMergeOutputs(TaskOutput[]): Promise<TaskOutput>
 * invariants:
 *   - 整合性スコアは0.0〜1.0の範囲
 *   - 単一出力の場合は常にスコア1.0を返す
 * side_effects:
 *   - LLM API呼び出し（merge/arbitrate時）
 * failure_modes:
 *   - 空の出力配列にはErrorを投げる
 *   - LLM失敗時はfallback戦略（最初の出力採用）
 */

import { TaskOutput, TopologyType } from "./types.js";

/**
 * @summary 合成結果
 */
export interface SynthesisResult {
  /** 最終的な統合出力 */
  output: TaskOutput;
  /** 使用された合成戦略 */
  strategy: "last" | "merge" | "arbitrate" | "lead-integrated" | "single" | "fallback";
  /** 整合性スコア（該当する場合） */
  consistencyScore?: number;
  /** 中間情報（デバッグ用） */
  metadata?: Record<string, unknown>;
}

/**
 * @summary 整合性スコア計算の設定
 */
export interface ConsistencyConfig {
  /** 高整合性閾値: これ以上ならmerge、未満ならarbitrate */
  highThreshold: number;
  /** 埋め込みモデル名（将来的な拡張用） */
  embeddingModel?: string;
  /** 類似度計算方法 */
  similarityMethod: "exact" | "substring" | "semantic";
}

/** デフォルト設定 */
const DEFAULT_CONFIG: ConsistencyConfig = {
  highThreshold: 0.7,
  similarityMethod: "substring", // 軽量実装としてsubstringマッチング
};

/**
 * @summary 2つの出力の類似度を計算（軽量版）
 * @description 完全なセマンティック類似度の代わりに、文字列ベースの近似を使用
 * @param a - 比較対象1
 * @param b - 比較対象2
 * @returns 0.0〜1.0の類似度スコア
 */
function calculateSimilarity(a: TaskOutput, b: TaskOutput): number {
  const textA = (a.summary || "").toLowerCase();
  const textB = (b.summary || "").toLowerCase();
  
  if (textA === textB) return 1.0;
  if (textA.length === 0 || textB.length === 0) return 0.0;
  
  // 共通部分文字列の比率（簡易実装）
  const longer = textA.length > textB.length ? textA : textB;
  const shorter = textA.length > textB.length ? textB : textA;
  
  // 短い方が長い方に含まれるか
  if (longer.includes(shorter)) {
    return 0.5 + 0.5 * (shorter.length / longer.length);
  }
  
  // 単語レベルの共通性
  const wordsA = new Set(textA.split(/\s+/));
  const wordsB = new Set(textB.split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}

/**
 * @summary 複数出力の整合性スコアを計算（heuristic）
 * @description AdaptOrch論文のConsistency Scoreを近似実装
 * @param outputs - 評価対象の出力配列
 * @param config - 計算設定
 * @returns 0.0〜1.0の整合性スコア
 */
export async function calculateConsistencyScore(
  outputs: TaskOutput[],
  config: Partial<ConsistencyConfig> = {}
): Promise<number> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  if (outputs.length < 2) return 1.0;
  if (outputs.length === 2) {
    return calculateSimilarity(outputs[0], outputs[1]);
  }
  
  // 全ペアの類似度平均
  const similarities: number[] = [];
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      similarities.push(calculateSimilarity(outputs[i], outputs[j]));
    }
  }
  
  const avg = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  return Math.min(1.0, Math.max(0.0, avg));
}

/**
 * @summary LLMによる出力統合（高整合性時）
 * @description 複数の一貫した出力を統合した単一出力を生成
 * @param outputs - 統合対象の出力配列
 * @returns 統合後の出力
 */
export async function llmMergeOutputs(outputs: TaskOutput[]): Promise<TaskOutput> {
  if (outputs.length === 0) {
    throw new Error("Cannot merge empty outputs");
  }
  if (outputs.length === 1) return outputs[0];
  
  // 実際の実装ではLLMを呼び出して統合
  // ここではシンプルな結合を行う（プレースホルダー）
  const mergedSummary = outputs
    .map((o, i) => `[Source ${i + 1}]\n${o.summary}`)
    .join("\n\n---\n\n");
  
  // ファイルパスの集合
  const allFiles = [...new Set(outputs.flatMap(o => o.files || []))];
  
  return {
    taskId: "merged",
    summary: `Merged ${outputs.length} outputs:\n\n${mergedSummary}`,
    files: allFiles,
    artifacts: [...new Set(outputs.flatMap(o => o.artifacts || []))],
  };
}

/**
 * @summary LLMによる出力仲裁（低整合性時）
 * @description 矛盾する出力間で最良のものを選択または解決
 * @param outputs - 仲裁対象の出力配列
 * @returns 仲裁後の単一出力
 */
export async function llmArbitrateOutputs(outputs: TaskOutput[]): Promise<TaskOutput> {
  if (outputs.length === 0) {
    throw new Error("Cannot arbitrate empty outputs");
  }
  if (outputs.length === 1) return outputs[0];
  
  // 実際の実装ではLLMに矛盾解決を依頼
  // ここでは最も詳細な出力を選択する簡易実装
  const sortedByDetail = [...outputs].sort((a, b) => {
    const lenA = (a.summary || "").length + (a.files?.length || 0);
    const lenB = (b.summary || "").length + (b.files?.length || 0);
    return lenB - lenA; // 降順
  });
  
  const selected = sortedByDetail[0];
  
  return {
    ...selected,
    summary: `[Arbitrated from ${outputs.length} conflicting outputs]\n\n${selected.summary}`,
  };
}

/**
 * @summary トポロジー別の出力合成
 * @description AdaptOrch Algorithm 2相当の実装
 * @param outputs - 合成対象の出力配列
 * @param topology - 実行時のトポロジー型
 * @param context - 実行コンテキスト
 * @returns 合成結果
 */
export async function synthesizeOutputs(
  outputs: TaskOutput[],
  topology: TopologyType,
  context?: {
    consistencyThreshold?: number;
    attemptRepair?: boolean;
  }
): Promise<SynthesisResult> {
  const threshold = context?.consistencyThreshold ?? DEFAULT_CONFIG.highThreshold;
  
  // 空チェック
  if (outputs.length === 0) {
    throw new Error("No outputs to synthesize");
  }
  
  // 単一出力
  if (outputs.length === 1) {
    return {
      output: outputs[0],
      strategy: "single",
    };
  }
  
  // トポロジー別戦略
  switch (topology) {
    case "sequential": {
      // 順次実行: 最後の出力を採用
      return {
        output: outputs[outputs.length - 1],
        strategy: "last",
      };
    }
    
    case "hierarchical": {
      // 階層型: リードエージェントが既に統合済み
      return {
        output: outputs[0],
        strategy: "lead-integrated",
      };
    }
    
    case "parallel":
    case "hybrid": {
      // 並列/ハイブリッド: 整合性に基づく分岐
      const cs = await calculateConsistencyScore(outputs);
      
      if (cs >= threshold) {
        // 高整合性: 統合合成
        const merged = await llmMergeOutputs(outputs);
        return {
          output: merged,
          strategy: "merge",
          consistencyScore: cs,
        };
      } else {
        // 低整合性: 仲裁
        const resolved = await llmArbitrateOutputs(outputs);
        return {
          output: resolved,
          strategy: "arbitrate",
          consistencyScore: cs,
        };
      }
    }
    
    default: {
      // 未知のトポロジー: フォールバック
      return {
        output: outputs[0],
        strategy: "fallback",
      };
    }
  }
}

/**
 * @summary 再ルーティング提案（AdaptOrchの適応的再試行）
 * @description 合成失敗時に、より制約の厳しいトポロジーを提案
 * @param currentTopology - 現在のトポロジー
 * @param failureReason - 失敗理由
 * @returns 推奨される新しいトポロジー
 */
export function proposeRerouting(
  currentTopology: TopologyType,
  failureReason: "low_consistency" | "synthesis_failed" | "timeout"
): TopologyType {
  switch (failureReason) {
    case "low_consistency":
      // 整合性不足 → より順次的なトポロジーへ
      if (currentTopology === "parallel") return "hybrid";
      if (currentTopology === "hybrid") return "hierarchical";
      return "sequential";
      
    case "synthesis_failed":
      // 合成失敗 → 階層化（人間的介入ポイント）
      return "hierarchical";
      
    case "timeout":
      // タイムアウト → 並列化（時間短縮）
      if (currentTopology === "sequential") return "hybrid";
      return currentTopology;
      
    default:
      return currentTopology;
  }
}
