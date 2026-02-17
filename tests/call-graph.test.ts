/**
 * Call Graph Tests
 *
 * Simple tests to verify the call graph implementation.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
	buildCallGraph,
	saveCallGraphIndex,
	readCallGraphIndex,
} from "../.pi/lib/call-graph/builder.js";
import {
	findCallers,
	findCallees,
	findNodesByName,
	findCallPath,
	getNodeStats,
} from "../.pi/lib/call-graph/query.js";
import type { CallGraphIndex } from "../.pi/lib/call-graph/types.js";
import { join } from "node:path";

// Test data: a simple call graph
const testIndex: CallGraphIndex = {
	nodes: [
		{
			id: "src/main.ts:10:main",
			name: "main",
			file: "src/main.ts",
			line: 10,
			kind: "function",
		},
		{
			id: "src/utils.ts:5:helper",
			name: "helper",
			file: "src/utils.ts",
			line: 5,
			kind: "function",
		},
		{
			id: "src/utils.ts:20:processData",
			name: "processData",
			file: "src/utils.ts",
			line: 20,
			kind: "function",
		},
		{
			id: "src/api.ts:15:fetchData",
			name: "fetchData",
			file: "src/api.ts",
			line: 15,
			kind: "function",
		},
	],
	edges: [
		{
			caller: "src/main.ts:10:main",
			callee: "helper",
			callSite: { file: "src/main.ts", line: 12, column: 5 },
			confidence: 0.8,
		},
		{
			caller: "src/main.ts:10:main",
			callee: "fetchData",
			callSite: { file: "src/main.ts", line: 15, column: 5 },
			confidence: 0.8,
		},
		{
			caller: "src/utils.ts:20:processData",
			callee: "helper",
			callSite: { file: "src/utils.ts", line: 25, column: 3 },
			confidence: 1.0,
		},
	],
	metadata: {
		indexedAt: Date.now(),
		parserBackend: "ripgrep",
		fileCount: 3,
		nodeCount: 4,
		edgeCount: 3,
		version: 1,
	},
};

describe("Call Graph Query Functions", () => {
	describe("findNodesByName", () => {
		it("should find nodes by exact name", () => {
			const nodes = findNodesByName(testIndex, "main");
			expect(nodes).toHaveLength(1);
			expect(nodes[0].name).toBe("main");
		});

		it("should find nodes case-insensitively", () => {
			const nodes = findNodesByName(testIndex, "MAIN");
			expect(nodes).toHaveLength(1);
			expect(nodes[0].name).toBe("main");
		});

		it("should return empty array for non-existent name", () => {
			const nodes = findNodesByName(testIndex, "nonexistent");
			expect(nodes).toHaveLength(0);
		});
	});

	describe("findCallers", () => {
		it("should find direct callers", () => {
			const callers = findCallers(testIndex, "helper", 1, 50);
			expect(callers).toHaveLength(2);

			const callerNames = callers.map((c) => c.node.name);
			expect(callerNames).toContain("main");
			expect(callerNames).toContain("processData");
		});

		it("should return empty array for symbol with no callers", () => {
			const callers = findCallers(testIndex, "main", 1, 50);
			expect(callers).toHaveLength(0);
		});

		it("should respect limit parameter", () => {
			const callers = findCallers(testIndex, "helper", 1, 1);
			expect(callers).toHaveLength(1);
		});
	});

	describe("findCallees", () => {
		it("should find direct callees", () => {
			const callees = findCallees(testIndex, "main", 1, 50);
			expect(callees).toHaveLength(2);

			const calleeNames = callees.map((c) => c.node.name);
			expect(calleeNames).toContain("helper");
			expect(calleeNames).toContain("fetchData");
		});

		it("should return empty array for symbol with no callees", () => {
			const callees = findCallees(testIndex, "helper", 1, 50);
			expect(callees).toHaveLength(0);
		});
	});

	describe("findCallPath", () => {
		it("should find path between connected symbols", () => {
			const path = findCallPath(testIndex, "main", "helper");
			expect(path).not.toBeNull();
			expect(path).toHaveLength(2);
			expect(path![0].name).toBe("main");
			expect(path![1].name).toBe("helper");
		});

		it("should return null for unconnected symbols", () => {
			const path = findCallPath(testIndex, "helper", "main");
			expect(path).toBeNull();
		});

		it("should return empty array for same symbol", () => {
			const path = findCallPath(testIndex, "main", "main");
			expect(path).toEqual([]);
		});
	});

	describe("getNodeStats", () => {
		it("should return correct stats for a function", () => {
			const stats = getNodeStats(testIndex, "helper");

			expect(stats.node).not.toBeNull();
			expect(stats.node!.name).toBe("helper");
			expect(stats.directCallers).toBe(2);
			expect(stats.directCallees).toBe(0);
		});

		it("should return null node for non-existent symbol", () => {
			const stats = getNodeStats(testIndex, "nonexistent");
			expect(stats.node).toBeNull();
		});
	});
});
