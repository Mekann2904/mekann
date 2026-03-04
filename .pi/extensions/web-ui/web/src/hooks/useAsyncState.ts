/**
 * @summary 非同期データ取得用フック
 * @description ローディング状態、エラー状態、データを管理する汎用フック
 */

import { useState, useEffect, useCallback } from "preact/hooks";

/**
 * useAsyncStateの戻り値の型
 */
export interface AsyncStateResult<T> {
  /** 取得したデータ */
  data: T | null;
  /** ローディング中かどうか */
  loading: boolean;
  /** エラー情報 */
  error: Error | null;
  /** データを再取得する関数 */
  refetch: () => Promise<void>;
}

/**
 * useAsyncStateのオプション
 */
export interface AsyncStateOptions {
  /** 即座に実行するか（デフォルト: true） */
  immediate?: boolean;
}

/**
 * 非同期データ取得用のカスタムフック
 *
 * @summary ローディング・エラー状態を自動管理するデータ取得フック
 * @param fetchFn データ取得関数
 * @param options オプション設定
 * @returns データ、ローディング状態、エラー、再取得関数
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useAsyncState(
 *   async () => {
 *     const res = await fetch("/api/data");
 *     return res.json();
 *   }
 * );
 *
 * if (loading) return <LoadingState />;
 * if (error) return <ErrorBanner message={error.message} />;
 * return <DataDisplay data={data} />;
 * ```
 */
export function useAsyncState<T>(
  fetchFn: () => Promise<T>,
  options: AsyncStateOptions = {}
): AsyncStateResult<T> {
  const { immediate = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [fetchFn]);

  useEffect(() => {
    if (immediate) {
      refetch();
    }
  }, [immediate, refetch]);

  return { data, loading, error, refetch };
}
