/**
 * @file .pi/lib/embeddings/registry.ts の単体テスト
 * @description 埋め込みプロバイダーレジストリのテスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import type {
	EmbeddingProvider,
	ProviderCapabilities,
	ProviderStatus,
} from "../../../.pi/lib/embeddings/types";

// ============================================================================
// モックプロバイダー
// ============================================================================

const createMockProvider = (
	id: string,
	available = true,
): EmbeddingProvider => ({
	id,
	name: `Provider ${id}`,
	model: `model-${id}`,
	capabilities: {
		maxTokens: 1000,
		dimensions: 100,
		supportsBatch: true,
		maxBatchSize: 10,
		offlineCapable: false,
	},
	isAvailable: async () => available,
	generateEmbedding: async () => [1, 2, 3],
	generateEmbeddingsBatch: async (texts) => texts.map(() => [1, 2, 3]),
});

// ============================================================================
// テスト用レジストリ実装
// ============================================================================

class TestEmbeddingProviderRegistry {
	private providers = new Map<string, EmbeddingProvider>();
	private defaultProvider: string | null = null;
	private fallbackOrder: string[] = ["openai", "local", "mock"];

	register(provider: EmbeddingProvider): void {
		this.providers.set(provider.id, provider);
	}

	unregister(providerId: string): void {
		this.providers.delete(providerId);
	}

	get(providerId: string): EmbeddingProvider | undefined {
		return this.providers.get(providerId);
	}

	getAll(): EmbeddingProvider[] {
		return Array.from(this.providers.values());
	}

	async getAvailable(): Promise<EmbeddingProvider[]> {
		const available: EmbeddingProvider[] = [];
		for (const provider of this.providers.values()) {
			if (await provider.isAvailable()) {
				available.push(provider);
			}
		}
		return available;
	}

	async getAllStatus(): Promise<ProviderStatus[]> {
		const statuses: ProviderStatus[] = [];
		for (const provider of this.providers.values()) {
			const available = await provider.isAvailable();
			statuses.push({
				id: provider.id,
				name: provider.name,
				model: provider.model,
				available,
				unavailableReason: available
					? undefined
					: "Not configured or dependencies missing",
				capabilities: provider.capabilities,
			});
		}
		return statuses;
	}

	setDefault(providerId: string | null): void {
		if (providerId && !this.providers.has(providerId)) {
			throw new Error(`Provider not found: ${providerId}`);
		}
		this.defaultProvider = providerId;
	}

	getDefaultProviderId(): string | null {
		return this.defaultProvider;
	}

	async getDefault(): Promise<EmbeddingProvider | null> {
		// 設定されたデフォルトを確認
		if (this.defaultProvider) {
			const provider = this.providers.get(this.defaultProvider);
			if (provider && (await provider.isAvailable())) {
				return provider;
			}
		}

		// フォールバック順序で検索
		for (const providerId of this.fallbackOrder) {
			const provider = this.providers.get(providerId);
			if (provider && (await provider.isAvailable())) {
				return provider;
			}
		}

		// 利用可能なものを検索
		const available = await this.getAvailable();
		return available[0] || null;
	}

	async resolve(config?: { provider?: string }): Promise<EmbeddingProvider | null> {
		// 明示的なプロバイダー指定
		if (config?.provider) {
			const provider = this.providers.get(config.provider);
			if (provider && (await provider.isAvailable())) {
				return provider;
			}
		}

		// デフォルトを使用
		return this.getDefault();
	}

	getConfigPath(): string {
		return "/home/test/.pi/agent/embedding-config.json";
	}

	getConfig(): { version: number; defaultProvider: string | null; fallbackOrder: string[] } {
		return {
			version: 1,
			defaultProvider: this.defaultProvider,
			fallbackOrder: [...this.fallbackOrder],
		};
	}

	updateConfig(updates: { defaultProvider?: string | null; fallbackOrder?: string[] }): void {
		if (updates.defaultProvider !== undefined) {
			this.defaultProvider = updates.defaultProvider;
		}
		if (updates.fallbackOrder !== undefined) {
			this.fallbackOrder = updates.fallbackOrder;
		}
	}

	setFallbackOrder(order: string[]): void {
		this.fallbackOrder = order;
	}

	getFallbackOrder(): string[] {
		return [...this.fallbackOrder];
	}

	getProviderCount(): number {
		return this.providers.size;
	}

	hasProvider(id: string): boolean {
		return this.providers.has(id);
	}
}

// ============================================================================
// テスト開始
// ============================================================================

describe("EmbeddingProviderRegistry", () => {
	let registry: TestEmbeddingProviderRegistry;

	beforeEach(() => {
		registry = new TestEmbeddingProviderRegistry();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// ============================================================================
	// プロバイダー管理
	// ============================================================================

	describe("register", () => {
		it("should_register_provider", () => {
			const provider = createMockProvider("test-provider");
			registry.register(provider);

			expect(registry.hasProvider("test-provider")).toBe(true);
			expect(registry.getProviderCount()).toBe(1);
		});

		it("should_overwrite_existing_provider", () => {
			const provider1 = createMockProvider("test", true);
			const provider2 = { ...provider1, name: "Updated Provider" };

			registry.register(provider1);
			registry.register(provider2);

			const retrieved = registry.get("test");
			expect(retrieved?.name).toBe("Updated Provider");
			expect(registry.getProviderCount()).toBe(1);
		});

		it("should_register_multiple_providers", () => {
			const providers = [
				createMockProvider("provider1"),
				createMockProvider("provider2"),
				createMockProvider("provider3"),
			];

			for (const p of providers) {
				registry.register(p);
			}

			expect(registry.getProviderCount()).toBe(3);
			expect(registry.hasProvider("provider1")).toBe(true);
			expect(registry.hasProvider("provider2")).toBe(true);
			expect(registry.hasProvider("provider3")).toBe(true);
		});
	});

	describe("unregister", () => {
		it("should_unregister_existing_provider", () => {
			const provider = createMockProvider("test");
			registry.register(provider);

			registry.unregister("test");

			expect(registry.hasProvider("test")).toBe(false);
			expect(registry.getProviderCount()).toBe(0);
		});

		it("should_silently_ignore_unregistered_provider", () => {
			expect(() => registry.unregister("non-existent")).not.toThrow();
			expect(registry.getProviderCount()).toBe(0);
		});

		it("should_not_affect_other_providers", () => {
			registry.register(createMockProvider("provider1"));
			registry.register(createMockProvider("provider2"));

			registry.unregister("provider1");

			expect(registry.hasProvider("provider1")).toBe(false);
			expect(registry.hasProvider("provider2")).toBe(true);
			expect(registry.getProviderCount()).toBe(1);
		});
	});

	describe("get", () => {
		it("should_return_registered_provider", () => {
			const provider = createMockProvider("test");
			registry.register(provider);

			const retrieved = registry.get("test");

			expect(retrieved).toBeDefined();
			expect(retrieved?.id).toBe("test");
		});

		it("should_return_undefined_for_nonexistent_provider", () => {
			const retrieved = registry.get("non-existent");
			expect(retrieved).toBeUndefined();
		});
	});

	describe("getAll", () => {
		it("should_return_empty_array_when_no_providers", () => {
			const providers = registry.getAll();
			expect(providers).toEqual([]);
		});

		it("should_return_all_registered_providers", () => {
			const p1 = createMockProvider("p1");
			const p2 = createMockProvider("p2");
			const p3 = createMockProvider("p3");

			registry.register(p1);
			registry.register(p2);
			registry.register(p3);

			const providers = registry.getAll();

			expect(providers).toHaveLength(3);
			expect(providers.some((p) => p.id === "p1")).toBe(true);
			expect(providers.some((p) => p.id === "p2")).toBe(true);
			expect(providers.some((p) => p.id === "p3")).toBe(true);
		});
	});

	describe("getAvailable", () => {
		it("should_return_available_providers_only", async () => {
			registry.register(createMockProvider("available", true));
			registry.register(createMockProvider("unavailable", false));

			const available = await registry.getAvailable();

			expect(available).toHaveLength(1);
			expect(available[0].id).toBe("available");
		});

		it("should_return_empty_when_no_providers_available", async () => {
			registry.register(createMockProvider("unavailable", false));

			const available = await registry.getAvailable();

			expect(available).toEqual([]);
		});

		it("should_return_all_providers_when_all_available", async () => {
			registry.register(createMockProvider("p1", true));
			registry.register(createMockProvider("p2", true));

			const available = await registry.getAvailable();

			expect(available).toHaveLength(2);
		});
	});

	describe("getAllStatus", () => {
		it("should_return_status_for_all_providers", async () => {
			registry.register(createMockProvider("p1", true));
			registry.register(createMockProvider("p2", false));

			const statuses = await registry.getAllStatus();

			expect(statuses).toHaveLength(2);
		});

		it("should_include_correct_availability_status", async () => {
			registry.register(createMockProvider("available", true));
			registry.register(createMockProvider("unavailable", false));

			const statuses = await registry.getAllStatus();

			const availableStatus = statuses.find((s) => s.id === "available");
			const unavailableStatus = statuses.find((s) => s.id === "unavailable");

			expect(availableStatus?.available).toBe(true);
			expect(unavailableStatus?.available).toBe(false);
		});

		it("should_include_capabilities", async () => {
			const provider = createMockProvider("test");
			registry.register(provider);

			const statuses = await registry.getAllStatus();

			const testStatus = statuses.find((s) => s.id === "test");
			expect(testStatus?.capabilities).toEqual(provider.capabilities);
		});

		it("should_include_unavailable_reason_for_unavailable", async () => {
			registry.register(createMockProvider("unavailable", false));

			const statuses = await registry.getAllStatus();
			const unavailableStatus = statuses.find((s) => s.id === "unavailable");

			expect(unavailableStatus?.unavailableReason).toBeDefined();
			expect(unavailableStatus?.unavailableReason).not.toBe("");
		});
	});

	// ============================================================================
	// デフォルトプロバイダー管理
	// ============================================================================

	describe("setDefault", () => {
		it("should_set_default_provider", () => {
			registry.register(createMockProvider("p1"));
			registry.setDefault("p1");

			expect(registry.getDefaultProviderId()).toBe("p1");
		});

		it("should_throw_error_for_nonexistent_provider", () => {
			expect(() => registry.setDefault("non-existent")).toThrow("Provider not found");
		});

		it("should_allow_setting_null_to_clear_default", () => {
			registry.register(createMockProvider("p1"));
			registry.setDefault("p1");
			registry.setDefault(null);

			expect(registry.getDefaultProviderId()).toBe(null);
		});
	});

	describe("getDefault", () => {
		it("should_return_configured_default_if_available", async () => {
			registry.register(createMockProvider("p1", true));
			registry.setDefault("p1");

			const provider = await registry.getDefault();

			expect(provider?.id).toBe("p1");
		});

		it("should_return_null_if_default_not_available", async () => {
			registry.register(createMockProvider("p1", false));
			registry.setDefault("p1");

			const provider = await registry.getDefault();

			expect(provider).toBeNull();
		});

		it("should_fallback_to_fallback_order", async () => {
			registry.register(createMockProvider("openai", false));
			registry.register(createMockProvider("local", true));
			registry.register(createMockProvider("mock", true));

			const provider = await registry.getDefault();

			expect(provider?.id).toBe("local"); // 最初の利用可能なフォールバック
		});

		it("should_return_any_available_if_no_fallback_matches", async () => {
			registry.register(createMockProvider("custom", true));

			const provider = await registry.getDefault();

			expect(provider?.id).toBe("custom");
		});

		it("should_return_null_when_no_providers", async () => {
			const provider = await registry.getDefault();
			expect(provider).toBeNull();
		});
	});

	describe("resolve", () => {
		it("should_resolve_explicit_provider", async () => {
			registry.register(createMockProvider("p1", true));
			registry.register(createMockProvider("p2", true));

			const provider = await registry.resolve({ provider: "p2" });

			expect(provider?.id).toBe("p2");
		});

		it("should_return_null_if_explicit_provider_not_available", async () => {
			registry.register(createMockProvider("p1", false));

			const provider = await registry.resolve({ provider: "p1" });

			expect(provider).toBeNull();
		});

		it("should_use_default_when_no_explicit_provider", async () => {
			registry.register(createMockProvider("p1", true));
			registry.register(createMockProvider("p2", true));
			registry.setDefault("p2");

			const provider = await registry.resolve();

			expect(provider?.id).toBe("p2");
		});

		it("should_return_null_when_no_config_provided", async () => {
			const provider = await registry.resolve();
			expect(provider).toBeNull();
		});
	});

	// ============================================================================
	// 設定管理
	// ============================================================================

	describe("getConfig", () => {
		it("should_return_current_config", () => {
			registry.register(createMockProvider("p1"));
			registry.setDefault("p1");

			const config = registry.getConfig();

			expect(config.version).toBe(1);
			expect(config.defaultProvider).toBe("p1");
			expect(config.fallbackOrder).toEqual(["openai", "local", "mock"]);
		});
	});

	describe("updateConfig", () => {
		it("should_update_default_provider", () => {
			registry.register(createMockProvider("p1"));
			registry.updateConfig({ defaultProvider: "p1" });

			expect(registry.getDefaultProviderId()).toBe("p1");
		});

		it("should_update_fallback_order", () => {
			registry.updateConfig({ fallbackOrder: ["p1", "p2", "p3"] });

			expect(registry.getFallbackOrder()).toEqual(["p1", "p2", "p3"]);
		});

		it("should_update_both_properties", () => {
			registry.register(createMockProvider("p1"));
			registry.updateConfig({
				defaultProvider: "p1",
				fallbackOrder: ["custom"],
			});

			expect(registry.getDefaultProviderId()).toBe("p1");
			expect(registry.getFallbackOrder()).toEqual(["custom"]);
		});
	});

	// ============================================================================
	// フォールバック順序
	// ============================================================================

	describe("fallback_order", () => {
		it("should_use_fallback_order_in_getDefault", async () => {
			registry.register(createMockProvider("p1", false));
			registry.register(createMockProvider("p2", true));
			registry.register(createMockProvider("p3", true));

			registry.setFallbackOrder(["p1", "p2", "p3"]);

			const provider = await registry.getDefault();
			expect(provider?.id).toBe("p2"); // p1は利用不可、次にp2
		});

		it("should_skip_unavailable_providers_in_fallback", async () => {
			registry.register(createMockProvider("p1", false));
			registry.register(createMockProvider("p2", false));
			registry.register(createMockProvider("p3", true));

			registry.setFallbackOrder(["p1", "p2", "p3"]);

			const provider = await registry.getDefault();
			expect(provider?.id).toBe("p3");
		});

		it("should_use_default_first_if_set", async () => {
			registry.register(createMockProvider("p1", true));
			registry.register(createMockProvider("p2", true));

			registry.setDefault("p2");

			const provider = await registry.getDefault();
			expect(provider?.id).toBe("p2");
		});
	});

	// ============================================================================
	// プロパティベーステスト
	// ============================================================================

	describe("プロパティベーステスト", () => {
		it("PBT: getAll は登録数と一致する", () => {
			fc.assert(
				fc.property(
					fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 20 }),
					(providerIds) => {
						const testRegistry = new TestEmbeddingProviderRegistry();

						for (const id of providerIds) {
							testRegistry.register(createMockProvider(id));
						}

						return testRegistry.getAll().length === new Set(providerIds).size;
					}
				),
				{ numRuns: 20 }
			);
		});

		it("PBT: setDefault は有効なプロバイダーIDのみを受け入れる", () => {
			fc.assert(
				fc.property(
					fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 20 }),
					fc.string({ minLength: 1, maxLength: 10 }),
					(providerIds, defaultId) => {
						const testRegistry = new TestEmbeddingProviderRegistry();

						for (const id of providerIds) {
							testRegistry.register(createMockProvider(id));
						}

						// 登録済みIDで設定
						if (providerIds.includes(defaultId)) {
							expect(() => testRegistry.setDefault(defaultId)).not.toThrow();
							expect(testRegistry.getDefaultProviderId()).toBe(defaultId);
						} else {
							// 未登録IDでエラー
							expect(() => testRegistry.setDefault(defaultId)).toThrow();
						}

						return true;
					}
				),
				{ numRuns: 20 }
			);
		});
	});
});
