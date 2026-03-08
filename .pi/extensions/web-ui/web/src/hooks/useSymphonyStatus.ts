/**
 * @path .pi/extensions/web-ui/web/src/hooks/useSymphonyStatus.ts
 * @role Symphony snapshot を web-ui から取得して更新する
 * @why workflow・task queue・workpad・runtime を 1 画面で扱うため
 * @related ../components/symphony-page.tsx, ../../../src/routes/runtime.ts, ../../lib/symphony-reader.ts
 */

import { useCallback, useEffect, useState } from "preact/hooks";

export interface SymphonySnapshot {
  generatedAt: string;
  workflow: {
    exists: boolean;
    path: string;
    workspaceRoot: string;
    trackerKind: string;
    trackerProjectSlug: string | null;
    runtimeKind: string;
    entrypoints: string[];
    requiredCommands: string[];
    completionGate: {
      singleInProgress: boolean;
      proofArtifacts: boolean;
      workspaceVerification: boolean;
    };
    bodyPreview: string;
  };
  taskQueue: {
    total: number;
    todo: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    failed: number;
    retryScheduled: number;
    workspaceVerificationPassed: number;
    workspaceVerificationFailed: number;
    completionGateBlocked: number;
    nextTask: {
      id: string;
      title: string;
      priority: string;
      status: string;
      nextRetryAt?: string;
    } | null;
  };
  ulWorkflow: {
    total: number;
    activeTaskId: string | null;
    activePhase: string | null;
  };
  workpads: {
    total: number;
    latest: {
      id: string;
      task: string;
      updatedAt: string;
      sections: {
        progress: string;
        verification: string;
        next: string;
      };
    } | null;
    recent: Array<{
      id: string;
      task: string;
      updatedAt: string;
    }>;
  };
  orchestrator: {
    running: boolean;
    pollIntervalMs: number;
    startedAt: string | null;
    lastTickAt: string | null;
    tickCount: number;
    lastError: string | null;
  };
  scheduler: {
    generatedAt: string;
    eligibleCount: number;
    blockedCount: number;
    terminalCount: number;
    nextEligibleTask: {
      id: string;
      title: string;
      priority: string;
      status: string;
    } | null;
    candidates: Array<{
      id: string;
      title: string;
      priority: string;
      status: string;
      eligible: boolean;
      reason: string;
    }>;
  };
  orchestration: {
    totalTracked: number;
    claimed: number;
    running: number;
    retrying: number;
    released: number;
    recent: Array<{
      issueId: string;
      title?: string;
      runState: "claimed" | "running" | "retrying" | "released";
      updatedAt: string;
      reason?: string;
    }>;
  };
  runtime: {
    activeLlm: number;
    activeRequests: number;
    queuedOrchestrations: number;
    sessions: {
      total: number;
      starting: number;
      running: number;
      completed: number;
      failed: number;
    };
  } | null;
}

const API_BASE = "/api/v2/runtime";

export function useSymphonyStatus(pollInterval: number = 10000) {
  const [snapshot, setSnapshot] = useState<SymphonySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/symphony`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      setSnapshot(payload.data ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load Symphony snapshot");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetch(`${API_BASE}/symphony/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    await fetchSnapshot();
  }, [fetchSnapshot]);

  const runLoopAction = useCallback(async (path: string) => {
    await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => undefined);
    await fetchSnapshot();
  }, [fetchSnapshot]);

  const startOrchestrator = useCallback(async () => {
    await runLoopAction("/symphony/orchestrator/start");
  }, [runLoopAction]);

  const stopOrchestrator = useCallback(async () => {
    await runLoopAction("/symphony/orchestrator/stop");
  }, [runLoopAction]);

  const tickOrchestrator = useCallback(async () => {
    await runLoopAction("/symphony/orchestrator/tick");
  }, [runLoopAction]);

  useEffect(() => {
    fetchSnapshot();
    const timer = window.setInterval(fetchSnapshot, pollInterval);
    return () => window.clearInterval(timer);
  }, [fetchSnapshot, pollInterval]);

  return {
    snapshot,
    loading,
    error,
    refresh,
    startOrchestrator,
    stopOrchestrator,
    tickOrchestrator,
  };
}
