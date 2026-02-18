/**
 * @abdd.meta
 * path: .pi/extensions/search/call-graph/index.ts
 * role: 本モジュールの公開APIを定義するエントリーポイント
 * why: コールグラフ分析の機能を統一的に利用可能にするため
 * related: .pi/extensions/search/call-graph/types.ts, .pi/extensions/search/call-graph/builder.ts, .pi/extensions/search/call-graph/query.ts
 * public_api: buildCallGraph, findCallers, findCallees, findCallPath
 * invariants: エクスポートされる型と関数はサブモジュールから直接再エクスポートされる
 * side_effects: なし（純粋なモジュール定義）
 * failure_modes: サブモジュールの循環参照、またはビルド・クエリ時のランタイムエラーが伝播する
 * @abdd.explain
 * overview: ripgrepとctagsを用いたコールグラフ分析機能の集約モジュール
 * what_it_does:
 *   - コールグラフの型定義（Type, Node, Edge等）を公開する
 *   - コールグラフの構築および保存・読み込み機能（Builder）を提供する
 *   - 呼び出し元・呼び出し先の検索やパス探索機能（Query）を提供する
 * why_it_exists:
 *   - 外部モジュールからのインポート経路を単一のエントリーポイントに集約するため
 *   - 実装詳細（Builder, Query）を隠蔽し、利用者に対して明確なAPIを提示するため
 * scope:
 *   in: サブモジュール（types, builder, query）
 *   out: コールグラフ分析機能の型および関数セット
 */

/**
 * Call Graph Module
 *
 * Provides call graph analysis functionality using ripgrep and ctags.
 * Phase 1: Regex-based call detection with confidence scores.
 */

// Types
export type {
	CallGraphNode,
	CallGraphEdge,
	CallSite,
	CallGraphIndex,
	CallGraphMetadata,
	CallGraphNodeKind,
	CallGraphIndexInput,
	CallGraphIndexOutput,
	FindCallersInput,
	FindCalleesInput,
	FindCallersOutput,
	FindCalleesOutput,
	CallChainResult,
} from "./types.js";

// Builder
export {
	buildCallGraph,
	saveCallGraphIndex,
	readCallGraphIndex,
	isCallGraphIndexStale,
} from "./builder.js";

// Query
export {
	findCallers,
	findCallees,
	findCallPath,
	findNodesByName,
	findNodeById,
	findNodesByFile,
	getNodeStats,
} from "./query.js";
