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

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { LocAgentGraph, LocAgentNode, LocAgentEntityEmbedding } from "./types.js";
import {
	readStrictJsonState,
	writeStrictJsonState,
} from "../../../lib/storage/sqlite-state-store-strict.js";

// ============================================================================
// Constants
// ============================================================================

function getLocAgentSemanticIndexKey(cwd: string): string {
	return `locagent_semantic_index:${cwd}`;
}

function getLocAgentSemanticMetaKey(cwd: string): string {
	return `locagent_semantic_meta:${cwd}`;
}

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
	const embeddings = new Map<string, LocAgentEntityEmbedding>();
	const embeddingList =
		readStrictJsonState<LocAgentEntityEmbedding[]>(getLocAgentSemanticIndexKey(cwd)) || [];
	for (const emb of embeddingList) {
		embeddings.set(emb.entityId, emb);
	}
	const metadata = readStrictJsonState<SemanticIndexMetadata>(getLocAgentSemanticMetaKey(cwd));
	return { embeddings, metadata };
}

function saveSemanticIndex(
	cwd: string,
	embeddings: Map<string, LocAgentEntityEmbedding>,
	metadata: SemanticIndexMetadata
): void {
	writeStrictJsonState(
		getLocAgentSemanticIndexKey(cwd),
		Array.from(embeddings.values())
	);
	writeStrictJsonState(getLocAgentSemanticMetaKey(cwd), metadata);
}

// ============================================================================
// Incremental Index Building
// ============================================================================

/**
 * セマンティックインデックスを差分更新
 * @summary セマンティックインデックス差分更新
 * @param graph - LocAgentグラフ
 * @param cwd - 作業ディレクトリ
 * @param getEmbedding - 埋め込み生成関数（単件）
 * @param getEmbeddingsBatch - 埋め込み生成関数（バッチ、オプション）
 * @returns 更新結果
 */
