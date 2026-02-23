/**
 * @abdd.meta
 * path: .pi/extensions/search/call-graph/types.ts
 * role: コールグラフ分析システムのデータ構造定義
 * why: ripgrepによる簡易的な呼び出し関係分析において、関数定義（ノード）と呼び出し関係（エッジ）を型安全に扱うため
 * related: .pi/extensions/search/call-graph/index.ts, .pi/extensions/search/call-graph/parser.ts
 * public_api: CallGraphNode, CallGraphEdge, CallSite, CallGraphIndex, CallGraphMetadata
 * invariants: CallGraphEdge.confidenceは0.0から1.0の範囲内、CallGraphNode.idは "file:line:name" 形式のユニーク文字列
 * side_effects: なし（純粋な型定義）
 * failure_modes: なし（型定義のみのため実行時エラーは発生しない）
 * @abdd.explain
 * overview: ripgrepベースのコールグラフ分析システムで使用される、ノード、エッジ、インデックスの型定義集
 * what_it_does:
 *   - 関数やメソッドなどの呼び出し可能な単位を表すCallGraphNodeを定義
 *   - 呼び出し元から呼び出し先への関係と位置情報を持つCallGraphEdgeを定義
 *   - グラフ全体の構造と統計情報を持つCallGraphIndexを定義
 * why_it_exists:
 *   - 正規表現ベースの解析結果を共通の構造で表現し、他のモジュールで利用可能にする
 *   - 解析手法（ripgrep）と信頼度スコアの仕様を明確化する
 * scope:
 *   in: なし
 *   out: 関数定義リスト、呼び出し関係リスト、メタデータ構造
 */

/**
 * Call Graph Type Definitions
 *
 * Types for the ripgrep-based call graph analysis system.
 * Phase 1: Simplified implementation using regex-based call detection.
 */

// ============================================
// Node Types
// ============================================

/**
 * 呼び出し可能なシンボルの種類
 * @summary ノード種別を定義
 */
export type CallGraphNodeKind = "function" | "method" | "arrow" | "const";

/**
 * 呼び出し可能なノード（関数など）を表します
 * @summary 呼び出し可能なノード
 */
export interface CallGraphNode {
	/** Unique identifier: file:line:name */
	id: string;
	/** Function/method name */
	name: string;
	/** File path relative to project root */
	file: string;
	/** Line number where the function is defined */
	line: number;
	/** Type of callable */
	kind: CallGraphNodeKind;
	/** Class or module scope (if applicable) */
	scope?: string;
	/** Function signature (if available from ctags) */
	signature?: string;
}

// ============================================
// Edge Types
// ============================================

/**
 * 呼び出し箇所の位置情報を表します
 * @summary 呼び出し箇所の位置
 */
export interface CallSite {
	/** File containing the call */
	file: string;
	/** Line number of the call */
	line: number;
	/** Column number of the call */
	column: number;
}

/**
 * 呼び出し元から呼び出し先への関係を表します
 * @summary 呼び出し関係のエッジ
 */
export interface CallGraphEdge {
	/** Caller node ID (file:line:name) */
	caller: string;
	/** Callee name (symbol name, not ID - may resolve to multiple definitions) */
	callee: string;
	/** Location of the call site */
	callSite: CallSite;
	/**
	 * Confidence score (0.0-1.0)
	 * Regex-based detection has lower confidence than AST-based analysis.
	 * - 1.0: Exact match in same file/scope
	 * - 0.8: Exact match in same project
	 * - 0.5: Partial match or common name
	 */
	confidence: number;
}

// ============================================
// Index Types
// ============================================

/**
 * コールグラフのメタデータ情報を表します
 * @summary コールグラフのメタデータ
 */
export interface CallGraphMetadata {
	/** Timestamp when the index was built */
	indexedAt: number;
	/** Parser backend used */
	parserBackend: "ripgrep";
	/** Number of unique files indexed */
	fileCount: number;
	/** Total number of nodes (function definitions) */
	nodeCount: number;
	/** Total number of edges (call relationships) */
	edgeCount: number;
	/** Version of the index format */
	version: number;
}

/**
 * コールグラフ全体のインデックス情報を表します
 * @summary コールグラフ全体のインデックス
 * @param {number} fileCount ファイル数
 * @param {number} nodeCount ノード（関数定義）総数
 * @param {number} edgeCount エッジ（呼び出し関係）総数
 */
export interface CallGraphIndex {
	/** All function/method definitions */
	nodes: CallGraphNode[];
	/** All call relationships */
	edges: CallGraphEdge[];
	/** Index metadata */
	metadata: CallGraphMetadata;
}

