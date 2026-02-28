/**
 * @abdd.meta
 * path: .pi/lib/agent-memory.ts
 * role: RepoAudit論文のAgent Memory概念を実装するセマンティックキャッシュ
 * why: 探索結果のキャッシュと再利用により、重複分析を回避し効率化するため
 * related: .pi/extensions/repo-audit-orchestrator.ts, .pi/skills/bug-hunting/SKILL.md
 * public_api: AgentMemory, getGlobalAgentMemory, CachedFinding
 * invariants: TTL期限内のエントリのみ返却、maxSize超過時は最古を削除
 * side_effects: メモリ使用、キャッシュの永続化（オプション）
 * failure_modes: キャッシュミス、TTL期限切れ、メモリ不足
 * @abdd.explain
 * overview: RepoAudit論文のAgent Memory概念を実装したセマンティックキャッシュシステム
 * what_it_does:
 *   - 探索需要と結果のペアをキャッシュ
 *   - TTLベースの自動期限切れ
 *   - LRUベースのサイズ管理
 *   - クエリによる類似結果の検索
 * why_it_exists: 需要駆動探索の効率化と、重複分析の回避
 * scope:
 *   in: ExplorationDemand, 検索クエリ
 *   out: CachedFinding, キャッシュ統計
 */

// =============================================================================
// 型定義
// =============================================================================

/**
 * キャッシュされた発見
 * @summary キャッシュエントリ
 */
export interface CachedFinding {
  /** 需要ID */
  demandId: string;
  /** クエリ文字列 */
  query: string;
  /** 結果 */
  result: string;
  /** タイムスタンプ */
  timestamp: number;
  /** 信頼度 */
  confidence: number;
  /** ソース（ファイル:行など） */
  source: string;
  /** 関連需要 */
  relatedDemands?: string[];
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * キャッシュ統計
 * @summary 統計情報
 */
export interface CacheStats {
  /** 現在のエントリ数 */
  size: number;
  /** 最大エントリ数 */
  maxSize: number;
  /** 総ヒット数 */
  totalHits: number;
  /** 総ミス数 */
  totalMisses: number;
  /** ヒット率 */
  hitRate: number;
  /** 平均エントリ年齢（ms） */
  averageAge: number;
}

/**
 * Agent Memory設定
 * @summary メモリ設定
 */
export interface AgentMemoryConfig {
  /** 最大エントリ数 */
  maxSize: number;
  /** デフォルトTTL（ms） */
  defaultTTL: number;
  /** 類似度閾値（0.0-1.0） */
  similarityThreshold: number;
  /** 永続化を有効にするか */
  enablePersistence: boolean;
  /** 永続化ファイルパス */
  persistencePath?: string;
}

/**
 * 検索オプション
 * @summary 検索設定
 */
export interface SearchOptions {
  /** TTLをチェックするか */
  checkTTL: boolean;
  /** 類似度検索を有効にするか */
  enableSimilarity: boolean;
  /** 最大結果数 */
  maxResults: number;
}

// =============================================================================
// デフォルト設定
// =============================================================================

const DEFAULT_CONFIG: AgentMemoryConfig = {
  maxSize: 1000,
  defaultTTL: 300000, // 5分
  similarityThreshold: 0.85,
  enablePersistence: false,
};

// =============================================================================
// AgentMemoryクラス
// =============================================================================

/**
 * エージェントメモリ
 * RepoAudit論文のAgent Memory概念を実装
 * @summary セマンティックキャッシュ
 */
export class AgentMemory {
  private cache: Map<string, CachedFinding> = new Map();
  private config: AgentMemoryConfig;
  private stats = {
    totalHits: 0,
    totalMisses: 0,
  };

