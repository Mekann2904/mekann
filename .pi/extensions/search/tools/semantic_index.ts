/**
 * @abdd.meta
 * path: .pi/extensions/search/tools/semantic_index.ts
 * role: コードの意味的検索のための埋め込みベクトルインデックス生成ツール
 * why: ファイルシステム上のコードをベクトル化し、類似度検索を可能にするため
 * related: .pi/extensions/search/types.ts, .pi/extensions/search/utils/constants.ts, .pi/extensions/embeddings/index.ts
 * public_api: semantic_index関数
 * invariants: インデックスファイルはJSONL形式、チャンク識別子は一意、メタデータはJSON形式
 * side_effects: ディレクトリの作成、インデックスファイルおよびメタデータファイルの書き込み、標準出力へのログ
 * failure_modes: ファイル読み込みエラー、埋め込み生成エラー、ディスク容量不足、権限エラー
 * @abdd.explain
 * overview: 指定ディレクトリ内のコードファイルを収集し、チャンク分割後に埋め込みベクトルを生成してインデックスファイルへ永続化する
 * what_it_does:
 *   - ディレクトリを再帰的に走査し、対象拡張子のファイルを収集する
 *   - コードを固定サイズのチャンク（重複あり）に分割する
 *   - チャンクの内容を基に埋め込みベクトルを生成する
 *   - 生成したベクトルとメタデータをファイルシステムへ保存する
 * why_it_exists:
 *   - テキスト一致だけでないコードの意味的検索を実現するため
 *   - 大規模なコードベースに対する効率的な類似度検索を提供するため
 * scope:
 *   in: 対象ディレクトリパス、除外パターン、チャンクサイズ設定
 *   out: 埋め込みベクトルを含むJSONLファイル、検索メタデータを含むJSONファイル
 */

/**
 * Semantic Index Tool
 *
 * Generates vector embeddings for code files and stores them in a semantic index.
 * Uses the embeddings module to generate embeddings with fallback providers.
 *
 * Usage:
 *   semantic_index({ path: "./src", force: true })
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import type {
	SemanticIndexInput,
	SemanticIndexOutput,
	SemanticIndexMetadata,
	CodeEmbedding,
} from "../types.js";
import {
	INDEX_DIR_NAME,
	DEFAULT_EXCLUDES,
} from "../utils/constants.js";

// ============================================================================
// Constants
// ============================================================================

const SEMANTIC_INDEX_FILE = "semantic-index.jsonl";
const SEMANTIC_META_FILE = "semantic-meta.json";

const DEFAULT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "py", "go", "rs", "java", "c", "cpp", "h", "hpp"];
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;

// ============================================================================
// File Collection
// ============================================================================

/**
 * Collect files recursively from a directory.
 */
function collectFiles(
	dir: string,
	extensions: string[],
	excludes: string[]
): string[] {
	const files: string[] = [];

	function walk(currentDir: string): void {
		const entries = readdirSync(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);

			// Check exclusion patterns
			const relativePath = relative(dir, fullPath);
			if (excludes.some((exc) => relativePath.includes(exc) || entry.name === exc)) {
				continue;
			}

			if (entry.isDirectory()) {
				walk(fullPath);
			} else if (entry.isFile()) {
				const ext = extname(entry.name).slice(1).toLowerCase();
				if (extensions.includes(ext)) {
					files.push(fullPath);
				}
			}
		}
	}

	walk(dir);
	return files;
}

// ============================================================================
// Code Chunking
// ============================================================================

interface CodeChunk {
	id: string;
	file: string;
	line: number;
	code: string;
	language: string;
	symbol?: string;
	kind?: "function" | "class" | "variable" | "chunk";
}

/**
 * Detect language from file extension.
 */
function detectLanguage(filePath: string): string {
	const ext = extname(filePath).slice(1).toLowerCase();
	const langMap: Record<string, string> = {
		ts: "typescript",
		tsx: "typescript",
		js: "javascript",
		jsx: "javascript",
		py: "python",
		go: "go",
		rs: "rust",
		java: "java",
		c: "c",
		cpp: "cpp",
		h: "c",
		hpp: "cpp",
	};
	return langMap[ext] || ext;
}

/**
 * Detect symbol boundaries (function/class start lines) in code.
 * @summary Symbol boundary detection
 * @param lines - Source code lines
 * @param language - Programming language
 * @returns Array of symbol boundary information
 */
