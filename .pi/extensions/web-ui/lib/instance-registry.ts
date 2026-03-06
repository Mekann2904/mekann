/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/lib/instance-registry.ts
 * @role Shared instance registry for multi-instance management
 * @why Enable Web UI to monitor all running pi instances
 * @related server.ts, index.ts
 * @public_api InstanceRegistry, SharedStorage
 * @invariants Registry file must be locked during writes
 * @side_effects Creates ~/.pi-shared directory, writes shared files
 * @failure_modes Permission denied, disk full
 *
 * @abdd.explain
 * @overview Manages registration of pi instances and shared server state
 * @what_it_does Registers/unregisters instances, tracks web server, manages global theme
 * @why_it_exists Allows multiple pi instances to share a single web UI server
 * @scope(in) pid, port, instance metadata
 * @scope(out) ~/.pi-shared/ files
 */

import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import {
  deleteJsonState,
  listJsonStateKeys,
  readJsonState,
  writeJsonState,
} from "../../../lib/storage/sqlite-state-store.js";

/**
 * Instance information stored in registry
 */
export interface InstanceInfo {
  /** Process ID */
  pid: number;
  /** Start timestamp */
  startedAt: number;
  /** Current working directory */
  cwd: string;
  /** Model being used */
  model: string;
  /** Last heartbeat timestamp */
  lastHeartbeat: number;
}

/**
 * Web server information
 */
export interface ServerInfo {
  /** Server process ID */
  pid: number;
  /** Port number */
  port: number;
  /** Start timestamp */
  startedAt: number;
}

/**
 * Global theme settings
 */
export interface ThemeSettings {
  /** Theme ID (e.g., "blue", "dracula") */
  themeId: string;
  /** Mode: "light" or "dark" */
  mode: "light" | "dark";
}

/**
 * Shared storage paths
 */
const SHARED_DIR = join(homedir(), ".pi-shared");
const LOCK_FILE = join(SHARED_DIR, ".lock");
const WEBUI_INSTANCES_STATE_KEY = "webui_instances";
const WEBUI_SERVER_STATE_KEY = "webui_server";
const WEBUI_THEME_STATE_KEY = "webui_theme";

/**
 * Ensure shared directory exists
 */
function ensureSharedDir(): void {
  if (!existsSync(SHARED_DIR)) {
    mkdirSync(SHARED_DIR, { recursive: true });
  }
}

/**
 * Simple file lock for atomic operations
 */
class FileLock {
  private locked = false;

  acquire(): boolean {
    ensureSharedDir();
    try {
      // Try to create lock file exclusively
      writeFileSync(LOCK_FILE, `${process.pid}`, { flag: "wx" });
      this.locked = true;
      return true;
    } catch {
      return false;
    }
  }

  release(): void {
    if (this.locked) {
      try {
        unlinkSync(LOCK_FILE);
      } catch {
        // Ignore if already removed
      }
      this.locked = false;
    }
  }

  withLock<T>(fn: () => T): T {
    // Try to acquire lock with brief retry
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.acquire()) {
        try {
          return fn();
        } finally {
          this.release();
        }
      }
      // BUG-3修正: ビジーウェイトをAtomics.waitに置き換え
      if (attempt < 2) {
        sleepSync(10);
      }
    }
    console.warn("[instance-registry] Could not acquire lock after 3 attempts, proceeding without lock");
    return fn();
  }
}

/**
 * 同期的スリープ（ビジーウェイト回避）
 * Atomics.waitを使用してCPUサイクルを消費しない
 */
function sleepSync(ms: number): void {
  try {
    const buffer = new SharedArrayBuffer(4);
    const view = new Int32Array(buffer);
    Atomics.wait(view, 0, 0, ms);
  } catch {
    // SharedArrayBufferが利用できない環境（ブラウザ等）のフォールバック
    // 注：この環境ではビジーウェイトを使用せず、即座に再試行
  }
}

const lock = new FileLock();

/**
 * Read JSON file safely
 */
function readRegistryState<T>(stateKey: string, defaultValue: T): T {
  return readJsonState<T>({
    stateKey,
    createDefault: () => defaultValue,
  });
}

