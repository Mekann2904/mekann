/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/index.ts
 * role: Public API for LocAgent module
 * why: Provide unified exports for LocAgent functionality
 * related: .pi/extensions/search/locagent/types.ts, .pi/extensions/search/locagent/builder.ts, .pi/extensions/search/locagent/tools.ts, .pi/extensions/search/locagent/storage.ts
 * public_api: All type exports, all builder exports, all tools exports, all storage exports
 * invariants: None (re-exports only)
 * side_effects: None
 * failure_modes: None
 * @abdd.explain
 * overview: Public API module for LocAgent heterogeneous graph
 * what_it_does:
 * - Re-exports all types from types.ts
 * - Re-exports all builder functions from builder.ts
 * - Re-exports all tool functions from tools.ts
 * - Re-exports all storage functions from storage.ts
 * why_it_exists:
 * - Encapsulate LocAgent module structure
 * - Simplify imports for consumers
 * scope:
 * in: All module exports from locagent submodules
 * out: Complete LocAgent API
 */

// ============================================
// Type exports
// ============================================
export type {
	LocAgentNode,
	LocAgentNodeType,
	LocAgentSymbolKind,
	LocAgentEdgeType,
	LocAgentEdge,
	LocAgentMetadata,
	LocAgentGraph,
	LocAgentEntityEmbedding,
	LocAgentSemanticIndex,
	TraverseDirection,
	DetailLevel,
	SearchEntityResult,
	TraverseGraphResult,
	RetrieveEntityResult,
} from "./types.js";

// ============================================
// Builder exports
// ============================================
export {
	buildLocAgentGraph,
	getLocAgentSourceFiles,
	extractInheritance,
	generateQualifiedName,
} from "./builder.js";

// ============================================
// Tools exports
// ============================================
export {
	searchEntity,
	traverseGraph,
	retrieveEntity,
	retrieveEntities,
	findSymbol,
	findNodesByFile,
	getNeighbors,
	findPath,
} from "./tools.js";

// ============================================
// Storage exports
// ============================================
export {
	saveLocAgentGraph,
	loadLocAgentGraph,
	isLocAgentGraphStale,
	getLocAgentGraphPath,
	getLocAgentIndexPath,
	getLocAgentGraphStats,
} from "./storage.js";
