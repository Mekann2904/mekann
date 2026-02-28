/**
 * @abdd.meta
 * @path .pi/lib/runtime-sessions.ts
 * @role Runtime session management for tracking active subagent/team executions
 * @why Provide real-time execution status for Web UI Kanban board
 * @related ../extensions/web-ui/server.ts, ../extensions/subagents.ts, ../extensions/agent-teams.ts
 * @public_api RuntimeSession, addSession, updateSession, removeSession, getActiveSessions, getSessionByTaskId, onSessionEvent
 * @invariants Sessions are automatically cleaned up after completion
 * @side_effects Emits events on session changes
 * @failure_modes None (in-memory storage, no persistence)
 *
 * @abdd.explain
 * @overview In-memory session store for tracking agent execution state
 * @what_it_does Manages lifecycle of execution sessions, provides query APIs, emits events
 * @why_it_exists Enables real-time UI updates for agent execution progress
 * @scope(in) Session lifecycle events from subagents.ts/agent-teams.ts
 * @scope(out) Session queries, event emissions
 */

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
  /** Task title preview (optional, for display, max 50 chars) */
  taskTitle?: string;
  /** Full task description (optional, for details view) */
  taskDescription?: string;
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
 * Session statistics
 */
export interface SessionStats {
  total: number;
  starting: number;
  running: number;
  completed: number;
  failed: number;
}

/**
 * Session event types
 */
export type SessionEventType = "session_added" | "session_updated" | "session_removed" | "sessions_cleaned";

/**
 * Session event payload
 */
export interface SessionEvent {
  type: SessionEventType;
  data: RuntimeSession | { id: string } | { removed: number } | RuntimeSession[];
  timestamp: number;
}

/**
 * Session event listener
 */
type SessionEventListener = (event: SessionEvent) => void;

/**
 * Global session store (in-memory)
 */
const activeSessions = new Map<string, RuntimeSession>();

/**
 * Event listeners for session changes
 */
const eventListeners = new Set<SessionEventListener>();

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
 * Subscribe to session events
 * @summary セッションイベント購読
 * @param listener - イベントリスナー
 * @returns 購読解除関数
 */
export function onSessionEvent(listener: SessionEventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

/**
 * Emit session event to all listeners
 */
function emitSessionEvent(event: SessionEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[runtime-sessions] Error in event listener:", error);
    }
  }
}

/**
 * Add a new runtime session
 * @summary セッション追加
 * @param session - 追加するセッション
 * @returns 追加されたセッション
 */
export function addSession(session: RuntimeSession): RuntimeSession {
  activeSessions.set(session.id, session);
  emitSessionEvent({
    type: "session_added",
    data: session,
    timestamp: Date.now(),
  });
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
  emitSessionEvent({
    type: "session_updated",
    data: updated,
    timestamp: Date.now(),
  });
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
  emitSessionEvent({
    type: "session_removed",
    data: { id },
    timestamp: Date.now(),
  });
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
 * Get session statistics
 * @summary セッション統計取得
 * @returns セッション統計
 */
export function getSessionStats(): SessionStats {
  const sessions = getActiveSessions();
  return {
    total: sessions.length,
    starting: sessions.filter((s) => s.status === "starting").length,
    running: sessions.filter((s) => s.status === "running").length,
    completed: sessions.filter((s) => s.status === "completed").length,
    failed: sessions.filter((s) => s.status === "failed").length,
  };
}

/**
 * Clean up completed sessions older than specified age
 * @summary 完了セッションのクリーンアップ
 * @param maxAgeMs - 最大保持期間（ミリ秒、デフォルト: 5分）
 * @returns 削除されたセッション数
 */
export function cleanupCompletedSessions(maxAgeMs: number = 5 * 60 * 1000): number {
  const now = Date.now();
  let removed = 0;

  for (const [id, session] of activeSessions) {
    if (
      (session.status === "completed" || session.status === "failed") &&
      session.completedAt &&
      now - session.completedAt > maxAgeMs
    ) {
      activeSessions.delete(id);
      removed++;
    }
  }

  if (removed > 0) {
    emitSessionEvent({
      type: "sessions_cleaned",
      data: { removed },
      timestamp: now,
    });
  }

  return removed;
}

/**
 * Clear all sessions (for testing)
 * @summary 全セッション削除
 */
export function clearAllSessions(): void {
  activeSessions.clear();
}