// ============================================
// Input/Output Types for Tools
// ============================================

/**
 * インデックス入力定義
 * @summary インデックス生成
 * @param path インデックス対象のパス（デフォルト: プロジェクトルート）
 * @param force インデックスの強制再生成
 * @param cwd 作業ディレクトリ
 * returns CallGraphIndexInput
 */
export interface CallGraphIndexInput {
	/** Target path for indexing (default: project root) */
	path?: string;
	/** Force regeneration of index */
	force?: boolean;
	/** Working directory */
	cwd?: string;
}

/**
 * @summary インデックス出力
 *
 * call_graph_indexツールの出力
 *
 * @param nodeCount インデックスされたノード数
 * @param edgeCount 検出されたエッジ数
 * @param outputPath 生成されたインデックスファイルのパス
 * @param error エラーメッセージ（ある場合）
 * @returns 出力結果オブジェクト
 */
export interface CallGraphIndexOutput {
	/** Number of nodes indexed */
	nodeCount: number;
	/** Number of edges detected */
	edgeCount: number;
	/** Path to the generated index file */
	outputPath: string;
	/** Error message if any */
	error?: string;
}

/**
 * @summary 呼び出し元検索
 * find_callersツールの入力
 * @param symbolName 呼び出し元を検索するシンボル名
 * @param depth 再帰の深さ（デフォルト: 1）
 * @param limit 最大結果数（デフォルト: 50）
 * @param cwd 作業ディレクトリ
 * @returns なし
 */
export interface FindCallersInput {
	/** Symbol name to find callers for */
	symbolName: string;
	/** Recursion depth (default: 1) */
	depth?: number;
	/** Maximum results (default: 50) */
	limit?: number;
	/** Working directory */
	cwd?: string;
}

/**
 * @summary 呼び出し先検索入力
 * 呼び出し先を検索するための入力インターフェース
 * @param symbolName 呼び出し先を検索するシンボル名
 * @param depth 再帰の深さ (デフォルト: 1)
 * @param limit 最大結果数 (デフォルト: 50)
 * @param cwd 作業ディレクトリ
 */
export interface FindCalleesInput {
	/** Symbol name to find callees for */
	symbolName: string;
	/** Recursion depth (default: 1) */
	depth?: number;
	/** Maximum results (default: 50) */
	limit?: number;
	/** Working directory */
	cwd?: string;
}

/**
 * 呼び出しチェーンの結果
 * @summary 呼び出しチェーンを取得
 * @param node 呼び出し元/呼び出し先のノード
 * @param depth 呼び出しチェーンの深さ (0=直接, 1=間接など)
 * @param callSite 呼び出し位置情報 (直接呼び出しの場合のみ)
 * @param confidence 関連性の信頼度
 * @returns 呼び出しチェーンの結果情報
 */
export interface CallChainResult {
	/** The node that calls/is called */
	node: CallGraphNode;
	/** Call chain depth (0 = direct, 1 = indirect, etc.) */
	depth: number;
	/** Call site location (for direct calls only) */
	callSite?: CallSite;
	/** Confidence of the relationship */
	confidence: number;
}

/**
 * 呼び出し元検索結果
 * @summary 呼び出し元検索結果
 */
export interface FindCallersOutput {
	/** Symbol name that was searched */
	symbolName: string;
	/** Total unique callers found */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Caller results */
	results: CallChainResult[];
	/** Error message if any */
	error?: string;
}

/**
 * 被呼び出し検索結果
 * @summary 被呼び出し検索結果
 */
export interface FindCalleesOutput {
	/** Symbol name that was searched */
	symbolName: string;
	/** Total unique callees found */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Callee results */
	results: CallChainResult[];
	/** Error message if any */
	error?: string;
}

// ============================================
// Internal Types
// ============================================

/**
 * 関数定義情報
 * @summary 関数定義を表現
 */
export interface FunctionDefinition {
	/** Function name */
	name: string;
	/** File path */
	file: string;
	/** Line number */
	line: number;
	/** Function kind */
	kind: CallGraphNodeKind;
	/** Scope/class name */
	scope?: string;
	/** Full source code of the function body */
	body?: string;
	/** Start line of body */
	bodyStartLine?: number;
	/** End line of body */
	bodyEndLine?: number;
}

/**
 * 検出された呼び出し
 * @summary 呼び出し情報を保持
 */
export interface DetectedCall {
	/** Called function name */
	name: string;
	/** File containing the call */
	file: string;
	/** Line number of the call */
	line: number;
	/** Column number of the call */
	column: number;
	/** Raw text of the call */
	text: string;
}
