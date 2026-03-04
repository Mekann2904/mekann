/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/semantic.ts
 * role: LocAgentエンティティのセマンティック検索インデックス（差分更新対応）
 * why: OpenAI埋め込みを使用してエンティティの意味的検索を可能にする
 * related: .pi/extensions/search/locagent/types.ts, .pi/lib/storage/embeddings/index.ts
 * public_api: buildLocAgentSemanticIndex, updateLocAgentSemanticIndex, searchLocAgentEntities
 * invariants:
 * - インデックスは.pi/search/locagent/semantic-index.jsonlに保存
 * - 埋め込みはOpenAI text-embedding-3-smallモデルを使用
 * - 差分更新でコストを最小化
 * side_effects:
 * - OpenAI API呼び出し（コスト発生）
 * - ファイルシステムへの書き込み
 * failure_modes:
 * - OpenAI APIエラー
 * - ディスク容量不足
 * @abdd.explain
 * overview: LocAgentエンティティのセマンティック検索インデックス（差分更新対応）
 * what_it_does:
 *   - LocAgentグラフからエンティティを抽出
 *   - エンティティのテキスト（名前+シグネチャ+docstring+コード）を埋め込み
 *   - 埋め込みベクトルをインデックスファイルに保存
 *   - 差分更新でコストを最小化
 * why_it_exists:
 *   - キーワード検索だけでなく意味的検索を可能にするため
 *   - 自然言語クエリで関連コードを見つけるため
 *   - 差分更新でAPIコストを削減するため
 * scope:
 *   in: LocAgentGraph, 既存インデックス（差分更新時）
 *   out: セマンティック検索インデックス
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LocAgentGraph, LocAgentNode, LocAgentEntityEmbedding } from "./types.js";
import { getLocAgentIndexPath } from "./storage.js";

// ============================================================================
// Constants
// ============================================================================

const SEMANTIC_INDEX_FILE = "semantic-index.jsonl";
const SEMANTIC_META_FILE = "semantic-meta.json";

// ============================================================================
// Types
// ============================================================================

/**
 * セマンティックインデックスのメタデータ
 */
interface SemanticIndexMetadata {
	indexedAt: number;
	entityCount: number;
	model: string;
	/** ファイルごとのmtime（差分更新用） */
	fileMtimes: Record<string, number>;
}

/**
 * 差分更新の結果
 */
interface IncrementalUpdateResult {
	success: boolean;
	error?: string;
	totalEntities: number;
	newEntities: number;
	updatedEntities: number;
	removedEntities: number;
	apiCalls: number;
}

// ============================================================================
// Text Extraction
// ============================================================================

/**
 * エンティティから埋め込み用テキストを抽出
 * @summary 埋め込みテキスト抽出
 * @param node - エンティティノード
 * @returns 埋め込み対象テキスト
 */
function extractEmbeddingText(node: LocAgentNode): string {
	const parts: string[] = [];

	// 名前
	parts.push(node.name);

	// シグネチャ
	if (node.signature) {
		parts.push(node.signature);
	}

	// Docstring
	if (node.docstring) {
		parts.push(node.docstring);
	}

	// コード（短縮版）
	if (node.code) {
		// 最初の500文字のみ
		parts.push(node.code.substring(0, 500));
	}

	// スコープ情報
	if (node.scope) {
		parts.push(`in ${node.scope}`);
	}

	// ファイルパス
	if (node.filePath) {
		parts.push(`file: ${node.filePath}`);
	}

	return parts.join("\n");
}

// ============================================================================
// Index Loading/Saving
// ============================================================================

/**
 * 既存のセマンティックインデックスを読み込み
 * @summary インデックス読み込み
 * @param cwd - 作業ディレクトリ
 * @returns インデックスとメタデータ
 */
function loadSemanticIndex(cwd: string): {
	embeddings: Map<string, LocAgentEntityEmbedding>;
	metadata: SemanticIndexMetadata | null;
} {
	const indexPath = getLocAgentIndexPath(cwd);
	const indexFilePath = join(indexPath, SEMANTIC_INDEX_FILE);
	const metaFilePath = join(indexPath, SEMANTIC_META_FILE);

	const embeddings = new Map<string, LocAgentEntityEmbedding>();
	let metadata: SemanticIndexMetadata | null = null;

	// インデックスを読み込み
	if (existsSync(indexFilePath)) {
		try {
			const content = readFileSync(indexFilePath, "utf-8");
			const lines = content.trim().split("\n");
			for (const line of lines) {
				if (!line.trim()) continue;
				const emb = JSON.parse(line) as LocAgentEntityEmbedding;
				embeddings.set(emb.entityId, emb);
			}
		} catch {
			// 読み込みエラーは無視
		}
	}

	// メタデータを読み込み
	if (existsSync(metaFilePath)) {
		try {
			const content = readFileSync(metaFilePath, "utf-8");
			metadata = JSON.parse(content) as SemanticIndexMetadata;
		} catch {
			// 読み込みエラーは無視
		}
	}

	return { embeddings, metadata };
}

