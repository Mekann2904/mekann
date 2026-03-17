/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/hooks/use-sse.ts
 * @role SSE接続管理フック
 * @why リアルタイムイベントの購読
 * @related atoms/index.ts, api/client.ts
 * @public_api useSSE, useSSEConnection
 * @invariants 自動再接続あり
 * @side_effects SSE接続維持
 * @failure_modes 接続切断
 *
 * @abdd.explain
 * @overview Server-Sent Events接続を管理するフック
 * @what_it_does SSE接続、自動再接続、イベント処理
 * @why_it_exists リアルタイム更新の実現
 * @scope(in) なし
 * @scope(out) 接続状態、イベントデータ
 */

import { useEffect, useCallback, useRef } from "preact/hooks";
import { useAtom, useSetAtom } from "jotai";
import {
  sseConnectedAtom,
  sseLastReceivedAtom,
  instancesAtom,
  notificationAtom,
} from "../atoms/index.js";
import type { InstanceInfo } from "../../schemas/instance.schema.js";
import {
  validateExperimentEvent,
  type ExperimentStartEvent,
  type ExperimentBaselineEvent,
  type ExperimentRunEvent,
  type ExperimentImprovedEvent,
  type ExperimentRegressedEvent,
  type ExperimentTimeoutEvent,
} from "../../schemas/experiment.schema.js";

// ============================================================================
// イベントバッチング（バックプレッシャー）
// ============================================================================

/**
 * バッチ処理対象の実験イベント型
 */
type BatchableExperimentEvent = {
  eventType: "experiment_start" | "experiment_baseline" | "experiment_run" | "experiment_improved" | "experiment_regressed" | "experiment_timeout";
  data: ExperimentStartEvent | ExperimentBaselineEvent | ExperimentRunEvent | ExperimentImprovedEvent | ExperimentRegressedEvent | ExperimentTimeoutEvent;
  timestamp: number;
};

/**
 * イベントバッチャー設定
 */
interface EventBatcherConfig {
  /** バッチウィンドウ（ミリ秒）。デフォルト: 16ms（60fps） */
  batchWindowMs: number;
  /** 最大バッチサイズ。これを超えたら即座にフラッシュ */
  maxBatchSize: number;
}

const DEFAULT_BATCHER_CONFIG: EventBatcherConfig = {
  batchWindowMs: 16, // 60fps
  maxBatchSize: 50,  // 最大50イベント
};

/**
 * 実験イベントのバッチャー
 * requestAnimationFrameベースでイベントをバッチ処理し、UIスレッドスタベーションを防ぐ
 */
class ExperimentEventBatcher {
  private queue: BatchableExperimentEvent[] = [];
  private rafId: number | null = null;
  private lastFlushTime: number = 0;
  private config: EventBatcherConfig;

  // 統計情報（デバッグ・監視用）
  private stats = {
    totalEventsReceived: 0,
    totalBatchesFlushed: 0,
    maxQueueSize: 0,
  };

  constructor(config: Partial<EventBatcherConfig> = {}) {
    this.config = { ...DEFAULT_BATCHER_CONFIG, ...config };
  }

  /**
   * イベントをキューに追加し、バッチ処理をスケジュール
   */
  enqueue(
    eventType: BatchableExperimentEvent["eventType"],
    data: BatchableExperimentEvent["data"],
    flushCallback: (events: BatchableExperimentEvent[]) => void
  ): void {
    const event: BatchableExperimentEvent = {
      eventType,
      data,
      timestamp: Date.now(),
    };

    this.queue.push(event);
    this.stats.totalEventsReceived++;
    this.stats.maxQueueSize = Math.max(this.stats.maxQueueSize, this.queue.length);

    // 最大サイズに達したら即座にフラッシュ
    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush(flushCallback);
      return;
    }

