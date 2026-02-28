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
 * Split code into chunks for embedding.
 * Uses simple line-based chunking with overlap.
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

	let currentLine = 0;
	let chunkIndex = 0;

	while (currentLine < lines.length) {
		// Collect lines until we reach chunk size
		const startLine = currentLine;
		const chunkLines: string[] = [];
		let charCount = 0;

		while (currentLine < lines.length && charCount < chunkSize) {
			const line = lines[currentLine];
			chunkLines.push(line);
			charCount += line.length + 1; // +1 for newline
			currentLine++;
		}

		if (chunkLines.length === 0) break;

		const code = chunkLines.join("\n");
		const chunkId = createHash("md5")
			.update(`${relativePath}:${startLine}:${chunkIndex}`)
			.digest("hex")
			.slice(0, 12);

		// Simple symbol detection (could be enhanced with tree-sitter)
		const symbolMatch = code.match(
			/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/m
		);

		chunks.push({
			id: chunkId,
			file: relativePath,
			line: startLine + 1, // 1-indexed
			code,
			language,
			symbol: symbolMatch?.[1],
			kind: symbolMatch ? "chunk" : undefined,
		});

		chunkIndex++;

		// Apply overlap by stepping back
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
 * 意味的索引を作成
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
		// Check for existing index
		if (!force && existsSync(getIndexPath(cwd))) {
			const existingMeta = existsSync(getMetaPath(cwd))
				? JSON.parse(readFileSync(getMetaPath(cwd), "utf-8"))
				: null;

			if (existingMeta) {
				return {
					indexed: existingMeta.totalEmbeddings,
					files: existingMeta.totalFiles,
					outputPath: getIndexPath(cwd),
				};
			}
		}

		// Import embeddings module
		const {
			generateEmbedding,
			embeddingRegistry,
		} = await import("../../../lib/embeddings/index.js");

		// Check provider availability
		const available = await embeddingRegistry.getAvailable();
		if (available.length === 0) {
			return {
				indexed: 0,
				files: 0,
				outputPath: "",
				error: "No embedding provider available. Configure OpenAI API key.",
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

		// Process files with batch size limit for memory efficiency
		const BATCH_SIZE = 100; // Process files in batches to limit memory usage
		const embeddings: CodeEmbedding[] = [];
		let processedChunks = 0;
		let skippedChunks = 0;

		for (let batchStart = 0; batchStart < files.length; batchStart += BATCH_SIZE) {
			const batchEnd = Math.min(batchStart + BATCH_SIZE, files.length);
			const batchFiles = files.slice(batchStart, batchEnd);

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

				// Generate embeddings for each chunk
				for (const chunk of chunks) {
					const text = buildChunkText(chunk);
					const embedding = await generateEmbedding(text);

					if (embedding) {
						// Validate embedding dimensions to prevent mismatch
						if (embedding.length !== expectedDimensions) {
							console.warn(
								`[semantic-index] Skipping chunk with mismatched dimensions: ` +
								`expected ${expectedDimensions}, got ${embedding.length}`
							);
							skippedChunks++;
							continue;
						}

						embeddings.push({
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
					}

					processedChunks++;

					// Progress logging every 50 chunks
					if (processedChunks % 50 === 0) {
						console.log(`[semantic-index] Processed ${processedChunks} chunks...`);
					}
				}
			}

			// Log batch completion
			console.log(`[semantic-index] Batch ${Math.floor(batchEnd / BATCH_SIZE)}/${Math.ceil(files.length / BATCH_SIZE)} complete`);
		}

		if (skippedChunks > 0) {
			console.warn(`[semantic-index] Skipped ${skippedChunks} chunks due to dimension mismatch`);
		}

		// Save index and metadata
		const outputPath = await saveIndex(embeddings, cwd);
		await saveMetadata(
			{
				createdAt: Date.now(),
				updatedAt: Date.now(),
				sourceDir: targetPath,
				totalEmbeddings: embeddings.length,
				totalFiles: files.length,
				model: available[0].model,
				dimensions: available[0].capabilities.dimensions,
				version: 1,
			},
			cwd
		);

		console.log(`[semantic-index] Indexed ${embeddings.length} chunks from ${files.length} files`);

		return {
			indexed: embeddings.length,
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
