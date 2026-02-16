/**
 * sym_index Tool
 *
 * Generate symbol index using ctags with JSONL output format
 * Includes staleness detection based on source file modification times.
 */

import { join, dirname, relative } from "node:path";
import { mkdir, writeFile, readFile, access, stat } from "node:fs/promises";
import { execute, buildCtagsArgs, checkToolAvailability } from "../utils/cli.js";
import type { SymIndexInput, SymIndexOutput, SymbolIndexEntry } from "../types.js";

// ============================================
// Constants
// ============================================

const INDEX_DIR = ".pi/search";
const INDEX_FILE = "symbols.jsonl";
const INDEX_META_FILE = "index-meta.json";

// Index is considered stale if source files were modified after index creation
const STALENESS_CHECK_ENABLED = true;

// ============================================
// Index File Operations
// ============================================

/**
 * Get the index file path
 */
function getIndexPath(cwd: string): string {
	return join(cwd, INDEX_DIR, INDEX_FILE);
}

/**
 * Get the index metadata file path
 */
function getIndexMetaPath(cwd: string): string {
	return join(cwd, INDEX_DIR, INDEX_META_FILE);
}

/**
 * Check if index exists
 */
async function indexExists(indexPath: string): Promise<boolean> {
	try {
		await access(indexPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read existing index
 */
async function readIndex(indexPath: string): Promise<SymbolIndexEntry[]> {
	try {
		const content = await readFile(indexPath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);
		return lines.map((line) => JSON.parse(line) as SymbolIndexEntry);
	} catch {
		return [];
	}
}

/**
 * Write index file
 */
async function writeIndex(indexPath: string, entries: SymbolIndexEntry[]): Promise<void> {
	const dir = dirname(indexPath);
	await mkdir(dir, { recursive: true });

	const content = entries.map((e) => JSON.stringify(e)).join("\n");
	await writeFile(indexPath, content, "utf-8");
}

/**
 * Index metadata for staleness detection
 */
interface IndexMeta {
	createdAt: number;  // timestamp
	sourceDir: string;
}

/**
 * Read index metadata
 */
async function readIndexMeta(metaPath: string): Promise<IndexMeta | null> {
	try {
		const content = await readFile(metaPath, "utf-8");
		return JSON.parse(content) as IndexMeta;
	} catch {
		return null;
	}
}

/**
 * Write index metadata
 */
async function writeIndexMeta(metaPath: string, meta: IndexMeta): Promise<void> {
	const dir = dirname(metaPath);
	await mkdir(dir, { recursive: true });
	await writeFile(metaPath, JSON.stringify(meta), "utf-8");
}

/**
 * Check if index is stale by comparing with source file modification times.
 * Samples a few files from the index to check for modifications.
 */
async function isIndexStale(
	indexPath: string,
	metaPath: string,
	cwd: string
): Promise<boolean> {
	if (!STALENESS_CHECK_ENABLED) return false;

	const meta = await readIndexMeta(metaPath);
	if (!meta) return true;

	try {
		// Get index file stats
		const indexStats = await stat(indexPath);
		const indexMtime = indexStats.mtimeMs;

		// Read a sample of files from the index
		const entries = await readIndex(indexPath);
		const sampleFiles = new Set<string>();

		// Take up to 10 unique files as sample
		for (const entry of entries.slice(0, 50)) {
			sampleFiles.add(entry.file);
			if (sampleFiles.size >= 10) break;
		}

		// Check if any sampled file was modified after index creation
		for (const file of sampleFiles) {
			try {
				const filePath = join(cwd, file);
				const fileStats = await stat(filePath);
				if (fileStats.mtimeMs > indexMtime) {
					return true; // File was modified after index creation
				}
			} catch {
				// File might have been deleted, which is fine
			}
		}

		return false;
	} catch {
		return true;
	}
}

// ============================================
// ctags Command Implementation
// ============================================

/**
 * Use ctags to generate symbol index
 */
async function useCtagsCommand(
	targetPath: string,
	cwd: string
): Promise<SymbolIndexEntry[]> {
	const args = buildCtagsArgs(targetPath, cwd);

	const result = await execute("ctags", args, { cwd });

	if (result.code !== 0) {
		throw new Error(`ctags command failed: ${result.stderr}`);
	}

	// Parse JSONL output
	const lines = result.stdout.trim().split("\n").filter(Boolean);
	const entries: SymbolIndexEntry[] = [];

	for (const line of lines) {
		try {
			// ctags JSON uses 'path' field, we map it to 'file'
			const raw = JSON.parse(line) as Record<string, unknown>;
			entries.push({
				name: String(raw.name || ""),
				kind: String(raw.kind || "unknown"),
				file: String(raw.file || raw.path || ""),
				line: Number(raw.line || 0),
				signature: raw.signature ? String(raw.signature) : undefined,
				scope: raw.scope ? String(raw.scope) : undefined,
				pattern: raw.pattern ? String(raw.pattern) : undefined,
			});
		} catch {
			// Skip malformed lines
		}
	}

	return entries;
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Generate symbol index using ctags
 */
export async function symIndex(
	input: SymIndexInput,
	cwd: string
): Promise<SymIndexOutput> {
	const availability = await checkToolAvailability();

	if (!availability.ctags || !availability.ctagsJson) {
		return {
			indexed: 0,
			outputPath: "",
			error: "ctags is not available or does not support JSON output. Please install universal-ctags.",
		};
	}

	const targetPath = input.path ?? cwd;
	const indexPath = getIndexPath(cwd);
	const metaPath = getIndexMetaPath(cwd);

	// Check if regeneration is needed
	if (!input.force) {
		const exists = await indexExists(indexPath);
		if (exists) {
			// Check for staleness
			const stale = await isIndexStale(indexPath, metaPath, cwd);
			if (!stale) {
				const entries = await readIndex(indexPath);
				return {
					indexed: entries.length,
					outputPath: indexPath,
				};
			}
			// Index is stale, regenerate
		}
	}

	// Generate index
	try {
		const entries = await useCtagsCommand(targetPath, cwd);
		await writeIndex(indexPath, entries);

		// Write metadata for staleness detection
		await writeIndexMeta(metaPath, {
			createdAt: Date.now(),
			sourceDir: targetPath,
		});

		return {
			indexed: entries.length,
			outputPath: indexPath,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			indexed: 0,
			outputPath: "",
			error: `Failed to generate symbol index: ${message}`,
		};
	}
}

/**
 * Read and parse existing symbol index
 */
export async function readSymbolIndex(cwd: string): Promise<SymbolIndexEntry[] | null> {
	const indexPath = getIndexPath(cwd);

	const exists = await indexExists(indexPath);
	if (!exists) return null;

	return readIndex(indexPath);
}

/**
 * Tool definition for pi.registerTool
 */
export const symIndexToolDefinition = {
	name: "sym_index",
	label: "Symbol Index",
	description:
		"Generate a symbol index using ctags. Creates a JSONL file with function, class, and variable definitions.",
	parameters: null, // Will be set in index.ts
};
