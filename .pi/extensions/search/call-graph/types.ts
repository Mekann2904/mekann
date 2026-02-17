/**
 * Call Graph Type Definitions
 *
 * Types for the ripgrep-based call graph analysis system.
 * Phase 1: Simplified implementation using regex-based call detection.
 */

// ============================================
// Node Types
// ============================================

/**
 * Kind of callable symbol
 */
export type CallGraphNodeKind = "function" | "method" | "arrow" | "const";

/**
 * Call Graph Node - Represents a function/method definition
 */
export interface CallGraphNode {
	/** Unique identifier: file:line:name */
	id: string;
	/** Function/method name */
	name: string;
	/** File path relative to project root */
	file: string;
	/** Line number where the function is defined */
	line: number;
	/** Type of callable */
	kind: CallGraphNodeKind;
	/** Class or module scope (if applicable) */
	scope?: string;
	/** Function signature (if available from ctags) */
	signature?: string;
}

// ============================================
// Edge Types
// ============================================

/**
 * Call site location
 */
export interface CallSite {
	/** File containing the call */
	file: string;
	/** Line number of the call */
	line: number;
	/** Column number of the call */
	column: number;
}

/**
 * Call Graph Edge - Represents a function call relationship
 */
export interface CallGraphEdge {
	/** Caller node ID (file:line:name) */
	caller: string;
	/** Callee name (symbol name, not ID - may resolve to multiple definitions) */
	callee: string;
	/** Location of the call site */
	callSite: CallSite;
	/**
	 * Confidence score (0.0-1.0)
	 * Regex-based detection has lower confidence than AST-based analysis.
	 * - 1.0: Exact match in same file/scope
	 * - 0.8: Exact match in same project
	 * - 0.5: Partial match or common name
	 */
	confidence: number;
}

// ============================================
// Index Types
// ============================================

/**
 * Metadata about the call graph index
 */
export interface CallGraphMetadata {
	/** Timestamp when the index was built */
	indexedAt: number;
	/** Parser backend used */
	parserBackend: "ripgrep";
	/** Number of unique files indexed */
	fileCount: number;
	/** Total number of nodes (function definitions) */
	nodeCount: number;
	/** Total number of edges (call relationships) */
	edgeCount: number;
	/** Version of the index format */
	version: number;
}

/**
 * Complete Call Graph Index
 */
export interface CallGraphIndex {
	/** All function/method definitions */
	nodes: CallGraphNode[];
	/** All call relationships */
	edges: CallGraphEdge[];
	/** Index metadata */
	metadata: CallGraphMetadata;
}

// ============================================
// Input/Output Types for Tools
// ============================================

/**
 * Input for call_graph_index tool
 */
export interface CallGraphIndexInput {
	/** Target path for indexing (default: project root) */
	path?: string;
	/** Force regeneration of index */
	force?: boolean;
	/** Working directory */
	cwd?: string;
}

/**
 * Output for call_graph_index tool
 */
export interface CallGraphIndexOutput {
	/** Number of nodes indexed */
	nodeCount: number;
	/** Number of edges detected */
	edgeCount: number;
	/** Path to the generated index file */
	outputPath: string;
	/** Error message if any */
	error?: string;
}

/**
 * Input for find_callers tool
 */
export interface FindCallersInput {
	/** Symbol name to find callers for */
	symbolName: string;
	/** Recursion depth (default: 1) */
	depth?: number;
	/** Maximum results (default: 50) */
	limit?: number;
	/** Working directory */
	cwd?: string;
}

/**
 * Input for find_callees tool
 */
export interface FindCalleesInput {
	/** Symbol name to find callees for */
	symbolName: string;
	/** Recursion depth (default: 1) */
	depth?: number;
	/** Maximum results (default: 50) */
	limit?: number;
	/** Working directory */
	cwd?: string;
}

/**
 * Caller/Callee result with chain information
 */
export interface CallChainResult {
	/** The node that calls/is called */
	node: CallGraphNode;
	/** Call chain depth (0 = direct, 1 = indirect, etc.) */
	depth: number;
	/** Call site location (for direct calls only) */
	callSite?: CallSite;
	/** Confidence of the relationship */
	confidence: number;
}

/**
 * Output for find_callers/find_callees tools
 */
export interface FindCallersOutput {
	/** Symbol name that was searched */
	symbolName: string;
	/** Total unique callers found */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Caller results */
	results: CallChainResult[];
	/** Error message if any */
	error?: string;
}

export interface FindCalleesOutput {
	/** Symbol name that was searched */
	symbolName: string;
	/** Total unique callees found */
	total: number;
	/** Whether results were truncated */
	truncated: boolean;
	/** Callee results */
	results: CallChainResult[];
	/** Error message if any */
	error?: string;
}

// ============================================
// Internal Types
// ============================================

/**
 * Intermediate structure for building call graph
 */
export interface FunctionDefinition {
	/** Function name */
	name: string;
	/** File path */
	file: string;
	/** Line number */
	line: number;
	/** Function kind */
	kind: CallGraphNodeKind;
	/** Scope/class name */
	scope?: string;
	/** Full source code of the function body */
	body?: string;
	/** Start line of body */
	bodyStartLine?: number;
	/** End line of body */
	bodyEndLine?: number;
}

/**
 * Detected function call within source code
 */
export interface DetectedCall {
	/** Called function name */
	name: string;
	/** File containing the call */
	file: string;
	/** Line number of the call */
	line: number;
	/** Column number of the call */
	column: number;
	/** Raw text of the call */
	text: string;
}
