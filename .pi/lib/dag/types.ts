/**
 * @abdd.meta
 * path: .pi/lib/dag/types.ts
 * role: DAG実行の型定義とAdaptOrch-inspired拡張
 * why: トポロジー適応型オーケストレーションの基盤型定義
 * related:
 *   - .pi/lib/dag/topology-router.ts
 *   - .pi/lib/dag/orchestrator.ts
 *   - .pi/lib/dag/executors/*.ts
 * public_api:
 *   - DAGTask
 *   - DAGPlan
 *   - DAGMetrics
 *   - TopologyType
 * invariants:
 *   - DAGは常に非巡回（acyclic）
 *   - topologyがhybridの場合、layers必須
 *   - coupling値は{0,0.3,0.7,1.0}または連続値0-1
 * side_effects: none
 * failure_modes:
 *   - 循環依存検出時にエラー
 *   - 無効なtopology指定時にフォールバック
 */

/**
 * @abdd.explain
 * overview: DAGベース並列実行のための型定義群。AdaptOrch論文の
 *   トポロジー適応概念を統合し、タスク特性に応じた最適実行戦略を選択可能にする。
 *
 * what_it_does:
 *   - 4 canonical topologies (parallel/sequential/hierarchical/hybrid) の定義
 *   - DAG構造メトリクス（並列幅、クリティカルパス、結合密度）の計測
 *   - タスクごとの入出力領域宣言（writeSet/readSet）による並列安全性確保
 *   - 失敗パターン別の修復分岐を固定DAG内で表現
 *
 * why_it_exists:
 *   モデル性能収束時代において、オーケストレーショントポロジーが
 *   システム性能の支配的変数となる。固定DAG前提で最大限の適応性を実現。
 *
 * scope:
 *   in: タスク定義、依存関係、トポロジー選択、合成戦略
 *   out: 具体的なLLM呼び出し、エージェント実装、永続化層
 */

/** 4 canonical topologies (AdaptOrch Section 3.3) */
export type TopologyType = "parallel" | "sequential" | "hierarchical" | "hybrid";

/** タスク間の結合強度（論文準拠の離散値 + 連続値対応） */
export type CouplingStrength = "none" | "weak" | "strong" | "critical";

/** タスク種別（責務分離のためのヒント） */
export type TaskType =
  | "contract"      // インターフェース・仕様定義
  | "implementation" // 実装
  | "verification"   // 検証・テスト
  | "integration"    // 統合
  | "synthesis";     // 出力合成

/** DAG構造メトリクス（AdaptOrch Definition 3） */
export interface DAGMetrics {
  /** ω(G_T): 最大反鎖サイズ（並列実行可能な最大タスク数） */
  parallelismWidth: number;

  /** δ(G_T): 重み付き最長パス（クリティカルパス長） */
  criticalPathDepth: number;

  /** γ(G_T): 平均結合強度 [0,1] */
  couplingDensity: number;

  /** |V|: ノード数 */
  nodeCount: number;

  /** |E|: エッジ数 */
  edgeCount: number;
}

/** タスク評価・分岐設定（固定DAGでの失敗パターン対応） */
export interface TaskEvaluation {
  /** 評価方式 */
  type: "llm-score" | "rule-based" | "none";

  /** 閾値（type=llm-score時） */
  threshold?: number;

  /** 成功時の次タスクID */
  onSuccess?: string;

  /** 失敗時の修復タスクID */
  onFailure?: string;
}

/** タスク出力定義（単一タスク用） */
export interface TaskOutput {
  /** タスクID */
  taskId: string;
  
  /** 実行結果サマリー */
  summary: string;
  
  /** 生成・変更されたファイルパス */
  files?: string[];

  /** その他の成果物パス */
  artifacts?: string[];
}

/** タスク出力定義（複合的な出力用） */
export interface TaskOutputs {
  /** 生成・変更されたファイルパス */
  files?: string[];

  /** その他の成果物パス */
  artifacts?: string[];

  /** 実行結果サマリー */
  summary?: string;
}

