/**
 * @abdd.meta
 * path: .pi/lib/embeddings/registry.ts
 * role: 埋め込みプロバイダーの管理と設定の永続化を行うレジストリ
 * why: プロバイダーの登録、状態監視、設定管理を一元化するため
 * related: .pi/lib/embeddings/types.ts, node:fs, node:path, node:os
 * public_api: EmbeddingProviderRegistry, register, unregister, get, getAll, getAvailable, getAllStatus
 * invariants: プロバイダーIDは一意である必要がある
 * side_effects: 設定ファイルの読み書きによるファイルシステムの変更
 * failure_modes: 設定ファイルの破損、読み書き権限の欠如、無効なプロバイダーIDの指定
 * @abdd.explain
 * overview: 埋め込みベクトル生成プロバイダーを管理するクラスと、その設定をJSONファイルで永続化する機能を提供する
 * what_it_does:
 *   - プロバイダーの登録、解除、取得、一覧取得を行う
 *   - プロバイダーの利用可否を判定し、ステータス一覧を生成する
 *   - 設定ファイル(~/.pi/agent/embedding-config.json)の読み込みとデフォルト値の適用を行う
 * why_it_exists:
 *   - 複数の埋め込みプロバイダー（OpenAI, Local, Mock等）を統一的なインターフェースで利用可能にするため
 *   - 実行時に利用可能なプロバイダーを動的に把握する仕組みを提供するため
 *   - ユーザー環境ごとの設定を永続化し、デフォルトプロバイダーなどを管理するため
 * scope:
 *   in: プロバイダーインスタンス、プロバイダーID、ファイルシステムパス
 *   out: プロバイダーインスタンス、利用可能プロバイダーリスト、プロバイダーステータスリスト
 */

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
 * @summary プロバイダー登録
 * @param provider 登録するプロバイダー
 * @returns なし
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
   * プロバイダ登録
   * @summary プロバイダ登録
   * @param {EmbeddingProvider} provider 登録するプロバイダ
   * @returns {void}
   */
  register(provider: EmbeddingProvider): void {
    this.providers.set(provider.id, provider);
  }

  /**
   * プロバイダ削除
   * @summary プロバイダ削除
   * @param {string} providerId プロバイダID
   * @returns {void}
   */
  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * プロバイダ取得
   * @summary プロバイダ取得
   * @param {string} providerId プロバイダID
   * @returns 対応するプロバイダー、見つからない場合は undefined
   */
  get(providerId: string): EmbeddingProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * 全プロバイダ取得
   * @summary 全プロバイダ取得
   * @returns 全てのEmbeddingProvider
   */
  getAll(): EmbeddingProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * 利用可能プロバイダ取得
   * @summary 利用可能プロバイダ取得
   * @returns 全てのEmbeddingProvider
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
   * 全プロバイダーの状態を取得する
   * @summary 全状態取得
   * @returns プロバイダーの状態配列
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
   * デフォルトプロバイダーを設定する
   * @summary デフォルト設定
   * @param providerId プロバイダーID
   * @throws {Error} プロバイダーが見つからない場合
   */
  setDefault(providerId: string | null): void {
    if (providerId && !this.providers.has(providerId)) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    this.config.defaultProvider = providerId;
    this.saveConfig();
  }

  /**
   * デフォルトプロバイダーIDを取得する
   * @summary デフォルトID取得
   * @returns デフォルトプロバイダーID、またはnull
   */
  getDefaultProviderId(): string | null {
    return this.config.defaultProvider;
  }

  /**
   * デフォルトプロバイダーを取得する
   * @summary デフォルト取得
   * @returns デフォルトプロバイダー、またはnull
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
   * プロバイダーを解決する
   * @summary プロバイダー解決
   * @param config 設定情報
   * @returns 解決されたプロバイダー、またはnull
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
   * 設定ファイルパスを取得
   * @summary 設定パス取得
   * @returns 設定ファイルのパス
   */
  getConfigPath(): string {
    return CONFIG_FILE_PATH;
  }

  /**
   * 設定を取得
   * @summary 設定取得
   * @returns 現在の設定
   */
  getConfig(): EmbeddingModuleConfig {
    return { ...this.config };
  }

  /**
   * 設定を更新
   * @summary 設定更新
   * @param updates 更新内容
   * @returns なし
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
 * プロバイダを取得
 * @summary プロバイダ取得
 * @param config プロバイダ設定
 * @returns プロバイダインスタンスまたはnull
 */
export async function getEmbeddingProvider(
  config?: ProviderConfig
): Promise<EmbeddingProvider | null> {
  return embeddingRegistry.resolve(config);
}

/**
 * ベクトルを生成
 * @summary ベクトル生成
 * @param text テキスト
 * @param config プロバイダ設定
 * @returns ベクトル配列またはnull
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
 * 埋め込みベクトルを一括生成
 * @summary 一括生成実行
 * @param {string[]} texts - 入力テキストの配列
 * @param {ProviderConfig} [config] - プロバイダ設定
 * @returns {Promise<(number[] | null)[]>} 埋め込みベクトルの配列
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  config?: ProviderConfig
): Promise<(number[] | null)[]> {
  const provider = await getEmbeddingProvider(config);
  if (!provider) return texts.map(() => null);
  return provider.generateEmbeddingsBatch(texts);
}
