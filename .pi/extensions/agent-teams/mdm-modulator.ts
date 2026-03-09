/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/mdm-modulator.ts
 * role: MDM (Multi-Dimensional Modulator) - マルチエージェント討論の次元変調器
 * why: エージェント間の相互作用を多次元空間でモデル化し、収束・発散・デッドロックを検出・制御する
 * related:
 *   - .pi/extensions/agent-teams/cortexdebate-config.ts (設定)
 *   - docs/research/cortexdebate.md (設計根拠)
 * public_api:
 *   - MDMModulator (クラス)
 *   - createDefaultMDMConfig (関数)
 *   - TeamMemberLike (型)
 *   - TeamMemberResult (型)
 */

/**
 * @summary チームメンバーの基本情報
 */
export interface TeamMemberLike {
  id: string;
  role?: string;
}

/**
 * @summary チームメンバーの結果と診断情報
 */
export interface TeamMemberResult {
  memberId: string;
  success: boolean;
  result: string;
  diagnostics?: {
    confidence?: number;
    evidenceCount?: number;
    contradictionSignals?: number;
    conflictSignals?: number;
  };
}

/**
 * @summary MDM次元定義
 */
export interface MDMDimension {
  name: string;
  weight: number;
  source: "confidence" | "evidence" | "contradiction" | "conflict" | "custom";
}

/**
 * @summary MDM設定
 */
export interface MDMConfig {
  dimensions: MDMDimension[];
  modulationFunction: "sigmoid" | "linear" | "tanh";
  decayRate: number;
  learningRate: number;
  stabilityThreshold: number;
}

/**
 * @summary MDM状態
 */
export interface MDMState {
  round: number;
  positions: Map<string, number[]>;
  velocities: Map<string, number[]>;
  converged: boolean;
}

/**
 * @summary デフォルトMDM設定を作成
 * @returns デフォルト設定
 */
export function createDefaultMDMConfig(): MDMConfig {
  return {
    dimensions: [
      { name: "confidence", weight: 0.4, source: "confidence" },
      { name: "evidence", weight: 0.3, source: "evidence" },
      { name: "stability", weight: 0.2, source: "custom" },
      { name: "consensus", weight: 0.1, source: "custom" },
    ],
    modulationFunction: "sigmoid",
    decayRate: 0.1,
    learningRate: 0.3,
    stabilityThreshold: 0.05,
  };
}

/**
 * @summary MDM変調器クラス
 * @description マルチエージェント討論の位置と速度を管理し、収束を検出する
 */
export class MDMModulator {
  private config: MDMConfig;
  private state: MDMState;
  private previousPositions: Map<string, number[]>;

  constructor(config?: MDMConfig) {
    this.config = config ?? createDefaultMDMConfig();
    this.state = {
      round: 0,
      positions: new Map(),
      velocities: new Map(),
      converged: false,
    };
    this.previousPositions = new Map();
  }

  /**
   * @summary メンバーの位置を初期化
   * @param members - チームメンバー一覧
   */
  initializePositions(members: TeamMemberLike[]): void {
    for (const member of members) {
      const initialPosition = this.config.dimensions.map(() => Math.random() * 0.5 + 0.25);
      this.state.positions.set(member.id, initialPosition);
      this.state.velocities.set(member.id, new Array(this.config.dimensions.length).fill(0));
    }
  }

  /**
   * @summary 状態を更新
   * @param results - 各メンバーの結果
   * @param round - 現在のラウンド
   * @returns 更新後の状態
   */
  updateState(results: TeamMemberResult[], round: number): MDMState {
    this.state.round = round;
    
    // 前回の位置を保存
    this.previousPositions.clear();
    for (const [id, pos] of this.state.positions) {
      this.previousPositions.set(id, [...pos]);
    }

    for (const result of results) {
      const position = this.calculatePosition(result);
      this.state.positions.set(result.memberId, position);
      
      // 速度を計算
      const prevPos = this.previousPositions.get(result.memberId);
      if (prevPos) {
        const velocity = position.map((p, i) => p - prevPos[i]);
        this.state.velocities.set(result.memberId, velocity);
      }
    }

    // 収束判定
    this.checkConvergence();

    return this.getState();
  }

