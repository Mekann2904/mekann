/**
 * @abdd.meta
 * path: .pi/lib/semantic-cache.ts
 * role: セマンティック類似度に基づくサブエージェント結果キャッシュ。タスクの意味的類似性を検出し、同一タスクの再実行を回避する。
 * why: "Implement X"と"Create implementation for X"のような意味的に等価なタスクをキャッシュヒットさせ、トークン消費とレイテンシを削減するため。
 * related: .pi/extensions/subagents.ts, .pi/lib/agent/subagent-types.ts, .pi/lib/cost-estimator.ts
 * public_api: CacheEntry, SemanticCacheConfig, SemanticCache
 * invariants: エントリ数はmaxEntriesを超えない。TTL経過したエントリは検索対象外。類似度しきい値は0.0-1.0の範囲。
 * side_effects: メモリ上のキャッシュエントリの追加・削除。embeddingProvider呼び出し（外部API）。
 * failure_modes: embeddingProviderの障害時はキャッシュヒットなしでフォールバック。ファイルハッシュ不一致時は無効化。
 * @abdd.explain
 * overview: 埋め込みベクトルの類似度計算により、意味的に近いタスクの結果を再利用するキャッシュシステム。
 * what_it_does:
 *   - タスクの埋め込みベクトルを生成し、コサイン類似度で既存エントリと比較
 *   - 類似度しきい値を超えるエントリをキャッシュヒットとして返却
 *   - ファイルハッシュによる依存ファイル変更検出とキャッシュ無効化
 *   - LRUベースのエントリ削除でメモリ使用量を制御
 * why_it_exists:
 *   - 完全一致キャッシュでは捕捉できない意味的に等価なタスクの再利用のため
 *   - トークン消費とAPI呼び出しコストの削減のため
 *   - 類似タスクの高速化のため
 * scope:
 *   in: task文字列, agentId, fileHashes, embeddingProvider
 *   out: キャッシュヒット時の結果、エントリ追加の成否
 */

/**
 * Cache entry for semantic result reuse
 * @summary キャッシュエントリ
 */
export interface CacheEntry {
  /** Unique cache key */
  key: string;
  /** Embedding vector (lazy-loaded) */
  embedding?: number[];
  /** Original task string */
  task: string;
  /** Agent identifier */
  agentId: string;
  /** Cached result */
  result: unknown;
  /** Creation timestamp (ms) */
  timestamp: number;
  /** File hashes for dependency tracking */
  fileHashes: Record<string, string>;
}

/**
 * Configuration for semantic cache
 * @summary セマンティックキャッシュ設定
 */
export interface SemanticCacheConfig {
  /** Enable semantic caching */
  enabled: boolean;
  /** Cosine similarity threshold (0.0-1.0) */
  similarityThreshold: number;
  /** Maximum number of entries */
  maxEntries: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
}

/**
 * Default configuration
 * @summary デフォルト設定
 */
export const DEFAULT_SEMANTIC_CACHE_CONFIG: SemanticCacheConfig = {
  enabled: true,
  similarityThreshold: 0.85,
  maxEntries: 1000,
  ttlMs: 1_800_000, // 30 minutes
};

/**
 * Embedding provider function type
 * @summary 埋め込みプロバイダー型
 */
export type EmbeddingProvider = (text: string) => Promise<number[]>;

/**
 * Semantic cache manager for subagent result reuse
 * @summary セマンティックキャッシュ管理
 */
export class SemanticCache {
  private entries: CacheEntry[] = [];
  private embeddingProvider?: EmbeddingProvider;

