/**
 * @abdd.meta
 * path: .pi/lib/awo/trace-collector.ts
 * role: AWO トレース収集システム
 * why: エージェント実行履歴を収集し、メタツール生成の基盤を提供
 * related: .pi/lib/awo/types.ts, .pi/lib/awo/state-graph.ts, .pi/extensions/subagents.ts
 * public_api: TraceCollector, getGlobalTraceCollector
 * invariants: トレースIDは一意、最大トレース数を超過時は最古を削除
 * side_effects: ファイルシステムへの書き込み（.pi/data/awo/traces/）
 * failure_modes: ディスク容量不足、書き込み権限なし
 * @abdd.explain
 * overview: エージェント実行のトレースを収集・永続化するシステム
 * what_it_does:
 *   - ツール呼び出しのリアルタイム記録
 *   - トレースのJSONL形式での永続化
 *   - 保持期間ベースの自動削除
 *   - トレース検索・フィルタリング
 * why_it_exists: AWOの学習データとして実行履歴を蓄積
 * scope:
 *   in: ToolCall, TraceFilter
 *   out: Trace, AWOStats
 */

import * as fs from "fs";
import * as path from "path";
import {
  type ToolCall,
  type Trace,
  type TraceFilter,
  type AWOStats,
  DEFAULT_AWO_CONFIG,
  type AWOConfig,
} from "./types.js";
import { getLogger } from "../comprehensive-logger.js";
import {
  queryObservabilityData,
  type ObservabilityQuery,
} from "../../extensions/observability-data.js";

// =============================================================================
// 型定義（ローカル）
// =============================================================================

/**
 * アクティブトレース
 * @summary 収集中のトレース
 */
interface ActiveTrace {
  trace: Trace;
  toolCalls: ToolCall[];
}

// =============================================================================
// TraceCollector クラス
// =============================================================================

/**
 * トレースコレクター
 * @summary エージェント実行履歴を収集・管理
 */
export class TraceCollector {
  private config: AWOConfig["traceCollection"];
  private dataDir: string;
  private activeTraces: Map<string, ActiveTrace> = new Map();
  private stats: AWOStats;

  /**
   * コンストラクタ
   * @summary TraceCollectorを初期化
   * @param config トレース収集設定
   * @param dataDir データディレクトリパス
   */
  constructor(
    config: AWOConfig["traceCollection"] = DEFAULT_AWO_CONFIG.traceCollection,
    dataDir: string = ".pi/data/awo/traces"
  ) {
    this.config = config;
    this.dataDir = dataDir;
    this.stats = {
      totalTraces: 0,
      totalToolCalls: 0,
      registeredMetaTools: 0,
      metaToolUsages: 0,
      estimatedLLMSavings: 0,
      averageTraceLength: 0,
      lastUpdated: Date.now(),
    };

    this.ensureDataDir();
    this.loadStats();
  }

  // ===========================================================================
  // パブリックメソッド
  // ===========================================================================

  /**
   * 新規トレースを開始
   * @summary トレース収集を開始
   * @param taskId タスクID
   * @param taskDescription タスク説明
   * @param agentType エージェント種別
   * @returns トレースID
   */
  startTrace(
    taskId: string,
    taskDescription: string,
    agentType: Trace["agentType"]
  ): string {
    if (!this.config.enabled) {
      return "";
    }

    const traceId = this.generateTraceId();
    const trace: Trace = {
      id: traceId,
      taskId,
      taskDescription,
      toolCalls: [],
      startTime: Date.now(),
      endTime: 0,
      success: false,
      agentType,
    };

    this.activeTraces.set(traceId, { trace, toolCalls: [] });

    return traceId;
  }

