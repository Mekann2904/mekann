/**
 * @abdd.meta
 * path: .pi/lib/context-repository.ts
 * role: SACMS階層的Context Repository
 * why: タスク間でコンテキストを効率的に管理・配布するため
 * related: .pi/lib/semantic-memory.ts, .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts
 * public_api: ContextRepository, ContextNode, RELEVANCE_THRESHOLD, getRelevantContext
 * invariants: ツリー構造は循環しない
 * side_effects: ファイルシステムへの永続化（将来実装）
 * failure_modes: ディスク容量不足（将来実装時）
 * @abdd.explain
 * overview: DynTaskMAS論文のSACMS（Semantic-Aware Context Management System）の階層的Context Repositoryを実装
 * what_it_does:
 *   - タスクコンテキストを階層ツリー構造で管理
 *   - 関連性閾値θ=0.65ベースでコンテキストを配布
 *   - 長いコンテキストを圧縮してトークン削減
 * why_it_exists:
 *   - エージェント間で必要なコンテキストのみを共有し、トークン使用量を最適化するため
 *   - タスクの依存関係に基づいたコンテキスト継承を実現するため
 * scope:
 *   in: タスクID、コンテンツ、埋め込みベクトル
 *   out: 関連性の高いコンテキストノード配列
 */

// File: .pi/lib/context-repository.ts
// Description: Hierarchical Context Repository for SACMS (Semantic-Aware Context Management System).
// Why: Implements DynTaskMAS paper's context management with relevance-based distribution.
// Related: .pi/lib/semantic-memory.ts, .pi/lib/dag-executor.ts, .pi/lib/dag-types.ts

/**
 * 関連性閾値θ
 * この値以上の類似度を持つコンテキストのみを配布
 * @summary 関連性閾値
 */
export const RELEVANCE_THRESHOLD = 0.65;

/**
 * コンテキストノードのメタデータ
 * @summary コンテキストメタデータ
 * @param taskId - 関連タスクID
 * @param timestamp - 作成日時（ISO形式）
 * @param tokens - トークン数
 * @param relevance - 関連性スコア（0-1）
 */
export interface ContextMetadata {
  /** 関連タスクID */
  taskId: string;
  /** 作成日時（ISO形式） */
  timestamp: string;
  /** トークン数 */
  tokens: number;
  /** 関連性スコア（0-1） */
  relevance: number;
}

/**
 * 階層的コンテキストノード
 * @summary コンテキストノード
 * @param id - ノードID
 * @param content - コンテキスト内容
 * @param embedding - 埋め込みベクトル（オプション）
 * @param metadata - メタデータ
 * @param children - 子ノード配列
 */
export interface ContextNode {
  /** ノードID */
  id: string;
  /** コンテキスト内容 */
  content: string;
  /** 埋め込みベクトル（オプション） */
  embedding?: number[];
  /** メタデータ */
  metadata: ContextMetadata;
  /** 子ノード配列 */
  children: ContextNode[];
}

/**
 * コンテキスト検索オプション
 * @summary 検索オプション
 * @param threshold - 関連性閾値
 * @param maxDepth - 最大探索深さ
 * @param maxResults - 最大結果数
 */
export interface ContextSearchOptions {
  /** 関連性閾値 */
  threshold?: number;
  /** 最大探索深さ */
  maxDepth?: number;
  /** 最大結果数 */
  maxResults?: number;
}

/**
 * トークン数を推定
 * 簡易実装: 文字数 / 4
 * @summary トークン数推定
 * @param content - コンテンツ文字列
 * @returns 推定トークン数
 * @internal
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * コサイン類似度を計算
 * @summary コサイン類似度計算
 * @param a - ベクトルA
 * @param b - ベクトルB
 * @returns 類似度（-1〜1）
 * @internal
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 要約を生成（スタブ実装）
 * @summary 要約生成
 * @param content - 元のコンテンツ
 * @param targetTokens - 目標トークン数
 * @returns 圧縮されたコンテンツ
 * @internal
 */
async function generateSummary(
  content: string,
  targetTokens: number
): Promise<string> {
  // スタブ実装: 単純に切り詰め
  const targetChars = targetTokens * 4;
  if (content.length <= targetChars) {
    return content;
  }
  return content.slice(0, targetChars) + "...[truncated]";
}

/**
 * 階層的Context Repository
 * DynTaskMAS論文のSACMSコンポーネントを実装
 * @summary コンテキストリポジトリ
 */
export class ContextRepository {
  private root: ContextNode | null = null;
  private nodeIndex: Map<string, ContextNode>;
  private taskIndex: Map<string, ContextNode>;

  /**
   * リポジトリを初期化
   * @summary リポジトリ初期化
   */
  constructor() {
    this.nodeIndex = new Map();
    this.taskIndex = new Map();
  }

