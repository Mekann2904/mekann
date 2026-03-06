/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/web/hooks/use-benchmark.ts
 * @role agent benchmark 状態取得フック
 * @why Web UI で benchmark 比較結果を取得して再利用するため
 * @related web/api/client.ts, web/atoms/index.ts, schemas/benchmark.schema.ts
 * @public_api useBenchmarkStatus
 */

import { useAtom } from "jotai";
import { useCallback, useEffect } from "preact/hooks";
import { benchmarkStatusAtom, isLoadingAtom, notificationAtom } from "../atoms/index.js";
import { apiClient, ApiError } from "../api/client.js";

export function useBenchmarkStatus(input?: {
  cwd?: string;
  limit?: number;
  variantId?: string;
}) {
  const [status, setStatus] = useAtom(benchmarkStatusAtom);
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  const [, setNotification] = useAtom(notificationAtom);

  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.benchmark.status(input);
      setStatus(data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "benchmark 取得に失敗しました";
      setNotification({ message, type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [input, setIsLoading, setNotification, setStatus]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    refetch: fetchStatus,
  };
}
