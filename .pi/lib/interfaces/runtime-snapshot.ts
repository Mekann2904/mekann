/**
 * @abdd.meta
 * path: .pi/lib/interfaces/runtime-snapshot.ts
 * role: 実行時状態のデータコントラクトおよび取得関数の型定義
 * why: lib/モジュールがextensions/の具象実装に依存せず、依存関係逆転の原則（DIP）を遵守するため
 * related: lib/unified-limit-resolver.ts, extensions/agent-runtime.ts
 * public_api: IRuntimeSnapshot, RuntimeSnapshotProvider
 * invariants: 各カウント値（totalActiveLlm, totalActiveRequests, subagentActiveCount, teamActiveCount）は0以上の整数
 * side_effects: なし（純粋なインターフェース定義と型エイリアス）
 * failure_modes: なし
 * @abdd.explain
 * overview: エージェントやチームの現在の稼働状況を表すスナップショットのインターフェースと、それを取得する関数の型定義
 * what_it_does:
 *   - LLM操作数、リクエスト数、サブエージェント数、チーム数を保持するIRuntimeSnapshotインターフェースを定義する
 *   - IRuntimeSnapshotを返すRuntimeSnapshotProvider型を定義する
 * why_it_exists:
 *   - lib/レイヤーがextensions/レイヤーの詳細に依存しないようにするため（Clean Architecture）
 *   - 実行時リソースの状態を共通の形式で取り扱うため
 * scope:
 *   in: なし
 *   out: 状態を表す数値プロパティを持つオブジェクト
 */

/**
 * Runtime Snapshot Interface
 *
 * DIP (Dependency Inversion Principle) abstraction for runtime state.
 * This interface allows lib/ modules to depend on abstractions rather than
 * concrete implementations in extensions/.
 *
 * Why: Clean Architecture compliance - lib/ should not depend on extensions/
 * Related: lib/unified-limit-resolver.ts, extensions/agent-runtime.ts
 */

/**
 * 実行時の状態スナップショット
 * @summary 実行状態インターフェース
 * @returns 状態情報
 */
export interface IRuntimeSnapshot {
	/** Total active LLM operations across subagents and teams */
	totalActiveLlm: number;
	/** Total active request operations */
	totalActiveRequests: number;
	/** Number of active subagent agents */
	subagentActiveCount: number;
	/** Number of active team agents */
	teamActiveCount: number;
}

/**
 * 実行時スナップショットを提供
 * @summary スナップショット取得
 * @returns 現在の実行状態
 */
export type RuntimeSnapshotProvider = () => IRuntimeSnapshot;
