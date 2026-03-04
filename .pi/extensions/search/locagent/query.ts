/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/query.ts
 * role: LocAgentグラフのクエリ機能
 * why: 異種グラフ上の検索・探索・詳細取得を提供
 * related: .pi/extensions/search/locagent/types.ts, .pi/extensions/search/locagent/storage.ts
 * public_api: searchEntities, traverseGraph, retrieveEntity, findNodesByName, findNodesByType
 * invariants:
 * - 検索結果はスコア順にソート
 * - traverseGraphはBFSで探索
 * - 結果はlimitで制限可能
 * side_effects: なし
 * failure_modes:
 * - グラフが空の場合は空の結果を返す
 * - 無効なノードIDの場合はエラー
 * @abdd.explain
 * overview: LocAgentグラフのクエリモジュール
 * what_it_does:
 *   - キーワードベースのエンティティ検索
 *   - グラフ上のBFS探索
 *   - エンティティの詳細取得
 *   - ノードタイプ・名前でのフィルタリング
 * why_it_exists:
 *   - LocAgent論文の3つのツール（SearchEntity, TraverseGraph, RetrieveEntity）を実装
 *   - エージェントによる効率的なコード探索を支援
 * scope:
 *   in: LocAgentGraph, クエリパラメータ
 *   out: 検索結果、サブグラフ、エンティティ詳細
 */

import type {
	LocAgentGraph,
	LocAgentNode,
	LocAgentEdge,
	LocAgentNodeType,
	LocAgentEdgeType,
	TraverseDirection,
	DetailLevel,
	SearchEntityResult,
	TraverseGraphResult,
	RetrieveEntityResult,
} from "./types.js";

// ============================================================================
// Search Utilities
// ============================================================================

/**
 * ノードを名前で検索（部分一致）
 * @summary 名前検索
 * @param graph - LocAgentグラフ
 * @param name - 検索する名前（部分一致）
 * @returns マッチしたノードの配列
 */
export function findNodesByName(
	graph: LocAgentGraph,
	name: string
): LocAgentNode[] {
	const lowerName = name.toLowerCase();
	const results: LocAgentNode[] = [];

	for (const node of graph.nodes.values()) {
		if (node.name.toLowerCase().includes(lowerName)) {
			results.push(node);
		}
	}

	return results;
}

/**
 * ノードをタイプで検索
 * @summary タイプ検索
 * @param graph - LocAgentグラフ
 * @param nodeType - ノードタイプ
 * @returns マッチしたノードの配列
 */
export function findNodesByType(
	graph: LocAgentGraph,
	nodeType: LocAgentNodeType
): LocAgentNode[] {
	const results: LocAgentNode[] = [];

	for (const node of graph.nodes.values()) {
		if (node.nodeType === nodeType) {
			results.push(node);
		}
	}

	return results;
}

/**
 * ノードをIDで検索
 * @summary ID検索
 * @param graph - LocAgentグラフ
 * @param id - ノードID
 * @returns ノード（存在しない場合はnull）
 */
export function findNodeById(
	graph: LocAgentGraph,
	id: string
): LocAgentNode | null {
	return graph.nodes.get(id) || null;
}

// ============================================================================
// SearchEntity Tool
// ============================================================================

/**
 * キーワードベースのエンティティ検索
 * @summary エンティティ検索
 * @param graph - LocAgentグラフ
 * @param keywords - 検索キーワード配列
 * @param options - 検索オプション
 * @returns 検索結果
 * @description
 *   - キーワードをノード名、シグネチャ、docstringで検索
 *   - スコアはマッチしたキーワード数と完全一致ボーナスで計算
 *   - 結果はスコア順にソート
 */
export function searchEntities(
	graph: LocAgentGraph,
	keywords: string[],
	options: {
		nodeTypes?: LocAgentNodeType[];
		limit?: number;
		detailLevel?: DetailLevel;
	} = {}
): SearchEntityResult[] {
	const {
		nodeTypes,
		limit = 50,
		detailLevel = "preview",
	} = options;

	const results: SearchEntityResult[] = [];
	const lowerKeywords = keywords.map((k) => k.toLowerCase());

	for (const node of graph.nodes.values()) {
		// タイプフィルタ
		if (nodeTypes && !nodeTypes.includes(node.nodeType)) {
			continue;
		}

		// スコア計算
		let score = 0;
		const searchableText = [
			node.name,
			node.signature || "",
			node.docstring || "",
			node.code || "",
		].join(" ").toLowerCase();

		for (const keyword of lowerKeywords) {
			// 名前の完全一致
			if (node.name.toLowerCase() === keyword) {
				score += 10;
			}
			// 名前の部分一致
			else if (node.name.toLowerCase().includes(keyword)) {
				score += 5;
			}
			// その他のテキストでの一致
			else if (searchableText.includes(keyword)) {
				score += 1;
			}
		}

		if (score > 0) {
			results.push({
				entity: node,
				score,
				codeSnippet: getCodeSnippet(node, detailLevel),
			});
		}
	}

	// スコア順にソート
	results.sort((a, b) => b.score - a.score);

	// limitで制限
	return results.slice(0, limit);
}

