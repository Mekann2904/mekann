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

/**
 * SSE イベントタイプ
 */
type SSEEventType =
  | "connected"
  | "status"
  | "tool-call"
  | "response"
  | "heartbeat"
  | "context-update"
  | "instances-update";

/**
 * SSE イベントハンドラー
 */
interface SSEEventHandlers {
  onConnected?: (clientId: string) => void;
  onDisconnected?: () => void;
  onInstancesUpdate?: (instances: InstanceInfo[]) => void;
  onContextUpdate?: (data: { pid: number; timestamp: string; input: number; output: number }) => void;
  onError?: (error: Error) => void;
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

  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000;

  /**
   * 再接続
   */
  const reconnect = useCallback(() => {
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

    const eventSource = new EventSource("/api/sse");
    eventSourceRef.current = eventSource;

    // 接続成功
    eventSource.addEventListener("connected", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setIsConnected(true);
      setLastReceived(Date.now());
      reconnectAttemptsRef.current = 0;
      handlers?.onConnected?.(data.clientId);
    });

    // インスタンス更新
    eventSource.addEventListener("instances-update", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setLastReceived(Date.now());
      setInstances(data.instances);
      handlers?.onInstancesUpdate?.(data.instances);
    });

    // コンテキスト更新
    eventSource.addEventListener("context-update", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setLastReceived(Date.now());
      handlers?.onContextUpdate?.(data);
    });

    // ハートビート
    eventSource.addEventListener("heartbeat", () => {
      setLastReceived(Date.now());
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
