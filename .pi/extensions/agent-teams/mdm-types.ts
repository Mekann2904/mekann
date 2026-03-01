/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/mdm-types.ts
 * role: MDM（Multi-Dimensional Modulation）の型定義を提供する
 * why: 多次元変調システムの型安全性と再利用性を確保するため
 * related: ./mdm-modulator.ts, ./debate-graph.ts, ./cortexdebate-config.ts
 * public_api: StanceType, MDMDimension, MDMConfig, MDMModulation, MDMState, SparsityConfig, DebateNode, DebateEdge, DebateGraph, GraphMetrics, CortexDebateData
 * invariants: 次元ベクトルの長さはdimensions配列の長さと一致する、重みは0.0-1.0の範囲
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: MDMシステムで使用されるすべての型定義を集約するモジュール
 * what_it_does:
 *   - StanceType（立場タイプ）とMDMDimension（次元定義）を定義する
 *   - MDMConfig（設定）、MDMState（状態）、MDMModulation（変調履歴）の型を提供する
 *   - DebateGraph（議論グラフ）関連の型（Node、Edge、Metrics）を定義する
 *   - CortexDebate通信データの型を定義する
 * why_it_exists:
 *   - CortexDebate機能の型安全性を確保するため
 *   - 多次元変調システムのデータ構造を一元管理するため
 *   - エージェント間通信の疎グラフ化に必要な型を提供するため
 * scope:
 *   in: なし（型定義のみ）
 *   out: 型定義のエクスポート
 */

import type { TeamMemberResult } from "./storage";

/**
 * 立場タイプ
 * @summary エージェントの立場タイプ
 */
export type StanceType = "agree" | "disagree" | "neutral" | "partial";

/**
 * MDM次元のソース種別
 * @summary 次元のデータソース
 */
export type MDMDimensionSource = "confidence" | "evidence" | "stance" | "temporal" | "custom";

/**
 * MDM次元の定義
 * @summary MDM次元定義
 * @param name 次元名
 * @param weight 重み（0.0-1.0）
 * @param source データソース種別
 * @param extractor カスタム抽出関数（オプション）
 */
export interface MDMDimension {
  name: string;
  weight: number;
  source: MDMDimensionSource;
  extractor?: (result: TeamMemberResult) => number;
}

/**
 * MDM変調関数の種類
 * @summary 変調関数タイプ
 */
export type MDMModulationFunction = "linear" | "exponential" | "sigmoid";

/**
 * MDM設定
 * @summary MDM設定
 * @param dimensions 次元定義の配列
 * @param modulationFunction 変調関数の種類
 * @param decayRate 減衰率（0.0-1.0）
 * @param learningRate 学習率（0.0-1.0）
 * @param stabilityThreshold 収束判定の閾値
 */
export interface MDMConfig {
  dimensions: MDMDimension[];
  modulationFunction: MDMModulationFunction;
  decayRate: number;
  learningRate: number;
  stabilityThreshold: number;
}

/**
 * MDM変調履歴エントリ
 * @summary MDM変調履歴
 * @param round ラウンド番号
 * @param sourceId 送信元メンバーID
 * @param targetId 送信先メンバーID
 * @param dimension 対象次元名
 * @param delta 変化量
 * @param reason 変調理由
 */
export interface MDMModulation {
  round: number;
  sourceId: string;
  targetId: string;
  dimension: string;
  delta: number;
  reason: string;
}

/**
 * MDM状態
 * @summary MDM状態
 * @param positions メンバーID→次元ベクトルのマップ
 * @param velocities メンバーID→速度ベクトルのマップ
 * @param history 変調履歴
 * @param round 現在のラウンド
 * @param converged 収束フラグ
 */
export interface MDMState {
  positions: Map<string, number[]>;
  velocities: Map<string, number[]>;
  history: MDMModulation[];
  round: number;
  converged: boolean;
}

/**
 * スパースグラフのプルーニング戦略
 * @summary プルーニング戦略
 */
