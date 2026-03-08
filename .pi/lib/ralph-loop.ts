/**
 * path: .pi/lib/ralph-loop.ts
 * role: Ralph loop の file-based orchestration を提供する
 * why: fresh process を反復起動しつつ、状態を prd.json と progress.txt に残すため
 * related: .pi/extensions/ralph-loop.ts, tests/unit/lib/ralph-loop.test.ts, WORKFLOW.md, package.json
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type RalphLoopRuntime = "pi" | "amp" | "claude";

export interface RalphLoopPaths {
  rootDir: string;
  prdPath: string;
  progressPath: string;
  archiveDir: string;
  lastBranchPath: string;
  promptPath: string;
}

export interface RalphLoopStatus {
  paths: RalphLoopPaths;
  runtime: RalphLoopRuntime;
  activeBranch: string;
  previousBranch: string | null;
  archivedTo: string | null;
  promptExists: boolean;
  prdExists: boolean;
  progressExists: boolean;
}

export interface RalphLoopIterationResult {
  iteration: number;
  stdout: string;
  stderr: string;
  exitCode: number;
  completed: boolean;
}

export interface RalphLoopRunResult {
  status: RalphLoopStatus;
  completed: boolean;
  stopReason: "complete" | "max_iterations";
  iterations: RalphLoopIterationResult[];
}

interface RalphLoopPrd {
  branchName?: string;
}

interface SpawnCommandInput {
  executable: string;
  args: string[];
  cwd: string;
  prompt: string;
  runtime: RalphLoopRuntime;
}

export interface RalphLoopOptions {
  cwd: string;
  runtime?: RalphLoopRuntime;
  maxIterations?: number;
  sleepMs?: number;
  stateDir?: string;
  promptPath?: string;
  resolveCurrentBranch?: (cwd: string) => string;
  spawnCommand?: (input: SpawnCommandInput) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
  getDateStamp?: () => string;
}

const DEFAULT_STATE_DIR = ".pi/ralph";
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_SLEEP_MS = 2_000;
const COMPLETE_SIGNAL = "COMPLETE";

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, delayMs);
  });
}

function readTextIfExists(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf-8");
}

function writeText(path: string, content: string): void {
  writeFileSync(path, content, "utf-8");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "branch";
}

function defaultPromptFileName(runtime: RalphLoopRuntime): string {
  if (runtime === "claude") {
    return "CLAUDE.md";
  }
  if (runtime === "amp") {
    return "prompt.md";
  }
  return "PI.md";
}

function readPrd(path: string): RalphLoopPrd | null {
  const raw = readTextIfExists(path).trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RalphLoopPrd;
  } catch {
    return null;
  }
}

function resolveGitBranch(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function buildPaths(options: RalphLoopOptions): RalphLoopPaths {
  const runtime = options.runtime ?? "pi";
  const rootDir = resolve(options.cwd, options.stateDir ?? DEFAULT_STATE_DIR);

  return {
    rootDir,
    prdPath: join(rootDir, "prd.json"),
    progressPath: join(rootDir, "progress.txt"),
    archiveDir: join(rootDir, "archive"),
    lastBranchPath: join(rootDir, ".last-branch"),
    promptPath: options.promptPath
      ? resolve(options.cwd, options.promptPath)
      : join(rootDir, defaultPromptFileName(runtime)),
  };
}

function ensureStateDirs(paths: RalphLoopPaths): void {
  mkdirSync(paths.rootDir, { recursive: true });
  mkdirSync(paths.archiveDir, { recursive: true });
}

function archiveCurrentState(input: {
  paths: RalphLoopPaths;
  previousBranch: string;
  dateStamp: string;
}): string | null {
  const hasPrd = existsSync(input.paths.prdPath);
  const hasProgress = existsSync(input.paths.progressPath);

  if (!hasPrd && !hasProgress) {
    return null;
  }

  const archiveDir = join(input.paths.archiveDir, `${input.dateStamp}-${slugify(input.previousBranch)}`);
  mkdirSync(archiveDir, { recursive: true });

  if (hasPrd) {
    writeText(join(archiveDir, "prd.json"), readTextIfExists(input.paths.prdPath));
  }
  if (hasProgress) {
    writeText(join(archiveDir, "progress.txt"), readTextIfExists(input.paths.progressPath));
  }

  return archiveDir;
}

export function inspectRalphLoop(options: RalphLoopOptions): RalphLoopStatus {
  const runtime = options.runtime ?? "pi";
  const paths = buildPaths(options);
  ensureStateDirs(paths);

  const prd = readPrd(paths.prdPath);
  const gitBranch = (options.resolveCurrentBranch ?? resolveGitBranch)(options.cwd);
  const activeBranch = String(prd?.branchName ?? gitBranch).trim() || gitBranch;
  const previousBranchRaw = readTextIfExists(paths.lastBranchPath).trim();
  const previousBranch = previousBranchRaw || null;
  const dateStamp = (options.getDateStamp ?? (() => new Date().toISOString().slice(0, 10)))();

  let archivedTo: string | null = null;
  if (previousBranch && previousBranch !== activeBranch) {
    archivedTo = archiveCurrentState({
      paths,
      previousBranch,
      dateStamp,
    });
    writeText(paths.progressPath, "");
  } else if (!existsSync(paths.progressPath)) {
    writeText(paths.progressPath, "");
  }

  writeText(paths.lastBranchPath, `${activeBranch}\n`);

  return {
    paths,
    runtime,
    activeBranch,
    previousBranch,
    archivedTo,
    promptExists: existsSync(paths.promptPath),
    prdExists: existsSync(paths.prdPath),
    progressExists: existsSync(paths.progressPath),
  };
}

function buildRuntimeCommand(
  runtime: RalphLoopRuntime,
  prompt: string,
): { executable: string; args: string[]; stdinText?: string } {
  if (runtime === "pi") {
    return {
      executable: "pi",
      args: ["-p", prompt],
    };
  }

  if (runtime === "claude") {
    return {
      executable: "claude",
      args: [],
      stdinText: prompt,
    };
  }

  return {
    executable: "amp",
    args: [],
    stdinText: prompt,
  };
}

async function spawnLoopCommand(input: SpawnCommandInput): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const command = buildRuntimeCommand(input.runtime, input.prompt);

  return await new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(command.executable, command.args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      rejectPromise(error);
    });
    child.on("close", (code) => {
      resolvePromise({
        stdout,
        stderr,
        exitCode: code ?? 0,
      });
    });

    if (command.stdinText) {
      child.stdin.write(command.stdinText);
    }
    child.stdin.end();
  });
}

export async function runRalphLoop(options: RalphLoopOptions): Promise<RalphLoopRunResult> {
  const runtime = options.runtime ?? "pi";
  const status = inspectRalphLoop({ ...options, runtime });
  const prompt = readTextIfExists(status.paths.promptPath).trim();

  if (!status.prdExists) {
    throw new Error(`prd.json is missing: ${status.paths.prdPath}`);
  }
  if (!prompt) {
    throw new Error(`prompt file is missing or empty: ${status.paths.promptPath}`);
  }

  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const sleepMs = options.sleepMs ?? DEFAULT_SLEEP_MS;
  const spawnCommand = options.spawnCommand ?? spawnLoopCommand;
  const iterations: RalphLoopIterationResult[] = [];

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const result = await spawnCommand({
      executable: "",
      args: [],
      cwd: options.cwd,
      prompt,
      runtime,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    const completed = combined.includes(COMPLETE_SIGNAL);

    iterations.push({
      iteration,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      completed,
    });

    if (completed) {
      return {
        status,
        completed: true,
        stopReason: "complete",
        iterations,
      };
    }

    if (iteration < maxIterations && sleepMs > 0) {
      await sleep(sleepMs);
    }
  }

  return {
    status,
    completed: false,
    stopReason: "max_iterations",
    iterations,
  };
}

