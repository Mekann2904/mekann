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
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

import { parseFrontmatter } from "./frontmatter.js";
import { loadPlanStorage, savePlanStorage } from "./storage/task-plan-store.js";
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
  | "ui"
  | "review";

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
  recommendedSteps: WorkspaceVerificationStep[];
  reasons: string[];
  proofArtifacts: string[];
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
  adaptiveDefaults: boolean;
  profile: WorkspaceVerificationProfile;
  autoDetectRunbook: boolean;
  autoRunOnTurnEnd: boolean;
  gateMode: WorkspaceVerificationGateMode;
  requireProofReview: boolean;
  requireReviewArtifact: boolean;
  autoRequireReviewArtifact: boolean;
  requireReplanOnRepeatedFailure: boolean;
  enableEvalCorpus: boolean;
  checkpointOnMutation: boolean;
  checkpointOnFailure: boolean;
  antiLoopThreshold: number;
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
  adaptiveDefaults?: boolean;
  profile?: WorkspaceVerificationProfile;
  autoDetectRunbook?: boolean;
  autoRunOnTurnEnd?: boolean;
  gateMode?: WorkspaceVerificationGateMode;
  requireProofReview?: boolean;
  requireReviewArtifact?: boolean;
  autoRequireReviewArtifact?: boolean;
  requireReplanOnRepeatedFailure?: boolean;
  enableEvalCorpus?: boolean;
  checkpointOnMutation?: boolean;
  checkpointOnFailure?: boolean;
  antiLoopThreshold?: number;
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
  pendingProofReview: boolean;
  pendingReviewArtifact: boolean;
  replanRequired: boolean;
  writeCount: number;
  repeatedFailureCount: number;
  lastWriteAt?: string;
  lastWriteTool?: string;
  lastVerifiedAt?: string;
  lastReviewedAt?: string;
  lastReviewedArtifactDir?: string;
  lastReviewArtifactAt?: string;
  lastReviewArtifactPath?: string;
  lastReviewDecision?: string;
  lastReviewRationale?: string;
  lastReplanAt?: string;
  lastRepairStrategy?: string;
  lastMutationCheckpointId?: string;
  lastFailureCheckpointId?: string;
  lastFailureFingerprint?: string;
  replanReason?: string;
  lastEvalCasePath?: string;
  continuityPath?: string;
  trajectoryPath?: string;
  lastTrajectoryEventAt?: string;
  lastRun?: WorkspaceVerificationRunRecord;
}

export interface WorkspaceVerificationTrajectoryEntry {
  timestamp: string;
  kind: "mutation" | "verification_run" | "proof_ack" | "review_ack" | "replan_ack";
  summary: string;
  state: {
    dirty: boolean;
    pendingProofReview: boolean;
    pendingReviewArtifact: boolean;
    replanRequired: boolean;
    repeatedFailureCount: number;
  };
  details?: Record<string, unknown>;
}

export interface WorkspaceVerificationReplayInput {
  summary: {
    profile?: WorkspaceVerificationProfile;
    currentStep?: string;
    nextSuggestedAction: string;
    resumePhase: "verification" | "proof_review" | "review" | "replan" | "clear";
    resumeStep?: WorkspaceVerificationStep;
    artifactDir?: string;
    continuityPath?: string;
    trajectoryPath?: string;
  };
  plan: WorkspaceVerificationPlanSnapshot;
  state: WorkspaceVerificationState;
  resolvedPlan?: Pick<WorkspaceVerificationResolvedPlan, "profile" | "recommendedSteps" | "proofArtifacts" | "reasons">;
  trajectory: WorkspaceVerificationTrajectoryEntry[];
}

export interface WorkspaceVerificationResumePlan {
  phase: "verification" | "proof_review" | "review" | "replan" | "clear";
  requestedSteps: WorkspaceVerificationStep[];
  reason: string;
  resumeStep?: WorkspaceVerificationStep;
}

interface WorkspaceVerificationPlanSnapshot {
  planId?: string;
  name?: string;
  documentPath?: string;
  currentStep?: string;
  acceptanceCriteria: string[];
  fileModuleImpact: string[];
  testVerification: string[];
  recentProgress: string[];
}

interface WorkspaceVerificationEvalCase {
  savedAt: string;
  fingerprint: string;
  repeatedFailureCount: number;
  replanRequired: boolean;
  replanReason?: string;
  artifactDir?: string;
  profile: WorkspaceVerificationProfile;
  recommendedSteps: WorkspaceVerificationStep[];
  acceptanceCriteria: string[];
  proofArtifacts: string[];
  fileModuleImpact: string[];
  failedSteps: Array<{
    step: WorkspaceVerificationStep;
    command?: string;
    error?: string;
    artifactPath?: string;
  }>;
}

