/**
 * path: .pi/lib/autoresearch-tbench.ts
 * role: terminal-bench 向け autoresearch の状態管理、評価、実行をまとめる
 * why: init 時点で固定した task 集合に対して、成功率優先で改善ループを安定比較するため
 * related: scripts/autoresearch-tbench.ts, .pi/extensions/autoresearch-tbench.ts, scripts/run-terminal-bench.sh, tests/unit/lib/autoresearch-tbench.test.ts
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  collectAutoresearchTbenchLiveSnapshot,
  type AutoresearchTbenchLiveSnapshot,
} from "./autoresearch-tbench-live-monitor.js";
import { getLogger } from "./comprehensive-logger.js";
import { ConfigurationError } from "./core/errors.js";

export interface AutoresearchTbenchScore {
  successCount: number;
  completedTrials: number;
  totalTrials: number;
  errorCount: number;
  meanReward: number;
  elapsedMs: number;
}

export interface AutoresearchTbenchReportSummary {
  score: AutoresearchTbenchScore;
  raw: unknown;
  rewardBuckets: Record<string, string[]>;
  exceptionBuckets: Record<string, string[]>;
}

export type AutoresearchTbenchOutcome =
  | "baseline"
  | "improved"
  | "equal"
  | "regressed"
  | "crash"
  | "timeout"
  | "stopped";

export interface AutoresearchTbenchRunConfig {
  taskSelector: string | null;
  taskNames: string[];
  dataset: string | null;
  datasetPath: string | null;
  agent: string;
  agentImportPath: string | null;
  model: string | null;
  nConcurrent: number | null;
  jobsDir: string;
  agentSetupTimeoutMultiplier: number | null;
  forceBuild: boolean | null;
  excludeTaskNames: string[];
}

export interface AutoresearchTbenchState {
  version: number;
  createdAt: string;
  updatedAt: string;
  tag: string;
  gitEnabled: boolean;
  bestCommit: string;
  baselineCommit: string;
  runConfig: AutoresearchTbenchRunConfig;
  bestScore?: AutoresearchTbenchScore;
  experimentCount: number;
  lastOutcome?: AutoresearchTbenchOutcome;
  lastLabel?: string;
  lastLogPath?: string;
  lastJobDir?: string;
  lastResultPath?: string;
  activeRun?: {
    pid: number;
    label: string;
    startedAt: string;
  };
  stopRequestedAt?: string;
}

export interface AutoresearchTbenchPaths {
  rootDir: string;
  statePath: string;
  resultsTsvPath: string;
  experimentsDir: string;
  jobsDir: string;
}

export interface AutoresearchTbenchInitOptions {
  selection?: string;
  taskNames?: string[];
  tag?: string;
  git?: boolean;
  dataset?: string;
  datasetPath?: string;
  agent?: string;
  agentImportPath?: string;
  model?: string;
  nConcurrent?: number;
  jobsDir?: string;
  agentSetupTimeoutMultiplier?: number;
  forceBuild?: boolean | null;
  excludeTaskNames?: string[];
}

export interface AutoresearchTbenchRunOptions {
  label?: string;
  timeoutMs?: number;
  preferMs?: number;
  commitMessage?: string;
  onSnapshot?: (snapshot: AutoresearchTbenchLiveSnapshot) => void;
  onTextUpdate?: (text: string) => void;
}

interface RunControlState {
  stopRequested: boolean;
}

export interface AutoresearchTbenchRunArtifacts {
  experimentDir: string;
  logPath: string;
  summaryPath: string;
}

export interface AutoresearchTbenchExecutedRun {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
  artifacts: AutoresearchTbenchRunArtifacts;
  jobDir: string | null;
  resultPath: string | null;
  summary: AutoresearchTbenchReportSummary | null;
}

export interface AutoresearchTbenchInitResult {
  branchName: string;
  headCommit: string;
  state: AutoresearchTbenchState;
}

export interface AutoresearchTbenchStatusResult {
  state: AutoresearchTbenchState | null;
  paths: AutoresearchTbenchPaths;
}

export interface AutoresearchTbenchStopResult {
  requested: boolean;
  state: AutoresearchTbenchState | null;
  reason: string;
}

export interface AutoresearchTbenchRunResult {
  outcome: AutoresearchTbenchOutcome;
  score: AutoresearchTbenchScore | null;
  state: AutoresearchTbenchState;
  run: AutoresearchTbenchExecutedRun;
  commit: string;
  preferredBudgetExceeded: boolean;
}

interface SpawnCaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  stopped: boolean;
}

interface JobReportLike {
  started_at?: unknown;
  finished_at?: unknown;
  n_total_trials?: unknown;
  stats?: {
    n_trials?: unknown;
    n_errors?: unknown;
    evals?: Record<string, {
      n_trials?: unknown;
      n_errors?: unknown;
      metrics?: Array<{ mean?: unknown }>;
      reward_stats?: {
        reward?: Record<string, unknown>;
      };
      exception_stats?: Record<string, unknown>;
    }>;
  };
}

const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000;
const DEFAULT_PREFER_MS = 20 * 60 * 1000;

// Initialize ComprehensiveLogger for experiment events
const logger = getLogger();

/**
 * Convert tbench score to e2e-compatible format for ComprehensiveLogger
 * tbench: successCount, errorCount, totalTrials, elapsedMs
 * e2e: passed, failed, total, durationMs
 */
