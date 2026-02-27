---
title: 実行状態表示機能の実装計画
category: development
audience: developer
last_updated: 2026-02-28
tags: [kanban, execution-status, real-time, sse]
related: [docs/02-user-guide/19-live-monitoring.md]
---

# 実行状態表示機能の実装計画

vibe-kanbanを参考に、リアルタイムでエージェントの実行状態を表示する機能の実装計画。

## 目標

1. タスクカードにエージェントの実行状態を表示
2. 実行中のサブエージェント/チームをリアルタイムで追跡
3. プログレスバーとステータス表示
4. 実行履歴の表示

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                          Web UI                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Kanban Card  │  │ Status Panel │  │ History View │          │
│  │              │  │              │  │              │          │
│  │ ◐ implementer│  │ ● Active: 2  │  │ ✓ Task A     │          │
│  │ ━━━━━━60%    │  │ ○ Queued: 3  │  │ ✓ Task B     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │   SSE Events       │   REST API         │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Web UI Server                              │
├─────────────────────────────────────────────────────────────────┤
│  GET /api/runtime/status     - ランタイム状態取得               │
│  GET /api/runtime/sessions   - アクティブセッション一覧         │
│  GET /api/runtime/history    - 実行履歴取得                     │
│  SSE /api/runtime/stream    - リアルタイム更新ストリーム       │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     agent-runtime.ts                            │
├─────────────────────────────────────────────────────────────────┤
│  - getRuntimeSnapshot()     - 共有ランタイム状態               │
│  - getActiveSessions()      - アクティブセッション管理          │
│  - broadcastRuntimeUpdate() - SSEイベント配信                  │
└─────────────────────────────────────────────────────────────────┘
```

## 実装フェーズ

### フェーズ1: バックエンドAPI（1-2日）

#### 1.1 ランタイム状態API追加

```typescript
// server.ts に追加

/**
 * GET /api/runtime/status
 * 現在のランタイム状態を返す
 */
app.get("/api/runtime/status", (_req: Request, res: Response) => {
  const { getRuntimeSnapshot } = await import("../../agent-runtime.js");
  const snapshot = getRuntimeSnapshot();
  
  res.json({
    data: {
      activeLlm: snapshot.totalActiveLlm,
      activeRequests: snapshot.totalActiveRequests,
      limits: snapshot.limits,
      queuedOrchestrations: snapshot.queuedOrchestrations,
      priorityStats: snapshot.priorityStats,
    }
  });
});

/**
 * GET /api/runtime/sessions
 * アクティブなセッション一覧を返す
 */
app.get("/api/runtime/sessions", (_req: Request, res: Response) => {
  // subagents/runs と agent-teams/runs からアクティブなセッションを取得
  const sessions = getActiveSessions();
  res.json({ data: sessions });
});

/**
 * SSE /api/runtime/stream
 * リアルタイム更新ストリーム
 */
app.get("/api/runtime/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  
  const clientId = `runtime-${Date.now()}`;
  
  // 既存のSSEEventBusにクライアントを追加
  sseBus.addClient(clientId, res);
  
  // 初期状態を送信
  const snapshot = getRuntimeSnapshot();
  res.write(`event: status\ndata: ${JSON.stringify(snapshot)}\n\n`);
  
  req.on("close", () => {
    sseBus.removeClient(clientId);
  });
});
```

#### 1.2 セッション管理データ構造

```typescript
// lib/runtime-sessions.ts

export interface RuntimeSession {
  id: string;
  type: "subagent" | "agent-team";
  agentId: string;
  taskId?: string;
  taskTitle?: string;
  status: "starting" | "running" | "completed" | "failed";
  startedAt: number;
  progress?: number; // 0-100
  message?: string;
}

// グローバルセッションストア
const activeSessions = new Map<string, RuntimeSession>();

export function addSession(session: RuntimeSession): void {
  activeSessions.set(session.id, session);
  broadcastRuntimeUpdate();
}

export function updateSession(id: string, update: Partial<RuntimeSession>): void {
  const session = activeSessions.get(id);
  if (session) {
    activeSessions.set(id, { ...session, ...update });
    broadcastRuntimeUpdate();
  }
}

export function removeSession(id: string): void {
  activeSessions.delete(id);
  broadcastRuntimeUpdate();
}

export function getActiveSessions(): RuntimeSession[] {
  return Array.from(activeSessions.values());
}
```

### フェーズ2: フロントエンドUI（2-3日）

#### 2.1 実行状態フック

```typescript
// web/src/hooks/useRuntimeStatus.ts

import { useState, useEffect } from "preact/hooks";

export interface RuntimeStatus {
  activeLlm: number;
  activeRequests: number;
  sessions: RuntimeSession[];
  limits: RuntimeLimits;
}

