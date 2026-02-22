/**
 * @abdd.meta
 * path: .pi/lib/embeddings/providers/local.ts
 * role: オフラインで動作するローカル埋め込みプロバイダー（TF-IDFベース）
 * why: OPENAI_API_KEYなしでセマンティック検索を可能にするため
 * related: .pi/lib/embeddings/types.ts, .pi/lib/embeddings/registry.ts
 * public_api: LocalEmbeddingProvider, createLocalEmbeddingProvider
 * invariants: 常にオフライン動作可能(offlineCapable=true)、次元数は固定(1000)
 * side_effects: なし（純粋な計算処理）
 * failure_modes: 空文字列入力時は空配列を返す
 * @abdd.explain
 * overview: TF-IDF（Term Frequency-Inverse Document Frequency）ベースのローカル埋め込みプロバイダー
 * what_it_does:
 *   - 外部APIを使用せずにテキストから埋め込みベクトルを生成
 *   - 単語の出現頻度と重要度に基づくベクトル表現を構築
 *   - オフライン環境でもセマンティック検索を可能にする
 * why_it_exists:
 *   - OPENAI_API_KEYなしでセマンティック検索を利用可能にするため
 *   - プライバシー要件で外部APIを使用できない環境での代替手段を提供するため
 *   - 開発・テスト環境での手軽な埋め込み生成を実現するため
 * scope:
 *   in: テキスト文字列（単一またはバッチ）
 *   out: 埋め込みベクトル（数値配列）
 */

/**
 * Local Embedding Provider.
 * Provides offline-capable embeddings using TF-IDF algorithm.
 * No external API required - suitable for development and privacy-sensitive environments.
 */

import type { EmbeddingProvider, ProviderCapabilities } from "../types.js";

// ============================================================================
// Types
// ============================================================================

/**
 * 文書の用語頻度情報
 */
interface TermFrequency {
  [term: string]: number;
}

/**
 * 逆文書頻度キャッシュ
 */
interface DocumentFrequency {
  [term: string]: number;
}

// ============================================================================
// Constants
// ============================================================================

const VOCABULARY_SIZE = 1000;
const STOP_WORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
  "used", "this", "that", "these", "those", "i", "you", "he", "she", "it",
  "we", "they", "what", "which", "who", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "not", "only", "same", "so", "than", "too", "very",
  // Japanese particles and common words
  "の", "に", "は", "を", "た", "が", "で", "て", "と", "し", "れ", "さ",
  "ある", "いる", "も", "する", "から", "な", "こと", "として", "い", "や",
  "れる", "など", "なっ", "ない", "この", "ため", "その", "あっ", "よう",
  "また", "もの", "という", "あり", "まで", "られ", "なる", "へ", "か",
  "だ", "これ", "によって", "おり", "より", "による", "ず", "なり", "ら",
  "できる", "である", "ところ", "ば", "でも", "られ", "そう", "せよ",
  "お", "わ", "ね", "よ", "なぁ", "かな", "について", "において", "においても",
]);

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * テキストをトークン化
 * @summary テキストをトークン化
 * @param text 入力テキスト
 * @returns トークン配列
 */
function tokenize(text: string): string[] {
  // Lowercase and extract words/characters
  const normalized = text.toLowerCase();
  
  // Split by whitespace and punctuation
  const tokens = normalized
    .split(/[\s\p{P}\p{S}]+/u)
    .filter(t => t.length > 0 && !STOP_WORDS.has(t));
  
  // For Japanese: also include character n-grams
  const ngrams: string[] = [];
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    // Include CJK characters as individual tokens
    if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(char)) {
      if (!STOP_WORDS.has(char)) {
        ngrams.push(char);
      }
      // Add bigrams for Japanese
      if (i < normalized.length - 1) {
        const bigram = normalized.slice(i, i + 2);
        if (/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(bigram)) {
          ngrams.push(bigram);
        }
      }
    }
  }
  
  return [...tokens, ...ngrams];
}

/**
 * 用語頻度を計算
 * @summary 用語頻度を計算
 * @param tokens トークン配列
 * @returns 用語頻度マップ
 */
function computeTermFrequency(tokens: string[]): TermFrequency {
  const tf: TermFrequency = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  
  // Normalize by document length
  const total = tokens.length || 1;
  for (const term in tf) {
    tf[term] = tf[term] / total;
  }
  
  return tf;
}

/**
 * 文字列をハッシュ化してインデックスを生成
 * @summary 文字列をハッシュ化
 * @param str 入力文字列
 * @returns ハッシュ値
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// Local Embedding Provider Class
// ============================================================================

/**
 * ローカル埋め込みプロバイダー
 * @summary TF-IDFベースのローカル埋め込みプロバイダー
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = "local";
  readonly name = "Local TF-IDF Embeddings";
  readonly model = "tfidf-local-v1";
  
  readonly capabilities: ProviderCapabilities = {
    maxTokens: 8000,
    dimensions: VOCABULARY_SIZE,
    supportsBatch: true,
    maxBatchSize: 100,
    offlineCapable: true,
  };

  private documentCount = 0;
  private documentFrequency: DocumentFrequency = {};

  /**
   * プロバイダーが利用可能か確認
   * @summary 利用可能性確認
   * @returns 常にtrue（ローカルプロバイダーは常に利用可能）
   */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /**
   * 単一テキストの埋め込み生成
   * @summary 埋め込み生成
   * @param text 入力テキスト
   * @returns 埋め込みベクトル
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      return new Array(VOCABULARY_SIZE).fill(0);
    }

    const tokens = tokenize(text);
    const tf = computeTermFrequency(tokens);
    
    // Create sparse vector using hash-based indexing
    const vector = new Array(VOCABULARY_SIZE).fill(0);
    
    for (const term in tf) {
      const index = hashString(term) % VOCABULARY_SIZE;
      const idf = this.computeIDF(term);
      vector[index] += tf[term] * idf;
    }
    
    // L2 normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }
    
    return vector;
  }

  /**
   * バッチ埋め込み生成
   * @summary バッチ埋め込み生成
   * @param texts テキスト配列
   * @returns 埋め込みベクトル配列
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    // First pass: update document frequency
    for (const text of texts) {
      const tokens = tokenize(text);
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        this.documentFrequency[term] = (this.documentFrequency[term] || 0) + 1;
      }
      this.documentCount++;
    }
    
    // Second pass: generate embeddings
    const embeddings: number[][] = [];
    for (const text of texts) {
      embeddings.push(await this.generateEmbedding(text));
    }
    
    return embeddings;
  }

  /**
   * 逆文書頻度を計算
   * @summary IDF計算
   * @param term 用語
   * @returns IDF値
   */
  private computeIDF(term: string): number {
    const df = this.documentFrequency[term] || 1;
    return Math.log((this.documentCount + 1) / (df + 1)) + 1;
  }

  /**
   * 統計情報をリセット
   * @summary 統計リセット
   */
  resetStats(): void {
    this.documentCount = 0;
    this.documentFrequency = {};
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * ローカル埋め込みプロバイダーを作成
 * @summary プロバイダー作成
 * @returns LocalEmbeddingProviderインスタンス
 */
export function createLocalEmbeddingProvider(): EmbeddingProvider {
  return new LocalEmbeddingProvider();
}