  /**
   * @summary 結果から位置を計算
   * @param result - メンバーの結果
   * @returns 位置ベクトル
   */
  private calculatePosition(result: TeamMemberResult): number[] {
    const diag = result.diagnostics || {};
    
    return this.config.dimensions.map(dim => {
      switch (dim.source) {
        case "confidence":
          return diag.confidence ?? 0.5;
        case "evidence":
          return Math.min((diag.evidenceCount ?? 0) / 5, 1);
        case "contradiction":
          return Math.min((diag.contradictionSignals ?? 0) / 3, 1);
        case "conflict":
          return Math.min((diag.conflictSignals ?? 0) / 3, 1);
        default:
          return 0.5;
      }
    });
  }

  /**
   * @summary 収束をチェック
   */
  private checkConvergence(): void {
    let totalMovement = 0;
    let count = 0;

    for (const [id, velocity] of this.state.velocities) {
      const movement = Math.sqrt(velocity.reduce((sum, v) => sum + v * v, 0));
      totalMovement += movement;
      count++;
    }

    const avgMovement = count > 0 ? totalMovement / count : 0;
    this.state.converged = avgMovement < this.config.stabilityThreshold;
  }

  /**
   * @summary 現在の状態を取得
   * @returns 現在のMDM状態
   */
  getState(): MDMState {
    return {
      round: this.state.round,
      positions: new Map(this.state.positions),
      velocities: new Map(this.state.velocities),
      converged: this.state.converged,
    };
  }

  /**
   * @summary 設定を取得
   * @returns 現在の設定
   */
  getConfig(): MDMConfig {
    return { ...this.config };
  }

  /**
   * @summary リンクを変調
   * @param baseLinks - 基本リンク構造
   * @param state - 現在の状態
   * @returns 変調後のリンク
   */
  modulateLinks(baseLinks: Map<string, string[]>, state: MDMState): Map<string, string[]> {
    const modulated = new Map<string, string[]>();
    
    for (const [member, partners] of baseLinks) {
      // 影響力に基づいてソート
      const sortedPartners = [...partners].sort((a, b) => {
        const influenceA = this.calculateInfluence(a);
        const influenceB = this.calculateInfluence(b);
        return influenceB - influenceA;
      });
      
      modulated.set(member, sortedPartners);
    }
    
    return modulated;
  }

  /**
   * @summary メンバーの影響力を計算
   * @param memberId - メンバーID
   * @returns 影響力スコア
   */
  calculateInfluence(memberId: string): number {
    const position = this.state.positions.get(memberId);
    if (!position) return 0;
    
    // 位置の平均値を影響力とする
    const avg = position.reduce((sum, p) => sum + p, 0) / position.length;
    return this.applyModulation(avg);
  }

  /**
   * @summary 変調関数を適用
   * @param value - 入力値
   * @returns 変調後の値
   */
  private applyModulation(value: number): number {
    switch (this.config.modulationFunction) {
      case "sigmoid":
        return 1 / (1 + Math.exp(-value * 4 + 2));
      case "tanh":
        return Math.tanh(value * 2);
      case "linear":
      default:
        return Math.max(0, Math.min(1, value));
    }
  }

  /**
   * @summary デッドロックを検出
   * @returns デッドロックしているメンバーグループ
   */
  detectDeadlocks(): string[][] {
    const deadlocks: string[][] = [];
    const threshold = this.config.stabilityThreshold * 2;

    // 位置が近いメンバーをグループ化
    const groups: string[][] = [];
    const processed = new Set<string>();

    for (const [id1, pos1] of this.state.positions) {
      if (processed.has(id1)) continue;
      
      const group: string[] = [id1];
      processed.add(id1);

      for (const [id2, pos2] of this.state.positions) {
        if (id1 === id2 || processed.has(id2)) continue;
        
        const distance = Math.sqrt(
          pos1.reduce((sum, p, i) => sum + Math.pow(p - pos2[i], 2), 0)
        );
        
        if (distance < threshold) {
          group.push(id2);
          processed.add(id2);
        }
      }

      if (group.length > 1) {
        groups.push(group);
      }
    }

    // 2人以上のグループをデッドロックとみなす
    for (const group of groups) {
      if (group.length >= 2) {
        deadlocks.push(group);
      }
    }

    return deadlocks;
  }
}
