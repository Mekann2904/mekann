/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/builder.ts
 * role: RepoGraph index builder for constructing line-level dependency graphs
 * why: Build complete graph from source files with def/ref nodes and resolved edges
 * related: .pi/extensions/search/repograph/parser.ts, .pi/extensions/search/repograph/storage.ts, .pi/extensions/search/repograph/types.ts
 * public_api: buildRepoGraph, getSourceFiles, shouldIncludeNode, resolveReferences, detectLanguage
 * invariants:
 * - Node IDs follow "file:line" or "file:line:type:name" format
 * - STANDARD_LIBS imports are filtered from final graph
 * - Edges have confidence scores between 0.0 and 1.0
 * side_effects:
 * - Reads files from filesystem
 * - May trigger WASM grammar downloads on first parse
 * failure_modes:
 * - File read errors
 * - Unsupported language detection
 * - Memory exhaustion on large repos
 * @abdd.explain
 * overview: Build RepoGraph index from project source files
 * what_it_does:
 * - Scans project directory for source files
 * - Parses each file with tree-sitter to extract nodes
 * - Builds edges between definitions and references
 * - Resolves references to their definitions
 * - Filters standard library imports
 * why_it_exists:
 * - Create line-level dependency graph for code localization
 * - Support SWE-bench methodology (+32.8% improvement)
 * scope:
 * in: Project directory path, working directory
 * out: Complete RepoGraphIndex with nodes, edges, metadata
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { parseFile } from "./parser.js";
import { detectLanguage as detectLang } from "../tree-sitter/loader.js";
import type {
	RepoGraphIndex,
	RepoGraphNode,
	RepoGraphEdge,
	RepoGraphMetadata,
	SupportedLanguage,
} from "./types.js";
import { STANDARD_LIBS } from "./types.js";

/**
 * File extensions to include in indexing
 */
const SOURCE_EXTENSIONS = new Set([
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
]);

/**
 * Directories to exclude from indexing
 */
const EXCLUDE_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	"out",
	"__pycache__",
	".venv",
	"venv",
	"env",
	".tox",
	".mypy_cache",
	".pytest_cache",
	"coverage",
	".next",
	".nuxt",
	"vendor",
	"target",
	"bin",
	"obj",
]);

/**
 * Detect language from file extension
 * @summary Detect language from file path
 * @param filePath - File path or extension
 * @returns Detected language or undefined
 */
export function detectLanguage(filePath: string): SupportedLanguage | undefined {
	return detectLang(filePath);
}

/**
 * Get all source files in a directory recursively
 * @summary Collect source files recursively
 * @param path - Directory path to scan
 * @param cwd - Working directory for relative paths
 * @returns Promise resolving to array of relative file paths
 * @example
 * const files = await getSourceFiles("./src", "/project");
 * // Returns ["src/index.ts", "src/utils.ts", ...]
 */
export async function getSourceFiles(
	path: string,
	cwd: string
): Promise<string[]> {
	const files: string[] = [];
	const baseDir = join(cwd, path);

	async function walk(dir: string): Promise<void> {
		try {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = join(dir, entry.name);

				if (entry.isDirectory()) {
					if (!EXCLUDE_DIRS.has(entry.name)) {
						await walk(fullPath);
					}
				} else if (entry.isFile()) {
					const ext = extname(entry.name);
					if (SOURCE_EXTENSIONS.has(ext)) {
						// Store relative to cwd
						files.push(fullPath.replace(cwd + "/", ""));
					}
				}
			}
		} catch {
			// Ignore directories we can't read
		}
	}

	await walk(baseDir);
	return files;
}

/**
 * Check if a node should be included in the graph
 * @summary Filter nodes for inclusion
 * @param node - Node to check
 * @returns True if node should be included
 */
export function shouldIncludeNode(node: RepoGraphNode): boolean {
	// Filter out standard library imports
	if (node.nodeType === "import") {
		// Check if the symbol name is from a standard library
		const moduleName = extractModuleFromImport(node.text);
		if (moduleName && STANDARD_LIBS.has(moduleName)) {
			return false;
		}
	}
	return true;
}

/**
 * Check if an edge should be included in the graph
 * @summary Filter edges for inclusion
 * @param edge - Edge to check
 * @returns True if edge should be included
 */
function shouldIncludeEdge(edge: RepoGraphEdge): boolean {
	// Filter out very low confidence edges
	return edge.confidence >= 0.3;
}

/**
 * Extract module name from import statement text
 * @summary Extract module from import line
 * @param lineText - Source line text
 * @returns Module name or undefined
 */
function extractModuleFromImport(lineText: string): string | undefined {
	// Handle: import X from 'module'
	const fromMatch = lineText.match(/from\s+['"]([^'"]+)['"]/);
	if (fromMatch) {
		return fromMatch[1];
	}

	// Handle: import 'module'
	const importMatch = lineText.match(/import\s+['"]([^'"]+)['"]/);
	if (importMatch) {
		return importMatch[1];
	}

	// Handle: import X (Python)
	const pyImportMatch = lineText.match(/import\s+(\w+)/);
	if (pyImportMatch) {
		return pyImportMatch[1];
	}

	// Handle: from module import X (Python)
	const pyFromMatch = lineText.match(/from\s+([\w.]+)/);
	if (pyFromMatch) {
		return pyFromMatch[1];
	}

	return undefined;
}

