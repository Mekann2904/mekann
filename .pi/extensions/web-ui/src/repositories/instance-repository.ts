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
import { SHARED_DIR } from "../lib/storage.js";
import { join } from "path";
import { readdirSync, readFileSync, existsSync, writeFileSync, renameSync, unlinkSync } from "fs";
import { readJsonState, writeJsonState } from "../../../../lib/storage/sqlite-state-store.js";

/**
 * ハートビート設定
 */
const HEARTBEAT_STALE_MS = 60000; // 60秒

/**
 * インスタンスリポジトリ
 * 
 * 注意: lib/instance-registry.ts と同じファイル形式を使用
 * ファイル形式: Record<number, InstanceInfo> (直接レコード、ラッパーなし)
 */
export class InstanceRepository {
  private readonly filePath: string;

  constructor() {
    this.filePath = join(SHARED_DIR, "instances.json");
  }

  /**
   * ファイルから直接読み込む
   */
  private readAll(): Record<number, InstanceInfo> {
    return readJsonState<Record<number, InstanceInfo>>({
      stateKey: "webui_instances",
      fallbackPath: this.filePath,
      createDefault: () => ({}),
    });
  }

  /**
   * ファイルへ書き込む
   */
  private writeAll(instances: Record<number, InstanceInfo>): void {
    writeJsonState({
      stateKey: "webui_instances",
      value: instances,
      mirrorPath: this.filePath,
    });
  }

  /**
   * 全インスタンスを取得（アクティブのみ）
   */
  findAll(): InstanceInfo[] {
    const instances = this.readAll();
    const now = Date.now();

    // アクティブなインスタンスのみフィルタ
    const active = Object.values(instances).filter(
      (info) => now - info.lastHeartbeat < HEARTBEAT_STALE_MS
    );

    return active;
  }

  /**
   * PIDでインスタンスを検索
   */
  findByPid(pid: number): InstanceInfo | undefined {
    const instances = this.readAll();
    return instances[pid];
  }

  /**
   * インスタンスを登録または更新
   */
  save(info: InstanceInfo): void {
    const instances = this.readAll();
    instances[info.pid] = info;
    this.writeAll(instances);
  }

  /**
   * ハートビートを更新
   */
  updateHeartbeat(pid: number, model?: string): void {
    const instances = this.readAll();
    const existing = instances[pid];

    if (existing) {
      existing.lastHeartbeat = Date.now();
      if (model) {
        existing.model = model;
      }
      this.writeAll(instances);
    }
  }

  /**
   * インスタンスを削除
   */
  delete(pid: number): boolean {
    const instances = this.readAll();

    if (!instances[pid]) {
      return false;
    }

    delete instances[pid];
    this.writeAll(instances);
    return true;
  }

  /**
   * アクティブなインスタンス数を取得
   */
  count(): number {
    return this.findAll().length;
  }
}

/**
 * コンテキスト履歴リポジトリ
 */
export class ContextHistoryRepository {
  private readonly filePath: string;

  constructor(pid: number) {
    this.filePath = join(SHARED_DIR, `context-history-${pid}.json`);
  }

  private historyStateKey(pid: number): string {
    return `webui_context_history:${pid}`;
  }

  /**
   * 履歴を追加
   */
  add(entry: Omit<ContextHistoryEntry, "pid">, pid: number): void {
    const loaded = readJsonState<{ history: ContextHistoryEntry[] }>({
      stateKey: this.historyStateKey(pid),
      fallbackPath: this.filePath,
      createDefault: () => ({ history: [] }),
    });
    let history = loaded.history || [];

    history.push({ ...entry, pid });

    // 最大100件に制限
    if (history.length > 100) {
      history = history.slice(-100);
    }

    writeJsonState({
      stateKey: this.historyStateKey(pid),
      value: { history },
      mirrorPath: this.filePath,
    });
  }

  /**
   * 履歴を取得
   */
  getAll(): ContextHistoryEntry[] {
    const pidMatch = this.filePath.match(/context-history-(\d+)\.json$/);
    const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
    const loaded = readJsonState<{ history: ContextHistoryEntry[] }>({
      stateKey: this.historyStateKey(pid),
      fallbackPath: this.filePath,
      createDefault: () => ({ history: [] }),
    });
    return loaded.history || [];
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
    const knownInstances = readJsonState<Record<number, InstanceInfo>>({
      stateKey: "webui_instances",
      fallbackPath: join(SHARED_DIR, "instances.json"),
      createDefault: () => ({}),
    });
    const knownPids = new Set<number>(Object.keys(knownInstances).map((pid) => Number(pid)));

    for (const file of historyFiles) {
      const match = file.match(/context-history-(\d+)\.json/);
      if (match) {
        const pid = parseInt(match[1], 10);
        knownPids.add(pid);
        const filePath = join(SHARED_DIR, file);
        
        try {
          const content = readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          const history = data.history || [];

          if (history.length > 0) {
            result.push({
              pid,
              cwd: process.cwd(), // TODO: 実際の値を取得
              model: "unknown", // TODO: 実際の値を取得
              history,
            });
          }
        } catch {
          // 読み込み失敗時はスキップ
        }
      }
    }

    for (const pid of knownPids) {
      if (result.some((entry) => entry.pid === pid)) continue;
      const historyData = readJsonState<{ history: ContextHistoryEntry[] }>({
        stateKey: `webui_context_history:${pid}`,
        fallbackPath: join(SHARED_DIR, `context-history-${pid}.json`),
        createDefault: () => ({ history: [] }),
      });
      const history = historyData.history || [];
      if (history.length === 0) continue;
      const instance = knownInstances[pid];
      result.push({
        pid,
        cwd: instance?.cwd || process.cwd(),
        model: instance?.model || "unknown",
        history,
      });
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
