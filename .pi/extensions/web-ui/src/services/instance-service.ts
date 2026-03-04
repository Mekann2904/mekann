/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/services/instance-service.ts
 * @role インスタンス関連のビジネスロジック
 * @why インスタンス管理のドメインロジック
 * @related repositories/instance-repository.ts, routes/instances.ts
 * @public_api InstanceService
 * @invariants ハートビートは自動更新
 * @side_effects リポジトリ経由でファイル操作
 * @failure_modes リポジトリエラー
 *
 * @abdd.explain
 * @overview piインスタンスの状態管理サービス
 * @what_it_does インスタンス登録・ハートビート・統計
 * @why_it_exists ビジネスロジックの分離
 * @scope(in) InstanceInfo
 * @scope(out) 統計・履歴データ
 */

import type { InstanceInfo, InstanceStats, InstanceContextHistory } from "../schemas/instance.schema.js";
import { InstanceRepository, ContextHistoryRepository, getInstanceRepository } from "../repositories/instance-repository.js";

/**
 * インスタンスサービス
 */
export class InstanceService {
  private readonly repository: InstanceRepository;

  constructor(repository: InstanceRepository = getInstanceRepository()) {
    this.repository = repository;
  }

  /**
   * 全インスタンスを取得
   */
  list(): InstanceInfo[] {
    return this.repository.findAll();
  }

  /**
   * PIDでインスタンスを取得
   */
  getByPid(pid: number): InstanceInfo | null {
    return this.repository.findByPid(pid) ?? null;
  }

  /**
   * インスタンスを登録
   */
  register(pid: number, cwd: string, model: string): InstanceInfo {
    const now = Date.now();
    const info: InstanceInfo = {
      pid,
      startedAt: now,
      cwd,
      model,
      lastHeartbeat: now,
    };

    this.repository.save(info);
    return info;
  }

  /**
   * ハートビートを送信
   */
  heartbeat(pid: number, model?: string): void {
    this.repository.updateHeartbeat(pid, model);
  }

  /**
   * インスタンスを削除
   */
  unregister(pid: number): boolean {
    return this.repository.delete(pid);
  }

  /**
   * 統計情報を取得
   */
  getStats(): InstanceStats {
    const instances = this.repository.findAll();
    const histories = ContextHistoryRepository.getAllInstances();

    // 総コンテキスト使用量
    let totalInput = 0;
    let totalOutput = 0;

    for (const h of histories) {
      for (const entry of h.history) {
        totalInput += entry.input;
        totalOutput += entry.output;
      }
    }

    // 平均コンテキスト使用量
    const instanceCount = instances.length || 1;
    const avgInput = totalInput / instanceCount;
    const avgOutput = totalOutput / instanceCount;

    return {
      activeCount: instances.length,
      totalContextUsage: {
        input: totalInput,
        output: totalOutput,
      },
      avgContextUsage: {
        input: avgInput,
        output: avgOutput,
      },
    };
  }

  /**
   * コンテキスト履歴を取得
   */
  getContextHistory(): InstanceContextHistory[] {
    return ContextHistoryRepository.getAllInstances();
  }

  /**
   * インスタンス数を取得
   */
  count(): number {
    return this.repository.count();
  }
}

/**
 * シングルトン
 */
let instance: InstanceService | null = null;

export function getInstanceService(): InstanceService {
  if (!instance) {
    instance = new InstanceService();
  }
  return instance;
}
