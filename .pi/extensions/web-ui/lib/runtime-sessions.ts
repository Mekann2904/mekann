/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/runtime-sessions.ts
 * @role Runtime session management for tracking active subagent/team executions
 * @why Provide real-time execution status for Web UI Kanban board
 * @related ../server.ts, ../../agent-runtime.ts
 * @public_api RuntimeSession, addSession, updateSession, removeSession, getActiveSessions, getSessionByTaskId
 * @invariants Sessions are automatically cleaned up after completion
 * @side_effects Broadcasts SSE events on session changes
 * @failure_modes None (in-memory storage, no persistence)
 *
 * @abdd.explain
 * @overview In-memory session store for tracking agent execution state
 * @what_it_does Manages lifecycle of execution sessions, provides query APIs, broadcasts updates
 * @why_it_exists Enables real-time UI updates for agent execution progress
 * @scope(in) Session lifecycle events from subagents.ts/agent-teams.ts
 * @scope(out) Session queries, SSE broadcast triggers
 */

import type { Response } from "express";

/**
 * Session type discriminator
 */
export type RuntimeSessionType = "subagent" | "agent-team";

/**
 * Session execution status
 */
export type RuntimeSessionStatus = "starting" | "running" | "completed" | "failed";

/**
 * Runtime session representing an active or recently completed agent execution
 */
export interface RuntimeSession {
  /** Unique session identifier */
  id: string;
  /** Session type (subagent or agent-team) */
  type: RuntimeSessionType;
  /** Agent identifier (e.g., "implementer", "researcher") */
  agentId: string;
  /** Associated task ID (optional, for Kanban integration) */
  taskId?: string;
  /** Task title preview (optional, for display) */
  taskTitle?: string;
  /** Current execution status */
  status: RuntimeSessionStatus;
  /** Unix timestamp when session started */
  startedAt: number;
  /** Execution progress (0-100, optional) */
  progress?: number;
  /** Current status message (optional) */
  message?: string;
  /** Unix timestamp when session completed (optional) */
  completedAt?: number;
  /** Team ID for agent-team sessions (optional) */
  teamId?: string;
  /** Number of teammates for agent-team sessions (optional) */
  teammateCount?: number;
}

/**
 * SSE client connection for runtime updates
 */
interface SSEClient {
  id: string;
  res: Response;
  lastHeartbeat: number;
}

/**
 * Global session store (in-memory)
 */
const activeSessions = new Map<string, RuntimeSession>();

/**
 * SSE clients for runtime updates
 */
const sseClients = new Map<string, SSEClient>();

/**
 * Session ID counter for generating unique IDs
 */
let sessionCounter = 0;

/**
 * Generate a unique session ID
 * @summary セッションID生成
 * @returns 一意のセッションID
 */
export function generateSessionId(): string {
  sessionCounter += 1;
  return `session-${Date.now()}-${sessionCounter}`;
}

/**
 * Add a new runtime session
 * @summary セッション追加
 * @param session - 追加するセッション
 * @returns 追加されたセッション
 */
export function addSession(session: RuntimeSession): RuntimeSession {
  activeSessions.set(session.id, session);
  broadcastRuntimeUpdate("session_added", session);
  return session;
}

/**
 * Update an existing runtime session
 * @summary セッション更新
 * @param id - セッションID
 * @param update - 更新内容
 * @returns 更新されたセッション、または undefined
 */
export function updateSession(
  id: string,
  update: Partial<RuntimeSession>
): RuntimeSession | undefined {
  const session = activeSessions.get(id);
  if (!session) {
    return undefined;
  }

  const updated = { ...session, ...update };
  activeSessions.set(id, updated);
  broadcastRuntimeUpdate("session_updated", updated);
  return updated;
}

/**
 * Remove a runtime session
 * @summary セッション削除
 * @param id - セッションID
 * @returns 削除された場合は true
 */
export function removeSession(id: string): boolean {
  const session = activeSessions.get(id);
  if (!session) {
    return false;
  }

  activeSessions.delete(id);
  broadcastRuntimeUpdate("session_removed", { id });
  return true;
}

/**
 * Get a session by ID
 * @summary セッション取得
 * @param id - セッションID
 * @returns セッション、または undefined
 */
export function getSession(id: string): RuntimeSession | undefined {
  return activeSessions.get(id);
}

/**
 * Get all active sessions
 * @summary 全セッション取得
 * @returns アクティブなセッション配列
 */
export function getActiveSessions(): RuntimeSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Get session by associated task ID
 * @summary タスクIDでセッション検索
 * @param taskId - タスクID
 * @returns セッション、または undefined
 */
export function getSessionByTaskId(taskId: string): RuntimeSession | undefined {
  for (const session of activeSessions.values()) {
    if (session.taskId === taskId) {
      return session;
    }
  }
  return undefined;
}

/**
 * Get sessions by agent ID
 * @summary エージェントIDでセッション検索
 * @param agentId - エージェントID
 * @returns セッション配列
 */
export function getSessionsByAgentId(agentId: string): RuntimeSession[] {
  const result: RuntimeSession[] = [];
  for (const session of activeSessions.values()) {
    if (session.agentId === agentId) {
      result.push(session);
    }
  }
  return result;
}

