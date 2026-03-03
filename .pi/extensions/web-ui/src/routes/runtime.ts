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

/**
 * Runtimeルート
 */
export const runtimeRoutes = new Hono();

// インメモリセッションストア（簡易版）
const sessions = new Map<string, RuntimeSession>();

// SSEクライアント管理
const sseClients = new Map<string, {
  controller: ReadableStreamDefaultController<Uint8Array>;
  lastHeartbeat: number;
}>();

// ハートビート
setInterval(() => {
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

/**
 * GET /status - ランタイム状態を取得
 */
runtimeRoutes.get("/status", (c) => {
  const activeSessions = Array.from(sessions.values()).filter(
    s => s.status === "running" || s.status === "starting"
  );

  const status: RuntimeStatus = {
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
    queuedOrchestrations: 0,
    priorityStats: null,
    sessions: {
      total: sessions.size,
      starting: activeSessions.filter(s => s.status === "starting").length,
      running: activeSessions.filter(s => s.status === "running").length,
      completed: Array.from(sessions.values()).filter(s => s.status === "completed").length,
      failed: Array.from(sessions.values()).filter(s => s.status === "failed").length,
    },
  };

  return c.json({ success: true, data: status });
});

/**
 * GET /sessions - セッション一覧を取得
 */
runtimeRoutes.get("/sessions", (c) => {
  const activeSessions = Array.from(sessions.values()).filter(
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

/**
 * GET /stream - SSEストリーム
 */
runtimeRoutes.get("/stream", (c) => {
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
      const snapshotMsg = `event: status_snapshot\ndata: ${JSON.stringify([])}\n\n`;
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
  const session = sessions.get(id);

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