  constructor(config: Partial<AgentMemoryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * キャッシュに保存
   * @summary 結果をキャッシュ
   * @param demandId 需要ID
   * @param query クエリ
   * @param result 結果
   * @param confidence 信頼度
   * @param source ソース
   * @param metadata メタデータ
   */
  set(
    demandId: string,
    query: string,
    result: string,
    confidence: number,
    source: string,
    metadata?: Record<string, unknown>
  ): void {
    // サイズ制限チェック
    if (this.cache.size >= this.config.maxSize) {
      this.invalidateOldest();
    }

    const finding: CachedFinding = {
      demandId,
      query,
      result,
      timestamp: Date.now(),
      confidence: Math.max(0, Math.min(1, confidence)),
      source,
      metadata,
    };

    this.cache.set(demandId, finding);
  }

  /**
   * キャッシュから取得
   * @summary IDでキャッシュ取得
   * @param demandId 需要ID
   * @returns キャッシュエントリ（TTL期限切れの場合はnull）
   */
  get(demandId: string): CachedFinding | null {
    const finding = this.cache.get(demandId);

    if (!finding) {
      this.stats.totalMisses++;
      return null;
    }

    // TTLチェック
    if (this.isExpired(finding)) {
      this.cache.delete(demandId);
      this.stats.totalMisses++;
      return null;
    }

    this.stats.totalHits++;
    return finding;
  }

  /**
   * クエリで検索
   * @summary 完全一致クエリで検索
   * @param query クエリ
   * @param options 検索オプション
   * @returns キャッシュエントリ
   */
  findByQuery(query: string, options: Partial<SearchOptions> = {}): CachedFinding | null {
    const opts: SearchOptions = {
      checkTTL: true,
      enableSimilarity: false,
      maxResults: 1,
      ...options,
    };

    for (const finding of this.cache.values()) {
      // 完全一致
      if (finding.query === query) {
        if (opts.checkTTL && this.isExpired(finding)) {
          this.cache.delete(finding.demandId);
          continue;
        }
        this.stats.totalHits++;
        return finding;
      }
    }

    this.stats.totalMisses++;
    return null;
  }

  /**
   * 類似クエリで検索
   * @summary 文字列類似度で検索（簡易実装）
   * @param query クエリ
   * @param threshold 類似度閾値
   * @returns 類似するキャッシュエントリの配列
   */
  findSimilar(query: string, threshold?: number): CachedFinding[] {
    const simThreshold = threshold ?? this.config.similarityThreshold;
    const results: Array<{ finding: CachedFinding; similarity: number }> = [];

    for (const finding of this.cache.values()) {
      if (this.isExpired(finding)) {
        this.cache.delete(finding.demandId);
        continue;
      }

      const similarity = this.calculateSimilarity(query, finding.query);
      if (similarity >= simThreshold) {
        results.push({ finding, similarity });
      }
    }

    // 類似度順でソート
    results.sort((a, b) => b.similarity - a.similarity);

    this.stats.totalHits += results.length;

    return results.map((r) => r.finding);
  }

  /**
   * ソースで検索
   * @summary 特定ソースのエントリを検索
   * @param source ソース文字列
   * @returns 該当するエントリ
   */
  findBySource(source: string): CachedFinding[] {
    const results: CachedFinding[] = [];

    for (const finding of this.cache.values()) {
      if (this.isExpired(finding)) {
        this.cache.delete(finding.demandId);
        continue;
      }

      if (finding.source.includes(source)) {
        results.push(finding);
      }
    }

    return results;
  }

  /**
   * エントリを削除
   * @summary IDでエントリ削除
   * @param demandId 需要ID
   * @returns 削除されたか
   */
  delete(demandId: string): boolean {
    return this.cache.delete(demandId);
  }

  /**
   * 期限切れエントリを一括削除
   * @summary 古いエントリのクリーンアップ
   * @returns 削除されたエントリ数
   */
  cleanup(): number {
    let deleted = 0;

    for (const [key, finding] of this.cache.entries()) {
      if (this.isExpired(finding)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * キャッシュをクリア
   * @summary 全エントリ削除
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalHits = 0;
    this.stats.totalMisses = 0;
  }

  /**
   * 統計を取得
   * @summary キャッシュ統計
   * @returns 統計情報
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.totalHits + this.stats.totalMisses;
    let totalAge = 0;
    const now = Date.now();

    for (const finding of this.cache.values()) {
      totalAge += now - finding.timestamp;
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      hitRate: totalRequests > 0 ? this.stats.totalHits / totalRequests : 0,
      averageAge: this.cache.size > 0 ? totalAge / this.cache.size : 0,
    };
  }

  /**
   * 設定を更新
   * @summary 動的設定変更
   * @param config 新しい設定（部分的）
   */
  updateConfig(config: Partial<AgentMemoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * 期限切れかチェック
   */
  private isExpired(finding: CachedFinding): boolean {
    return Date.now() - finding.timestamp > this.config.defaultTTL;
  }

  /**
   * 最古のエントリを削除
   */
  private invalidateOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [key, finding] of this.cache.entries()) {
      if (finding.timestamp < oldestTime) {
        oldestTime = finding.timestamp;
        oldest = key;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  /**
   * 文字列類似度を計算（Jaccard係数ベース）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    // 簡易実装：単語レベルのJaccard係数
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
  }
}

// =============================================================================
// グローバルインスタンス
// =============================================================================

let globalAgentMemory: AgentMemory | null = null;

/**
 * グローバルAgent Memoryを取得
 * @summary シングルトン取得
 * @param config 設定（初回のみ有効）
 * @returns Agent Memoryインスタンス
 */
export function getGlobalAgentMemory(config?: Partial<AgentMemoryConfig>): AgentMemory {
  if (!globalAgentMemory) {
    globalAgentMemory = new AgentMemory(config);
  }
  return globalAgentMemory;
}

/**
 * グローバルAgent Memoryをリセット
 * @summary テスト用
 */
export function resetGlobalAgentMemory(): void {
  globalAgentMemory = null;
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 探索需要からキャッシュキーを生成
 * @summary キー生成
 * @param type 需要タイプ
 * @param context コンテキスト
 * @returns キャッシュキー
 */
export function generateCacheKey(
  type: string,
  context: string
): string {
  // 簡易ハッシュ（実運用ではより堅牢なハッシュを使用）
  const str = `${type}:${context}`;
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return `demand-${Math.abs(hash).toString(36)}`;
}

/**
 * キャッシュ統計をフォーマット
 * @summary 統計表示
 * @param stats 統計情報
 * @returns フォーマット済み文字列
 */
export function formatCacheStats(stats: CacheStats): string {
  const lines = [
    `Agent Memory Statistics:`,
    `  Size: ${stats.size}/${stats.maxSize}`,
    `  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`,
    `  Total Hits: ${stats.totalHits}`,
    `  Total Misses: ${stats.totalMisses}`,
    `  Average Age: ${(stats.averageAge / 1000).toFixed(1)}s`,
  ];

  return lines.join("\n");
}
