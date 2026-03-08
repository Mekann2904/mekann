/**
 * path: .pi/lib/symphony-orchestrator-loop.ts
 * role: Symphony scheduler を一定間隔で回す常駐 orchestrator loop を提供する
 * why: refresh を手動実行しなくても stale state の reconcile と next candidate 選定を続けるため
 * related: .pi/lib/symphony-scheduler.ts, .pi/lib/symphony-config.ts, .pi/extensions/web-ui/src/routes/runtime.ts
 */

import { loadSymphonyConfig } from "./symphony-config.js";
import { repairSymphonyOrchestratorState } from "./symphony-orchestrator-state.js";
import {
  refreshSymphonyScheduler,
  runSymphonyStartupTerminalCleanup,
  type SymphonySchedulerSnapshot,
} from "./symphony-scheduler.js";

interface RuntimeSessionLike {
  taskId?: string;
  status: string;
}

export interface SymphonyOrchestratorLoopState {
  running: boolean;
  pollIntervalMs: number;
  startedAt: string | null;
  lastTickAt: string | null;
  tickCount: number;
  lastError: string | null;
  lastSnapshot: SymphonySchedulerSnapshot | null;
}

interface StartOptions {
  cwd?: string;
  runtimeSessions?: () => RuntimeSessionLike[];
  forceRestart?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let state: SymphonyOrchestratorLoopState = {
  running: false,
  pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
  startedAt: null,
  lastTickAt: null,
  tickCount: 0,
  lastError: null,
  lastSnapshot: null,
};
let currentCwd = process.cwd();
let runtimeSessionsProvider: (() => RuntimeSessionLike[]) | null = null;
let startupCleanupCwd: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function resolvePollIntervalMs(cwd: string): number {
  return loadSymphonyConfig(cwd).polling.intervalMs || DEFAULT_POLL_INTERVAL_MS;
}

function clearLoopTimer(): void {
  if (!timer) {
    return;
  }
  clearInterval(timer);
  timer = null;
}

function getRuntimeSessions(): RuntimeSessionLike[] {
  return runtimeSessionsProvider?.() ?? [];
}

export async function tickSymphonyOrchestrator(cwd: string = currentCwd): Promise<SymphonySchedulerSnapshot> {
  const snapshot = await refreshSymphonyScheduler(cwd, getRuntimeSessions(), { reconcile: true });
  state = {
    ...state,
    lastTickAt: nowIso(),
    tickCount: state.tickCount + 1,
    lastError: null,
    lastSnapshot: snapshot,
  };
  return snapshot;
}

export function startSymphonyOrchestratorLoop(options: StartOptions = {}): SymphonyOrchestratorLoopState {
  const cwd = options.cwd ?? currentCwd;
  const nextInterval = resolvePollIntervalMs(cwd);

  currentCwd = cwd;
  runtimeSessionsProvider = options.runtimeSessions ?? runtimeSessionsProvider;

  if (state.running && !options.forceRestart && state.pollIntervalMs === nextInterval) {
    return getSymphonyOrchestratorLoopState();
  }

  clearLoopTimer();
  state = {
    ...state,
    running: true,
    pollIntervalMs: nextInterval,
    startedAt: state.startedAt ?? nowIso(),
    lastError: null,
  };

  if (startupCleanupCwd !== currentCwd) {
    startupCleanupCwd = currentCwd;
    try {
      repairSymphonyOrchestratorState(currentCwd, getRuntimeSessions());
    } catch (error) {
      state = {
        ...state,
        lastError: error instanceof Error ? error.message : "resume repair failed",
      };
    }
    void runSymphonyStartupTerminalCleanup(currentCwd).catch((error) => {
      state = {
        ...state,
        lastError: error instanceof Error ? error.message : "startup cleanup failed",
      };
    });
  }

  timer = setInterval(() => {
    void tickSymphonyOrchestrator(currentCwd).catch((error) => {
      state = {
        ...state,
        lastError: error instanceof Error ? error.message : "unknown orchestrator error",
      };
    });
  }, nextInterval);
  timer.unref?.();

  void tickSymphonyOrchestrator(currentCwd).catch((error) => {
    state = {
      ...state,
      lastError: error instanceof Error ? error.message : "unknown orchestrator error",
    };
  });

  return getSymphonyOrchestratorLoopState();
}

export function stopSymphonyOrchestratorLoop(): SymphonyOrchestratorLoopState {
  clearLoopTimer();
  state = {
    ...state,
    running: false,
  };
  return getSymphonyOrchestratorLoopState();
}

export function getSymphonyOrchestratorLoopState(): SymphonyOrchestratorLoopState {
  return { ...state };
}

export function resetSymphonyOrchestratorLoopForTests(): void {
  clearLoopTimer();
  runtimeSessionsProvider = null;
  currentCwd = process.cwd();
  startupCleanupCwd = null;
  state = {
    running: false,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    startedAt: null,
    lastTickAt: null,
    tickCount: 0,
    lastError: null,
    lastSnapshot: null,
  };
}
