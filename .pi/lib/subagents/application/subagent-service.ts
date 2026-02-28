/**
 * @abdd.meta
 * path: .pi/lib/subagents/application/subagent-service.ts
 * role: サブエージェント操作のユースケース
 * why: サブエージェントの選択、実行、管理のビジネスルールを集約
 * related: ./interfaces.ts, ../domain/subagent-definition.ts
 * public_api: SubagentService
 * invariants: なし
 * side_effects: リポジトリ経由でI/O
 * failure_modes: リポジトリエラー、実行エラー
 * @abdd.explain
 * overview: サブエージェントのアプリケーションサービス
 * what_it_does:
 *   - サブエージェント選択ユースケース
 *   - 実行ユースケース
 *   - 管理ユースケース
 * why_it_exists: ビジネスロジックをインフラストラクチャから分離
 * scope:
 *   in: domain層、interfaces
 *   out: adapters層から呼び出される
 */

import type { SubagentDefinition, SubagentStorage } from "../domain/subagent-definition.js";
import { validateSingleResponsibility } from "../domain/responsibility.js";
import type {
  ISubagentRepository,
  ISubagentExecutor,
  IRuntimeCoordinator,
  SubagentServiceDependencies,
  SubagentSelectionResult,
  SubagentExecutionOptions,
  SubagentExecutionResult,
} from "./interfaces.js";

/**
 * サブエージェントサービス
 * @summary サブエージェントサービス
 */
export class SubagentService {
  private repository: ISubagentRepository;
  private executor: ISubagentExecutor;
  private runtimeCoordinator: IRuntimeCoordinator;

  constructor(deps: SubagentServiceDependencies) {
    this.repository = deps.repository;
    this.executor = deps.executor;
    this.runtimeCoordinator = deps.runtimeCoordinator;
  }

  /**
   * サブエージェントをIDで選択
   * @summary ID選択
   * @param subagentId - サブエージェントID
   * @returns 選択結果
   */
  async selectById(subagentId: string): Promise<SubagentSelectionResult> {
    const storage = await this.repository.load();
    const subagent = storage.subagents.find((s) => s.id === subagentId);

    if (!subagent) {
      return {
        success: false,
        error: `subagent_not_found: ${subagentId}`,
      };
    }

    if (subagent.enabled === false) {
      return {
        success: false,
        error: `subagent_disabled: ${subagentId}`,
      };
    }

    return {
      success: true,
      subagent,
    };
  }

  /**
   * デフォルトサブエージェントを選択
   * @summary デフォルト選択
   * @returns 選択結果
   */
  async selectDefault(): Promise<SubagentSelectionResult> {
    const storage = await this.repository.load();

    if (storage.defaultSubagentId) {
      return this.selectById(storage.defaultSubagentId);
    }

    // 有効な最初のサブエージェントを選択
    const enabledSubagent = storage.subagents.find((s) => s.enabled !== false);
    if (enabledSubagent) {
      return {
        success: true,
        subagent: enabledSubagent,
      };
    }

    return {
      success: false,
      error: "no_enabled_subagents",
    };
  }

  /**
   * 並列実行用のデフォルトサブエージェントを選択
   * @summary 並列選択
   * @param count - 選択数
   * @returns サブエージェント配列
   */
  async selectForParallel(count: number = 2): Promise<SubagentDefinition[]> {
    const storage = await this.repository.load();
    const enabledSubagents = storage.subagents.filter((s) => s.enabled !== false);

    // 優先度に基づいて選択（実装者、レビュアー、テスターを優先）
    const priorityOrder = ["implementer", "reviewer", "tester", "architect", "researcher"];

    const sorted = [...enabledSubagents].sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.id);
      const bIndex = priorityOrder.indexOf(b.id);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    return sorted.slice(0, count);
  }

  /**
   * サブエージェントを実行
   * @summary 実行
   * @param subagentId - サブエージェントID
   * @param task - タスク内容
   * @param options - 実行オプション
   * @returns 実行結果
   */
  async execute(
    subagentId: string,
    task: string,
    options?: SubagentExecutionOptions
  ): Promise<SubagentExecutionResult> {
    // サブエージェントを選択
    const selection = await this.selectById(subagentId);
    if (!selection.success || !selection.subagent) {
      return {
        success: false,
        error: selection.error,
      };
    }

    // 実行許可を取得
    const permit = await this.runtimeCoordinator.acquirePermit(subagentId);
    if (!permit) {
      return {
        success: false,
        error: "runtime_capacity_exceeded",
      };
    }

    try {
      // 実行
      const result = await this.executor.execute(selection.subagent, task, options);
      return result;
    } finally {
      // 許可を解放
      this.runtimeCoordinator.releasePermit(permit);
    }
  }

  /**
   * サブエージェントを登録
   * @summary 登録
   * @param definition - サブエージェント定義
   */
  async register(definition: SubagentDefinition): Promise<void> {
    const storage = await this.repository.load();

    // IDの重複チェック
    if (storage.subagents.some((s) => s.id === definition.id)) {
      throw new Error(`subagent_already_exists: ${definition.id}`);
    }

    storage.subagents.push(definition);
    await this.repository.save(storage);
  }

  /**
   * サブエージェントを更新
   * @summary 更新
   * @param definition - サブエージェント定義
   */
  async update(definition: SubagentDefinition): Promise<void> {
    const storage = await this.repository.load();
    const index = storage.subagents.findIndex((s) => s.id === definition.id);

    if (index === -1) {
      throw new Error(`subagent_not_found: ${definition.id}`);
    }

    storage.subagents[index] = definition;
    await this.repository.save(storage);
  }

  /**
   * サブエージェントを削除
   * @summary 削除
   * @param subagentId - サブエージェントID
   */
  async delete(subagentId: string): Promise<void> {
    const storage = await this.repository.load();
    const index = storage.subagents.findIndex((s) => s.id === subagentId);

    if (index === -1) {
      throw new Error(`subagent_not_found: ${subagentId}`);
    }

    storage.subagents.splice(index, 1);
    await this.repository.save(storage);
  }

  /**
   * すべてのサブエージェントを取得
   * @summary 全取得
   * @returns サブエージェント配列
   */
  async listAll(): Promise<SubagentDefinition[]> {
    const storage = await this.repository.load();
    return storage.subagents;
  }

  /**
   * 責任重複をチェック
   * @summary 責任チェック
   * @returns 責任チェック結果
   */
  async checkResponsibility(): Promise<
    Array<{ subagentId: string; skills: string[]; overlaps: string[] }>
  > {
    const storage = await this.repository.load();
    return validateSingleResponsibility(storage.subagents);
  }
}
