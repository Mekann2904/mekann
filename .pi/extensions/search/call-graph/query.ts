/**
 * @abdd.meta
 * path: .pi/extensions/search/call-graph/query.ts
 * role: コールグラフの検索ロジックを提供するモジュール
 * why: ノードID、シンボル名、ファイルパスによるノード特定、および呼び出し元の探索を集約するため
 * related: .pi/extensions/search/call-graph/types.ts, .pi/extensions/search/call-graph/index.ts
 * public_api: findNodesByName, findNodeById, findNodesByFile, findCallers
 * invariants: findCallersはキューが空になるか結果数がlimitに達するまで実行される
 * side_effects: なし（純粋な関数型プログラミング）
 * failure_modes: 指定されたdepthやlimitが過度に大きい場合、探索完了までに時間がかかる
 * @abdd.explain
 * overview: コールグラフ構造に対する各種クエリ（検索・探索）機能を実装する
 * what_it_does:
 *   - 名前、ID、ファイルパスによるノードの抽出
 *   - 指定シンボルの呼び出し元を幅優先探索で特定し、チェーンと信頼度を計算
 * why_it_exists:
 *   - コード解析機能において、特定の関数やファイルの関連性を動的に調査する必要があるため
 * scope:
 *   in: CallGraphIndex（ノードとエッジの集合）、検索条件（名前、ID、パス、深さ、上限数）
 *   out: 一致するノード、または呼び出しチェーン情報を含む結果配列
 */

/**
 * Call Graph Query Functions
 *
 * Provides functions to query the call graph for callers and callees.
 */

import type {
	CallGraphIndex,
	CallGraphNode,
	CallGraphEdge,
	CallChainResult,
} from "./types.js";

// ============================================
// Node Lookup
// ============================================

/**
 * 名前でノード検索
 * @summary 名前でノード検索
 * @param index 呼び出しグラフのインデックス
 * @param symbolName 検索対象のシンボル名
 * @returns 一致するノードの配列
 */
export function findNodesByName(
	index: CallGraphIndex,
	symbolName: string
): CallGraphNode[] {
	return index.nodes.filter(
		(node) =>
			node.name === symbolName ||
			node.name.toLowerCase() === symbolName.toLowerCase()
	);
}

/**
 * ノードを検索
 * @summary IDでノード検索
 * @param index 検索対象の呼び出しグラフインデックス
 * @param nodeId 検索するノードID
 * @returns 一致したノード、見つからない場合はundefined
 */
export function findNodeById(index: CallGraphIndex, nodeId: string): CallGraphNode | undefined {
	return index.nodes.find((node) => node.id === nodeId);
}

 /**
  * ファイルパスでノードを検索
  * @param index コールグラフのインデックス
  * @param filePath 検索対象のファイルパス
  * @returns 該当するノードの配列
  */
export function findNodesByFile(
	index: CallGraphIndex,
	filePath: string
): CallGraphNode[] {
	return index.nodes.filter((node) => node.file.includes(filePath));
}

// ============================================
// Find Callers
// ============================================

interface CallerSearchState {
	results: Map<string, CallChainResult>;
	queue: Array<{ name: string; level: number; callSite?: CallGraphEdge["callSite"]; confidence: number }>;
}

 /**
  * 指定されたシンボルを呼び出す全ての関数を検索します。
  * @param index - 呼び出しグラフのインデックス
  * @param symbolName - 呼び出し元を検索するシンボル名
  * @param depth - 再帰の深さ（1 = 直接の呼び出し元のみ）
  * @param limit - 最大結果数
  * @returns 深度と呼び出し位置情報を持つ呼び出し元ノードの配列
  */
