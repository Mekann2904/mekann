/**
 * sym_index Tool
 *
 * Generate symbol index using ctags with JSONL output format.
 * Supports both full and incremental indexing with content hash-based change detection.
 *
 * Index Structure:
 * .pi/search/
 * ├── symbols/
 * │   ├── manifest.json    # { [filePath]: { hash, mtime, shardId } }
 * │   ├── shard-0.jsonl
 * │   ├── shard-1.jsonl
 * │   └── ...
 * ├── symbols.jsonl        # Legacy single-file index (for backward compatibility)
 * └── meta.json
 */

import { join, dirname, relative } from "node:path";
import { mkdir, writeFile, readFile, access, stat, readdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execute, buildCtagsArgs, checkToolAvailability } from "../utils/cli.js";
import {
	INDEX_DIR_NAME,
	SYMBOL_INDEX_FILE,
	INDEX_META_FILE,
	INDEX_MANIFEST_FILE,
	SHARD_DIR_NAME,
	MAX_ENTRIES_PER_SHARD,
} from "../utils/constants.js";
import type {
	SymIndexInput,
	SymIndexOutput,
	SymbolIndexEntry,
	IndexManifest,
	IndexMetadata,
	ShardHeader,
} from "../types.js";
import { dependencyError, executionError, parameterError } from "../utils/errors.js";

// ============================================
// Constants
// ============================================

// Index is considered stale if source files were modified after index creation
const STALENESS_CHECK_ENABLED = true;

// Current index format version
const INDEX_VERSION = 2;

// Legacy index paths (for backward compatibility)
const LEGACY_INDEX_DIR = ".pi/search";
const LEGACY_INDEX_FILE = "symbols.jsonl";
const LEGACY_INDEX_META_FILE = "index-meta.json";

// ============================================
// Path Helpers
// ============================================

/**
 * Get the index directory path (new structure)
 */
function getIndexDir(cwd: string): string {
	return join(cwd, INDEX_DIR_NAME);
}

/**
 * Get the shard directory path
 */
function getShardDir(cwd: string): string {
	return join(getIndexDir(cwd), SHARD_DIR_NAME);
}

/**
 * Get the legacy index file path
 */
function getLegacyIndexPath(cwd: string): string {
	return join(cwd, LEGACY_INDEX_DIR, LEGACY_INDEX_FILE);
}

/**
 * Get the legacy index metadata file path
 */
function getLegacyMetaPath(cwd: string): string {
	return join(cwd, LEGACY_INDEX_DIR, LEGACY_INDEX_META_FILE);
}

/**
 * Get the new manifest file path
 */
function getManifestPath(cwd: string): string {
	return join(getShardDir(cwd), INDEX_MANIFEST_FILE);
}

/**
 * Get the new metadata file path
 */
function getMetaPath(cwd: string): string {
	return join(getIndexDir(cwd), INDEX_META_FILE);
}

/**
 * Get the shard file path for a given shard ID
 */
function getShardPath(cwd: string, shardId: number): string {
	return join(getShardDir(cwd), `shard-${shardId}.jsonl`);
}

// ============================================
// File Hash Utilities
// ============================================

/**
 * Compute content hash for a file.
 * Uses MD5 for speed (not cryptographic security).
 */
async function computeFileHash(filePath: string): Promise<string> {
	try {
		const content = await readFile(filePath);
		return createHash("md5").update(content).digest("hex");
	} catch {
		return "";
	}
}

/**
 * Get file modification time in milliseconds.
 */
async function getFileMtime(filePath: string): Promise<number> {
	try {
		const stats = await stat(filePath);
		return stats.mtimeMs;
	} catch {
		return 0;
	}
}

// ============================================
// Index File Operations
// ============================================

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read existing index (legacy single-file format)
 */
async function readLegacyIndex(indexPath: string): Promise<SymbolIndexEntry[]> {
	try {
		const content = await readFile(indexPath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);
		return lines.map((line) => JSON.parse(line) as SymbolIndexEntry);
	} catch {
		return [];
	}
}

/**
 * Write index file (legacy single-file format)
 */
async function writeLegacyIndex(
	indexPath: string,
	entries: SymbolIndexEntry[]
): Promise<void> {
	const dir = dirname(indexPath);
	await mkdir(dir, { recursive: true });

	const content = entries.map((e) => JSON.stringify(e)).join("\n");
	await writeFile(indexPath, content, "utf-8");
}

// ============================================
// Shard Operations
// ============================================

/**
 * Read a shard file and return its entries.
 */
