/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/api/client.ts
 * @role バックエンドAPIクライアント
 * @why 型安全なAPI呼び出し
 * @related atoms/*.ts, components/*.tsx
 * @public_api apiClient
 * @invariants すべてのAPIレスポンスはSuccessResponseまたはErrorResponse
 * @side_effects HTTPリクエスト送信
 * @failure_modes ネットワークエラー、サーバーエラー
 *
 * @abdd.explain
 * @overview fetchベースのAPIクライアント
 * @what_it_does タスク・インスタンス・SSE APIの呼び出し
 * @why_it_exists 型安全な通信とエラーハンドリング
 * @scope(in) APIリクエストパラメータ
 * @scope(out) 型付きAPIレスポンス
 */

import type { SuccessResponse, ErrorResponse } from "../../schemas/common.schema.js";
import type { Task, TaskStats, CreateTaskInput, UpdateTaskInput, TaskFilter } from "../../schemas/task.schema.js";
import type { InstanceInfo, InstanceStats, InstanceContextHistory } from "../../schemas/instance.schema.js";

/**
 * API基底URL
 */
const API_BASE = "/api";

/**
 * API エラー
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code?: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * レスポンスをパース
 */
async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new ApiError(
      error.error,
      response.status,
      error.code,
      error.details
    );
  }

  const data: SuccessResponse<T> = await response.json();
  return data.data;
}

/**
 * GET リクエスト
 */
async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url.toString());
  return parseResponse<T>(response);
}

/**
 * POST リクエスト
 */
async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

/**
 * PUT リクエスト
 */
async function put<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

/**
 * PATCH リクエスト
 */
async function patch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return parseResponse<T>(response);
}

/**
 * DELETE リクエスト
 */
async function del<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
  });
  return parseResponse<T>(response);
}

/**
 * API クライアント
 */
export const apiClient = {
  // ========================================
  // タスク API
  // ========================================

  tasks: {
    /**
     * タスク一覧を取得
     */
    list: (filter?: Partial<TaskFilter>) => {
      const params: Record<string, string> = {};
      if (filter?.status) params.status = filter.status.join(",");
      if (filter?.priority) params.priority = filter.priority.join(",");
      if (filter?.tag) params.tag = filter.tag;
      if (filter?.assignee) params.assignee = filter.assignee;
      if (filter?.overdue !== undefined) params.overdue = String(filter.overdue);
      return get<Task[]>("/tasks", params);
    },

    /**
     * タスク統計を取得
     */
    stats: () => get<TaskStats>("/tasks/stats"),

    /**
     * タスク詳細を取得
     */
    get: (id: string) => get<Task>(`/tasks/${id}`),

    /**
     * タスクを作成
     */
    create: (input: CreateTaskInput) => post<Task>("/tasks", input),

    /**
     * タスクを更新
     */
    update: (id: string, input: UpdateTaskInput) => put<Task>(`/tasks/${id}`, input),

    /**
     * タスクを完了
     */
    complete: (id: string) => patch<Task>(`/tasks/${id}/complete`),

    /**
     * タスクを削除
     */
    delete: (id: string) => del<{ deletedTaskId: string }>(`/tasks/${id}`),
  },

  // ========================================
  // インスタンス API
  // ========================================

  instances: {
    /**
     * インスタンス一覧を取得
     */
    list: () => get<InstanceInfo[]>("/instances"),

    /**
     * インスタンス統計を取得
     */
    stats: () => get<InstanceStats>("/instances/stats"),

    /**
     * コンテキスト履歴を取得
     */
    history: () => get<InstanceContextHistory[]>("/instances/history"),

    /**
     * 特定インスタンスを取得
     */
    get: (pid: number) => get<InstanceInfo>(`/instances/${pid}`),

    /**
     * インスタンスを削除
     */
    delete: (pid: number) => del<{ deletedPid: number }>(`/instances/${pid}`),
  },

  // ========================================
  // SSE API
  // ========================================

  sse: {
    /**
     * SSE接続URLを取得
     */
    getUrl: () => `${API_BASE}/sse`,

    /**
     * 接続クライアント数を取得
     */
    clientCount: () => get<{ clientCount: number }>("/sse/clients"),

    /**
     * ブロードキャスト（デバッグ用）
     */
    broadcast: (type: string, data: unknown) =>
      post<{ broadcastedTo: number }>("/sse/broadcast", { type, data }),
  },
};
