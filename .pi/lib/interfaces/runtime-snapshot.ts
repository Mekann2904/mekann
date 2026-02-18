/**
 * @abdd.meta
 * path: .pi/lib/interfaces/runtime-snapshot.ts
 * role: DIPに基づくランタイム状態の抽象化インターフェース定義
 * why: lib/モジュールがextensions/の具象実装に依存しないよう、Clean Architecture準拠で状態取得を抽象化するため
 * related: lib/unified-limit-resolver.ts, extensions/agent-runtime.ts, lib/interfaces/index.ts, lib/orchestrator.ts
 * public_api: IRuntimeSnapshot, RuntimeSnapshotProvider
 * invariants: 全プロパティは非負の整数値を持つ
 * side_effects: なし（純粋な型定義）
 * failure_modes: なし（インターフェース定義のため実行時エラーは発生しない）
 * @abdd.explain
 * overview: ランタイムの実行状態を表すスナップショットデータ構造とその取得関数型を定義する
 * what_it_does:
 *   - LLM操作数、リクエスト数、サブエージェント数、チームエージェント数を含む状態オブジェクトIRuntimeSnapshotを定義
 *   - IRuntimeSnapshotを返す関数型RuntimeSnapshotProviderを定義
 * why_it_exists:
 *   - 依存性逆転の原則によりlib/層がextensions/層の具象実装へ直接依存することを防ぐ
 *   - ランタイム状態の取得方法を呼び出し元から隠蔽し、テスト容易性と交換可能性を確保する
 * scope:
 *   in: なし（型定義のみ）
 *   out: IRuntimeSnapshot型の構造定義、RuntimeSnapshotProvider型の関数シグネチャ
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
  * ランタイムスナップショットインターフェース
  * @param totalActiveLlm 全体のアクティブなLLM操作数
  * @param totalActiveRequests 全体のアクティブなリクエスト数
  * @param subagentActiveCount アクティブなサブエージェント数
  * @param teamActiveCount アクティブなチームエージェント数
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
  * ランタイムスナップショットの提供関数
  * @returns ランタイムスナップショット
  */
export type RuntimeSnapshotProvider = () => IRuntimeSnapshot;
