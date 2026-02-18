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
  */
export type CallGraphNodeKind = "function" | "method" | "arrow" | "const";

 /**
  * コールグラフのノード
  * @param id 一意の識別子
  * @param name 関数名・メソッド名
  * @param file プロジェクトルートからの相対パス
  * @param line 定義された行番号
  * @param kind 呼び出し可能な型
  * @param scope クラスやモジュールのスコープ
  * @param signature 関数シグネチャ
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
  * 呼び出し箇所の位置情報
  * @param file 呼び出しを含むファイル
  * @param line 呼び出しの行番号
  * @param column 呼び出しの列番号
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
  * コールグラフのエッジを表す
  * @param caller 呼び出し元ノードID (file:line:name)
  * @param callee 呼び出し先シンボル名 (IDではなく、複数の定義に解決される可能性あり)
  * @param callSite 呼び出し箇所の位置情報
  * @param confidence 信頼度スコア (0.0-1.0)。正規表現ベースの検出はAST解析より低くなる
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
  * コールグラフインデックスのメタデータ
  * @param indexedAt インデックスが作成されたタイムスタンプ
  * @param parserBackend 使用されたパーサーバックエンド
  * @param fileCount インデックスされたユニークなファイル数
  * @param nodeCount ノード（関数定義）の総数
  * @param edgeCount エッジ（呼び出し関係）の総数
  * @param version インデックス形式のバージョン
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
  * 呼び出しグラフの完全なインデックス
  * @param nodes 関数・メソッド定義の配列
  * @param edges 呼び出し関係の配列
  * @param metadata インデックスのメタデータ
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
  * call_graph_indexツールの入力
  * @param path インデックス対象のパス（デフォルト: プロジェクトルート）
  * @param force インデックスの強制再生成
  * @param cwd 作業ディレクトリ
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
  * call_graph_indexツールの出力
  * @param nodeCount インデックスされたノード数
  * @param edgeCount 検出されたエッジ数
  * @param outputPath 生成されたインデックスファイルのパス
  * @param error エラーメッセージ（ある場合）
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
  * find_callersツールの入力
  * @param symbolName 呼び出し元を検索するシンボル名
  * @param depth 再帰の深さ（デフォルト: 1）
  * @param limit 最大結果数（デフォルト: 50）
  * @param cwd 作業ディレクトリ
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
  * find_calleesツールの入力
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
  * 呼び出しチェーンの結果情報
  * @param node 呼び出し元/呼び出し先のノード
  * @param depth 呼び出しチェーンの深さ (0=直接, 1=間接など)
  * @param callSite 呼び出し位置情報 (直接呼び出しの場合のみ)
  * @param confidence 関連性の信頼度
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
  * find_callersツールの出力形式
  * @param symbolName 検索されたシンボル名
  * @param total 検出された呼び出し元の合計数
  * @param truncated 結果が切り詰められたかどうか
  * @param results 呼び出し元の結果一覧
  * @param error エラーメッセージ（存在する場合）
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
  * 呼び出し先ツールの出力形式
  * @param symbolName 検索対象のシンボル名
  * @param total 見つかった呼び出し先の総数
  * @param truncated 結果が切り詰められているかどうか
  * @param results 呼び出し先の結果リスト
  * @param error エラーメッセージ（存在する場合）
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
  * コールグラフ構築用の中間構造
  * @param name 関数名
  * @param file ファイルパス
  * @param line 行番号
  * @param kind 関数の種類
  * @param scope スコープ/クラス名
  * @param body 関数本体のソースコード全体
  * @param bodyStartLine 本体の開始行
  * @param bodyEndLine 本体の終了行
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
  * ソースコード内で検出された関数呼び出し
  * @param name 呼び出された関数名
  * @param file 呼び出しを含むファイル
  * @param line 呼び出しの行番号
  * @param column 呼び出しの列番号
  * @param text 呼び出しの生テキスト
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