/**
 * エンベッディングをストリーミング書き込み（1件ずつ追記）
 * @summary エンベッディング追記
 * @param embedding - エンベッディングデータ
 * @param cwd - 作業ディレクトリ
 */
function appendEmbedding(embedding: LocAgentEntityEmbedding, cwd: string): void {
	const indexPath = getLocAgentIndexPath(cwd);
	if (!existsSync(indexPath)) {
		mkdirSync(indexPath, { recursive: true });
	}
	const indexFilePath = join(indexPath, SEMANTIC_INDEX_FILE);
	appendFileSync(indexFilePath, JSON.stringify(embedding) + "\n", "utf-8");
}

/**
 * メタデータを保存
 * @summary メタデータ保存
 * @param metadata - メタデータ
 * @param cwd - 作業ディレクトリ
 */
function saveMetadata(metadata: SemanticIndexMetadata, cwd: string): void {
	const indexPath = getLocAgentIndexPath(cwd);
	if (!existsSync(indexPath)) {
		mkdirSync(indexPath, { recursive: true });
	}
	const metaFilePath = join(indexPath, SEMANTIC_META_FILE);
	appendFileSync(metaFilePath, JSON.stringify(metadata, null, 2), "utf-8");
}

/**
 * インデックスファイルを初期化
 * @summary インデックス初期化
 * @param cwd - 作業ディレクトリ
 */
function initIndexFile(cwd: string): void {
	const indexPath = getLocAgentIndexPath(cwd);
	if (!existsSync(indexPath)) {
		mkdirSync(indexPath, { recursive: true });
	}
	const indexFilePath = join(indexPath, SEMANTIC_INDEX_FILE);
	if (existsSync(indexFilePath)) {
		unlinkSync(indexFilePath);
	}
}

// ============================================================================
// Incremental Index Building
// ============================================================================

/**
 * セマンティックインデックスを差分更新
 * @summary セマンティックインデックス差分更新
 * @param graph - LocAgentグラフ
 * @param cwd - 作業ディレクトリ
 * @param getEmbedding - 埋め込み生成関数
 * @returns 更新結果
 */