  /**
   * ツール呼び出しを記録
   * @summary トレースにツール呼び出しを追加
   * @param traceId トレースID
   * @param call ツール呼び出し
   */
  recordToolCall(traceId: string, call: Omit<ToolCall, "timestamp" | "executionId">): void {
    if (!this.config.enabled || !traceId) {
      return;
    }

    const active = this.activeTraces.get(traceId);
    if (!active) {
      console.warn(`[AWO] Trace not found: ${traceId}`);
      return;
    }

    const toolCall: ToolCall = {
      ...call,
      timestamp: Date.now(),
      executionId: this.generateExecutionId(),
    };

    active.toolCalls.push(toolCall);
    this.stats.totalToolCalls++;

    // ComprehensiveLoggerへのブリッジ - observabilityパイプラインに送信
    try {
      const logger = getLogger();
      logger.logToolCall(call.toolName, call.arguments || {}, {
        file: "awo/trace-collector.ts",
        line: 150,
        function: "recordToolCall",
      });
    } catch {
      // Observabilityへの送信エラーはトレース記録を阻害しない
    }
  }

  /**
   * トレースを完了
   * @summary トレースをファイナライズして保存
   * @param traceId トレースID
   * @param success 成功フラグ
   * @param metadata 追加メタデータ
   */
  finalizeTrace(
    traceId: string,
    success: boolean,
    metadata?: Record<string, unknown>
  ): void {
    if (!this.config.enabled || !traceId) {
      return;
    }

    const active = this.activeTraces.get(traceId);
    if (!active) {
      console.warn(`[AWO] Trace not found for finalization: ${traceId}`);
      return;
    }

    // トレースを完成
    active.trace.toolCalls = active.toolCalls;
    active.trace.endTime = Date.now();
    active.trace.success = success;
    if (metadata) {
      active.trace.metadata = metadata;
    }

    // 保存
    this.saveTrace(active.trace);

    // 統計更新
    this.stats.totalTraces++;
    this.updateAverageTraceLength(active.toolCalls.length);
    this.stats.lastUpdated = Date.now();
    this.saveStats();

    // アクティブトレースから削除
    this.activeTraces.delete(traceId);

    // 古いトレースを削除
    this.pruneOldTraces();
  }

  /**
   * トレースをキャンセル
   * @summary トレースを破棄
   * @param traceId トレースID
   */
  cancelTrace(traceId: string): void {
    if (!traceId) {
      return;
    }
    this.activeTraces.delete(traceId);
  }

  /**
   * トレース一覧を取得
   * @summary フィルタ条件に合致するトレースを返す
   * @param filter フィルタ条件
   * @returns トレース配列
   */
  getTraces(filter?: TraceFilter): Trace[] {
    const traces: Trace[] = [];
    const files = this.getTraceFiles();

    for (const file of files) {
      const trace = this.loadTrace(file);
      if (trace && this.matchesFilter(trace, filter)) {
        traces.push(trace);
      }
    }

    // 開始時刻でソート（降順）
    traces.sort((a, b) => b.startTime - a.startTime);

    return traces;
  }

  /**
   * 統計を取得
   * @summary AWO統計を返す
   * @returns 統計情報
   */
  getStats(): AWOStats {
    return { ...this.stats };
  }

