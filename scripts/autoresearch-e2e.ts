/**
 * path: scripts/autoresearch-e2e.ts
 * role: e2e 実験の baseline/run/status を管理し、改善時 commit・退行時 reset を機械的に行う
 * why: autoresearch 型の overnight loop を mekann の repo で安全に再開可能な形で回すため
 * related: .pi/lib/autoresearch-e2e.ts, .pi/skills/autoresearch-e2e/SKILL.md, tests/unit/lib/autoresearch-e2e.test.ts, tests/e2e/README.md
 */

import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  determineAutoresearchOutcome,
  formatAutoresearchScore,
  parseVitestJsonReport,
  type AutoresearchE2EOutcome,
  type AutoresearchE2EScore,
} from "../.pi/lib/autoresearch-e2e.js";
import { ComprehensiveLogger } from "../.pi/lib/comprehensive-logger.js";

interface CliOptions {
  command: string;
  label: string;
  tag: string;
  timeoutMs: number;
  preferMs: number;
  commitMessage: string;
  git: boolean;
}

interface ExperimentState {
  version: number;
  createdAt: string;
  updatedAt: string;
  tag: string;
  bestCommit: string;
  baselineCommit: string;
  command: string;
  bestScore?: AutoresearchE2EScore;
  experimentCount: number;
  lastOutcome?: AutoresearchE2EOutcome;
  lastLabel?: string;
  lastLogPath?: string;
}

interface RunArtifacts {
  experimentDir: string;
  reportPath: string;
  logPath: string;
}

const ROOT = process.cwd();
const STATE_PATH = resolve(ROOT, ".pi", "autoresearch", "e2e", "state.json");
const RESULTS_TSV_PATH = resolve(ROOT, ".pi", "autoresearch", "e2e", "results.tsv");
const DEFAULT_COMMAND = "npx vitest run tests/e2e --reporter=json";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_PREFER_MS = 5 * 60 * 1000;

// Initialize ComprehensiveLogger for experiment events
const logger = new ComprehensiveLogger();

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function parseArgs(argv: string[]): { subcommand: string; options: CliOptions } {
  const [subcommand = "status", ...rest] = argv;
  const options: CliOptions = {
    command: DEFAULT_COMMAND,
    label: "experiment",
    tag: "mekann-e2e",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    preferMs: DEFAULT_PREFER_MS,
    commitMessage: "",
    git: true,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    const next = rest[index + 1];
    if (token === "--command" && next) {
      options.command = next;
      index += 1;
      continue;
    }
    if (token === "--label" && next) {
      options.label = next;
      index += 1;
      continue;
    }
    if (token === "--tag" && next) {
      options.tag = next;
      index += 1;
      continue;
    }
    if (token === "--timeout-ms" && next) {
      options.timeoutMs = Number(next) || DEFAULT_TIMEOUT_MS;
      index += 1;
      continue;
    }
    if (token === "--prefer-ms" && next) {
      options.preferMs = Number(next) || DEFAULT_PREFER_MS;
      index += 1;
      continue;
    }
    if (token === "--commit-message" && next) {
      options.commitMessage = next;
      index += 1;
      continue;
    }
    if (token === "--no-git") {
      options.git = false;
    }
  }

  return { subcommand, options };
}

function readState(): ExperimentState | null {
  if (!existsSync(STATE_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as ExperimentState;
}

function writeState(state: ExperimentState): void {
  ensureDir(dirname(STATE_PATH));
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function ensureResultsHeader(): void {
  if (existsSync(RESULTS_TSV_PATH)) {
    return;
  }
  ensureDir(dirname(RESULTS_TSV_PATH));
  appendFileSync(
    RESULTS_TSV_PATH,
    "timestamp\tlabel\toutcome\tfailed\tpassed\ttotal\tduration_ms\tcommit\tlog_path\treport_path\n",
    "utf-8",
  );
}

async function runGit(args: string[]): Promise<string> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("git", args, {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }
      rejectPromise(new Error(stderr.trim() || `git ${args.join(" ")} failed with ${code}`));
    });
  });
}

async function getHeadCommit(): Promise<string> {
  return await runGit(["rev-parse", "HEAD"]);
}

async function ensureCleanTree(): Promise<void> {
  const status = await runGit(["status", "--porcelain"]);
  if (status.trim()) {
    throw new Error("autoresearch-e2e requires a clean git tree before init.");
  }
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "experiment";
}

function createRunArtifacts(label: string): RunArtifacts {
  const stamp = nowIso().replace(/[:.]/g, "-");
  const experimentDir = resolve(ROOT, ".pi", "autoresearch", "e2e", "experiments", `${stamp}-${sanitizeLabel(label)}`);
  const reportPath = join(experimentDir, "vitest-report.json");
  const logPath = join(experimentDir, "run.log");
  ensureDir(experimentDir);
  return { experimentDir, reportPath, logPath };
}

