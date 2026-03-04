/**
 * @abdd.meta
 * path: .pi/extensions/search/locagent/tools.ts
 * role: LocAgent異種グラフのクエリツール実装
 * why: 構築済みグラフに対して検索・探索・取得操作を提供
 * related: .pi/extensions/search/locagent/types.ts, .pi/extensions/search/locagent/builder.ts
 * public_api: searchEntity, traverseGraph, retrieveEntity
 * invariants:
 * - 検索結果はscore降順でソートされる
 * - traverseは最大hops回まで探索する
 * - retrieveは存在しないエンティティでnullを返す
 * side_effects: なし（読み取り専用）
 * failure_modes:
 * - インデックス未構築時は空結果を返す
 * - メモリ不足（大規模グラフのtraverse）
 * @abdd.explain
 * overview: LocAgent論文に基づくグラフクエリツール
 * what_it_does:
 *   - キーワードベースのエンティティ検索（searchEntity）
 *   - 多段ホップによるグラフトラバーサル（traverseGraph）
 *   - エンティティ詳細情報の取得（retrieveEntity）
 * why_it_exists:
 *   - Issue/タスクから関連コードを特定するため
 *   - 依存関係を階層的に追跡するため
 * scope:
 *   in: LocAgentGraph（構築済みインデックス）
 *   out: SearchEntityResult[], TraverseGraphResult, RetrieveEntityResult
 */

import type {
	LocAgentGraph,
	LocAgentNode,
	LocAgentEdge,
	LocAgentEdgeType,
	TraverseDirection,
	DetailLevel,
	SearchEntityResult,
	TraverseGraphResult,
	RetrieveEntityResult,
} from "./types.js";

// ============================================================================
// Search Entity
// ============================================================================

/**
 * キーワードに基づいてエンティティを検索
 * @summary エンティティ検索
 * @param graph - LocAgentグラフ
 * @param keywords - 検索キーワード配列
 * @param limit - 最大結果数
 * @returns スコア付き検索結果
 */
export function searchEntity(
	graph: LocAgentGraph,
	keywords: string[],
	limit: number = 20
): SearchEntityResult[] {
	if (!keywords.length || graph.nodes.size === 0) {
		return [];
	}

	const results: SearchEntityResult[] = [];
	const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));

	for (const node of graph.nodes.values()) {
		let score = 0;
		const textToSearch = [
			node.name,
			node.docstring || "",
			node.code || "",
			node.signature || "",
		].join(" ");

		const lowerText = textToSearch.toLowerCase();

		for (const keyword of keywordSet) {
			// 完全一致は高スコア
			if (node.name.toLowerCase() === keyword) {
				score += 10;
			}
			// 部分一致
			if (lowerText.includes(keyword)) {
				score += 1;
			}
			// 名前に含まれる場合は追加スコア
			if (node.name.toLowerCase().includes(keyword)) {
				score += 3;
			}
		}

		if (score > 0) {
			results.push({
				entity: node,
				score,
				codeSnippet: generateCodeSnippet(node, "preview"),
			});
		}
	}

	// スコア降順でソート
	results.sort((a, b) => b.score - a.score);

	return results.slice(0, limit);
}

// ============================================================================
// Traverse Graph
// ============================================================================

/**
 * グラフを多段ホップで探索
 * @summary グラフトラバーサル
 * @param graph - LocAgentグラフ
 * @param nodeIds - 開始ノードID配列
 * @param direction - 探索方向
 * @param hops - 最大ホップ数
 * @param edgeTypes - フィルタするエッジタイプ（省略時は全て）
 * @param limit - 最大結果数
 * @returns 探索結果サブグラフ
 */
