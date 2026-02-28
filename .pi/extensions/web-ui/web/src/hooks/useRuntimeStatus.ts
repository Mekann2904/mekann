/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useRuntimeStatus.ts
 * @role React hook for runtime status via SSE
 * @why Provide real-time runtime updates to components
 * @related ../components/runtime-status-panel.tsx
 * @public_api useRuntimeStatus, useRuntimeSessions, RuntimeStatus, RuntimeSession
 * @invariants SSE connection is cleaned up on unmount
 * @side_effects Establishes SSE connection, updates state on events
 * @failure_modes SSE connection failure, network error
 *
 * @abdd.explain
 * @overview Hook that connects to /api/runtime/stream SSE endpoint
 * @what_it_does Manages SSE connection, provides runtime status state
 * @why_it_exists Enables real-time UI updates without polling
 * @scope(in) SSE events from server
 * @scope(out) Runtime status state, connection status
 */

import { useState, useEffect, useCallback, useRef } from "preact/hooks";

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
 * Runtime limits
 */
export interface RuntimeLimits {
  maxTotalActiveLlm: number;
  maxTotalActiveRequests: number;
  maxParallelSubagentsPerRun: number;
  maxParallelTeamsPerRun: number;
  maxParallelTeammatesPerTeam: number;
  maxConcurrentOrchestrations: number;
  capacityWaitMs: number;
  capacityPollMs: number;
}

/**
 * Runtime status from API
 */
export interface RuntimeStatus {
  /** Active LLM count */
  activeLlm: number;
  /** Active request count */
  activeRequests: number;
  /** Runtime limits */
  limits: RuntimeLimits | null;
  /** Queued orchestrations */
  queuedOrchestrations: number;
  /** Priority statistics */
  priorityStats: Record<string, number> | null;
  /** Session statistics */
  sessions: SessionStats;
  /** Warning message if agent-runtime unavailable */
  warning?: string;
}

/**
 * Hook state
 */
export interface UseRuntimeStatusResult {
  /** Current runtime status */
  status: RuntimeStatus | null;
  /** Active sessions */
  sessions: RuntimeSession[];
  /** Connection status */
  connected: boolean;
  /** Connection error */
  error: string | null;
  /** Manually refresh status */
  refresh: () => Promise<void>;
}

/**
 * SSE event types
 */
type SSEEventType =
  | "session_added"
  | "session_updated"
  | "session_removed"
  | "sessions_cleaned"
  | "status_snapshot";

interface SSEEvent {
  type: SSEEventType;
  data: RuntimeSession | { id: string } | { removed: number } | RuntimeSession[];
  timestamp: number;
}

const API_BASE = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "http://localhost:3000";

/**
 * Hook for runtime status with SSE real-time updates
 * @summary ランタイム状態フック
 * @returns ランタイム状態、セッション、接続状態
 */
export function useRuntimeStatus(): UseRuntimeStatusResult {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [sessions, setSessions] = useState<RuntimeSession[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetch initial status via REST API
   */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/runtime/status`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success) {
        setStatus(json.data);
        setError(null);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch status";
      setError(message);
    }
  }, []);

  /**
   * Fetch active sessions via REST API
   */
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/runtime/sessions`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success && json.data.sessions) {
        setSessions(json.data.sessions);
      }
    } catch (e) {
      console.warn("[useRuntimeStatus] Failed to fetch sessions:", e);
    }
  }, []);

  /**
   * Refresh both status and sessions
   */
  const refresh = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchSessions()]);
  }, [fetchStatus, fetchSessions]);

  /**
   * Connect to SSE endpoint
   */
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`${API_BASE}/api/runtime/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
    };

    eventSource.onerror = () => {
      setConnected(false);
      setError("SSE connection failed");

      // Reconnect after 5 seconds
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, 5000);
    };

    // Handle session_added event
    eventSource.addEventListener("session_added", (event: MessageEvent) => {
      try {
        const session = JSON.parse(event.data) as RuntimeSession;
        setSessions((prev) => {
          // Avoid duplicates
          if (prev.some((s) => s.id === session.id)) {
            return prev;
          }
          return [...prev, session];
        });
      } catch (e) {
        console.warn("[useRuntimeStatus] Failed to parse session_added:", e);
      }
    });

    // Handle session_updated event
    eventSource.addEventListener("session_updated", (event: MessageEvent) => {
      try {
        const session = JSON.parse(event.data) as RuntimeSession;
        setSessions((prev) =>
          prev.map((s) => (s.id === session.id ? session : s))
        );
      } catch (e) {
        console.warn("[useRuntimeStatus] Failed to parse session_updated:", e);
      }
    });

    // Handle session_removed event
    eventSource.addEventListener("session_removed", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { id: string };
        setSessions((prev) => prev.filter((s) => s.id !== data.id));
      } catch (e) {
        console.warn("[useRuntimeStatus] Failed to parse session_removed:", e);
      }
    });

    // Handle status_snapshot event (initial data)
    eventSource.addEventListener("status_snapshot", (event: MessageEvent) => {
      try {
        const snapshotSessions = JSON.parse(event.data) as RuntimeSession[];
        setSessions(snapshotSessions);
      } catch (e) {
        console.warn("[useRuntimeStatus] Failed to parse status_snapshot:", e);
      }
    });

    // Handle sessions_cleaned event
    eventSource.addEventListener("sessions_cleaned", () => {
      // Refresh sessions after cleanup
      fetchSessions();
    });
  }, [fetchSessions]);

  // Initial fetch and SSE connection
  useEffect(() => {
    refresh();
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [refresh, connectSSE]);

  return {
    status,
    sessions,
    connected,
    error,
    refresh,
  };
}

/**
 * Simplified hook for just active sessions
 * @summary セッション一覧フック
 * @returns アクティブなセッション配列
 */
export function useRuntimeSessions(): RuntimeSession[] {
  const { sessions } = useRuntimeStatus();
  return sessions;
}

/**
 * Hook for session associated with a specific task
 * @summary タスク別セッションフック
 * @param taskId - タスクID
 * @returns セッション、または undefined
 */
export function useTaskSession(taskId: string | undefined): RuntimeSession | undefined {
  const { sessions } = useRuntimeStatus();

  if (!taskId) {
    return undefined;
  }

  return sessions.find((s) => s.taskId === taskId);
}