/**
 * Resolve references to their definitions
 * @summary Link refs to def nodes
 * @param nodes - Map of all nodes
 * @param edges - Array of all edges
 */
export function resolveReferences(
	nodes: Map<string, RepoGraphNode>,
	edges: RepoGraphEdge[]
): void {
	// Build symbol -> definition map
	const definitions = new Map<string, RepoGraphNode[]>();

	for (const node of nodes.values()) {
		if (node.nodeType === "def") {
			const existing = definitions.get(node.symbolName) || [];
			existing.push(node);
			definitions.set(node.symbolName, existing);
		}
	}

	// Resolve refs to defs
	for (const edge of edges) {
		if (edge.type === "invoke" || edge.type === "reference") {
			const sourceNode = nodes.get(edge.source);
			if (sourceNode && sourceNode.nodeType === "ref") {
				const defNodes = definitions.get(sourceNode.symbolName);
				if (defNodes && defNodes.length > 0) {
					// Prefer definitions in the same file
					const sameFileDef = defNodes.find((d) => d.file === sourceNode.file);
					const targetNode = sameFileDef || defNodes[0];
					edge.target = targetNode.id;
					edge.confidence = sameFileDef ? 1.0 : 0.8;
				}
			}
		}
	}
}

/**
 * Build RepoGraph index from project files
 * @summary Build complete RepoGraph
 * @param path - Target path to index
 * @param cwd - Working directory
 * @returns Promise resolving to RepoGraphIndex
 * @throws Error if file operations fail
 * @example
 * const graph = await buildRepoGraph("./src", "/project");
 * console.log(`Built graph with ${graph.nodes.size} nodes`);
 */
export async function buildRepoGraph(
	path: string,
	cwd: string
): Promise<RepoGraphIndex> {
	const files = await getSourceFiles(path, cwd);
	const nodes = new Map<string, RepoGraphNode>();
	const edges: RepoGraphEdge[] = [];

	// Phase 1: Parse all files
	for (const file of files) {
		const language = detectLanguage(file);
		if (!language) continue;

		try {
			const content = await readFile(join(cwd, file), "utf-8");
			const lines = content.split("\n");

			const { nodes: fileNodes, edges: fileEdges } = await parseFile(
				content,
				file,
				language
			);

			// Add filtered nodes
			for (const node of fileNodes) {
				if (shouldIncludeNode(node)) {
					nodes.set(node.id, node);
				}
			}

			// Add filtered edges
			for (const edge of fileEdges) {
				if (shouldIncludeEdge(edge)) {
					edges.push(edge);
				}
			}

			// Add "contain" edges (file -> definitions)
			for (const defNode of fileNodes.filter((n) => n.nodeType === "def")) {
				if (shouldIncludeNode(defNode)) {
					edges.push({
						source: file,
						target: defNode.id,
						type: "contain",
						confidence: 1.0,
					});
				}
			}

			// Add "next" edges (sequential lines with same symbol)
			const defNodes = fileNodes.filter(
				(n) => n.nodeType === "def" && shouldIncludeNode(n)
			);
			for (let i = 0; i < defNodes.length - 1; i++) {
				edges.push({
					source: defNodes[i].id,
					target: defNodes[i + 1].id,
					type: "next",
					confidence: 0.5,
				});
			}
		} catch {
			// Skip files we can't read
		}
	}

	// Phase 2: Resolve references to definitions
	resolveReferences(nodes, edges);

	// Build metadata
	const metadata: RepoGraphMetadata = {
		indexedAt: Date.now(),
		fileCount: files.length,
		nodeCount: nodes.size,
		edgeCount: edges.length,
		language: "multi",
		version: 1,
	};

	return {
		nodes,
		edges,
		metadata,
	};
}

/**
 * Build RepoGraph for a single file
 * @summary Build graph for one file
 * @param filePath - File path relative to cwd
 * @param cwd - Working directory
 * @returns Promise resolving to RepoGraphIndex or null if unsupported
 */
export async function buildFileRepoGraph(
	filePath: string,
	cwd: string
): Promise<RepoGraphIndex | null> {
	const language = detectLanguage(filePath);
	if (!language) return null;

	try {
		const content = await readFile(join(cwd, filePath), "utf-8");
		const { nodes: fileNodes, edges: fileEdges } = await parseFile(
			content,
			filePath,
			language
		);

		const nodes = new Map<string, RepoGraphNode>();
		const edges: RepoGraphEdge[] = [];

		// Add filtered nodes
		for (const node of fileNodes) {
			if (shouldIncludeNode(node)) {
				nodes.set(node.id, node);
			}
		}

		// Add filtered edges
		for (const edge of fileEdges) {
			if (shouldIncludeEdge(edge)) {
				edges.push(edge);
			}
		}

		resolveReferences(nodes, edges);

		return {
			nodes,
			edges,
			metadata: {
				indexedAt: Date.now(),
				fileCount: 1,
				nodeCount: nodes.size,
				edgeCount: edges.length,
				language,
				version: 1,
			},
		};
	} catch {
		return null;
	}
}
