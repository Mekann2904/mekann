/**
 * @abdd.meta
 * path: .pi/lib/observability/correlation-tracker.ts
 * role: イベント間の相関関係を追跡・記録
 * why: タスク→ツール呼び出し→サブエージェント呼び出しの関連付けを行い、エンドツーエンドの可視性を提供するため
 * related: .pi/lib/observability/async-context.ts, .pi/lib/observability/unified-logger.ts
 * public_api: CorrelationTracker, CorrelationEvent, getCorrelationTracker
 * invariants: 相関関係は有向非巡回グラフ（DAG）を形成する
 * side_effects: 相関ログファイルへの書き込み
 * failure_modes: 循環参照の検出と防止
 * @abdd.explain
 * overview: タスク実行チェーン全体のイベント相関を追跡するシステム
 * what_it_does:
 *   - タスク開始から完了までの全イベントを相関IDで紐付け
 *   - 親子関係の追跡（タスク→ツール→サブエージェント）
 *   - イベントグラフの構築とクエリ
 *   - エンドツーエンドの実行パス可視化
 * why_it_exists:
 *   - 個別のログイベントから実行フローを再構築するため
 *   - パフォーマンス分析とボトルネック特定のため
 *   - エラー発生時の原因追跡のため
 * scope:
 *   in: イベント（タスク/ツール/サブエージェント/LLM呼び出し）
 *   out: 相関グラフ、実行パス、統計
 */

import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLogger } from "./unified-logger.js";
import { getCurrentTraceContext, getAsyncContext } from "./async-context.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 相関イベント種別
 */
export type CorrelationEventType =
  | "task_start"
  | "task_end"
  | "tool_call_start"
  | "tool_call_end"
  | "subagent_start"
  | "subagent_end"
  | "llm_call_start"
  | "llm_call_end"
  | "mcp_call_start"
  | "mcp_call_end"
  | "error";

/**
 * 相関イベント
 * @summary イベント記録
 */
export interface CorrelationEvent {
  /** イベントID（自動生成） */
  eventId: string;
  /** 相関ID（同じ実行フロー内で共有） */
  correlationId: string;
  /** トレースID */
  traceId?: string;
  /** 親イベントID */
  parentEventId?: string;
  /** イベント種別 */
  eventType: CorrelationEventType;
  /** イベント名 */
  name: string;
  /** タイムスタンプ（ISO 8601） */
  timestamp: string;
  /** 実行時間（ミリ秒、終了イベントのみ） */
  durationMs?: number;
  /** 成功フラグ */
  success?: boolean;
  /** エラーメッセージ */
  errorMessage?: string;
  /** イベント詳細データ */
  data?: Record<string, unknown>;
  /** ソース位置 */
  source?: {
    file?: string;
    line?: number;
    function?: string;
  };
}

/**
 * 相関リンク（イベント間の関係）
 * @summary 相関リンク
 */
export interface CorrelationLink {
  /** 親イベントID */
  parentEventId: string;
  /** 子イベントID */
  childEventId: string;
  /** 関係種別 */
  relationship: "triggers" | "calls" | "spawns" | "delegates";
  /** リンク作成時刻 */
  timestamp: string;
}

/**
 * 実行パス（エンドツーエンド）
 * @summary 実行パス
 */
export interface ExecutionPath {
  /** 相関ID */
  correlationId: string;
  /** ルートイベントID */
  rootEventId: string;
  /** 総実行時間（ミリ秒） */
  totalDurationMs: number;
  /** イベント数 */
  eventCount: number;
  /** イベントパス */
  path: CorrelationEvent[];
  /** 成功率 */
  successRate: number;
  /** エラー数 */
  errorCount: number;
}

/**
 * 相関統計
 * @summary 統計情報
 */
export interface CorrelationStats {
  /** 期間開始 */
  periodStart: string;
  /** 期間終了 */
  periodEnd: string;
  /** 総イベント数 */
  totalEvents: number;
  /** 総相関ID数（ユニークな実行フロー数） */
  uniqueCorrelations: number;
  /** イベント種別ごとの統計 */
  byEventType: Record<CorrelationEventType, { count: number; avgDurationMs?: number; successRate?: number }>;
  /** 平均イベント数/相関 */
  avgEventsPerCorrelation: number;
  /** 平均実行時間 */
  avgDurationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CORRELATION_DIR = join(homedir(), ".pi-metrics");
const MAX_EVENTS_IN_MEMORY = 5000;
const MAX_LINKS_IN_MEMORY = 10000;

// ============================================================================
// Correlation Tracker
// ============================================================================

/**
 * 相関追跡クラス
 * @summary 相関追跡
 */
export class CorrelationTracker {
  private events: Map<string, CorrelationEvent> = new Map();
  private links: CorrelationLink[] = [];
  private correlationDir: string;
  private currentCorrelationId: string | null = null;
  private eventStack: string[] = [];
  private currentDate: string;