export async function updateLocAgentSemanticIndex(
	graph: LocAgentGraph,
	cwd: string,
	getEmbedding: (text: string) => Promise<number[]>
): Promise<IncrementalUpdateResult> {
	// 既存インデックスを読み込み
	const { embeddings, metadata } = loadSemanticIndex(cwd);

	// ファイルごとのmtimeを取得
	const currentFileMtimes: Record<string, number> = {};
	const filesWithEntities = new Set<string>();

	for (const node of graph.nodes.values()) {
		if (node.filePath) {
			filesWithEntities.add(node.filePath);
		}
	}

	for (const file of filesWithEntities) {
		try {
			const fullPath = join(cwd, file);
			if (existsSync(fullPath)) {
				currentFileMtimes[file] = statSync(fullPath).mtimeMs;
			}
		} catch {
			// ファイルアクセスエラーは無視
		}
	}

	// 変更のあったファイルを特定
	const oldMtimes = metadata?.fileMtimes || {};
	const changedFiles = new Set<string>();
	const newFiles = new Set<string>();

	for (const [file, mtime] of Object.entries(currentFileMtimes)) {
		if (!(file in oldMtimes)) {
			newFiles.add(file);
		} else if (mtime > oldMtimes[file]) {
			changedFiles.add(file);
		}
	}

	// 削除されたファイルを特定
	const deletedFiles = new Set<string>();
	for (const file of Object.keys(oldMtimes)) {
		if (!(file in currentFileMtimes)) {
			deletedFiles.add(file);
		}
	}

	// 削除されたファイルのエンティティをインデックスから削除
	let removedEntities = 0;
	const embeddingsToKeep = new Map<string, LocAgentEntityEmbedding>();
	for (const [entityId, emb] of embeddings) {
		// entityIdからファイルパスを抽出（形式: path/to/file.ts:entityName）
		const filePath = entityId.substring(0, entityId.lastIndexOf(":"));
		if (deletedFiles.has(filePath)) {
			removedEntities++;
		} else {
			embeddingsToKeep.set(entityId, emb);
		}
	}

	// 新規・変更ファイルのエンティティを特定
	const entitiesToUpdate = new Set<string>();
	for (const node of graph.nodes.values()) {
		if (node.nodeType === "directory") continue;
		if (!node.filePath) continue;

		if (newFiles.has(node.filePath) || changedFiles.has(node.filePath)) {
			entitiesToUpdate.add(node.id);
		}
	}

	// インデックスファイルを初期化して、保持するエンベッディングを書き込み
	initIndexFile(cwd);
	for (const emb of embeddingsToKeep.values()) {
		appendEmbedding(emb, cwd);
	}

	// エンティティの埋め込みを生成（都度書き込み）
	let apiCalls = 0;
	let newEntities = 0;
	let updatedEntities = 0;

	for (const entityId of entitiesToUpdate) {
		const node = graph.nodes.get(entityId);
		if (!node) continue;

		const text = extractEmbeddingText(node);
		if (!text.trim()) continue;

		try {
			const embedding = await getEmbedding(text);
			apiCalls++;

			const isNew = !embeddingsToKeep.has(entityId);
			const embData: LocAgentEntityEmbedding = {
				entityId: node.id,
				text: text.substring(0, 1000),
				embedding,
			};

			// 都度書き込み
			appendEmbedding(embData, cwd);
			embeddingsToKeep.set(entityId, embData);

			if (isNew) {
				newEntities++;
			} else {
				updatedEntities++;
			}
		} catch (error) {
			console.error(`Failed to embed entity ${entityId}:`, error);
		}
	}

	// メタデータを更新
	const newMetadata: SemanticIndexMetadata = {
		indexedAt: Date.now(),
		entityCount: embeddingsToKeep.size,
		model: "text-embedding-3-small",
		fileMtimes: currentFileMtimes,
	};

	// メタデータを保存
	saveMetadata(newMetadata, cwd);

	return {
		success: true,
		totalEntities: embeddingsToKeep.size,
		newEntities,
		updatedEntities,
		removedEntities,
		apiCalls,
	};
}

// ============================================================================
// Full Index Building
// ============================================================================

/**
 * LocAgentエンティティのセマンティックインデックスを構築（フル構築）
 * ストリーミング書き込みでメモリ効率化
 * @summary セマンティックインデックス構築
 * @param graph - LocAgentグラフ
 * @param cwd - 作業ディレクトリ
 * @param getEmbedding - 埋め込み生成関数
 * @returns 構築結果
 */
export async function buildLocAgentSemanticIndex(
	graph: LocAgentGraph,
	cwd: string,
	getEmbedding: (text: string) => Promise<number[]>
): Promise<{
	success: boolean;
	error?: string;
	entityCount: number;
	indexedAt: number;
	apiCalls: number;
}> {
	const indexPath = getLocAgentIndexPath(cwd);

	try {
		// ディレクトリを作成
		if (!existsSync(indexPath)) {
			mkdirSync(indexPath, { recursive: true });
		}

		let entityCount = 0;
		const fileMtimes: Record<string, number> = {};
		let apiCalls = 0;

		// ファイルごとのmtimeを記録
		const filesWithEntities = new Set<string>();
		for (const node of graph.nodes.values()) {
			if (node.filePath) {
				filesWithEntities.add(node.filePath);
			}
		}

		for (const file of filesWithEntities) {
			try {
				const fullPath = join(cwd, file);
				if (existsSync(fullPath)) {
					fileMtimes[file] = statSync(fullPath).mtimeMs;
				}
			} catch {
				// ファイルアクセスエラーは無視
			}
		}

		// インデックスファイルを初期化
		initIndexFile(cwd);

		// エンティティごとに埋め込みを生成（都度書き込み）
		for (const node of graph.nodes.values()) {
			// directoryノードはスキップ
			if (node.nodeType === "directory") {
				continue;
			}

			const text = extractEmbeddingText(node);
			if (!text.trim()) {
				continue;
			}

			try {
				const embedding = await getEmbedding(text);
				apiCalls++;

				// 都度書き込み（メモリに蓄積しない）
				appendEmbedding({
					entityId: node.id,
					text: text.substring(0, 1000),
					embedding,
				}, cwd);

				entityCount++;
			} catch (error) {
				console.error(`Failed to embed entity ${node.id}:`, error);
			}
		}

		// メタデータを作成して保存
		const metadata: SemanticIndexMetadata = {
			indexedAt: Date.now(),
			entityCount,
			model: "text-embedding-3-small",
			fileMtimes,
		};

		saveMetadata(metadata, cwd);

		return {
			success: true,
			entityCount,
			indexedAt: metadata.indexedAt,
			apiCalls,
		};
	} catch (error: unknown) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			entityCount: 0,
			indexedAt: 0,
			apiCalls: 0,
		};
	}
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * セマンティック検索を実行
 * @summary セマンティック検索
 * @param query - 検索クエリ
 * @param graph - LocAgentグラフ
 * @param cwd - 作業ディレクトリ
 * @param getEmbedding - 埋め込み生成関数
 * @param options - 検索オプション
 * @returns 検索結果
 */
