/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/web/src/hooks/useFetch.ts
 * @role Generic fetch hook for API calls
 * @why Centralize fetch logic to reduce duplication across 28 fetch call sites
 * @related tasks-page.tsx, agent-usage-page.tsx, useTaskData.ts
 * @public_api useFetch, UseFetchOptions, UseFetchReturn
 * @invariants Only one request at a time per hook instance
 * @side_effects Makes HTTP requests, calls success/error callbacks
 * @failure_modes Network error, HTTP error response
 *
 * @abdd.explain
 * @overview Generic fetch hook with loading/error state
 * @what_it_does Provides declarative fetch with loading state, error handling, and callbacks
 * @why_it_exists Reduces boilerplate for API calls across the codebase
 * @scope(in) URL, request options, callbacks
 * @scope(out) Data, loading state, error state, execute function
 */

import { useState, useCallback } from "preact/hooks";

export interface UseFetchOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  showErrorToast?: boolean;
}

export interface UseFetchReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: () => Promise<T | null>;
}

export function useFetch<T>(
  url: string,
  options?: RequestInit & UseFetchOptions<T>
): UseFetchReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
      options?.onSuccess?.(json);
      return json;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options?.onError?.(error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  return { data, loading, error, execute };
}