function detectSymbolBoundaries(
	lines: string[],
	language: string
): Array<{ line: number; type: string; name: string; indent: number }> {
	const boundaries: Array<{ line: number; type: string; name: string; indent: number }> = [];

	// Language-specific patterns for symbol detection
	const patterns: Record<string, RegExp[]> = {
		typescript: [
			/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
			/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
			/^\s*(?:export\s+)?(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/,
			/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
			/^\s*(?:export\s+)?interface\s+(\w+)/,
			/^\s*(?:export\s+)?type\s+(\w+)\s*=/,
		],
		javascript: [
			/^\s*(?:export\s+)?class\s+(\w+)/,
			/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
			/^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
		],
		python: [
			/^\s*class\s+(\w+)/,
			/^\s*(?:async\s+)?def\s+(\w+)/,
		],
		go: [
			/^\s*func\s+(?:\([^)]+\)\s+)?(\w+)/,
			/^\s*type\s+(\w+)\s+struct/,
		],
		rust: [
			/^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
			/^\s*(?:pub\s+)?struct\s+(\w+)/,
			/^\s*(?:pub\s+)?impl\s+(?:<[^>]+>\s+)?(\w+)/,
		],
		java: [
			/^\s*(?:public|private|protected)?\s*(?:abstract\s+)?class\s+(\w+)/,
			/^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:\w+)\s+(\w+)\s*\([^)]*\)/,
		],
		c: [
			/^\s*(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*\{/,
		],
		cpp: [
			/^\s*(?:\w+\s+)+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{/,
			/^\s*class\s+(\w+)/,
		],
	};

	const langPatterns = patterns[language] || patterns.typescript;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const indent = line.search(/\S/);

		for (const pattern of langPatterns) {
			const match = line.match(pattern);
			if (match) {
				boundaries.push({
					line: i,
					type: pattern.source.includes('class') ? 'class' :
					      pattern.source.includes('function') || pattern.source.includes('def') || pattern.source.includes('fn') ? 'function' :
					      'symbol',
					name: match[1],
					indent,
				});
				break;
			}
		}
	}

	return boundaries;
}

/**
 * Split code into chunks for embedding.
 * Uses symbol-aware chunking to avoid splitting functions/classes.
 */
