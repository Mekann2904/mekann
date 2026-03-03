/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/hooks/use-instances.ts
 * @role インスタンス関連のカスタムフック
 * @why インスタンスデータの取得・更新
 * @related atoms/index.ts, api/client.ts
 * @public_api useInstances, useInstanceStats, useContextHistory
 * @invariants フックはコンポーネント内でのみ使用
 * @side_effects APIリクエスト、atom更新
 * @failure_modes APIエラー
 *
 * @abdd.explain
 * @overview インスタンスデータを管理するReactフック
 * @what_it_does データ取得、キャッシュ、自動更新
 * @why_it_exists ロジックとUIの分離
 * @scope(in) なし
 * @scope(out) インスタンスデータ、ローディング状態
 */

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useCallback } from "preact/hooks";
import {
  instancesAtom,
  instanceStatsAtom,
  contextHistoryAtom,
  selectedInstancePidAtom,
  isLoadingAtom,
  notificationAtom,
} from "../atoms/index.js";
import { apiClient, ApiError } from "../api/client.js";

/**
 * インスタンス一覧フック
 */
export function useInstances() {
  const [instances, setInstances] = useAtom(instancesAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const setNotification = useSetAtom(notificationAtom);

  const fetchInstances = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.instances.list();
      setInstances(data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "インスタンス取得に失敗しました";
      setNotification({ message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [setInstances, setIsLoading, setNotification]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  return {
    instances,
    isLoading,
    refetch: fetchInstances,
  };
}

/**
 * インスタンス統計フック
 */
export function useInstanceStats() {
  const [stats, setStats] = useAtom(instanceStatsAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const setNotification = useSetAtom(notificationAtom);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.instances.stats();
      setStats(data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "統計取得に失敗しました";
      setNotification({ message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [setStats, setIsLoading, setNotification]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
}

/**
 * コンテキスト履歴フック
 */
export function useContextHistory() {
  const [history, setHistory] = useAtom(contextHistoryAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const setNotification = useSetAtom(notificationAtom);

  const fetchHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.instances.history();
      setHistory(data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "履歴取得に失敗しました";
      setNotification({ message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [setHistory, setIsLoading, setNotification]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    isLoading,
    refetch: fetchHistory,
  };
}

/**
 * 選択中インスタンスフック
 */
export function useSelectedInstance() {
  const [selectedPid, setSelectedPid] = useAtom(selectedInstancePidAtom);
  const instances = useAtomValue(instancesAtom);

  const selectedInstance = instances.find((i) => i.pid === selectedPid) ?? null;

  return {
    selectedInstance,
    selectedPid,
    setSelectedPid,
    clearSelection: () => setSelectedPid(null),
  };
}

/**
 * インスタンス削除フック
 */
export function useDeleteInstance() {
  const setInstances = useSetAtom(instancesAtom);
  const setNotification = useSetAtom(notificationAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);

  const deleteInstance = useCallback(
    async (pid: number) => {
      try {
        setIsLoading(true);
        await apiClient.instances.delete(pid);
        setInstances((prev) => prev.filter((i) => i.pid !== pid));
        setNotification({ message: "インスタンスを削除しました", type: "success" });
        return true;
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "削除に失敗しました";
        setNotification({ message, type: "error" });
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [setInstances, setIsLoading, setNotification]
  );

  return {
    deleteInstance,
    isLoading,
  };
}
