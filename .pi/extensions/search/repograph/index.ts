/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/index.ts
 * role: Public API for RepoGraph module
 * why: Provide unified exports for RepoGraph functionality
 * related: .pi/extensions/search/repograph/types.ts, .pi/extensions/search/repograph/parser.ts, .pi/extensions/search/repograph/builder.ts, .pi/extensions/search/repograph/storage.ts, .pi/extensions/search/repograph/query.ts
 * public_api: All type exports, all parser exports, all builder exports, all storage exports, all query exports
 * invariants: None (re-exports only)
 * side_effects: None
 * failure_modes: None
 * @abdd.explain
 * overview: Public API module for RepoGraph line-level dependency graph
 * what_it_does:
 * - Re-exports all types from types.ts
 * - Re-exports all parser functions from parser.ts
 * - Re-exports all builder functions from builder.ts
 * - Re-exports all storage functions from storage.ts
 * - Re-exports all query functions from query.ts
 * why_it_exists:
 * - Encapsulate RepoGraph module structure
 * - Simplify imports for consumers
 * scope:
 * in: All module exports from repograph submodules
 * out: Complete RepoGraph API
 */

// ============================================
// Type exports
// ============================================
export type {
	RepoGraphNode,
	RepoGraphNodeType,
	RepoGraphSymbolKind,
	RepoGraphEdgeType,
	RepoGraphEdge,
	RepoGraphMetadata,
	RepoGraphIndex,
	ParseResult,
	SupportedLanguage,
} from "./types.js";

export { STANDARD_LIBS } from "./types.js";

// ============================================
// Parser exports
// ============================================
export {
	parseFile,
	parseFileAuto,
	walkTree,
	isDefinition,
	isImport,
	isCall,
	extractSymbolName,
	extractCalleeName,
	extractModuleName,
	shouldFilterImport,
	shouldFilterCall,
} from "./parser.js";

// ============================================
// Builder exports
// ============================================
export {
	buildRepoGraph,
	buildFileRepoGraph,
	getSourceFiles,
	shouldIncludeNode,
	resolveReferences,
	detectLanguage,
} from "./builder.js";

// ============================================
// Storage exports
// ============================================
export {
	saveRepoGraph,
	loadRepoGraph,
	deleteRepoGraph,
	isRepoGraphStale,
	getRepoGraphPath,
	getRepoGraphMetadata,
} from "./storage.js";

// ============================================
// Query exports
// ============================================
export {
	findNodesBySymbol,
	findNodesByFile,
	findDefinitions,
	findReferences,
	findRelatedNodes,
	findEdgesForNode,
	findCallEdges,
	getGraphStats,
} from "./query.js";

export type {
	FindRelatedOptions,
	RelatedNodeResult,
} from "./query.js";

// ============================================
// Egograph exports
// ============================================
export {
	extractEgograph,
	formatEgograph,
} from "./egograph.js";

export type {
	EgographOptions,
	EgographResult,
} from "./egograph.js";
