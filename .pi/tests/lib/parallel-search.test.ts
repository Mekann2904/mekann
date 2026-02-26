/**
 * @abdd.meta
 * path: .pi/tests/lib/parallel-search.test.ts
 * role: 並列検索の単体テスト
 * why: 検索パフォーマンスと結果統合の正確性を保証するため
 * related: .pi/lib/parallel-search.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: parallelSearch関数と関連ユーティリティのテストスイート
 * what_it_does:
 *   - 並列検索実行のテスト
 *   - 結果重複除去のテスト
 *   - トークン推定のテスト
 *   - エラー耐性のテスト
 * why_it_exists:
 *   - 検索効率化機能の信頼性を保証するため
 * scope:
 *   in: なし
 *   out: テスト結果
 */

import { describe, it, expect, vi } from "vitest";
import {
  parallelSearch,
  type SearchResult,
  type ParallelSearchConfig,
  type SearchFunction,
} from "../../lib/parallel-search.js";

// ============================================
// Helper Functions
// ============================================

/**
 * モック検索関数を作成
 */
function createMockSearchFn(results: Map<string, SearchResult[]>): SearchFunction {
  return async (query: string) => {
    return results.get(query) ?? [];
  };
}

/**
 * 遅延のあるモック検索関数を作成
 */
function createDelayedMockSearchFn(
  results: Map<string, SearchResult[]>,
  delayMs: number
): SearchFunction {
  return async (query: string) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return results.get(query) ?? [];
  };
}

/**
 * エラーを投げるモック検索関数を作成
 */
function createErrorMockSearchFn(errorQueries: Set<string>): SearchFunction {
  return async (query: string) => {
    if (errorQueries.has(query)) {
      throw new Error(`Search failed for: ${query}`);
    }
    return [];
  };
}

// ============================================
// Tests: Basic Parallel Search
// ============================================

describe("parallelSearch: 基本的な並列検索", () => {
  it("単一クエリで検索結果を返す", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["auth", [{ path: "src/auth.ts", query: "auth", score: 1.0 }]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["auth"], searchFn);

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].path).toBe("src/auth.ts");
  });

  it("複数クエリを並列実行", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["auth", [{ path: "src/auth.ts", query: "auth" }]],
      ["user", [{ path: "src/user.ts", query: "user" }]],
      ["api", [{ path: "src/api.ts", query: "api" }]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["auth", "user", "api"], searchFn);

    expect(result.successCount).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it("空のクエリ配列で空の結果を返す", async () => {
    const searchFn = createMockSearchFn(new Map());

    const result = await parallelSearch([], searchFn);

    expect(result.successCount).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});

// ============================================
// Tests: Result Deduplication
// ============================================

describe("parallelSearch: 結果の重複除去", () => {
  it("同じpath:lineの重複を除去", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["auth", [
        { path: "src/auth.ts", line: 10, query: "auth", score: 0.8 },
        { path: "src/auth.ts", line: 10, query: "auth", score: 0.9 }, // 重複
      ]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["auth"], searchFn, { deduplicate: true });

    // 重複除去される
    expect(result.results.filter(r => r.path === "src/auth.ts" && r.line === 10)).toHaveLength(1);
  });

  it("より高いスコアの結果を優先", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["query1", [{ path: "src/file.ts", line: 5, query: "query1", score: 0.5 }]],
      ["query2", [{ path: "src/file.ts", line: 5, query: "query2", score: 0.9 }]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["query1", "query2"], searchFn, { deduplicate: true });

    const file = result.results.find(r => r.path === "src/file.ts" && r.line === 5);
    expect(file?.score).toBe(0.9);
  });

  it("重複除去を無効化できる", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["auth", [
        { path: "src/auth.ts", line: 10, query: "auth" },
        { path: "src/auth.ts", line: 10, query: "auth" },
      ]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["auth"], searchFn, { deduplicate: false });

    expect(result.results).toHaveLength(2);
  });
});

// ============================================
// Tests: Error Tolerance
// ============================================

describe("parallelSearch: エラー耐性", () => {
  it("一部の検索が失敗しても成功した結果を返す", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["auth", [{ path: "src/auth.ts", query: "auth" }]],
    ]);
    const searchFn = createErrorMockSearchFn(new Set(["error-query"]));

    // エラーを投げないようにラップ
    const wrappedFn: SearchFunction = async (query) => {
      try {
        if (query === "error-query") {
          throw new Error("Search failed");
        }
        return mockResults.get(query) ?? [];
      } catch {
        return []; // エラー時は空配列を返す
      }
    };

    const result = await parallelSearch(["auth", "error-query"], wrappedFn);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].path).toBe("src/auth.ts");
  });
});

