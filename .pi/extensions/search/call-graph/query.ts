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
 * Find node by name in the index.
 * Returns all nodes with matching name (may have multiple with same name in different files).
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
 * Find node by ID.
 */
export function findNodeById(index: CallGraphIndex, nodeId: string): CallGraphNode | undefined {
	return index.nodes.find((node) => node.id === nodeId);
}

/**
 * Find nodes by file path.
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
 * Find all functions that call the given symbol.
 *
 * @param index - Call graph index
 * @param symbolName - Symbol name to find callers for
 * @param depth - Recursion depth (1 = direct callers only)
 * @param limit - Maximum number of results
 * @returns Array of caller nodes with depth and call site info
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
 * Find all functions called by the given symbol.
 *
 * @param index - Call graph index
 * @param symbolName - Symbol name to find callees for
 * @param depth - Recursion depth (1 = direct callees only)
 * @param limit - Maximum number of results
 * @returns Array of callee nodes with depth and call site info
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
 * Find call path between two symbols.
 * Uses BFS to find shortest path.
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
 * Get statistics for a function in the call graph.
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