/** タスク検証設定 */
export interface TaskVerification {
  /** 検証コマンド */
  command?: string;

  /** 期待する終了コード */
  expectedExitCode?: number;

  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
}

/** DAGタスク定義 */
export interface DAGTask {
  /** タスク識別子（ユニーク） */
  id: string;

  /** タスク説明 */
  description: string;

  /** 割り当てエージェントID */
  assignedAgent?: string;

  /** 依存するタスクID一覧 */
  dependencies: string[];

  /** タスク種別 */
  taskType?: TaskType;

  /**
   * 書き込み領域（ファイルglobパターン）
   * 並列実行時の競合検出に使用
   */
  writeSet?: string[];

  /**
   * 読み取り領域（ファイルglobパターン）
   * 依存関係の自動推論に使用可能
   */
  readSet?: string[];

  /** 推定トークンコスト（コスト見積もり用） */
  estimatedTokens?: number;

  /**
   * 依存先との結合強度
   * none: 完全独立（出力のみ受け取る）
   * weak: ドメイン知識共有
   * strong: 直接入力として使用
   * critical: 意味的一貫性必須
   */
  coupling?: CouplingStrength;

  /** 評価・分岐設定 */
  evaluation?: TaskEvaluation;

  /** 期待される出力 */
  outputs?: TaskOutputs;

  /** 検証設定 */
  verification?: TaskVerification;
}

/** DAGプラン定義 */
export interface DAGPlan {
  /** プラン識別子 */
  id: string;

  /** プラン説明 */
  description: string;

  /** タスク一覧 */
  tasks: DAGTask[];

  /**
   * 選択されたトポロジー
   * 未指定時はrouterによって自動決定
   */
  topology?: TopologyType;

  /**
   * ハイブリッドトポロジー時のレイヤー分割
   * topology === "hybrid" の場合必須
   */
  layers?: DAGTask[][];

  /** DAG構造メトリクス（ログ・説明可能性用） */
  metrics?: DAGMetrics;

  /** 最大並列数（デフォルト: 3） */
  maxConcurrency?: number;

  /** 最初のエラーで中止（デフォルト: false） */
  abortOnFirstError?: boolean;
}

/** タスク実行結果 */
export interface TaskResult {
  taskId: string;
  status: "success" | "failure" | "skipped";
  outputs?: TaskOutputs;
  error?: string;
  durationMs: number;
}

/** 合成結果 */
export interface SynthesisResult {
  /** 合成された出力 */
  output: TaskOutputs;

  /** 使用した合成戦略 */
  strategy: "last" | "merge" | "arbitrate" | "lead-integrated";

  /** 整合性スコア（並列出力時） */
  consistencyScore?: number;
}

/** 検証結果 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** 実行結果 */
export interface ExecutionResult {
  planId: string;
  status: "success" | "failure" | "partial";
  taskResults: TaskResult[];
  outputs: TaskOutput[];
  finalOutput?: TaskOutputs;
  synthesis?: SynthesisResult;
  synthesisStrategy?: string;
  consistencyScore?: number;
  durationMs: number;
  metrics?: DAGMetrics;
  repaired?: boolean;
  originalTopology?: string;
}

/** 実行コンテキスト */
export interface ExecutionContext {
  workingDir: string;
  env: Record<string, string>;
  logger: (level: "debug" | "info" | "warn" | "error", message: string) => void;
}

/** エグゼキュータインターフェース */
export interface Executor {
  execute(plan: DAGPlan, context: ExecutionContext): Promise<ExecutionResult>;
}

/** 結合強度を数値に変換 */
export function couplingToNumber(coupling: CouplingStrength): number {
  const map: Record<CouplingStrength, number> = {
    none: 0.0,
    weak: 0.3,
    strong: 0.7,
    critical: 1.0,
  };
  return map[coupling];
}

/** 数値を結合強度に変換（近似） */
export function numberToCoupling(value: number): CouplingStrength {
  if (value <= 0.15) return "none";
  if (value <= 0.5) return "weak";
  if (value <= 0.85) return "strong";
  return "critical";
}
