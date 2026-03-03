/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/repositories/instance-repository.ts
 * @role インスタンスデータの永続化層
 * @why インスタンス状態の共有と管理
 * @related services/instance-service.ts, lib/storage.ts
 * @public_api InstanceRepository
 * @invariants PIDは一意、ハートビートは定期的に更新
 * @side_effects ~/.pi-shared/ ファイルへの読み書き
 * @failure_modes ファイルシステムエラー
 *
 * @abdd.explain
 * @overview piインスタンスの登録・検索・削除
 * @what_it_does インスタンスのCRUD、ハートビート管理
 * @why_it_exists 複数インスタンスの状態共有
 * @scope(in) InstanceInfo 型
 * @scope(out) JSON ファイル
 */

import type { InstanceInfo, ContextHistoryEntry, InstanceContextHistory } from "../schemas/instance.schema.js";
import { JsonStorage, SHARED_DIR } from "../lib/storage.js";
import { join } from "path";
import { readdirSync } from "fs";

/**
 * インスタンスストレージのデータ構造
 */
interface InstanceStorage {
  instances: Record<number, InstanceInfo>;
  version: number;
}

/**
 * ハートビート設定
 */
const HEARTBEAT_STALE_MS = 60000; // 60秒

/**
 * インスタンスリポジトリ
 */
export class InstanceRepository {
  private readonly storage: JsonStorage<InstanceStorage>;

  constructor() {
    this.storage = new JsonStorage<InstanceStorage>(
      "instances.json",
      { instances: {}, version: 1 },
      { dataDir: SHARED_DIR }
    );
  }

  /**
   * 全インスタンスを取得（アクティブのみ）
   */
  findAll(): InstanceInfo[] {
    const { instances } = this.storage.read();
    const now = Date.now();

    // アクティブなインスタンスのみフィルタ
    const active = Object.values(instances).filter(
      (info) => now - info.lastHeartbeat < HEARTBEAT_STALE_MS
    );

    // 古いエントリをクリーンアップ
    this.cleanup(instances, active);

    return active;
  }

  /**
   * PIDでインスタンスを検索
   */
  findByPid(pid: number): InstanceInfo | undefined {
    const { instances } = this.storage.read();
    return instances[pid];
  }

  /**
   * インスタンスを登録または更新
   */
  save(info: InstanceInfo): void {
    const data = this.storage.read();
    data.instances[info.pid] = info;
    this.storage.write(data);
  }

  /**
   * ハートビートを更新
   */
  updateHeartbeat(pid: number, model?: string): void {
    const data = this.storage.read();
    const existing = data.instances[pid];

    if (existing) {
      existing.lastHeartbeat = Date.now();
      if (model) {
        existing.model = model;
      }
      this.storage.write(data);
    }
  }

  /**
   * インスタンスを削除
   */
  delete(pid: number): boolean {
    const data = this.storage.read();

    if (!data.instances[pid]) {
      return false;
    }

    delete data.instances[pid];
    this.storage.write(data);
    return true;
  }

  /**
   * アクティブなインスタンス数を取得
   */
  count(): number {
    return this.findAll().length;
  }

  /**
   * 古いエントリをクリーンアップ
   */
  private cleanup(instances: Record<number, InstanceInfo>, active: InstanceInfo[]): void {
    const activePids = new Set(active.map((i) => i.pid));
    let hasStale = false;

    for (const pid of Object.keys(instances)) {
      if (!activePids.has(Number(pid))) {
        delete instances[Number(pid)];
        hasStale = true;
      }
    }

    if (hasStale) {
      this.storage.write({ instances, version: 1 });
    }
  }
}

/**
 * コンテキスト履歴リポジトリ
 */
export class ContextHistoryRepository {
  private readonly storage: JsonStorage<{ history: ContextHistoryEntry[] }>;

  constructor(pid: number) {
    this.storage = new JsonStorage(
      `context-history-${pid}.json`,
      { history: [] },
      { dataDir: SHARED_DIR }
    );
  }

  /**
   * 履歴を追加
   */
  add(entry: Omit<ContextHistoryEntry, "pid">, pid: number): void {
    const data = this.storage.read();
    data.history.push({ ...entry, pid });

    // 最大100件に制限
    if (data.history.length > 100) {
      data.history = data.history.slice(-100);
    }

    this.storage.write(data);
  }

  /**
   * 履歴を取得
   */
  getAll(): ContextHistoryEntry[] {
    return this.storage.read().history;
  }

  /**
   * 全インスタンスの履歴を取得
   */
  static getAllInstances(): InstanceContextHistory[] {
    const files = readdirSync(SHARED_DIR);
    const historyFiles = files.filter((f) =>
      f.startsWith("context-history-") && f.endsWith(".json")
    );

    const result: InstanceContextHistory[] = [];

    for (const file of historyFiles) {
      const match = file.match(/context-history-(\d+)\.json/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const storage = new JsonStorage<{ history: ContextHistoryEntry[] }>(
          file,
          { history: [] },
          { dataDir: SHARED_DIR }
        );
        const history = storage.read().history;

        if (history.length > 0) {
          result.push({
            pid,
            cwd: process.cwd(), // TODO: 実際の値を取得
            model: "unknown", // TODO: 実際の値を取得
            history,
          });
        }
      }
    }

    return result;
  }
}

/**
 * シングルトン
 */
let instanceRepo: InstanceRepository | null = null;

export function getInstanceRepository(): InstanceRepository {
  if (!instanceRepo) {
    instanceRepo = new InstanceRepository();
  }
  return instanceRepo;
}