/**
 * Write registry state
 */
function writeRegistryState<T>(stateKey: string, data: T): void {
  writeJsonState({
    stateKey,
    value: data,
  });
}

function deleteRegistryState(stateKey: string): void {
  deleteJsonState(stateKey);
}

/**
 * Instance Registry - manages pi instance registration
 */
export class InstanceRegistry {
  private pid: number;
  private cwd: string;
  private model: string = "unknown";
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cwd: string) {
    this.pid = process.pid;
    this.cwd = cwd;
  }

  /**
   * Set model name
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * @summary Register or re-register this instance
   * @description Idempotent - safe to call multiple times. Clears existing heartbeat before re-registering.
   */
  register(): void {
    // Clear existing heartbeat interval (handles hot reload scenario)
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    lock.withLock(() => {
      const instances = readRegistryState<Record<number, InstanceInfo>>(WEBUI_INSTANCES_STATE_KEY, {});

      instances[this.pid] = {
        pid: this.pid,
        startedAt: Date.now(),
        cwd: this.cwd,
        model: this.model,
        lastHeartbeat: Date.now(),
      };

      writeRegistryState(WEBUI_INSTANCES_STATE_KEY, instances);
    });

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, 5000);

    // プロセス終了をブロックしないようにunref
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Update heartbeat
   */
  private updateHeartbeat(): void {
    lock.withLock(() => {
      const instances = readRegistryState<Record<number, InstanceInfo>>(WEBUI_INSTANCES_STATE_KEY, {});

      if (instances[this.pid]) {
        instances[this.pid].lastHeartbeat = Date.now();
        instances[this.pid].model = this.model;
        writeRegistryState(WEBUI_INSTANCES_STATE_KEY, instances);
      }
    });
  }

  /**
   * Unregister this instance
   */
  unregister(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    lock.withLock(() => {
      const instances = readRegistryState<Record<number, InstanceInfo>>(WEBUI_INSTANCES_STATE_KEY, {});
      delete instances[this.pid];
      writeRegistryState(WEBUI_INSTANCES_STATE_KEY, instances);
    });
  }

  /**
   * Get all registered instances
   */
  static getAll(): InstanceInfo[] {
    return lock.withLock(() => {
      const instances = readRegistryState<Record<number, InstanceInfo>>(WEBUI_INSTANCES_STATE_KEY, {});
      const now = Date.now();

      const STALE_THRESHOLD_MS = 60000; // 60 seconds (12 missed heartbeats at 5s interval)

      // Filter out stale instances
      const activeInstances = Object.values(instances).filter(
        (info) => now - info.lastHeartbeat < STALE_THRESHOLD_MS
      );

      // Clean up stale entries
      const activePids = new Set(activeInstances.map((i) => i.pid));
      let hasStale = false;

      for (const pid of Object.keys(instances)) {
        if (!activePids.has(Number(pid))) {
          delete instances[Number(pid)];
          hasStale = true;
        }
      }

      if (hasStale) {
        writeRegistryState(WEBUI_INSTANCES_STATE_KEY, instances);
      }

      return activeInstances;
    });
  }

  /**
   * Get instance count
   */
  static getCount(): number {
    return InstanceRegistry.getAll().length;
  }
}

/**
 * Server Registry - manages web server state
 */
export class ServerRegistry {
  /**
   * Check if a server is already running
   */
  static isRunning(): ServerInfo | null {
    const serverInfo = readRegistryState<ServerInfo | null>(WEBUI_SERVER_STATE_KEY, null);

    if (!serverInfo) {
      return null;
    }

    // Check if the process is actually running
    try {
      // Send signal 0 to check if process exists
      process.kill(serverInfo.pid, 0);
      return serverInfo;
    } catch {
      // Process not running, clean up
      deleteRegistryState(WEBUI_SERVER_STATE_KEY);
      return null;
    }
  }

  /**
   * Register server
   */
  static register(pid: number, port: number): void {
    const serverInfo: ServerInfo = {
      pid,
      port,
      startedAt: Date.now(),
    };
    writeRegistryState(WEBUI_SERVER_STATE_KEY, serverInfo);
  }