function tbenchScoreToE2EFormat(score: AutoresearchTbenchScore): {
  failed: number;
  passed: number;
  total: number;
  durationMs: number;
} {
  return {
    passed: score.successCount,
    failed: score.errorCount,
    total: score.totalTrials,
    durationMs: score.elapsedMs,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function ensureParentDir(path: string): void {
  ensureDir(dirname(path));
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.trunc(parsed);
}

function toNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeCsvList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => normalizeCsvList(entry))
      .filter((entry, index, array) => array.indexOf(entry) === index);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, array) => array.indexOf(entry) === index);
}

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (value === undefined || value === "") {
    return null;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return true;
  }
  if (value === "0" || value.toLowerCase() === "false") {
    return false;
  }
  return null;
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "experiment";
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseDurationMs(startedAt: unknown, finishedAt: unknown): number {
  if (typeof startedAt !== "string" || typeof finishedAt !== "string") {
    return 0;
  }
  const startedMs = Date.parse(startedAt);
  const finishedMs = Date.parse(finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs) || finishedMs < startedMs) {
    return 0;
  }
  return finishedMs - startedMs;
}

function getPrimaryEval(report: JobReportLike) {
  const evals = report.stats?.evals;
  if (!evals || typeof evals !== "object") {
    return null;
  }
  const firstKey = Object.keys(evals)[0];
  if (!firstKey) {
    return null;
  }
  return evals[firstKey] ?? null;
}