export function findCallers(
	index: CallGraphIndex,
	symbolName: string,
	depth: number = 1,
	limit: number = 50
): CallChainResult[] {
	const results = new Map<string, CallChainResult>();
	const queue: Array<{ name: string; level: number; callSite?: CallGraphEdge["callSite"]; confidence: number }> = [
		{ name: symbolName, level: 0, confidence: 1.0 },
	];

	while (queue.length > 0 && results.size < limit) {
		const current = queue.shift()!;

		// Find edges where the current symbol is the callee
		const callerEdges = index.edges.filter(
			(edge) =>
				edge.callee === current.name ||
				edge.callee.toLowerCase() === current.name.toLowerCase()
		);

		for (const edge of callerEdges) {
			// Find the caller node
			const callerNode = findNodeById(index, edge.caller);
			if (!callerNode) continue;

			// Skip if already found at equal or lower depth
			const existing = results.get(callerNode.id);
			if (existing && existing.depth <= current.level + 1) {
				continue;
			}

			// Add to results
			const confidence = current.confidence * edge.confidence;
			results.set(callerNode.id, {
				node: callerNode,
				depth: current.level + 1,
				callSite: current.level === 0 ? edge.callSite : undefined,
				confidence,
			});

			// Queue for deeper search
			if (current.level + 1 < depth) {
				queue.push({
					name: callerNode.name,
					level: current.level + 1,
					confidence,
				});
			}
		}
	}

	// Sort by depth then by confidence
	const sorted = Array.from(results.values());
	sorted.sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth;
		return b.confidence - a.confidence;
	});

	return sorted.slice(0, limit);
}

// ============================================
// Find Callees
// ============================================

 /**
  * 指定されたシンボルから呼ばれる関数を検索する
  * @param index - コールグラフインデックス
  * @param symbolName - 呼び出し先を検索するシンボル名
  * @param depth - 再帰の深さ（1 = 直接の呼び出し先のみ）
  * @param limit - 最大結果数
  * @returns 深度と呼び出し位置情報を含む呼び出し先ノードの配列
  */
export function findCallees(
	index: CallGraphIndex,
	symbolName: string,
	depth: number = 1,
	limit: number = 50
): CallChainResult[] {
	const results = new Map<string, CallChainResult>();

	// Find all nodes with the given name
	const startNodes = findNodesByName(index, symbolName);
	if (startNodes.length === 0) {
		return [];
	}

	const queue: Array<{ nodeId: string; level: number; callSite?: CallGraphEdge["callSite"]; confidence: number }> = [];

	// Add all starting nodes to queue
	for (const node of startNodes) {
		queue.push({ nodeId: node.id, level: 0, confidence: 1.0 });
	}

	while (queue.length > 0 && results.size < limit) {
		const current = queue.shift()!;

		// Find edges where the current symbol is the caller
		const calleeEdges = index.edges.filter((edge) => edge.caller === current.nodeId);

		for (const edge of calleeEdges) {
			// Find callee nodes by name (may be multiple)
			const calleeNodes = findNodesByName(index, edge.callee);

			for (const calleeNode of calleeNodes) {
				// Skip if already found at equal or lower depth
				const existing = results.get(calleeNode.id);
				if (existing && existing.depth <= current.level + 1) {
					continue;
				}

				// Add to results
				const confidence = current.confidence * edge.confidence;
				results.set(calleeNode.id, {
					node: calleeNode,
					depth: current.level + 1,
					callSite: current.level === 0 ? edge.callSite : undefined,
					confidence,
				});

				// Queue for deeper search
				if (current.level + 1 < depth) {
					queue.push({
						nodeId: calleeNode.id,
						level: current.level + 1,
						confidence,
					});
				}
			}

			// If no nodes found for this callee, it might be external
			if (calleeNodes.length === 0 && current.level === 0) {
				// Create a placeholder for external function
				const externalId = `external:${edge.callee}`;
				if (!results.has(externalId)) {
					results.set(externalId, {
						node: {
							id: externalId,
							name: edge.callee,
							file: "(external)",
							line: 0,
							kind: "function",
						},
						depth: 1,
						callSite: edge.callSite,
						confidence: edge.confidence * 0.5, // Lower confidence for external
					});
				}
			}
		}
	}

	// Sort by depth then by confidence
	const sorted = Array.from(results.values());
	sorted.sort((a, b) => {
		if (a.depth !== b.depth) return a.depth - b.depth;
		return b.confidence - a.confidence;
	});

	return sorted.slice(0, limit);
}