export async function updateLocAgentSemanticIndex(
	graph: LocAgentGraph,
	cwd: string,
	getEmbedding: (text: string) => Promise<number[]>,
	getEmbeddingsBatch?: (texts: string[]) => Promise<(number[] | null)[]>
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

	// エンティティの埋め込みを生成
	let apiCalls = 0;
	let newEntities = 0;
	let updatedEntities = 0;
	const BATCH_SIZE = 100;

	// 更新対象のエンティティを収集
	const nodesToUpdate: { entityId: string; node: LocAgentNode; text: string }[] = [];
	for (const entityId of entitiesToUpdate) {
		const node = graph.nodes.get(entityId);
		if (!node) continue;
		const text = extractEmbeddingText(node);
		if (text.trim()) {
			nodesToUpdate.push({ entityId, node, text });
		}
	}

	// バッチ処理が利用可能な場合はバッチ処理
	if (getEmbeddingsBatch && nodesToUpdate.length > 1) {
		for (let i = 0; i < nodesToUpdate.length; i += BATCH_SIZE) {
			const batch = nodesToUpdate.slice(i, i + BATCH_SIZE);
			const texts = batch.map((item) => item.text);

			try {
				const embeddings = await getEmbeddingsBatch(texts);
				apiCalls++;

				for (let j = 0; j < batch.length; j++) {
					const embedding = embeddings[j];
					if (!embedding) continue;

					const { entityId, node, text } = batch[j];
					const isNew = !embeddingsToKeep.has(entityId);
					const embData: LocAgentEntityEmbedding = {
						entityId: node.id,
						text: text.substring(0, 1000),
						embedding,
					};

					embeddingsToKeep.set(entityId, embData);

					if (isNew) {
						newEntities++;
					} else {
						updatedEntities++;
					}
				}
			} catch (error) {
				console.error(`Batch embedding failed at index ${i}:`, error);
				// フォールバック: 個別処理
				for (const { entityId, node, text } of batch) {
					try {
						const embedding = await getEmbedding(text);
						apiCalls++;
						if (!embedding) continue;

						const isNew = !embeddingsToKeep.has(entityId);
						const embData: LocAgentEntityEmbedding = {
							entityId: node.id,
							text: text.substring(0, 1000),
							embedding,
						};

						embeddingsToKeep.set(entityId, embData);

						if (isNew) {
							newEntities++;
						} else {
							updatedEntities++;
						}
					} catch (e) {
						console.error(`Failed to embed entity ${entityId}:`, e);
					}
				}
			}
		}
	} else {
		// 個別処理（フォールバック）
		for (const { entityId, node, text } of nodesToUpdate) {
			try {
				const embedding = await getEmbedding(text);
				apiCalls++;

				const isNew = !embeddingsToKeep.has(entityId);
				const embData: LocAgentEntityEmbedding = {
					entityId: node.id,
					text: text.substring(0, 1000),
					embedding,
				};

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
	}

	// メタデータを更新
	const newMetadata: SemanticIndexMetadata = {
		indexedAt: Date.now(),
		entityCount: embeddingsToKeep.size,
		model: "text-embedding-3-small",
		fileMtimes: currentFileMtimes,
	};

	saveSemanticIndex(cwd, embeddingsToKeep, newMetadata);

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
 * バッチ処理+ストリーミング書き込みでメモリ効率化
 * @summary セマンティックインデックス構築
 * @param graph - LocAgentグラフ
 * @param cwd - 作業ディレクトリ
 * @param getEmbedding - 埋め込み生成関数（単件）
 * @param getEmbeddingsBatch - 埋め込み生成関数（バッチ、オプション）
 * @returns 構築結果
 */
export async function buildLocAgentSemanticIndex(
	graph: LocAgentGraph,
	cwd: string,
	getEmbedding: (text: string) => Promise<number[]>,
	getEmbeddingsBatch?: (texts: string[]) => Promise<(number[] | null)[]>
): Promise<{
	success: boolean;
	error?: string;
	entityCount: number;
	indexedAt: number;
	apiCalls: number;
}> {
	const BATCH_SIZE = 100; // OpenAI推奨バッチサイズ

	try {
		let entityCount = 0;
		const fileMtimes: Record<string, number> = {};
		let apiCalls = 0;
		const newEmbeddings = new Map<string, LocAgentEntityEmbedding>();

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

		// エンティティを収集
		const nodesToEmbed: { node: LocAgentNode; text: string }[] = [];
		for (const node of graph.nodes.values()) {
			if (node.nodeType === "directory") continue;
			const text = extractEmbeddingText(node);
			if (text.trim()) {
				nodesToEmbed.push({ node, text });
			}
		}

		// バッチ処理が利用可能な場合はバッチ処理
		if (getEmbeddingsBatch && nodesToEmbed.length > 1) {
			for (let i = 0; i < nodesToEmbed.length; i += BATCH_SIZE) {
				const batch = nodesToEmbed.slice(i, i + BATCH_SIZE);
				const texts = batch.map((item) => item.text);

				try {
					const embeddings = await getEmbeddingsBatch(texts);
					apiCalls++;

					// 結果を都度書き込み
					for (let j = 0; j < batch.length; j++) {
						const embedding = embeddings[j];
						if (embedding) {
							newEmbeddings.set(batch[j].node.id, {
								entityId: batch[j].node.id,
								text: batch[j].text.substring(0, 1000),
								embedding,
							});
							entityCount++;
						}
					}
				} catch (error) {
					console.error(`Batch embedding failed at index ${i}:`, error);
					// フォールバック: 個別処理
					for (const item of batch) {
						try {
							const embedding = await getEmbedding(item.text);
							apiCalls++;
							if (embedding) {
								newEmbeddings.set(item.node.id, {
									entityId: item.node.id,
									text: item.text.substring(0, 1000),
									embedding,
								});
								entityCount++;
							}
						} catch (e) {
							console.error(`Failed to embed entity ${item.node.id}:`, e);
						}
					}
				}
			}
		} else {
			// 個別処理（フォールバック）
			for (const { node, text } of nodesToEmbed) {
				try {
					const embedding = await getEmbedding(text);
					apiCalls++;

					newEmbeddings.set(node.id, {
						entityId: node.id,
						text: text.substring(0, 1000),
						embedding,
					});

					entityCount++;
				} catch (error) {
					console.error(`Failed to embed entity ${node.id}:`, error);
				}
			}
		}

		// メタデータを作成して保存
		const metadata: SemanticIndexMetadata = {
			indexedAt: Date.now(),
			entityCount,
			model: "text-embedding-3-small",
			fileMtimes,
		};

		saveSemanticIndex(cwd, newEmbeddings, metadata);

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
	const { embeddings: embeddingMap } = loadSemanticIndex(cwd);
	const embeddings = Array.from(embeddingMap.values());
	if (embeddings.length === 0) return [];

	try {
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
	const { embeddings } = loadSemanticIndex(cwd);
	return embeddings.size > 0;
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
	const { metadata } = loadSemanticIndex(cwd);
	if (!metadata) {
		return { exists: false };
	}
	return {
		exists: true,
		entityCount: metadata.entityCount,
		indexedAt: metadata.indexedAt,
		model: metadata.model,
	};
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