  /**
   * Create semantic cache instance
   * @summary インスタンス生成
   * @param config - Cache configuration
   * @param embeddingProvider - Function to generate embeddings
   */
  constructor(
    private config: SemanticCacheConfig = DEFAULT_SEMANTIC_CACHE_CONFIG,
    embeddingProvider?: EmbeddingProvider,
  ) {
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * Find semantically similar cached result
   * @summary 類似結果検索
   * @param task - Task description to search for
   * @param agentId - Agent identifier
   * @param fileHashes - Current file hashes for dependency checking
   * @returns Matching cache entry or null
   */
  async findSimilar(
    task: string,
    agentId: string,
    fileHashes: Record<string, string>,
  ): Promise<CacheEntry | null> {
    if (!this.config.enabled || !this.embeddingProvider) {
      return null;
    }

    const now = Date.now();

    // Filter by agent, TTL, and file hash compatibility
    const candidates = this.entries.filter((e) => {
      // Check agent match
      if (e.agentId !== agentId) return false;

      // Check TTL
      if (now - e.timestamp > this.config.ttlMs) return false;

      // Check file hash compatibility
      if (!this.isFileHashCompatible(e.fileHashes, fileHashes)) return false;

      return true;
    });

    if (candidates.length === 0) {
      return null;
    }

    // Generate embedding for the query task
    let taskEmbedding: number[];
    try {
      taskEmbedding = await this.embeddingProvider(task);
    } catch {
      // Embedding generation failed - skip semantic matching
      return null;
    }

    // Find best match by cosine similarity
    let bestMatch: CacheEntry | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      // Lazy-load embedding if needed
      if (!candidate.embedding) {
        try {
          candidate.embedding = await this.embeddingProvider(candidate.task);
        } catch {
          // Skip this candidate if embedding fails
          continue;
        }
      }

      const similarity = this.cosineSimilarity(taskEmbedding, candidate.embedding);

      if (similarity > bestSimilarity && similarity >= this.config.similarityThreshold) {
        bestSimilarity = similarity;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  /**
   * Add entry to cache
   * @summary エントリ追加
   * @param task - Task description
   * @param agentId - Agent identifier
   * @param result - Result to cache
   * @param fileHashes - File hashes for dependency tracking
   * @returns Added entry
   */
  async add(
    task: string,
    agentId: string,
    result: unknown,
    fileHashes: Record<string, string>,
  ): Promise<CacheEntry> {
    const entry: CacheEntry = {
      key: `${agentId}:${task.slice(0, 64)}`,
      task,
      agentId,
      result,
      timestamp: Date.now(),
      fileHashes,
    };

    this.entries.push(entry);

    // Evict oldest if over limit
    if (this.entries.length > this.config.maxEntries) {
      this.evictOldest();
    }

    return entry;
  }

  /**
   * Clear all cache entries
   * @summary キャッシュクリア
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get cache statistics
   * @summary キャッシュ統計取得
   * @returns Statistics object
   */
  getStats(): { entryCount: number; maxEntries: number; enabled: boolean } {
    return {
      entryCount: this.entries.length,
      maxEntries: this.config.maxEntries,
      enabled: this.config.enabled,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   * @summary コサイン類似度計算
   * @param a - First vector
   * @param b - Second vector
   * @returns Similarity score (0.0-1.0)
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) {
      return 0;
    }

    return dotProduct / denom;
  }

  /**
   * Check if file hashes are compatible (no conflicts)
   * @summary ファイルハッシュ互換性チェック
   * @param cached - Cached file hashes
   * @param current - Current file hashes
   * @returns True if compatible (no conflicts)
   */
  private isFileHashCompatible(
    cached: Record<string, string>,
    current: Record<string, string>,
  ): boolean {
    // If cached entry referenced files, they must match current hashes
    for (const [file, hash] of Object.entries(cached)) {
      const currentHash = current[file];
      if (currentHash !== undefined && currentHash !== hash) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evict oldest entries to stay under limit
   * @summary 古いエントリの削除
   */
  private evictOldest(): void {
    // Sort by timestamp (oldest first) and remove excess
    this.entries.sort((a, b) => a.timestamp - b.timestamp);
    const excess = this.entries.length - this.config.maxEntries;
    if (excess > 0) {
      this.entries = this.entries.slice(excess);
    }
  }
}

/**
 * Create a simple hash-based file hash map
 * @summary ファイルハッシュマップ生成
 * @param files - File paths to hash
 * @param readContent - Function to read file content
 * @returns Map of file paths to hashes
 */
export async function createFileHashMap(
  files: string[],
  readContent: (path: string) => Promise<string>,
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};

  for (const file of files) {
    try {
      const content = await readContent(file);
      // Simple hash: use length and first/last chars for quick comparison
      hashes[file] = `${content.length}:${content.slice(0, 32)}:${content.slice(-32)}`;
    } catch {
      // File not readable - skip
    }
  }

  return hashes;
}

// Singleton instance for shared use
let sharedSemanticCache: SemanticCache | null = null;

/**
 * Get or create shared semantic cache instance
 * @summary 共有セマンティックキャッシュ取得
 * @param config - Optional configuration override
 * @param embeddingProvider - Optional embedding provider override
 * @returns Shared SemanticCache instance
 */
export function getSharedSemanticCache(
  config?: Partial<SemanticCacheConfig>,
  embeddingProvider?: EmbeddingProvider,
): SemanticCache {
  if (!sharedSemanticCache || config || embeddingProvider) {
    sharedSemanticCache = new SemanticCache(
      { ...DEFAULT_SEMANTIC_CACHE_CONFIG, ...config },
      embeddingProvider,
    );
  }
  return sharedSemanticCache;
}