function normalizeStringArrayBucket(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function parseTerminalBenchJobReport(raw: string): AutoresearchTbenchReportSummary {
  const parsed = JSON.parse(raw) as JobReportLike;
  const primaryEval = getPrimaryEval(parsed);
  const rewardBuckets = Object.fromEntries(
    Object.entries(primaryEval?.reward_stats?.reward ?? {}).map(([reward, value]) => [
      reward,
      normalizeStringArrayBucket(value),
    ]),
  );
  const exceptionBuckets = Object.fromEntries(
    Object.entries(primaryEval?.exception_stats ?? {}).map(([exception, value]) => [
      exception,
      normalizeStringArrayBucket(value),
    ]),
  );

  const successCount = Object.entries(rewardBuckets).reduce((sum, [reward, trials]) => {
    const rewardValue = Number(reward);
    if (!Number.isFinite(rewardValue) || rewardValue < 1) {
      return sum;
    }
    return sum + trials.length;
  }, 0);

  const score: AutoresearchTbenchScore = {
    successCount,
    completedTrials: toNonNegativeInteger(primaryEval?.n_trials ?? parsed.stats?.n_trials),
    totalTrials: toNonNegativeInteger(parsed.n_total_trials),
    errorCount: toNonNegativeInteger(primaryEval?.n_errors ?? parsed.stats?.n_errors),
    meanReward: toNumberOrNull(primaryEval?.metrics?.[0]?.mean) ?? 0,
    elapsedMs: parseDurationMs(parsed.started_at, parsed.finished_at),
  };

  return {
    score,
    raw: parsed,
    rewardBuckets,
    exceptionBuckets,
  };
}

export function compareAutoresearchTbenchScores(
  candidate: AutoresearchTbenchScore,
  incumbent: AutoresearchTbenchScore,
): number {
  if (candidate.successCount !== incumbent.successCount) {
    return candidate.successCount > incumbent.successCount ? 1 : -1;
  }

  if (candidate.meanReward !== incumbent.meanReward) {
    return candidate.meanReward > incumbent.meanReward ? 1 : -1;
  }

  if (candidate.errorCount !== incumbent.errorCount) {
    return candidate.errorCount < incumbent.errorCount ? 1 : -1;
  }

  if (candidate.completedTrials !== incumbent.completedTrials) {
    return candidate.completedTrials > incumbent.completedTrials ? 1 : -1;
  }

  if (candidate.elapsedMs !== incumbent.elapsedMs) {
    return candidate.elapsedMs < incumbent.elapsedMs ? 1 : -1;
  }

  return 0;
}

export function determineAutoresearchTbenchOutcome(
  candidate: AutoresearchTbenchScore,
  incumbent?: AutoresearchTbenchScore,
): AutoresearchTbenchOutcome {
  if (!incumbent) {
    return "baseline";
  }

  const comparison = compareAutoresearchTbenchScores(candidate, incumbent);
  if (comparison > 0) {
    return "improved";
  }
  if (comparison < 0) {
    return "regressed";
  }
  return "equal";
}

export function formatAutoresearchTbenchScore(score: AutoresearchTbenchScore): string {
  return [
    `success=${score.successCount}`,
    `completed=${score.completedTrials}/${score.totalTrials}`,
    `mean_reward=${score.meanReward.toFixed(4)}`,
    `errors=${score.errorCount}`,
    `elapsed_ms=${score.elapsedMs}`,
  ].join(" ");
}

export function getAutoresearchTbenchPaths(cwd: string): AutoresearchTbenchPaths {
  const rootDir = resolve(cwd, ".pi", "autoresearch", "tbench");
  return {
    rootDir,
    statePath: join(rootDir, "state.json"),
    resultsTsvPath: join(rootDir, "results.tsv"),
    experimentsDir: join(rootDir, "experiments"),
    jobsDir: join(rootDir, "jobs"),
  };
}

export function readAutoresearchTbenchState(cwd: string): AutoresearchTbenchState | null {
  const { statePath } = getAutoresearchTbenchPaths(cwd);
  if (!existsSync(statePath)) {
    return null;
  }
  return JSON.parse(readFileSync(statePath, "utf-8")) as AutoresearchTbenchState;
}

export function writeAutoresearchTbenchState(cwd: string, state: AutoresearchTbenchState): void {
  const { statePath } = getAutoresearchTbenchPaths(cwd);
  ensureParentDir(statePath);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function markActiveRun(cwd: string, state: AutoresearchTbenchState, label: string, pid: number): AutoresearchTbenchState {
  const nextState = cloneState(state);
  nextState.updatedAt = nowIso();
  nextState.activeRun = {
    pid,
    label,
    startedAt: nowIso(),
  };
  delete nextState.stopRequestedAt;
  writeAutoresearchTbenchState(cwd, nextState);
  return nextState;
}

function clearActiveRun(cwd: string, state: AutoresearchTbenchState): AutoresearchTbenchState {
  const nextState = cloneState(state);
  nextState.updatedAt = nowIso();
  delete nextState.activeRun;
  delete nextState.stopRequestedAt;
  writeAutoresearchTbenchState(cwd, nextState);
  return nextState;
}

function isStopRequested(cwd: string): boolean {
  const state = readAutoresearchTbenchState(cwd);
  return typeof state?.stopRequestedAt === "string";
}

export function requestStopAutoresearchTbench(cwd: string): AutoresearchTbenchStopResult {
  const state = readAutoresearchTbenchState(cwd);
  if (!state) {
    return {
      requested: false,
      state: null,
      reason: "state not initialized",
    };
  }

  if (!state.activeRun || !isProcessAlive(state.activeRun.pid)) {
    const cleared = clearActiveRun(cwd, state);
    return {
      requested: false,
      state: cleared,
      reason: "no active autoresearch-tbench run",
    };
  }

  const nextState = cloneState(state);
  nextState.updatedAt = nowIso();
  nextState.stopRequestedAt = nowIso();
  writeAutoresearchTbenchState(cwd, nextState);

  return {
    requested: true,
    state: nextState,
    reason: `stop requested for pid=${state.activeRun.pid}`,
  };
}

function ensureResultsHeader(cwd: string): void {
  const { resultsTsvPath } = getAutoresearchTbenchPaths(cwd);
  if (existsSync(resultsTsvPath)) {
    return;
  }

  ensureParentDir(resultsTsvPath);
  appendFileSync(
    resultsTsvPath,
    "timestamp\tlabel\toutcome\tsuccess_count\tcompleted_trials\ttotal_trials\tmean_reward\terror_count\telapsed_ms\tcommit\tjob_dir\tlog_path\tresult_path\n",
    "utf-8",
  );
}

function appendResultRow(
  cwd: string,
  label: string,
  outcome: AutoresearchTbenchOutcome,
  score: AutoresearchTbenchScore | null,
  commit: string,
  run: AutoresearchTbenchExecutedRun,
): void {
  const { resultsTsvPath } = getAutoresearchTbenchPaths(cwd);
  ensureResultsHeader(cwd);
  appendFileSync(
    resultsTsvPath,
    [
      nowIso(),
      label,
      outcome,
      String(score?.successCount ?? -1),
      String(score?.completedTrials ?? -1),
      String(score?.totalTrials ?? -1),
      String(score?.meanReward ?? -1),
      String(score?.errorCount ?? -1),
      String(score?.elapsedMs ?? -1),
      commit,
      run.jobDir ?? "",
      run.artifacts.logPath,
      run.resultPath ?? "",
    ].join("\t") + "\n",
    "utf-8",
  );
}

async function spawnAndCapture(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    logPath?: string;
    controlState?: RunControlState;
    onSpawn?: (child: { pid?: number | undefined }) => void;
  },
): Promise<SpawnCaptureResult> {
  const timeoutMs = options.timeoutMs ?? 0;

  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    options.onSpawn?.(child);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let stopped = false;

    if (options.logPath) {
      ensureParentDir(options.logPath);
      writeFileSync(options.logPath, `$ ${[command, ...args].join(" ")}\n`, "utf-8");
    }

    const timer = timeoutMs > 0
      ? setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      }, timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      if (options.logPath) {
        appendFileSync(options.logPath, text, "utf-8");
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      if (options.logPath) {
        appendFileSync(options.logPath, text, "utf-8");
      }
    });

    child.on("close", (exitCode) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (options.controlState?.stopRequested) {
        stopped = true;
      }
      resolvePromise({
        stdout,
        stderr,
        exitCode,
        timedOut,
        stopped,
      });
    });
  });
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await spawnAndCapture("git", args, {
    cwd,
    env: process.env,
  });

  if (result.exitCode === 0) {
    return result.stdout.trim();
  }

  throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed with ${result.exitCode}`);
}

async function getHeadCommit(cwd: string): Promise<string> {
  return await runGit(cwd, ["rev-parse", "HEAD"]);
}

async function ensureCleanTree(cwd: string): Promise<void> {
  const status = await runGit(cwd, ["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error("autoresearch-tbench requires a clean git tree before init.");
  }
}

async function commitCurrentChanges(cwd: string, message: string): Promise<string> {
  const status = await runGit(cwd, ["status", "--porcelain"]);
  if (!status.trim()) {
    return await getHeadCommit(cwd);
  }
  await runGit(cwd, ["add", "-A"]);
  await runGit(cwd, ["commit", "-m", message]);
  return await getHeadCommit(cwd);
}

async function resetToCommit(cwd: string, commit: string): Promise<void> {
  await runGit(cwd, ["reset", "--hard", commit]);
}

async function resolveTaskNamesFromSelection(
  cwd: string,
  selection: string,
  datasetPath: string | null,
): Promise<string[]> {
  const scriptPath = resolve(cwd, "scripts", "resolve-terminal-bench-tasks.py");
  const args = [scriptPath, "--selection", selection];
  if (datasetPath) {
    args.push("--dataset-path", datasetPath);
  }

  const result = await spawnAndCapture("python3", args, {
    cwd,
    env: process.env,
  });

  if (result.exitCode !== 0) {
    const message = (result.stderr || result.stdout).trim() || "failed to resolve terminal-bench task selection";
    throw new Error(message);
  }

  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createRunArtifacts(cwd: string, label: string): AutoresearchTbenchRunArtifacts {
  const paths = getAutoresearchTbenchPaths(cwd);
  const stamp = nowIso().replace(/[:.]/g, "-");
  const experimentDir = join(paths.experimentsDir, `${stamp}-${sanitizeLabel(label)}`);
  ensureDir(experimentDir);

  return {
    experimentDir,
    logPath: join(experimentDir, "run.log"),
    summaryPath: join(experimentDir, "summary.json"),
  };
}

function parseResultPathFromOutput(output: string): string | null {
  const match = output.match(/Results written to (.+\/result\.json)/);
  return match?.[1]?.trim() ?? null;
}

function findLatestResultPath(jobsDir: string, startedAtMs: number): string | null {
  if (!existsSync(jobsDir)) {
    return null;
  }

  const candidates = readdirSync(jobsDir)
    .map((entry) => join(jobsDir, entry, "result.json"))
    .filter((entry) => existsSync(entry))
    .map((entry) => ({
      path: entry,
      mtimeMs: statSync(entry).mtimeMs,
    }))
    .filter((entry) => entry.mtimeMs >= startedAtMs - 1_000)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return candidates[0]?.path ?? null;
}

function readSummaryFromResultPath(resultPath: string | null): AutoresearchTbenchReportSummary | null {
  if (!resultPath || !existsSync(resultPath)) {
    return null;
  }
  return parseTerminalBenchJobReport(readFileSync(resultPath, "utf-8"));
}

function buildRunEnv(config: AutoresearchTbenchRunConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TBENCH_TASK_NAMES: config.taskNames.join(","),
    TBENCH_JOBS_DIR: config.jobsDir,
  };

  if (config.datasetPath) {
    env.TBENCH_DATASET_PATH = config.datasetPath;
    delete env.TBENCH_DATASET;
  } else if (config.dataset) {
    env.TBENCH_DATASET = config.dataset;
    delete env.TBENCH_DATASET_PATH;
  }

  env.TBENCH_AGENT = config.agent;
  if (config.agentImportPath) {
    env.TBENCH_AGENT_IMPORT_PATH = config.agentImportPath;
  }
  if (config.model) {
    env.TBENCH_MODEL = config.model;
  }
  if (config.nConcurrent !== null) {
    env.TBENCH_N_CONCURRENT = String(config.nConcurrent);
  }
  if (config.agentSetupTimeoutMultiplier !== null) {
    env.TBENCH_AGENT_SETUP_TIMEOUT_MULTIPLIER = String(config.agentSetupTimeoutMultiplier);
  }
  if (config.forceBuild !== null) {
    env.TBENCH_FORCE_BUILD = config.forceBuild ? "1" : "0";
  }
  env.TBENCH_EXCLUDE_TASK_NAMES = config.excludeTaskNames.join(",");
  delete env.TBENCH_DIFFICULTY_COUNTS;

  return env;
}

async function executeTerminalBenchRun(
  cwd: string,
  label: string,
  config: AutoresearchTbenchRunConfig,
  timeoutMs: number,
  hooks?: {
    onSnapshot?: (snapshot: AutoresearchTbenchLiveSnapshot) => void;
    onTextUpdate?: (text: string) => void;
  },
): Promise<AutoresearchTbenchExecutedRun> {
  const artifacts = createRunArtifacts(cwd, label);
  const command = "bash scripts/run-terminal-bench.sh";
  const startedAtMs = Date.now();
  const controlState: RunControlState = { stopRequested: false };
  let childPid = 0;
  const pollTimer = setInterval(() => {
    emitSnapshot();
    if (!controlState.stopRequested && isStopRequested(cwd) && childPid > 0) {
      controlState.stopRequested = true;
      hooks?.onTextUpdate?.("stop requested; terminating terminal-bench run");
      try {
        process.kill(childPid, "SIGTERM");
        setTimeout(() => {
          if (isProcessAlive(childPid)) {
            process.kill(childPid, "SIGKILL");
          }
        }, 5_000).unref();
      } catch {
        // best effort only
      }
    }
  }, 500);

  const emitSnapshot = () => {
    hooks?.onSnapshot?.(collectAutoresearchTbenchLiveSnapshot({
      label,
      jobsDir: config.jobsDir,
      taskNames: config.taskNames,
      startedAtMs,
    }));
  };

  emitSnapshot();
  const result = await spawnAndCapture("/bin/zsh", ["-lc", command], {
    cwd,
    env: buildRunEnv(config),
    timeoutMs,
    logPath: artifacts.logPath,
    controlState,
    onSpawn: (child) => {
      childPid = child.pid ?? 0;
      const currentState = readAutoresearchTbenchState(cwd);
      if (currentState && childPid > 0) {
        markActiveRun(cwd, currentState, label, childPid);
      }
    },
  });
  clearInterval(pollTimer);
  const currentState = readAutoresearchTbenchState(cwd);
  if (currentState) {
    clearActiveRun(cwd, currentState);
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const resultPath = parseResultPathFromOutput(combinedOutput)
    ?? findLatestResultPath(config.jobsDir, startedAtMs);
  const summary = readSummaryFromResultPath(resultPath);
  const jobDir = resultPath ? dirname(resultPath) : null;
  emitSnapshot();

  hooks?.onTextUpdate?.([
    `command=${command}`,
    `job_dir=${jobDir ?? "-"}`,
    `result_path=${resultPath ?? "-"}`,
    `exit_code=${result.exitCode ?? "-"}`,
    `timed_out=${result.timedOut ? "true" : "false"}`,
    `stopped=${result.stopped ? "true" : "false"}`,
  ].join("\n"));

  writeFileSync(
    artifacts.summaryPath,
    `${JSON.stringify({
      label,
      command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stopped: result.stopped,
      jobDir,
      resultPath,
      score: summary?.score ?? null,
      rewardBuckets: summary?.rewardBuckets ?? {},
      exceptionBuckets: summary?.exceptionBuckets ?? {},
    }, null, 2)}\n`,
    "utf-8",
  );

  return {
    command,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    stopped: result.stopped,
    artifacts,
    jobDir,
    resultPath,
    summary,
  };
}

function createDefaultRunConfig(cwd: string, options: AutoresearchTbenchInitOptions, taskNames: string[]): AutoresearchTbenchRunConfig {
  const defaultForceBuild = process.platform === "darwin" && process.arch === "arm64"
    ? true
    : null;
  const rawJobsDir = options.jobsDir ?? getAutoresearchTbenchPaths(cwd).jobsDir;

  return {
    taskSelector: options.selection?.trim() || null,
    taskNames,
    dataset: options.dataset ?? process.env.TBENCH_DATASET ?? "terminal-bench@2.0",
    datasetPath: options.datasetPath ? resolve(cwd, options.datasetPath) : (process.env.TBENCH_DATASET_PATH ? resolve(cwd, process.env.TBENCH_DATASET_PATH) : null),
    agent: options.agent ?? process.env.TBENCH_AGENT ?? "pi",
    agentImportPath: options.agentImportPath ?? process.env.TBENCH_AGENT_IMPORT_PATH ?? "bench.tbench_pi_agent.harbor_pi_agent:HarborPiAgent",
    model: options.model ?? process.env.TBENCH_MODEL ?? process.env.PI_TBENCH_MODEL ?? null,
    nConcurrent: options.nConcurrent ?? toNumberOrNull(process.env.TBENCH_N_CONCURRENT) ?? 2,
    jobsDir: resolve(cwd, rawJobsDir),
    agentSetupTimeoutMultiplier: options.agentSetupTimeoutMultiplier ?? toNumberOrNull(process.env.TBENCH_AGENT_SETUP_TIMEOUT_MULTIPLIER) ?? 4,
    forceBuild: options.forceBuild ?? parseBooleanEnv(process.env.TBENCH_FORCE_BUILD) ?? defaultForceBuild,
    excludeTaskNames: normalizeCsvList(options.excludeTaskNames ?? process.env.TBENCH_EXCLUDE_TASK_NAMES ?? "gpt2-codegolf"),
  };
}

/**
 * 実行設定の妥当性を検証
 * @summary 設定検証
 * @param config - 検証する設定
 * @throws {ConfigurationError} 無効な設定値の場合
 */
function validateRunConfig(config: AutoresearchTbenchRunConfig): void {
  // nConcurrent: 1以上の整数であること
  if (config.nConcurrent !== null && config.nConcurrent < 1) {
    throw new ConfigurationError(
      `nConcurrent must be >= 1, got ${config.nConcurrent}`,
      { key: "nConcurrent", expected: "positive integer" }
    );
  }

  // agentSetupTimeoutMultiplier: 1以上の整数であること
  if (config.agentSetupTimeoutMultiplier !== null && config.agentSetupTimeoutMultiplier < 1) {
    throw new ConfigurationError(
      `agentSetupTimeoutMultiplier must be >= 1, got ${config.agentSetupTimeoutMultiplier}`,
      { key: "agentSetupTimeoutMultiplier", expected: "positive integer" }
    );
  }

  // jobsDir: 親ディレクトリが存在すること（作成可能であること）
  const jobsDirParent = dirname(config.jobsDir);
  if (!existsSync(jobsDirParent)) {
    throw new ConfigurationError(
      `jobsDir parent directory does not exist: ${jobsDirParent}`,
      { key: "jobsDir", expected: "existing directory path" }
    );
  }

  // datasetPath: 指定されている場合、存在すること
  if (config.datasetPath && !existsSync(config.datasetPath)) {
    throw new ConfigurationError(
      `datasetPath does not exist: ${config.datasetPath}`,
      { key: "datasetPath", expected: "existing file path" }
    );
  }
}

function cloneState(state: AutoresearchTbenchState): AutoresearchTbenchState {
  return JSON.parse(JSON.stringify(state)) as AutoresearchTbenchState;
}

function resolveInitTaskNames(options: AutoresearchTbenchInitOptions, resolvedTaskNames: string[]): string[] {
  const explicitTaskNames = normalizeCsvList(options.taskNames);
  if (explicitTaskNames.length > 0) {
    return explicitTaskNames;
  }
  return resolvedTaskNames;
}

export async function initAutoresearchTbench(
  cwd: string,
  options: AutoresearchTbenchInitOptions = {},
): Promise<AutoresearchTbenchInitResult> {
  const gitEnabled = options.git ?? true;
  if (gitEnabled) {
    await ensureCleanTree(cwd);
  }

  const resolvedSelectionTaskNames = options.selection
    ? await resolveTaskNamesFromSelection(cwd, options.selection, options.datasetPath ?? null)
    : [];
  const taskNames = resolveInitTaskNames(options, resolvedSelectionTaskNames);
  if (taskNames.length === 0) {
    throw new Error("autoresearch-tbench init requires selection or task_names.");
  }

  const tag = sanitizeLabel(options.tag ?? "mekann-tbench");
  const branchName = `autoresearch/${tag}`;

  if (gitEnabled) {
    try {
      await runGit(cwd, ["rev-parse", "--verify", branchName]);
      await runGit(cwd, ["switch", branchName]);
    } catch {
      await runGit(cwd, ["switch", "-c", branchName]);
    }
  }

  const headCommit = await getHeadCommit(cwd);
  const runConfig = createDefaultRunConfig(cwd, options, taskNames);
  validateRunConfig(runConfig);

  const state: AutoresearchTbenchState = {
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    tag,
    gitEnabled,
    bestCommit: headCommit,
    baselineCommit: headCommit,
    runConfig,
    experimentCount: 0,
  };
  ensureDir(state.runConfig.jobsDir);
  writeAutoresearchTbenchState(cwd, state);

  // Emit experiment_start event
  logger.logExperimentStart({
    experimentType: 'tbench',
    label: tag,
    tag,
    branch: branchName,
    targetCommit: headCommit,
    config: {
      taskNames,
      dataset: state.runConfig.dataset ?? undefined,
      agent: state.runConfig.agent,
      model: state.runConfig.model ?? undefined,
      nConcurrent: state.runConfig.nConcurrent ?? undefined,
    },
  });
  await logger.flush();

  return {
    branchName,
    headCommit,
    state,
  };
}

export async function getAutoresearchTbenchStatus(cwd: string): Promise<AutoresearchTbenchStatusResult> {
  return {
    state: readAutoresearchTbenchState(cwd),
    paths: getAutoresearchTbenchPaths(cwd),
  };
}

async function runBaselineLike(
  cwd: string,
  state: AutoresearchTbenchState,
  options: AutoresearchTbenchRunOptions,
): Promise<AutoresearchTbenchRunResult> {
  const label = options.label ?? "baseline";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const commit = await getHeadCommit(cwd);
  const run = await executeTerminalBenchRun(cwd, `${label}-baseline`, state.runConfig, timeoutMs, {
    onSnapshot: options.onSnapshot,
    onTextUpdate: options.onTextUpdate,
  });

  if (run.stopped) {
    const nextState = cloneState(state);
    nextState.updatedAt = nowIso();
    nextState.experimentCount += 1;
    nextState.lastOutcome = "stopped";
    nextState.lastLabel = label;
    nextState.lastLogPath = run.artifacts.logPath;
    nextState.lastJobDir = run.jobDir ?? undefined;
    nextState.lastResultPath = run.resultPath ?? undefined;
    writeAutoresearchTbenchState(cwd, nextState);
    appendResultRow(cwd, label, "stopped", null, commit, run);

    // Emit experiment_stop event and flush
    logger.logExperimentStop({
      experimentType: 'tbench',
      label,
      iteration: state.experimentCount + 1,
      reason: 'user_requested',
    });
    await logger.flush();

    return {
      outcome: "stopped",
      score: null,
      state: nextState,
      run,
      commit,
      preferredBudgetExceeded: false,
    };
  }

  if (run.timedOut) {
    throw new Error("baseline timed out");
  }
  if (!run.summary) {
    throw new Error("baseline result.json was not produced");
  }

  const nextState = cloneState(state);
  nextState.updatedAt = nowIso();
  nextState.bestCommit = commit;
  nextState.baselineCommit = commit;
  nextState.bestScore = run.summary.score;
  nextState.experimentCount += 1;
  nextState.lastOutcome = "baseline";
  nextState.lastLabel = label;
  nextState.lastLogPath = run.artifacts.logPath;
  nextState.lastJobDir = run.jobDir ?? undefined;
  nextState.lastResultPath = run.resultPath ?? undefined;
  writeAutoresearchTbenchState(cwd, nextState);
  appendResultRow(cwd, label, "baseline", run.summary.score, commit, run);

  // Emit experiment_baseline event
  logger.logExperimentBaseline({
    experimentType: 'tbench',
    label,
    score: tbenchScoreToE2EFormat(run.summary.score),
    commit,
  });
  await logger.flush();

  return {
    outcome: "baseline",
    score: run.summary.score,
    state: nextState,
    run,
    commit,
    preferredBudgetExceeded: (options.preferMs ?? DEFAULT_PREFER_MS) > 0
      && run.summary.score.elapsedMs > (options.preferMs ?? DEFAULT_PREFER_MS),
  };
}

export async function baselineAutoresearchTbench(
  cwd: string,
  options: AutoresearchTbenchRunOptions = {},
): Promise<AutoresearchTbenchRunResult> {
  const state = readAutoresearchTbenchState(cwd);
  if (!state) {
    throw new Error("state not initialized. Run init first.");
  }
  return await runBaselineLike(cwd, state, options);
}

export async function runAutoresearchTbench(
  cwd: string,
  options: AutoresearchTbenchRunOptions = {},
): Promise<AutoresearchTbenchRunResult> {
  const state = readAutoresearchTbenchState(cwd);
  if (!state) {
    throw new Error("state not initialized. Run init first.");
  }
  if (!state.bestScore) {
    throw new Error("baseline missing. Run baseline first.");
  }

  const label = options.label ?? "experiment";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const preferMs = options.preferMs ?? DEFAULT_PREFER_MS;
  const candidateBaseCommit = await getHeadCommit(cwd);

  // Emit experiment_run event
  logger.logExperimentRun({
    experimentType: 'tbench',
    label,
    iteration: state.experimentCount + 1,
    commit: candidateBaseCommit,
  });
  await logger.flush();

  const run = await executeTerminalBenchRun(cwd, label, state.runConfig, timeoutMs, {
    onSnapshot: options.onSnapshot,
    onTextUpdate: options.onTextUpdate,
  });

  let outcome: AutoresearchTbenchOutcome = "crash";
  let score: AutoresearchTbenchScore | null = null;

  if (run.stopped) {
    outcome = "stopped";
    // Emit experiment_stop event and flush
    logger.logExperimentStop({
      experimentType: 'tbench',
      label,
      iteration: state.experimentCount + 1,
      reason: 'user_requested',
    });
    await logger.flush();
  } else if (run.timedOut) {
    outcome = "timeout";
    // Emit experiment_timeout event
    logger.logExperimentTimeout({
      experimentType: 'tbench',
      label,
      iteration: state.experimentCount + 1,
      timeoutMs,
    });
    await logger.flush();
  } else if (run.summary) {
    score = run.summary.score;
    outcome = determineAutoresearchTbenchOutcome(score, state.bestScore);
  } else {
    // Crash case: no summary produced
    outcome = "crash";
    // Emit experiment_crash event and flush
    logger.logExperimentCrash({
      experimentType: 'tbench',
      label,
      iteration: state.experimentCount + 1,
      error: run.stderr?.slice(0, 500) || 'No result.json produced',
    });
    await logger.flush();
  }

  const nextState = cloneState(state);
  nextState.updatedAt = nowIso();
  nextState.experimentCount += 1;
  nextState.lastOutcome = outcome;
  nextState.lastLabel = label;
  nextState.lastLogPath = run.artifacts.logPath;
  nextState.lastJobDir = run.jobDir ?? undefined;
  nextState.lastResultPath = run.resultPath ?? undefined;

  let commit = candidateBaseCommit;

  if (outcome === "improved" && score) {
    if (state.gitEnabled) {
      const commitMessage = options.commitMessage
        || `autoresearch(tbench): ${label} [success=${score.successCount}, mean=${score.meanReward.toFixed(4)}]`;
      commit = await commitCurrentChanges(cwd, commitMessage);
    }

    nextState.bestCommit = commit;
    nextState.bestScore = score;
    writeAutoresearchTbenchState(cwd, nextState);
    appendResultRow(cwd, label, outcome, score, commit, run);

    // Emit experiment_improved event
    const previousScore = state.bestScore;
    let improvementType: 'fewer_failures' | 'more_passes' | 'faster' = 'more_passes';
    if (score.successCount > previousScore.successCount) {
      improvementType = 'more_passes';
    } else if (score.errorCount < previousScore.errorCount) {
      improvementType = 'fewer_failures';
    } else {
      improvementType = 'faster';
    }

    logger.logExperimentImproved({
      experimentType: 'tbench',
      label,
      previousScore: tbenchScoreToE2EFormat(previousScore),
      newScore: tbenchScoreToE2EFormat(score),
      commit,
      improvementType,
    });
    await logger.flush();

    return {
      outcome,
      score,
      state: nextState,
      run,
      commit,
      preferredBudgetExceeded: preferMs > 0 && score.elapsedMs > preferMs,
    };
  }

  // Emit experiment_regressed event for non-improved outcomes with score
  if (outcome === "regressed" && score) {
    const previousScore = state.bestScore;
    let regressionType: 'more_failures' | 'fewer_passes' | 'slower' = 'more_failures';
    if (score.errorCount > previousScore.errorCount) {
      regressionType = 'more_failures';
    } else if (score.successCount < previousScore.successCount) {
      regressionType = 'fewer_passes';
    } else {
      regressionType = 'slower';
    }

    logger.logExperimentRegressed({
      experimentType: 'tbench',
      label,
      previousScore: tbenchScoreToE2EFormat(previousScore),
      newScore: tbenchScoreToE2EFormat(score),
      regressionType,
      reverted: state.gitEnabled,
    });
    await logger.flush();
  }

  if (state.gitEnabled) {
    await resetToCommit(cwd, state.bestCommit);
    commit = state.bestCommit;
  }

  writeAutoresearchTbenchState(cwd, nextState);
  appendResultRow(cwd, label, outcome, score, commit, run);

  // Emit experiment_regressed event for non-improved outcomes with score
  if (outcome === "regressed" && score) {
    const previousScore = state.bestScore;
    let regressionType: 'more_failures' | 'fewer_passes' | 'slower';
    if (score.errorCount > previousScore.errorCount) {
      regressionType = 'more_failures';
    } else if (score.successCount < previousScore.successCount) {
      regressionType = 'fewer_passes';
    } else {
      regressionType = 'slower';
    }

    logger.logExperimentRegressed({
      experimentType: 'tbench',
      label,
      previousScore: tbenchScoreToE2EFormat(previousScore),
      newScore: tbenchScoreToE2EFormat(score),
      regressionType,
      reverted: state.gitEnabled,
    });
    await logger.flush();
  }

  return {
    outcome,
    score,
    state: nextState,
    run,
    commit,
    preferredBudgetExceeded: preferMs > 0 && !!score && score.elapsedMs > preferMs,
  };
}

export function renderAutoresearchTbenchStatus(result: AutoresearchTbenchStatusResult): string {
  if (!result.state) {
    return "state=missing";
  }

  const { state } = result;
  return [
    `tag=${state.tag}`,
    `git_enabled=${state.gitEnabled ? "true" : "false"}`,
    `best_commit=${state.bestCommit}`,
    `baseline_commit=${state.baselineCommit}`,
    `experiments=${state.experimentCount}`,
    `last_outcome=${state.lastOutcome ?? "-"}`,
    `last_label=${state.lastLabel ?? "-"}`,
    `active_run=${state.activeRun ? `${state.activeRun.label}:${state.activeRun.pid}` : "-"}`,
    `stop_requested_at=${state.stopRequestedAt ?? "-"}`,
    `best_score=${state.bestScore ? formatAutoresearchTbenchScore(state.bestScore) : "-"}`,
    `task_selector=${state.runConfig.taskSelector ?? "-"}`,
    `task_count=${state.runConfig.taskNames.length}`,
    `tasks=${state.runConfig.taskNames.join(",")}`,
    `dataset=${state.runConfig.dataset ?? "-"}`,
    `dataset_path=${state.runConfig.datasetPath ?? "-"}`,
    `model=${state.runConfig.model ?? "-"}`,
    `n_concurrent=${state.runConfig.nConcurrent ?? "-"}`,
    `jobs_dir=${state.runConfig.jobsDir}`,
  ].join("\n");
}
