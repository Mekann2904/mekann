/**
 * path: .pi/lib/background-processes.ts
 * role: 長時間実行プロセスの起動、停止、状態永続化を担当する
 * why: pi セッション終了後も残るサービスを安全に追跡するため
 * related: .pi/extensions/background-process.ts, .pi/lib/storage/sqlite-state-store.ts, .pi/lib/process-utils.ts
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { Socket } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import { GRACEFUL_SHUTDOWN_DELAY_MS } from "./process-utils.js";
import { withFileLock } from "./storage/storage-lock.js";
import { readJsonState, writeJsonState } from "./storage/sqlite-state-store.js";
import {
  getBackgroundProcessConfigStateKey,
  getBackgroundProcessStateKey,
} from "./storage/state-keys.js";

export type BackgroundProcessStatus = "running" | "exited" | "stopped" | "failed";
export type BackgroundReadinessStatus = "none" | "pending" | "ready" | "timed_out";

export interface BackgroundProcessRecord {
  id: string;
  label: string;
  command: string;
  cwd: string;
  pid: number;
  shell: string;
  logPath: string;
  startedAt: string;
  updatedAt: string;
  ownerPid: number;
  keepAliveOnShutdown: boolean;
  status: BackgroundProcessStatus;
  readinessStatus: BackgroundReadinessStatus;
  readyPattern?: string;
  readyPort?: number;
  readyAt?: string;
  stoppedAt?: string;
}

interface BackgroundProcessStorage {
  processes: BackgroundProcessRecord[];
}

export interface BackgroundProcessConfig {
  enabled: boolean;
  maxRunningProcesses: number;
  defaultKeepAliveOnShutdown: boolean;
  defaultStartupTimeoutMs: number;
  cleanupOnSessionShutdown: boolean;
}

export interface StartBackgroundProcessInput {
  command: string;
  cwd?: string;
  label?: string;
  logFile?: string;
  keepAliveOnShutdown?: boolean;
  startupTimeoutMs?: number;
  readyPattern?: string;
  readyPort?: number;
  waitForReady?: boolean;
}

export interface StopBackgroundProcessResult {
  record: BackgroundProcessRecord;
  signal: "SIGTERM" | "SIGKILL" | "none";
}

export interface StartBackgroundProcessResult {
  record: BackgroundProcessRecord;
  ready: boolean;
}

const DEFAULT_LABEL = "background-process";
const MAX_LABEL_LENGTH = 80;
const MAX_COMMAND_LENGTH = 2000;
const STORAGE_DEFAULT = (): BackgroundProcessStorage => ({ processes: [] });
const DEFAULT_CONFIG = (cwd?: string): BackgroundProcessConfig => ({
  enabled: process.env.PI_BACKGROUND_PROCESSES === "1",
  maxRunningProcesses: Number.parseInt(process.env.PI_BACKGROUND_MAX_RUNNING ?? "4", 10) || 4,
  defaultKeepAliveOnShutdown: process.env.PI_BACKGROUND_KEEPALIVE_DEFAULT !== "0",
  defaultStartupTimeoutMs: Number.parseInt(process.env.PI_BACKGROUND_STARTUP_TIMEOUT_MS ?? "15000", 10) || 15000,
  cleanupOnSessionShutdown: process.env.PI_BACKGROUND_CLEANUP_ON_SHUTDOWN !== "0",
});
const READINESS_POLL_INTERVAL_MS = 200;

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bhalt\b/i,
  /\bpoweroff\b/i,
  /\bkillall\b/i,
  /\bpkill\b/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\};:/,
];

const RESOURCE_HEAVY_PATTERNS = [
  /\byes\b/,
  /\bwhile\s+true\b/i,
  /\bfor\s*\(\s*;\s*;\s*\)/,
];

const LONG_RUNNING_COMMAND_PATTERNS = [
  /\bnpm\s+run\s+(dev|start|serve|watch)\b/i,
  /\bpnpm\s+(dev|start|serve|watch)\b/i,
  /\byarn\s+(dev|start|serve|watch)\b/i,
  /\b(?:vite|next|nuxt|webpack-dev-server)\b/i,
  /\btsc\s+--watch\b/i,
  /\b(?:rails\s+s|rails\s+server)\b/i,
  /\bpython\s+-m\s+http\.server\b/i,
  /\b(?:uvicorn|gunicorn|bun\s+run\s+dev)\b/i,
  /\b--watch\b/i,
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCwd(cwd?: string): string {
  return resolve(cwd ?? process.cwd());
}

function getBackgroundProcessLockTarget(cwd: string): string {
  const dir = join(cwd, ".pi", "background-processes");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "state");
}

function loadStorage(cwd: string): BackgroundProcessStorage {
  return readJsonState<BackgroundProcessStorage>({
    stateKey: getBackgroundProcessStateKey(cwd),
    createDefault: STORAGE_DEFAULT,
  });
}

export function loadBackgroundProcessConfig(cwd?: string): BackgroundProcessConfig {
  const targetCwd = normalizeCwd(cwd);
  return readJsonState<BackgroundProcessConfig>({
    stateKey: getBackgroundProcessConfigStateKey(targetCwd),
    createDefault: () => DEFAULT_CONFIG(targetCwd),
  });
}

export function saveBackgroundProcessConfig(
  cwd: string | undefined,
  next: Partial<BackgroundProcessConfig>,
): BackgroundProcessConfig {
  const targetCwd = normalizeCwd(cwd);
  return withFileLock(getBackgroundProcessLockTarget(targetCwd), () => {
    const current = loadBackgroundProcessConfig(targetCwd);
    const filtered = Object.fromEntries(
      Object.entries(next).filter(([, value]) => value !== undefined),
    ) as Partial<BackgroundProcessConfig>;
    const updated: BackgroundProcessConfig = {
      ...current,
      ...filtered,
    };
    writeJsonState({
      stateKey: getBackgroundProcessConfigStateKey(targetCwd),
      value: updated,
    });
    return updated;
  });
}

function saveStorage(cwd: string, storage: BackgroundProcessStorage): void {
  writeJsonState({
    stateKey: getBackgroundProcessStateKey(cwd),
    value: storage,
  });
}

function createProcessId(): string {
  return `bg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return DEFAULT_LABEL;
  }
  return trimmed.slice(0, MAX_LABEL_LENGTH);
}

function validateCommand(command: string): void {
  const normalized = command.trim();
  if (!normalized) {
    throw new Error("command is required");
  }

  if (normalized.length > MAX_COMMAND_LENGTH) {
    throw new Error(`command is too long (max ${MAX_COMMAND_LENGTH} characters)`);
  }

  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new Error("dangerous command pattern is blocked");
    }
  }

  for (const pattern of RESOURCE_HEAVY_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new Error("resource-heavy command pattern is blocked");
    }
  }
}

function ensureLogsDir(cwd: string): string {
  const logsDir = join(cwd, ".pi", "background-processes", "logs");
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  return logsDir;
}

function resolveShell(): { shell: string; argsPrefix: string[] } {
  if (process.platform === "win32") {
    return {
      shell: process.env.ComSpec || "cmd.exe",
      argsPrefix: ["/d", "/s", "/c"],
    };
  }

  return {
    shell: process.env.SHELL || "/bin/sh",
    argsPrefix: ["-lc"],
  };
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("EPERM");
  }
}

export function syncBackgroundProcesses(cwd?: string): BackgroundProcessRecord[] {
  const targetCwd = normalizeCwd(cwd);
  const storage = loadStorage(targetCwd);
  let changed = false;

  const processes = storage.processes.map((record) => {
    if (record.status !== "running") {
      return record;
    }

    if (isProcessAlive(record.pid)) {
      return record;
    }

    changed = true;
    return {
      ...record,
      status: "exited" as const,
      updatedAt: nowIso(),
      stoppedAt: nowIso(),
    };
  });

  if (changed) {
    saveStorage(targetCwd, { processes });
  }

  return processes;
}

export function listBackgroundProcesses(input?: {
  cwd?: string;
  includeExited?: boolean;
}): BackgroundProcessRecord[] {
  const records = syncBackgroundProcesses(input?.cwd);
  const includeExited = input?.includeExited ?? true;
  const filtered = includeExited
    ? records
    : records.filter((record) => record.status === "running");

  return [...filtered].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function isLongRunningCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }

  return LONG_RUNNING_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

function ensureBackgroundProcessesEnabled(cwd: string): BackgroundProcessConfig {
  const config = loadBackgroundProcessConfig(cwd);
  if (!config.enabled) {
    throw new Error("background processes are disabled for this workspace");
  }
  return config;
}

function countRunningProcesses(cwd: string): number {
  return listBackgroundProcesses({
    cwd,
    includeExited: false,
  }).length;
}

function normalizeReadyPort(value: number | undefined): number | undefined {
  if (!Number.isInteger(value)) {
    return undefined;
  }
  if (value === undefined || value < 1 || value > 65535) {
    return undefined;
  }
  return value;
}

async function isPortReady(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = new Socket();
    let finished = false;

    const finish = (value: boolean) => {
      if (finished) {
        return;
      }
      finished = true;
      socket.destroy();
      resolvePromise(value);
    };

    if (typeof socket.setTimeout === "function") {
      socket.setTimeout(500);
    }
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

function updateStoredRecord(cwd: string, id: string, updater: (record: BackgroundProcessRecord) => BackgroundProcessRecord): BackgroundProcessRecord | null {
  const storage = loadStorage(cwd);
  const index = storage.processes.findIndex((record) => record.id === id);
  if (index === -1) {
    return null;
  }

  const updated = updater(storage.processes[index]);
  storage.processes[index] = updated;
  saveStorage(cwd, storage);
  return updated;
}

export async function waitForBackgroundProcessReady(input: {
  cwd?: string;
  id: string;
  timeoutMs?: number;
}): Promise<StartBackgroundProcessResult | null> {
  const cwd = normalizeCwd(input.cwd);
  const initial = listBackgroundProcesses({
    cwd,
    includeExited: true,
  }).find((record) => record.id === input.id);
  if (!initial) {
    return null;
  }

  if (initial.readinessStatus === "none" || (!initial.readyPattern && !initial.readyPort)) {
    return { record: initial, ready: true };
  }

  const timeoutMs = Math.max(0, Math.trunc(input.timeoutMs ?? loadBackgroundProcessConfig(cwd).defaultStartupTimeoutMs));
  const deadline = Date.now() + timeoutMs;
  const readyPattern = initial.readyPattern ? new RegExp(initial.readyPattern, "m") : null;

  while (Date.now() <= deadline) {
    const current = listBackgroundProcesses({
      cwd,
      includeExited: true,
    }).find((record) => record.id === input.id);

    if (!current) {
      return null;
    }

    if (current.status !== "running") {
      const updated = updateStoredRecord(cwd, current.id, (record) => ({
        ...record,
        readinessStatus: "timed_out",
        updatedAt: nowIso(),
      })) ?? current;
      return { record: updated, ready: false };
    }

    let patternReady = !readyPattern;
    if (readyPattern && existsSync(current.logPath)) {
      const logContent = readFileSync(current.logPath, "utf-8");
      patternReady = readyPattern.test(logContent);
    }

    let portReady = current.readyPort === undefined;
    if (current.readyPort !== undefined) {
      portReady = await isPortReady(current.readyPort);
    }

    if (patternReady && portReady) {
      const updated = updateStoredRecord(cwd, current.id, (record) => ({
        ...record,
        readinessStatus: "ready",
        readyAt: nowIso(),
        updatedAt: nowIso(),
      })) ?? current;
      return { record: updated, ready: true };
    }

    await delay(READINESS_POLL_INTERVAL_MS);
  }

  const updated = updateStoredRecord(cwd, initial.id, (record) => ({
    ...record,
    readinessStatus: "timed_out",
    updatedAt: nowIso(),
  })) ?? initial;

  return { record: updated, ready: false };
}

export async function startBackgroundProcess(input: StartBackgroundProcessInput): Promise<StartBackgroundProcessResult> {
  validateCommand(input.command);
  if (input.readyPattern) {
    new RegExp(input.readyPattern, "m");
  }

  const cwd = normalizeCwd(input.cwd);
  const { record, startupTimeoutMs } = withFileLock(getBackgroundProcessLockTarget(cwd), () => {
    const config = ensureBackgroundProcessesEnabled(cwd);
    const runningCount = countRunningProcesses(cwd);
    if (runningCount >= config.maxRunningProcesses) {
      throw new Error(`background process limit reached (${config.maxRunningProcesses})`);
    }

    const id = createProcessId();
    const label = truncateLabel(input.label ?? input.command.split(/\s+/)[0] ?? DEFAULT_LABEL);
    const logsDir = ensureLogsDir(cwd);
    const logPath = input.logFile ? resolve(cwd, input.logFile) : join(logsDir, `${id}.log`);
    const shellInfo = resolveShell();
    const readyPort = normalizeReadyPort(input.readyPort);
    const startupTimeoutMs = input.startupTimeoutMs ?? config.defaultStartupTimeoutMs;
    const keepAliveOnShutdown = input.keepAliveOnShutdown ?? config.defaultKeepAliveOnShutdown;

    if (!existsSync(dirname(logPath))) {
      mkdirSync(dirname(logPath), { recursive: true });
    }

    const stdoutFd = openSync(logPath, "a");
    const stderrFd = openSync(logPath, "a");

    try {
      const child = spawn(shellInfo.shell, [...shellInfo.argsPrefix, input.command], {
        cwd,
        detached: true,
        stdio: ["ignore", stdoutFd, stderrFd],
        env: process.env,
      });

      if (!child.pid || child.pid <= 0) {
        throw new Error("failed to start detached process");
      }

      child.unref();

      const record: BackgroundProcessRecord = {
        id,
        label,
        command: input.command.trim(),
        cwd,
        pid: child.pid,
        shell: shellInfo.shell,
        logPath,
        startedAt: nowIso(),
        updatedAt: nowIso(),
        ownerPid: process.pid,
        keepAliveOnShutdown,
        status: "running",
        readinessStatus: input.readyPattern || readyPort !== undefined ? "pending" : "none",
        readyPattern: input.readyPattern,
        readyPort,
      };

      const storage = loadStorage(cwd);
      storage.processes = storage.processes.filter((item) => item.id !== record.id);
      storage.processes.push(record);
      saveStorage(cwd, storage);

      return { record, startupTimeoutMs };
    } finally {
      closeSync(stdoutFd);
      closeSync(stderrFd);
    }
  });

  if (input.waitForReady === false) {
    return { record, ready: false };
  }

  return (
    await waitForBackgroundProcessReady({
      cwd,
      id: record.id,
      timeoutMs: startupTimeoutMs,
    })
  ) ?? { record, ready: false };
}

function trySendSignal(pid: number, signal: "SIGTERM" | "SIGKILL"): "sent" | "missing" {
  try {
    process.kill(pid, signal);
    return "sent";
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code)
      : "";
    if (code === "ESRCH") {
      return "missing";
    }
    throw error;
  }
}

export async function stopBackgroundProcess(input: {
  id: string;
  cwd?: string;
  force?: boolean;
}): Promise<StopBackgroundProcessResult | null> {
  const cwd = normalizeCwd(input.cwd);
  const current = withFileLock(getBackgroundProcessLockTarget(cwd), () => {
    const storage = loadStorage(cwd);
    const index = storage.processes.findIndex((record) => record.id === input.id);
    if (index === -1) {
      return null;
    }
    return storage.processes[index];
  });
  if (!current) {
    return null;
  }

  if (current.status !== "running" || !isProcessAlive(current.pid)) {
    const updated = withFileLock(getBackgroundProcessLockTarget(cwd), () => {
      return updateStoredRecord(cwd, current.id, (record) => ({
        ...record,
        status: record.status === "running" ? "exited" : record.status,
        updatedAt: nowIso(),
        stoppedAt: record.stoppedAt ?? nowIso(),
      })) ?? current;
    });
    return { record: updated, signal: "none" };
  }

  let signal: "SIGTERM" | "SIGKILL" = input.force ? "SIGKILL" : "SIGTERM";
  const sent = trySendSignal(current.pid, signal);
  if (sent === "missing") {
    const updated = withFileLock(getBackgroundProcessLockTarget(cwd), () => {
      return updateStoredRecord(cwd, current.id, (record) => ({
        ...record,
        status: "exited",
        updatedAt: nowIso(),
        stoppedAt: record.stoppedAt ?? nowIso(),
      })) ?? current;
    });
    return { record: updated, signal: "none" };
  }

  if (!input.force) {
    await delay(GRACEFUL_SHUTDOWN_DELAY_MS);
    if (isProcessAlive(current.pid)) {
      trySendSignal(current.pid, "SIGKILL");
      signal = "SIGKILL";
    }
  }

  const updated = withFileLock(getBackgroundProcessLockTarget(cwd), () => {
    return updateStoredRecord(cwd, current.id, (record) => ({
      ...record,
      status: isProcessAlive(record.pid) ? "running" : "stopped",
      updatedAt: nowIso(),
      stoppedAt: nowIso(),
    })) ?? current;
  });

  return { record: updated, signal };
}

export async function stopBackgroundProcessesForOwner(input?: {
  cwd?: string;
  ownerPid?: number;
  includePersistent?: boolean;
}): Promise<BackgroundProcessRecord[]> {
  const ownerPid = input?.ownerPid ?? process.pid;
  const records = listBackgroundProcesses({
    cwd: input?.cwd,
    includeExited: true,
  });

  const stopped: BackgroundProcessRecord[] = [];
  for (const record of records) {
    if (record.ownerPid !== ownerPid) {
      continue;
    }
    if (record.keepAliveOnShutdown && !input?.includePersistent) {
      continue;
    }

    const result = await stopBackgroundProcess({
      id: record.id,
      cwd: record.cwd,
    });
    if (result) {
      stopped.push(result.record);
    }
  }

  return stopped;
}

export async function stopAllBackgroundProcesses(input?: {
  cwd?: string;
  includePersistent?: boolean;
}): Promise<BackgroundProcessRecord[]> {
  const records = listBackgroundProcesses({
    cwd: input?.cwd,
    includeExited: false,
  });

  const stopped: BackgroundProcessRecord[] = [];
  for (const record of records) {
    if (record.keepAliveOnShutdown && !input?.includePersistent) {
      continue;
    }

    const result = await stopBackgroundProcess({
      id: record.id,
      cwd: record.cwd,
    });
    if (result) {
      stopped.push(result.record);
    }
  }

  return stopped;
}

export async function sweepBackgroundProcesses(input?: {
  cwd?: string;
  reclaimOrphans?: boolean;
}): Promise<{
  running: BackgroundProcessRecord[];
  orphaned: BackgroundProcessRecord[];
  reclaimed: BackgroundProcessRecord[];
}> {
  const cwd = normalizeCwd(input?.cwd);
  const reclaimOrphans = input?.reclaimOrphans !== false;
  const running = listBackgroundProcesses({
    cwd,
    includeExited: false,
  });
  const orphaned = running.filter((record) => {
    if (record.ownerPid <= 0) {
      return false;
    }
    return !isProcessAlive(record.ownerPid);
  });
  const reclaimed: BackgroundProcessRecord[] = [];

  if (!reclaimOrphans) {
    return { running, orphaned, reclaimed };
  }

  for (const record of orphaned) {
    // 非永続プロセスだけ自動回収する。persistent は状態観測だけに留める。
    if (record.keepAliveOnShutdown) {
      continue;
    }

    const stopped = await stopBackgroundProcess({
      id: record.id,
      cwd: record.cwd,
    });
    if (stopped) {
      reclaimed.push(stopped.record);
    }
  }

  return {
    running: listBackgroundProcesses({
      cwd,
      includeExited: false,
    }),
    orphaned,
    reclaimed,
  };
}

export function readBackgroundProcessLog(input: {
  cwd?: string;
  id: string;
  maxLines?: number;
}): { record: BackgroundProcessRecord; content: string } | null {
  const records = listBackgroundProcesses({
    cwd: input.cwd,
    includeExited: true,
  });
  const record = records.find((item) => item.id === input.id);
  if (!record) {
    return null;
  }

  const raw = existsSync(record.logPath) ? readFileSync(record.logPath, "utf-8") : "";
  const lines = raw.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const maxLines = Math.max(1, Math.trunc(input.maxLines ?? 80));
  const content = lines.slice(-maxLines).join("\n").trim();

  return {
    record,
    content: content || "(log is empty)",
  };
}