export async function searchLocAgentEntities(
	query: string,
	graph: LocAgentGraph,
	cwd: string,
	getEmbedding: (text: string) => Promise<number[]>,
	options: {
		nodeTypes?: string[];
		limit?: number;
		threshold?: number;
	} = {}
): Promise<Array<{
	entity: LocAgentNode;
	score: number;
}>> {
	const { nodeTypes, limit = 10, threshold = 0.5 } = options;
	const indexPath = getLocAgentIndexPath(cwd);
	const indexFilePath = join(indexPath, SEMANTIC_INDEX_FILE);

	if (!existsSync(indexFilePath)) {
		return [];
	}

	try {
		// インデックスを読み込み
		const content = readFileSync(indexFilePath, "utf-8");
		const lines = content.trim().split("\n");
		const embeddings: LocAgentEntityEmbedding[] = lines.map((line) => JSON.parse(line));

		// クエリの埋め込みを生成
		const queryEmbedding = await getEmbedding(query);

		// 類似度を計算
		const results: Array<{ entity: LocAgentNode; score: number }> = [];

		for (const emb of embeddings) {
			const node = graph.nodes.get(emb.entityId);
			if (!node) {
				continue;
			}

			// ノードタイプフィルタ
			if (nodeTypes && !nodeTypes.includes(node.nodeType)) {
				continue;
			}

			// コサイン類似度を計算
			const score = cosineSimilarity(queryEmbedding, emb.embedding || []);

			if (score >= threshold) {
				results.push({ entity: node, score });
			}
		}

		// スコア順にソート
		results.sort((a, b) => b.score - a.score);

		return results.slice(0, limit);
	} catch {
		return [];
	}
}

/**
 * セマンティックインデックスが存在するかチェック
 * @summary インデックス存在確認
 * @param cwd - 作業ディレクトリ
 * @returns 存在する場合はtrue
 */
export function hasSemanticIndex(cwd: string): boolean {
	const indexPath = getLocAgentIndexPath(cwd);
	const indexFilePath = join(indexPath, SEMANTIC_INDEX_FILE);
	return existsSync(indexFilePath);
}

/**
 * セマンティックインデックスの統計を取得
 * @summary インデックス統計取得
 * @param cwd - 作業ディレクトリ
 * @returns 統計情報
 */
export function getSemanticIndexStats(cwd: string): {
	exists: boolean;
	entityCount?: number;
	indexedAt?: number;
	model?: string;
} {
	const indexPath = getLocAgentIndexPath(cwd);
	const metaFilePath = join(indexPath, SEMANTIC_META_FILE);

	if (!existsSync(metaFilePath)) {
		return { exists: false };
	}

	try {
		const content = readFileSync(metaFilePath, "utf-8");
		const metadata = JSON.parse(content) as SemanticIndexMetadata;
		return {
			exists: true,
			entityCount: metadata.entityCount,
			indexedAt: metadata.indexedAt,
			model: metadata.model,
		};
	} catch {
		return { exists: false };
	}
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * コサイン類似度を計算
 * @summary コサイン類似度計算
 * @param a - ベクトルA
 * @param b - ベクトルB
 * @returns 類似度（-1〜1）
 */
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) {
		return 0;
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB);
	if (denominator === 0) {
		return 0;
	}

	return dotProduct / denominator;
}
