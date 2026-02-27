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
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawn } from "child_process";

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
const INSTANCES_FILE = join(SHARED_DIR, "instances.json");
const SERVER_FILE = join(SHARED_DIR, "web-ui-server.json");
const THEME_FILE = join(SHARED_DIR, "theme.json");
const LOCK_FILE = join(SHARED_DIR, ".lock");

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
    // NOTE:
    // 以前は Atomics.wait を使った同期リトライでロック取得を待っていたが、
    // event loop を最大約1秒ブロックし、TUI入力遅延の原因になる。
    // 入力体験を優先し、ロックが取れない場合は即座に best-effort で継続する。
    if (!this.acquire()) {
      console.warn("[instance-registry] Could not acquire lock, proceeding without lock");
      return fn();
    }
    try {
      return fn();
    } finally {
      this.release();
    }
  }
}

const lock = new FileLock();

/**
 * Read JSON file safely
 */
function readJsonFile<T>(path: string, defaultValue: T): T {
  try {
    if (!existsSync(path)) {
      return defaultValue;
    }
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return defaultValue;
  }
}

/**
 * Write JSON file atomically
 */
function writeJsonFile<T>(path: string, data: T): void {
  ensureSharedDir();
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2));
  // Atomic rename
  try {
    const fs = require("fs");
    fs.renameSync(tempPath, path);
  } catch {
    // Fallback for cross-device links
    writeFileSync(path, JSON.stringify(data, null, 2));
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore
    }
  }
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
   * Register this instance
   */
  register(): void {
    // 念のため既存タイマーを止めてから再登録（reload時の重複防止）
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    lock.withLock(() => {
      const instances = readJsonFile<Record<number, InstanceInfo>>(INSTANCES_FILE, {});

      instances[this.pid] = {
        pid: this.pid,
        startedAt: Date.now(),
        cwd: this.cwd,
        model: this.model,
        lastHeartbeat: Date.now(),
      };

      writeJsonFile(INSTANCES_FILE, instances);
    });

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, 5000);
  }

  /**
   * Update heartbeat
   */
  private updateHeartbeat(): void {
    lock.withLock(() => {
      const instances = readJsonFile<Record<number, InstanceInfo>>(INSTANCES_FILE, {});

      if (instances[this.pid]) {
        instances[this.pid].lastHeartbeat = Date.now();
        instances[this.pid].model = this.model;
        writeJsonFile(INSTANCES_FILE, instances);
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
      const instances = readJsonFile<Record<number, InstanceInfo>>(INSTANCES_FILE, {});
      delete instances[this.pid];
      writeJsonFile(INSTANCES_FILE, instances);
    });
  }

  /**
   * Get all registered instances
   */
  static getAll(): InstanceInfo[] {
    return lock.withLock(() => {
      const instances = readJsonFile<Record<number, InstanceInfo>>(INSTANCES_FILE, {});
      const now = Date.now();

      // Filter out stale instances (no heartbeat for 30 seconds)
      const activeInstances = Object.values(instances).filter(
        (info) => now - info.lastHeartbeat < 30000
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
        writeJsonFile(INSTANCES_FILE, instances);
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
    const serverInfo = readJsonFile<ServerInfo | null>(SERVER_FILE, null);

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
      try {
        unlinkSync(SERVER_FILE);
      } catch {
        // Ignore
      }
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
    writeJsonFile(SERVER_FILE, serverInfo);
  }

  /**
   * Unregister server
   */
  static unregister(): void {
    try {
      unlinkSync(SERVER_FILE);
    } catch {
      // Ignore
    }
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
    return readJsonFile<ThemeSettings>(THEME_FILE, {
      themeId: "blue",
      mode: "dark",
    });
  }

  /**
   * Save theme settings
   */
  static set(settings: ThemeSettings): void {
    writeJsonFile(THEME_FILE, settings);
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

const CONTEXT_HISTORY_DIR = SHARED_DIR;
const MAX_CONTEXT_HISTORY = 100;

/**
 * @summary コンテキスト履歴ストレージ - 各インスタンスの履歴を共有ディレクトリに保存
 * @description バッファリング（5件単位）でパフォーマンス最適化
 */
export class ContextHistoryStorage {
  private buffer: ContextHistoryEntry[] = [];
  private pid: number;
  private maxBufferSize = 5;
  private historyFile: string;
  private flushHandler: () => void;

  constructor(pid: number = process.pid) {
    this.pid = pid;
    this.historyFile = join(CONTEXT_HISTORY_DIR, `context-history-${pid}.json`);

    // プロセス終了時にバッファをフラッシュ
    this.flushHandler = () => this.flush();
    process.on("beforeExit", this.flushHandler);
    process.on("SIGINT", this.flushHandler);
    process.on("SIGTERM", this.flushHandler);
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
   * @summary バッファを強制的に書き込み
   */
  flush(): void {
    if (this.buffer.length === 0) return;

    ensureSharedDir();

    // 既存の履歴を読み込み
    const existing = readJsonFile<ContextHistoryEntry[]>(this.historyFile, []);

    // 新しいエントリを追加
    const updated = [...existing, ...this.buffer];

    // 最大件数に制限
    const trimmed = updated.slice(-MAX_CONTEXT_HISTORY);

    writeJsonFile(this.historyFile, trimmed);
    this.buffer = [];
  }

  /**
   * @summary クリーンアップ（イベントリスナー削除）
   */
  dispose(): void {
    this.flush();
    process.off("beforeExit", this.flushHandler);
    process.off("SIGINT", this.flushHandler);
    process.off("SIGTERM", this.flushHandler);
  }

  /**
   * @summary 全インスタンスの履歴を取得
   */
  static getAllInstances(): Map<number, ContextHistoryEntry[]> {
    const result = new Map<number, ContextHistoryEntry[]>();

    ensureSharedDir();

    // ディレクトリ内の context-history-*.json ファイルを検索
    const fs = require("fs");
    const files = fs.readdirSync(CONTEXT_HISTORY_DIR);
    const historyFiles = files.filter((f: string) =>
      f.startsWith("context-history-") && f.endsWith(".json")
    );

    for (const file of historyFiles) {
      const match = file.match(/context-history-(\d+)\.json/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const filePath = join(CONTEXT_HISTORY_DIR, file);
        const history = readJsonFile<ContextHistoryEntry[]>(filePath, []);
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

    ensureSharedDir();

    const fs = require("fs");
    const files = fs.readdirSync(CONTEXT_HISTORY_DIR);
    const historyFiles = files.filter((f: string) =>
      f.startsWith("context-history-") && f.endsWith(".json")
    );

    for (const file of historyFiles) {
      const match = file.match(/context-history-(\d+)\.json/);
      if (match) {
        const pid = parseInt(match[1], 10);
        if (!activePids.has(pid)) {
          // アクティブでないインスタンスの履歴を削除
          try {
            unlinkSync(join(CONTEXT_HISTORY_DIR, file));
          } catch {
            // Ignore errors
          }
        }
      }
    }
  }
}