async function readShard(shardPath: string): Promise<SymbolIndexEntry[]> {
	try {
		const content = await readFile(shardPath, "utf-8");
		const lines = content.trim().split("\n").filter(Boolean);

		// Skip header line (first line)
		if (lines.length === 0) return [];
		return lines.slice(1).map((line) => JSON.parse(line) as SymbolIndexEntry);
	} catch {
		return [];
	}
}

/**
 * Write a shard file with header.
 */
async function writeShard(
	shardPath: string,
	shardId: number,
	entries: SymbolIndexEntry[]
): Promise<void> {
	const dir = dirname(shardPath);
	await mkdir(dir, { recursive: true });

	const header: ShardHeader = {
		id: shardId,
		entryCount: entries.length,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	const lines = [
		JSON.stringify(header),
		...entries.map((e) => JSON.stringify(e)),
	];

	await writeFile(shardPath, lines.join("\n"), "utf-8");
}

/**
 * Read all shards and combine entries.
 */
async function readAllShards(cwd: string): Promise<SymbolIndexEntry[]> {
	const shardDir = getShardDir(cwd);

	if (!(await fileExists(shardDir))) {
		return [];
	}

	const entries: SymbolIndexEntry[] = [];
	const files = await readdir(shardDir);

	for (const file of files) {
		if (file.startsWith("shard-") && file.endsWith(".jsonl")) {
			const shardPath = join(shardDir, file);
			const shardEntries = await readShard(shardPath);
			entries.push(...shardEntries);
		}
	}

	return entries;
}

// ============================================
// Manifest Operations
// ============================================

/**
 * Read the index manifest.
 */
async function readManifest(manifestPath: string): Promise<IndexManifest> {
	try {
		const content = await readFile(manifestPath, "utf-8");
		return JSON.parse(content) as IndexManifest;
	} catch {
		return {};
	}
}

/**
 * Write the index manifest.
 */
async function writeManifest(
	manifestPath: string,
	manifest: IndexManifest
): Promise<void> {
	const dir = dirname(manifestPath);
	await mkdir(dir, { recursive: true });
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

// ============================================
// Metadata Operations
// ============================================

/**
 * Legacy index metadata structure
 */
interface LegacyIndexMeta {
	createdAt: number;
	sourceDir: string;
}

/**
 * Read legacy index metadata
 */
async function readLegacyMeta(metaPath: string): Promise<LegacyIndexMeta | null> {
	try {
		const content = await readFile(metaPath, "utf-8");
		return JSON.parse(content) as LegacyIndexMeta;
	} catch {
		return null;
	}
}

/**
 * Write legacy index metadata
 */
async function writeLegacyMeta(
	metaPath: string,
	meta: LegacyIndexMeta
): Promise<void> {
	const dir = dirname(metaPath);
	await mkdir(dir, { recursive: true });
	await writeFile(metaPath, JSON.stringify(meta), "utf-8");
}

/**
 * Read new index metadata
 */
async function readMeta(metaPath: string): Promise<IndexMetadata | null> {
	try {
		const content = await readFile(metaPath, "utf-8");
		return JSON.parse(content) as IndexMetadata;
	} catch {
		return null;
	}
}

/**
 * Write new index metadata
 */
async function writeMeta(metaPath: string, meta: IndexMetadata): Promise<void> {
	const dir = dirname(metaPath);
	await mkdir(dir, { recursive: true });
	await writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}

// ============================================
// Change Detection
// ============================================

/**
 * Detect files that have changed since last indexing.
 * Returns files that need re-indexing.
 */
async function detectChangedFiles(
	cwd: string,
	currentFiles: string[]
): Promise<{ changed: string[]; removed: string[] }> {
	const manifestPath = getManifestPath(cwd);
	const manifest = await readManifest(manifestPath);

	const changed: string[] = [];
	const removed: string[] = [];

	// Find changed and new files
	for (const file of currentFiles) {
		const entry = manifest[file];
		const filePath = join(cwd, file);
		const currentMtime = await getFileMtime(filePath);

		if (!entry) {
			// New file
			changed.push(file);
		} else if (currentMtime > entry.mtime) {
			// Modified file - verify with hash
			const currentHash = await computeFileHash(filePath);
			if (currentHash !== entry.hash) {
				changed.push(file);
			}
		}
	}

	// Find removed files
	for (const file of Object.keys(manifest)) {
		if (!currentFiles.includes(file)) {
			removed.push(file);
		}
	}

	return { changed, removed };
}

/**
 * Get list of source files from existing entries.
 */
function getSourceFiles(entries: SymbolIndexEntry[]): string[] {
	return [...new Set(entries.map((e) => e.file))];
}

// ============================================
// Staleness Detection
// ============================================

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

	const meta = await readLegacyMeta(metaPath);
	if (!meta) return true;

	try {
		// Get index file stats
		const indexStats = await stat(indexPath);
		const indexMtime = indexStats.mtimeMs;

		// Read a sample of files from the index
		const entries = await readLegacyIndex(indexPath);
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
		throw executionError("ctags", result.stderr);
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

/**
 * Use ctags to index specific files only.
 */
async function useCtagsForFiles(
	files: string[],
	cwd: string
): Promise<SymbolIndexEntry[]> {
	if (files.length === 0) return [];

	const args = [
		"--output-format=json",
		"--fields=+n+s+S+k",
		"--extras=+q",
		"--sort=no",
		...files,
	];

	const result = await execute("ctags", args, { cwd });

	if (result.code !== 0) {
		throw executionError("ctags", result.stderr);
	}

	// Parse JSONL output
	const lines = result.stdout.trim().split("\n").filter(Boolean);
	const entries: SymbolIndexEntry[] = [];

	for (const line of lines) {
		try {
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
// Incremental Index Operations
// ============================================

/**
 * Perform incremental index update.
 * Only re-indexes changed files and updates affected shards.
 * Returns null if full re-index is recommended.
 */
async function incrementalUpdate(
	cwd: string,
	existingEntries: SymbolIndexEntry[]
): Promise<SymbolIndexEntry[] | null> {
	const sourceFiles = getSourceFiles(existingEntries);
	const { changed, removed } = await detectChangedFiles(cwd, sourceFiles);

	// If more than 50% of files changed, do full re-index
	if (changed.length > sourceFiles.length * 0.5) {
		return null; // Signal to do full re-index
	}

	// Remove entries for deleted/changed files
	let entries = existingEntries.filter(
		(e) => !removed.includes(e.file) && !changed.includes(e.file)
	);

	// Index changed files
	if (changed.length > 0) {
		const newEntries = await useCtagsForFiles(changed, cwd);
		entries = [...entries, ...newEntries];
	}

	return entries;
}

/**
 * Update manifest with current file states.
 */
async function updateManifest(
	cwd: string,
	entries: SymbolIndexEntry[],
	shardCount: number
): Promise<void> {
	const manifestPath = getManifestPath(cwd);
	const manifest: IndexManifest = {};

	// Group entries by file
	const fileEntries = new Map<string, SymbolIndexEntry[]>();
	for (const entry of entries) {
		const list = fileEntries.get(entry.file) || [];
		list.push(entry);
		fileEntries.set(entry.file, list);
	}

	// Build manifest entries
	let currentShard = 0;
	let currentCount = 0;

	for (const [file, fileEntryList] of fileEntries) {
		const filePath = join(cwd, file);
		const hash = await computeFileHash(filePath);
		const mtime = await getFileMtime(filePath);

		manifest[file] = {
			hash,
			mtime,
			shardId: currentShard,
		};

		// Advance shard when current one is full
		currentCount += fileEntryList.length;
		if (currentCount >= MAX_ENTRIES_PER_SHARD) {
			currentShard++;
			currentCount = 0;
		}
	}

	await writeManifest(manifestPath, manifest);
}

/**
 * Write entries to sharded files.
 */
async function writeShardedIndex(
	cwd: string,
	entries: SymbolIndexEntry[]
): Promise<number> {
	const shardDir = getShardDir(cwd);
	await mkdir(shardDir, { recursive: true });

	// Clear existing shards
	const existingFiles = await readdir(shardDir).catch(() => []);
	for (const file of existingFiles) {
		if (file.startsWith("shard-") && file.endsWith(".jsonl")) {
			await unlink(join(shardDir, file)).catch(() => {});
		}
	}

	// Split entries into shards
	const shards: SymbolIndexEntry[][] = [];
	let currentShard: SymbolIndexEntry[] = [];

	for (const entry of entries) {
		currentShard.push(entry);
		if (currentShard.length >= MAX_ENTRIES_PER_SHARD) {
			shards.push(currentShard);
			currentShard = [];
		}
	}

	if (currentShard.length > 0) {
		shards.push(currentShard);
	}

	// Write each shard
	for (let i = 0; i < shards.length; i++) {
		const shardPath = getShardPath(cwd, i);
		await writeShard(shardPath, i, shards[i]);
	}

	return shards.length;
}

// ============================================
// Main Entry Point
// ============================================

/**
 * Generate symbol index using ctags.
 * Supports both full and incremental indexing.
 */
export async function symIndex(
	input: SymIndexInput,
	cwd: string
): Promise<SymIndexOutput> {
	const availability = await checkToolAvailability();

	if (!availability.ctags || !availability.ctagsJson) {
		throw dependencyError(
			"ctags",
			"Install universal-ctags: brew install universal-ctags (macOS) or apt install universal-ctags (Ubuntu)"
		);
	}

	const targetPath = input.path ?? cwd;
	const legacyIndexPath = getLegacyIndexPath(cwd);
	const legacyMetaPath = getLegacyMetaPath(cwd);

	// Check if regeneration is needed
	if (!input.force) {
		const exists = await fileExists(legacyIndexPath);
		if (exists) {
			// Check for staleness
			const stale = await isIndexStale(legacyIndexPath, legacyMetaPath, cwd);
			if (!stale) {
				const entries = await readLegacyIndex(legacyIndexPath);
				return {
					indexed: entries.length,
					outputPath: legacyIndexPath,
				};
			}
			// Index is stale, try incremental update
			try {
				const existingEntries = await readLegacyIndex(legacyIndexPath);
				const updatedEntries = await incrementalUpdate(cwd, existingEntries);

				if (updatedEntries) {
					// Write updated index
					await writeLegacyIndex(legacyIndexPath, updatedEntries);
					await writeLegacyMeta(legacyMetaPath, {
						createdAt: Date.now(),
						sourceDir: targetPath,
					});

					// Also update sharded index
					const shardCount = await writeShardedIndex(cwd, updatedEntries);
					await updateManifest(cwd, updatedEntries, shardCount);
					await writeMeta(getMetaPath(cwd), {
						createdAt: Date.now(),
						updatedAt: Date.now(),
						sourceDir: targetPath,
						totalSymbols: updatedEntries.length,
						totalFiles: getSourceFiles(updatedEntries).length,
						shardCount,
						version: INDEX_VERSION,
					});

					return {
						indexed: updatedEntries.length,
						outputPath: legacyIndexPath,
					};
				}
				// Too many changes, fall through to full re-index
			} catch {
				// Incremental update failed, do full re-index
			}
		}
	}

	// Generate full index
	try {
		const entries = await useCtagsCommand(targetPath, cwd);

		// Write legacy index (for backward compatibility)
		await writeLegacyIndex(legacyIndexPath, entries);
		await writeLegacyMeta(legacyMetaPath, {
			createdAt: Date.now(),
			sourceDir: targetPath,
		});

		// Write sharded index
		const shardCount = await writeShardedIndex(cwd, entries);
		await updateManifest(cwd, entries, shardCount);
		await writeMeta(getMetaPath(cwd), {
			createdAt: Date.now(),
			updatedAt: Date.now(),
			sourceDir: targetPath,
			totalSymbols: entries.length,
			totalFiles: getSourceFiles(entries).length,
			shardCount,
			version: INDEX_VERSION,
		});

		return {
			indexed: entries.length,
			outputPath: legacyIndexPath,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw executionError(
			"ctags",
			message,
			"Check that the target directory contains valid source files"
		);
	}
}

/**
 * Read and parse existing symbol index.
 * Supports both legacy and sharded formats.
 */
export async function readSymbolIndex(
	cwd: string
): Promise<SymbolIndexEntry[] | null> {
	// Try sharded index first
	const shardDir = getShardDir(cwd);
	if (await fileExists(shardDir)) {
		const entries = await readAllShards(cwd);
		if (entries.length > 0) {
			return entries;
		}
	}

	// Fall back to legacy index
	const legacyIndexPath = getLegacyIndexPath(cwd);
	if (await fileExists(legacyIndexPath)) {
		return readLegacyIndex(legacyIndexPath);
	}

	return null;
}

/**
 * Get index metadata.
 */
export async function getIndexMetadata(
	cwd: string
): Promise<IndexMetadata | null> {
	const metaPath = getMetaPath(cwd);
	return readMeta(metaPath);
}

/**
 * Tool definition for pi.registerTool
 */
export const symIndexToolDefinition = {
	name: "sym_index",
	label: "Symbol Index",
	description:
		"Generate a symbol index using ctags. Creates a JSONL file with function, class, and variable definitions. Supports incremental updates.",
	parameters: null, // Will be set in index.ts
};