function chunkCode(
	filePath: string,
	content: string,
	chunkSize: number,
	chunkOverlap: number
): CodeChunk[] {
	const lines = content.split("\n");
	const language = detectLanguage(filePath);
	const relativePath = filePath;
	const chunks: CodeChunk[] = [];

	// Detect symbol boundaries
	const boundaries = detectSymbolBoundaries(lines, language);

	// If no boundaries detected, fall back to line-based chunking
	if (boundaries.length === 0) {
		return chunkCodeLineBased(filePath, content, chunkSize, chunkOverlap);
	}

	let chunkIndex = 0;
	let currentLine = 0;

	while (currentLine < lines.length) {
		// Find the next symbol boundary at or after currentLine
		const startBoundary = boundaries.find(b => b.line >= currentLine);

		if (!startBoundary) {
			// No more symbols, chunk the rest
			if (currentLine < lines.length) {
				const code = lines.slice(currentLine).join("\n");
				if (code.trim()) {
					const chunkId = createHash("md5")
						.update(`${relativePath}:${currentLine}:${chunkIndex}`)
						.digest("hex")
						.slice(0, 12);

					chunks.push({
						id: chunkId,
						file: relativePath,
						line: currentLine + 1,
						code,
						language,
						kind: "chunk",
					});
					chunkIndex++;
				}
			}
			break;
		}

		// Include any non-symbol lines before the boundary
		const preSymbolStart = currentLine;
		const symbolStart = startBoundary.line;

		// Find the end of this symbol (next boundary or end of file)
		const nextBoundary = boundaries.find(b => b.line > symbolStart);
		let symbolEnd = nextBoundary ? nextBoundary.line - 1 : lines.length - 1;

		// Adjust symbol end based on brace/indent tracking for better boundary detection
		if (language === "typescript" || language === "javascript") {
			let braceDepth = 0;
			let foundStart = false;

			for (let i = symbolStart; i < lines.length; i++) {
				const line = lines[i];

				if (i === symbolStart) foundStart = true;

				braceDepth += (line.match(/{/g) || []).length;
				braceDepth -= (line.match(/}/g) || []).length;

				if (foundStart && braceDepth === 0 && line.includes("}")) {
					symbolEnd = i;
					break;
				}
			}
		} else if (language === "python") {
			// Python uses indentation
			const symbolIndent = startBoundary.indent;

			for (let i = symbolStart + 1; i < lines.length; i++) {
				const line = lines[i];
				if (line.trim() === "") continue;

				const currentIndent = line.search(/\S/);
				if (currentIndent <= symbolIndent && i > symbolStart) {
					symbolEnd = i - 1;
					break;
				}
			}
		}

		// Calculate chunk size
		const symbolCode = lines.slice(symbolStart, symbolEnd + 1).join("\n");
		const symbolCharCount = symbolCode.length;

		// If symbol is larger than chunk size, split it
		if (symbolCharCount > chunkSize * 1.5) {
			// Split large symbol into multiple chunks
			let splitStart = symbolStart;

			while (splitStart <= symbolEnd) {
				let splitEnd = splitStart;
				let charCount = 0;

				while (splitEnd <= symbolEnd && charCount < chunkSize) {
					charCount += lines[splitEnd].length + 1;
					splitEnd++;
				}

				if (splitEnd > symbolEnd) splitEnd = symbolEnd + 1;

				const code = lines.slice(splitStart, splitEnd).join("\n");
				if (code.trim()) {
					const chunkId = createHash("md5")
						.update(`${relativePath}:${splitStart}:${chunkIndex}`)
						.digest("hex")
						.slice(0, 12);

					chunks.push({
						id: chunkId,
						file: relativePath,
						line: splitStart + 1,
						code,
						language,
						symbol: startBoundary.name,
						kind: symbolStart === splitStart ? (startBoundary.type as "function" | "class" | "variable") : "chunk",
					});
					chunkIndex++;
				}

				splitStart = splitEnd;
			}
		} else {
			// Symbol fits in a single chunk
			const chunkId = createHash("md5")
				.update(`${relativePath}:${symbolStart}:${chunkIndex}`)
				.digest("hex")
				.slice(0, 12);

			chunks.push({
				id: chunkId,
				file: relativePath,
				line: symbolStart + 1,
				code: symbolCode,
				language,
				symbol: startBoundary.name,
				kind: startBoundary.type as "function" | "class" | "variable",
			});
			chunkIndex++;
		}

		currentLine = symbolEnd + 1;
	}

	return chunks;
}

/**
 * Fallback line-based chunking for files without detectable symbols.
 */
function chunkCodeLineBased(
	filePath: string,
	content: string,
	chunkSize: number,
	chunkOverlap: number
): CodeChunk[] {
	const lines = content.split("\n");
	const language = detectLanguage(filePath);
	const relativePath = filePath;
	const chunks: CodeChunk[] = [];

	let currentLine = 0;
	let chunkIndex = 0;

	while (currentLine < lines.length) {
		const startLine = currentLine;
		const chunkLines: string[] = [];
		let charCount = 0;

		while (currentLine < lines.length && charCount < chunkSize) {
			const line = lines[currentLine];
			chunkLines.push(line);
			charCount += line.length + 1;
			currentLine++;
		}

		if (chunkLines.length === 0) break;

		const code = chunkLines.join("\n");
		const chunkId = createHash("md5")
			.update(`${relativePath}:${startLine}:${chunkIndex}`)
			.digest("hex")
			.slice(0, 12);

		const symbolMatch = code.match(
			/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/m
		);

		chunks.push({
			id: chunkId,
			file: relativePath,
			line: startLine + 1,
			code,
			language,
			symbol: symbolMatch?.[1],
			kind: symbolMatch ? "chunk" : undefined,
		});

		chunkIndex++;

		if (chunkOverlap > 0 && currentLine < lines.length) {
			currentLine = Math.max(startLine + 1, currentLine - Math.floor(chunkOverlap / 50));
		}
	}

	return chunks;
}

// ============================================================================
// Embedding Generation
// ============================================================================

/**
 * Build text representation for embedding.
 * Includes file context and code content.
 */
function buildChunkText(chunk: CodeChunk): string {
	const parts: string[] = [];

	// Add file context
	parts.push(`File: ${chunk.file}`);
	parts.push(`Language: ${chunk.language}`);

	if (chunk.symbol) {
		parts.push(`Symbol: ${chunk.symbol}`);
	}

	parts.push("");
	parts.push(chunk.code);

	return parts.join("\n");
}

// ============================================================================
// Index Storage
// ============================================================================

function getIndexDir(cwd: string): string {
	return _getIndexDir(cwd);
}

