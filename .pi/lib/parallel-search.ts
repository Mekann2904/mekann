/**
 * @abdd.meta
 * path: .pi/lib/parallel-search.ts
 * role: 複数検索の並列実行と結果統合
 * why: 検索パフォーマンス向上とコンテキスト効率化
 * related: .pi/lib/file-filter.ts, .pi/skills/search-tools/SKILL.md, .pi/extensions/search/index.ts
 * public_api: parallelSearch, ParallelSearchResult, ParallelSearchConfig
 * invariants: 全ての検索が完了するまで結果を返さない
 * side_effects: なし（外部検索ツールの呼び出しのみ）
 * failure_modes: 個別検索エラーは結果に含まず、成功した結果のみ返す
 * @abdd.explain
 * overview: 複数の検索クエリを並列実行し、結果を統合・重複除去するモジュール
 * what_it_does:
 *   - 複数検索クエリの並列実行（Promise.all活用）
 *   - 結果の重複除去とマージ
 *   - コンテキスト予算に基づく結果制限
 *   - エラー耐性（一部失敗しても成功結果を返す）
 * why_it_exists:
 *   - 逐次検索のパフォーマンス問題を解決するため
 *   - AutoCodeRover論文の「階層的文脈検索」を効率化するため
 * scope:
 *   in: 検索クエリ配列, コンテキスト予算（オプション）
 *   out: 統合された検索結果, メタデータ
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 個別の検索結果
 * @summary 単一検索結果
 */
export interface SearchResult {
  /** ファイルパス */
  path: string;
  /** 行番号（オプション） */
  line?: number;
  /** コンテキスト（前後の行など） */
  context?: string;
  /** 検索元クエリ */
  query: string;
  /** スコア（関連度） */
  score?: number;
}

/**
 * 並列検索の設定
 * @summary 並列検索設定
 */
export interface ParallelSearchConfig {
  /** 最大並列数 */
  maxConcurrency?: number;
  /** コンテキスト予算（トークン数） */
  contextBudget?: number;
  /** 結果の最大数 */
  maxResults?: number;
  /** 重複除去フラグ */
  deduplicate?: boolean;
  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
}

/**
 * 並列検索の結果
 * @summary 並列検索結果
 */
export interface ParallelSearchResult {
  /** 統合された検索結果 */
  results: SearchResult[];
  /** 成功した検索数 */
  successCount: number;
  /** 失敗した検索数 */
  failureCount: number;
  /** 推定トークン数 */
  estimatedTokens: number;
  /** 切り捨てフラグ */
  truncated: boolean;
}

/**
 * 検索関数の型
 * @summary 検索関数型
 */
export type SearchFunction = (query: string) => Promise<SearchResult[]>;

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * 結果のトークン数を推定
 * @summary トークン数推定
 * @param results 検索結果配列
 * @returns 推定トークン数
 * @description 簡易的な推定として、文字数を4で割る（英語基準）
 */
function estimateTokens(results: SearchResult[]): number {
  const totalChars = results.reduce((sum, r) => {
    const context = r.context ?? "";
    return sum + r.path.length + context.length;
  }, 0);
  // 英語: 1トークン ≈ 4文字, 日本語: 1トークン ≈ 2文字
  // 安全側として3で割る
  return Math.ceil(totalChars / 3);
}

// ============================================================================
// Deduplication
// ============================================================================

/**
 * 結果を重複除去
 * @summary 結果重複除去
 * @param results 検索結果配列
 * @returns 重複除去後の結果
 * @description path:line をキーとして重複除去
 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const result of results) {
    const key = result.line !== undefined
      ? `${result.path}:${result.line}`
      : result.path;

    if (!seen.has(key)) {
      seen.set(key, result);
    } else {
      // 既存の結果より高いスコアなら更新
      const existing = seen.get(key)!;
      if (result.score !== undefined && (existing.score ?? 0) < result.score) {
        seen.set(key, result);
      }
    }
  }

  return [...seen.values()];
}

// ============================================================================
// Parallel Search
// ============================================================================

/**
 * 複数の検索を並列実行
 * @summary 並列検索実行
 * @param queries 検索クエリ配列
 * @param searchFn 検索関数
 * @param config 設定
 * @returns 統合された検索結果
 * @description
 *   - Promise.allで並列実行
 *   - 個別エラーは無視して成功結果のみ統合
 *   - コンテキスト予算内に収まるよう調整
 */