interface WorkspaceVerificationReviewArtifact {
  savedAt: string;
  profile: WorkspaceVerificationProfile;
  artifactDir?: string;
  fileModuleImpact: string[];
  acceptanceCriteria: string[];
  verificationSummary: {
    success: boolean;
    executedSteps: Array<{
      step: WorkspaceVerificationStep;
      success: boolean;
      skipped: boolean;
      command?: string;
      error?: string;
      artifactPath?: string;
    }>;
  };
  findings: {
    bugs: string[];
    security: string[];
    regression: string[];
    testGaps: string[];
    rollback: string[];
  };
  severity: {
    highest: "low" | "medium" | "high";
    requiresExplicitDecision: boolean;
    blockingCategories: string[];
    summary: string[];
  };
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
  fileModuleImpact: string[];
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

function ensureVerificationWorkspaceDir(cwd?: string): string {
  const targetCwd = normalizeCwd(cwd);
  const dir = join(targetCwd, ".pi", "workspace-verification");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function ensureVerificationEvalDir(cwd?: string): string {
  const targetCwd = normalizeCwd(cwd);
  const dir = join(targetCwd, ".pi", "evals", "workspace-verification");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getWorkspaceVerificationTrajectoryPath(cwd?: string): string {
  const targetCwd = normalizeCwd(cwd);
  return join(ensureVerificationWorkspaceDir(targetCwd), "trajectory.json");
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
    review: false,
  };
}

export function createWorkspaceVerificationConfig(): WorkspaceVerificationConfig {
  return {
    enabled: false,
    adaptiveDefaults: true,
    profile: "auto",
    autoDetectRunbook: true,
    autoRunOnTurnEnd: false,
    gateMode: "strict",
    requireProofReview: false,
    requireReviewArtifact: false,
    autoRequireReviewArtifact: false,
    requireReplanOnRepeatedFailure: false,
    enableEvalCorpus: false,
    checkpointOnMutation: false,
    checkpointOnFailure: false,
    antiLoopThreshold: 3,
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
    pendingProofReview: false,
    pendingReviewArtifact: false,
    replanRequired: false,
    writeCount: 0,
    repeatedFailureCount: 0,
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
    adaptiveDefaults: normalizeBoolean(record.adaptiveDefaults, fallback.adaptiveDefaults),
    profile: normalizeProfile(record.profile, fallback.profile),
    autoDetectRunbook: normalizeBoolean(record.autoDetectRunbook, fallback.autoDetectRunbook),
    autoRunOnTurnEnd: normalizeBoolean(record.autoRunOnTurnEnd, fallback.autoRunOnTurnEnd),
    gateMode: normalizeGateMode(record.gateMode, fallback.gateMode),
    requireProofReview: normalizeBoolean(record.requireProofReview, fallback.requireProofReview),
    requireReviewArtifact: normalizeBoolean(record.requireReviewArtifact, fallback.requireReviewArtifact),
    autoRequireReviewArtifact: normalizeBoolean(record.autoRequireReviewArtifact, fallback.autoRequireReviewArtifact),
    requireReplanOnRepeatedFailure: normalizeBoolean(
      record.requireReplanOnRepeatedFailure,
      fallback.requireReplanOnRepeatedFailure,
    ),
    enableEvalCorpus: normalizeBoolean(record.enableEvalCorpus, fallback.enableEvalCorpus),
    checkpointOnMutation: normalizeBoolean(record.checkpointOnMutation, fallback.checkpointOnMutation),
    checkpointOnFailure: normalizeBoolean(record.checkpointOnFailure, fallback.checkpointOnFailure),
    antiLoopThreshold: normalizeInteger(record.antiLoopThreshold, fallback.antiLoopThreshold, 2, 10),
    commandTimeoutMs: normalizeInteger(record.commandTimeoutMs, fallback.commandTimeoutMs, 1_000, 600_000),
    artifactRetentionRuns: normalizeInteger(record.artifactRetentionRuns, fallback.artifactRetentionRuns, 1, 200),
    enabledSteps: {
      lint: normalizeBoolean(enabledSteps.lint, fallback.enabledSteps.lint),
      typecheck: normalizeBoolean(enabledSteps.typecheck, fallback.enabledSteps.typecheck),
      test: normalizeBoolean(enabledSteps.test, fallback.enabledSteps.test),
      build: normalizeBoolean(enabledSteps.build, fallback.enabledSteps.build),
      runtime: normalizeBoolean(enabledSteps.runtime, fallback.enabledSteps.runtime),
      ui: normalizeBoolean(enabledSteps.ui, fallback.enabledSteps.ui),
      review: normalizeBoolean(enabledSteps.review, fallback.enabledSteps.review),
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
    pendingProofReview: normalizeBoolean(record.pendingProofReview, fallback.pendingProofReview),
    pendingReviewArtifact: normalizeBoolean(record.pendingReviewArtifact, fallback.pendingReviewArtifact),
    replanRequired: normalizeBoolean(record.replanRequired, fallback.replanRequired),
    writeCount: normalizeInteger(record.writeCount, fallback.writeCount, 0, 1_000_000),
    repeatedFailureCount: normalizeInteger(record.repeatedFailureCount, fallback.repeatedFailureCount, 0, 1_000),
    lastWriteAt: normalizeOptionalString(record.lastWriteAt),
    lastWriteTool: normalizeOptionalString(record.lastWriteTool),
    lastVerifiedAt: normalizeOptionalString(record.lastVerifiedAt),
    lastReviewedAt: normalizeOptionalString(record.lastReviewedAt),
    lastReviewedArtifactDir: normalizeOptionalString(record.lastReviewedArtifactDir),
    lastReviewArtifactAt: normalizeOptionalString(record.lastReviewArtifactAt),
    lastReviewArtifactPath: normalizeOptionalString(record.lastReviewArtifactPath),
    lastReviewDecision: normalizeOptionalString(record.lastReviewDecision),
    lastReviewRationale: normalizeOptionalString(record.lastReviewRationale),
    lastReplanAt: normalizeOptionalString(record.lastReplanAt),
    lastRepairStrategy: normalizeOptionalString(record.lastRepairStrategy),
    lastMutationCheckpointId: normalizeOptionalString(record.lastMutationCheckpointId),
    lastFailureCheckpointId: normalizeOptionalString(record.lastFailureCheckpointId),
    lastFailureFingerprint: normalizeOptionalString(record.lastFailureFingerprint),
    replanReason: normalizeOptionalString(record.replanReason),
    lastEvalCasePath: normalizeOptionalString(record.lastEvalCasePath),
    continuityPath: normalizeOptionalString(record.continuityPath),
    trajectoryPath: normalizeOptionalString(record.trajectoryPath),
    lastTrajectoryEventAt: normalizeOptionalString(record.lastTrajectoryEventAt),
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
    recommendedSteps: ["lint", "typecheck", "test"],
    reasons: [],
    proofArtifacts: ["verification summary"],
    sources: [],
  };
}

function createDefaultUiCommands(baseUrl?: string): string[] {
  void baseUrl;
  return [
    "open ${baseUrl}",
    "snapshot",
    "console error",
    "screenshot",
  ];
}

function applyAdaptiveWorkspaceVerificationDefaults(
  config: WorkspaceVerificationConfig,
  cwd: string,
): WorkspaceVerificationConfig {
  if (!config.adaptiveDefaults) {
    return config;
  }

  const detected = buildWorkspaceVerificationRunbook(cwd);
  if (detected.profile !== "web-app") {
    return config;
  }

  const uiCommands = config.ui.commands.length > 0
    ? config.ui.commands
    : createDefaultUiCommands(detected.ui.baseUrl);

  return normalizeWorkspaceVerificationConfig({
    ...config,
    enabled: true,
    gateMode: "release",
    autoRunOnTurnEnd: true,
    requireProofReview: true,
    autoRequireReviewArtifact: true,
    requireReplanOnRepeatedFailure: true,
    checkpointOnMutation: true,
    checkpointOnFailure: true,
    enabledSteps: {
      ...config.enabledSteps,
      runtime: true,
      ui: true,
    },
    ui: {
      ...config.ui,
      commands: uiCommands,
    },
  });
}

function didRunCoverRequiredSteps(
  config: WorkspaceVerificationConfig,
  run: WorkspaceVerificationRunRecord,
): boolean {
  if (!run.success) {
    return false;
  }

  if (!run.resolvedPlan) {
    return true;
  }

  const requiredSteps = resolveEnabledSteps(config, run.resolvedPlan);
  if (requiredSteps.length === 0) {
    return true;
  }

  const executed = new Map(
    run.stepResults.map((step) => [step.step, step]),
  );

  return requiredSteps.every((step) => {
    const result = executed.get(step);
    return Boolean(result?.success) && !result?.skipped;
  });
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
    recommendedSteps: normalizeStringArray(record.recommendedSteps)
      .filter((step): step is WorkspaceVerificationStep =>
        step === "lint" || step === "typecheck" || step === "test" || step === "build" || step === "runtime" || step === "ui" || step === "review"),
    reasons: normalizeStringArray(record.reasons),
    proofArtifacts: normalizeStringArray(record.proofArtifacts),
    sources: normalizeStringArray(record.sources),
  };
}

export function loadWorkspaceVerificationConfig(cwd?: string): WorkspaceVerificationConfig {
  const targetCwd = normalizeCwd(cwd);
  const config = normalizeWorkspaceVerificationConfig(
    readJsonState({
      stateKey: getWorkspaceVerificationConfigStateKey(targetCwd),
      createDefault: createWorkspaceVerificationConfig,
    }),
  );
  return applyAdaptiveWorkspaceVerificationDefaults(config, targetCwd);
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

export function loadWorkspaceVerificationTrajectory(cwd?: string): WorkspaceVerificationTrajectoryEntry[] {
  const path = getWorkspaceVerificationTrajectoryPath(cwd);
  if (!existsSync(path)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => {
        const state = typeof item.state === "object" && item.state ? item.state as Record<string, unknown> : {};
        return {
          timestamp: normalizeString(item.timestamp, nowIso()),
          kind: normalizeString(item.kind, "mutation") as WorkspaceVerificationTrajectoryEntry["kind"],
          summary: normalizeString(item.summary, "workspace verification event"),
          state: {
            dirty: normalizeBoolean(state.dirty, false),
            pendingProofReview: normalizeBoolean(state.pendingProofReview, false),
            pendingReviewArtifact: normalizeBoolean(state.pendingReviewArtifact, false),
            replanRequired: normalizeBoolean(state.replanRequired, false),
            repeatedFailureCount: normalizeInteger(state.repeatedFailureCount, 0, 0, 1_000),
          },
          details: typeof item.details === "object" && item.details ? item.details as Record<string, unknown> : undefined,
        };
      });
  } catch {
    return [];
  }
}

export function appendWorkspaceVerificationTrajectoryEvent(input: {
  cwd?: string;
  entry: Omit<WorkspaceVerificationTrajectoryEntry, "timestamp"> & { timestamp?: string };
}): { path: string; entries: WorkspaceVerificationTrajectoryEntry[] } {
  const cwd = normalizeCwd(input.cwd);
  const path = getWorkspaceVerificationTrajectoryPath(cwd);
  const existing = loadWorkspaceVerificationTrajectory(cwd);
  const entry: WorkspaceVerificationTrajectoryEntry = {
    ...input.entry,
    timestamp: input.entry.timestamp ?? nowIso(),
  };
  const entries = [...existing, entry].slice(-50);
  writeFileSync(path, `${JSON.stringify(entries, null, 2)}\n`, "utf-8");

  const state = loadWorkspaceVerificationState(cwd);
  saveWorkspaceVerificationState(cwd, {
    ...state,
    trajectoryPath: path,
    lastTrajectoryEventAt: entry.timestamp,
  });

  return { path, entries };
}

export function markWorkspaceDirty(input?: { cwd?: string; toolName?: string }): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(input?.cwd);
  const current = loadWorkspaceVerificationState(targetCwd);
  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    dirty: true,
    running: false,
    pendingProofReview: false,
    pendingReviewArtifact: false,
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
  const config = loadWorkspaceVerificationConfig(targetCwd);
  const verificationSatisfied = didRunCoverRequiredSteps(config, input.run);
  const failureFingerprint = input.run.success ? undefined : computeFailureFingerprint(input.run);
  const repeatedFailureCount = failureFingerprint && failureFingerprint === current.lastFailureFingerprint
    ? current.repeatedFailureCount + 1
    : failureFingerprint
      ? 1
      : 0;
  const replanRequired = Boolean(
    !input.run.success
    && config.requireReplanOnRepeatedFailure
    && repeatedFailureCount >= config.antiLoopThreshold,
  );
  const replanReason = replanRequired
    ? `Repeated verification failure (${repeatedFailureCount}x) for ${failureFingerprint ?? "unknown failure"}. Update the plan with a new repair strategy before continuing.`
    : undefined;
  const evalCasePath = !input.run.success && config.enableEvalCorpus
    ? persistWorkspaceVerificationEvalCase(targetCwd, input.run, repeatedFailureCount, replanRequired, replanReason)
    : current.lastEvalCasePath;

  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    running: false,
    dirty: verificationSatisfied ? false : current.dirty,
    pendingProofReview: verificationSatisfied ? Boolean(input.run.artifactDir) : current.pendingProofReview,
    pendingReviewArtifact: input.run.success ? current.pendingReviewArtifact : false,
    replanRequired: input.run.success ? false : replanRequired,
    repeatedFailureCount: input.run.success ? 0 : repeatedFailureCount,
    lastVerifiedAt: verificationSatisfied ? input.run.finishedAt : current.lastVerifiedAt,
    lastReviewedAt: verificationSatisfied ? undefined : current.lastReviewedAt,
    lastReviewedArtifactDir: verificationSatisfied ? undefined : current.lastReviewedArtifactDir,
    lastFailureFingerprint: input.run.success ? undefined : failureFingerprint,
    replanReason: input.run.success ? undefined : replanReason,
    lastEvalCasePath: input.run.success ? current.lastEvalCasePath : evalCasePath,
    lastRun: input.run,
  });
}

