/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/storage.ts
 * role: LocAgentグラフの保存・読み込み
 * why: 異種グラフの永続化とキャッシュ管理
 * related: .pi/extensions/search/locagent/builder.ts, .pi/extensions/search/locagent/types.ts
 * public_api: saveLocAgentGraph, loadLocAgentGraph, isLocAgentGraphStale, getLocAgentGraphPath
 * invariants:
 * - グラフは.pi/search/locagent/に保存
 * - 古いインデックスは自動的に再構築
 * side_effects:
 * - ファイルシステムへの書き込み
 * - ディレクトリ作成
 * failure_modes:
 * - ディスク容量不足
 * - 権限エラー
 * @abdd.explain
 * overview: LocAgentグラフの永続化モジュール
 * what_it_does:
 *   - グラフをJSON形式で保存
 *   - 保存されたグラフを読み込み
 *   - インデックスの鮮度をチェック
 *   - インデックスパスを管理
 * why_it_exists:
 *   - インデックス構築のオーバーヘッドを回避
 *   - 高速なグラフ読み込みを実現
 * scope:
 *   in: LocAgentGraph, 作業ディレクトリ
 *   out: 保存されたグラフファイル
 */

import { readFile, writeFile, mkdir, stat } from "fs/promises";
import { join } from "path";
import type { LocAgentGraph, LocAgentNode, LocAgentMetadata } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * インデックスの保存ディレクトリ
 */
const INDEX_DIR = ".pi/search/locagent";

/**
 * インデックスファイル名
 */
const INDEX_FILE = "index.json";

/**
 * インデックスの有効期限（ミリ秒）
 * 24時間 = 86400000ms
 */
const INDEX_TTL = 86400000;

// ============================================================================
// Path Helpers
// ============================================================================

/**
 * インデックスディレクトリのパスを取得
 * @summary インデックスディレクトリパス取得
 * @param cwd - 作業ディレクトリ
 * @returns インデックスディレクトリの絶対パス
 */
export function getLocAgentIndexPath(cwd: string): string {
	return join(cwd, INDEX_DIR);
}

/**
 * インデックスファイルのパスを取得
 * @summary インデックスファイルパス取得
 * @param cwd - 作業ディレクトリ
 * @returns インデックスファイルの絶対パス
 */
export function getLocAgentGraphPath(cwd: string): string {
	return join(cwd, INDEX_DIR, INDEX_FILE);
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * グラフをシリアライズ可能な形式に変換
 * @summary グラフシリアライズ
 * @param graph - LocAgentグラフ
 * @returns JSONシリアライズ可能なオブジェクト
 */
function serializeGraph(graph: LocAgentGraph): object {
	return {
		nodes: Array.from(graph.nodes.entries()),
		edges: graph.edges,
		metadata: graph.metadata,
	};
}

/**
 * シリアライズされたデータからグラフを復元
 * @summary グラフデシリアライズ
 * @param data - シリアライズされたデータ
 * @returns LocAgentグラフ
 */
function deserializeGraph(data: {
	nodes: Array<[string, LocAgentNode]>;
	edges: LocAgentGraph["edges"];
	metadata: LocAgentMetadata;
}): LocAgentGraph {
	return {
		nodes: new Map(data.nodes),
		edges: data.edges,
		metadata: data.metadata,
	};
}

// ============================================================================
// Save/Load Functions
// ============================================================================

/**
 * グラフを保存
 * @summary グラフ保存
 * @param graph - 保存するグラフ
 * @param cwd - 作業ディレクトリ
 * @returns 保存成功時はtrue
 */
export async function saveLocAgentGraph(
	graph: LocAgentGraph,
	cwd: string
): Promise<boolean> {
	const indexPath = getLocAgentIndexPath(cwd);
	const graphPath = getLocAgentGraphPath(cwd);

	try {
		// ディレクトリを作成
		await mkdir(indexPath, { recursive: true });

		// グラフをシリアライズ
		const serialized = serializeGraph(graph);
		const json = JSON.stringify(serialized, null, 2);

		// ファイルに保存
		await writeFile(graphPath, json, "utf-8");

		return true;
	} catch (error: unknown) {
		console.error("Failed to save LocAgent graph:", error);
		return false;
	}
}

/**
 * グラフを読み込み
 * @summary グラフ読み込み
 * @param cwd - 作業ディレクトリ
 * @returns グラフ（存在しない場合はnull）
 */
export async function loadLocAgentGraph(
	cwd: string
): Promise<LocAgentGraph | null> {
	const graphPath = getLocAgentGraphPath(cwd);

	try {
		const json = await readFile(graphPath, "utf-8");
		const data = JSON.parse(json);
		return deserializeGraph(data);
	} catch {
		return null;
	}
}

// ============================================================================
// Staleness Detection
// ============================================================================

/**
 * インデックスが古いかどうかをチェック
 * @summary インデックス鮮度チェック
 * @param cwd - 作業ディレクトリ
 * @param sourcePath - ソースコードのパス
 * @returns 古い場合はtrue
 */
export async function isLocAgentGraphStale(
	cwd: string,
	sourcePath: string
): Promise<boolean> {
	const graphPath = getLocAgentGraphPath(cwd);

	try {
		// インデックスファイルのstatsを取得
		const indexStats = await stat(graphPath);
		const indexTime = indexStats.mtimeMs;

		// TTLチェック
		if (Date.now() - indexTime > INDEX_TTL) {
			return true;
		}

		// ソースディレクトリのstatsを取得
		const sourceStats = await stat(join(cwd, sourcePath));
		const sourceTime = sourceStats.mtimeMs;

		// ソースがインデックスより新しい場合は古いと判定
		return sourceTime > indexTime;
	} catch {
		// ファイルが存在しない場合は古いと判定
		return true;
	}
}

// ============================================================================
// Index Statistics
// ============================================================================

/**
 * インデックスの統計情報を取得
 * @summary インデックス統計取得
 * @param graph - LocAgentグラフ
 * @returns 統計情報
 */
export function getLocAgentGraphStats(graph: LocAgentGraph): {
	totalNodes: number;
	totalEdges: number;
	nodeTypeCounts: Record<string, number>;
	edgeTypeCounts: Record<string, number>;
	fileCount: number;
} {
	const nodeTypeCounts: Record<string, number> = {};
	const edgeTypeCounts: Record<string, number> = {};

	for (const node of graph.nodes.values()) {
		nodeTypeCounts[node.nodeType] = (nodeTypeCounts[node.nodeType] || 0) + 1;
	}

	for (const edge of graph.edges) {
		edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
	}

	return {
		totalNodes: graph.nodes.size,
		totalEdges: graph.edges.length,
		nodeTypeCounts,
		edgeTypeCounts,
		fileCount: graph.metadata.fileCount,
	};
}
