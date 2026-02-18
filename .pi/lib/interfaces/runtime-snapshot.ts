/**
 * @abdd.meta
 * path: .pi/lib/interfaces/runtime-snapshot.ts
 * role: ランタイム状態の抽象化インターフェースおよびその取得関数の型定義
 * why: DIP（依存性逆転の原則）に従い、lib/モジュールがextensions/の具象実装に依存せず抽象に依存するため
 * related: lib/unified-limit-resolver.ts, extensions/agent-runtime.ts
 * public_api: IRuntimeSnapshot, RuntimeSnapshotProvider
 * invariants: 各カウントプロパティ（totalActiveLlm, totalActiveRequestsなど）は常に0以上の整数
 * side_effects: なし（インターフェースと型エイリアスのみ）
 * failure_modes: Providerが不正な値（負数など）を返した場合、呼び出し元のリミット制御ロジックが誤動作する
 * @abdd.explain
 * overview: システム全体のアクティブな処理数とエージェント数を表現するデータ構造と、それを提供する関数の型定義
 * what_it_does:
 *   - LLM操作、リクエスト、サブエージェント、チームエージェントの各アクティブ数を保持するIRuntimeSnapshotインターフェースを定義する
 *   - IRuntimeSnapshotを返すRuntimeSnapshotProvider型を定義する
 * why_it_exists:
 *   - Clean Architecture適用のため、lib/レイヤーが実装詳細に依存せず、ランタイム状態のスナップショットを取得できるようにする
 *   - アクティブリソースの集計方法を隠蔽し、リミット解決ロジックと切り離すため
 * scope:
 *   in: なし
 *   out: IRuntimeSnapshot型のオブジェクト、RuntimeSnapshotProvider型
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
