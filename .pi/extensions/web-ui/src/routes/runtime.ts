/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/routes/runtime.ts
 * @role Runtime API routes for web-ui server (Hono)
 * @why Provide RESTful API for runtime session management
 * @related server/app.ts
 * @public_api runtimeRoutes
 * @invariants Session IDs must be unique
 * @side_effects SSE connections
 * @failure_modes Session lookup failures
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import {
  getSymphonyOrchestratorLoopState,
  startSymphonyOrchestratorLoop,
  stopSymphonyOrchestratorLoop,
  tickSymphonyOrchestrator,
} from "../../../../lib/symphony-orchestrator-loop.js";
import { refreshSymphonyScheduler } from "../../../../lib/symphony-scheduler.js";
import { listSymphonyIssueStates, type SymphonyIssueState } from "../../../../lib/symphony-orchestrator-state.js";
import {
  getActiveSessions as getSharedRuntimeSessions,
  getSession as getSharedRuntimeSession,
  onSessionEvent,
  type RuntimeSession as SharedRuntimeSession,
} from "../../../../lib/runtime-sessions.js";
import {
  buildSymphonyIssueSnapshot,
  buildSymphonySnapshot,
  hydrateSymphonyIssueSnapshot,
  type SymphonyRuntimeSessionSummary,
  type SymphonyRuntimeSummary,
} from "../../lib/symphony-reader.js";
import { onExperimentEvent } from "../../../../lib/comprehensive-logger.js";

function formatRouteError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Runtimeルート
 */
export const runtimeRoutes = new Hono();

// メモリリーク修正: セッションTTL設定（デフォルト1時間）
const SESSION_TTL_MS = parseInt(process.env.PI_SESSION_TTL_MS || "3600000", 10); // 1時間
const SESSION_MAX_COUNT = parseInt(process.env.PI_SESSION_MAX_COUNT || "1000", 10); // 最大1000セッション

// インメモリセッションストア（簡易版）
const sessions = new Map<string, RuntimeSession>();
let runtimeSessionEventSubscribed = false;
let experimentEventSubscribed = false;

// SSEクライアント管理
const sseClients = new Map<string, {
  controller: ReadableStreamDefaultController<Uint8Array>;
  lastHeartbeat: number;
}>();

// BUG-2修正: ハートビート参照を保持してクリーンアップ可能に
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

// メモリリーク修正: セッションクリーンアップタイマー
let sessionCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 期限切れセッションをクリーンアップ（メモリリーク対策）
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  let expiredCount = 0;

  // TTLベースのクリーンアップ
  sessions.forEach((session, id) => {
    if (session.createdAt && now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      expiredCount++;
    }
  });

  // 最大数超過時のクリーンアップ（古い順に削除）
  if (sessions.size > SESSION_MAX_COUNT) {
    const entries = [...sessions.entries()]
      .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
    
    const toDelete = entries.slice(0, sessions.size - SESSION_MAX_COUNT);
    for (const [id] of toDelete) {
      sessions.delete(id);
      expiredCount++;
    }
  }

  if (expiredCount > 0) {
    console.log(`[runtime] Cleaned up ${expiredCount} expired session(s)`);
  }
}

/**
 * ハートビートを開始
 */