export function traverseGraph(
	graph: LocAgentGraph,
	nodeIds: string[],
	direction: TraverseDirection,
	hops: number = 2,
	edgeTypes?: LocAgentEdgeType[],
	limit: number = 50
): TraverseGraphResult {
	if (!nodeIds.length || graph.nodes.size === 0) {
		return { nodes: [], edges: [], format: "" };
	}

	const visitedNodes = new Set<string>();
	const visitedEdges = new Set<string>();
	const resultNodes: LocAgentNode[] = [];
	const resultEdges: LocAgentEdge[] = [];

	// BFSキュー: [nodeId, currentHop]
	const queue: Array<[string, number]> = nodeIds
		.filter((id) => graph.nodes.has(id))
		.map((id) => [id, 0]);

	// 開始ノードをマーク
	for (const nodeId of nodeIds) {
		if (graph.nodes.has(nodeId)) {
			visitedNodes.add(nodeId);
			resultNodes.push(graph.nodes.get(nodeId)!);
		}
	}

	while (queue.length > 0 && resultNodes.length < limit) {
		const [currentId, currentHop] = queue.shift()!;

		if (currentHop >= hops) {
			continue;
		}

		// エッジを探索
		for (const edge of graph.edges) {
			let nextId: string | undefined;

			// 方向に応じたエッジ選択
			if (direction === "downstream" || direction === "both") {
				if (edge.source === currentId) {
					nextId = edge.target;
				}
			}
			if (direction === "upstream" || direction === "both") {
				if (edge.target === currentId) {
					nextId = edge.source;
				}
			}

			if (!nextId) continue;

			// エッジタイプフィルタ
			if (edgeTypes && !edgeTypes.includes(edge.type)) {
				continue;
			}

			// エッジを記録
			const edgeKey = `${edge.source}->${edge.target}`;
			if (!visitedEdges.has(edgeKey)) {
				visitedEdges.add(edgeKey);
				resultEdges.push(edge);
			}

			// ノードを訪問
			if (!visitedNodes.has(nextId) && resultNodes.length < limit) {
				visitedNodes.add(nextId);
				const node = graph.nodes.get(nextId);
				if (node) {
					resultNodes.push(node);
					queue.push([nextId, currentHop + 1]);
				}
			}
		}
	}

	return {
		nodes: resultNodes,
		edges: resultEdges,
		format: formatAsTree(resultNodes, resultEdges, nodeIds),
	};
}

// ============================================================================
// Retrieve Entity
// ============================================================================

/**
 * エンティティの詳細情報を取得
 * @summary エンティティ詳細取得
 * @param graph - LocAgentグラフ
 * @param nodeId - ノードID
 * @returns 詳細情報（存在しない場合はnull）
 */
export function retrieveEntity(
	graph: LocAgentGraph,
	nodeId: string
): RetrieveEntityResult | null {
	const node = graph.nodes.get(nodeId);
	if (!node) {
		return null;
	}

	return {
		entity: node,
		fullCode: node.code || generateCodeSnippet(node, "full"),
	};
}

/**
 * 複数エンティティの詳細情報を一括取得
 * @summary エンティティ一括取得
 * @param graph - LocAgentグラフ
 * @param nodeIds - ノードID配列
 * @returns 詳細情報配列
 */
export function retrieveEntities(
	graph: LocAgentGraph,
	nodeIds: string[]
): RetrieveEntityResult[] {
	return nodeIds
		.map((id) => retrieveEntity(graph, id))
		.filter((result): result is RetrieveEntityResult => result !== null);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * コードスニペットを生成
 * @summary コードスニペット生成
 * @param node - ノード
 * @param detailLevel - 詳細レベル
 * @returns コードスニペット文字列
 */
function generateCodeSnippet(node: LocAgentNode, detailLevel: DetailLevel): string {
	if (node.code) {
		switch (detailLevel) {
			case "fold":
				return node.code.split("\n")[0] || "";
			case "preview":
				return node.code.split("\n").slice(0, 5).join("\n");
			case "full":
				return node.code;
		}
	}

	// コードがない場合はシグネチャのみ
	if (node.signature) {
		return node.signature;
	}

	// 最低限の情報
	return `${node.nodeType}: ${node.name}`;
}

/**
 * ツリー形式でフォーマット
 * @summary ツリー形式フォーマット
 * @param nodes - ノード配列
 * @param edges - エッジ配列
 * @param rootIds - ルートノードID
 * @returns ツリー形式文字列
 */
function formatAsTree(
	nodes: LocAgentNode[],
	edges: LocAgentEdge[],
	rootIds: string[]
): string {
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));
	const childrenMap = new Map<string, string[]>();

	// 子ノードを構築（downstream方向）
	for (const edge of edges) {
		if (!childrenMap.has(edge.source)) {
			childrenMap.set(edge.source, []);
		}
		childrenMap.get(edge.source)!.push(edge.target);
	}

	const lines: string[] = [];

	function buildTree(nodeId: string, prefix: string, isLast: boolean): void {
		const node = nodeMap.get(nodeId);
		if (!node) return;

		const connector = isLast ? "└── " : "├── ";
		lines.push(`${prefix}${connector}${node.name} (${node.nodeType})`);

		const children = childrenMap.get(nodeId) || [];
		const newPrefix = prefix + (isLast ? "    " : "│   ");

		for (let i = 0; i < children.length; i++) {
			buildTree(children[i], newPrefix, i === children.length - 1);
		}
	}

	for (let i = 0; i < rootIds.length; i++) {
		if (nodeMap.has(rootIds[i])) {
			buildTree(rootIds[i], "", i === rootIds.length - 1);
		}
	}

	return lines.join("\n");
}

