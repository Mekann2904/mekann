/**
 * @abdd.meta
 * path: .pi/lib/subagents/adapters/file-subagent-repo.ts
 * role: ファイルベースのサブエージェントリポジトリ実装
 * why: ISubagentRepositoryインターフェースの具体実装を提供
 * related: ../application/interfaces.ts, ../../extensions/subagents/storage.ts
 * public_api: FileSubagentRepository
 * invariants: ストレージファイルの整合性を維持
 * side_effects: ファイルシステムへの読み書き
 * failure_modes: ファイルアクセスエラー、JSONパースエラー
 * @abdd.explain
 * overview: ファイルシステムを使用したリポジトリ実装
 * what_it_does:
 *   - ストレージファイルの読み込み・保存
 *   - 実行履歴の追加・取得
 *   - デフォルトエージェントの作成
 * why_it_exists: インフラストラクチャ詳細をApplication層から分離
 * scope:
 *   in: Application層のインターフェース
 *   out: ファイルシステム
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ISubagentRepository } from "../application/interfaces.js";
import type { SubagentStorage, SubagentRunRecord } from "../domain/subagent-definition.js";

/**
 * ファイルベースのサブエージェントリポジトリ
 * @summary ファイルリポジトリ
 */
export class FileSubagentRepository implements ISubagentRepository {
  private readonly storagePath: string;
  private cache: SubagentStorage | null = null;
  private runRecords: SubagentRunRecord[] = [];

  /**
   * コンストラクタ
   * @summary コンストラクタ
   * @param cwd - 作業ディレクトリ
   */
  constructor(private readonly cwd: string) {
    this.storagePath = join(cwd, ".pi/subagents/storage.json");
  }

  /**
   * ストレージを読み込む
   * @summary ストレージ読込
   * @returns サブエージェントストレージ
   */
  async load(): Promise<SubagentStorage> {
    if (this.cache) {
      return this.cache;
    }

    if (!existsSync(this.storagePath)) {
      this.cache = this.createDefaultStorage();
      return this.cache;
    }

    try {
      const content = readFileSync(this.storagePath, "utf-8");
      const parsed = JSON.parse(content);
      this.cache = this.migrateStorage(parsed);
      return this.cache;
    } catch {
      this.cache = this.createDefaultStorage();
      return this.cache;
    }
  }

  /**
   * ストレージを保存
   * @summary ストレージ保存
   * @param storage - サブエージェントストレージ
   */
  async save(storage: SubagentStorage): Promise<void> {
    const dir = join(this.cwd, ".pi/subagents");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(this.storagePath, JSON.stringify(storage, null, 2), "utf-8");
    this.cache = storage;
  }

  /**
   * 実行履歴を追加
   * @summary 履歴追加
   * @param record - 実行履歴レコード
   */
  async addRunRecord(record: SubagentRunRecord): Promise<void> {
    this.runRecords.push(record);
  }

  /**
   * 実行履歴を取得
   * @summary 履歴取得
   * @param limit - 取得件数
   * @returns 実行履歴配列
   */
  async getRunRecords(limit?: number): Promise<SubagentRunRecord[]> {
    return limit ? this.runRecords.slice(-limit) : this.runRecords;
  }

  /**
   * デフォルトストレージを作成
   * @summary デフォルト作成
   * @returns デフォルトストレージ
   */
  private createDefaultStorage(): SubagentStorage {
    return {
      subagents: [
        {
          id: "researcher",
          name: "Researcher",
          description: "Research code and documentation thoroughly",
          systemPrompt:
            "You are a research specialist. Investigate the codebase deeply and provide detailed findings.",
          enabled: true,
        },
        {
          id: "implementer",
          name: "Implementer",
          description: "Implement code changes and fixes",
          systemPrompt:
            "You are an implementation specialist. Write clean, tested code following best practices.",
          enabled: true,
        },
        {
          id: "reviewer",
          name: "Reviewer",
          description: "Review code for quality and correctness",
          systemPrompt:
            "You are a code review specialist. Analyze code for bugs, security issues, and improvements.",
          enabled: true,
        },
      ],
      defaultSubagentId: null,
    };
  }

  /**
   * ストレージのマイグレーション
   * @summary マイグレーション
   * @param storage - 読み込んだストレージ
   * @returns マイグレーション後のストレージ
   */
  private migrateStorage(storage: Partial<SubagentStorage>): SubagentStorage {
    return {
      subagents: storage.subagents ?? [],
      defaultSubagentId: storage.defaultSubagentId ?? null,
    };
  }

  /**
   * キャッシュをクリア
   * @summary キャッシュクリア
   */
  clearCache(): void {
    this.cache = null;
  }
}