  /**
   * Unregister server
   */
  static unregister(): void {
    deleteRegistryState(WEBUI_SERVER_STATE_KEY);
  }
}

/**
 * Theme Storage - manages global theme settings
 */
export class ThemeStorage {
  /**
   * Get theme settings
   */
  static get(): ThemeSettings {
    return readRegistryState<ThemeSettings>(WEBUI_THEME_STATE_KEY, {
      themeId: "blue",
      mode: "dark",
    });
  }

  /**
   * Save theme settings
   */
  static set(settings: ThemeSettings): void {
    writeRegistryState(WEBUI_THEME_STATE_KEY, settings);
  }
}

/**
 * @summary コンテキスト使用量履歴エントリ
 */
export interface ContextHistoryEntry {
  /** タイムスタンプ */
  timestamp: string;
  /** 入力トークン数 */
  input: number;
  /** 出力トークン数 */
  output: number;
  /** インスタンスのプロセスID */
  pid: number;
}

/**
 * @summary インスタンスごとのコンテキスト履歴情報
 */
export interface InstanceContextHistory {
  /** プロセスID */
  pid: number;
  /** 作業ディレクトリ */
  cwd: string;
  /** モデル名 */
  model: string;
  /** 履歴エントリ */
  history: ContextHistoryEntry[];
}

const MAX_CONTEXT_HISTORY = 100;

/**
 * @summary コンテキスト履歴ストレージの設定オプション
 */
export interface ContextHistoryStorageOptions {
  /** バッファサイズ（デフォルト: 5）。子プロセス向けには1-2を推奨 */
  maxBufferSize?: number;
  /** タイムアウトベースの自動フラッシュ間隔（ms）。0で無効 */
  flushIntervalMs?: number;
  /** 子プロセスモード（短命プロセス向けの最適化を有効化） */
  isChildProcess?: boolean;
}

/**
 * @summary コンテキスト履歴ストレージ - 各インスタンスの履歴を共有ディレクトリに保存
 * @description バッファリングとタイムアウトベースのフラッシュでパフォーマンス最適化
 */
export class ContextHistoryStorage {
  private buffer: ContextHistoryEntry[] = [];
  private pid: number;
  private maxBufferSize: number;
  private flushIntervalMs: number;
  private isChildProcess: boolean;
  private historyStateKey: string;
  private flushHandler: () => void;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isDisposed = false;

  constructor(pid: number = process.pid, options: ContextHistoryStorageOptions = {}) {
    this.pid = pid;
    this.isChildProcess = options.isChildProcess ?? false;

    // 子プロセス向けの最適化: バッファサイズを小さく
    this.maxBufferSize = options.maxBufferSize ?? (this.isChildProcess ? 2 : 5);

    // タイムアウトベースのフラッシュ（子プロセス向けには短めに）
    this.flushIntervalMs = options.flushIntervalMs ?? (this.isChildProcess ? 1000 : 5000);

    this.historyStateKey = `webui_context_history:${pid}`;

    // プロセス終了時にバッファをフラッシュ
    this.flushHandler = () => this.flush();
    process.on("beforeExit", this.flushHandler);
    process.on("SIGINT", this.flushHandler);
    process.on("SIGTERM", this.flushHandler);
    // 子プロセス向けの追加ハンドラ
    process.on("exit", this.flushHandler);

    // タイムアウトベースの自動フラッシュを開始
    if (this.flushIntervalMs > 0) {
      this.startFlushTimer();
    }
  }

