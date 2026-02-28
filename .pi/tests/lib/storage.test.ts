/**
 * @file .pi/lib/storage.ts の単体テスト
 * @description ストレージ関連機能の再エクスポート確認テスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import * as storage from "../../lib/storage.js";

describe("storage.ts exports", () => {
	describe("正常系", () => {
		// Storage base utilities
		it("should export createPathsFactory function", () => {
			expect(typeof storage.createPathsFactory).toBe("function");
		});

		it("should export createEnsurePaths function", () => {
			expect(typeof storage.createEnsurePaths).toBe("function");
		});

		it("should export mergeEntitiesById function", () => {
			expect(typeof storage.mergeEntitiesById).toBe("function");
		});

		it("should export pruneRunArtifacts function", () => {
			expect(typeof storage.pruneRunArtifacts).toBe("function");
		});

		it("should export createStorageLoader function", () => {
			expect(typeof storage.createStorageLoader).toBe("function");
		});

		it("should export createStorageSaver function", () => {
			expect(typeof storage.createStorageSaver).toBe("function");
		});

		// Run Index utilities
		it("should export RUN_INDEX_VERSION constant", () => {
			expect(storage.RUN_INDEX_VERSION).toBeDefined();
			expect(typeof storage.RUN_INDEX_VERSION).toBe("number");
		});

		it("should export buildRunIndex function", () => {
			expect(typeof storage.buildRunIndex).toBe("function");
		});

		it("should export searchRuns function", () => {
			expect(typeof storage.searchRuns).toBe("function");
		});

		it("should export extractKeywords function", () => {
			expect(typeof storage.extractKeywords).toBe("function");
		});

		// Pattern Extraction utilities
		it("should export PATTERN_STORAGE_VERSION constant", () => {
			expect(storage.PATTERN_STORAGE_VERSION).toBeDefined();
		});

		it("should export extractPatternFromRun function", () => {
			expect(typeof storage.extractPatternFromRun).toBe("function");
		});

		it("should export loadPatternStorage function", () => {
			expect(typeof storage.loadPatternStorage).toBe("function");
		});

		it("should export savePatternStorage function", () => {
			expect(typeof storage.savePatternStorage).toBe("function");
		});

		// Semantic Memory utilities
		it("should export SEMANTIC_MEMORY_VERSION constant", () => {
			expect(storage.SEMANTIC_MEMORY_VERSION).toBeDefined();
		});

		it("should export buildSemanticMemoryIndex function", () => {
			expect(typeof storage.buildSemanticMemoryIndex).toBe("function");
		});

		it("should export semanticSearch function", () => {
			expect(typeof storage.semanticSearch).toBe("function");
		});

		// Embeddings Module
		it("should export cosineSimilarity function", () => {
			expect(typeof storage.cosineSimilarity).toBe("function");
		});

		it("should export EMBEDDING_MODEL constant", () => {
			expect(storage.EMBEDDING_MODEL).toBeDefined();
		});

		it("should export EMBEDDING_DIMENSIONS constant", () => {
			expect(storage.EMBEDDING_DIMENSIONS).toBeDefined();
			expect(typeof storage.EMBEDDING_DIMENSIONS).toBe("number");
		});
	});

	describe("境界条件", () => {
		it("should have positive embedding dimensions", () => {
			expect(storage.EMBEDDING_DIMENSIONS).toBeGreaterThan(0);
			expect(storage.EMBEDDING_DIMENSIONS).toBeLessThanOrEqual(4096);
		});

		it("should have positive version numbers", () => {
			expect(storage.RUN_INDEX_VERSION).toBeGreaterThan(0);
		});
	});
});