  /**
   * コンテキストを階層ツリーに追加
   * @summary コンテキスト追加
   * @param taskId - タスクID
   * @param content - コンテキスト内容
   * @param parentTaskId - 親タスクID（省略時はルート）
   * @returns 作成されたコンテキストノード
   */
  addContext(
    taskId: string,
    content: string,
    parentTaskId?: string
  ): ContextNode {
    const node: ContextNode = {
      id: `ctx-${taskId}`,
      content,
      metadata: {
        taskId,
        timestamp: new Date().toISOString(),
        tokens: estimateTokens(content),
        relevance: 1.0,
      },
      children: [],
    };

    if (parentTaskId) {
      const parent = this.taskIndex.get(parentTaskId);
      if (parent) {
        parent.children.push(node);
      }
    } else if (!this.root) {
      this.root = node;
    }

    this.nodeIndex.set(node.id, node);
    this.taskIndex.set(taskId, node);

    return node;
  }

  /**
   * 埋め込みベクトルを設定
   * @summary 埋め込み設定
   * @param taskId - タスクID
   * @param embedding - 埋め込みベクトル
   */
  setEmbedding(taskId: string, embedding: number[]): void {
    const node = this.taskIndex.get(taskId);
    if (node) {
      node.embedding = embedding;
    }
  }

  /**
   * 関連性閾値θベースでコンテキストを配布
   * relevance >= θ のコンテキストのみを返す
   * @summary 関連コンテキスト取得
   * @param queryEmbedding - クエリ埋め込みベクトル
   * @param threshold - 関連性閾値（省略時はRELEVANCE_THRESHOLD）
   * @returns 関連性の高いコンテキストノード配列
   */
  getRelevantContext(
    queryEmbedding: number[],
    threshold: number = RELEVANCE_THRESHOLD
  ): ContextNode[] {
    const results: ContextNode[] = [];

    const traverse = (node: ContextNode) => {
      if (node.embedding) {
        const similarity = cosineSimilarity(queryEmbedding, node.embedding);
        node.metadata.relevance = similarity;

        if (similarity >= threshold) {
          results.push(node);
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    if (this.root) {
      traverse(this.root);
    }

    // 関連性降順でソート
    return results.sort(
      (a, b) => b.metadata.relevance - a.metadata.relevance
    );
  }

  /**
   * タスクIDでコンテキストを取得
   * @summary タスクコンテキスト取得
   * @param taskId - タスクID
   * @returns コンテキストノード（存在しない場合はundefined）
   */
  getContextByTaskId(taskId: string): ContextNode | undefined {
    return this.taskIndex.get(taskId);
  }

  /**
   * 親タスクのコンテキストを継承
   * @summary コンテキスト継承
   * @param taskId - タスクID
   * @returns 継承すべきコンテキスト配列
   */
  getInheritedContext(taskId: string): ContextNode[] {
    const node = this.taskIndex.get(taskId);
    if (!node) return [];

    const inherited: ContextNode[] = [];
    const visited = new Set<string>();

    const collectAncestors = (current: ContextNode) => {
      // 親を探す
      for (const potentialParent of Array.from(this.taskIndex.values())) {
        if (
          potentialParent.children.some((child) => child.id === current.id) &&
          !visited.has(potentialParent.id)
        ) {
          visited.add(potentialParent.id);
          inherited.push(potentialParent);
          collectAncestors(potentialParent);
        }
      }
    };

    collectAncestors(node);
    return inherited;
  }

  /**
   * コンテキストを圧縮
   * 長いコンテキストを要約してトークン削減
   * @summary コンテキスト圧縮
   * @param node - 対象ノード
   * @param targetTokens - 目標トークン数
   * @returns 圧縮されたコンテンツ
   */
  async compressContext(
    node: ContextNode,
    targetTokens: number = 1000
  ): Promise<string> {
    if (node.metadata.tokens <= targetTokens) {
      return node.content;
    }

    // 要約生成（LLM使用）
    const summary = await generateSummary(node.content, targetTokens);
    return summary;
  }

  /**
   * 全ノード数を取得
   * @summary ノード数取得
   * @returns ノード数
   */
  size(): number {
    return this.nodeIndex.size;
  }

  /**
   * ルートノードを取得
   * @summary ルート取得
   * @returns ルートノード（存在しない場合はnull）
   */
  getRoot(): ContextNode | null {
    return this.root;
  }

  /**
   * リポジトリをクリア
   * @summary リポジトリクリア
   */
  clear(): void {
    this.root = null;
    this.nodeIndex.clear();
    this.taskIndex.clear();
  }

  /**
   * 統計情報を取得
   * @summary 統計取得
   * @returns 統計情報
   */
  getStats(): {
    totalNodes: number;
    totalTokens: number;
    maxDepth: number;
    avgTokensPerNode: number;
  } {
    let totalTokens = 0;
    let maxDepth = 0;

    const calculateDepth = (node: ContextNode, depth: number): void => {
      totalTokens += node.metadata.tokens;
      maxDepth = Math.max(maxDepth, depth);
      for (const child of node.children) {
        calculateDepth(child, depth + 1);
      }
    };

    if (this.root) {
      calculateDepth(this.root, 1);
    }

    const totalNodes = this.nodeIndex.size;

    return {
      totalNodes,
      totalTokens,
      maxDepth,
      avgTokensPerNode: totalNodes > 0 ? totalTokens / totalNodes : 0,
    };
  }
}
