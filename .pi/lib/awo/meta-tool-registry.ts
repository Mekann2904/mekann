/**
 * @abdd.meta
 * path: .pi/lib/awo/meta-tool-registry.ts
 * role: AWO メタツールレジストリ
 * why: 生成されたメタツールを管理し、dynamic-toolsと統合
 * related: .pi/lib/awo/types.ts, .pi/lib/awo/meta-tool-extractor.ts, .pi/extensions/dynamic-tools.ts
 * public_api: MetaToolRegistry, getGlobalMetaToolRegistry
 * invariants: ツール名は一意、最大ツール数を超過時は使用頻度の低いものを削除
 * side_effects: ファイルシステムへの書き込み（.pi/data/awo/registry/）
 * failure_modes: ディスク容量不足、ツール名重複
 * @abdd.explain
 * overview: メタツールの登録・管理・検索を行うレジストリ
 * what_it_does:
 *   - メタツールの登録と検索
 *   - 使用頻度の追跡
 *   - 低使用ツールの自動削除
 *   - dynamic-toolsとの統合インターフェース
 * why_it_exists: 生成されたメタツールのライフサイクル管理
 * scope:
 *   in: MetaToolDefinition
 *   out: 登録済みツール一覧、使用統計
 */

import * as fs from "fs";
import * as path from "path";
import {
  type MetaToolDefinition,
  type RegistryConfig,
  DEFAULT_AWO_CONFIG,
  type AWOConfig,
} from "./types.js";

// =============================================================================
// MetaToolRegistry クラス
// =============================================================================

/**
 * メタツールレジストリ
 * @summary メタツールの登録・管理
 */
export class MetaToolRegistry {
  private config: RegistryConfig;
  private dataDir: string;
  private tools: Map<string, MetaToolDefinition> = new Map();
  private pruneTimer: NodeJS.Timeout | null = null;

  /**
   * コンストラクタ
   * @summary MetaToolRegistryを初期化
   * @param config レジストリ設定
   * @param dataDir データディレクトリパス
   */
  constructor(
    config: RegistryConfig = DEFAULT_AWO_CONFIG.registry,
    dataDir: string = ".pi/data/awo/registry"
  ) {
    this.config = config;
    this.dataDir = dataDir;

    this.ensureDataDir();
    this.loadTools();

    // 定期的なプルーニングを開始
    if (this.config.pruneInterval > 0) {
      this.startPruneTimer();
    }
  }

  // ===========================================================================
  // パブリックメソッド
  // ===========================================================================

  /**
   * メタツールを登録
   * @summary 新しいメタツールを登録
   * @param tool ツール定義
   * @returns 登録成功フラグ
   */
  register(tool: MetaToolDefinition): boolean {
    // 名前重複チェック
    if (this.tools.has(tool.name)) {
      console.warn(`[AWO] Tool already registered: ${tool.name}`);
      return false;
    }

    // 最大数チェック
    if (this.tools.size >= this.config.maxTools) {
      // 使用頻度の低いツールを削除
      this.prune(1);
    }

    // 登録
    this.tools.set(tool.name, { ...tool, usageCount: 0 });
    this.saveTool(tool);

    return true;
  }

  /**
   * メタツールを取得
   * @summary 名前でツールを取得
   * @param name ツール名
   * @returns ツール定義またはundefined
   */
  get(name: string): MetaToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * ツール一覧を取得
   * @summary 登録済みツール一覧を返す
   * @returns ツール定義配列
   */
  list(): MetaToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * ツールを使用
   * @summary ツールの使用カウントを増加
   * @param name ツール名
   */
  use(name: string): void {
    const tool = this.tools.get(name);
    if (tool) {
      tool.usageCount++;
      tool.lastUsedAt = Date.now();
      this.saveTool(tool);
    }
  }

  /**
   * ツールを削除
   * @summary ツールをレジストリから削除
   * @param name ツール名
   * @returns 削除成功フラグ
   */
  delete(name: string): boolean {
    if (!this.tools.has(name)) {
      return false;
    }

    this.tools.delete(name);
    this.deleteToolFile(name);

    return true;
  }

  /**
   * 低使用ツールを削除
   * @summary 使用頻度の低いツールを削除
   * @param count 削除するツール数
   */
  prune(count: number): void {
    // 使用回数順にソート
    const sorted = this.list().sort((a, b) => a.usageCount - b.usageCount);

    // 使用回数が閾値未満のツールを削除
    const toDelete = sorted
      .filter((t) => t.usageCount < this.config.minUsageThreshold)
      .slice(0, count);

    for (const tool of toDelete) {
      this.delete(tool.name);
    }
  }

