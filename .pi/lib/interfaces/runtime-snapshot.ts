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
 * Minimal runtime snapshot interface for limit resolution.
 * Captures the essential runtime state needed for capacity calculations.
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
 * Provider function type for runtime snapshot.
 * Used for dependency injection from agent-runtime.ts.
 */
export type RuntimeSnapshotProvider = () => IRuntimeSnapshot;
