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
