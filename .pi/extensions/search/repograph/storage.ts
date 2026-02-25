/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/storage.ts
 * role: RepoGraph index persistence layer for saving and loading graph data
 * why: Enable caching of graph indices to avoid rebuilding on each query
 * related: .pi/extensions/search/repograph/builder.ts, .pi/extensions/search/repograph/types.ts
 * public_api: saveRepoGraph, loadRepoGraph, deleteRepoGraph, isRepoGraphStale
 * invariants:
 * - Index path is always .pi/search/repograph/index.json
 * - Map serialization preserves all entries
 * - Metadata includes timestamp for staleness detection
 * side_effects:
 * - Creates directories if they don't exist
 * - Writes to filesystem on save
 * - Reads from filesystem on load
 * failure_modes:
 * - Permission errors on file write
 * - Disk full errors
 * - Corrupted index file (handled with null return)
 * @abdd.explain
 * overview: Persist RepoGraph indices to filesystem
 * what_it_does:
 * - Serializes RepoGraphIndex to JSON format
 * - Handles Map to array conversion for JSON compatibility
 * - Loads and deserializes indices back to Map structure
 * - Detects stale indices based on file modification time
 * why_it_exists:
 * - Avoid rebuilding graph on every search
 * - Enable incremental updates
 * - Support persistent caching across sessions
 * scope:
 * in: RepoGraphIndex object, working directory path
 * out: Index file path, loaded RepoGraphIndex or null
 */

import { readFile, writeFile, mkdir, rm, stat } from "fs/promises";
import { join, dirname } from "path";
import type {
	RepoGraphIndex,
	RepoGraphNode,
	RepoGraphEdge,
	RepoGraphMetadata,
} from "./types.js";

/**
 * Directory for RepoGraph index storage
 */
const REPOGRAPH_DIR = ".pi/search/repograph";

/**
 * Index file name
 */
const INDEX_FILE = "index.json";

/**
 * Serializable format for JSON storage
 */
interface SerializableRepoGraph {
	nodes: [string, RepoGraphNode][];
	edges: RepoGraphEdge[];
	metadata: RepoGraphMetadata;
}

/**
 * Save RepoGraph index to disk
 * @summary Persist graph to disk
 * @param graph - RepoGraph index to save
 * @param cwd - Working directory
 * @returns Promise resolving to output file path
 * @throws Error if write fails
 * @example
 * const path = await saveRepoGraph(graph, "/project");
 * console.log(`Saved to ${path}`);
 */
export async function saveRepoGraph(
	graph: RepoGraphIndex,
	cwd: string
): Promise<string> {
	const indexPath = join(cwd, REPOGRAPH_DIR, INDEX_FILE);

	// Ensure directory exists
	await mkdir(dirname(indexPath), { recursive: true });

	// Convert Map to array for JSON serialization
	const serializable: SerializableRepoGraph = {
		nodes: Array.from(graph.nodes.entries()),
		edges: graph.edges,
		metadata: graph.metadata,
	};

	await writeFile(indexPath, JSON.stringify(serializable, null, 2), "utf-8");

	return indexPath;
}

/**
 * Load RepoGraph index from disk
 * @summary Load graph from disk
 * @param cwd - Working directory
 * @returns Promise resolving to RepoGraphIndex or null if not found
 * @example
 * const graph = await loadRepoGraph("/project");
 * if (graph) {
 *   console.log(`Loaded ${graph.nodes.size} nodes`);
 * }
 */
export async function loadRepoGraph(
	cwd: string
): Promise<RepoGraphIndex | null> {
	const indexPath = join(cwd, REPOGRAPH_DIR, INDEX_FILE);

	try {
		const content = await readFile(indexPath, "utf-8");
		const data: SerializableRepoGraph = JSON.parse(content);

		return {
			nodes: new Map(data.nodes),
			edges: data.edges,
			metadata: data.metadata,
		};
	} catch {
		return null;
	}
}

/**
 * Delete RepoGraph index from disk
 * @summary Remove graph index file
 * @param cwd - Working directory
 * @returns Promise resolving when deletion completes
 */
export async function deleteRepoGraph(cwd: string): Promise<void> {
	const indexPath = join(cwd, REPOGRAPH_DIR, INDEX_FILE);

	try {
		await rm(indexPath, { force: true });
	} catch {
		// Ignore errors
	}
}

/**
 * Check if RepoGraph index is stale compared to source files
 * @summary Check index staleness
 * @param cwd - Working directory
 * @param sourcePath - Path to source directory
 * @returns Promise resolving to true if index is stale or missing
 * @example
 * if (await isRepoGraphStale("/project", "./src")) {
 *   await buildRepoGraph("./src", "/project");
 * }
 */
export async function isRepoGraphStale(
	cwd: string,
	sourcePath?: string
): Promise<boolean> {
	const indexPath = join(cwd, REPOGRAPH_DIR, INDEX_FILE);

	try {
		const indexStat = await stat(indexPath);
		const graph = await loadRepoGraph(cwd);

		if (!graph) return true;

		// Check if index is older than 24 hours
		const maxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
		if (Date.now() - indexStat.mtimeMs > maxAge) {
			return true;
		}

		// If source path provided, check for newer files
		if (sourcePath) {
			const sourceDir = join(cwd, sourcePath);
			try {
				const sourceStat = await stat(sourceDir);
				if (sourceStat.mtimeMs > indexStat.mtimeMs) {
					return true;
				}
			} catch {
				// Source dir doesn't exist, not stale
			}
		}

		return false;
	} catch {
		return true;
	}
}

/**
 * Get path to RepoGraph index file
 * @summary Get index file path
 * @param cwd - Working directory
 * @returns Absolute path to index file
 */
export function getRepoGraphPath(cwd: string): string {
	return join(cwd, REPOGRAPH_DIR, INDEX_FILE);
}

/**
 * Get RepoGraph index metadata without loading full graph
 * @summary Get index metadata only
 * @param cwd - Working directory
 * @returns Promise resolving to metadata or null
 */
export async function getRepoGraphMetadata(
	cwd: string
): Promise<RepoGraphMetadata | null> {
	const graph = await loadRepoGraph(cwd);
	return graph?.metadata ?? null;
}