export function shouldRequireReviewArtifact(
  config: WorkspaceVerificationConfig,
  resolvedPlan?: WorkspaceVerificationResolvedPlan,
): boolean {
  if (config.requireReviewArtifact) {
    return true;
  }

  if (!config.autoRequireReviewArtifact || !resolvedPlan) {
    return false;
  }

  return resolvedPlan.proofArtifacts.includes("review notes");
}

export function acknowledgeVerificationArtifacts(input: { cwd?: string; artifactDir?: string }): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(input.cwd);
  const current = loadWorkspaceVerificationState(targetCwd);
  const artifactDir = input.artifactDir?.trim() || current.lastRun?.artifactDir;

  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    pendingProofReview: false,
    lastReviewedAt: nowIso(),
    lastReviewedArtifactDir: artifactDir,
  });
}

function inferReviewFindings(
  run: WorkspaceVerificationRunRecord,
  plan: WorkspaceVerificationPlanSnapshot,
): WorkspaceVerificationReviewArtifact["findings"] {
  const haystack = [
    ...plan.fileModuleImpact,
    ...plan.acceptanceCriteria,
    ...run.resolvedPlan.reasons,
  ].join("\n").toLowerCase();
  const failedSteps = run.stepResults.filter((item) => !item.success && !item.skipped);
  const findings: WorkspaceVerificationReviewArtifact["findings"] = {
    bugs: [],
    security: [],
    regression: [],
    testGaps: [],
    rollback: [],
  };

  if (failedSteps.length > 0) {
    findings.bugs.push(`Verification failures remain in: ${failedSteps.map((item) => item.step).join(", ")}`);
    findings.regression.push("A previously expected verification step is failing and may indicate a behavior regression.");
  }

  if (/\b(auth|security|token|secret|credential|permission|role|policy)\b/.test(haystack)) {
    findings.security.push("Security-sensitive surface changed. Confirm auth, permissions, and secret handling before completion.");
  }

  if (/\b(api|schema|migration|contract|public|interface|workflow)\b/.test(haystack)) {
    findings.regression.push("Public or workflow-facing behavior may have changed. Reconfirm backward compatibility and edge cases.");
  }

  if (!run.stepResults.some((item) => item.step === "test" && item.success)) {
    findings.testGaps.push("No passing automated test evidence was recorded for this change.");
  }

  if (plan.fileModuleImpact.length === 0) {
    findings.testGaps.push("File/module impact is not documented in the current plan.");
  }

  if (!/\b(rollback|revert|fallback|checkpoint)\b/.test(haystack)) {
    findings.rollback.push("Rollback path is not explicit. Document revert or checkpoint strategy before release.");
  }

  return findings;
}