export type PruningStrategy = "threshold" | "top-k" | "adaptive";

/**
 * スパースグラフ設定
 * @summary スパースグラフ設定
 * @param targetDensity 目標密度（0.0-1.0）
 * @param pruningStrategy プルーニング戦略
 * @param minEdgeWeight 最小エッジ重み
 * @param maxDegree 最大次数
 */
export interface SparsityConfig {
  targetDensity: number;
  pruningStrategy: PruningStrategy;
  minEdgeWeight: number;
  maxDegree: number;
}

/**
 * 議論ノード
 * @summary 議論ノード
 * @param id ノードID
 * @param memberId メンバーID
 * @param claim 主張内容
 * @param confidence 信頼度
 * @param evidenceCount 証拠数
 * @param timestamp タイムスタンプ
 * @param mdmPosition MDM空間内の位置
 */
export interface DebateNode {
  id: string;
  memberId: string;
  claim: string;
  confidence: number;
  evidenceCount: number;
  timestamp: number;
  mdmPosition: number[];
}

/**
 * 議論エッジ
 * @summary 議論エッジ
 * @param id エッジID
 * @param source 送信元ノードID
 * @param target 送信先ノードID
 * @param stance 立場タイプ
 * @param weight エッジ重み
 * @param mdmInfluenced MDMの影響を受けたか
 */
export interface DebateEdge {
  id: string;
  source: string;
  target: string;
  stance: StanceType;
  weight: number;
  mdmInfluenced: boolean;
}

/**
 * グラフメトリクス
 * @summary グラフメトリクス
 * @param density グラフ密度
 * @param clustering クラスタリング係数
 * @param avgPathLength 平均パス長
 * @param modularity モジュラリティ
 * @param convergenceScore 収束スコア
 */
export interface GraphMetrics {
  density: number;
  clustering: number;
  avgPathLength: number;
  modularity: number;
  convergenceScore: number;
}

/**
 * 議論グラフ
 * @summary 議論グラフ
 * @param nodes ノードマップ
 * @param edges エッジマップ（ノードID→エッジ配列）
 * @param adjacency 隣接行列
 * @param clusters クラスタ（接続成分）
 * @param metrics グラフメトリクス
 */
export interface DebateGraph {
  nodes: Map<string, DebateNode>;
  edges: Map<string, DebateEdge[]>;
  adjacency: number[][];
  clusters: string[][];
  metrics: GraphMetrics;
}

/**
 * 通信パートナー情報
 * @summary 通信パートナー
 * @param memberId メンバーID
 * @param role ロール
 * @param influenceScore 影響力スコア
 * @param mdmDistance MDM空間内の距離
 */
export interface CommunicationPartner {
  memberId: string;
  role: string;
  influenceScore: number;
  mdmDistance: number;
}

/**
 * 通信パートナー要約
 * @summary パートナー要約
 * @param memberId メンバーID
 * @param stance 立場
 * @param summary 主張要約
 */
export interface CommunicationPartnerSummary {
  memberId: string;
  stance: StanceType;
  summary: string;
}

/**
 * CortexDebate通信データ
 * @summary CortexDebate通信データ
 * @param round ラウンド番号
 * @param teamId チームID
 * @param memberId メンバーID
 * @param memberRole メンバーロール
 * @param partners 通信パートナー
 * @param others 他メンバーの要約（オプション）
 * @param debateGraph 議論グラフ
 * @param stanceMatrix スタンス行列
 * @param influenceScores 影響力スコア
 * @param mdmState MDM状態
 */
export interface CortexDebateData {
  round: number;
  teamId: string;
  memberId: string;
  memberRole: string;
  partners: CommunicationPartner[];
  others?: CommunicationPartnerSummary[];
  debateGraph: DebateGraph;
  stanceMatrix: Map<string, Map<string, StanceType>>;
  influenceScores: Map<string, number>;
  mdmState: MDMState;
}