export function useRuntimeStatus(): RuntimeStatus | null {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  
  useEffect(() => {
    // 初期取得
    fetch("/api/runtime/status")
      .then(res => res.json())
      .then(data => setStatus(data.data));
    
    // SSE接続
    const eventSource = new EventSource("/api/runtime/stream");
    
    eventSource.addEventListener("status", (event) => {
      const data = JSON.parse(event.data);
      setStatus(data);
    });
    
    return () => {
      eventSource.close();
    };
  }, []);
  
  return status;
}
```

#### 2.2 実行状態インジケータコンポーネント

```tsx
// web/src/components/execution-status-indicator.tsx

import { h } from "preact";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-preact";
import { cn } from "@/lib/utils";
import type { RuntimeSession } from "../hooks/useRuntimeStatus";

interface ExecutionStatusIndicatorProps {
  session: RuntimeSession;
  compact?: boolean;
}

export function ExecutionStatusIndicator({ session, compact }: ExecutionStatusIndicatorProps) {
  const statusConfig = {
    starting: { icon: Clock, color: "text-yellow-500", label: "Starting" },
    running: { icon: Loader2, color: "text-blue-500", label: "Running", animate: true },
    completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
    failed: { icon: XCircle, color: "text-red-500", label: "Failed" },
  };
  
  const config = statusConfig[session.status];
  const Icon = config.icon;
  
  if (compact) {
    return (
      <div class="flex items-center gap-1">
        <Icon class={cn("h-3 w-3", config.color, config.animate && "animate-spin")} />
        <span class="text-[10px] text-muted-foreground">{session.agentId}</span>
      </div>
    );
  }
  
  return (
    <div class="flex flex-col gap-1 p-2 rounded-md bg-muted/30">
      <div class="flex items-center gap-2">
        <Icon class={cn("h-4 w-4", config.color, config.animate && "animate-spin")} />
        <span class="text-xs font-medium">{session.agentId}</span>
        <span class={cn("text-xs", config.color)}>{config.label}</span>
      </div>
      
      {session.taskTitle && (
        <p class="text-[11px] text-muted-foreground truncate">{session.taskTitle}</p>
      )}
      
      {session.status === "running" && typeof session.progress === "number" && (
        <div class="mt-1">
          <div class="h-1 bg-muted rounded-full overflow-hidden">
            <div 
              class="h-full bg-blue-500 transition-all"
              style={{ width: `${session.progress}%` }}
            />
          </div>
          <span class="text-[10px] text-muted-foreground">{session.progress}%</span>
        </div>
      )}
      
      {session.message && (
        <p class="text-[10px] text-muted-foreground">{session.message}</p>
      )}
    </div>
  );
}
```

#### 2.3 カードへの統合

```tsx
// kanban-task-card.tsx に追加

import { ExecutionStatusIndicator } from "./execution-status-indicator";

interface KanbanTaskCardProps {
  task: Task;
  session?: RuntimeSession;  // 追加
  // ... 既存のprops
}

export function KanbanTaskCard({ task, session, ...props }: KanbanTaskCardProps) {
  return (
    <div class={cn(/* 既存のクラス */)}>
      {/* 既存のコンテンツ */}
      
      {/* 実行状態表示（セッションがある場合） */}
      {session && session.status !== "completed" && session.status !== "failed" && (
        <div class="mt-2 border-t border-border/50 pt-2">
          <ExecutionStatusIndicator session={session} compact />
        </div>
      )}
    </div>
  );
}
```

#### 2.4 実行状態パネル

```tsx
// web/src/components/runtime-status-panel.tsx

import { h } from "preact";
import { Activity, Users, Clock, Loader2 } from "lucide-preact";
import { useRuntimeStatus } from "../hooks/useRuntimeStatus";
import { ExecutionStatusIndicator } from "./execution-status-indicator";
import { cn } from "@/lib/utils";

