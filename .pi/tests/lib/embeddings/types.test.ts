/**
 * @file .pi/lib/embeddings/types.ts の単体テスト
 * @description エンベディングモジュールの型定義整合性確認
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";

// 型定義をインポート
import type {
	ProviderCapabilities,
	EmbeddingProvider,
	ProviderConfig,
	EmbeddingModuleConfig,
	EmbeddingResult,
	ProviderStatus,
	VectorSearchResult,
} from "../../../lib/embeddings/types";

// ============================================================================
// 型定義の整合性テスト
// ============================================================================

describe("embeddings/types.ts 型定義整合性", () => {
	describe("ProviderCapabilities", () => {
		it("required_fields_maxTokens_dimensions_supportsBatch_maxBatchSize_offlineCapable", () => {
			const capabilities: ProviderCapabilities = {
				maxTokens: 1000,
				dimensions: 1536,
				supportsBatch: true,
				maxBatchSize: 10,
				offlineCapable: false,
			};

			expect(capabilities.maxTokens).toBe(1000);
			expect(capabilities.dimensions).toBe(1536);
			expect(capabilities.supportsBatch).toBe(true);
			expect(capabilities.maxBatchSize).toBe(10);
			expect(capabilities.offlineCapable).toBe(false);
		});

		it("valid_dimensions_must_be_positive", () => {
			const capabilities: ProviderCapabilities = {
				maxTokens: 8191,
				dimensions: 1536,
				supportsBatch: true,
				maxBatchSize: 2048,
				offlineCapable: false,
			};

			expect(capabilities.dimensions).toBeGreaterThan(0);
		});

		it("valid_maxTokens_must_be_positive", () => {
			const capabilities: ProviderCapabilities = {
				maxTokens: 8191,
				dimensions: 1536,
				supportsBatch: true,
				maxBatchSize: 2048,
				offlineCapable: false,
			};

			expect(capabilities.maxTokens).toBeGreaterThan(0);
		});

		it("valid_maxBatchSize_must_be_positive", () => {
			const capabilities: ProviderCapabilities = {
				maxTokens: 8191,
				dimensions: 1536,
				supportsBatch: true,
				maxBatchSize: 2048,
				offlineCapable: false,
			};

			expect(capabilities.maxBatchSize).toBeGreaterThan(0);
		});
	});

	describe("EmbeddingProvider", () => {
		it("required_fields_id_name_model_capabilities_isAvailable_generateEmbedding_generateEmbeddingsBatch", () => {
			const provider: EmbeddingProvider = {
				id: "test-provider",
				name: "Test Provider",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
			};

			expect(provider.id).toBe("test-provider");
			expect(provider.name).toBe("Test Provider");
			expect(provider.model).toBe("test-model");
			expect(provider.capabilities).toBeDefined();
			expect(typeof provider.isAvailable).toBe("function");
			expect(typeof provider.generateEmbedding).toBe("function");
			expect(typeof provider.generateEmbeddingsBatch).toBe("function");
		});

		it("optional_methods_initialize_dispose", () => {
			let initialized = false;
			let disposed = false;

			const provider: EmbeddingProvider = {
				id: "test-provider",
				name: "Test Provider",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
				initialize: async () => {
					initialized = true;
				},
				dispose: async () => {
					disposed = true;
				},
			};

			expect(provider.initialize).toBeDefined();
			expect(provider.dispose).toBeDefined();
		});

		it("isAvailable_returns_Promise<boolean>", async () => {
			const provider: EmbeddingProvider = {
				id: "test",
				name: "Test",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
			};

			const result = await provider.isAvailable();
			expect(typeof result).toBe("boolean");
		});

		it("generateEmbedding_returns_Promise<number[] | null>", async () => {
			const provider: EmbeddingProvider = {
				id: "test",
				name: "Test",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
			};

			const result = await provider.generateEmbedding("test");
			expect(Array.isArray(result) || result === null).toBe(true);
		});

		it("generateEmbeddingsBatch_returns_Promise<(number[] | null)[]>", async () => {
			const provider: EmbeddingProvider = {
				id: "test",
				name: "Test",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
			};

			const result = await provider.generateEmbeddingsBatch(["test1", "test2"]);
			expect(Array.isArray(result)).toBe(true);
			if (result.length > 0) {
				expect(Array.isArray(result[0]) || result[0] === null).toBe(true);
			}
		});
	});

	describe("ProviderConfig", () => {
		it("required_fields_provider_options", () => {
			const config: ProviderConfig = {
				provider: "openai",
				options: { model: "text-embedding-3-small" },
			};

			expect(config.provider).toBe("openai");
			expect(config.options).toEqual({ model: "text-embedding-3-small" });
		});

		it("all_fields_are_optional", () => {
			const config: ProviderConfig = {};

			expect(config.provider).toBeUndefined();
			expect(config.options).toBeUndefined();
		});

		it("provider_only", () => {
			const config: ProviderConfig = {
				provider: "openai",
			};

			expect(config.provider).toBe("openai");
			expect(config.options).toBeUndefined();
		});

		it("options_only", () => {
			const config: ProviderConfig = {
				options: { temperature: 0.5 },
			};

			expect(config.provider).toBeUndefined();
			expect(config.options).toEqual({ temperature: 0.5 });
		});
	});

	describe("EmbeddingModuleConfig", () => {
		it("required_fields_version_defaultProvider_fallbackOrder", () => {
			const config: EmbeddingModuleConfig = {
				version: 1,
				defaultProvider: "openai",
				fallbackOrder: ["openai", "local", "mock"],
			};

			expect(config.version).toBe(1);
			expect(config.defaultProvider).toBe("openai");
			expect(config.fallbackOrder).toEqual(["openai", "local", "mock"]);
		});

		it("optional_field_providerOptions", () => {
			const config: EmbeddingModuleConfig = {
				version: 1,
				defaultProvider: null,
				fallbackOrder: ["openai"],
				providerOptions: {
					openai: { model: "text-embedding-3-small" },
				},
			};

			expect(config.providerOptions).toBeDefined();
			expect(config.providerOptions?.openai).toEqual({ model: "text-embedding-3-small" });
		});

		it("defaultProvider_can_be_null", () => {
			const config: EmbeddingModuleConfig = {
				version: 1,
				defaultProvider: null,
				fallbackOrder: ["openai"],
			};

			expect(config.defaultProvider).toBeNull();
		});

		it("defaultProvider_can_be_string", () => {
			const config: EmbeddingModuleConfig = {
				version: 1,
				defaultProvider: "openai",
				fallbackOrder: ["openai"],
			};

			expect(typeof config.defaultProvider).toBe("string");
		});

		it("fallbackOrder_must_be_non_empty_array", () => {
			const config: EmbeddingModuleConfig = {
				version: 1,
				defaultProvider: null,
				fallbackOrder: ["openai", "local"],
			};

			expect(Array.isArray(config.fallbackOrder)).toBe(true);
			expect(config.fallbackOrder.length).toBeGreaterThan(0);
		});
	});

	describe("EmbeddingResult", () => {
		it("required_fields_embedding_provider_model_dimensions", () => {
			const result: EmbeddingResult = {
				embedding: [1, 2, 3],
				provider: "openai",
				model: "text-embedding-3-small",
				dimensions: 3,
			};

			expect(Array.isArray(result.embedding)).toBe(true);
			expect(result.provider).toBe("openai");
			expect(result.model).toBe("text-embedding-3-small");
			expect(result.dimensions).toBe(3);
		});

		it("optional_field_tokens", () => {
			const result: EmbeddingResult = {
				embedding: [1, 2, 3],
				provider: "openai",
				model: "text-embedding-3-small",
				dimensions: 3,
				tokens: 10,
			};

			expect(result.tokens).toBe(10);
		});

		it("embedding_dimensions_matches_dimensions_field", () => {
			const result: EmbeddingResult = {
				embedding: [1, 2, 3, 4],
				provider: "openai",
				model: "text-embedding-3-small",
				dimensions: 4,
			};

			expect(result.embedding.length).toBe(result.dimensions);
		});
	});

	describe("ProviderStatus", () => {
		it("required_fields_id_name_model_available_capabilities", () => {
			const status: ProviderStatus = {
				id: "openai",
				name: "OpenAI Embeddings",
				model: "text-embedding-3-small",
				available: true,
				capabilities: {
					maxTokens: 8191,
					dimensions: 1536,
					supportsBatch: true,
					maxBatchSize: 2048,
					offlineCapable: false,
				},
			};

			expect(status.id).toBe("openai");
			expect(status.name).toBe("OpenAI Embeddings");
			expect(status.model).toBe("text-embedding-3-small");
			expect(status.available).toBe(true);
			expect(status.capabilities).toBeDefined();
		});

		it("optional_field_unavailableReason", () => {
			const status: ProviderStatus = {
				id: "openai",
				name: "OpenAI Embeddings",
				model: "text-embedding-3-small",
				available: false,
				unavailableReason: "API key not configured",
				capabilities: {
					maxTokens: 8191,
					dimensions: 1536,
					supportsBatch: true,
					maxBatchSize: 2048,
					offlineCapable: false,
				},
			};

			expect(status.unavailableReason).toBe("API key not configured");
		});

		it("unavailableReason_undefined_when_available", () => {
			const status: ProviderStatus = {
				id: "openai",
				name: "OpenAI Embeddings",
				model: "text-embedding-3-small",
				available: true,
				capabilities: {
					maxTokens: 8191,
					dimensions: 1536,
					supportsBatch: true,
					maxBatchSize: 2048,
					offlineCapable: false,
				},
			};

			expect(status.unavailableReason).toBeUndefined();
		});
	});

	describe("VectorSearchResult", () => {
		it("required_fields_item_similarity", () => {
			const result: VectorSearchResult<string> = {
				item: "test-item",
				similarity: 0.95,
			};

			expect(result.item).toBe("test-item");
			expect(result.similarity).toBe(0.95);
		});

		it("similarity_must_be_between_0_and_1", () => {
			const result: VectorSearchResult<string> = {
				item: "test-item",
				similarity: 0.85,
			};

			expect(result.similarity).toBeGreaterThanOrEqual(0);
			expect(result.similarity).toBeLessThanOrEqual(1);
		});

		it("item_can_be_any_type", () => {
			const stringResult: VectorSearchResult<string> = { item: "test", similarity: 1.0 };
			const numberResult: VectorSearchResult<number> = { item: 42, similarity: 0.5 };
			const objectResult: VectorSearchResult<{ id: string }> = {
				item: { id: "123" },
				similarity: 0.75,
			};

			expect(typeof stringResult.item).toBe("string");
			expect(typeof numberResult.item).toBe("number");
			expect(typeof objectResult.item).toBe("object");
		});
	});

	describe("型の相互互換性", () => {
		it("EmbeddingProvider_generateEmbedding_returns_null_on_failure", async () => {
			const provider: EmbeddingProvider = {
				id: "test",
				name: "Test",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => null,
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
			};

			const result = await provider.generateEmbedding("test");
			expect(result).toBeNull();
		});

		it("generateEmbeddingsBatch_returns_array_with_nulls", async () => {
			const provider: EmbeddingProvider = {
				id: "test",
				name: "Test",
				model: "test-model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => [
					[1, 2, 3],
					null,
					[4, 5, 6],
				],
			};

			const results = await provider.generateEmbeddingsBatch(["a", "b", "c"]);

			expect(results.length).toBe(3);
			expect(Array.isArray(results[0])).toBe(true);
			expect(results[1]).toBeNull();
			expect(Array.isArray(results[2])).toBe(true);
		});

		it("ProviderConfig_provider_matches_EmbeddingProvider_id", () => {
			const config: ProviderConfig = {
				provider: "openai",
			};

			const provider: EmbeddingProvider = {
				id: "openai",
				name: "OpenAI",
				model: "model",
				capabilities: {
					maxTokens: 1000,
					dimensions: 100,
					supportsBatch: true,
					maxBatchSize: 10,
					offlineCapable: false,
				},
				isAvailable: async () => true,
				generateEmbedding: async () => [1, 2, 3],
				generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
			};

			// config.provider は provider.id と一致可能
			expect(config.provider).toBe(provider.id);
		});
	});
});