/**
 * コードスニペットを取得
 * @summary コードスニペット取得
 * @param node - ノード
 * @param detailLevel - 詳細レベル
 * @returns コードスニペット
 */
function getCodeSnippet(node: LocAgentNode, detailLevel: DetailLevel): string {
	const code = node.code || node.signature || node.name;

	switch (detailLevel) {
		case "fold":
			// 折りたたみ（1行のみ）
			return code.split("\n")[0].substring(0, 100);
		case "preview":
			// プレビュー（最初の3行）
			return code.split("\n").slice(0, 3).join("\n").substring(0, 300);
		case "full":
			// 完全
			return code;
		default:
			return code.split("\n")[0].substring(0, 100);
	}
}

// ============================================================================
// TraverseGraph Tool
// ============================================================================

/**
 * グラフ上のBFS探索
 * @summary グラフ探索
 * @param graph - LocAgentグラフ
 * @param startNodeIds - 開始ノードIDの配列
 * @param options - 探索オプション
 * @returns 探索結果（サブグラフ）
 * @description
 *   - 指定した方向（upstream/downstream/both）でBFS探索
 *   - エッジタイプでフィルタリング可能
 *   - ノードタイプでフィルタリング可能
 *   - 結果はツリー形式の文字列で返す
 */
export function traverseGraph(
	graph: LocAgentGraph,
	startNodeIds: string[],
	options: {
		direction?: TraverseDirection;
		hops?: number;
		nodeTypes?: LocAgentNodeType[];
		edgeTypes?: LocAgentEdgeType[];
		limit?: number;
	} = {}
): TraverseGraphResult {
	const {
		direction = "downstream",
		hops = 2,
		nodeTypes,
		edgeTypes,
		limit = 100,
	} = options;

	const visitedNodes = new Set<string>();
	const visitedEdges = new Set<string>();
	const resultNodes: LocAgentNode[] = [];
	const resultEdges: LocAgentEdge[] = [];

	// BFSキューの初期化（開始ノードを事前にvisitedに追加）
	const queue: Array<{ nodeId: string; depth: number }> = [];
	for (const id of startNodeIds) {
		if (graph.nodes.has(id) && !visitedNodes.has(id)) {
			visitedNodes.add(id);
			queue.push({ nodeId: id, depth: 0 });
		}
	}

	while (queue.length > 0 && resultNodes.length < limit) {
		const { nodeId, depth } = queue.shift()!;

		const node = graph.nodes.get(nodeId)!;

		// ノードタイプフィルタ
		if (nodeTypes && !nodeTypes.includes(node.nodeType)) {
			continue;
		}

		resultNodes.push(node);

		// 最大深さに達したら探索終了
		if (depth >= hops) {
			continue;
		}

		// エッジを探索
		for (const edge of graph.edges) {
			let targetNodeId: string | null = null;

			// 方向に基づいてエッジを選択
			if (direction === "downstream" && edge.source === nodeId) {
				targetNodeId = edge.target;
			} else if (direction === "upstream" && edge.target === nodeId) {
				targetNodeId = edge.source;
			} else if (direction === "both") {
				if (edge.source === nodeId) {
					targetNodeId = edge.target;
				} else if (edge.target === nodeId) {
					targetNodeId = edge.source;
				}
			}

			if (targetNodeId === null) {
				continue;
			}

			// エッジタイプフィルタ
			if (edgeTypes && !edgeTypes.includes(edge.type)) {
				continue;
			}

			// エッジを記録
			const edgeKey = `${edge.source}->${edge.target}:${edge.type}`;
			if (!visitedEdges.has(edgeKey)) {
				visitedEdges.add(edgeKey);
				resultEdges.push(edge);
			}

			// 次のノードをキューに追加
			if (!visitedNodes.has(targetNodeId)) {
				queue.push({ nodeId: targetNodeId, depth: depth + 1 });
			}
		}
	}

	// ツリー形式の文字列を生成
	const format = formatSubgraphAsTree(resultNodes, resultEdges, startNodeIds);

	return {
		nodes: resultNodes,
		edges: resultEdges,
		format,
	};
}