    // まだRAFがスケジュールされていない場合はスケジュール
    if (this.rafId === null) {
      this.scheduleFlush(flushCallback);
    }
  }

  /**
   * requestAnimationFrameでフラッシュをスケジュール
   */
  private scheduleFlush(flushCallback: (events: BatchableExperimentEvent[]) => void): void {
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.flush(flushCallback);
    });
  }

  /**
   * キューをフラッシュしてコールバックに渡す
   */
  private flush(flushCallback: (events: BatchableExperimentEvent[]) => void): void {
    if (this.queue.length === 0) {
      return;
    }

    const events = this.queue;
    this.queue = [];
    this.lastFlushTime = Date.now();
    this.stats.totalBatchesFlushed++;

    // コールバックにイベントを渡す
    flushCallback(events);
  }

  /**
   * バッチャーを破棄
   */
  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.queue = [];
  }

  /**
   * 統計情報を取得
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }
}

/**
 * 安全なJSON解析
 */
function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const parseError = error instanceof Error ? error : new Error(String(error));
    console.error(`[SSE] JSON parse error in ${context}:`, parseError);
    return fallback;
  }
}

/**
 * イベントシーケンス追跡用の状態
 */
interface EventSequenceState {
  /** イベントタイプごとの最終処理タイムスタンプ */
  lastProcessedTimestamp: Map<string, number>;
  /** 実験ラベルごとの現在のイテレーション */
  experimentIterations: Map<string, number>;
}

/**
 * イベントが古いかどうかを判定
 */
function isEventStale(
  state: EventSequenceState,
  eventType: string,
  eventTimestamp?: string
): boolean {
  if (!eventTimestamp) {
    return false; // タイムスタンプがない場合は処理を許可
  }
  
  const eventTime = new Date(eventTimestamp).getTime();
  const lastTime = state.lastProcessedTimestamp.get(eventType);
  
  if (lastTime !== undefined && eventTime < lastTime) {
    console.warn(`[SSE] Rejecting stale event ${eventType}: ${eventTime} < ${lastTime}`);
    return true;
  }
  
  return false;
}

/**
 * 実験イベントのイテレーションチェック
 */
function isExperimentEventValid(
  state: EventSequenceState,
  data: { label?: string; iteration?: number },
  eventType: string
): boolean {
  const label = data.label;
  const iteration = data.iteration ?? 0;
  
  if (!label) {
    return true; // ラベルがない場合は許可
  }
  
  const currentIteration = state.experimentIterations.get(label) ?? -1;
  
  // experiment_start は常に許可（リセット）
  if (eventType === "experiment_start") {
    return true;
  }
  
  // その他の実験イベントは、現在のイテレーション以降のみ許可
  if (iteration < currentIteration) {
    console.warn(
      `[SSE] Rejecting out-of-order experiment event ${eventType} for ${label}: ` +
      `iteration ${iteration} < current ${currentIteration}`
    );
    return false;
  }
  
  return true;
}

/**
 * SSE イベントハンドラー
 */
interface SSEEventHandlers {
  onConnected?: (clientId: string) => void;
  onDisconnected?: () => void;
  onInstancesUpdate?: (instances: InstanceInfo[]) => void;
  onContextUpdate?: (data: { pid: number; timestamp: string; input: number; output: number }) => void;
  onError?: (error: Error) => void;
  onExperimentStart?: (data: ExperimentStartEvent) => void;
  onExperimentBaseline?: (data: ExperimentBaselineEvent) => void;
  onExperimentRun?: (data: ExperimentRunEvent) => void;
  onExperimentImproved?: (data: ExperimentImprovedEvent) => void;
  onExperimentRegressed?: (data: ExperimentRegressedEvent) => void;
  onExperimentTimeout?: (data: ExperimentTimeoutEvent) => void;
}

/**
 * SSE 接続フック
 */