  /**
   * 統計を取得
   * @summary レジストリ統計を返す
   * @returns 統計情報
   */
  getStats(): {
    totalTools: number;
    totalUsage: number;
    avgUsage: number;
    mostUsed: MetaToolDefinition | null;
    leastUsed: MetaToolDefinition | null;
  } {
    const tools = this.list();
    const totalUsage = tools.reduce((sum, t) => sum + t.usageCount, 0);
    const avgUsage = tools.length > 0 ? totalUsage / tools.length : 0;

    const sorted = [...tools].sort((a, b) => b.usageCount - a.usageCount);

    return {
      totalTools: tools.length,
      totalUsage,
      avgUsage,
      mostUsed: sorted[0] ?? null,
      leastUsed: sorted[sorted.length - 1] ?? null,
    };
  }

  /**
   * 全ツールをクリア
   * @summary レジストリを空にする
   */
  clear(): void {
    for (const tool of this.list()) {
      this.deleteToolFile(tool.name);
    }
    this.tools.clear();
  }

  /**
   * 破棄
   * @summary リソースを解放
   */
  dispose(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  // ===========================================================================
  // dynamic-tools統合用メソッド
  // ===========================================================================

  /**
   * ツール定義をdynamic-tools形式で取得
   * @summary dynamic-tools互換の形式で返す
   * @returns dynamic-tools形式のツール定義配列
   */
  getDynamicToolDefinitions(): Array<{
    name: string;
    description: string;
    parameters: MetaToolDefinition["parameters"];
    code: string;
    tags: string[];
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      code: tool.implementation,
      tags: ["meta-tool", "awo-generated", "auto"],
    }));
  }

  // ===========================================================================
  // プライベートメソッド
  // ===========================================================================

  /**
   * データディレクトリを確保
   * @summary ディレクトリが存在しない場合は作成
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * ツールを保存
   * @summary ツール定義をファイルに保存
   */
  private saveTool(tool: MetaToolDefinition): void {
    const filepath = path.join(this.dataDir, `${tool.name}.json`);
    fs.writeFileSync(filepath, JSON.stringify(tool, null, 2), "utf-8");
  }

  /**
   * ツールファイルを削除
   * @summary ツールのファイルを削除
   */
  private deleteToolFile(name: string): void {
    const filepath = path.join(this.dataDir, `${name}.json`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  /**
   * ツールを読み込み
   * @summary 保存されたツールを読み込み
   */
  private loadTools(): void {
    if (!fs.existsSync(this.dataDir)) {
      return;
    }

    const files = fs
      .readdirSync(this.dataDir)
      .filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const filepath = path.join(this.dataDir, file);
        const content = fs.readFileSync(filepath, "utf-8");
        const tool = JSON.parse(content) as MetaToolDefinition;
        this.tools.set(tool.name, tool);
      } catch (error) {
        console.warn(`[AWO] Failed to load tool: ${file}`, error);
      }
    }
  }

  /**
   * プルーンタイマーを開始
   * @summary 定期的な削除チェックを開始
   */
  private startPruneTimer(): void {
    this.pruneTimer = setInterval(() => {
      const stats = this.getStats();
      if (stats.totalTools > this.config.maxTools * 0.8) {
        // 80%を超えたら削除開始
        const toDelete = Math.floor(stats.totalTools * 0.1); // 10%削除
        this.prune(toDelete);
      }
    }, this.config.pruneInterval);
  }
}

// =============================================================================
// グローバルインスタンス
// =============================================================================

let globalRegistry: MetaToolRegistry | null = null;

/**
 * グローバルレジストリを取得
 * @summary シングルトンのMetaToolRegistryを返す
 * @param config 設定（初回のみ使用）
 * @returns MetaToolRegistryインスタンス
 */
export function getGlobalMetaToolRegistry(
  config?: RegistryConfig
): MetaToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new MetaToolRegistry(config);
  }
  return globalRegistry;
}

/**
 * グローバルレジストリをリセット
 * @summary テスト用にグローバルインスタンスをリセット
 */
export function resetGlobalMetaToolRegistry(): void {
  if (globalRegistry) {
    globalRegistry.dispose();
    globalRegistry = null;
  }
}