function startHeartbeat(): void {
  if (heartbeatInterval) return; // 既に開始済み

  heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const msg = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: now })}\n\n`;
    const encoder = new TextEncoder();

    sseClients.forEach((client, id) => {
      try {
        client.controller.enqueue(encoder.encode(msg));
        client.lastHeartbeat = now;
      } catch {
        sseClients.delete(id);
      }
    });
  }, 30000);

  // メモリリーク修正: 定期的なセッションクリーンアップ（5分ごと）
  if (!sessionCleanupInterval) {
    sessionCleanupInterval = setInterval(cleanupExpiredSessions, 300000);
    if (sessionCleanupInterval.unref) {
      sessionCleanupInterval.unref();
    }
  }
}

/**
 * Runtime SSEサーバーのクリーンアップ（サーバー停止時に呼び出す）
 */
export function cleanupRuntimeSSE(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
  sseClients.clear();
  sessions.clear();
  console.log("[runtime] Cleaned up Runtime SSE resources");
}

// モジュール読み込み時にハートビートを開始
startHeartbeat();
ensureRuntimeSessionEventSubscription();
ensureExperimentEventSubscription();
startSymphonyOrchestratorLoop({
  cwd: process.cwd(),
  runtimeSessions: () => getRuntimeSessionSnapshots(),
});

/**
 * Runtime session type
 */
export type RuntimeSessionType = "subagent" | "agent-team";
export type RuntimeSessionStatus = "starting" | "running" | "completed" | "failed";

export interface RuntimeSession {
  id: string;
  type: RuntimeSessionType;
  agentId: string;
  taskId?: string;
  taskTitle?: string;
  taskDescription?: string;
  status: RuntimeSessionStatus;
  startedAt: number;
  createdAt?: number; // メモリリーク修正: TTL管理用
  progress?: number;
  message?: string;
  completedAt?: number;
  teamId?: string;
  teammateCount?: number;
}

export interface SessionStats {
  total: number;
  starting: number;
  running: number;
  completed: number;
  failed: number;
}

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

export interface RuntimeStatus {
  activeLlm: number;
  activeRequests: number;
  limits: RuntimeLimits | null;
  queuedOrchestrations: number;
  priorityStats: Record<string, number> | null;
  sessions: SessionStats;
  warning?: string;
}

function getAllRuntimeSessions(): RuntimeSession[] {
  const merged = new Map<string, RuntimeSession>();

  for (const session of getSharedRuntimeSessions() as SharedRuntimeSession[]) {
    merged.set(session.id, session as RuntimeSession);
  }

  for (const [id, session] of sessions.entries()) {
    merged.set(id, session);
  }

  return Array.from(merged.values());
}

function ensureRuntimeSessionEventSubscription(): void {
  if (runtimeSessionEventSubscribed) {
    return;
  }

  onSessionEvent((event) => {
    broadcastToSSEClients(event.type, event.data);
  });
  runtimeSessionEventSubscribed = true;
}

function ensureExperimentEventSubscription(): void {
  if (experimentEventSubscribed) {
    return;
  }

  onExperimentEvent((event) => {
    // 実験イベントをSSEクライアントにブロードキャスト
    broadcastToSSEClients(event.type, event.data);
  });
  experimentEventSubscribed = true;
}

function buildRuntimeStatusSnapshot(): RuntimeStatus {
  const allSessions = getAllRuntimeSessions();
  const activeSessions = allSessions.filter(
    s => s.status === "running" || s.status === "starting"
  );
  const orchestrationStates = listSymphonyIssueStates(process.cwd());
  const queuedOrchestrations = orchestrationStates.filter(
    (item: SymphonyIssueState) => item.runState === "claimed" || item.runState === "retrying",
  ).length;

  return {
    activeLlm: activeSessions.length,
    activeRequests: activeSessions.length,
    limits: {
      maxTotalActiveLlm: 10,
      maxTotalActiveRequests: 20,
      maxParallelSubagentsPerRun: 5,
      maxParallelTeamsPerRun: 3,
      maxParallelTeammatesPerTeam: 5,
      maxConcurrentOrchestrations: 5,
      capacityWaitMs: 1000,
      capacityPollMs: 100,
    },
    queuedOrchestrations,
    priorityStats: null,
    sessions: {
      total: allSessions.length,
      starting: activeSessions.filter(s => s.status === "starting").length,
      running: activeSessions.filter(s => s.status === "running").length,
      completed: allSessions.filter(s => s.status === "completed").length,
      failed: allSessions.filter(s => s.status === "failed").length,
    },
  };
}

export function getRuntimeStatusSnapshot(): RuntimeStatus {
  return buildRuntimeStatusSnapshot();
}

export function getSymphonyRuntimeSummary(): SymphonyRuntimeSummary {
  const status = buildRuntimeStatusSnapshot();
  return {
    activeLlm: status.activeLlm,
    activeRequests: status.activeRequests,
    queuedOrchestrations: status.queuedOrchestrations,
    sessions: status.sessions,
  };
}

export function getRuntimeSessionSnapshots(): SymphonyRuntimeSessionSummary[] {
  return getAllRuntimeSessions().map((session) => ({
    id: session.id,
    taskId: session.taskId,
    taskTitle: session.taskTitle,
    status: session.status,
    startedAt: session.startedAt,
    message: session.message,
    progress: session.progress,
    agentId: session.agentId,
    type: session.type,
  }));
}

/**
 * GET /status - ランタイム状態を取得
 */
runtimeRoutes.get("/status", (c) => {
  const status = buildRuntimeStatusSnapshot();
  return c.json({ success: true, data: status });
});

/**
 * GET /sessions - セッション一覧を取得
 */
runtimeRoutes.get("/sessions", (c) => {
  const activeSessions = getAllRuntimeSessions().filter(
    s => s.status === "running" || s.status === "starting"
  );

  return c.json({
    success: true,
    data: {
      sessions: activeSessions,
      total: activeSessions.length,
    },
  });
});

runtimeRoutes.get("/symphony", async (c) => {
  const snapshot = await buildSymphonySnapshot(process.cwd(), getSymphonyRuntimeSummary());
  return c.json({ success: true, data: snapshot });
});

runtimeRoutes.get("/symphony/orchestrator", (c) => {
  return c.json({
    success: true,
    data: getSymphonyOrchestratorLoopState(),
  });
});

runtimeRoutes.post("/symphony/orchestrator/start", (c) => {
  const loopState = startSymphonyOrchestratorLoop({
    cwd: process.cwd(),
    runtimeSessions: () => getRuntimeSessionSnapshots(),
    forceRestart: true,
  });
  return c.json({ success: true, data: loopState });
});

runtimeRoutes.post("/symphony/orchestrator/stop", (c) => {
  return c.json({
    success: true,
    data: stopSymphonyOrchestratorLoop(),
  });
});

runtimeRoutes.post("/symphony/orchestrator/tick", async (c) => {
  try {
    const scheduler = await tickSymphonyOrchestrator(process.cwd());
    return c.json({
      success: true,
      data: {
        loop: getSymphonyOrchestratorLoopState(),
        scheduler,
        health: {
          trackerStatus: "ok",
          lastTrackerError: null,
        },
      },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: "tracker_refresh_failed",
        message: formatRouteError(error),
      },
      data: {
        loop: getSymphonyOrchestratorLoopState(),
        scheduler: null,
        health: {
          trackerStatus: "error",
          lastTrackerError: formatRouteError(error),
        },
      },
    }, 503);
  }
});

runtimeRoutes.post("/symphony/refresh", async (_c) => {
  try {
    const runtimeSessions = getRuntimeSessionSnapshots();
    const scheduler = await refreshSymphonyScheduler(process.cwd(), runtimeSessions, {
      reconcile: true,
    });
    const snapshot = await buildSymphonySnapshot(process.cwd(), getSymphonyRuntimeSummary());
    return _c.json({
      success: true,
      data: {
        queued: true,
        coalesced: false,
        requestedAt: new Date().toISOString(),
        scheduler,
        snapshot,
        health: {
          trackerStatus: "ok",
          lastTrackerError: null,
        },
      },
    }, 202);
  } catch (error) {
    const snapshot = await buildSymphonySnapshot(process.cwd(), getSymphonyRuntimeSummary());
    return _c.json({
      success: false,
      error: {
        code: "tracker_refresh_failed",
        message: formatRouteError(error),
      },
      data: {
        queued: false,
        coalesced: false,
        requestedAt: new Date().toISOString(),
        scheduler: null,
        snapshot,
        health: {
          trackerStatus: "error",
          lastTrackerError: formatRouteError(error),
        },
      },
    }, 503);
  }
});

runtimeRoutes.get("/symphony/issues/:id", async (c) => {
  const baseSnapshot = buildSymphonyIssueSnapshot(
    c.req.param("id"),
    process.cwd(),
    getRuntimeSessionSnapshots(),
  );
  if (!baseSnapshot) {
    return c.json({
      success: false,
      error: {
        code: "issue_not_found",
        message: `No Symphony issue found for ${c.req.param("id")}`,
      },
    }, 404);
  }
  const snapshot = await hydrateSymphonyIssueSnapshot(
    baseSnapshot,
    process.cwd(),
    getRuntimeSessionSnapshots(),
  );
  return c.json({ success: true, data: snapshot });
});

runtimeRoutes.get("/symphony/issues/:id/debug", async (c) => {
  const baseSnapshot = buildSymphonyIssueSnapshot(
    c.req.param("id"),
    process.cwd(),
    getRuntimeSessionSnapshots(),
  );
  if (!baseSnapshot) {
    return c.json({
      success: false,
      error: {
        code: "issue_not_found",
        message: `No Symphony issue found for ${c.req.param("id")}`,
      },
    }, 404);
  }
  const snapshot = await hydrateSymphonyIssueSnapshot(
    baseSnapshot,
    process.cwd(),
    getRuntimeSessionSnapshots(),
  );

  return c.json({
    success: true,
    data: {
      issueId: snapshot.id,
      health: snapshot.health,
      title: snapshot.title,
      queue: snapshot.queue,
      verification: snapshot.verification,
      completionGate: snapshot.completionGate,
      proofArtifacts: snapshot.proofArtifacts,
      workpadId: snapshot.workpad?.id ?? null,
      workspace: snapshot.workspace,
      orchestration: snapshot.orchestration,
      runtime: {
        activeSession: snapshot.runtime.activeSession,
        relatedSessions: snapshot.debug.relatedSessions,
      },
      recentEvents: snapshot.debug.recentEvents,
    },
  });
});

/**
 * GET /stream - SSEストリーム
 */
runtimeRoutes.get("/stream", (_c) => {
  const clientId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      sseClients.set(clientId, {
        controller,
        lastHeartbeat: Date.now(),
      });

      // 初期接続メッセージ
      const connectMsg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
      controller.enqueue(encoder.encode(connectMsg));

      // 現在のセッションスナップショット
      const snapshotMsg = `event: status_snapshot\ndata: ${JSON.stringify(getAllRuntimeSessions())}\n\n`;
      controller.enqueue(encoder.encode(snapshotMsg));

      console.log(`[runtime] SSE client ${clientId} connected`);
    },
    cancel() {
      sseClients.delete(clientId);
      console.log(`[runtime] SSE client ${clientId} disconnected`);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

/**
 * GET /sessions/:id - 特定セッションを取得
 */
runtimeRoutes.get("/sessions/:id", (c) => {
  const { id } = c.req.param();
  const session = sessions.get(id) ?? (getSharedRuntimeSession(id) as RuntimeSession | undefined);

  if (!session) {
    return c.json({ success: false, error: "Session not found" }, 404);
  }

  return c.json({ success: true, data: session });
});

/**
 * POST /sessions - 新しいセッションを作成（テスト用）
 */
runtimeRoutes.post("/sessions", async (c) => {
  try {
    const body = await c.req.json();
    const session: RuntimeSession = {
      id: randomUUID(),
      type: body.type || "subagent",
      agentId: body.agentId || "unknown",
      taskId: body.taskId,
      taskTitle: body.taskTitle,
      taskDescription: body.taskDescription,
      status: "starting",
      startedAt: Date.now(),
      createdAt: Date.now(), // メモリリーク修正: TTL管理用
      ...body,
    };

    sessions.set(session.id, session);

    // SSEで通知
    broadcastToSSEClients("session_added", session);

    return c.json({ success: true, data: session }, 201);
  } catch {
    return c.json({ success: false, error: "Invalid request" }, 400);
  }
});

/**
 * DELETE /sessions/:id - セッションを削除
 */
runtimeRoutes.delete("/sessions/:id", (c) => {
  const { id } = c.req.param();
  const deleted = sessions.delete(id);

  if (!deleted) {
    return c.json({ success: false, error: "Session not found" }, 404);
  }

  // SSEで通知
  broadcastToSSEClients("session_removed", { id });

  return c.json({ success: true, data: { deletedId: id } });
});

/**
 * SSEクライアントにブロードキャスト
 */
function broadcastToSSEClients(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\nid: ${Date.now()}\n\n`;
  const encoder = new TextEncoder();

  sseClients.forEach((client, id) => {
    try {
      client.controller.enqueue(encoder.encode(msg));
    } catch {
      sseClients.delete(id);
    }
  });
}