async function runCommand(command: string, label: string, timeoutMs: number): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  artifacts: RunArtifacts;
}> {
  const artifacts = createRunArtifacts(label);
  const fullCommand = `${command} --outputFile ${JSON.stringify(artifacts.reportPath)}`;

  return await new Promise((resolvePromise) => {
    const child = spawn("/bin/zsh", ["-lc", fullCommand], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      appendFileSync(artifacts.logPath, text, "utf8");
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      appendFileSync(artifacts.logPath, text, "utf8");
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolvePromise({
        stdout,
        stderr,
        exitCode,
        timedOut,
        artifacts,
      });
    });
  });
}

function appendResultRow(
  label: string,
  outcome: AutoresearchE2EOutcome,
  score: AutoresearchE2EScore | null,
  commit: string,
  artifacts: RunArtifacts,
): void {
  ensureResultsHeader();
  appendFileSync(
    RESULTS_TSV_PATH,
    [
      nowIso(),
      label,
      outcome,
      String(score?.failed ?? -1),
      String(score?.passed ?? -1),
      String(score?.total ?? -1),
      String(score?.durationMs ?? -1),
      commit,
      artifacts.logPath,
      artifacts.reportPath,
    ].join("\t") + "\n",
    "utf-8",
  );
}

async function commitCurrentChanges(message: string): Promise<string> {
  const status = await runGit(["status", "--porcelain"]);
  if (!status.trim()) {
    return await getHeadCommit();
  }
  await runGit(["add", "-A"]);
  await runGit(["commit", "-m", message]);
  return await getHeadCommit();
}

async function resetToCommit(commit: string): Promise<void> {
  await runGit(["reset", "--hard", commit]);
}

async function handleInit(options: CliOptions): Promise<void> {
  await ensureCleanTree();
  const branchName = `autoresearch/${sanitizeLabel(options.tag)}`;

  try {
    await runGit(["rev-parse", "--verify", branchName]);
    await runGit(["switch", branchName]);
  } catch {
    await runGit(["switch", "-c", branchName]);
  }

  const head = await getHeadCommit();
  writeState({
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    tag: options.tag,
    bestCommit: head,
    baselineCommit: head,
    command: options.command,
    experimentCount: 0,
  });

  // Emit experiment_start event
  logger.logExperimentStart({
    experimentType: 'e2e',
    label: options.label,
    tag: options.tag,
    branch: branchName,
    targetCommit: head,
    config: {
      command: options.command,
      timeoutMs: options.timeoutMs,
    },
  });
  await logger.flush();

  process.stdout.write(`initialized autoresearch e2e branch=${branchName} commit=${head}\n`);
}

async function handleBaseline(options: CliOptions): Promise<void> {
  const state = readState();
  if (!state) {
    throw new Error("state not initialized. Run init first.");
  }

  const run = await runCommand(options.command || state.command, `${options.label}-baseline`, options.timeoutMs);
  if (run.timedOut) {
    throw new Error("baseline timed out");
  }
  if (!existsSync(run.artifacts.reportPath)) {
    throw new Error("baseline report file was not produced");
  }

  const report = parseVitestJsonReport(readFileSync(run.artifacts.reportPath, "utf-8"));
  const head = await getHeadCommit();
  const nextState: ExperimentState = {
    ...state,
    updatedAt: nowIso(),
    bestCommit: head,
    baselineCommit: head,
    bestScore: report.score,
    command: options.command || state.command,
    experimentCount: state.experimentCount + 1,
    lastOutcome: "baseline",
    lastLabel: options.label,
    lastLogPath: run.artifacts.logPath,
  };
  writeState(nextState);
  appendResultRow(options.label, "baseline", report.score, head, run.artifacts);

  // Emit experiment_baseline event
  logger.logExperimentBaseline({
    experimentType: 'e2e',
    label: options.label,
    score: {
      failed: report.score.failed,
      passed: report.score.passed,
      total: report.score.total,
      durationMs: report.score.durationMs,
    },
    commit: head,
  });
  await logger.flush();

  process.stdout.write(`baseline recorded ${formatAutoresearchScore(report.score)}\n`);
}