/**
 * Get sessions by type
 * @summary タイプでセッション検索
 * @param type - セッションタイプ
 * @returns セッション配列
 */
export function getSessionsByType(type: RuntimeSessionType): RuntimeSession[] {
  const result: RuntimeSession[] = [];
  for (const session of activeSessions.values()) {
    if (session.type === type) {
      result.push(session);
    }
  }
  return result;
}

/**
 * Get session count by status
 * @summary ステータス別セッション数
 * @returns ステータス別のセッション数
 */
export function getSessionStats(): {
  total: number;
  starting: number;
  running: number;
  completed: number;
  failed: number;
} {
  const stats = {
    total: activeSessions.size,
    starting: 0,
    running: 0,
    completed: 0,
    failed: 0,
  };

  for (const session of activeSessions.values()) {
    stats[session.status] += 1;
  }

  return stats;
}

/**
 * Clean up completed/failed sessions older than the specified age
 * @summary 古いセッションのクリーンアップ
 * @param maxAgeMs - 最大保持期間（ミリ秒、デフォルト: 5分）
 * @returns 削除されたセッション数
 */
export function cleanupOldSessions(maxAgeMs = 5 * 60 * 1000): number {
  const now = Date.now();
  let removed = 0;

  for (const [id, session] of activeSessions) {
    if (
      (session.status === "completed" || session.status === "failed") &&
      session.completedAt &&
      now - session.completedAt > maxAgeMs
    ) {
      activeSessions.delete(id);
      removed += 1;
    }
  }

  if (removed > 0) {
    broadcastRuntimeUpdate("sessions_cleaned", { removed });
  }

  return removed;
}

/**
 * SSE event types for runtime updates
 */
export type RuntimeSSEEventType =
  | "session_added"
  | "session_updated"
  | "session_removed"
  | "sessions_cleaned"
  | "status_snapshot";

/**
 * SSE event payload
 */
export interface RuntimeSSEEvent {
  type: RuntimeSSEEventType;
  data: RuntimeSession | { id: string } | { removed: number } | RuntimeSession[];
  timestamp: number;
}

/**
 * Register an SSE client for runtime updates
 * @summary SSEクライアント登録
 * @param id - クライアントID
 * @param res - Express Response object
 */
export function addSSEClient(id: string, res: Response): void {
  sseClients.set(id, { id, res, lastHeartbeat: Date.now() });

  // Send initial snapshot
  const sessions = getActiveSessions();
  const event: RuntimeSSEEvent = {
    type: "status_snapshot",
    data: sessions,
    timestamp: Date.now(),
  };
  sendSSEEvent(res, event);
}

/**
 * Remove an SSE client
 * @summary SSEクライアント削除
 * @param id - クライアントID
 */
export function removeSSEClient(id: string): void {
  sseClients.delete(id);
}

/**
 * Get SSE client count
 * @summary SSEクライアント数取得
 * @returns 接続中のクライアント数
 */
export function getSSEClientCount(): number {
  return sseClients.size;
}

/**
 * Broadcast runtime update to all connected SSE clients
 * @summary SSEイベント配信
 * @param type - イベントタイプ
 * @param data - イベントデータ
 */
export function broadcastRuntimeUpdate(
  type: RuntimeSSEEventType,
  data: RuntimeSession | { id: string } | { removed: number } | RuntimeSession[]
): void {
  const event: RuntimeSSEEvent = {
    type,
    data,
    timestamp: Date.now(),
  };

  for (const [id, client] of sseClients) {
    try {
      sendSSEEvent(client.res, event);
      client.lastHeartbeat = Date.now();
    } catch (error) {
      // Client disconnected, remove it
      console.warn(`[runtime-sessions] SSE client ${id} disconnected:`, error);
      sseClients.delete(id);
    }
  }
}

/**
 * Send SSE event to a specific client
 * @summary SSEイベント送信
 * @param res - Express Response object
 * @param event - イベント
 */
function sendSSEEvent(res: Response, event: RuntimeSSEEvent): void {
  const eventStr = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;
  res.write(eventStr);
}

/**
 * Start periodic cleanup of old sessions
 * @summary 定期クリーンアップ開始
 * @param intervalMs - クリーンアップ間隔（ミリ秒、デフォルト: 1分）
 * @returns クリーンアップ停止関数
 */
export function startSessionCleanup(intervalMs = 60 * 1000): () => void {
  const interval = setInterval(() => {
    cleanupOldSessions();
  }, intervalMs);

  // Unref to allow process to exit
  interval.unref();

  return () => {
    clearInterval(interval);
  };
}

// Auto-start cleanup on module load (can be disabled in tests)
let cleanupStarted = false;

/**
 * Ensure session cleanup is running
 * @summary クリーンアップ開始確認
 */
export function ensureSessionCleanup(): void {
  if (cleanupStarted) return;
  cleanupStarted = true;
  startSessionCleanup();
}

// Start cleanup automatically (except in test environments)
if (process.env.NODE_ENV !== "test") {
  ensureSessionCleanup();
}
