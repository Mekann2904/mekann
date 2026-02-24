/**
 * @abdd.meta
 * path: .pi/lib/performance-monitor.ts
 * role: AWMパフォーマンスモニター M(t)
 * why: システムパフォーマンスを監視し、動的にリソース配分を最適化するため
 * related: .pi/lib/cross-instance-coordinator.ts, .pi/lib/adaptive-rate-controller.ts, .pi/lib/priority-scheduler.ts
 * public_api: PerformanceMonitor, MetricsSnapshot, getResourceAllocation, getCurrentScore
 * invariants: メトリクスは時系列順に記録される
 * side_effects: メトリクスファイルへの書き込み（将来実装）
 * failure_modes: ディスク書き込みエラー（将来実装時）
 * @abdd.explain
 * overview: DynTaskMAS論文のAWM（Adaptive Workflow Manager）のパフォーマンスモニター M(t) を実装
 * what_it_does:
 *   - システムメトリクス（スループット、レイテンシ、エラー率等）を記録
 *   - パフォーマンススコア M(t) を計算
 *   - リソース配分式に基づいてエージェントへのリソース配分を決定
 * why_it_exists:
 *   - システムの健全性をリアルタイムで監視し、動的な最適化を可能にするため
 *   - エージェントごとのパフォーマンスに基づいてリソースを最適配分するため
 * scope:
 *   in: メトリクススナップショット
 *   out: パフォーマンススコア、リソース配分計画
 */

// File: .pi/lib/performance-monitor.ts
// Description: Performance Monitor M(t) for AWM (Adaptive Workflow Manager).
// Why: Implements DynTaskMAS paper's performance monitoring and resource allocation.
// Related: .pi/lib/cross-instance-coordinator.ts, .pi/lib/adaptive-rate-controller.ts, .pi/lib/priority-scheduler.ts

/**
 * メトリクススナップショット
 * @summary メトリクススナップショット
 * @param timestamp - 記録時刻（UNIXタイムスタンプ）
 * @param activeAgents - アクティブエージェント数
 * @param pendingTasks - 待機中タスク数
 * @param completedTasks - 完了タスク数
 * @param failedTasks - 失敗タスク数
 * @param avgLatencyMs - 平均レイテンシ（ms）
 * @param throughput - スループット（tasks/second）
 * @param resourceUtilization - リソース利用率（0-1）
 * @param errorRate - エラー率（0-1）
 */
export interface MetricsSnapshot {
  /** 記録時刻（UNIXタイムスタンプ） */
  timestamp: number;
  /** アクティブエージェント数 */
  activeAgents: number;
  /** 待機中タスク数 */
  pendingTasks: number;
  /** 完了タスク数 */
  completedTasks: number;
  /** 失敗タスク数 */
  failedTasks: number;
  /** 平均レイテンシ（ms） */
  avgLatencyMs: number;
  /** スループット（tasks/second） */
  throughput: number;
  /** リソース利用率（0-1） */
  resourceUtilization: number;
  /** エラー率（0-1） */
  errorRate: number;
}

/**
 * エージェント情報
 * @summary エージェント情報
 * @param id - エージェントID
 * @param priority - 優先度スコア
 */
export interface AgentInfo {
  /** エージェントID */
  id: string;
  /** 優先度スコア */
  priority: number;
}

/**
 * リソース配分結果
 * @summary リソース配分
 * @param agentId - エージェントID
 * @param allocatedSlots - 配分スロット数
 * @param priority - 優先度
 * @param reason - 配分理由
 */
export interface ResourceAllocation {
  /** エージェントID */
  agentId: string;
  /** 配分スロット数 */
  allocatedSlots: number;
  /** 優先度 */
  priority: number;
  /** 配分理由 */
  reason: string;
}

/**
 * モニター設定
 * @summary モニター設定
 * @param windowSize - メトリクス保持数
 * @param maxAgents - 最大エージェント数
 */
export interface MonitorConfig {
  /** メトリクス保持数 */
  windowSize: number;
  /** 最大エージェント数 */
  maxAgents: number;
}

/**
 * デフォルト設定
 * @summary デフォルト設定
 */
export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  windowSize: 100,
  maxAgents: 16,
};

/**
 * パフォーマンスモニター
 * DynTaskMAS論文のAWMコンポーネントを実装
 * @summary パフォーマンスモニター
 */
export class PerformanceMonitor {
  private metrics: MetricsSnapshot[];
  private config: MonitorConfig;
  private startTime: number;

  /**
   * モニターを初期化
   * @summary モニター初期化
   * @param config - モニター設定
   */
  constructor(config: MonitorConfig = DEFAULT_MONITOR_CONFIG) {
    this.metrics = [];
    this.config = config;
    this.startTime = Date.now();
  }

  /**
   * メトリクスを記録
   * @summary メトリクス記録
   * @param snapshot - 部分的なメトリクススナップショット
   */
  record(snapshot: Partial<MetricsSnapshot>): void {
    const fullSnapshot: MetricsSnapshot = {
      timestamp: Date.now(),
      activeAgents: snapshot.activeAgents ?? 0,
      pendingTasks: snapshot.pendingTasks ?? 0,
      completedTasks: snapshot.completedTasks ?? 0,
      failedTasks: snapshot.failedTasks ?? 0,
      avgLatencyMs: snapshot.avgLatencyMs ?? 0,
      throughput: snapshot.throughput ?? this.calculateThroughput(),
      resourceUtilization:
        snapshot.resourceUtilization ?? this.calculateUtilization(),
      errorRate: snapshot.errorRate ?? this.calculateErrorRate(),
    };

    this.metrics.push(fullSnapshot);

    // ウィンドウサイズを超えたら古いデータを削除
    if (this.metrics.length > this.config.windowSize) {
      this.metrics.shift();
    }
  }