  /**
   * トラッカーを初期化
   * @summary 初期化
   * @param correlationDir 保存ディレクトリ
   */
  constructor(correlationDir: string = DEFAULT_CORRELATION_DIR) {
    this.correlationDir = correlationDir;
    this.currentDate = this.getDateStr();
    this.ensureDir();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * 新しい相関IDを生成
   * @summary 相関ID生成
   * @param prefix プレフィックス
   * @returns 相関ID
   */
  generateCorrelationId(prefix = "corr"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * 相関を開始（新しい相関IDでコンテキストを設定）
   * @summary 相関開始
   * @param name 相関名
   * @param data 追加データ
   * @returns 相関ID
   */
  startCorrelation(name: string, data?: Record<string, unknown>): string {
    const correlationId = this.generateCorrelationId();
    this.currentCorrelationId = correlationId;

    const event = this.createEvent({
      eventType: "task_start",
      name,
      data,
    });

    this.events.set(event.eventId, event);
    this.eventStack.push(event.eventId);

    getLogger().debug("Correlation started", { correlationId, name });

    return correlationId;
  }

  /**
   * 相関を終了
   * @summary 相関終了
   * @param correlationId 相関ID
   * @param success 成功フラグ
   * @param errorMessage エラーメッセージ
   */
  endCorrelation(correlationId: string, success = true, errorMessage?: string): void {
    const rootEvent = this.eventStack[0];
    if (rootEvent) {
      const event = this.events.get(rootEvent);
      if (event) {
        const endTime = new Date();
        const durationMs = endTime.getTime() - new Date(event.timestamp).getTime();

        const endEvent = this.createEvent({
          eventType: "task_end",
          name: `${event.name} (end)`,
          parentEventId: rootEvent,
          durationMs,
          success,
          errorMessage,
        });

        this.events.set(endEvent.eventId, endEvent);
        this.addLink(rootEvent, endEvent.eventId, "triggers");
      }
    }

    this.eventStack = [];
    if (this.currentCorrelationId === correlationId) {
      this.currentCorrelationId = null;
    }

    getLogger().debug("Correlation ended", { correlationId, success });
  }

  /**
   * ツール呼び出しを記録
   * @summary ツール呼び出し記録
   */
  recordToolCall(params: {
    toolName: string;
    arguments?: Record<string, unknown>;
    parentEventId?: string;
  }): { eventId: string; end: (success: boolean, result?: unknown, error?: string) => void } {
    const startEvent = this.createEvent({
      eventType: "tool_call_start",
      name: params.toolName,
      parentEventId: params.parentEventId ?? this.getCurrentParentId(),
      data: { arguments: params.arguments },
    });

    this.events.set(startEvent.eventId, startEvent);
    if (params.parentEventId) {
      this.addLink(params.parentEventId, startEvent.eventId, "calls");
    }
    this.eventStack.push(startEvent.eventId);

    const startTime = Date.now();

    return {
      eventId: startEvent.eventId,
      end: (success: boolean, result?: unknown, error?: string) => {
        const durationMs = Date.now() - startTime;
        const endEvent = this.createEvent({
          eventType: "tool_call_end",
          name: `${params.toolName} (end)`,
          parentEventId: startEvent.eventId,
          durationMs,
          success,
          errorMessage: error,
          data: { result: this.sanitizeResult(result) },
        });

        this.events.set(endEvent.eventId, endEvent);
        this.addLink(startEvent.eventId, endEvent.eventId, "triggers");

        // スタックから削除
        const idx = this.eventStack.indexOf(startEvent.eventId);
        if (idx >= 0) this.eventStack.splice(idx, 1);
      },
    };
  }

  /**
   * サブエージェント呼び出しを記録
   * @summary サブエージェント記録
   */
  recordSubagentCall(params: {
    subagentId: string;
    agentType: string;
    task: string;
    parentEventId?: string;
  }): { eventId: string; end: (success: boolean, error?: string) => void } {
    const startEvent = this.createEvent({
      eventType: "subagent_start",
      name: `${params.agentType}:${params.subagentId}`,
      parentEventId: params.parentEventId ?? this.getCurrentParentId(),
      data: { task: params.task },
    });

    this.events.set(startEvent.eventId, startEvent);
    if (params.parentEventId) {
      this.addLink(params.parentEventId, startEvent.eventId, "delegates");
    }
    this.eventStack.push(startEvent.eventId);

    const startTime = Date.now();

    return {
      eventId: startEvent.eventId,
      end: (success: boolean, error?: string) => {
        const durationMs = Date.now() - startTime;
        const endEvent = this.createEvent({
          eventType: "subagent_end",
          name: `${params.agentType}:${params.subagentId} (end)`,
          parentEventId: startEvent.eventId,
          durationMs,
          success,
          errorMessage: error,
        });

        this.events.set(endEvent.eventId, endEvent);
        this.addLink(startEvent.eventId, endEvent.eventId, "triggers");

        const idx = this.eventStack.indexOf(startEvent.eventId);
        if (idx >= 0) this.eventStack.splice(idx, 1);
      },
    };
  }

  /**
   * LLM呼び出しを記録
   * @summary LLM呼び出し記録
   */
  recordLLMCall(params: {
    provider: string;
    model: string;
    parentEventId?: string;
  }): { eventId: string; end: (success: boolean, tokens?: { input: number; output: number }, error?: string) => void } {
    const startEvent = this.createEvent({
      eventType: "llm_call_start",
      name: `${params.provider}/${params.model}`,
      parentEventId: params.parentEventId ?? this.getCurrentParentId(),
    });

    this.events.set(startEvent.eventId, startEvent);
    if (params.parentEventId) {
      this.addLink(params.parentEventId, startEvent.eventId, "calls");
    }

    const startTime = Date.now();

    return {
      eventId: startEvent.eventId,
      end: (success: boolean, tokens?: { input: number; output: number }, error?: string) => {
        const durationMs = Date.now() - startTime;
        const endEvent = this.createEvent({
          eventType: "llm_call_end",
          name: `${params.provider}/${params.model} (end)`,
          parentEventId: startEvent.eventId,
          durationMs,
          success,
          errorMessage: error,
          data: { tokens },
        });

        this.events.set(endEvent.eventId, endEvent);
        this.addLink(startEvent.eventId, endEvent.eventId, "triggers");
      },
    };
  }

  /**
   * エラーを記録
   * @summary エラー記録
   * @param error エラーオブジェクト
   * @param parentEventId 親イベントID
   */
  recordError(error: Error, parentEventId?: string): void {
    const event = this.createEvent({
      eventType: "error",
      name: error.name,
      parentEventId: parentEventId ?? this.getCurrentParentId(),
      success: false,
      errorMessage: error.message,
      data: { stack: error.stack },
    });

    this.events.set(event.eventId, event);
    getLogger().error("Error recorded in correlation", error, { eventId: event.eventId });
  }

  /**
   * 実行パスを取得
   * @summary 実行パス取得
   * @param correlationId 相関ID
   * @returns 実行パス
   */
  getExecutionPath(correlationId: string): ExecutionPath | null {
    const events = Array.from(this.events.values())
      .filter((e) => e.correlationId === correlationId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (events.length === 0) return null;

    const rootEvent = events[0];
    if (!rootEvent) return null;

    const endEvents = events.filter((e) => e.eventType === "task_end");
    const totalDurationMs = endEvents.length > 0 && endEvents[0]?.durationMs
      ? endEvents[0].durationMs
      : 0;

    const errorCount = events.filter((e) => !e.success).length;
    const successRate = events.length > 0 ? (events.length - errorCount) / events.length : 1;

    return {
      correlationId,
      rootEventId: rootEvent.eventId,
      totalDurationMs,
      eventCount: events.length,
      path: events,
      successRate,
      errorCount,
    };
  }

  /**
   * 統計を取得
   * @summary 統計取得
   * @param periodMs 期間（ミリ秒）
   * @returns 統計情報
   */
  getStats(periodMs: number = 3600000): CorrelationStats {
    const now = Date.now();
    const periodStart = new Date(now - periodMs).toISOString();
    const periodEnd = new Date(now).toISOString();

    const recentEvents = Array.from(this.events.values())
      .filter((e) => new Date(e.timestamp).getTime() >= now - periodMs);

    const uniqueCorrelations = new Set(recentEvents.map((e) => e.correlationId)).size;

    // イベント種別ごとの統計
    const byEventType: Record<string, { count: number; avgDurationMs?: number; successRate?: number }> = {};
    for (const event of recentEvents) {
      if (!byEventType[event.eventType]) {
        byEventType[event.eventType] = { count: 0 };
      }
      byEventType[event.eventType].count++;
    }

    // 平均実行時間と成功率を計算
    for (const [type, stats] of Object.entries(byEventType)) {
      const typeEvents = recentEvents.filter((e) => e.eventType === type && e.durationMs !== undefined);
      if (typeEvents.length > 0) {
        stats.avgDurationMs = typeEvents.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / typeEvents.length;
      }

      const endEvents = recentEvents.filter((e) => e.eventType === type && e.success !== undefined);
      if (endEvents.length > 0) {
        stats.successRate = endEvents.filter((e) => e.success).length / endEvents.length;
      }
    }

    const totalDuration = recentEvents
      .filter((e) => e.durationMs !== undefined)
      .reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

    return {
      periodStart,
      periodEnd,
      totalEvents: recentEvents.length,
      uniqueCorrelations,
      byEventType: byEventType as CorrelationStats["byEventType"],
      avgEventsPerCorrelation: uniqueCorrelations > 0 ? recentEvents.length / uniqueCorrelations : 0,
      avgDurationMs: recentEvents.length > 0 ? totalDuration / recentEvents.length : 0,
    };
  }

  /**
   * データをフラッシュ
   * @summary フラッシュ
   */
  flush(): void {
    if (this.events.size === 0) return;

    const events = Array.from(this.events.values());
    const links = [...this.links];

    // メモリクリア（最新のものを保持）
    if (this.events.size > MAX_EVENTS_IN_MEMORY) {
      const toDelete = Array.from(this.events.keys()).slice(0, this.events.size - MAX_EVENTS_IN_MEMORY);
      for (const id of toDelete) {
        this.events.delete(id);
      }
    }

    if (this.links.length > MAX_LINKS_IN_MEMORY) {
      this.links = this.links.slice(-MAX_LINKS_IN_MEMORY);
    }

    // ファイルに保存
    try {
      const eventsFile = this.getEventsFilePath();
      const linksFile = this.getLinksFilePath();

      const eventsLines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      const linksLines = links.map((l) => JSON.stringify(l)).join("\n") + "\n";

      appendFileSync(eventsFile, eventsLines, "utf-8");
      appendFileSync(linksFile, linksLines, "utf-8");
    } catch (err) {
      getLogger().error("Failed to flush correlation data", err as Error);
    }
  }

  /**
   * 現在の相関IDを取得
   * @summary 相関ID取得
   */
  getCurrentCorrelationId(): string | null {
    return this.currentCorrelationId;
  }

  /**
   * 現在の親イベントIDを取得
   * @summary 親イベントID取得
   */
  getCurrentParentId(): string | undefined {
    return this.eventStack[this.eventStack.length - 1];
  }

  // ============================================
  // Private Methods
  // ============================================

  private createEvent(params: {
    eventType: CorrelationEventType;
    name: string;
    parentEventId?: string;
    durationMs?: number;
    success?: boolean;
    errorMessage?: string;
    data?: Record<string, unknown>;
  }): CorrelationEvent {
    const context = getAsyncContext();
    const traceContext = getCurrentTraceContext();

    return {
      eventId: this.generateEventId(),
      correlationId: this.currentCorrelationId ?? context?.taskId ?? this.generateCorrelationId(),
      traceId: traceContext?.traceId,
      parentEventId: params.parentEventId,
      eventType: params.eventType,
      name: params.name,
      timestamp: new Date().toISOString(),
      durationMs: params.durationMs,
      success: params.success,
      errorMessage: params.errorMessage,
      data: params.data,
    };
  }

  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    return `evt_${timestamp}_${random}`;
  }

  private addLink(parentEventId: string, childEventId: string, relationship: CorrelationLink["relationship"]): void {
    this.links.push({
      parentEventId,
      childEventId,
      relationship,
      timestamp: new Date().toISOString(),
    });
  }

  private sanitizeResult(result: unknown): unknown {
    if (result === undefined) return undefined;
    if (typeof result === "string" && result.length > 1000) {
      return result.slice(0, 1000) + "... (truncated)";
    }
    if (typeof result === "object" && result !== null) {
      try {
        const str = JSON.stringify(result);
        if (str.length > 10000) {
          return { truncated: true, size: str.length };
        }
      } catch {
        return { unserializable: true };
      }
    }
    return result;
  }

  private ensureDir(): void {
    if (!existsSync(this.correlationDir)) {
      mkdirSync(this.correlationDir, { recursive: true });
    }
  }

  private getEventsFilePath(): string {
    return join(this.correlationDir, `correlation-events-${this.currentDate}.jsonl`);
  }

  private getLinksFilePath(): string {
    return join(this.correlationDir, `correlation-links-${this.currentDate}.jsonl`);
  }

  private getDateStr(): string {
    return new Date().toISOString().slice(0, 10);
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalTracker: CorrelationTracker | null = null;

/**
 * グローバルトラッカーを取得
 * @summary トラッカー取得
 */
export function getCorrelationTracker(): CorrelationTracker {
  if (!globalTracker) {
    globalTracker = new CorrelationTracker();
  }
  return globalTracker;
}

/**
 * トラッカーをリセット
 * @summary リセット
 */
export function resetCorrelationTracker(): void {
  if (globalTracker) {
    globalTracker.flush();
  }
  globalTracker = null;
}
