/**
 * Cross-Instance Coordinator
 *
 * Coordinates LLM parallelism limits across multiple pi instances.
 * Uses file-based locking and heartbeat to detect active instances.
 *
 * Directory structure:
 * ~/.pi/runtime/
 * ├── instances/
 * │   ├── {sessionId}-{pid}.lock
 * │   └── ...
 * └── coordinator.json
 */

import { homedir } from "node:os";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pid } from "node:process";

// ============================================================================
// Types
// ============================================================================

export interface InstanceInfo {
  instanceId: string;
  pid: number;
  sessionId: string;
  startedAt: string;
  lastHeartbeat: string;
  cwd: string;
}

export interface CoordinatorConfig {
  totalMaxLlm: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export interface CoordinatorState {
  myInstanceId: string;
  mySessionId: string;
  config: CoordinatorConfig;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: CoordinatorConfig = {
  totalMaxLlm: 6,  // GLMの経験則に基づく
  heartbeatIntervalMs: 15_000,  // 15秒ごとにハートビート
  heartbeatTimeoutMs: 60_000,  // 60秒更新なし = 死亡とみなす
};

const COORDINATOR_DIR = join(homedir(), ".pi", "runtime");
const INSTANCES_DIR = join(COORDINATOR_DIR, "instances");
const CONFIG_FILE = join(COORDINATOR_DIR, "coordinator.json");

// ============================================================================
// State
// ============================================================================

let state: CoordinatorState | null = null;

// ============================================================================
// Utilities
// ============================================================================

function ensureDirs(): void {
  if (!existsSync(COORDINATOR_DIR)) {
    mkdirSync(COORDINATOR_DIR, { recursive: true });
  }
  if (!existsSync(INSTANCES_DIR)) {
    mkdirSync(INSTANCES_DIR, { recursive: true });
  }
}

function generateInstanceId(sessionId: string): string {
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `sess-${sessionId.slice(0, 8)}-pid${pid}-${timestamp}-${randomSuffix}`;
}

function parseLockFile(filename: string): InstanceInfo | null {
  try {
    const content = readFileSync(join(INSTANCES_DIR, filename), "utf-8");
    const parsed = JSON.parse(content) as InstanceInfo;
    return parsed;
  } catch {
    return null;
  }
}

function isInstanceAlive(info: InstanceInfo, nowMs: number, timeoutMs: number): boolean {
  const lastHeartbeat = new Date(info.lastHeartbeat).getTime();
  return nowMs - lastHeartbeat < timeoutMs;
}

function loadConfig(): CoordinatorConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(content);
      return {
        totalMaxLlm: parsed.totalMaxLlm ?? DEFAULT_CONFIG.totalMaxLlm,
        heartbeatIntervalMs: parsed.heartbeatIntervalMs ?? DEFAULT_CONFIG.heartbeatIntervalMs,
        heartbeatTimeoutMs: parsed.heartbeatTimeoutMs ?? DEFAULT_CONFIG.heartbeatTimeoutMs,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Register this pi instance and start heartbeat.
 * Must be called once at startup.
 *
 * @param sessionId - pi session ID
 * @param cwd - Current working directory
 * @param configOverrides - Optional config overrides
 */
export function registerInstance(
  sessionId: string,
  cwd: string,
  configOverrides?: Partial<CoordinatorConfig>,
): void {
  if (state) {
    // Already registered, just update heartbeat
    updateHeartbeat();
    return;
  }

  ensureDirs();

  const config = { ...DEFAULT_CONFIG, ...configOverrides, ...loadConfig(), ...configOverrides };
  const instanceId = generateInstanceId(sessionId);
  const now = new Date().toISOString();

  const info: InstanceInfo = {
    instanceId,
    pid,
    sessionId,
    startedAt: now,
    lastHeartbeat: now,
    cwd,
  };

  // Write initial lock file
  const lockFile = join(INSTANCES_DIR, `${instanceId}.lock`);
  writeFileSync(lockFile, JSON.stringify(info, null, 2));

  // Start heartbeat
  const heartbeatTimer = setInterval(() => {
    updateHeartbeat();
    cleanupDeadInstances();
  }, config.heartbeatIntervalMs);

  // Don't prevent process exit
  heartbeatTimer.unref();

  state = {
    myInstanceId: instanceId,
    mySessionId: sessionId,
    config,
    heartbeatTimer,
  };
}

/**
 * Unregister this pi instance.
 * Should be called on graceful shutdown.
 */
export function unregisterInstance(): void {
  if (!state) return;

  // Stop heartbeat
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer);
  }

  // Remove lock file
  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  } catch {
    // ignore
  }

  state = null;
}

/**
 * Update heartbeat for this instance.
 */
