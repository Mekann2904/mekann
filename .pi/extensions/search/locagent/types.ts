/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/types.ts
 * role: LocAgent異種グラフの型定義
 * why: コードローカライゼーション向けの要素レベルグラフ構造を定義
 * related: .pi/extensions/search/repograph/types.ts, .pi/extensions/search/locagent/builder.ts
 * public_api: LocAgentNodeType, LocAgentEdgeType, LocAgentNode, LocAgentEdge, LocAgentGraph
 * invariants:
 * - Node IDは完全修飾名形式（例: src/utils.ts:MathUtils.calculate_sum）
 * - Confidence値は0.0〜1.0の範囲
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: LocAgent論文に基づく異種グラフの型定義
 * what_it_does:
 *   - directory, file, class, function ノードタイプを定義
 *   - contain, import, invoke, inherit エッジタイプを定義
 *   - 完全修飾名形式のノードID体系を定義
 * why_it_exists:
 *   - LocAgent論文の「要素レベル・異種グラフ」を実装するため
 *   - RepoGraph（行レベル）とは別の粒度でグラフを構築するため
 * scope:
 *   in: なし（型定義のみ）
 *   out: LocAgentグラフ構築・クエリ機能
 */

// ============================================================================
// Node Types
// ============================================================================

/**
 * LocAgent異種グラフのノードタイプ
 * @summary ノードタイプ分類
 * @description RepoGraph（行レベル）とは異なり、要素レベルの抽象化
 */
export type LocAgentNodeType = "directory" | "file" | "class" | "function";

/**
 * シンボル種別の詳細分類
 * @summary シンボル種別
 */
export type LocAgentSymbolKind =
	| "function"
	| "method"
	| "class"
	| "interface"
	| "type"
	| "variable"
	| "constant"
	| "property"
	| "namespace";

/**
 * LocAgent異種グラフのノード
 * @summary 要素レベルグラフノード
 * @param id - 完全修飾名（例: src/utils.ts:MathUtils.calculate_sum）
 * @param name - 要素名（例: calculate_sum）
 * @param nodeType - ノードタイプ（directory/file/class/function）
 * @param symbolKind - シンボル種別（function/method/class等）
 * @param filePath - ファイルパス（directory以外）
 * @param line - 定義行番号（1-indexed）
 * @param endLine - 終了行番号（class/function用）
 * @param signature - 関数シグネチャ（function/method用）
 * @param docstring - JSDoc/ドキュメントコメント
 * @param code - 要素のコード内容（検索用）
 * @param scope - スコープ（クラス名等）
 * @param visibility - 可視性（public/private/protected）
 */
export interface LocAgentNode {
	id: string;
	name: string;
	nodeType: LocAgentNodeType;
	symbolKind: LocAgentSymbolKind;
	filePath?: string;
	line?: number;
	endLine?: number;
	signature?: string;
	docstring?: string;
	code?: string;
	scope?: string;
	visibility?: "public" | "private" | "protected";
}

// ============================================================================
// Edge Types
// ============================================================================

/**
 * LocAgent異種グラフのエッジタイプ
 * @summary エッジタイプ分類
 * @description RepoGraphに加えてinherit（継承）を追加
 */
export type LocAgentEdgeType =
	| "contain" // AがBを含む（directory→file, file→class, class→function）
	| "import" // AがBをインポート（file→class/function）
	| "invoke" // AがBを呼び出し（function→function）
	| "inherit"; // AがBを継承（class→class）

/**
 * LocAgent異種グラフのエッジ
 * @summary グラフエッジ
 * @param source - ソースノードID
 * @param target - ターゲットノードID
 * @param type - エッジタイプ（contain/import/invoke/inherit）
 * @param confidence - 信頼度スコア（0.0-1.0）
 */
export interface LocAgentEdge {
	source: string;
	target: string;
	type: LocAgentEdgeType;
	confidence: number;
}

// ============================================================================
// Graph Structure
// ============================================================================

/**
 * LocAgentグラフのメタデータ
 * @summary インデックスメタデータ
 * @param indexedAt - インデックス作成時刻
 * @param fileCount - ファイル数
 * @param nodeCount - ノード数
 * @param edgeCount - エッジ数
 * @param language - 主言語
 * @param version - インデックス形式バージョン
 */
export interface LocAgentMetadata {
	indexedAt: number;
	fileCount: number;
	nodeCount: number;
	edgeCount: number;
	language: string;
	version: number;
}

/**
 * LocAgent完全グラフ構造
 * @summary 完全グラフインデックス
 * @param nodes - ノードID→ノードのマップ
 * @param edges - エッジ配列
 * @param metadata - メタデータ
 */
export interface LocAgentGraph {
	nodes: Map<string, LocAgentNode>;
	edges: LocAgentEdge[];
	metadata: LocAgentMetadata;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * TraverseGraphツールの方向
 * @summary 探索方向
 */
export type TraverseDirection = "upstream" | "downstream" | "both";

/**
 * SearchEntityツールの詳細レベル
 * @summary コード表示レベル
 */
export type DetailLevel = "fold" | "preview" | "full";

/**
 * SearchEntity結果のエンティティ
 * @summary 検索結果エンティティ
 * @param entity - ノード情報
 * @param score - 検索スコア
 * @param codeSnippet - コードスニペット（詳細レベルに応じた長さ）
 */
export interface SearchEntityResult {
	entity: LocAgentNode;
	score: number;
	codeSnippet: string;
}

/**
 * TraverseGraph結果のサブグラフ
 * @summary 探索結果サブグラフ
 * @param nodes - 発見されたノード
 * @param edges - 発見されたエッジ
 * @param format - ツリー形式の文字列表現
 */
export interface TraverseGraphResult {
	nodes: LocAgentNode[];
	edges: LocAgentEdge[];
	format: string;
}

/**
 * RetrieveEntity結果
 * @summary エンティティ詳細取得結果
 * @param entity - 完全なノード情報
 * @param fullCode - 完全なコード内容
 */
export interface RetrieveEntityResult {
	entity: LocAgentNode;
	fullCode: string;
}

// ============================================================================
// Index Types
// ============================================================================

/**
 * セマンティック検索用のエンティティ埋め込み
 * @summary エンティティ埋め込みデータ
 * @param entityId - エンティティID
 * @param text - 埋め込み対象テキスト（名前+シグネチャ+docstring+コード）
 * @param embedding - ベクトル埋め込み
 */
export interface LocAgentEntityEmbedding {
	entityId: string;
	text: string;
	embedding?: number[];
}

/**
 * LocAgentセマンティックインデックス
 * @summary セマンティック検索インデックス
 * @param embeddings - エンティティ埋め込み配列
 * @param metadata - インデックスメタデータ
 */
export interface LocAgentSemanticIndex {
	embeddings: LocAgentEntityEmbedding[];
	metadata: {
		indexedAt: number;
		entityCount: number;
		model: string;
	};
}
