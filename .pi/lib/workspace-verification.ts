/**
 * path: .pi/lib/workspace-verification.ts
 * role: ワークスペース検証の設定、runbook抽出、証跡保存、コマンド実行を共通化する
 * why: Droid / Kilo に近い検証運用を、拡張とテストの両方で一貫して扱うため
 * related: .pi/extensions/workspace-verification.ts, .pi/lib/frontmatter.ts, .pi/lib/storage/state-keys.ts, tests/unit/lib/workspace-verification.test.ts
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";

import { parseFrontmatter } from "./frontmatter.js";
import { truncateTextWithMarker } from "./text-utils.js";
import { withFileLock } from "./storage/storage-lock.js";
import { readJsonState, writeJsonState } from "./storage/sqlite-state-store.js";
import {
  getWorkspaceVerificationConfigStateKey,
  getWorkspaceVerificationStateKey,
} from "./storage/state-keys.js";

export type WorkspaceVerificationStep =
  | "lint"
  | "typecheck"
  | "test"
  | "build"
  | "runtime"
  | "ui";

export type WorkspaceVerificationTrigger = "manual" | "auto";
export type WorkspaceVerificationProfile = "auto" | "web-app" | "library" | "backend" | "cli";
export type WorkspaceVerificationGateMode = "soft" | "strict" | "release";

export interface WorkspaceVerificationStepResult {
  step: WorkspaceVerificationStep;
  success: boolean;
  skipped: boolean;
  command?: string;
  durationMs: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  artifactPath?: string;
}

export interface WorkspaceVerificationRuntimeConfig {
  enabled: boolean;
  command: string;
  cwd?: string;
  label: string;
  readyPort?: number;
  readyPattern?: string;
  startupTimeoutMs: number;
  keepAliveOnShutdown: boolean;
}

export interface WorkspaceVerificationUiConfig {
  enabled: boolean;
  session?: string;
  config?: string;
  baseUrl?: string;
  timeoutMs: number;
  commands: string[];
}

export interface WorkspaceVerificationResolvedPlan {
  profile: WorkspaceVerificationProfile;
  commands: {
    lint?: string;
    typecheck?: string;
    test?: string;
    build?: string;
  };
  runtime: WorkspaceVerificationRuntimeConfig;
  ui: WorkspaceVerificationUiConfig;
  acceptanceCriteria: string[];
  validationCommands: string[];
  sources: string[];
}

export interface WorkspaceVerificationRunRecord {
  trigger: WorkspaceVerificationTrigger;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  stepResults: WorkspaceVerificationStepResult[];
  resolvedPlan: WorkspaceVerificationResolvedPlan;
  artifactDir?: string;
}

export interface WorkspaceVerificationConfig {
  enabled: boolean;
  profile: WorkspaceVerificationProfile;
  autoDetectRunbook: boolean;
  autoRunOnTurnEnd: boolean;
  gateMode: WorkspaceVerificationGateMode;
  commandTimeoutMs: number;
  artifactRetentionRuns: number;
  enabledSteps: Record<WorkspaceVerificationStep, boolean>;
  commands: {
    lint: string;
    typecheck: string;
    test: string;
    build: string;
  };
  runtime: WorkspaceVerificationRuntimeConfig;
  ui: WorkspaceVerificationUiConfig;
}

export interface WorkspaceVerificationConfigPatch {
  enabled?: boolean;
  profile?: WorkspaceVerificationProfile;
  autoDetectRunbook?: boolean;
  autoRunOnTurnEnd?: boolean;
  gateMode?: WorkspaceVerificationGateMode;
  commandTimeoutMs?: number;
  artifactRetentionRuns?: number;
  enabledSteps?: Partial<Record<WorkspaceVerificationStep, boolean>>;
  commands?: Partial<WorkspaceVerificationConfig["commands"]>;
  runtime?: Partial<WorkspaceVerificationRuntimeConfig>;
  ui?: Partial<WorkspaceVerificationUiConfig>;
}

export interface WorkspaceVerificationState {
  dirty: boolean;
  running: boolean;
  writeCount: number;
  lastWriteAt?: string;
  lastWriteTool?: string;
  lastVerifiedAt?: string;
  lastRun?: WorkspaceVerificationRunRecord;
}

export interface ParsedWorkspaceCommand {
  executable: string;
  args: string[];
  error?: string;
}

export interface WorkspaceCommandResult {
  command: string;
  success: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ExtractedRunbookHints {
  commands: Partial<WorkspaceVerificationResolvedPlan["commands"]>;
  runtime: Partial<WorkspaceVerificationRuntimeConfig>;
  ui: Partial<WorkspaceVerificationUiConfig>;
  acceptanceCriteria: string[];
  validationCommands: string[];
  sources: string[];
}

const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024;
const GRACEFUL_SHUTDOWN_DELAY_MS = 2_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const DEFAULT_ARTIFACT_RETENTION = 20;
const COMMAND_PATTERN = /\b(?:npm|pnpm|yarn|bun|vitest|pytest|cargo|go|make|just)\b[^\n`]*|\btsc\b[^\n`]*|\beslint\b[^\n`]*/g;
const URL_PATTERN = /https?:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})(\/[^\s]*)?/g;
const FRONTEND_HINTS = ["react", "next", "vite", "vue", "svelte", "astro", "@playwright/test"];
const BACKEND_HINTS = ["express", "fastify", "hono", "koa", "nestjs", "postgres", "mysql"];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCwd(cwd?: string): string {
  return resolve(cwd ?? process.cwd());
}

