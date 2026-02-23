/**
 * @abdd.meta
 * path: .pi/extensions/search/call-graph/index.ts
 * role: コールグラフ機能の公開インターフェースとモジュールエントリポイント
 * why: コールグラフの構築、永続化、検索機能を外部から利用するため
 * related: ./types.ts, ./builder.ts, ./query.ts
 * public_api: buildCallGraph, findCallers, findCallees, findCallPath 等
 * invariants: エクスポートされる関数は types.ts で定義された型に準拠する
 * side_effects: ファイルシステム（インデックスの読み書き）へのアクセスを伴う
 * failure_modes: ripgrep/ctagsの依存関係が満たされない場合、またはインデックスファイルの破損時
 * @abdd.explain
 * overview: ripgrepとctagsを利用したコールグラフ分析機能を提供するモジュール
 * what_it_does:
 *   - types.ts, builder.ts, query.ts の要素を再エクスポートする
 *   - コールグラフの構築、保存、読み込みAPIを公開する
 *   - 呼び出し元・呼び出し先の検索およびパス探索APIを公開する
 * why_it_exists:
 *   - モジュール外部に対して単一のインポート経路を提供する
 *   - 実装詳細（builder, query）を隠蔽し、利用者が必要なAPIのみをアクセス可能にする
 * scope:
 *   in: 外部からの利用要求
 *   out: コールグラフの構築結果、検索結果、および型定義
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