  /**
   * Observabilityデータからトレースを復元
   * @summary ComprehensiveLoggerのイベントからトレースを再構築
   * @param query クエリ条件（省略時は直近7日間）
   * @returns 復元されたトレース数
   */
  restoreFromObservability(query?: ObservabilityQuery): number {
    if (!this.config.enabled) {
      return 0;
    }

    // デフォルトクエリ: 直近7日間のツールコールイベント
    const effectiveQuery: ObservabilityQuery = query || {
      eventTypes: ["tool_call", "tool_error"],
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    try {
      const result = queryObservabilityData(effectiveQuery);
      const events = result.events;

      // タスクIDでグループ化
      const byTask = new Map<string, typeof events>();

      for (const event of events) {
        if (!event.taskId) continue;
        const existing = byTask.get(event.taskId) || [];
        existing.push(event);
        byTask.set(event.taskId, existing);
      }

      let restoredCount = 0;

      // 各タスクをトレースとして復元
      for (const [taskId, taskEvents] of byTask) {
        // ツールコールを抽出
        const toolCalls: ToolCall[] = taskEvents
          .filter((e) => e.eventType === "tool_call" || e.eventType === "tool_error")
          .map((e) => {
            // ToolCallEvent型を想定
            const data = (e as { data: Record<string, unknown> }).data || {};
            return {
              toolName: (data.toolName as string) || "unknown",
              arguments: (data.params as Record<string, unknown>) || {},
              result: (e as { data: { output?: string } }).data?.output || undefined,
              timestamp: new Date(e.timestamp).getTime(),
              executionId: `restored-${Math.random().toString(36).substring(2, 9)}`,
              success: e.eventType !== "tool_error",
            };
          });

        if (toolCalls.length === 0) continue;

        // トレースを作成
        const trace: Trace = {
          id: `restored-${taskId}-${Date.now()}`,
          taskId,
          taskDescription: `Restored from observability (task: ${taskId})`,
          toolCalls,
          startTime: Math.min(...toolCalls.map((t) => t.timestamp)),
          endTime: Math.max(...toolCalls.map((t) => t.timestamp)),
          success: !taskEvents.some((e) => e.eventType === "tool_error"),
          agentType: "subagent", // デフォルト
          metadata: { restored: true, source: "observability" },
        };

        // 保存
        this.saveTrace(trace);
        restoredCount++;
      }

      // 統計更新
      if (restoredCount > 0) {
        this.stats.totalTraces += restoredCount;
        this.stats.lastUpdated = Date.now();
        this.saveStats();
      }

      return restoredCount;
    } catch (error) {
      console.warn("[AWO] Failed to restore from observability:", error);
      return 0;
    }
  }

  /**
   * トレース数を取得
   * @summary 保存済みトレース数を返す
   * @returns トレース数
   */
  getTraceCount(): number {
    return this.getTraceFiles().length;
  }

  /**
   * 全トレースを削除
   * @summary データをクリア
   */
  clearAll(): void {
    const files = this.getTraceFiles();
    for (const file of files) {
      fs.unlinkSync(file);
    }
    this.stats.totalTraces = 0;
    this.stats.totalToolCalls = 0;
    this.stats.averageTraceLength = 0;
    this.stats.lastUpdated = Date.now();
    this.saveStats();
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * データディレクトリを確保
   * @summary ディレクトリが存在しない場合は作成
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * トレースIDを生成
   * @summary 一意のトレースIDを生成
   * @returns トレースID
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 実行IDを生成
   * @summary 一意の実行IDを生成
   * @returns 実行ID
   */
  private generateExecutionId(): string {
    return `exec-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * トレースを保存
   * @summary JSONL形式でトレースを保存
   * @param trace トレース
   */
  private saveTrace(trace: Trace): void {
    const filename = path.join(this.dataDir, `${trace.id}.jsonl`);
    const line = JSON.stringify(trace) + "\n";
    fs.writeFileSync(filename, line, "utf-8");
  }

  /**
   * トレースを読み込み
   * @summary ファイルからトレースを読み込み
   * @param filepath ファイルパス
   * @returns トレースまたはnull
   */
  private loadTrace(filepath: string): Trace | null {
    try {
      const content = fs.readFileSync(filepath, "utf-8").trim();
      return JSON.parse(content) as Trace;
    } catch (error) {
      console.warn(`[AWO] Failed to load trace: ${filepath}`, error);
      return null;
    }
  }

  /**
   * トレースファイル一覧を取得
   * @summary データディレクトリ内のJSONLファイルを返す
   * @returns ファイルパス配列
   */
  private getTraceFiles(): string[] {
    if (!fs.existsSync(this.dataDir)) {
      return [];
    }

    return fs
      .readdirSync(this.dataDir)
      .filter((f) => f.startsWith("trace-") && f.endsWith(".jsonl"))
      .map((f) => path.join(this.dataDir, f));
  }

  /**
   * フィルタにマッチするか判定
   * @summary トレースがフィルタ条件を満たすか判定
   * @param trace トレース
   * @param filter フィルタ条件
   * @returns マッチするか
   */
  private matchesFilter(trace: Trace, filter?: TraceFilter): boolean {
    if (!filter) {
      return true;
    }

    if (filter.startTimeFrom && trace.startTime < filter.startTimeFrom) {
      return false;
    }

    if (filter.startTimeTo && trace.startTime > filter.startTimeTo) {
      return false;
    }

    if (filter.successOnly && !trace.success) {
      return false;
    }

    if (filter.agentType && trace.agentType !== filter.agentType) {
      return false;
    }

    if (filter.minToolCalls && trace.toolCalls.length < filter.minToolCalls) {
      return false;
    }

    return true;
  }

  /**
   * 古いトレースを削除
   * @summary 保持期間・最大数を超過したトレースを削除
   */
  private pruneOldTraces(): void {
    const files = this.getTraceFiles();

    // 保持期間チェック
    const cutoffTime = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    const toDelete: string[] = [];

    for (const file of files) {
      const trace = this.loadTrace(file);
      if (trace && trace.startTime < cutoffTime) {
        toDelete.push(file);
      }
    }

    // 最大数チェック
    const remainingFiles = files.filter((f) => !toDelete.includes(f));
    if (remainingFiles.length > this.config.maxTraces) {
      // 古い順にソート
      const sortedFiles = remainingFiles
        .map((f) => ({ file: f, trace: this.loadTrace(f) }))
        .filter((item) => item.trace !== null)
        .sort((a, b) => (a.trace?.startTime ?? 0) - (b.trace?.startTime ?? 0));

      const excessCount = remainingFiles.length - this.config.maxTraces;
      for (let i = 0; i < excessCount && i < sortedFiles.length; i++) {
        toDelete.push(sortedFiles[i].file);
      }
    }

    // 削除実行
    for (const file of toDelete) {
      try {
        fs.unlinkSync(file);
      } catch (error) {
        console.warn(`[AWO] Failed to delete trace: ${file}`, error);
      }
    }
  }

  /**
   * 統計を保存
   * @summary 統計をファイルに保存
   */
  private saveStats(): void {
    const statsPath = path.join(this.dataDir, "stats.json");
    fs.writeFileSync(statsPath, JSON.stringify(this.stats, null, 2), "utf-8");
  }

  /**
   * 統計を読み込み
   * @summary 保存された統計を読み込み
   */
  private loadStats(): void {
    const statsPath = path.join(this.dataDir, "stats.json");
    if (fs.existsSync(statsPath)) {
      try {
        const content = fs.readFileSync(statsPath, "utf-8");
        const saved = JSON.parse(content) as Partial<AWOStats>;
        this.stats = { ...this.stats, ...saved };
      } catch (error) {
        console.warn("[AWO] Failed to load stats", error);
      }
    }
  }

  /**
   * 平均トレース長を更新
   * @summary 移動平均で平均トレース長を更新
   * @param newLength 新しいトレース長
   */
  private updateAverageTraceLength(newLength: number): void {
    const n = this.stats.totalTraces;
    this.stats.averageTraceLength =
      (this.stats.averageTraceLength * (n - 1) + newLength) / n;
  }
}

// =============================================================================
// グローバルインスタンス
// =============================================================================

let globalCollector: TraceCollector | null = null;

/**
 * グローバルトレースコレクターを取得
 * @summary シングルトンのTraceCollectorを返す
 * @param config 設定（初回のみ使用）
 * @returns TraceCollectorインスタンス
 */
export function getGlobalTraceCollector(config?: AWOConfig["traceCollection"]): TraceCollector {
  if (!globalCollector) {
    globalCollector = new TraceCollector(config);
  }
  return globalCollector;
}

/**
 * グローバルトレースコレクターをリセット
 * @summary テスト用にグローバルインスタンスをリセット
 */
export function resetGlobalTraceCollector(): void {
  globalCollector = null;
}