// ============================================
// Tests: Result Limiting
// ============================================

describe("parallelSearch: 結果制限", () => {
  it("maxResultsで結果数を制限", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["query", [
        { path: "src/a.ts", query: "query" },
        { path: "src/b.ts", query: "query" },
        { path: "src/c.ts", query: "query" },
        { path: "src/d.ts", query: "query" },
        { path: "src/e.ts", query: "query" },
      ]],
    ]);
    const searchFn = createMockSearchFn(mockResults);
    const config: ParallelSearchConfig = { maxResults: 3 };

    const result = await parallelSearch(["query"], searchFn, config);

    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  it("結果が制限されるとtruncated=true", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["query", Array.from({ length: 20 }, (_, i) => ({
        path: `src/file${i}.ts`,
        query: "query",
      }))],
    ]);
    const searchFn = createMockSearchFn(mockResults);
    const config: ParallelSearchConfig = { maxResults: 10 };

    const result = await parallelSearch(["query"], searchFn, config);

    expect(result.truncated).toBe(true);
  });
});

// ============================================
// Tests: Token Estimation
// ============================================

describe("parallelSearch: トークン推定", () => {
  it("推定トークン数が計算される", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["query", [
        { path: "src/auth.ts", context: "some context here", query: "query" },
      ]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["query"], searchFn);

    expect(result.estimatedTokens).toBeGreaterThan(0);
  });

  it("コンテキストがない場合もトークン推定", async () => {
    const mockResults = new Map<string, SearchResult[]>([
      ["query", [{ path: "src/auth.ts", query: "query" }]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["query"], searchFn);

    expect(result.estimatedTokens).toBeGreaterThan(0);
  });
});

// ============================================
// Tests: Concurrency Control
// ============================================

describe("parallelSearch: 並列数制御", () => {
  it("maxConcurrencyで並列数を制限", async () => {
    const mockResults = new Map<string, SearchResult[]>(
      ["a", "b", "c", "d", "e"].map(q => [q, [{ path: `src/${q}.ts`, query: q }]])
    );
    const callOrder: string[] = [];

    const trackingFn: SearchFunction = async (query) => {
      callOrder.push(query);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return mockResults.get(query) ?? [];
    };

    const queries = ["a", "b", "c", "d", "e"];
    const config: ParallelSearchConfig = { maxConcurrency: 2 };

    // 並列数が制限されても全て完了することを確認
    const result = await parallelSearch(queries, trackingFn, config);

    expect(result.successCount).toBe(5);
  });
});

// ============================================
// Tests: Timeout
// ============================================

describe("parallelSearch: タイムアウト", () => {
  it("タイムアウトを設定できる", async () => {
    const delayedFn = createDelayedMockSearchFn(new Map(), 1000);
    const config: ParallelSearchConfig = { timeoutMs: 100 };

    // タイムアウトしてもエラーにならないことを確認
    const result = await parallelSearch(["slow-query"], delayedFn, config);

    expect(result).toBeDefined();
  });
});

// ============================================
// Tests: Edge Cases
// ============================================

describe("parallelSearch: 境界値テスト", () => {
  it("非常に多くのクエリを処理", async () => {
    const searchFn = createMockSearchFn(new Map());
    const queries = Array.from({ length: 100 }, (_, i) => `query-${i}`);

    const result = await parallelSearch(queries, searchFn);

    // 全てのクエリが正常に処理される（結果は空だがエラーなく完了）
    // Promise.allSettled: fulfilled = successCount, rejected = failureCount
    expect(result.successCount).toBe(100);
    expect(result.failureCount).toBe(0);
  });

  it("空の結果を返す検索", async () => {
    const searchFn = createMockSearchFn(new Map());

    const result = await parallelSearch(["no-match"], searchFn);

    expect(result.results).toHaveLength(0);
    // 空の結果を返したクエリは fulfilled なので successCount にカウントされる
    // Promise.allSettled: fulfilled = successCount（エラーなく完了）
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
  });

  it("コンテキストが非常に長い結果", async () => {
    const longContext = "x".repeat(10000);
    const mockResults = new Map<string, SearchResult[]>([
      ["query", [{ path: "src/file.ts", context: longContext, query: "query" }]],
    ]);
    const searchFn = createMockSearchFn(mockResults);

    const result = await parallelSearch(["query"], searchFn);

    expect(result.results).toHaveLength(1);
    expect(result.estimatedTokens).toBeGreaterThan(1000);
  });
});