export function useSSE(handlers?: SSEEventHandlers) {
  const [isConnected, setIsConnected] = useAtom(sseConnectedAtom);
  const setLastReceived = useSetAtom(sseLastReceivedAtom);
  const setInstances = useSetAtom(instancesAtom);
  const setNotification = useSetAtom(notificationAtom);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // サーバーシャットダウンフラグ（意図的なシャットダウン時は再接続しない）
  const serverShutdownRef = useRef(false);

  // イベントシーケンス追跡用の状態
  const sequenceStateRef = useRef<EventSequenceState>({
    lastProcessedTimestamp: new Map(),
    experimentIterations: new Map(),
  });

  // 実験イベントバッチャー（バックプレッシャー）
  const batcherRef = useRef<ExperimentEventBatcher | null>(null);
  const pendingExperimentHandlersRef = useRef<
    Array<{ eventType: BatchableExperimentEvent["eventType"]; handler: () => void }>
  >([]);

  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  /**
   * イベントを処理し、シーケンス状態を更新
   */
  const processEvent = useCallback((eventType: string, data: { serverTimestamp?: string }, handler: () => void) => {
    const state = sequenceStateRef.current;
    
    // タイムスタンプベースの staleness チェック
    if (isEventStale(state, eventType, data.serverTimestamp)) {
      return; // 古いイベントを拒否
    }
    
    // イベントを処理
    handler();
    
    // シーケンス状態を更新
    if (data.serverTimestamp) {
      state.lastProcessedTimestamp.set(eventType, new Date(data.serverTimestamp).getTime());
    }
  }, []);

  /**
   * 実験イベントを処理し、イテレーションを追跡（バッチ処理対応）
   */
  const processExperimentEvent = useCallback(
    (
      eventType: BatchableExperimentEvent["eventType"],
      data: { label?: string; iteration?: number; serverTimestamp?: string },
      eventData: BatchableExperimentEvent["data"],
      handler: () => void
    ) => {
      const state = sequenceStateRef.current;

      // タイムスタンプベースの staleness チェック
      if (isEventStale(state, eventType, data.serverTimestamp)) {
        return;
      }

      // イテレーションベースのチェック
      if (!isExperimentEventValid(state, data, eventType)) {
        return;
      }

      // バッチャーが初期化されていない場合は同期的に処理（フォールバック）
      const batcher = batcherRef.current;
      if (!batcher) {
        // シーケンス状態を更新
        if (data.serverTimestamp) {
          state.lastProcessedTimestamp.set(eventType, new Date(data.serverTimestamp).getTime());
        }
        if (data.label && data.iteration !== undefined) {
          state.experimentIterations.set(data.label, data.iteration);
        }
        if (eventType === "experiment_start" && data.label) {
          state.experimentIterations.set(data.label, 0);
        }
        handler();
        return;
      }

      // ハンドラを一時保存（バッチフラッシュ時に実行）
      pendingExperimentHandlersRef.current.push({ eventType, handler });

      // バッチャーにエンキュー
      batcher.enqueue(eventType, eventData, (events) => {
        // バッチフラッシュ時の処理
        const now = Date.now();

        // 最後のイベントのタイムスタンプのみをsetLastReceivedに反映
        setLastReceived(now);

        // シーケンス状態を更新（最後のイベントのみ）
        const lastEvent = events[events.length - 1];
        if (lastEvent) {
          const lastData = lastEvent.data as { label?: string; iteration?: number; serverTimestamp?: string };
          if (lastData.serverTimestamp) {
            state.lastProcessedTimestamp.set(lastEvent.eventType, new Date(lastData.serverTimestamp).getTime());
          }
          if (lastData.label && lastData.iteration !== undefined) {
            state.experimentIterations.set(lastData.label, lastData.iteration);
          }
          if (lastEvent.eventType === "experiment_start" && lastData.label) {
            state.experimentIterations.set(lastData.label, 0);
          }
        }

        // 保留中のハンドラを実行
        const handlers = [...pendingExperimentHandlersRef.current];
        pendingExperimentHandlersRef.current = [];
        for (const h of handlers) {
          h.handler();
        }
      });
    },
    [setLastReceived]
  );

  /**
   * 再接続
   */
  const reconnect = useCallback(() => {
    // 意図的なサーバーシャットダウン時は再接続しない
    if (serverShutdownRef.current) {
      console.log("[SSE] Server shutdown detected, skipping reconnection");
      return;
    }

    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      setNotification({
        message: "SSE接続を復旧できませんでした",
        type: "error",
      });
      return;
    }

    const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
    reconnectAttemptsRef.current++;

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [setNotification]);

  /**
   * 接続開始
   */
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // 新しい接続開始時にシャットダウンフラグをリセット
    serverShutdownRef.current = false;

    // 実験イベントバッチャーを初期化（バックプレッシャー）
    if (!batcherRef.current) {
      batcherRef.current = new ExperimentEventBatcher({
        batchWindowMs: 16, // 60fps
        maxBatchSize: 50,
      });
    }

    const eventSource = new EventSource("/api/sse");
    eventSourceRef.current = eventSource;

    // 接続成功
    eventSource.addEventListener("connected", (e: MessageEvent) => {
      const data = safeJsonParse<{ clientId?: string; serverTimestamp?: string }>(e.data, {}, "connected");
      processEvent("connected", data, () => {
        setIsConnected(true);
        setLastReceived(Date.now());
        reconnectAttemptsRef.current = 0;
        handlers?.onConnected?.(data.clientId ?? "");
      });
    });

    // インスタンス更新
    eventSource.addEventListener("instances-update", (e: MessageEvent) => {
      const data = safeJsonParse<{ instances: InstanceInfo[]; serverTimestamp?: string }>(
        e.data,
        { instances: [] },
        "instances-update"
      );
      processEvent("instances-update", data, () => {
        setLastReceived(Date.now());
        setInstances(data.instances);
        handlers?.onInstancesUpdate?.(data.instances);
      });
    });

    // コンテキスト更新
    eventSource.addEventListener("context-update", (e: MessageEvent) => {
      const data = safeJsonParse<{ pid: number; timestamp: string; input: number; output: number; serverTimestamp?: string }>(
        e.data,
        { pid: 0, timestamp: "", input: 0, output: 0 },
        "context-update"
      );
      processEvent("context-update", data, () => {
        setLastReceived(Date.now());
        handlers?.onContextUpdate?.(data);
      });
    });

    // ハートビート
    eventSource.addEventListener("heartbeat", () => {
      setLastReceived(Date.now());
    });

    // サーバーシャットダウン
    eventSource.addEventListener("server_shutdown", (e: MessageEvent) => {
      const data = safeJsonParse<{ reason?: string; timestamp?: number }>(
        e.data,
        {},
        "server_shutdown"
      );
      console.log("[SSE] Server shutdown received:", data.reason);
      serverShutdownRef.current = true;
      setIsConnected(false);
      handlers?.onDisconnected?.();
    });

    // 実験開始
    eventSource.addEventListener("experiment_start", (e: MessageEvent) => {
      const rawData = safeJsonParse<unknown>(e.data, null, "experiment_start");
      if (rawData === null) {
        handlers?.onError?.(new Error("[SSE] Failed to parse experiment_start event"));
        return;
      }
      const result = validateExperimentEvent("experiment_start", rawData);
      if (!result.success || !result.data) {
        handlers?.onError?.(new Error(`[SSE] ${result.error}`));
        return;
      }
      const eventData = result.data as ExperimentStartEvent;
      processExperimentEvent("experiment_start", eventData, eventData, () => {
        handlers?.onExperimentStart?.(eventData);
      });
    });

    // 実験ベースライン
    eventSource.addEventListener("experiment_baseline", (e: MessageEvent) => {
      const rawData = safeJsonParse<unknown>(e.data, null, "experiment_baseline");
      if (rawData === null) {
        handlers?.onError?.(new Error("[SSE] Failed to parse experiment_baseline event"));
        return;
      }
      const result = validateExperimentEvent("experiment_baseline", rawData);
      if (!result.success || !result.data) {
        handlers?.onError?.(new Error(`[SSE] ${result.error}`));
        return;
      }
      const eventData = result.data as ExperimentBaselineEvent;
      processExperimentEvent("experiment_baseline", eventData, eventData, () => {
        handlers?.onExperimentBaseline?.(eventData);
      });
    });

    // 実験実行
    eventSource.addEventListener("experiment_run", (e: MessageEvent) => {
      const rawData = safeJsonParse<unknown>(e.data, null, "experiment_run");
      if (rawData === null) {
        handlers?.onError?.(new Error("[SSE] Failed to parse experiment_run event"));
        return;
      }
      const result = validateExperimentEvent("experiment_run", rawData);
      if (!result.success || !result.data) {
        handlers?.onError?.(new Error(`[SSE] ${result.error}`));
        return;
      }
      const eventData = result.data as ExperimentRunEvent;
      processExperimentEvent("experiment_run", eventData, eventData, () => {
        handlers?.onExperimentRun?.(eventData);
      });
    });

    // 実験改善
    eventSource.addEventListener("experiment_improved", (e: MessageEvent) => {
      const rawData = safeJsonParse<unknown>(e.data, null, "experiment_improved");
      if (rawData === null) {
        handlers?.onError?.(new Error("[SSE] Failed to parse experiment_improved event"));
        return;
      }
      const result = validateExperimentEvent("experiment_improved", rawData);
      if (!result.success || !result.data) {
        handlers?.onError?.(new Error(`[SSE] ${result.error}`));
        return;
      }
      const eventData = result.data as ExperimentImprovedEvent;
      processExperimentEvent("experiment_improved", eventData, eventData, () => {
        handlers?.onExperimentImproved?.(eventData);
      });
    });

    // 実験退行
    eventSource.addEventListener("experiment_regressed", (e: MessageEvent) => {
      const rawData = safeJsonParse<unknown>(e.data, null, "experiment_regressed");
      if (rawData === null) {
        handlers?.onError?.(new Error("[SSE] Failed to parse experiment_regressed event"));
        return;
      }
      const result = validateExperimentEvent("experiment_regressed", rawData);
      if (!result.success || !result.data) {
        handlers?.onError?.(new Error(`[SSE] ${result.error}`));
        return;
      }
      const eventData = result.data as ExperimentRegressedEvent;
      processExperimentEvent("experiment_regressed", eventData, eventData, () => {
        handlers?.onExperimentRegressed?.(eventData);
      });
    });

    // 実験タイムアウト
    eventSource.addEventListener("experiment_timeout", (e: MessageEvent) => {
      const rawData = safeJsonParse<unknown>(e.data, null, "experiment_timeout");
      if (rawData === null) {
        handlers?.onError?.(new Error("[SSE] Failed to parse experiment_timeout event"));
        return;
      }
      const result = validateExperimentEvent("experiment_timeout", rawData);
      if (!result.success || !result.data) {
        handlers?.onError?.(new Error(`[SSE] ${result.error}`));
        return;
      }
      const eventData = result.data as ExperimentTimeoutEvent;
      processExperimentEvent("experiment_timeout", eventData, eventData, () => {
        handlers?.onExperimentTimeout?.(eventData);
      });
    });

    // エラー
    eventSource.onerror = () => {
      setIsConnected(false);
      handlers?.onDisconnected?.();
      reconnect();
    };
  }, [setIsConnected, setLastReceived, setInstances, handlers, reconnect]);

  /**
   * 切断
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    // バッチャーを破棄
    if (batcherRef.current) {
      batcherRef.current.dispose();
      batcherRef.current = null;
    }
    pendingExperimentHandlersRef.current = [];
    setIsConnected(false);
  }, [setIsConnected]);

  // 自動接続
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
  };
}

/**
 * SSE 接続状態のみを取得するフック
 */
export function useSSEConnection() {
  const [isConnected] = useAtom(sseConnectedAtom);
  const lastReceived = useAtomValue(sseLastReceivedAtom);

  // 最終受信から30秒以上経過している場合は stale 扱い
  const isStale = lastReceived ? Date.now() - lastReceived > 30000 : true;

  return {
    isConnected,
    isStale,
    lastReceived,
  };
}

/**
 * Jotai の useAtomValue をインポート
 */
import { useAtomValue } from "jotai";