export async function parallelSearch(
  queries: string[],
  searchFn: SearchFunction,
  config: ParallelSearchConfig = {}
): Promise<ParallelSearchResult> {
  const {
    contextBudget = 5000,
    maxResults = 50,
    deduplicate = true,
    timeoutMs = 30000,
  } = config;

  // タイムアウト付きの検索実行
  const searchWithTimeout = async (query: string): Promise<SearchResult[]> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Search timeout")), timeoutMs);
      });

      const results = await Promise.race([
        searchFn(query),
        timeoutPromise,
      ]);

      return results.map(r => ({ ...r, query }));
    } catch {
      return [];
    }
  };

  // 並列実行
  const allResults = await Promise.all(queries.map(searchWithTimeout));

  // 統合
  let mergedResults = allResults.flat();

  // 成功・失敗カウント
  const successCount = allResults.filter(r => r.length > 0).length;
  const failureCount = queries.length - successCount;

  // 重複除去
  if (deduplicate) {
    mergedResults = deduplicateResults(mergedResults);
  }

  // スコア順ソート
  mergedResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // コンテキスト予算内に収める
  let truncated = false;
  let estimatedTokens = estimateTokens(mergedResults);

  if (estimatedTokens > contextBudget) {
    // 予算内に収まるまで結果を減らす
    while (mergedResults.length > 0 && estimateTokens(mergedResults) > contextBudget) {
      mergedResults.pop();
    }
    truncated = true;
    estimatedTokens = estimateTokens(mergedResults);
  }

  // maxResultsで制限
  if (mergedResults.length > maxResults) {
    mergedResults = mergedResults.slice(0, maxResults);
    truncated = true;
    estimatedTokens = estimateTokens(mergedResults);
  }

  return {
    results: mergedResults,
    successCount,
    failureCount,
    estimatedTokens,
    truncated,
  };
}

/**
 * 複数の検索関数を並列実行
 * @summary 複数検索関数並列実行
 * @param searchFns 検索関数とクエリのペア配列
 * @param config 設定
 * @returns 統合された検索結果
 * @description 異なる検索ツール（file_candidates, code_search等）を並列実行
 */
export async function parallelMultiToolSearch(
  searchFns: Array<{ fn: SearchFunction; query: string }>,
  config: ParallelSearchConfig = {}
): Promise<ParallelSearchResult> {
  const {
    contextBudget = 5000,
    maxResults = 50,
    deduplicate = true,
    timeoutMs = 30000,
  } = config;

  // 各検索関数をタイムアウト付きで実行
  const searchWithTimeout = async ({
    fn,
    query,
  }: {
    fn: SearchFunction;
    query: string;
  }): Promise<SearchResult[]> => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Search timeout")), timeoutMs);
      });

      const results = await Promise.race([fn(query), timeoutPromise]);

      return results.map(r => ({ ...r, query }));
    } catch {
      return [];
    }
  };

  // 並列実行
  const allResults = await Promise.all(searchFns.map(searchWithTimeout));

  // 統合
  let mergedResults = allResults.flat();

  // 成功・失敗カウント
  const successCount = allResults.filter(r => r.length > 0).length;
  const failureCount = searchFns.length - successCount;

  // 重複除去
  if (deduplicate) {
    mergedResults = deduplicateResults(mergedResults);
  }

  // スコア順ソート
  mergedResults.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  // コンテキスト予算内に収める
  let truncated = false;
  let estimatedTokens = estimateTokens(mergedResults);

  if (estimatedTokens > contextBudget) {
    while (mergedResults.length > 0 && estimateTokens(mergedResults) > contextBudget) {
      mergedResults.pop();
    }
    truncated = true;
    estimatedTokens = estimateTokens(mergedResults);
  }

  // maxResultsで制限
  if (mergedResults.length > maxResults) {
    mergedResults = mergedResults.slice(0, maxResults);
    truncated = true;
    estimatedTokens = estimateTokens(mergedResults);
  }

  return {
    results: mergedResults,
    successCount,
    failureCount,
    estimatedTokens,
    truncated,
  };
}