function getIndexPath(cwd: string): string {
	return _getIndexPath(cwd);
}

function getMetaPath(cwd: string): string {
	return _getMetaPath(cwd);
}

async function loadExistingIndex(cwd: string): Promise<CodeEmbedding[]> {
	const indexPath = getIndexPath(cwd);
	if (!existsSync(indexPath)) {
		return [];
	}

	const content = readFileSync(indexPath, "utf-8");
	const lines = content.trim().split("\n");

	return lines
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as CodeEmbedding);
}

/**
 * Load existing index as a Map for efficient lookups.
 */
function loadExistingIndexAsMap(cwd: string): Map<string, CodeEmbedding> {
	const indexPath = getIndexPath(cwd);
	const embeddings = new Map<string, CodeEmbedding>();

	if (!existsSync(indexPath)) {
		return embeddings;
	}

	const content = readFileSync(indexPath, "utf-8");
	const lines = content.trim().split("\n");

	for (const line of lines) {
		if (line.trim()) {
			try {
				const emb = JSON.parse(line) as CodeEmbedding;
				embeddings.set(emb.id, emb);
			} catch {
				// Skip malformed entries
			}
		}
	}

	return embeddings;
}

/**
 * Get modification times for a list of files.
 */
function getFileMtimes(files: string[], cwd: string): Record<string, number> {
	const mtimes: Record<string, number> = {};

	for (const file of files) {
		try {
			const stat = statSync(file);
			const relativePath = relative(cwd, file);
			mtimes[relativePath] = stat.mtimeMs;
		} catch {
			// Skip files that can't be accessed
		}
	}

	return mtimes;
}

/**
 * Detect changed, new, and deleted files based on mtimes.
 */
function detectFileChanges(
	currentFiles: string[],
	currentMtimes: Record<string, number>,
	oldMtimes: Record<string, number> | undefined
): {
		newFiles: Set<string>;
		changedFiles: Set<string>;
		deletedFiles: Set<string>;
		unchangedFiles: Set<string>;
	} {
	const newFiles = new Set<string>();
	const changedFiles = new Set<string>();
	const deletedFiles = new Set<string>();
	const unchangedFiles = new Set<string>();

	if (!oldMtimes || Object.keys(oldMtimes).length === 0) {
		// No previous index, treat all as new
		currentFiles.forEach((f) => newFiles.add(f));
		return { newFiles, changedFiles, deletedFiles, unchangedFiles };
	}

	// Check current files
	for (const file of currentFiles) {
		const relativePath = relative(process.cwd(), file);
		const normalizedPath = file.replace(/\\/g, "/");
		const mtime = currentMtimes[normalizedPath] || currentMtimes[relativePath];

		if (!(normalizedPath in oldMtimes) && !(relativePath in oldMtimes)) {
			newFiles.add(file);
		} else if (mtime && mtime > (oldMtimes[normalizedPath] || oldMtimes[relativePath] || 0)) {
			changedFiles.add(file);
		} else {
			unchangedFiles.add(file);
		}
	}

	// Check for deleted files
	for (const oldPath of Object.keys(oldMtimes)) {
		const found = currentFiles.some(
			(f) => f.replace(/\\/g, "/") === oldPath || relative(process.cwd(), f) === oldPath
		);
		if (!found) {
			deletedFiles.add(oldPath);
		}
	}

	return { newFiles, changedFiles, deletedFiles, unchangedFiles };
}

async function saveIndex(
	embeddings: CodeEmbedding[],
	cwd: string
): Promise<string> {
	const indexDir = getIndexDir(cwd);
	const indexPath = getIndexPath(cwd);

	// Ensure directory exists
	if (!existsSync(indexDir)) {
		mkdirSync(indexDir, { recursive: true });
	}

	// Write embeddings as JSONL
	const lines = embeddings.map((e) => JSON.stringify(e));
	writeFileSync(indexPath, lines.join("\n") + "\n", "utf-8");

	return indexPath;
}