function ensureStateDir(cwd: string): string {
  const dir = join(cwd, ".pi", "workspace-verification");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function ensureLockDir(cwd: string): string {
  return join(ensureStateDir(cwd), "state");
}

export function ensureVerificationArtifactsDir(cwd?: string): string {
  const targetCwd = normalizeCwd(cwd);
  const dir = join(targetCwd, ".pi", "verification-runs");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.trunc(Number(value));
  return Math.min(max, Math.max(min, rounded));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProfile(value: unknown, fallback: WorkspaceVerificationProfile): WorkspaceVerificationProfile {
  return value === "web-app" || value === "library" || value === "backend" || value === "cli" || value === "auto"
    ? value
    : fallback;
}

function normalizeGateMode(value: unknown, fallback: WorkspaceVerificationGateMode): WorkspaceVerificationGateMode {
  return value === "soft" || value === "strict" || value === "release" ? value : fallback;
}

function createDefaultEnabledSteps(): Record<WorkspaceVerificationStep, boolean> {
  return {
    lint: true,
    typecheck: true,
    test: true,
    build: false,
    runtime: false,
    ui: false,
  };
}

export function createWorkspaceVerificationConfig(): WorkspaceVerificationConfig {
  return {
    enabled: true,
    profile: "auto",
    autoDetectRunbook: true,
    autoRunOnTurnEnd: true,
    gateMode: "strict",
    commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT_MS,
    artifactRetentionRuns: DEFAULT_ARTIFACT_RETENTION,
    enabledSteps: createDefaultEnabledSteps(),
    commands: {
      lint: "npm run lint",
      typecheck: "npm run typecheck",
      test: "npm test",
      build: "npm run build",
    },
    runtime: {
      enabled: false,
      command: "npm run dev",
      label: "workspace-dev-server",
      startupTimeoutMs: 20_000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: false,
      timeoutMs: 120_000,
      commands: [],
    },
  };
}

export function createWorkspaceVerificationState(): WorkspaceVerificationState {
  return {
    dirty: false,
    running: false,
    writeCount: 0,
  };
}

export function normalizeWorkspaceVerificationConfig(input: unknown): WorkspaceVerificationConfig {
  const fallback = createWorkspaceVerificationConfig();
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const record = input as Record<string, unknown>;
  const commands = typeof record.commands === "object" && record.commands ? record.commands as Record<string, unknown> : {};
  const runtime = typeof record.runtime === "object" && record.runtime ? record.runtime as Record<string, unknown> : {};
  const ui = typeof record.ui === "object" && record.ui ? record.ui as Record<string, unknown> : {};
  const enabledSteps = typeof record.enabledSteps === "object" && record.enabledSteps ? record.enabledSteps as Record<string, unknown> : {};

  return {
    enabled: normalizeBoolean(record.enabled, fallback.enabled),
    profile: normalizeProfile(record.profile, fallback.profile),
    autoDetectRunbook: normalizeBoolean(record.autoDetectRunbook, fallback.autoDetectRunbook),
    autoRunOnTurnEnd: normalizeBoolean(record.autoRunOnTurnEnd, fallback.autoRunOnTurnEnd),
    gateMode: normalizeGateMode(record.gateMode, fallback.gateMode),
    commandTimeoutMs: normalizeInteger(record.commandTimeoutMs, fallback.commandTimeoutMs, 1_000, 600_000),
    artifactRetentionRuns: normalizeInteger(record.artifactRetentionRuns, fallback.artifactRetentionRuns, 1, 200),
    enabledSteps: {
      lint: normalizeBoolean(enabledSteps.lint, fallback.enabledSteps.lint),
      typecheck: normalizeBoolean(enabledSteps.typecheck, fallback.enabledSteps.typecheck),
      test: normalizeBoolean(enabledSteps.test, fallback.enabledSteps.test),
      build: normalizeBoolean(enabledSteps.build, fallback.enabledSteps.build),
      runtime: normalizeBoolean(enabledSteps.runtime, fallback.enabledSteps.runtime),
      ui: normalizeBoolean(enabledSteps.ui, fallback.enabledSteps.ui),
    },
    commands: {
      lint: normalizeString(commands.lint, fallback.commands.lint),
      typecheck: normalizeString(commands.typecheck, fallback.commands.typecheck),
      test: normalizeString(commands.test, fallback.commands.test),
      build: normalizeString(commands.build, fallback.commands.build),
    },
    runtime: {
      enabled: normalizeBoolean(runtime.enabled, fallback.runtime.enabled),
      command: normalizeString(runtime.command, fallback.runtime.command),
      cwd: normalizeOptionalString(runtime.cwd),
      label: normalizeString(runtime.label, fallback.runtime.label),
      readyPort: Number.isInteger(runtime.readyPort) ? Number(runtime.readyPort) : undefined,
      readyPattern: normalizeOptionalString(runtime.readyPattern),
      startupTimeoutMs: normalizeInteger(runtime.startupTimeoutMs, fallback.runtime.startupTimeoutMs, 0, 300_000),
      keepAliveOnShutdown: normalizeBoolean(runtime.keepAliveOnShutdown, fallback.runtime.keepAliveOnShutdown),
    },
    ui: {
      enabled: normalizeBoolean(ui.enabled, fallback.ui.enabled),
      session: normalizeOptionalString(ui.session),
      config: normalizeOptionalString(ui.config),
      baseUrl: normalizeOptionalString(ui.baseUrl),
      timeoutMs: normalizeInteger(ui.timeoutMs, fallback.ui.timeoutMs, 1_000, 300_000),
      commands: normalizeStringArray(ui.commands),
    },
  };
}

export function normalizeWorkspaceVerificationState(input: unknown): WorkspaceVerificationState {
  const fallback = createWorkspaceVerificationState();
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const record = input as Record<string, unknown>;
  const run = typeof record.lastRun === "object" && record.lastRun ? record.lastRun as Record<string, unknown> : undefined;

  let lastRun: WorkspaceVerificationRunRecord | undefined;
  if (run) {
    const resolvedPlan = typeof run.resolvedPlan === "object" && run.resolvedPlan
      ? normalizeResolvedPlan(run.resolvedPlan)
      : createEmptyResolvedPlan();
    lastRun = {
      trigger: run.trigger === "manual" ? "manual" : "auto",
      startedAt: normalizeString(run.startedAt, nowIso()),
      finishedAt: normalizeString(run.finishedAt, nowIso()),
      success: normalizeBoolean(run.success, false),
      stepResults: Array.isArray(run.stepResults)
        ? run.stepResults
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
          .map((item) => ({
            step: normalizeString(item.step, "test") as WorkspaceVerificationStep,
            success: normalizeBoolean(item.success, false),
            skipped: normalizeBoolean(item.skipped, false),
            command: normalizeOptionalString(item.command),
            durationMs: normalizeInteger(item.durationMs, 0, 0, 600_000),
            stdout: normalizeOptionalString(item.stdout),
            stderr: normalizeOptionalString(item.stderr),
            error: normalizeOptionalString(item.error),
            metadata: typeof item.metadata === "object" && item.metadata ? item.metadata as Record<string, unknown> : undefined,
            artifactPath: normalizeOptionalString(item.artifactPath),
          }))
        : [],
      resolvedPlan,
      artifactDir: normalizeOptionalString(run.artifactDir),
    };
  }

  return {
    dirty: normalizeBoolean(record.dirty, fallback.dirty),
    running: normalizeBoolean(record.running, fallback.running),
    writeCount: normalizeInteger(record.writeCount, fallback.writeCount, 0, 1_000_000),
    lastWriteAt: normalizeOptionalString(record.lastWriteAt),
    lastWriteTool: normalizeOptionalString(record.lastWriteTool),
    lastVerifiedAt: normalizeOptionalString(record.lastVerifiedAt),
    lastRun,
  };
}

function createEmptyResolvedPlan(): WorkspaceVerificationResolvedPlan {
  return {
    profile: "library",
    commands: {},
    runtime: {
      enabled: false,
      command: "",
      label: "workspace-dev-server",
      startupTimeoutMs: 20_000,
      keepAliveOnShutdown: true,
    },
    ui: {
      enabled: false,
      timeoutMs: 120_000,
      commands: [],
    },
    acceptanceCriteria: [],
    validationCommands: [],
    sources: [],
  };
}

function normalizeResolvedPlan(input: unknown): WorkspaceVerificationResolvedPlan {
  const fallback = createEmptyResolvedPlan();
  if (!input || typeof input !== "object") {
    return fallback;
  }

  const record = input as Record<string, unknown>;
  const commands = typeof record.commands === "object" && record.commands ? record.commands as Record<string, unknown> : {};
  const runtime = typeof record.runtime === "object" && record.runtime ? record.runtime as Record<string, unknown> : {};
  const ui = typeof record.ui === "object" && record.ui ? record.ui as Record<string, unknown> : {};

  return {
    profile: normalizeProfile(record.profile, fallback.profile),
    commands: {
      lint: normalizeOptionalString(commands.lint),
      typecheck: normalizeOptionalString(commands.typecheck),
      test: normalizeOptionalString(commands.test),
      build: normalizeOptionalString(commands.build),
    },
    runtime: {
      enabled: normalizeBoolean(runtime.enabled, fallback.runtime.enabled),
      command: normalizeString(runtime.command, fallback.runtime.command),
      cwd: normalizeOptionalString(runtime.cwd),
      label: normalizeString(runtime.label, fallback.runtime.label),
      readyPort: Number.isInteger(runtime.readyPort) ? Number(runtime.readyPort) : undefined,
      readyPattern: normalizeOptionalString(runtime.readyPattern),
      startupTimeoutMs: normalizeInteger(runtime.startupTimeoutMs, fallback.runtime.startupTimeoutMs, 0, 300_000),
      keepAliveOnShutdown: normalizeBoolean(runtime.keepAliveOnShutdown, fallback.runtime.keepAliveOnShutdown),
    },
    ui: {
      enabled: normalizeBoolean(ui.enabled, fallback.ui.enabled),
      session: normalizeOptionalString(ui.session),
      config: normalizeOptionalString(ui.config),
      baseUrl: normalizeOptionalString(ui.baseUrl),
      timeoutMs: normalizeInteger(ui.timeoutMs, fallback.ui.timeoutMs, 1_000, 300_000),
      commands: normalizeStringArray(ui.commands),
    },
    acceptanceCriteria: normalizeStringArray(record.acceptanceCriteria),
    validationCommands: normalizeStringArray(record.validationCommands),
    sources: normalizeStringArray(record.sources),
  };
}

export function loadWorkspaceVerificationConfig(cwd?: string): WorkspaceVerificationConfig {
  const targetCwd = normalizeCwd(cwd);
  return normalizeWorkspaceVerificationConfig(
    readJsonState({
      stateKey: getWorkspaceVerificationConfigStateKey(targetCwd),
      createDefault: createWorkspaceVerificationConfig,
    }),
  );
}

export function saveWorkspaceVerificationConfig(
  cwd: string | undefined,
  next: WorkspaceVerificationConfigPatch,
): WorkspaceVerificationConfig {
  const targetCwd = normalizeCwd(cwd);
  return withFileLock(ensureLockDir(targetCwd), () => {
    const current = loadWorkspaceVerificationConfig(targetCwd);
    const merged = normalizeWorkspaceVerificationConfig({
      ...current,
      ...next,
      enabledSteps: {
        ...current.enabledSteps,
        ...(next.enabledSteps ?? {}),
      },
      commands: {
        ...current.commands,
        ...(next.commands ?? {}),
      },
      runtime: {
        ...current.runtime,
        ...(next.runtime ?? {}),
      },
      ui: {
        ...current.ui,
        ...(next.ui ?? {}),
      },
    });

    writeJsonState({
      stateKey: getWorkspaceVerificationConfigStateKey(targetCwd),
      value: merged,
    });
    return merged;
  });
}

export function loadWorkspaceVerificationState(cwd?: string): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(cwd);
  return normalizeWorkspaceVerificationState(
    readJsonState({
      stateKey: getWorkspaceVerificationStateKey(targetCwd),
      createDefault: createWorkspaceVerificationState,
    }),
  );
}

export function saveWorkspaceVerificationState(
  cwd: string | undefined,
  next: WorkspaceVerificationState,
): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(cwd);
  const normalized = normalizeWorkspaceVerificationState(next);
  return withFileLock(ensureLockDir(targetCwd), () => {
    writeJsonState({
      stateKey: getWorkspaceVerificationStateKey(targetCwd),
      value: normalized,
    });
    return normalized;
  });
}

