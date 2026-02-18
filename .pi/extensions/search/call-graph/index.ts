/**
 * @abdd.meta
 * path: .pi/extensions/search/call-graph/index.ts
 * role: call-graphモジュールのエントリーポイント
 * why: call-graph機能の型定義とビルダー・クエリ関数を一元的に公開し、モジュール利用者へのインターフェースを提供するため
 * related: types.js, builder.js, query.js
 * public_api: CallGraphNode, CallGraphEdge, CallSite, CallGraphIndex, CallGraphMetadata, CallGraphNodeKind, CallGraphIndexInput, CallGraphIndexOutput, FindCallersInput, FindCalleesInput, FindCallersOutput, FindCalleesOutput, CallChainResult, buildCallGraph, saveCallGraphIndex, readCallGraphIndex, isCallGraphIndexStale, findCallers, findCallees, findCallPath, findNodesByName, findNodeById, findNodesByFile, getNodeStats
 * invariants: エクスポートされる型と関数のシグネチャはサブモジュールと整合している
 * side_effects: なし（再エクスポートのみ）
 * failure_modes: サブモジュールのimportに失敗した場合、モジュール全体が読み込めない
 * @abdd.explain
 * overview: call-graphモジュールの公開APIを集約するエントリーポイント
 * what_it_does:
 *   - types.jsから13種類の型定義を再エクスポートする
 *   - builder.jsから4つのインデックス構築関数を再エクスポートする
 *   - query.jsから7つのクエリ関数を再エクスポートする
 * why_it_exists:
 *   - モジュール利用者が個別のサブモジュールを直接importする手間を省くため
 *   - call-graph機能の公開インターフェースを一箇所で管理するため
 * scope:
 *   in: なし（再エクスポートのみでロジックを持たない）
 *   out: types.js, builder.js, query.jsの全公開API
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