async function saveMetadata(
	metadata: SemanticIndexMetadata,
	cwd: string
): Promise<void> {
	const metaPath = getMetaPath(cwd);
	writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * 意味的索引を作成（差分更新対応）
 * @summary 意味的索引作成
 * @param input 入力データ
 * @param cwd 作業ディレクトリパス
 * @returns 索引作成結果
 */
export async function semanticIndex(
	input: SemanticIndexInput,
	cwd: string
): Promise<SemanticIndexOutput> {
	const {
		path: targetPath = cwd,
		force = false,
		chunkSize = DEFAULT_CHUNK_SIZE,
		chunkOverlap = DEFAULT_CHUNK_OVERLAP,
		extensions = DEFAULT_EXTENSIONS,
	} = input;

	try {
		// Import embeddings module
		const {
			generateEmbedding,
			generateEmbeddingsBatch,
			embeddingRegistry,
		} = await import("../../../lib/storage/embeddings/index.js");

		// Check provider availability
		const available = await embeddingRegistry.getAvailable();
		if (available.length === 0) {
			return {
				indexed: 0,
				files: 0,
				outputPath: "",
				error: "OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure ~/.pi/agent/auth.json",
			};
		}

		const selectedProvider = available[0];
		console.log(`[semantic-index] Using provider: ${selectedProvider.id}`);

		// Collect files
		const files = collectFiles(targetPath, extensions, [...DEFAULT_EXCLUDES]);
		console.log(`[semantic-index] Found ${files.length} files to index`);

		if (files.length === 0) {
			return {
				indexed: 0,
				files: 0,
				outputPath: getIndexPath(cwd),
				error: "No files found to index",
			};
		}

		// Track expected dimensions from the selected provider
		const expectedDimensions = selectedProvider.capabilities.dimensions;

		// Load existing index and metadata for incremental update (skip if force)
		const existingEmbeddings = force ? new Map<string, CodeEmbedding>() : loadExistingIndexAsMap(cwd);
		const existingMeta = force ? null : (existsSync(getMetaPath(cwd))
			? JSON.parse(readFileSync(getMetaPath(cwd), "utf-8")) as SemanticIndexMetadata
			: null);

		// Get current file mtimes
		const currentMtimes = getFileMtimes(files, cwd);

		// Detect changes (if force, treat all as new)
		const { newFiles, changedFiles, deletedFiles, unchangedFiles } = force
			? { newFiles: new Set<string>(files), changedFiles: new Set<string>(), deletedFiles: new Set<string>(), unchangedFiles: new Set<string>() }
			: detectFileChanges(files, currentMtimes, existingMeta?.fileMtimes);

		// If no changes and not forced, skip
		if (!force && newFiles.size === 0 && changedFiles.size === 0 && deletedFiles.size === 0) {
			console.log(`[semantic-index] No changes detected, skipping update`);
			return {
				indexed: existingMeta!.totalEmbeddings,
				files: files.length,
				outputPath: getIndexPath(cwd),
			};
		}

		console.log(
			`[semantic-index] Changes: ${newFiles.size} new, ${changedFiles.size} changed, ` +
			`${deletedFiles.size} deleted, ${unchangedFiles.size} unchanged`
		);

		// Remove embeddings for deleted files
		let removedChunks = 0;
		if (deletedFiles.size > 0) {
			for (const [id, emb] of existingEmbeddings) {
				const normalizedFile = emb.file.replace(/\\/g, "/");
				if (deletedFiles.has(normalizedFile) || deletedFiles.has(emb.file)) {
					existingEmbeddings.delete(id);
					removedChunks++;
				}
			}
			console.log(`[semantic-index] Removed ${removedChunks} chunks from deleted files`);
		}

		// Remove embeddings for changed files (will be regenerated)
		if (changedFiles.size > 0) {
			for (const [id, emb] of existingEmbeddings) {
				const normalizedFile = emb.file.replace(/\\/g, "/");
				if (changedFiles.has(normalizedFile) || changedFiles.has(emb.file)) {
					existingEmbeddings.delete(id);
				}
			}
		}

		// Files that need embedding generation
		const filesToProcess: string[] = [...newFiles, ...changedFiles];
		let newChunks = 0;
		let updatedChunks = 0;
		let apiCalls = 0;
		let processedChunks = 0;
		let skippedChunks = 0;

		// Process files with batch size limit for memory efficiency
		const BATCH_SIZE = 100;

		for (let batchStart = 0; batchStart < filesToProcess.length; batchStart += BATCH_SIZE) {
			const batchEnd = Math.min(batchStart + BATCH_SIZE, filesToProcess.length);
			const batchFiles = filesToProcess.slice(batchStart, batchEnd);

			for (let i = batchStart; i < batchEnd; i++) {
				const file = batchFiles[i - batchStart];
				const relativePath = relative(cwd, file);

				// Read file content
				let content: string;
				try {
					content = readFileSync(file, "utf-8");
				} catch {
					console.warn(`[semantic-index] Skipping unreadable file: ${relativePath}`);
					continue;
				}

				// Chunk the code
				const chunks = chunkCode(relativePath, content, chunkSize, chunkOverlap);

				// Collect chunks that need embedding (skip unchanged)
				const chunksToEmbed: { chunk: typeof chunks[0]; text: string }[] = [];
				for (const chunk of chunks) {
					if (!existingEmbeddings.has(chunk.id)) {
						chunksToEmbed.push({ chunk, text: buildChunkText(chunk) });
					}
				}

				// Batch embed chunks (100 at a time)
				const EMBED_BATCH_SIZE = 100;
				for (let j = 0; j < chunksToEmbed.length; j += EMBED_BATCH_SIZE) {
					const batch = chunksToEmbed.slice(j, j + EMBED_BATCH_SIZE);
					const texts = batch.map((item) => item.text);

					let embeddings: (number[] | null)[];
					try {
						embeddings = await generateEmbeddingsBatch(texts);
						apiCalls++;
					} catch {
						// Fallback: process individually
						embeddings = await Promise.all(
							texts.map(async (text) => {
								apiCalls++;
								return generateEmbedding(text);
							})
						);
					}

					// Process results
					for (let k = 0; k < batch.length; k++) {
						const { chunk } = batch[k];
						const embedding = embeddings[k];

						if (!embedding) continue;

						// Validate embedding dimensions to prevent mismatch
						if (embedding.length !== expectedDimensions) {
							console.warn(
								`[semantic-index] Skipping chunk with mismatched dimensions: ` +
								`expected ${expectedDimensions}, got ${embedding.length}`
							);
							skippedChunks++;
							continue;
						}

						existingEmbeddings.set(chunk.id, {
							id: chunk.id,
							file: chunk.file,
							line: chunk.line,
							code: chunk.code,
							embedding,
							metadata: {
								language: chunk.language,
								symbol: chunk.symbol,
								kind: chunk.kind,
								dimensions: embedding.length,
								model: selectedProvider.model,
							},
						});

						// Track if this is new or updated
						if (newFiles.has(file)) {
							newChunks++;
						} else {
							updatedChunks++;
						}
					}
				}

				processedChunks += chunksToEmbed.length;

				// Progress logging every 50 chunks
				if (processedChunks % 50 === 0) {
					console.log(`[semantic-index] Processed ${processedChunks} chunks (${apiCalls} API calls)...`);
				}
			}

			// Log batch completion
			if (filesToProcess.length > BATCH_SIZE) {
				console.log(
					`[semantic-index] Batch ${Math.floor(batchEnd / BATCH_SIZE)}/${Math.ceil(filesToProcess.length / BATCH_SIZE)} complete`
				);
			}
		}

		if (skippedChunks > 0) {
			console.warn(`[semantic-index] Skipped ${skippedChunks} chunks due to dimension mismatch`);
		}

		// Convert Map back to array for saving
		const finalEmbeddings = Array.from(existingEmbeddings.values());

		// Save index and metadata
		const outputPath = await saveIndex(finalEmbeddings, cwd);
		const now = Date.now();
		await saveMetadata(
			{
				createdAt: existingMeta?.createdAt || now,
				updatedAt: now,
				sourceDir: targetPath,
				totalEmbeddings: finalEmbeddings.length,
				totalFiles: files.length,
				model: selectedProvider.model,
				dimensions: expectedDimensions,
				version: 1,
				fileMtimes: currentMtimes,
			},
			cwd
		);

		console.log(
			`[semantic-index] Indexed ${finalEmbeddings.length} total chunks ` +
			`(${newChunks} new, ${updatedChunks} updated, ${removedChunks} removed, ${apiCalls} API calls)`
		);

		return {
			indexed: finalEmbeddings.length,
			files: files.length,
			outputPath,
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`[semantic-index] Error:`, errorMessage);
		return {
			indexed: 0,
			files: 0,
			outputPath: "",
			error: errorMessage,
		};
	}
}

// Helper paths (these need to be defined before used)
const _getIndexDir = (cwd: string): string => join(cwd, INDEX_DIR_NAME);
const _getIndexPath = (cwd: string): string => join(_getIndexDir(cwd), SEMANTIC_INDEX_FILE);
const _getMetaPath = (cwd: string): string => join(_getIndexDir(cwd), SEMANTIC_META_FILE);