export function RuntimeStatusPanel() {
  const status = useRuntimeStatus();
  
  if (!status) {
    return (
      <div class="p-4 text-center text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin mx-auto" />
        <p class="text-xs mt-2">Loading runtime status...</p>
      </div>
    );
  }
  
  const utilizationLlm = Math.round(
    (status.activeLlm / status.limits.maxTotalActiveLlm) * 100
  );
  const utilizationRequests = Math.round(
    (status.activeRequests / status.limits.maxTotalActiveRequests) * 100
  );
  
  return (
    <div class="p-4 space-y-4">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <Activity class="h-4 w-4" />
        Runtime Status
      </h3>
      
      {/* 使用率バー */}
      <div class="space-y-2">
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-muted-foreground">Active LLMs</span>
            <span>{status.activeLlm}/{status.limits.maxTotalActiveLlm}</span>
          </div>
          <div class="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              class={cn(
                "h-full transition-all",
                utilizationLlm > 80 ? "bg-red-500" : 
                utilizationLlm > 50 ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{ width: `${utilizationLlm}%` }}
            />
          </div>
        </div>
        
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="text-muted-foreground">Active Requests</span>
            <span>{status.activeRequests}/{status.limits.maxTotalActiveRequests}</span>
          </div>
          <div class="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              class={cn(
                "h-full transition-all",
                utilizationRequests > 80 ? "bg-red-500" : 
                utilizationRequests > 50 ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{ width: `${utilizationRequests}%` }}
            />
          </div>
        </div>
      </div>
      
      {/* アクティブセッション */}
      {status.sessions.length > 0 && (
        <div class="space-y-2">
          <h4 class="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Users class="h-3 w-3" />
            Active Sessions ({status.sessions.length})
          </h4>
          <div class="space-y-1">
            {status.sessions.map(session => (
              <ExecutionStatusIndicator key={session.id} session={session} />
            ))}
          </div>
        </div>
      )}
      
      {/* キュー状態 */}
      {status.limits.queuedOrchestrations > 0 && (
        <div class="text-xs text-muted-foreground flex items-center gap-1">
          <Clock class="h-3 w-3" />
          {status.limits.queuedOrchestrations} queued
        </div>
      )}
    </div>
  );
}
```

### フェーズ3: エージェント統合（1-2日）

#### 3.1 subagents.tsへの統合

```typescript
// subagents.ts の実行開始・終了時にセッション管理を追加

import { addSession, updateSession, removeSession } from "./web-ui/lib/runtime-sessions.js";

// subagent_run の実行開始時
const sessionId = createSessionId();
addSession({
  id: sessionId,
  type: "subagent",
  agentId: subagentId,
  taskId: taskId, // オプション
  taskTitle: task.slice(0, 50), // タスクの先頭
  status: "starting",
  startedAt: Date.now(),
});

// 実行中の更新（定期的またはLLM出力時）
updateSession(sessionId, {
  status: "running",
  progress: calculateProgress(currentStep, totalSteps),
  message: lastOutput.slice(0, 100),
});

// 実行完了時
updateSession(sessionId, {
  status: outcome === "success" ? "completed" : "failed",
  progress: 100,
});

// 一定時間後に削除（履歴として残す場合は削除しない）
setTimeout(() => removeSession(sessionId), 5000);
```

#### 3.2 agent-teams.tsへの統合

同様のパターンでagent-teams.tsにも統合。

### フェーズ4: 実行履歴（1日）

#### 4.1 履歴ストレージ

```typescript
// lib/runtime-history.ts

import { ensureDir } from "./fs-utils.js";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

const HISTORY_DIR = ".pi/runtime-history";
const HISTORY_FILE = "sessions.jsonl";

export interface RuntimeHistoryEntry {
  id: string;
  type: "subagent" | "agent-team";
  agentId: string;
  taskId?: string;
  taskTitle?: string;
  status: "completed" | "failed";
  startedAt: number;
  completedAt: number;
  duration: number;
  summary?: string;
}

export async function saveHistoryEntry(entry: RuntimeHistoryEntry): Promise<void> {
  await ensureDir(HISTORY_DIR);
  const line = JSON.stringify(entry) + "\n";
  await appendFile(join(HISTORY_DIR, HISTORY_FILE), line);
}

export async function getHistory(limit = 50): Promise<RuntimeHistoryEntry[]> {
  try {
    const content = await readFile(join(HISTORY_DIR, HISTORY_FILE), "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map(line => JSON.parse(line));
  } catch {
    return [];
  }
}
```

#### 4.2 履歴API

```typescript
// server.ts

app.get("/api/runtime/history", async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const history = await getHistory(limit);
  res.json({ data: history });
});
```

## テスト計画

### ユニットテスト

- [ ] RuntimeSession管理関数のテスト
- [ ] useRuntimeStatusフックのテスト
- [ ] ExecutionStatusIndicatorコンポーネントのテスト

### 統合テスト

- [ ] SSE接続とイベント配信のテスト
- [ ] セッション作成〜完了〜削除のフローテスト
- [ ] 履歴保存と取得のテスト

### E2Eテスト

- [ ] カードに実行状態が表示されることを確認
- [ ] リアルタイム更新が動作することを確認
- [ ] 複数セッションの同時表示を確認

## 受け入れ基準

1. **リアルタイム性**: セッション状態の変更が1秒以内にUIに反映される
2. **視認性**: 実行中のエージェントが一目でわかる
3. **パフォーマンス**: 10同時セッションまでUIがスムーズに動作
4. **堅牢性**: SSE切断時に自動再接続する

## リスクと対策

| リスク | 対策 |
|--------|------|
| SSE接続が切れる | 自動再接続ロジック実装 |
| メモリリーク | セッションの自動クリーンアップ |
| パフォーマンス低下 | セッション数制限、仮想スクロール |

## 参考資料

- [vibe-kanban GitHub](https://github.com/BloopAI/vibe-kanban)
- [Server-Sent Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [agent-runtime.ts](../agent-runtime.ts)
