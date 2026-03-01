/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/mdm-modulator.ts
 * role: MDM状態管理と通信リンク変調を行う
 * why: 多次元空間でのエージェント位置に基づく動的通信パターンを実現するため
 * related: ./mdm-types.ts, ./communication-links.ts, ./debate-graph.ts
 * public_api: MDMModulator, createDefaultMDMConfig
 * invariants: 状態更新は冪等である、変調結果は決定論的である
 * side_effects: なし（純粋関数ベース）
 * failure_modes: 不正な入力に対するフォールバック
 * @abdd.explain
 * overview: McKinsey-based Debate Matter（MDM）モジュールの実装
 * what_it_does:
 *   - エージェントの多次元空間内の位置を管理する
 *   - McKinsey Trust Formulaに基づきエッジ重みを計算する
 *   - 通信リンクを動的に変調し、疎グラフを生成する
 *   - デッドロック（停滞）状態を検出する
 * why_it_exists:
 *   - CortexDebate論文のMDM概念を実装するため
 *   - エージェント間の有益な通信のみを選別し、コンテキスト削減を実現するため
 * scope:
 *   in: チームメンバー定義、メンバー実行結果、MDM設定
 *   out: 変調された通信リンク、MDM状態、影響力スコア
 */

import type {
  MDMConfig,
  MDMState,
  MDMDimension,
} from "./mdm-types";
import type { TeamMemberResult } from "./storage";

/**
 * チームメンバー型定義（communication-links.tsと共通）
 * @summary メンバー型定義
 */
export interface TeamMemberLike {
  id: string;
  role?: string;
}

/**
 * デフォルトMDM設定を作成
 * @summary デフォルトMDM設定生成
 * @returns デフォルト設定値を持つMDMConfig
 */
export function createDefaultMDMConfig(): MDMConfig {
  return {
    dimensions: [
      { name: "confidence", weight: 0.35, source: "confidence" },
      { name: "evidence", weight: 0.30, source: "evidence" },
      { name: "stance", weight: 0.20, source: "stance" },
      { name: "temporal", weight: 0.15, source: "temporal" },
    ],
    modulationFunction: "sigmoid",
    decayRate: 0.1,
    learningRate: 0.3,
    stabilityThreshold: 0.05,
  };
}

/**
 * MDM変調器クラス
 * 多次元空間でのエージェント位置を管理し、通信リンクを動的に変調する
 * @summary MDM変調器
 */
export class MDMModulator {
  private state: MDMState;
  private config: MDMConfig;

  /**
   * コンストラクタ
   * @summary MDM変調器初期化
   * @param config MDM設定（デフォルト使用する場合は省略可）
   */
  constructor(config: MDMConfig = createDefaultMDMConfig()) {
    this.config = config;
    this.state = {
      positions: new Map(),
      velocities: new Map(),
      history: [],
      round: 0,
      converged: false,
    };
  }

  /**
   * 初期位置を設定
   * 全メンバーのMDM空間内の初期位置を設定する
   * @summary 初期位置設定
   * @param members メンバーリスト
   */
  initializePositions(members: TeamMemberLike[]): void {
    for (const member of members) {
      const position = new Array(this.config.dimensions.length).fill(0.5);
      this.state.positions.set(member.id, position);
      this.state.velocities.set(
        member.id,
        new Array(this.config.dimensions.length).fill(0)
      );
    }
  }

  /**
   * メンバー結果に基づいて状態を更新
   * 各メンバーの位置を新しい結果に基づいて更新し、速度を計算する
   * @summary 状態更新
   * @param results メンバー実行結果の配列
   * @param round 現在のラウンド番号
   * @returns 更新されたMDM状態
   */
  updateState(results: TeamMemberResult[], round: number): MDMState {
    this.state.round = round;

    for (const result of results) {
      const currentPosition = this.state.positions.get(result.memberId);
      if (!currentPosition) continue;

      const newPosition = this.extractPosition(result);
      const velocity = this.computeVelocity(currentPosition, newPosition);

      this.state.positions.set(result.memberId, newPosition);
      this.state.velocities.set(result.memberId, velocity);
    }

    this.checkConvergence();
    return this.state;
  }

  /**
   * 通信リンクを変調
   * MDM空間内の距離と影響力に基づいて通信リンクを最適化する
   * @summary リンク変調
   * @param baseLinks 基本リンクマップ
   * @param state MDM状態
   * @returns 変調されたリンクマップ
   */
  modulateLinks(
    baseLinks: Map<string, string[]>,
    state: MDMState
  ): Map<string, string[]> {
    const modulatedLinks = new Map<string, string[]>();

    for (const [memberId, partners] of baseLinks) {
      const memberPosition = state.positions.get(memberId);
      if (!memberPosition) {
        modulatedLinks.set(memberId, partners);
        continue;
      }

      // Sort partners by MDM distance (closer = higher priority)
      const scoredPartners = partners.map((partnerId) => {
        const partnerPosition = state.positions.get(partnerId);
        if (!partnerPosition) return { id: partnerId, score: 0 };

        const distance = this.computeDistance(memberPosition, partnerPosition);
        const influence = this.computeInfluence(partnerPosition);
        const score = influence / (1 + distance); // Higher = better

        return { id: partnerId, score };
      });

      scoredPartners.sort((a, b) => b.score - a.score);
      modulatedLinks.set(memberId, scoredPartners.map((p) => p.id));
    }

    return modulatedLinks;
  }

