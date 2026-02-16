/**
 * Embeddings Module - Provider Registry.
 * Manages embedding providers and provides a unified interface.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  EmbeddingProvider,
  ProviderConfig,
  EmbeddingModuleConfig,
  ProviderStatus,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const CONFIG_FILE_PATH = join(homedir(), ".pi", "agent", "embedding-config.json");

const DEFAULT_CONFIG: EmbeddingModuleConfig = {
  version: 1,
  defaultProvider: null,
  fallbackOrder: ["openai", "local", "mock"],
};

// ============================================================================
// Registry Class
// ============================================================================

/**
 * プロバイダーレジストリ
 *
 * 責務:
 * - プロバイダーの登録・検索
 * - 設定に基づくプロバイダー選択
 * - デフォルトプロバイダー管理
 */
export class EmbeddingProviderRegistry {
  private providers = new Map<string, EmbeddingProvider>();
  private config: EmbeddingModuleConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * プロバイダーを登録
   */
  register(provider: EmbeddingProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * プロバイダーを登録解除
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * プロバイダーを取得
   */
  get(providerId: string): EmbeddingProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * 全プロバイダーを取得（利用不可含む）
   */
  getAll(): EmbeddingProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 利用可能な全プロバイダーを取得
   */
  async getAvailable(): Promise<EmbeddingProvider[]> {
    const available: EmbeddingProvider[] = [];
    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) {
        available.push(provider);
      }
    }
    return available;
  }

  /**
   * 全プロバイダーの状態を取得
   */
  async getAllStatus(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];
    for (const provider of this.providers.values()) {
      const available = await provider.isAvailable();
      statuses.push({
        id: provider.id,
        name: provider.name,
        model: provider.model,
        available,
        unavailableReason: available ? undefined : "Not configured or dependencies missing",
        capabilities: provider.capabilities,
      });
    }
    return statuses;
  }

  // ============================================================================
  // Default Provider Management
  // ============================================================================

  /**
   * デフォルトプロバイダーを設定
   */
  setDefault(providerId: string | null): void {
    if (providerId && !this.providers.has(providerId)) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    this.config.defaultProvider = providerId;
    this.saveConfig();
  }

  /**
   * 設定からデフォルトプロバイダーIDを取得
   */
  getDefaultProviderId(): string | null {
    return this.config.defaultProvider;
  }

  /**
   * デフォルトプロバイダーを取得
   * 設定がない場合、最初に利用可能なプロバイダーを返す
   */
  async getDefault(): Promise<EmbeddingProvider | null> {
    // 設定されたデフォルトを確認
    if (this.config.defaultProvider) {
      const provider = this.providers.get(this.config.defaultProvider);
      if (provider && (await provider.isAvailable())) {
        return provider;
      }
    }

    // フォールバック順序で検索
    for (const providerId of this.config.fallbackOrder) {
      const provider = this.providers.get(providerId);
      if (provider && (await provider.isAvailable())) {
        return provider;
      }
    }

    // 利用可能なものを検索
    const available = await this.getAvailable();
    return available[0] || null;
  }

  // ============================================================================
  // Provider Resolution
  // ============================================================================

  /**
   * 設定からプロバイダーを解決
   */
  async resolve(config?: ProviderConfig): Promise<EmbeddingProvider | null> {
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

  // ============================================================================
  // Configuration Management
  // ============================================================================

  /**
   * 設定ファイルのパスを取得
   */
  getConfigPath(): string {
    return CONFIG_FILE_PATH;
  }

  /**
   * 設定を取得
   */
  getConfig(): EmbeddingModuleConfig {
    return { ...this.config };
  }

  /**
   * 設定を更新
   */
  updateConfig(updates: Partial<EmbeddingModuleConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * 設定をファイルから読み込み
   */
  private loadConfig(): EmbeddingModuleConfig {
    try {
      if (existsSync(CONFIG_FILE_PATH)) {
        const content = readFileSync(CONFIG_FILE_PATH, "utf-8");
        const parsed = JSON.parse(content);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      // Ignore errors
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 設定をファイルに保存
   */
  private saveConfig(): void {
    const dir = join(homedir(), ".pi", "agent");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this.config, null, 2), {
      mode: 0o600,
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * グローバルプロバイダーレジストリ
 */
export const embeddingRegistry = new EmbeddingProviderRegistry();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * デフォルトプロバイダーを取得
 */
export async function getEmbeddingProvider(
  config?: ProviderConfig
): Promise<EmbeddingProvider | null> {
  return embeddingRegistry.resolve(config);
}

/**
 * エンベディングを生成（デフォルトプロバイダー使用）
 */
export async function generateEmbedding(
  text: string,
  config?: ProviderConfig
): Promise<number[] | null> {
  const provider = await getEmbeddingProvider(config);
  if (!provider) return null;
  return provider.generateEmbedding(text);
}

/**
 * バッチエンベディングを生成（デフォルトプロバイダー使用）
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  config?: ProviderConfig
): Promise<(number[] | null)[]> {
  const provider = await getEmbeddingProvider(config);
  if (!provider) return texts.map(() => null);
  return provider.generateEmbeddingsBatch(texts);
}