  /**
   * @summary タイムアウトベースのフラッシュタイマーを開始
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);

    // プログラム終了をブロックしないようにrefを外す
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * @summary 履歴エントリを追加（バッファリングあり）
   */
  add(entry: Omit<ContextHistoryEntry, "pid">): void {
    const fullEntry: ContextHistoryEntry = {
      ...entry,
      pid: this.pid,
    };

    this.buffer.push(fullEntry);

    // バッファサイズに達したら書き込み
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  /**
   * @summary このストレージのPIDを取得
   */
  getPid(): number {
    return this.pid;
  }

  /**
   * @summary バッファを強制的に書き込み
   */
  flush(): void {
    if (this.isDisposed) return;
    this.flushInternal();
  }

  /**
   * @summary クリーンアップ（イベントリスナー削除、タイマー停止）
   */
  dispose(): void {
    if (this.isDisposed) return;

    // 先にフラッシュしてからisDisposedを設定
    this.flushInternal();
    this.isDisposed = true;

    // タイマーを停止
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // イベントリスナーを削除
    process.off("beforeExit", this.flushHandler);
    process.off("SIGINT", this.flushHandler);
    process.off("SIGTERM", this.flushHandler);
    process.off("exit", this.flushHandler);
  }

  /**
   * @summary バッファを強制的に書き込み（内部用、isDisposedチェックなし）
   */
  private flushInternal(): void {
    if (this.buffer.length === 0) return;

    ensureSharedDir();

    // 既存の履歴を読み込み
    const existingWrapper = readRegistryState<{ history: ContextHistoryEntry[] }>(
      this.historyStateKey,
      { history: [] },
    );
    const existing = Array.isArray(existingWrapper.history) ? existingWrapper.history : [];

    // 新しいエントリを追加
    const updated = [...existing, ...this.buffer];

    // 最大件数に制限
    const trimmed = updated.slice(-MAX_CONTEXT_HISTORY);

    writeRegistryState(this.historyStateKey, { history: trimmed });
    this.buffer = [];
  }

  /**
   * @summary 現在のバッファサイズを取得（テスト用）
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * @summary 子プロセスモードかどうかを取得（テスト用）
   */
  getChildProcessMode(): boolean {
    return this.isChildProcess;
  }

  /**
   * @summary 全インスタンスの履歴を取得
   */
  static getAllInstances(): Map<number, ContextHistoryEntry[]> {
    const result = new Map<number, ContextHistoryEntry[]>();

    const historyKeys = listJsonStateKeys("webui_context_history:");
    for (const stateKey of historyKeys) {
      const match = stateKey.match(/^webui_context_history:(\d+)$/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const historyWrapper = readJsonState<{ history: ContextHistoryEntry[] }>({
          stateKey,
          createDefault: () => ({ history: [] }),
        });
        const history = historyWrapper.history || [];
        if (history.length > 0) {
          result.set(pid, history);
        }
      }
    }

    return result;
  }

  /**
   * @summary アクティブなインスタンスのコンテキスト履歴を取得
   */
  static getActiveInstancesHistory(): InstanceContextHistory[] {
    const instances = InstanceRegistry.getAll();
    const allHistory = ContextHistoryStorage.getAllInstances();
    const result: InstanceContextHistory[] = [];

    for (const instance of instances) {
      const history = allHistory.get(instance.pid) ?? [];
      result.push({
        pid: instance.pid,
        cwd: instance.cwd,
        model: instance.model,
        history,
      });
    }

    return result;
  }

  /**
   * @summary 古い履歴ファイルをクリーンアップ
   */
  static cleanup(): void {
    const instances = InstanceRegistry.getAll();
    const activePids = new Set(instances.map((i) => i.pid));

    const historyKeys = listJsonStateKeys("webui_context_history:");
    for (const stateKey of historyKeys) {
      const match = stateKey.match(/^webui_context_history:(\d+)$/);
      if (match) {
        const pid = parseInt(match[1], 10);
        if (!activePids.has(pid)) {
          deleteJsonState(stateKey);
        }
      }
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * @summary 子プロセス向けに最適化されたストレージを作成
 * @description 短命な子プロセス向けに小さなバッファと短いフラッシュ間隔を設定
 * @param parentPid - 親プロセスのPID（履歴を書き込む対象）
 * @param options - 追加オプション
 */
export function createChildProcessStorage(
  parentPid: number,
  options: Omit<ContextHistoryStorageOptions, "isChildProcess"> = {}
): ContextHistoryStorage {
  return new ContextHistoryStorage(parentPid, {
    ...options,
    isChildProcess: true,
    maxBufferSize: options.maxBufferSize ?? 2,
    flushIntervalMs: options.flushIntervalMs ?? 1000,
  });
}

/**
 * @summary context-reporter.tsとの互換性のための型エイリアス
 */
export type ContextEntry = ContextHistoryEntry;