// ============================================================================
// Advanced Queries
// ============================================================================

/**
 * シンボル名で検索
 * @summary シンボル検索
 * @param graph - LocAgentグラフ
 * @param symbolName - シンボル名
 * @returns 一致するノード配列
 */
export function findSymbol(
	graph: LocAgentGraph,
	symbolName: string
): LocAgentNode[] {
	const results: LocAgentNode[] = [];
	const lowerName = symbolName.toLowerCase();

	for (const node of graph.nodes.values()) {
		if (node.name.toLowerCase() === lowerName) {
			results.push(node);
		}
	}

	return results;
}

/**
 * ファイルパスでノードを検索
 * @summary ファイル検索
 * @param graph - LocAgentグラフ
 * @param filePath - ファイルパス
 * @returns そのファイルに属するノード配列
 */
export function findNodesByFile(
	graph: LocAgentGraph,
	filePath: string
): LocAgentNode[] {
	const results: LocAgentNode[] = [];

	for (const node of graph.nodes.values()) {
		if (node.filePath === filePath) {
			results.push(node);
		}
	}

	return results;
}

/**
 * エッジで接続された隣接ノードを取得
 * @summary 隣接ノード取得
 * @param graph - LocAgentグラフ
 * @param nodeId - ノードID
 * @param direction - 方向
 * @param edgeTypes - エッジタイプフィルタ
 * @returns 隣接ノード配列
 */
export function getNeighbors(
	graph: LocAgentGraph,
	nodeId: string,
	direction: TraverseDirection = "both",
	edgeTypes?: LocAgentEdgeType[]
): LocAgentNode[] {
	const neighborIds = new Set<string>();

	for (const edge of graph.edges) {
		// エッジタイプフィルタ
		if (edgeTypes && !edgeTypes.includes(edge.type)) {
			continue;
		}

		if (direction === "downstream" || direction === "both") {
			if (edge.source === nodeId) {
				neighborIds.add(edge.target);
			}
		}
		if (direction === "upstream" || direction === "both") {
			if (edge.target === nodeId) {
				neighborIds.add(edge.source);
			}
		}
	}

	const results: LocAgentNode[] = [];
	for (const id of neighborIds) {
		const node = graph.nodes.get(id);
		if (node) {
			results.push(node);
		}
	}

	return results;
}

/**
 * パス（経路）を探索
 * @summary パス探索
 * @param graph - LocAgentグラフ
 * @param startId - 開始ノードID
 * @param endId - 終了ノードID
 * @param maxLength - 最大パス長
 * @returns パス（ノードID配列）またはnull
 */
export function findPath(
	graph: LocAgentGraph,
	startId: string,
	endId: string,
	maxLength: number = 5
): string[] | null {
	if (!graph.nodes.has(startId) || !graph.nodes.has(endId)) {
		return null;
	}

	if (startId === endId) {
		return [startId];
	}

	// BFS
	const queue: Array<[string, string[]]> = [[startId, [startId]]];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const [current, path] = queue.shift()!;

		if (path.length >= maxLength) {
			continue;
		}

		visited.add(current);

		// 隣接ノードを探索
		for (const edge of graph.edges) {
			let nextId: string | undefined;
			if (edge.source === current) {
				nextId = edge.target;
			}

			if (nextId && !visited.has(nextId)) {
				const newPath = [...path, nextId];
				if (nextId === endId) {
					return newPath;
				}
				queue.push([nextId, newPath]);
			}
		}
	}

	return null;
}