function renderReviewArtifactMarkdown(review: WorkspaceVerificationReviewArtifact): string {
  const lines = [
    "# Workspace Review Artifact",
    "",
    `saved_at: ${review.savedAt}`,
    `profile: ${review.profile}`,
    `artifact_dir: ${review.artifactDir ?? "-"}`,
    "",
    "## Scope",
  ];

  if (review.fileModuleImpact.length > 0) {
    for (const item of review.fileModuleImpact) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- not documented");
  }

  lines.push("", "## Acceptance Criteria");
  if (review.acceptanceCriteria.length > 0) {
    for (const item of review.acceptanceCriteria) {
      lines.push(`- ${item}`);
    }
  } else {
    lines.push("- not documented");
  }

  lines.push("", "## Verification Summary");
  lines.push(`- success: ${review.verificationSummary.success}`);
  for (const item of review.verificationSummary.executedSteps) {
    lines.push(`- ${item.step}: success=${item.success} skipped=${item.skipped}${item.error ? ` error=${item.error}` : ""}`);
  }

  lines.push("", "## Severity");
  lines.push(`- highest: ${review.severity.highest}`);
  lines.push(`- requires_explicit_decision: ${review.severity.requiresExplicitDecision}`);
  if (review.severity.blockingCategories.length > 0) {
    lines.push(`- blocking_categories: ${review.severity.blockingCategories.join(", ")}`);
  }
  for (const item of review.severity.summary) {
    lines.push(`- ${item}`);
  }

  for (const [section, items] of Object.entries(review.findings)) {
    lines.push("", `## ${section}`);
    if (items.length === 0) {
      lines.push("- none");
      continue;
    }
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function inferReviewSeverity(
  findings: WorkspaceVerificationReviewArtifact["findings"],
): WorkspaceVerificationReviewArtifact["severity"] {
  const blockingCategories: string[] = [];
  const summary: string[] = [];
  let highest: "low" | "medium" | "high" = "low";

  const raise = (level: "medium" | "high") => {
    if (level === "high" || highest === "low") {
      highest = level;
    }
  };

  if (findings.bugs.length > 0) {
    blockingCategories.push("bugs");
    summary.push("Unresolved bug risk was detected from the latest verification results.");
    raise("high");
  }

  if (findings.security.length > 0) {
    blockingCategories.push("security");
    summary.push("Security-sensitive surface changed and needs an explicit review decision.");
    raise("high");
  }

  if (findings.testGaps.length > 0) {
    const missingEvidence = findings.testGaps.some((item) => item.includes("No passing automated test evidence"));
    summary.push("Test coverage evidence is incomplete for the current change.");
    if (missingEvidence) {
      blockingCategories.push("testGaps");
      raise("high");
    } else {
      raise("medium");
    }
  }

  if (findings.regression.length > 0) {
    summary.push("Regression-sensitive behavior changed and should be explicitly reviewed.");
    raise("medium");
  }

  if (findings.rollback.length > 0) {
    summary.push("Rollback path is weak or undocumented.");
    raise("medium");
  }

  return {
    highest,
    requiresExplicitDecision: highest !== "low",
    blockingCategories,
    summary,
  };
}

export function persistWorkspaceReviewArtifact(input: {
  cwd?: string;
  run: WorkspaceVerificationRunRecord;
}): { path: string; review: WorkspaceVerificationReviewArtifact } {
  const cwd = normalizeCwd(input.cwd);
  const plan = loadCurrentPlanSnapshot(cwd);
  const review: WorkspaceVerificationReviewArtifact = {
    savedAt: nowIso(),
    profile: input.run.resolvedPlan.profile,
    artifactDir: input.run.artifactDir,
    fileModuleImpact: plan.fileModuleImpact,
    acceptanceCriteria: plan.acceptanceCriteria.length > 0 ? plan.acceptanceCriteria : input.run.resolvedPlan.acceptanceCriteria,
    verificationSummary: {
      success: input.run.success,
      executedSteps: input.run.stepResults.map((item) => ({
        step: item.step,
        success: item.success,
        skipped: item.skipped,
        command: item.command,
        error: item.error,
        artifactPath: item.artifactPath,
      })),
    },
    findings: inferReviewFindings(input.run, plan),
    severity: {
      highest: "low",
      requiresExplicitDecision: false,
      blockingCategories: [],
      summary: [],
    },
  };
  review.severity = inferReviewSeverity(review.findings);
  const dir = join(ensureVerificationWorkspaceDir(cwd), "reviews");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = join(dir, `${input.run.finishedAt.slice(0, 19).replace(/[:T]/g, "-")}-review.md`);
  const jsonPath = path.replace(/\.md$/u, ".json");
  writeFileSync(path, renderReviewArtifactMarkdown(review), "utf-8");
  writeFileSync(jsonPath, `${JSON.stringify(review, null, 2)}\n`, "utf-8");
  return { path, review };
}

export function acknowledgeReviewArtifact(input: {
  cwd?: string;
  path?: string;
  decision?: string;
  rationale?: string;
}): WorkspaceVerificationState {
  const cwd = normalizeCwd(input.cwd);
  const current = loadWorkspaceVerificationState(cwd);
  const path = input.path?.trim() || current.lastReviewArtifactPath;
  const jsonPath = path?.replace(/\.md$/u, ".json");
  let review: WorkspaceVerificationReviewArtifact | undefined;
  if (jsonPath && existsSync(jsonPath)) {
    try {
      review = JSON.parse(readFileSync(jsonPath, "utf-8")) as WorkspaceVerificationReviewArtifact;
    } catch {
      review = undefined;
    }
  }
  const decision = normalizeOptionalString(input.decision);
  const rationale = normalizeOptionalString(input.rationale);

  if (review?.severity.requiresExplicitDecision && !decision) {
    throw new Error("review decision is required for this artifact");
  }

  if ((review?.severity.highest === "high" || decision === "mitigate") && !rationale) {
    throw new Error("review rationale is required for high-severity findings");
  }

  return saveWorkspaceVerificationState(cwd, {
    ...current,
    pendingReviewArtifact: false,
    lastReviewArtifactAt: nowIso(),
    lastReviewArtifactPath: path,
    lastReviewDecision: decision,
    lastReviewRationale: rationale,
  });
}

export function acknowledgeReplanDecision(input: {
  cwd?: string;
  strategy: string;
}): WorkspaceVerificationState {
  const targetCwd = normalizeCwd(input.cwd);
  const current = loadWorkspaceVerificationState(targetCwd);
  const strategy = input.strategy.trim();

  if (strategy.length === 0) {
    throw new Error("repair strategy is required");
  }

  appendRepairStrategyToCurrentPlan(targetCwd, strategy);

  return saveWorkspaceVerificationState(targetCwd, {
    ...current,
    replanRequired: false,
    replanReason: undefined,
    lastReplanAt: nowIso(),
    lastRepairStrategy: strategy,
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

  if (config.requireProofReview && state.pendingProofReview) {
    return true;
  }

  if (shouldRequireReviewArtifact(config, resolvedPlan) && state.pendingReviewArtifact) {
    return true;
  }

  if (config.requireReplanOnRepeatedFailure && state.replanRequired) {
    return true;
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

function extractSectionItems(content: string, headingPattern: RegExp): string[] {
  const lines = content.split(/\r?\n/);
  const results: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (headingPattern.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^#+\s+/.test(trimmed)) {
      break;
    }
    if (!inSection) {
      continue;
    }

    const match = line.match(/^\s*[-*]\s+\[?\s*[x !-]?\s*\]?\s*(.+)$/);
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
    fileModuleImpact: Array.from(new Set([...source.fileModuleImpact, ...target.fileModuleImpact])),
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
    fileModuleImpact: extractSectionItems(body, /^#+\s+(File\/Module Impact|Impact|Changed Files)/i),
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
    fileModuleImpact: [],
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
      commands: createDefaultUiCommands(),
      timeoutMs: 120_000,
    };
  }

  return hints;
}

function inferRelevantVerification(
  profile: WorkspaceVerificationProfile,
  hints: ExtractedRunbookHints,
  runtime: WorkspaceVerificationRuntimeConfig,
  ui: WorkspaceVerificationUiConfig,
): {
  recommendedSteps: WorkspaceVerificationStep[];
  reasons: string[];
  proofArtifacts: string[];
} {
  const haystack = [
    ...hints.acceptanceCriteria,
    ...hints.validationCommands,
    ...hints.fileModuleImpact,
    runtime.command,
    ui.baseUrl,
    ...ui.commands,
  ].join("\n").toLowerCase();

  const fileImpact = hints.fileModuleImpact.join("\n").toLowerCase();
  const recommended = new Set<WorkspaceVerificationStep>(["lint", "typecheck", "test"]);
  const reasons: string[] = [];
  const proofArtifacts = new Set<string>(["verification summary", "step logs"]);

  const pushReason = (reason: string) => {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  };

  if (profile === "web-app" || /\b(ui|frontend|browser|page|component|css|html|localhost|screenshot)\b/.test(haystack)) {
    if (runtime.enabled) {
      recommended.add("runtime");
    }
    if (ui.enabled) {
      recommended.add("ui");
    }
    pushReason("UI or browser-facing change detected");
    proofArtifacts.add("browser evidence");
  }

  if (/\b(api|backend|server|route|endpoint|http)\b/.test(haystack)) {
    if (runtime.enabled) {
      recommended.add("runtime");
    }
    pushReason("Runtime-facing change detected");
    proofArtifacts.add("runtime logs");
  }

  if (/\b(build|bundle|vite|webpack|rollup|package\.json|config)\b/.test(haystack) || /package\.json|vite\.config|webpack|rollup/.test(fileImpact)) {
    recommended.add("build");
    pushReason("Build or packaging impact detected");
    proofArtifacts.add("build output");
  }

  if (/\b(type|tsconfig|schema|interface|typing)\b/.test(haystack) || /\.ts\b/.test(fileImpact)) {
    recommended.add("typecheck");
    pushReason("Type-sensitive change detected");
  }

  if (/\b(test|regression|invariant|property|behavior|workflow)\b/.test(haystack)) {
    recommended.add("test");
    pushReason("Behavioral regression risk detected");
    proofArtifacts.add("test results");
  }

  if (/\b(review|security|coverage|auth|token|secret|permission|role)\b/.test(haystack)) {
    proofArtifacts.add("review notes");
  }

  if (/\b(api|schema|migration|contract|public|interface|workflow)\b/.test(haystack)) {
    proofArtifacts.add("review notes");
  }

  if (/\b(build|bundle|release|deploy|ci|package\.json|config)\b/.test(haystack) || /package\.json|vite\.config|webpack|rollup/.test(fileImpact)) {
    proofArtifacts.add("review notes");
  }

  return {
    recommendedSteps: [...recommended],
    reasons,
    proofArtifacts: [...proofArtifacts],
  };
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
      : createDefaultUiCommands(baseUrl),
  };

  const relevant = inferRelevantVerification(profile, hints, runtime, ui);

  return {
    profile,
    commands: hints.commands,
    runtime,
    ui,
    acceptanceCriteria: hints.acceptanceCriteria,
    validationCommands: hints.validationCommands,
    recommendedSteps: relevant.recommendedSteps,
    reasons: relevant.reasons,
    proofArtifacts: relevant.proofArtifacts,
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
    recommendedSteps: detected.recommendedSteps,
    reasons: detected.reasons,
    proofArtifacts: detected.proofArtifacts,
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
    : resolvedPlan.recommendedSteps;

  const flags: Record<WorkspaceVerificationStep, boolean> = {
    lint: config.enabledSteps.lint,
    typecheck: config.enabledSteps.typecheck,
    test: config.enabledSteps.test,
    build: config.enabledSteps.build || Boolean(resolvedPlan.commands.build),
    runtime: config.enabledSteps.runtime || resolvedPlan.runtime.enabled,
    ui: config.enabledSteps.ui || resolvedPlan.ui.enabled,
    review: shouldRequireReviewArtifact(config, resolvedPlan),
  };

  return selected
    .filter((item): item is WorkspaceVerificationStep =>
      item === "lint" || item === "typecheck" || item === "test" || item === "build" || item === "runtime" || item === "ui" || item === "review")
    .filter((step) => flags[step]);
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "run";
}

function normalizeFailureText(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b\d+\b/g, "#")
    .replace(/\/[a-z0-9._/-]+/gi, "<path>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function computeFailureFingerprint(run: WorkspaceVerificationRunRecord): string {
  const resolvedPlan = run.resolvedPlan ?? createEmptyResolvedPlan();
  const failed = run.stepResults.find((item) => !item.success && !item.skipped);
  if (!failed) {
    return `${resolvedPlan.profile}:unknown-failure`;
  }

  const normalized = normalizeFailureText(failed.error ?? failed.stderr ?? failed.stdout);
  const digest = createHash("sha256")
    .update(`${resolvedPlan.profile}:${failed.step}:${normalized}`)
    .digest("hex")
    .slice(0, 12);

  return `${resolvedPlan.profile}:${failed.step}:${digest}`;
}

function loadCurrentPlanSnapshot(cwd: string): WorkspaceVerificationPlanSnapshot {
  try {
    const storage = loadPlanStorage<{ plans: Array<Record<string, unknown>>; currentPlanId?: string }>(cwd);
    const plans = Array.isArray(storage.plans) ? storage.plans : [];
    const current = plans.find((plan) => plan.id === storage.currentPlanId)
      ?? [...plans].reverse().find((plan) => plan.status === "active" || plan.status === "draft");

    if (!current) {
      return {
        acceptanceCriteria: [],
        fileModuleImpact: [],
        testVerification: [],
        recentProgress: [],
      };
    }

    const steps = Array.isArray(current.steps) ? current.steps : [];
    const currentStep = steps.find((step) => step && typeof step === "object" && step.status === "in_progress");

    return {
      planId: typeof current.id === "string" ? current.id : undefined,
      name: typeof current.name === "string" ? current.name : undefined,
      documentPath: typeof current.documentPath === "string" ? current.documentPath : undefined,
      currentStep: currentStep && typeof currentStep.title === "string" ? currentStep.title : undefined,
      acceptanceCriteria: normalizeStringArray(current.acceptanceCriteria),
      fileModuleImpact: normalizeStringArray(current.fileModuleImpact),
      testVerification: normalizeStringArray(current.testVerification),
      recentProgress: normalizeStringArray(current.progressLog).slice(-5),
    };
  } catch {
    return {
      acceptanceCriteria: [],
      fileModuleImpact: [],
      testVerification: [],
      recentProgress: [],
    };
  }
}

function appendRepairStrategyToCurrentPlan(cwd: string, strategy: string): void {
  try {
    const storage = loadPlanStorage<{ plans: Array<Record<string, unknown>>; currentPlanId?: string }>(cwd);
    const plans = Array.isArray(storage.plans) ? storage.plans : [];
    const target = plans.find((plan) => plan.id === storage.currentPlanId)
      ?? [...plans].reverse().find((plan) => plan.status === "active" || plan.status === "draft");

    if (!target) {
      return;
    }

    const progressLog = normalizeStringArray(target.progressLog);
    progressLog.push(`${nowIso()} verifier: Replan strategy recorded: ${strategy}`);
    target.progressLog = progressLog;
    target.updatedAt = nowIso();
    savePlanStorage(storage, cwd);
  } catch {
    // noop
  }
}

function deriveNextSuggestedAction(state: WorkspaceVerificationState): string {
  if (state.replanRequired) {
    return "Update the plan with a new repair strategy, then run workspace_verify_replan.";
  }
  if (state.pendingReviewArtifact) {
    return "Inspect the latest review artifact, record a decision, then run workspace_verify_review_ack.";
  }
  if (state.pendingProofReview) {
    return "Inspect the latest verification artifacts, then run workspace_verify_ack.";
  }
  if (state.dirty) {
    return "Run workspace_verify against the relevant verification steps.";
  }
  return "Workspace verification is clear. Continue with the next planned step.";
}

export function resolveWorkspaceVerificationResumePlan(
  state: WorkspaceVerificationState,
  resolvedPlan?: WorkspaceVerificationResolvedPlan,
): WorkspaceVerificationResumePlan {
  if (state.replanRequired) {
    return {
      phase: "replan",
      requestedSteps: [],
      reason: state.replanReason ?? "Repeated verification failures require a new repair strategy.",
    };
  }

  if (state.pendingReviewArtifact) {
    return {
      phase: "review",
      requestedSteps: [],
      reason: "A review artifact is pending acknowledgement.",
    };
  }

  if (state.pendingProofReview) {
    return {
      phase: "proof_review",
      requestedSteps: [],
      reason: "Verification artifacts are waiting for proof acknowledgement.",
    };
  }

  if (state.dirty) {
    const failedStep = state.lastRun?.stepResults.find((item) => !item.success && !item.skipped)?.step;
    const recommended = resolvedPlan?.recommendedSteps ?? state.lastRun?.resolvedPlan.recommendedSteps ?? ["lint", "typecheck", "test"];
    const requestedSteps = failedStep
      ? recommended.slice(Math.max(0, recommended.indexOf(failedStep)))
      : recommended;
    return {
      phase: "verification",
      requestedSteps,
      reason: failedStep
        ? `Resume verification from the failed step: ${failedStep}.`
        : "Workspace changes are dirty and need verification.",
      resumeStep: failedStep,
    };
  }

  return {
    phase: "clear",
    requestedSteps: [],
    reason: "Workspace verification is clear.",
  };
}

function persistWorkspaceVerificationEvalCase(
  cwd: string,
  run: WorkspaceVerificationRunRecord,
  repeatedFailureCount: number,
  replanRequired: boolean,
  replanReason?: string,
): string {
  const plan = loadCurrentPlanSnapshot(cwd);
  const failedSteps = run.stepResults
    .filter((item) => !item.success && !item.skipped)
    .map((item) => ({
      step: item.step,
      command: item.command,
      error: item.error,
      artifactPath: item.artifactPath,
    }));
  const fingerprint = computeFailureFingerprint(run);
  const record: WorkspaceVerificationEvalCase = {
    savedAt: nowIso(),
    fingerprint,
    repeatedFailureCount,
    replanRequired,
    replanReason,
    artifactDir: run.artifactDir,
    profile: (run.resolvedPlan ?? createEmptyResolvedPlan()).profile,
    recommendedSteps: (run.resolvedPlan ?? createEmptyResolvedPlan()).recommendedSteps,
    acceptanceCriteria: (run.resolvedPlan ?? createEmptyResolvedPlan()).acceptanceCriteria,
    proofArtifacts: (run.resolvedPlan ?? createEmptyResolvedPlan()).proofArtifacts,
    fileModuleImpact: plan.fileModuleImpact.length > 0 ? plan.fileModuleImpact : (run.resolvedPlan ?? createEmptyResolvedPlan()).acceptanceCriteria,
    failedSteps,
  };
  const evalDir = ensureVerificationEvalDir(cwd);
  const path = join(evalDir, `${run.finishedAt.slice(0, 19).replace(/[:T]/g, "-")}-${sanitizeSegment(fingerprint)}.json`);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return path;
}

export function persistWorkspaceVerificationContinuityPack(
  cwd: string,
  state: WorkspaceVerificationState,
  resolvedPlan?: WorkspaceVerificationResolvedPlan,
): string {
  const plan = loadCurrentPlanSnapshot(cwd);
  const resume = resolveWorkspaceVerificationResumePlan(state, resolvedPlan);
  const unresolvedFailures = (state.lastRun?.stepResults ?? [])
    .filter((item) => !item.success && !item.skipped)
    .map((item) => ({
      step: item.step,
      error: item.error,
      artifactPath: item.artifactPath,
    }));
  const payload = {
    updatedAt: nowIso(),
    nextSuggestedAction: deriveNextSuggestedAction(state),
    resume,
    state: {
      dirty: state.dirty,
      pendingProofReview: state.pendingProofReview,
      pendingReviewArtifact: state.pendingReviewArtifact,
      replanRequired: state.replanRequired,
      repeatedFailureCount: state.repeatedFailureCount,
      lastWriteAt: state.lastWriteAt,
      lastVerifiedAt: state.lastVerifiedAt,
      lastReviewedAt: state.lastReviewedAt,
      lastReviewArtifactAt: state.lastReviewArtifactAt,
      lastReviewArtifactPath: state.lastReviewArtifactPath,
      lastReviewDecision: state.lastReviewDecision,
      lastArtifactDir: state.lastRun?.artifactDir,
      lastFailureFingerprint: state.lastFailureFingerprint,
      replanReason: state.replanReason,
      lastEvalCasePath: state.lastEvalCasePath,
      lastMutationCheckpointId: state.lastMutationCheckpointId,
      lastFailureCheckpointId: state.lastFailureCheckpointId,
      trajectoryPath: state.trajectoryPath,
      lastTrajectoryEventAt: state.lastTrajectoryEventAt,
    },
    plan,
    resolvedPlan: resolvedPlan ? {
      profile: resolvedPlan.profile,
      recommendedSteps: resolvedPlan.recommendedSteps,
      proofArtifacts: resolvedPlan.proofArtifacts,
      reasons: resolvedPlan.reasons,
    } : undefined,
    unresolvedFailures,
  };
  const path = join(ensureVerificationWorkspaceDir(cwd), "continuity.json");
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return path;
}

export function createWorkspaceVerificationReplayInput(
  cwd: string,
  state: WorkspaceVerificationState,
  resolvedPlan?: WorkspaceVerificationResolvedPlan,
): WorkspaceVerificationReplayInput {
  const plan = loadCurrentPlanSnapshot(cwd);
  const resume = resolveWorkspaceVerificationResumePlan(state, resolvedPlan);
  return {
    summary: {
      profile: resolvedPlan?.profile ?? state.lastRun?.resolvedPlan.profile,
      currentStep: plan.currentStep,
      nextSuggestedAction: deriveNextSuggestedAction(state),
      resumePhase: resume.phase,
      resumeStep: resume.resumeStep,
      artifactDir: state.lastRun?.artifactDir,
      continuityPath: state.continuityPath,
      trajectoryPath: state.trajectoryPath,
    },
    plan,
    state,
    resolvedPlan: resolvedPlan ? {
      profile: resolvedPlan.profile,
      recommendedSteps: resolvedPlan.recommendedSteps,
      proofArtifacts: resolvedPlan.proofArtifacts,
      reasons: resolvedPlan.reasons,
    } : undefined,
    trajectory: loadWorkspaceVerificationTrajectory(cwd),
  };
}

export function formatWorkspaceVerificationTrajectory(
  replay: WorkspaceVerificationReplayInput,
): string {
  const lines = [
    "# Workspace Verification Trajectory",
    "",
    `profile: ${replay.summary.profile ?? "-"}`,
    `current_step: ${replay.summary.currentStep ?? "-"}`,
    `next_action: ${replay.summary.nextSuggestedAction}`,
    `resume_phase: ${replay.summary.resumePhase}`,
    `resume_step: ${replay.summary.resumeStep ?? "-"}`,
    `artifact_dir: ${replay.summary.artifactDir ?? "-"}`,
    `continuity_path: ${replay.summary.continuityPath ?? "-"}`,
    `trajectory_path: ${replay.summary.trajectoryPath ?? "-"}`,
    "",
    "events:",
  ];

  for (const entry of replay.trajectory.slice(-10)) {
    lines.push(`- ${entry.timestamp} [${entry.kind}] ${entry.summary}`);
  }

  return `${lines.join("\n")}\n`;
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

  if (run.resolvedPlan.proofArtifacts.length > 0) {
    lines.push("", "proof_artifacts:");
    for (const item of run.resolvedPlan.proofArtifacts) {
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
  const resume = resolveWorkspaceVerificationResumePlan(state, resolvedPlan);
  const lines = [
    `enabled=${config.enabled}`,
    `adaptive_defaults=${config.adaptiveDefaults}`,
    `profile=${config.profile}`,
    `auto_detect_runbook=${config.autoDetectRunbook}`,
    `auto_run=${config.autoRunOnTurnEnd}`,
    `gate_mode=${config.gateMode}`,
    `require_proof_review=${config.requireProofReview}`,
    `require_review_artifact=${config.requireReviewArtifact}`,
    `auto_require_review_artifact=${config.autoRequireReviewArtifact}`,
    `require_replan_on_repeated_failure=${config.requireReplanOnRepeatedFailure}`,
    `enable_eval_corpus=${config.enableEvalCorpus}`,
    `checkpoint_on_mutation=${config.checkpointOnMutation}`,
    `checkpoint_on_failure=${config.checkpointOnFailure}`,
    `anti_loop_threshold=${config.antiLoopThreshold}`,
    `dirty=${state.dirty}`,
    `running=${state.running}`,
    `pending_proof_review=${state.pendingProofReview}`,
    `pending_review_artifact=${state.pendingReviewArtifact}`,
    `replan_required=${state.replanRequired}`,
    `resume_phase=${resume.phase}`,
    `resume_step=${resume.resumeStep ?? "-"}`,
    `write_count=${state.writeCount}`,
    `repeated_failure_count=${state.repeatedFailureCount}`,
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
      `recommended_steps=${resolvedPlan.recommendedSteps.join(",") || "-"}`,
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

  if (state.lastReviewedAt) {
    lines.push(`last_reviewed_at=${state.lastReviewedAt}`);
  }
  if (state.lastReviewedArtifactDir) {
    lines.push(`last_reviewed_artifact_dir=${state.lastReviewedArtifactDir}`);
  }
  if (state.lastReviewArtifactAt) {
    lines.push(`last_review_artifact_at=${state.lastReviewArtifactAt}`);
  }
  if (state.lastReviewArtifactPath) {
    lines.push(`last_review_artifact_path=${state.lastReviewArtifactPath}`);
  }
  if (state.lastReviewDecision) {
    lines.push(`last_review_decision=${state.lastReviewDecision}`);
  }
  if (state.lastReviewRationale) {
    lines.push(`last_review_rationale=${state.lastReviewRationale}`);
  }
  if (state.lastReplanAt) {
    lines.push(`last_replan_at=${state.lastReplanAt}`);
  }
  if (state.lastRepairStrategy) {
    lines.push(`last_repair_strategy=${state.lastRepairStrategy}`);
  }
  if (state.lastMutationCheckpointId) {
    lines.push(`last_mutation_checkpoint=${state.lastMutationCheckpointId}`);
  }
  if (state.lastFailureCheckpointId) {
    lines.push(`last_failure_checkpoint=${state.lastFailureCheckpointId}`);
  }
  if (state.lastFailureFingerprint) {
    lines.push(`last_failure_fingerprint=${state.lastFailureFingerprint}`);
  }
  if (state.replanReason) {
    lines.push(`replan_reason=${state.replanReason}`);
  }
  if (state.lastEvalCasePath) {
    lines.push(`last_eval_case=${state.lastEvalCasePath}`);
  }
  if (state.continuityPath) {
    lines.push(`continuity_path=${state.continuityPath}`);
  }
  if (state.trajectoryPath) {
    lines.push(`trajectory_path=${state.trajectoryPath}`);
  }
  if (state.lastTrajectoryEventAt) {
    lines.push(`last_trajectory_event_at=${state.lastTrajectoryEventAt}`);
  }

  if (resolvedPlan?.reasons.length) {
    lines.push("relevant_verification_reasons:");
    for (const item of resolvedPlan.reasons) {
      lines.push(`- ${item}`);
    }
  }

  if (resolvedPlan?.proofArtifacts.length) {
    lines.push("required_proof_artifacts:");
    for (const item of resolvedPlan.proofArtifacts) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}