// ============================================
// Call Path Analysis
// ============================================

 /**
  * 2つのシンボル間の呼び出し経路を探索する
  * @param index 呼び出しグラフのインデックス
  * @param fromSymbol 開始シンボル名
  * @param toSymbol 終了シンボル名
  * @param maxDepth 最大探索深さ
  * @returns 呼び出し経路のノード配列、見つからなければnull
  */
export function findCallPath(
	index: CallGraphIndex,
	fromSymbol: string,
	toSymbol: string,
	maxDepth: number = 10
): CallGraphNode[] | null {
	if (fromSymbol === toSymbol) {
		return [];
	}

	const fromNodes = findNodesByName(index, fromSymbol);
	const toNodes = findNodesByName(index, toSymbol);

	if (fromNodes.length === 0 || toNodes.length === 0) {
		return null;
	}

	const toNodeIds = new Set(toNodes.map((n) => n.id));

	// BFS from source
	const visited = new Set<string>();
	const parentMap = new Map<string, { nodeId: string; edge: CallGraphEdge }>();
	const queue: string[] = fromNodes.map((n) => n.id);

	for (const id of queue) {
		visited.add(id);
	}

	while (queue.length > 0) {
		const currentId = queue.shift()!;
		const currentNode = findNodeById(index, currentId);
		if (!currentNode) continue;

		// Find callees
		const calleeEdges = index.edges.filter((edge) => edge.caller === currentId);

		for (const edge of calleeEdges) {
			const calleeNodes = findNodesByName(index, edge.callee);

			for (const calleeNode of calleeNodes) {
				if (visited.has(calleeNode.id)) continue;

				parentMap.set(calleeNode.id, { nodeId: currentId, edge });

				// Found target
				if (toNodeIds.has(calleeNode.id)) {
					// Reconstruct path
					const path: CallGraphNode[] = [calleeNode];
					let nodeId: string | undefined = calleeNode.id;

					while (nodeId) {
						const parent = parentMap.get(nodeId);
						if (!parent) break;
						const parentNode = findNodeById(index, parent.nodeId);
						if (parentNode) {
							path.unshift(parentNode);
						}
						nodeId = parent.nodeId;
					}

					return path;
				}

				visited.add(calleeNode.id);
				queue.push(calleeNode.id);
			}
		}
	}

	return null; // No path found
}

// ============================================
// Statistics
// ============================================

/**
 * ノード統計取得
 * @summary ノード統計取得
 * @param index コールグラフインデックス
 * @param symbolName シンボル名
 * @returns ノード情報と呼び出し数の統計
 */
export function getNodeStats(
	index: CallGraphIndex,
	symbolName: string
): {
	node: CallGraphNode | null;
	directCallers: number;
	directCallees: number;
	totalCallers: number;
	totalCallees: number;
} {
	const nodes = findNodesByName(index, symbolName);
	const primaryNode = nodes[0] || null;

	// Count direct relationships
	const directCallers = index.edges.filter(
		(e) => e.callee === symbolName || e.callee.toLowerCase() === symbolName.toLowerCase()
	).length;

	let directCallees = 0;
	for (const node of nodes) {
		directCallees += index.edges.filter((e) => e.caller === node.id).length;
	}

	// Count transitive relationships
	const allCallers = findCallers(index, symbolName, 10, 1000);
	const allCallees = findCallees(index, symbolName, 10, 1000);

	return {
		node: primaryNode,
		directCallers,
		directCallees,
		totalCallers: allCallers.length,
		totalCallees: allCallees.length,
	};
}