  /**
   * 影響力スコアを計算
   * 指定メンバーのMDM空間内での影響力を計算する
   * @summary 影響力計算
   * @param memberId メンバーID
   * @returns 影響力スコア（0.0-1.0）
   */
  calculateInfluence(memberId: string): number {
    const position = this.state.positions.get(memberId);
    if (!position) return 0;
    return this.computeInfluence(position);
  }

  /**
   * デッドロックを検出
   * MDM空間内で近接しすぎているメンバーのクラスタを検出する
   * @summary デッドロック検出
   * @returns デッドロックしているメンバーIDのクラスタ配列
   */
  detectDeadlocks(): string[][] {
    const deadlocks: string[][] = [];
    const visited = new Set<string>();

    for (const [memberId, position] of this.state.positions) {
      if (visited.has(memberId)) continue;

      // Find members with nearly identical positions (potential deadlock)
      const cluster = [memberId];
      visited.add(memberId);

      for (const [otherId, otherPosition] of this.state.positions) {
        if (visited.has(otherId)) continue;

        const distance = this.computeDistance(position, otherPosition);
        if (distance < this.config.stabilityThreshold) {
          cluster.push(otherId);
          visited.add(otherId);
        }
      }

      if (cluster.length > 1) {
        deadlocks.push(cluster);
      }
    }

    return deadlocks;
  }

  /**
   * 現在の状態を取得
   * @summary 状態取得
   * @returns 現在のMDM状態
   */
  getState(): MDMState {
    return this.state;
  }

  /**
   * 設定を取得
   * @summary 設定取得
   * @returns 現在のMDM設定
   */
  getConfig(): MDMConfig {
    return this.config;
  }

  /**
   * 状態をリセット
   * @summary 状態リセット
   */
  reset(): void {
    this.state = {
      positions: new Map(),
      velocities: new Map(),
      history: [],
      round: 0,
      converged: false,
    };
  }

  // --- Private methods ---

  /**
   * メンバー結果から位置ベクトルを抽出
   * @summary 位置抽出
   * @param result メンバー実行結果
   * @returns 位置ベクトル
   */
  private extractPosition(result: TeamMemberResult): number[] {
    const position: number[] = [];

    for (const dim of this.config.dimensions) {
      let value = 0.5; // Default neutral position

      switch (dim.source) {
        case "confidence":
          value = result.diagnostics?.confidence ?? 0.5;
          break;
        case "evidence": {
          const count = result.diagnostics?.evidenceCount ?? 0;
          value = Math.min(1, count / 5); // Normalize to 0-1
          break;
        }
        case "stance": {
          // Derived from contradiction/conflict signals
          const signals =
            (result.diagnostics?.contradictionSignals ?? 0) +
            (result.diagnostics?.conflictSignals ?? 0);
          value = Math.max(0, 1 - signals * 0.1);
          break;
        }
        case "temporal":
          // Recent results weighted higher (handled externally)
          value = 0.5;
          break;
        case "custom":
          if (dim.extractor) {
            value = dim.extractor(result);
          }
          break;
      }

      position.push(value * dim.weight);
    }

    return position;
  }

  /**
   * 速度ベクトルを計算
   * @summary 速度計算
   * @param current 現在の位置
   * @param target 目標位置
   * @returns 速度ベクトル
   */
  private computeVelocity(current: number[], target: number[]): number[] {
    return current.map((c, i) => {
      const diff = target[i] - c;
      return diff * this.config.learningRate;
    });
  }

  /**
   * 2点間のユークリッド距離を計算
   * @summary 距離計算
   * @param a 点A
   * @param b 点B
   * @returns ユークリッド距離
   */
  private computeDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * 位置ベクトルから影響力を計算
   * @summary 影響力計算
   * @param position 位置ベクトル
   * @returns 影響力スコア
   */
  private computeInfluence(position: number[]): number {
    // Higher weighted position = more influence
    const sum = position.reduce((acc, val) => acc + val, 0);
    return sum / position.length;
  }

  /**
   * 収束判定
   * 全メンバーの平均移動量が閾値以下なら収束とみなす
   * @summary 収束判定
   */
  private checkConvergence(): void {
    let totalMovement = 0;

    for (const [, velocity] of this.state.velocities) {
      const magnitude = Math.sqrt(
        velocity.reduce((acc, v) => acc + v * v, 0)
      );
      totalMovement += magnitude;
    }

    const avgMovement =
      this.state.positions.size > 0
        ? totalMovement / this.state.positions.size
        : 0;
    this.state.converged = avgMovement < this.config.stabilityThreshold;
  }
}