/**
 * サブグラフをツリー形式でフォーマット
 * @summary サブグラフツリーフォーマット
 * @param nodes - ノード配列
 * @param edges - エッジ配列
 * @param startNodeIds - 開始ノードID
 * @returns ツリー形式の文字列
 */
function formatSubgraphAsTree(
	nodes: LocAgentNode[],
	edges: LocAgentEdge[],
	startNodeIds: string[]
): string {
	const lines: string[] = [];
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

	// ノードタイプのアイコン
	const typeIcons: Record<LocAgentNodeType, string> = {
		directory: "📁",
		file: "📄",
		class: "🏗️",
		function: "⚡",
	};

	// エッジタイプのラベル
	const edgeLabels: Record<LocAgentEdgeType, string> = {
		contain: "contains",
		import: "imports",
		invoke: "calls",
		inherit: "extends",
	};

	// 開始ノードごとにツリーを構築
	const visited = new Set<string>();

	function buildTree(nodeId: string, indent: string = ""): void {
		if (visited.has(nodeId)) {
			return;
		}
		visited.add(nodeId);

		const node = nodeMap.get(nodeId);
		if (!node) {
			return;
		}

		const icon = typeIcons[node.nodeType];
		lines.push(`${indent}${icon} ${node.name} (${node.nodeType})`);

		// 子ノードを取得
		const childEdges = edges.filter((e) => e.source === nodeId);
		for (const edge of childEdges) {
			const childNode = nodeMap.get(edge.target);
			if (childNode) {
				lines.push(
					`${indent}  └─[${edgeLabels[edge.type]}]─> ${childNode.name}`
				);
				buildTree(edge.target, indent + "    ");
			}
		}
	}

	for (const startId of startNodeIds) {
		if (nodeMap.has(startId)) {
			buildTree(startId);
			lines.push("");
		}
	}

	return lines.join("\n");
}

// ============================================================================
// RetrieveEntity Tool
// ============================================================================

/**
 * エンティティの詳細を取得
 * @summary エンティティ詳細取得
 * @param graph - LocAgentグラフ
 * @param entityIds - エンティティIDの配列
 * @returns エンティティ詳細の配列
 */
export function retrieveEntity(
	graph: LocAgentGraph,
	entityIds: string[]
): RetrieveEntityResult[] {
	const results: RetrieveEntityResult[] = [];

	for (const id of entityIds) {
		const node = graph.nodes.get(id);
		if (node) {
			results.push({
				entity: node,
				fullCode: node.code || node.signature || "",
			});
		}
	}

	return results;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * ノードの関連エッジを取得
 * @summary 関連エッジ取得
 * @param graph - LocAgentグラフ
 * @param nodeId - ノードID
 * @returns 関連エッジの配列
 */
export function getRelatedEdges(
	graph: LocAgentGraph,
	nodeId: string
): { incoming: LocAgentEdge[]; outgoing: LocAgentEdge[] } {
	const incoming: LocAgentEdge[] = [];
	const outgoing: LocAgentEdge[] = [];

	for (const edge of graph.edges) {
		if (edge.source === nodeId) {
			outgoing.push(edge);
		}
		if (edge.target === nodeId) {
			incoming.push(edge);
		}
	}

	return { incoming, outgoing };
}

/**
 * ノードの隣接ノードを取得
 * @summary 隣接ノード取得
 * @param graph - LocAgentグラフ
 * @param nodeId - ノードID
 * @param edgeTypes - フィルタするエッジタイプ（オプション）
 * @returns 隣接ノードの配列
 */
export function getNeighborNodes(
	graph: LocAgentGraph,
	nodeId: string,
	edgeTypes?: LocAgentEdgeType[]
): LocAgentNode[] {
	const neighbors: LocAgentNode[] = [];
	const neighborIds = new Set<string>();

	for (const edge of graph.edges) {
		// エッジタイプフィルタ
		if (edgeTypes && !edgeTypes.includes(edge.type)) {
			continue;
		}

		if (edge.source === nodeId) {
			neighborIds.add(edge.target);
		}
		if (edge.target === nodeId) {
			neighborIds.add(edge.source);
		}
	}

	for (const id of neighborIds) {
		const node = graph.nodes.get(id);
		if (node) {
			neighbors.push(node);
		}
	}

	return neighbors;
}
