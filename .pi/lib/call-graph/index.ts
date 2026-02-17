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