async function handleRun(options: CliOptions): Promise<void> {
  const state = readState();
  if (!state) {
    throw new Error("state not initialized. Run init first.");
  }

  const candidateBaseCommit = await getHeadCommit();
  const command = options.command || state.command;

  // Emit experiment_run event
  logger.logExperimentRun({
    experimentType: 'e2e',
    label: options.label,
    iteration: state.experimentCount + 1,
    commit: candidateBaseCommit,
  });
  await logger.flush();

  const run = await runCommand(command, options.label, options.timeoutMs);

  let outcome: AutoresearchE2EOutcome = "crash";
  let score: AutoresearchE2EScore | null = null;

  if (run.timedOut) {
    outcome = "timeout";
    // Emit experiment_timeout event
    logger.logExperimentTimeout({
      experimentType: 'e2e',
      label: options.label,
      iteration: state.experimentCount + 1,
      timeoutMs: options.timeoutMs,
    });
    await logger.flush();
  } else if (existsSync(run.artifacts.reportPath)) {
    score = parseVitestJsonReport(readFileSync(run.artifacts.reportPath, "utf-8")).score;
    outcome = determineAutoresearchOutcome(score, state.bestScore);

    // Emit result-specific events
    if (outcome === "improved") {
      const previousScore = state.bestScore || { failed: 0, passed: 0, total: 0, durationMs: 0 };
      let improvementType: 'fewer_failures' | 'more_passes' | 'faster' = 'fewer_failures';
      if (score.failed < previousScore.failed) {
        improvementType = 'fewer_failures';
      } else if (score.passed > previousScore.passed) {
        improvementType = 'more_passes';
      } else {
        improvementType = 'faster';
      }

      logger.logExperimentImproved({
        experimentType: 'e2e',
        label: options.label,
        previousScore: {
          failed: previousScore.failed,
          passed: previousScore.passed,
          total: previousScore.total,
          durationMs: previousScore.durationMs,
        },
        newScore: {
          failed: score.failed,
          passed: score.passed,
          total: score.total,
          durationMs: score.durationMs,
        },
        improvementType,
      });
      await logger.flush();
    } else if (outcome === "regressed") {
      const previousScore = state.bestScore || { failed: 0, passed: 0, total: 0, durationMs: 0 };
      let regressionType: 'more_failures' | 'fewer_passes' | 'slower' = 'more_failures';
      if (score.failed > previousScore.failed) {
        regressionType = 'more_failures';
      } else if (score.passed < previousScore.passed) {
        regressionType = 'fewer_passes';
      } else {
        regressionType = 'slower';
      }

      logger.logExperimentRegressed({
        experimentType: 'e2e',
        label: options.label,
        previousScore: {
          failed: previousScore.failed,
          passed: previousScore.passed,
          total: previousScore.total,
          durationMs: previousScore.durationMs,
        },
        newScore: {
          failed: score.failed,
          passed: score.passed,
          total: score.total,
          durationMs: score.durationMs,
        },
        regressionType,
        reverted: false,
      });
      await logger.flush();
    }
  }

  if (options.git) {
    if (outcome === "improved") {
      const commitMessage = options.commitMessage
        || `autoresearch(e2e): ${options.label} [failed=${score?.failed ?? "?"}, passed=${score?.passed ?? "?"}]`;
      const committed = await commitCurrentChanges(commitMessage);
      writeState({
        ...state,
        updatedAt: nowIso(),
        bestCommit: committed,
        bestScore: score ?? state.bestScore,
        command,
        experimentCount: state.experimentCount + 1,
        lastOutcome: outcome,
        lastLabel: options.label,
        lastLogPath: run.artifacts.logPath,
      });
      appendResultRow(options.label, outcome, score, committed, run.artifacts);
      process.stdout.write(`improved ${formatAutoresearchScore(score as AutoresearchE2EScore)} commit=${committed}\n`);
      return;
    }

    await resetToCommit(state.bestCommit);
  }

  writeState({
    ...state,
    updatedAt: nowIso(),
    command,
    experimentCount: state.experimentCount + 1,
    lastOutcome: outcome,
    lastLabel: options.label,
    lastLogPath: run.artifacts.logPath,
  });
  appendResultRow(options.label, outcome, score, candidateBaseCommit, run.artifacts);
  process.stdout.write(`${outcome} ${score ? formatAutoresearchScore(score) : "no-score"}\n`);
  if (run.exitCode !== 0 && !run.timedOut) {
    process.stdout.write(`exit_code=${run.exitCode}\n`);
  }
  if (options.preferMs > 0 && score && score.durationMs > options.preferMs) {
    process.stdout.write(`warning=preferred budget exceeded prefer_ms=${options.preferMs}\n`);
  }
}

function handleStatus(): void {
  const state = readState();
  if (!state) {
    process.stdout.write("state=missing\n");
    return;
  }
  process.stdout.write(
    [
      `tag=${state.tag}`,
      `best_commit=${state.bestCommit}`,
      `baseline_commit=${state.baselineCommit}`,
      `experiments=${state.experimentCount}`,
      `last_outcome=${state.lastOutcome ?? "-"}`,
      `last_label=${state.lastLabel ?? "-"}`,
      `best_score=${state.bestScore ? formatAutoresearchScore(state.bestScore) : "-"}`,
      `command=${state.command}`,
    ].join("\n") + "\n",
  );
}

async function main(): Promise<void> {
  const { subcommand, options } = parseArgs(process.argv.slice(2));
  if (subcommand === "init") {
    await handleInit(options);
    return;
  }
  if (subcommand === "baseline") {
    await handleBaseline(options);
    return;
  }
  if (subcommand === "run") {
    await handleRun(options);
    return;
  }
  if (subcommand === "status") {
    handleStatus();
    return;
  }
  throw new Error(`unknown subcommand: ${subcommand}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
