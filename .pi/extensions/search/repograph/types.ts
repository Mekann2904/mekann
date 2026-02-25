/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/types.ts
 * role: RepoGraph data structure definitions
 * why: Define line-level graph nodes and edges for AST-based code analysis
 * related: .pi/extensions/search/repograph/parser.ts, .pi/extensions/search/repograph/builder.ts
 * public_api: RepoGraphNode, RepoGraphEdgeType, RepoGraphEdge, RepoGraphIndex
 * invariants:
 * - Node IDs must follow "file:line" format
 * - Confidence values are between 0.0 and 1.0
 * - Metadata version increments on schema changes
 * side_effects: none
 * failure_modes: none
 * @abdd.explain
 * overview: Type definitions for RepoGraph line-level dependency graph
 * what_it_does:
 * - Defines RepoGraphNode for def/ref/import/export nodes at line granularity
 * - Defines RepoGraphEdgeType for invoke/contain/define/reference/next relationships
 * - Defines RepoGraphIndex as the complete graph structure with metadata
 * why_it_exists:
 * - Enable AST-based code analysis with accurate definition/reference extraction
 * - Support RepoGraph methodology from SWE-bench (+32.8% improvement)
 * scope:
 * in: tree-sitter AST parser, file system
 * out: graph-based code search, localization tools
 */

/**
 * Node type in RepoGraph
 * @summary Node type classification
 */
export type RepoGraphNodeType = "def" | "ref" | "import" | "export";

/**
 * Symbol kind classification
 * @summary Symbol kind type
 */
export type RepoGraphSymbolKind =
  | "function"
  | "method"
  | "class"
  | "variable"
  | "import"
  | "constant"
  | "interface"
  | "type"
  | "property";

/**
 * Line-level node in RepoGraph
 * @summary Graph node at line granularity
 * @param id - Unique identifier in "file:line" or "file:line:type:name" format
 * @param file - Relative file path
 * @param line - Line number (1-indexed)
 * @param nodeType - Type of node (def/ref/import/export)
 * @param symbolName - Name of the symbol
 * @param symbolKind - Kind of symbol (function/method/class/etc)
 * @param scope - Optional scope (e.g., class name for methods)
 * @param text - Source line content
 */
export interface RepoGraphNode {
  id: string;
  file: string;
  line: number;
  nodeType: RepoGraphNodeType;
  symbolName: string;
  symbolKind: RepoGraphSymbolKind;
  scope?: string;
  text: string;
}

/**
 * Edge types in RepoGraph
 * @summary Relationship type between nodes
 */
export type RepoGraphEdgeType =
  | "invoke" // A calls B
  | "contain" // A contains B (file contains function)
  | "define" // A defines B (import defines symbol)
  | "reference" // A references B
  | "next"; // Sequential line relationship

/**
 * Edge connecting two nodes in RepoGraph
 * @summary Graph edge with type and confidence
 * @param source - Source node ID
 * @param target - Target node ID
 * @param type - Edge type (invoke/contain/define/reference/next)
 * @param confidence - Confidence score (0.0-1.0)
 */
export interface RepoGraphEdge {
  source: string;
  target: string;
  type: RepoGraphEdgeType;
  confidence: number;
}

/**
 * Metadata for RepoGraph index
 * @summary Index metadata structure
 * @param indexedAt - Timestamp when index was created
 * @param fileCount - Number of files indexed
 * @param nodeCount - Number of nodes in graph
 * @param edgeCount - Number of edges in graph
 * @param language - Primary language or "multi"
 * @param version - Index format version
 */
export interface RepoGraphMetadata {
  indexedAt: number;
  fileCount: number;
  nodeCount: number;
  edgeCount: number;
  language: string;
  version: number;
}

/**
 * Complete RepoGraph index structure
 * @summary Full graph index with nodes, edges, and metadata
 * @param nodes - Map of node ID to RepoGraphNode
 * @param edges - Array of RepoGraphEdge
 * @param metadata - Index metadata
 */
export interface RepoGraphIndex {
  nodes: Map<string, RepoGraphNode>;
  edges: RepoGraphEdge[];
  metadata: RepoGraphMetadata;
}

/**
 * Result of parsing a single file
 * @summary Parse output structure
 * @param nodes - Extracted nodes
 * @param edges - Extracted edges
 */
export interface ParseResult {
  nodes: RepoGraphNode[];
  edges: RepoGraphEdge[];
}

/**
 * Supported languages for parsing
 * @summary Language type
 */
export type SupportedLanguage = "typescript" | "javascript" | "python";

/**
 * Standard library modules to filter from indexing
 * @summary Set of standard library names
 */
export const STANDARD_LIBS = new Set([
  // Node.js built-ins
  "fs",
  "path",
  "http",
  "https",
  "crypto",
  "os",
  "util",
  "stream",
  "events",
  "buffer",
  "url",
  "querystring",
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "net",
  "readline",
  "repl",
  "tls",
  "tty",
  "v8",
  "vm",
  "zlib",
  "worker_threads",
  // Common frameworks and libraries
  "react",
  "react-dom",
  "vue",
  "angular",
  "express",
  "koa",
  "fastify",
  "lodash",
  "underscore",
  "axios",
  "fetch",
  "jquery",
  // Python standard library
  "os",
  "sys",
  "json",
  "re",
  "datetime",
  "collections",
  "itertools",
  "functools",
  "typing",
  "asyncio",
  "threading",
  "multiprocessing",
  "subprocess",
  "logging",
  "argparse",
  "pathlib",
  "tempfile",
  "shutil",
  "pickle",
  "sqlite3",
  "hashlib",
  "hmac",
  "secrets",
  "uuid",
  "copy",
  "glob",
  "io",
  "time",
  "random",
  "math",
  "decimal",
  "fractions",
  "statistics",
  "enum",
  "dataclasses",
  "contextlib",
  "abc",
  "traceback",
  "warnings",
  "unittest",
  "pytest",
]);
