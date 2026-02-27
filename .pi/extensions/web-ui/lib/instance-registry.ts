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
    // Try to acquire lock with timeout
    const maxAttempts = 50;
    const delayMs = 20;

    for (let i = 0; i < maxAttempts; i++) {
      if (this.acquire()) {
        try {
          return fn();
        } finally {
          this.release();
        }
      }
      // Wait and retry
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }

    // If lock acquisition fails, proceed anyway (best effort)
    console.warn("[instance-registry] Could not acquire lock, proceeding without lock");
    return fn();
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

    console.log(`[instance-registry] Registered instance: ${this.pid}`);
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

    console.log(`[instance-registry] Unregistered instance: ${this.pid}`);
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
    console.log(`[server-registry] Registered server: pid=${pid}, port=${port}`);
  }

  /**
   * Unregister server
   */
  static unregister(): void {
    try {
      unlinkSync(SERVER_FILE);
      console.log("[server-registry] Unregistered server");
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
    console.log(`[theme-storage] Saved theme: ${settings.themeId} (${settings.mode})`);
  }
}