  /**
   * M(t) - 現在のパフォーマンススコアを計算
   * M(t) = throughput * (1 - errorRate) * utilization
   * @summary パフォーマンススコア取得
   * @returns パフォーマンススコア（0-無限大、通常0-2程度）
   */
  getCurrentScore(): number {
    const recent = this.metrics.slice(-10);
    if (recent.length === 0) return 0;

    const avgThroughput =
      recent.reduce((s, m) => s + m.throughput, 0) / recent.length;
    const avgErrorRate =
      recent.reduce((s, m) => s + m.errorRate, 0) / recent.length;
    const avgUtilization =
      recent.reduce((s, m) => s + m.resourceUtilization, 0) / recent.length;

    return avgThroughput * (1 - avgErrorRate) * avgUtilization;
  }

  /**
   * リソース配分を計算
   * Allocation(a_i, t) = baseSlots * priority(a_i) * (1 + performanceBonus)
   * @summary リソース配分計算
   * @param agents - エージェント情報配列
   * @param totalSlots - 合計スロット数
   * @returns リソース配分結果配列
   */
  getResourceAllocation(
    agents: AgentInfo[],
    totalSlots: number
  ): ResourceAllocation[] {
    const currentScore = this.getCurrentScore();
    const performanceBonus = Math.max(0, (currentScore - 0.5) * 0.2);

    const totalPriority = agents.reduce((s, a) => s + a.priority, 0);

    if (totalPriority === 0) {
      // 優先度がない場合は均等配分
      const equalSlots = Math.floor(totalSlots / agents.length);
      return agents.map((agent) => ({
        agentId: agent.id,
        allocatedSlots: equalSlots,
        priority: 0,
        reason: "Equal distribution (no priority)",
      }));
    }

    const allocations: ResourceAllocation[] = [];

    for (const agent of agents) {
      const baseSlots = (agent.priority / totalPriority) * totalSlots;
      const allocated = Math.round(baseSlots * (1 + performanceBonus));

      allocations.push({
        agentId: agent.id,
        allocatedSlots: Math.max(1, allocated),
        priority: agent.priority,
        reason: `Priority: ${agent.priority.toFixed(2)}, Bonus: ${performanceBonus.toFixed(2)}`,
      });
    }

    return allocations;
  }

  /**
   * 最新のメトリクスを取得
   * @summary 最新メトリクス取得
   * @returns 最新のメトリクス（存在しない場合はundefined）
   */
  getLatestMetrics(): MetricsSnapshot | undefined {
    return this.metrics.length > 0
      ? this.metrics[this.metrics.length - 1]
      : undefined;
  }

  /**
   * 指定期間のメトリクスを取得
   * @summary 期間メトリクス取得
   * @param since - 開始時刻（UNIXタイムスタンプ）
   * @returns メトリクス配列
   */
  getMetricsSince(since: number): MetricsSnapshot[] {
    return this.metrics.filter((m) => m.timestamp >= since);
  }

  /**
   * 稼働時間を取得
   * @summary 稼働時間取得
   * @returns 稼働時間（ms）
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 統計サマリーを取得
   * @summary 統計サマリー取得
   * @returns 統計サマリー
   */
  getSummary(): {
    totalCompleted: number;
    totalFailed: number;
    avgThroughput: number;
    avgLatency: number;
    avgUtilization: number;
    avgErrorRate: number;
    uptimeMs: number;
  } {
    const latest = this.getLatestMetrics();
    const recent = this.metrics.slice(-10);

    return {
      totalCompleted: latest?.completedTasks ?? 0,
      totalFailed: latest?.failedTasks ?? 0,
      avgThroughput:
        recent.reduce((s, m) => s + m.throughput, 0) / recent.length || 0,
      avgLatency:
        recent.reduce((s, m) => s + m.avgLatencyMs, 0) / recent.length || 0,
      avgUtilization:
        recent.reduce((s, m) => s + m.resourceUtilization, 0) / recent.length ||
        0,
      avgErrorRate:
        recent.reduce((s, m) => s + m.errorRate, 0) / recent.length || 0,
      uptimeMs: this.getUptime(),
    };
  }

  /**
   * スループットを計算
   * @summary スループット計算
   * @returns スループット（tasks/second）
   * @internal
   */
  private calculateThroughput(): number {
    if (this.metrics.length < 2) return 0;

    const recent = this.metrics.slice(-10);
    const timeDiff =
      (recent[recent.length - 1].timestamp - recent[0].timestamp) / 1000;
    const tasksDiff =
      recent[recent.length - 1].completedTasks - recent[0].completedTasks;

    return timeDiff > 0 ? tasksDiff / timeDiff : 0;
  }

  /**
   * リソース利用率を計算
   * @summary 利用率計算
   * @returns 利用率（0-1）
   * @internal
   */
  private calculateUtilization(): number {
    const recent = this.metrics.slice(-10);
    if (recent.length === 0) return 0;

    const avgActiveAgents =
      recent.reduce((s, m) => s + m.activeAgents, 0) / recent.length;

    return avgActiveAgents / this.config.maxAgents;
  }

  /**
   * エラー率を計算
   * @summary エラー率計算
   * @returns エラー率（0-1）
   * @internal
   */
  private calculateErrorRate(): number {
    const recent = this.metrics.slice(-10);
    if (recent.length === 0) return 0;

    const total = recent.reduce(
      (s, m) => s + m.completedTasks + m.failedTasks,
      0
    );
    const failed = recent.reduce((s, m) => s + m.failedTasks, 0);

    return total > 0 ? failed / total : 0;
  }

  /**
   * メトリクスをクリア
   * @summary メトリクスクリア
   */
  clear(): void {
    this.metrics = [];
    this.startTime = Date.now();
  }
}
