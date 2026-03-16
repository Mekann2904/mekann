/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/services/sse-service.ts
 * @role SSEイベントブロードキャストサービス
 * @why リアルタイム通知の配信
 * @related routes/sse.ts, server/app.ts
 * @public_api SSEService, SSEEventType
 * @invariants 接続クライアントは自動クリーンアップ
 * @side_effects SSE接続の維持
 * @failure_modes クライアント切断
 *
 * @abdd.explain
 * @overview Server-Sent Eventsの管理とブロードキャスト
 * @what_it_does クライアント管理、イベント配信、ハートビート
 * @why_it_exists リアルタイム更新の実現
 * @scope(in) SSEイベント
 * @scope(out) SSEストリーム
 */

import type { ServerResponse } from "http";

/**
 * SSE イベントタイプ
 */
export type SSEEventType =
  | "status"
  | "tool-call"
  | "response"
  | "heartbeat"
  | "context-update"
  | "instances-update"
  | "experiment_start"
  | "experiment_baseline"
  | "experiment_run"
  | "experiment_improved"
  | "experiment_regressed"
  | "experiment_timeout";

/**
 * SSE イベントペイロード
 */
export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * SSE クライアント
 */
interface SSEClient {
  id: string;
  res: ServerResponse;
  lastHeartbeat: number;
}

/**
 * SSE サービス
 */
export class SSEService {
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private instancesBroadcastInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * クライアント数を取得
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * クライアントを追加
   */
  addClient(id: string, res: ServerResponse): void {
    this.clients.set(id, {
      id,
      res,
      lastHeartbeat: Date.now(),
    });
  }

  /**
   * クライアントを削除
   */
  removeClient(id: string): void {
    this.clients.delete(id);
  }

  /**
   * イベントをブロードキャスト
   */
  broadcast(event: SSEEvent): void {
    const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;

    const entries = Array.from(this.clients.entries());
    for (const [id, client] of entries) {
      try {
        client.res.write(eventStr);
      } catch (error) {
        // クライアントが切断された
        console.warn(`[sse] Client ${id} disconnected during broadcast:`, error);
        this.clients.delete(id);
      }
    }
  }

  /**
   * 特定クライアントに送信
   */
  sendTo(clientId: string, event: SSEEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    try {
      const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;
      client.res.write(eventStr);
      return true;
    } catch {
      this.clients.delete(clientId);
      return false;
    }
  }

  /**
   * ハートビートを開始
   */
  startHeartbeat(intervalMs: number = 30000): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.broadcast({
        type: "heartbeat",
        data: { timestamp: Date.now() },
        timestamp: Date.now(),
      });
    }, intervalMs);
  }

  /**
   * インスタンス情報の定期ブロードキャストを開始
   */
  startInstancesBroadcast(
    getInstances: () => unknown[],
    intervalMs: number = 3000
  ): void {
    if (this.instancesBroadcastInterval) {
      clearInterval(this.instancesBroadcastInterval);
    }

    this.instancesBroadcastInterval = setInterval(() => {
      const instances = getInstances();
      this.broadcast({
        type: "instances-update",
        data: {
          instances,
          count: instances.length,
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    }, intervalMs);
  }

  /**
   * 停止
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.instancesBroadcastInterval) {
      clearInterval(this.instancesBroadcastInterval);
      this.instancesBroadcastInterval = null;
    }

    // 全クライアントを切断
    this.clients.clear();
  }
}

/**
 * シングルトン
 */
let instance: SSEService | null = null;

export function getSSEService(): SSEService {
  if (!instance) {
    instance = new SSEService();
  }
  return instance;
}
