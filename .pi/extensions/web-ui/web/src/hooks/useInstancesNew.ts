/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useInstancesNew.ts
 * @role 新しいHono APIを使用するインスタンスフック
 * @why /api/v2/instances への移行
 * @related instances-page.tsx, ../../src/web/hooks/use-instances.ts
 * @public_api useInstancesNew
 * @invariants なし
 * @side_effects HTTPリクエスト
 * @failure_modes APIエラー
 *
 * @abdd.explain
 * @overview インスタンスデータを/api/v2から取得
 * @what_it_does 一覧・統計・履歴の取得
 * @why_it_exists 新しいHono APIへの移行
 */

import { useState, useCallback, useEffect } from "preact/hooks";

interface InstanceInfo {
  pid: number;
  startedAt: number;
  cwd: string;
  model: string;
  lastHeartbeat: number;
}

interface InstanceStats {
  activeCount: number;
  totalContextUsage: { input: number; output: number };
  avgContextUsage: { input: number; output: number };
}

interface ContextHistoryEntry {
  timestamp: string;
  input: number;
  output: number;
}

interface InstanceContextHistory {
  pid: number;
  history: ContextHistoryEntry[];
}

export interface UseInstancesReturn {
  instances: InstanceInfo[];
  stats: InstanceStats | null;
  history: InstanceContextHistory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  deleteInstance: (pid: number) => Promise<boolean>;
}

const API_BASE = "/api/v2";

export function useInstancesNew(pollInterval: number = 5000): UseInstancesReturn {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [stats, setStats] = useState<InstanceStats | null>(null);
  const [history, setHistory] = useState<InstanceContextHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [instancesRes, statsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/instances`),
        fetch(`${API_BASE}/instances/stats`),
        fetch(`${API_BASE}/instances/history`),
      ]);

      if (instancesRes.ok) {
        const data = await instancesRes.json();
        setInstances(data.data || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.data);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.data || []);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to fetch instances";
      setError(message);
      console.error("Failed to fetch instances:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteInstance = useCallback(async (pid: number): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/instances/${pid}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to delete instance");
      }

      await fetchData();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete instance");
      return false;
    }
  }, [fetchData]);

  // Initial load + polling
  useEffect(() => {
    let isInitialLoad = true;

    const poll = async () => {
      if (isInitialLoad) {
        setLoading(true);
      }
      await fetchData();
      if (isInitialLoad) {
        setLoading(false);
        isInitialLoad = false;
      }
    };

    poll();
    const interval = setInterval(poll, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  return {
    instances,
    stats,
    history,
    loading,
    error,
    refetch: fetchData,
    deleteInstance,
  };
}