export function markWorkspaceDirty(input?: { cwd?: string; toolName?: string }): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(input?.cwd);
  const current = loadWorkspaceVerificationState(targetCwd);
  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    dirty: true,
    running: false,
    writeCount: current.writeCount + 1,
    lastWriteAt: nowIso(),
    lastWriteTool: input?.toolName?.trim() || current.lastWriteTool,
  });
}

export function markVerificationRunning(input: { cwd?: string }): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(input.cwd);
  const current = loadWorkspaceVerificationState(targetCwd);
  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    running: true,
  });
}

export function finalizeVerificationRun(input: { cwd?: string; run: WorkspaceVerificationRunRecord }): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(input.cwd);
  const current = loadWorkspaceVerificationState(targetCwd);
  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    running: false,
    dirty: input.run.success ? false : current.dirty,
    lastVerifiedAt: input.run.success ? input.run.finishedAt : current.lastVerifiedAt,
    lastRun: input.run,
  });
}

function toMillis(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasFreshVerification(state: WorkspaceVerificationState): boolean {
  if (!state.lastWriteAt) {
    return true;
  }

  return toMillis(state.lastVerifiedAt) >= toMillis(state.lastWriteAt);
}

export function shouldAutoRunVerification(config: WorkspaceVerificationConfig, state: WorkspaceVerificationState): boolean {
  if (!config.enabled || !config.autoRunOnTurnEnd || !state.dirty || state.running) {
    return false;
  }

  if (!state.lastWriteAt) {
    return false;
  }

  const lastRunFinishedAt = toMillis(state.lastRun?.finishedAt);
  return lastRunFinishedAt < toMillis(state.lastWriteAt);
}

export function isCompletionBlocked(
  config: WorkspaceVerificationConfig,
  state: WorkspaceVerificationState,
  resolvedPlan?: WorkspaceVerificationResolvedPlan,
): boolean {
  if (!config.enabled || config.gateMode === "soft") {
    return false;
  }

  if (!state.dirty) {
    return false;
  }

  if (!hasFreshVerification(state)) {
    return true;
  }

  if (config.gateMode === "release" && resolvedPlan) {
    const requiredUi = resolvedPlan.ui.enabled;
    const requiredRuntime = resolvedPlan.runtime.enabled;
    const results = new Map(
      (state.lastRun?.stepResults ?? []).map((item) => [item.step, item]),
    );
    if (requiredRuntime && !results.get("runtime")?.success) {
      return true;
    }
    if (requiredUi && !results.get("ui")?.success) {
      return true;
    }
  }

  return false;
}

function appendBoundedText(current: string, incoming: string): string {
  const next = current + incoming;
  if (Buffer.byteLength(next, "utf-8") <= MAX_CAPTURED_OUTPUT_BYTES) {
    return next;
  }

  let tail = next.slice(-Math.max(1, MAX_CAPTURED_OUTPUT_BYTES - 128));
  while (Buffer.byteLength(tail, "utf-8") > MAX_CAPTURED_OUTPUT_BYTES - 128 && tail.length > 1) {
    tail = tail.slice(1);
  }
  return `...[truncated]\n${tail}`;
}

export function parseWorkspaceCommand(command: string): ParsedWorkspaceCommand {
  const raw = String(command ?? "").trim();
  if (!raw) {
    return { executable: "", args: [], error: "command is empty" };
  }

  if (/[\r\n]/.test(raw)) {
    return { executable: "", args: [], error: "command must be a single line" };
  }

  if (/[|&;<>()$`]/.test(raw)) {
    return { executable: "", args: [], error: "shell operators are not allowed" };
  }

  const tokens = tokenizeCommand(raw);
  if (tokens.length === 0) {
    return { executable: "", args: [], error: "command is empty" };
  }

  return { executable: tokens[0], args: tokens.slice(1) };
}

export function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const ch of input) {
    if (escaping) {
      current += ch;
      escaping = false;
      continue;
    }

    if (quote) {
      if (ch === "\\") {
        escaping = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export async function runWorkspaceCommand(input: {
  command: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<WorkspaceCommandResult> {
  const parsed = parseWorkspaceCommand(input.command);
  if (parsed.error) {
    return {
      command: input.command,
      success: false,
      exitCode: null,
      timedOut: false,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: parsed.error,
    };
  }

  const startedAt = Date.now();
  const timeoutMs = normalizeInteger(input.timeoutMs, DEFAULT_COMMAND_TIMEOUT_MS, 1_000, 600_000);

  return await new Promise<WorkspaceCommandResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    const child = spawn(parsed.executable, parsed.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const cleanup = () => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = undefined;
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    const finish = (partial: {
      success: boolean;
      exitCode: number | null;
      timedOut: boolean;
      error?: string;
    }) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolvePromise({
        command: input.command,
        success: partial.success,
        exitCode: partial.exitCode,
        timedOut: partial.timedOut,
        durationMs: Date.now() - startedAt,
        stdout: truncateTextWithMarker(stdout.trim(), 2_000),
        stderr: truncateTextWithMarker(stderr.trim(), 2_000),
        error: partial.error,
      });
    };

    const killSafely = (signal: NodeJS.Signals) => {
      if (child.killed) {
        return;
      }
      try {
        child.kill(signal);
      } catch {
        // noop
      }
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish({
        success: false,
        exitCode: null,
        timedOut: false,
        error: "verification aborted",
      });
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killSafely("SIGTERM");
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
    }, timeoutMs);

    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout = appendBoundedText(stdout, typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr = appendBoundedText(stderr, typeof chunk === "string" ? chunk : chunk.toString("utf-8"));
    });

    child.on("error", (error) => {
      finish({
        success: false,
        exitCode: null,
        timedOut: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish({
          success: false,
          exitCode: code,
          timedOut: true,
          error: `verification timed out after ${timeoutMs}ms`,
        });
        return;
      }

      if (code !== 0) {
        finish({
          success: false,
          exitCode: code,
          timedOut: false,
          error: stderr.trim() || stdout.trim() || `exit code ${code}`,
        });
        return;
      }

      finish({
        success: true,
        exitCode: code,
        timedOut: false,
      });
    });
  });
}

function safeReadText(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function parsePackageJson(cwd: string): Record<string, unknown> {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function listPlanFiles(cwd: string): string[] {
  const planDir = join(cwd, "plans");
  if (!existsSync(planDir)) {
    return [];
  }

  return readdirSync(planDir)
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => join(planDir, entry))
    .sort((left, right) => {
      try {
        return statSync(right).mtimeMs - statSync(left).mtimeMs;
      } catch {
        return 0;
      }
    });
}

function inferProfileFromPackageJson(pkg: Record<string, unknown>): WorkspaceVerificationProfile {
  const dependencies = {
    ...(typeof pkg.dependencies === "object" && pkg.dependencies ? pkg.dependencies as Record<string, unknown> : {}),
    ...(typeof pkg.devDependencies === "object" && pkg.devDependencies ? pkg.devDependencies as Record<string, unknown> : {}),
  };
  const depNames = Object.keys(dependencies).map((item) => item.toLowerCase());
  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts as Record<string, unknown> : {};

  if (depNames.some((name) => FRONTEND_HINTS.some((hint) => name.includes(hint)))) {
    return "web-app";
  }
  if (depNames.some((name) => BACKEND_HINTS.some((hint) => name.includes(hint)))) {
    return "backend";
  }
  if (typeof scripts.bin === "string" || depNames.includes("commander") || depNames.includes("yargs")) {
    return "cli";
  }
  return "library";
}

function pickPackageScript(
  scripts: Record<string, unknown>,
  candidates: string[],
): string | undefined {
  for (const candidate of candidates) {
    if (typeof scripts[candidate] === "string" && scripts[candidate].trim()) {
      if (candidate.includes(":")) {
        return `npm run ${candidate}`;
      }
      if (candidate === "test" || candidate === "build" || candidate === "lint" || candidate === "dev" || candidate === "typecheck") {
        return candidate === "test" ? "npm test" : `npm run ${candidate}`;
      }
      return `npm run ${candidate}`;
    }
  }
  return undefined;
}

function inferPortFromCommand(command?: string): number | undefined {
  if (!command) {
    return undefined;
  }

  const explicit = command.match(/--port\s+(\d{2,5})/);
  if (explicit?.[1]) {
    const port = Number.parseInt(explicit[1], 10);
    return Number.isFinite(port) ? port : undefined;
  }

  const short = command.match(/\s-p\s+(\d{2,5})/);
  if (short?.[1]) {
    const port = Number.parseInt(short[1], 10);
    return Number.isFinite(port) ? port : undefined;
  }

  return undefined;
}

function extractAcceptanceCriteria(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const results: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (/^#+\s+(Acceptance Criteria|Test & Verification|Verification|Validation)/i.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection && /^#+\s+/.test(line.trim())) {
      break;
    }
    if (!inSection) {
      continue;
    }

    const match = line.match(/^\s*[-*]\s+\[?\s*[x ]?\s*\]?\s*(.+)$/);
    if (match?.[1]) {
      results.push(match[1].trim());
    }
  }

  return results;
}

function extractCommands(content: string): string[] {
  const matches = content.match(COMMAND_PATTERN) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)));
}

function extractUrls(content: string): Array<{ url: string; port?: number }> {
  const results: Array<{ url: string; port?: number }> = [];
  for (const match of content.matchAll(URL_PATTERN)) {
    const port = Number.parseInt(match[1] ?? "", 10);
    results.push({
      url: match[0],
      port: Number.isFinite(port) ? port : undefined,
    });
  }
  return results;
}

function mergeRunbookHints(target: ExtractedRunbookHints, source: ExtractedRunbookHints): ExtractedRunbookHints {
  return {
    commands: {
      lint: target.commands.lint ?? source.commands.lint,
      typecheck: target.commands.typecheck ?? source.commands.typecheck,
      test: target.commands.test ?? source.commands.test,
      build: target.commands.build ?? source.commands.build,
    },
    runtime: {
      ...source.runtime,
      ...target.runtime,
    },
    ui: {
      ...source.ui,
      ...target.ui,
    },
    acceptanceCriteria: Array.from(new Set([...source.acceptanceCriteria, ...target.acceptanceCriteria])),
    validationCommands: Array.from(new Set([...source.validationCommands, ...target.validationCommands])),
    sources: Array.from(new Set([...source.sources, ...target.sources])),
  };
}

function extractHintsFromMarkdown(path: string, content: string): ExtractedRunbookHints {
  const { body } = parseFrontmatter<Record<string, unknown>>(content);
  const commands = extractCommands(body);
  const urls = extractUrls(body);
  const acceptanceCriteria = extractAcceptanceCriteria(body);

  const hints: ExtractedRunbookHints = {
    commands: {},
    runtime: {},
    ui: {},
    acceptanceCriteria,
    validationCommands: commands,
    sources: [path],
  };

  for (const command of commands) {
    const lower = command.toLowerCase();
    if (!hints.commands.lint && /\blint\b/.test(lower)) {
      hints.commands.lint = command;
    }
    if (!hints.commands.typecheck && (/typecheck/.test(lower) || /\btsc\b/.test(lower))) {
      hints.commands.typecheck = command;
    }
    if (!hints.commands.test && (/\btest\b/.test(lower) || /\bvitest\b/.test(lower) || /\bpytest\b/.test(lower))) {
      hints.commands.test = command;
    }
    if (!hints.commands.build && /\bbuild\b/.test(lower)) {
      hints.commands.build = command;
    }
    if (!hints.runtime.command && (/\bdev\b/.test(lower) || /\bstart\b/.test(lower) || /\bserve\b/.test(lower))) {
      hints.runtime.command = command;
      hints.runtime.enabled = true;
    }
  }

  if (urls[0]?.url) {
    hints.ui.enabled = true;
    hints.ui.baseUrl = urls[0].url;
    hints.runtime.readyPort = hints.runtime.readyPort ?? urls[0].port;
  }

  return hints;
}

function extractHintsFromPackageJson(cwd: string, pkg: Record<string, unknown>): ExtractedRunbookHints {
  const scripts = typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts as Record<string, unknown> : {};
  const profile = inferProfileFromPackageJson(pkg);
  const hints: ExtractedRunbookHints = {
    commands: {
      lint: pickPackageScript(scripts, ["lint"]),
      typecheck: pickPackageScript(scripts, ["typecheck", "check-types", "tsc"]),
      test: pickPackageScript(scripts, ["test", "test:unit", "test:all"]),
      build: pickPackageScript(scripts, ["build"]),
    },
    runtime: {},
    ui: {},
    acceptanceCriteria: [],
    validationCommands: [],
    sources: [join(cwd, "package.json")],
  };

  const devCommand = pickPackageScript(scripts, ["dev", "start", "serve", "preview"]);
  const rawDevScript = typeof scripts.dev === "string"
    ? scripts.dev
    : typeof scripts.start === "string"
      ? scripts.start
      : typeof scripts.serve === "string"
        ? scripts.serve
        : typeof scripts.preview === "string"
          ? scripts.preview
          : undefined;
  if (profile === "web-app" && devCommand) {
    hints.runtime = {
      enabled: true,
      command: devCommand,
      label: "workspace-web-app",
      readyPort: inferPortFromCommand(rawDevScript ?? devCommand),
    };
    hints.ui = {
      enabled: true,
      commands: ["open ${baseUrl}", "snapshot"],
      timeoutMs: 120_000,
    };
  }

  return hints;
}

export function buildWorkspaceVerificationRunbook(cwd?: string): WorkspaceVerificationResolvedPlan {
  const targetCwd = normalizeCwd(cwd);
  const pkg = parsePackageJson(targetCwd);
  const profile = inferProfileFromPackageJson(pkg);
  let hints = extractHintsFromPackageJson(targetCwd, pkg);

  const docPaths = [
    join(targetCwd, "AGENTS.md"),
    join(targetCwd, "README.md"),
    ...listPlanFiles(targetCwd).slice(0, 5),
  ];

  for (const path of docPaths) {
    if (!existsSync(path)) {
      continue;
    }
    hints = mergeRunbookHints(
      extractHintsFromMarkdown(path, safeReadText(path)),
      hints,
    );
  }

  const runtime: WorkspaceVerificationRuntimeConfig = {
    enabled: hints.runtime.enabled === true,
    command: hints.runtime.command ?? "",
    cwd: hints.runtime.cwd,
    label: hints.runtime.label ?? "workspace-dev-server",
    readyPort: hints.runtime.readyPort,
    readyPattern: hints.runtime.readyPattern,
    startupTimeoutMs: hints.runtime.startupTimeoutMs ?? 20_000,
    keepAliveOnShutdown: hints.runtime.keepAliveOnShutdown ?? true,
  };

  const baseUrl = hints.ui.baseUrl ?? (runtime.readyPort ? `http://127.0.0.1:${runtime.readyPort}` : undefined);
  const ui: WorkspaceVerificationUiConfig = {
    enabled: hints.ui.enabled === true || Boolean(baseUrl && profile === "web-app"),
    session: hints.ui.session,
    config: hints.ui.config,
    baseUrl,
    timeoutMs: hints.ui.timeoutMs ?? 120_000,
    commands: hints.ui.commands && hints.ui.commands.length > 0
      ? hints.ui.commands
      : (baseUrl ? ["open ${baseUrl}", "snapshot"] : []),
  };

  return {
    profile,
    commands: hints.commands,
    runtime,
    ui,
    acceptanceCriteria: hints.acceptanceCriteria,
    validationCommands: hints.validationCommands,
    sources: hints.sources,
  };
}

export function resolveWorkspaceVerificationPlan(
  config: WorkspaceVerificationConfig,
  cwd?: string,
): WorkspaceVerificationResolvedPlan {
  const targetCwd = normalizeCwd(cwd);
  const detected = config.autoDetectRunbook ? buildWorkspaceVerificationRunbook(targetCwd) : createEmptyResolvedPlan();
  const profile = config.profile === "auto" ? detected.profile : config.profile;

  return {
    profile,
    commands: {
      lint: detected.commands.lint ?? config.commands.lint,
      typecheck: detected.commands.typecheck ?? config.commands.typecheck,
      test: detected.commands.test ?? config.commands.test,
      build: detected.commands.build ?? config.commands.build,
    },
    runtime: {
      ...detected.runtime,
      ...config.runtime,
      enabled: config.enabledSteps.runtime || config.runtime.enabled || detected.runtime.enabled,
      command: config.runtime.command || detected.runtime.command || "",
      label: config.runtime.label || detected.runtime.label || "workspace-dev-server",
      startupTimeoutMs: config.runtime.startupTimeoutMs || detected.runtime.startupTimeoutMs || 20_000,
      keepAliveOnShutdown: config.runtime.keepAliveOnShutdown ?? detected.runtime.keepAliveOnShutdown ?? true,
    },
    ui: {
      ...detected.ui,
      ...config.ui,
      enabled: config.enabledSteps.ui || config.ui.enabled || detected.ui.enabled,
      baseUrl: config.ui.baseUrl || detected.ui.baseUrl,
      timeoutMs: config.ui.timeoutMs || detected.ui.timeoutMs || 120_000,
      commands: config.ui.commands.length > 0 ? config.ui.commands : detected.ui.commands,
    },
    acceptanceCriteria: detected.acceptanceCriteria,
    validationCommands: detected.validationCommands,
    sources: detected.sources,
  };
}

export function getResolvedCommandForStep(
  resolvedPlan: WorkspaceVerificationResolvedPlan,
  step: Extract<WorkspaceVerificationStep, "lint" | "typecheck" | "test" | "build">,
): string {
  return resolvedPlan.commands[step] ?? "";
}

export function resolveEnabledSteps(
  config: WorkspaceVerificationConfig,
  resolvedPlan: WorkspaceVerificationResolvedPlan,
  requested?: string[],
): WorkspaceVerificationStep[] {
  const selected = requested && requested.length > 0
    ? requested
    : ["lint", "typecheck", "test", "build", "runtime", "ui"];

  const flags: Record<WorkspaceVerificationStep, boolean> = {
    lint: config.enabledSteps.lint,
    typecheck: config.enabledSteps.typecheck,
    test: config.enabledSteps.test,
    build: config.enabledSteps.build || Boolean(resolvedPlan.commands.build),
    runtime: config.enabledSteps.runtime || resolvedPlan.runtime.enabled,
    ui: config.enabledSteps.ui || resolvedPlan.ui.enabled,
  };

  return selected
    .filter((item): item is WorkspaceVerificationStep =>
      item === "lint" || item === "typecheck" || item === "test" || item === "build" || item === "runtime" || item === "ui")
    .filter((step) => flags[step]);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "run";
}

function formatRunSummary(run: WorkspaceVerificationRunRecord): string {
  const lines = [
    `trigger: ${run.trigger}`,
    `success: ${run.success}`,
    `started_at: ${run.startedAt}`,
    `finished_at: ${run.finishedAt}`,
    `profile: ${run.resolvedPlan.profile}`,
  ];

  if (run.resolvedPlan.acceptanceCriteria.length > 0) {
    lines.push("", "acceptance_criteria:");
    for (const item of run.resolvedPlan.acceptanceCriteria) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("", "steps:");
  for (const step of run.stepResults) {
    lines.push(`- ${step.step}: success=${step.success} skipped=${step.skipped} duration_ms=${step.durationMs}`);
  }

  return lines.join("\n");
}

export function persistWorkspaceVerificationArtifacts(
  cwd: string,
  config: WorkspaceVerificationConfig,
  run: WorkspaceVerificationRunRecord,
): WorkspaceVerificationRunRecord {
  const rootDir = ensureVerificationArtifactsDir(cwd);
  const dirName = `${run.finishedAt.slice(0, 19).replace(/[:T]/g, "-")}-${sanitizeSegment(run.trigger)}`;
  const artifactDir = join(rootDir, dirName);
  if (!existsSync(artifactDir)) {
    mkdirSync(artifactDir, { recursive: true });
  }

  const stepResults = run.stepResults.map((step, index) => {
    const artifactPath = join(artifactDir, `${String(index + 1).padStart(2, "0")}-${step.step}.log`);
    const parts = [
      `step=${step.step}`,
      `success=${step.success}`,
      `skipped=${step.skipped}`,
      `duration_ms=${step.durationMs}`,
      `command=${step.command ?? "-"}`,
      step.error ? `error=${step.error}` : "",
      "",
      "[stdout]",
      step.stdout ?? "",
      "",
      "[stderr]",
      step.stderr ?? "",
    ].filter(Boolean);
    writeFileSync(artifactPath, `${parts.join("\n")}\n`, "utf-8");
    return {
      ...step,
      artifactPath,
    };
  });

  const persistedRun: WorkspaceVerificationRunRecord = {
    ...run,
    artifactDir,
    stepResults,
  };

  writeFileSync(
    join(artifactDir, "summary.json"),
    `${JSON.stringify(persistedRun, null, 2)}\n`,
    "utf-8",
  );
  writeFileSync(
    join(artifactDir, "summary.md"),
    `${formatRunSummary(persistedRun)}\n`,
    "utf-8",
  );

  pruneVerificationArtifacts(cwd, config.artifactRetentionRuns);
  return persistedRun;
}

export function pruneVerificationArtifacts(cwd: string, keepCount: number): void {
  const rootDir = ensureVerificationArtifactsDir(cwd);
  const entries = readdirSync(rootDir)
    .map((entry) => join(rootDir, entry))
    .filter((path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((left, right) => {
      try {
        return statSync(right).mtimeMs - statSync(left).mtimeMs;
      } catch {
        return 0;
      }
    });

  for (const path of entries.slice(keepCount)) {
    try {
      rmSync(path, { recursive: true, force: true });
    } catch {
      // noop
    }
  }
}

export function formatWorkspaceVerificationStatus(
  config: WorkspaceVerificationConfig,
  state: WorkspaceVerificationState,
  resolvedPlan?: WorkspaceVerificationResolvedPlan,
): string {
  const lines = [
    `enabled=${config.enabled}`,
    `profile=${config.profile}`,
    `auto_detect_runbook=${config.autoDetectRunbook}`,
    `auto_run=${config.autoRunOnTurnEnd}`,
    `gate_mode=${config.gateMode}`,
    `dirty=${state.dirty}`,
    `running=${state.running}`,
    `write_count=${state.writeCount}`,
    `last_write_at=${state.lastWriteAt ?? "-"}`,
    `last_write_tool=${state.lastWriteTool ?? "-"}`,
    `last_verified_at=${state.lastVerifiedAt ?? "-"}`,
  ];

  if (resolvedPlan) {
    lines.push(
      `resolved_profile=${resolvedPlan.profile}`,
      `runbook_sources=${resolvedPlan.sources.join(", ") || "-"}`,
      `runtime_enabled=${resolvedPlan.runtime.enabled}`,
      `runtime_command=${resolvedPlan.runtime.command || "-"}`,
      `ui_enabled=${resolvedPlan.ui.enabled}`,
      `ui_base_url=${resolvedPlan.ui.baseUrl || "-"}`,
    );
  }

  if (state.lastRun) {
    lines.push(
      `last_run_trigger=${state.lastRun.trigger}`,
      `last_run_success=${state.lastRun.success}`,
      `last_run_finished_at=${state.lastRun.finishedAt}`,
      `last_run_artifact_dir=${state.lastRun.artifactDir ?? "-"}`,
    );
  }

  return lines.join("\n");
}