export function updateHeartbeat(): void {
  if (!state) return;

  try {
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    const content = readFileSync(lockFile, "utf-8");
    const info = JSON.parse(content) as InstanceInfo;
    info.lastHeartbeat = new Date().toISOString();
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  } catch {
    // If lock file is gone, recreate it
    ensureDirs();
    const info: InstanceInfo = {
      instanceId: state.myInstanceId,
      pid,
      sessionId: state.mySessionId,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      cwd: process.cwd(),
    };
    const lockFile = join(INSTANCES_DIR, `${state.myInstanceId}.lock`);
    writeFileSync(lockFile, JSON.stringify(info, null, 2));
  }
}

/**
 * Remove dead instance lock files.
 * Called periodically during heartbeat.
 */
export function cleanupDeadInstances(): void {
  if (!state) return;

  ensureDirs();
  const nowMs = Date.now();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  for (const file of files) {
    const info = parseLockFile(file);
    if (!info) {
      // Corrupted lock file, remove it
      try {
        unlinkSync(join(INSTANCES_DIR, file));
      } catch {
        // ignore
      }
      continue;
    }

    // Skip self
    if (info.instanceId === state.myInstanceId) continue;

    // Remove dead instances
    if (!isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      try {
        unlinkSync(join(INSTANCES_DIR, file));
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Get count of active pi instances.
 *
 * @returns Number of active instances (minimum 1)
 */
export function getActiveInstanceCount(): number {
  if (!state) {
    // Not registered yet, assume single instance
    return 1;
  }

  ensureDirs();
  const nowMs = Date.now();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  let count = 0;
  for (const file of files) {
    const info = parseLockFile(file);
    if (info && isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      count++;
    }
  }

  return Math.max(1, count);
}

/**
 * Get list of active instances.
 *
 * @returns Array of active instance info
 */
export function getActiveInstances(): InstanceInfo[] {
  if (!state) {
    return [];
  }

  ensureDirs();
  const nowMs = Date.now();
  const files = readdirSync(INSTANCES_DIR).filter((f) => f.endsWith(".lock"));

  const instances: InstanceInfo[] = [];
  for (const file of files) {
    const info = parseLockFile(file);
    if (info && isInstanceAlive(info, nowMs, state.config.heartbeatTimeoutMs)) {
      instances.push(info);
    }
  }

  return instances;
}

/**
 * Get parallelism limit for this instance.
 *
 * Formula: floor(totalMaxLlm / activeInstanceCount)
 *
 * @returns Maximum parallel LLM calls for this instance
 */
export function getMyParallelLimit(): number {
  if (!state) {
    return 1;
  }

  const activeCount = getActiveInstanceCount();
  return Math.max(1, Math.floor(state.config.totalMaxLlm / activeCount));
}

/**
 * Get detailed status for debugging.
 */
export function getCoordinatorStatus(): {
  registered: boolean;
  myInstanceId: string | null;
  activeInstanceCount: number;
  myParallelLimit: number;
  config: CoordinatorConfig | null;
  instances: InstanceInfo[];
} {
  if (!state) {
    return {
      registered: false,
      myInstanceId: null,
      activeInstanceCount: 1,
      myParallelLimit: DEFAULT_CONFIG.totalMaxLlm,
      config: null,
      instances: [],
    };
  }

  const activeCount = getActiveInstanceCount();
  const myLimit = getMyParallelLimit();

  return {
    registered: true,
    myInstanceId: state.myInstanceId,
    activeInstanceCount: activeCount,
    myParallelLimit: myLimit,
    config: state.config,
    instances: getActiveInstances(),
  };
}

/**
 * Check if coordinator is initialized.
 */
export function isCoordinatorInitialized(): boolean {
  return state !== null;
}

/**
 * Get total max LLM from config.
 */
export function getTotalMaxLlm(): number {
  return state?.config.totalMaxLlm ?? DEFAULT_CONFIG.totalMaxLlm;
}

/**
 * Environment variable overrides.
 *
 * PI_TOTAL_MAX_LLM: Total max parallel LLM calls across all instances
 * PI_HEARTBEAT_INTERVAL_MS: Heartbeat interval in milliseconds
 * PI_HEARTBEAT_TIMEOUT_MS: Time before instance is considered dead
 */
export function getEnvOverrides(): Partial<CoordinatorConfig> {
  const overrides: Partial<CoordinatorConfig> = {};

  const totalMaxLlm = process.env.PI_TOTAL_MAX_LLM;
  if (totalMaxLlm) {
    const parsed = parseInt(totalMaxLlm, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.totalMaxLlm = parsed;
    }
  }

  const heartbeatIntervalMs = process.env.PI_HEARTBEAT_INTERVAL_MS;
  if (heartbeatIntervalMs) {
    const parsed = parseInt(heartbeatIntervalMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.heartbeatIntervalMs = parsed;
    }
  }

  const heartbeatTimeoutMs = process.env.PI_HEARTBEAT_TIMEOUT_MS;
  if (heartbeatTimeoutMs) {
    const parsed = parseInt(heartbeatTimeoutMs, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      overrides.heartbeatTimeoutMs = parsed;
    }
  }

  return overrides;
}
