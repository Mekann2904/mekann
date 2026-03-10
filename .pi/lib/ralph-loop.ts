/**
 * path: .pi/lib/ralph-loop.ts
 * role: Ralph loop の file-based orchestration を提供する
 * why: fresh process を反復起動しつつ、状態を prd.json と progress.txt に残すため
 * related: .pi/extensions/ralph-loop.ts, tests/unit/lib/ralph-loop.test.ts, WORKFLOW.md, package.json
 *
 * @summary Ralph Loop コアライブラリ
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type RalphLoopRuntime = "pi" | "amp" | "claude";
export type RalphLoopMode = "build" | "plan" | "plan-work";

// ============================================================================
// Subagent Control Types (Ralph Wiggum Technique)
// ============================================================================

/**
 * タスク種別（バックプレッシャー制御用）
 *
 * Ralph記事: "You may use up to 500 parallel subagents for all operations
 * but only 1 subagent for build/tests of rust."
 */
export type TaskType = "explore" | "implement" | "build" | "test" | "review";

/**
 * サブエージェント並列実行設定
 *
 * Ralph記事のバックプレッシャー制御を実装:
 * - 探索・検索: 大量並列（デフォルト最大100）
 * - ビルド・テスト: 直列（デフォルト1）
 */
export interface SubagentConfig {
  /** 探索・検索タスクの最大並列数（デフォルト: 100） */
  maxParallelExplore: number;
  /** 実装タスクの最大並列数（デフォルト: 10） */
  maxParallelImplement: number;
  /** ビルドタスクの最大並列数（デフォルト: 1） */
  maxParallelBuild: number;
  /** テストタスクの最大並列数（デフォルト: 1） */
  maxParallelTest: number;
  /** レビュータスクの最大並列数（デフォルト: 3） */
  maxParallelReview: number;
  /** バックプレッシャーを適用するタスク種別 */
  backpressureTypes: Array<"explore" | "build" | "test" | "lint">;
  /** バックプレッシャー検証コマンド（テスト・ビルド） */
  backpressureCommands?: {
    test?: string;
    build?: string;
    lint?: string;
    typecheck?: string;
  };
  /** レート制限（ミリ秒単位の最小間隔） */
  rateLimitMs?: number;
}

/**
 * デフォルトのサブエージェント設定
 *
 * Ralph記事の推奨値:
 * - 探索: 最大500並列
 * - ビルド/テスト: 1直列
 */
export const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  maxParallelExplore: 100,
  maxParallelImplement: 10,
  maxParallelBuild: 1,
  maxParallelTest: 1,
  maxParallelReview: 3,
  backpressureTypes: ["build", "test", "lint"],
  rateLimitMs: 100,
};

// ============================================================================
// Search Before Change Types (Ralph Wiggum Technique)
// ============================================================================

/**
 * 検索要求（未実装断定禁止フロー用）
 *
 * Ralph記事: "Before making changes search codebase
 * (don't assume an item is not implemented) using parallel subagents."
 */
export interface SearchRequirement {
  /** 検索クエリ */
  query: string;
  /** 検索タイプ */
  type: "symbol" | "code" | "file" | "semantic";
  /** 検索結果のパス（記録用） */
  resultPaths?: string[];
  /** 未実装と判断した理由（必須） */
  notImplementedReason?: string;
  /** 検索実行フラグ */
  searchExecuted: boolean;
}

/**
 * 検索ログエントリ
 */
export interface SearchLogEntry {
  timestamp: string;
  query: string;
  type: SearchRequirement["type"];
  resultsFound: number;
  filesChecked: string[];
  notImplementedReason?: string;
}

// ============================================================================
// Placeholder Detection Types (Ralph Wiggum Technique)
// ============================================================================

/**
 * プレースホルダーパターン
 *
 * Ralph記事: "DO NOT IMPLEMENT PLACEHOLDER OR SIMPLE IMPLEMENTATIONS."
 */
export interface PlaceholderPattern {
  /** パターン名 */
  name: string;
  /** 正規表現パターン */
  pattern: RegExp;
  /** 重大度 */
  severity: "error" | "warning" | "info";
  /** 説明 */
  description: string;
}

/**
 * プレースホルダー検出結果
 */
export interface PlaceholderDetectionResult {
  /** 検出されたプレースホルダー */
  detected: Array<{
    pattern: PlaceholderPattern;
    file: string;
    line: number;
    match: string;
    context: string;
  }>;
  /** 警告メッセージ */
  warnings: string[];
  /** エラーメッセージ */
  errors: string[];
}

/**
 * デフォルトのプレースホルダーパターン
 */
export const DEFAULT_PLACEHOLDER_PATTERNS: PlaceholderPattern[] = [
  {
    name: "TODO_COMMENT",
    pattern: /\/\/\s*TODO:/gi,
    severity: "warning",
    description: "TODOコメントが残っている",
  },
  {
    name: "FIXME_COMMENT",
    pattern: /\/\/\s*FIXME:/gi,
    severity: "warning",
    description: "FIXMEコメントが残っている",
  },
  {
    name: "PLACEHOLDER_KEYWORD",
    pattern: /placeholder|Placeholder|PLACEHOLDER/gi,
    severity: "error",
    description: "プレースホルダーキーワードが含まれている",
  },
  {
    name: "SIMPLE_IMPLEMENTATION",
    pattern: /simple\s+implementation|simple\s+impl|basic\s+implementation/gi,
    severity: "warning",
    description: "簡易実装の可能性がある",
  },
  {
    name: "NOT_IMPLEMENTED",
    pattern: /throw\s+new\s+Error\s*\(\s*["']Not implemented/gi,
    severity: "error",
    description: "Not implementedエラーが投げられている",
  },
  {
    name: "STUB_FUNCTION",
    pattern: /\/\/\s*stub|\/\/\s*Stub|\/\/\s*STUB/gi,
    severity: "warning",
    description: "スタブ関数の可能性がある",
  },
  {
    name: "HACK_COMMENT",
    pattern: /\/\/\s*HACK:/gi,
    severity: "info",
    description: "HACKコメントが残っている",
  },
];

export interface RalphLoopPaths {
  rootDir: string;
  prdPath: string;
  progressPath: string;
  archiveDir: string;
  lastBranchPath: string;
  promptPath: string;
  promptPlanPath: string;
  promptBuildPath: string;
  promptPlanWorkPath: string;
  /** 検索ログパス */
  searchLogPath: string;
  /** implementation plan パス */
  implementationPlanPath: string;
  /** 互換用途の別名 */
  fixPlanPath: string;
  /** AGENTS.mdパス（Ralph記事: ビルド・実行方法を記述） */
  agentMdPath: string;
  /** specs/ディレクトリパス（Ralph記事: 仕様書を格納） */
  specsDir: string;
}

// ============================================================================
// Workspace Verification Integration Types (Phase 2 High)
// ============================================================================

/**
 * ワークスペース検証設定
 *
 * Ralph記事: "Run tests on each iteration.
 * If tests fail, the loop continues."
 */
export interface WorkspaceVerificationConfig {
  /** 検証を有効にするか */
  enabled: boolean;
  /** テストコマンド */
  testCommand?: string;
  /** Lintコマンド */
  lintCommand?: string;
  /** 型チェックコマンド */
  typecheckCommand?: string;
  /** 失敗時に再試行するか */
  retryOnFailure: boolean;
  /** 最大再試行回数 */
  maxRetries: number;
  /** 検証タイムアウト（ミリ秒） */
  timeoutMs: number;
}

/**
 * コンテキスト使用量監視設定
 *
 * Ralph記事の出力サイズ制限（50KB）を実装
 */
export interface ContextUsageMonitor {
  /** 出力サイズ制限（バイト） */
  maxOutputBytes: number;
  /** 現在の出力サイズ */
  currentOutputBytes: number;
  /** コンテキスト占有率（0-1） */
  contextOccupancy: number;
  /** 警告閾値（0-1） */
  warningThreshold: number;
  /** エラー閾値（0-1） */
  errorThreshold: number;
}

/**
 * fix_plan.mdエントリ
 *
 * 問題解決時の学習記録フォーマット
 */
export interface FixPlanEntry {
  /** タイムスタンプ */
  timestamp: string;
  /** 問題の説明 */
  problem: string;
  /** 根本原因 */
  rootCause: string;
  /** 解決策 */
  solution: string;
  /** 検証方法 */
  verification: string;
  /** 関連ファイル */
  relatedFiles: string[];
  /** 学んだこと */
  lessonLearned?: string;
}

export interface RalphLoopStatus {
  paths: RalphLoopPaths;
  runtime: RalphLoopRuntime;
  mode: RalphLoopMode;
  activeBranch: string;
  previousBranch: string | null;
  archivedTo: string | null;
  promptExists: boolean;
  promptPlanExists: boolean;
  promptBuildExists: boolean;
  promptPlanWorkExists: boolean;
  prdExists: boolean;
  progressExists: boolean;
  /** fix_plan.mdが存在するか（Ralph記事: TODOリスト管理） */
  fixPlanExists: boolean;
  implementationPlanExists: boolean;
  agentMdExists: boolean;
  /** specs/ディレクトリが存在するか（Ralph記事: 仕様書ディレクトリ） */
  specsExists: boolean;
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
  mode: RalphLoopMode;
  promptPathUsed: string;
  workScope?: string;
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
  mode?: RalphLoopMode;
  workScope?: string;
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
  /** サブエージェント並列実行設定 */
  subagentConfig?: SubagentConfig;
}

const DEFAULT_STATE_DIR = ".pi/ralph";
const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_SLEEP_MS = 2_000;
const COMPLETE_SIGNAL = "COMPLETE";
const DEFAULT_PLAN_WORK_MAX_ITERATIONS = 5;

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

function defaultPromptFileName(mode: RalphLoopMode): string {
  switch (mode) {
    case "plan":
      return "PROMPT_plan.md";
    case "plan-work":
      return "PROMPT_plan_work.md";
    case "build":
    default:
      return "PROMPT_build.md";
  }
}

function resolveMode(options: Pick<RalphLoopOptions, "mode">): RalphLoopMode {
  return options.mode ?? "build";
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
  const rootDir = resolve(options.cwd, options.stateDir ?? DEFAULT_STATE_DIR);
  const mode = resolveMode(options);
  const promptPlanPath = join(rootDir, defaultPromptFileName("plan"));
  const promptBuildPath = join(rootDir, defaultPromptFileName("build"));
  const promptPlanWorkPath = join(rootDir, defaultPromptFileName("plan-work"));
  const implementationPlanPath = join(rootDir, "IMPLEMENTATION_PLAN.md");

  return {
    rootDir,
    prdPath: join(rootDir, "prd.json"),
    progressPath: join(rootDir, "progress.txt"),
    archiveDir: join(rootDir, "archive"),
    lastBranchPath: join(rootDir, ".last-branch"),
    promptPath: options.promptPath
      ? resolve(options.cwd, options.promptPath)
      : join(rootDir, defaultPromptFileName(mode)),
    promptPlanPath,
    promptBuildPath,
    promptPlanWorkPath,
    searchLogPath: join(rootDir, "search-log.json"),
    implementationPlanPath,
    fixPlanPath: implementationPlanPath,
    agentMdPath: join(rootDir, "AGENTS.md"),
    specsDir: join(rootDir, "specs"),
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
  const hasImplementationPlan = existsSync(input.paths.implementationPlanPath);
  const hasAgentMd = existsSync(input.paths.agentMdPath);
  const hasSearchLog = existsSync(input.paths.searchLogPath);
  const hasPromptPlan = existsSync(input.paths.promptPlanPath);
  const hasPromptBuild = existsSync(input.paths.promptBuildPath);
  const hasPromptPlanWork = existsSync(input.paths.promptPlanWorkPath);

  if (
    !hasPrd &&
    !hasProgress &&
    !hasImplementationPlan &&
    !hasAgentMd &&
    !hasSearchLog &&
    !hasPromptPlan &&
    !hasPromptBuild &&
    !hasPromptPlanWork
  ) {
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
  if (hasImplementationPlan) {
    writeText(
      join(archiveDir, "IMPLEMENTATION_PLAN.md"),
      readTextIfExists(input.paths.implementationPlanPath),
    );
  }
  if (hasAgentMd) {
    writeText(join(archiveDir, "AGENTS.md"), readTextIfExists(input.paths.agentMdPath));
  }
  if (hasSearchLog) {
    writeText(join(archiveDir, "search-log.json"), readTextIfExists(input.paths.searchLogPath));
  }
  if (hasPromptPlan) {
    writeText(join(archiveDir, "PROMPT_plan.md"), readTextIfExists(input.paths.promptPlanPath));
  }
  if (hasPromptBuild) {
    writeText(join(archiveDir, "PROMPT_build.md"), readTextIfExists(input.paths.promptBuildPath));
  }
  if (hasPromptPlanWork) {
    writeText(
      join(archiveDir, "PROMPT_plan_work.md"),
      readTextIfExists(input.paths.promptPlanWorkPath),
    );
  }

  return archiveDir;
}

export function inspectRalphLoop(options: RalphLoopOptions): RalphLoopStatus {
  const runtime = options.runtime ?? "pi";
  const mode = resolveMode(options);
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
    writeText(paths.implementationPlanPath, DEFAULT_IMPLEMENTATION_PLAN_TEMPLATE);
    writeText(paths.searchLogPath, "");
  } else if (!existsSync(paths.progressPath)) {
    writeText(paths.progressPath, "");
  }

  writeText(paths.lastBranchPath, `${activeBranch}\n`);

  return {
    paths,
    runtime,
    mode,
    activeBranch,
    previousBranch,
    archivedTo,
    promptExists: existsSync(paths.promptPath),
    promptPlanExists: existsSync(paths.promptPlanPath),
    promptBuildExists: existsSync(paths.promptBuildPath),
    promptPlanWorkExists: existsSync(paths.promptPlanWorkPath),
    prdExists: existsSync(paths.prdPath),
    progressExists: existsSync(paths.progressPath),
    fixPlanExists: existsSync(paths.fixPlanPath),
    implementationPlanExists: existsSync(paths.implementationPlanPath),
    agentMdExists: existsSync(paths.agentMdPath),
    specsExists: existsSync(paths.specsDir),
  };
}

function resolvePromptPathForMode(paths: RalphLoopPaths, mode: RalphLoopMode): string {
  switch (mode) {
    case "plan":
      return paths.promptPlanPath;
    case "plan-work":
      return paths.promptPlanWorkPath;
    case "build":
    default:
      return paths.promptBuildPath;
  }
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
  // Use provided executable/args, fallback to runtime-based command
  const runtimeCommand = buildRuntimeCommand(input.runtime, input.prompt);
  const executable = input.executable || runtimeCommand.executable;
  const args = input.args.length > 0 ? input.args : runtimeCommand.args;
  const stdinText = input.args.length > 0 ? undefined : runtimeCommand.stdinText;

  return await new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(executable, args, {
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

    if (stdinText) {
      child.stdin.write(stdinText);
    }
    child.stdin.end();
  });
}

/**
 * タスク種別を判定する
 * @param prompt - プロンプト内容
 * @returns タスク種別
 */
function determineTaskType(prompt: string): TaskType {
  const lowerPrompt = prompt.toLowerCase();

  // ビルド・テスト関連のキーワード
  if (/\b(build|compile|npm run build|tsc|vite|webpack)\b/i.test(lowerPrompt)) {
    return "build";
  }
  if (/\b(test|spec|jest|vitest|mocha|assert|expect)\b/i.test(lowerPrompt)) {
    return "test";
  }
  // レビュー関連のキーワード
  if (/\b(review|audit|check|lint|eslint|prettier)\b/i.test(lowerPrompt)) {
    return "review";
  }
  // 実装関連のキーワード
  if (/\b(implement|add|fix|update|create|refactor|modify)\b/i.test(lowerPrompt)) {
    return "implement";
  }
  // 探索・検索関連（デフォルト）
  return "explore";
}

/**
 * バックプレッシャー制御付きで単一コマンドを実行する
 *
 * Ralph記事: "You may use up to 500 parallel subagents for all operations
 * but only 1 subagent for build/tests of rust."
 *
 * @param input - スポーン入力
 * @param config - サブエージェント設定
 * @returns 実行結果
 */
async function executeSingleWithBackpressure(
  input: SpawnCommandInput,
  config: SubagentConfig = DEFAULT_SUBAGENT_CONFIG,
  spawnCommand?: (input: SpawnCommandInput) => Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>,
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  backpressureApplied: boolean;
}> {
  const taskType = determineTaskType(input.prompt);

  // バックプレッシャーが必要なタスク種別かチェック
  const needsBackpressure = config.backpressureTypes.some(
    (type) => type === taskType || (taskType === "build" && type === "build") || (taskType === "test" && type === "test")
  );

  // 並列数制限を決定
  let maxParallel = config.maxParallelExplore;
  switch (taskType) {
    case "explore":
      maxParallel = config.maxParallelExplore;
      break;
    case "implement":
      maxParallel = config.maxParallelImplement;
      break;
    case "build":
      maxParallel = config.maxParallelBuild;
      break;
    case "test":
      maxParallel = config.maxParallelTest;
      break;
    case "review":
      maxParallel = config.maxParallelReview;
      break;
  }

  // レート制限（最小間隔）
  if (config.rateLimitMs && config.rateLimitMs > 0) {
    await sleep(config.rateLimitMs);
  }

  // 実際のコマンド実行（カスタムspawnCommandまたはデフォルト）
  const result = await (spawnCommand ?? spawnLoopCommand)(input);

  return {
    ...result,
    backpressureApplied: needsBackpressure && maxParallel === 1,
  };
}

export async function runRalphLoop(options: RalphLoopOptions): Promise<RalphLoopRunResult> {
  const runtime = options.runtime ?? "pi";
  const mode = resolveMode(options);
  const status = inspectRalphLoop({ ...options, runtime });
  const promptPath = options.promptPath
    ? status.paths.promptPath
    : resolvePromptPathForMode(status.paths, mode);

  if (!status.prdExists) {
    throw new Error(buildMissingFileMessage("prd", status.paths.prdPath, runtime));
  }
  if (mode === "plan-work") {
    const branch = status.activeBranch;
    if (!options.workScope?.trim()) {
      throw new Error("plan-work を実行するには workScope が必要です");
    }
    if (branch === "main" || branch === "master") {
      throw new Error("plan-work は main/master ではなく作業ブランチで実行してください");
    }
  }

  const maxIterations =
    options.maxIterations ??
    (mode === "plan-work" ? DEFAULT_PLAN_WORK_MAX_ITERATIONS : DEFAULT_MAX_ITERATIONS);
  const sleepMs = options.sleepMs ?? DEFAULT_SLEEP_MS;
  const subagentConfig = options.subagentConfig ?? DEFAULT_SUBAGENT_CONFIG;
  const iterations: RalphLoopIterationResult[] = [];

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const rawPrompt = readTextIfExists(promptPath).trim();
    const prompt =
      mode === "plan-work"
        ? rawPrompt.replaceAll("${WORK_SCOPE}", options.workScope?.trim() ?? "")
        : rawPrompt;

    if (!prompt) {
      throw new Error(buildMissingFileMessage("prompt", promptPath, runtime));
    }

    // バックプレッシャー制御付きで実行
    const result = await executeSingleWithBackpressure(
      {
        executable: "",
        args: [],
        cwd: options.cwd,
        prompt,
        runtime,
      },
      subagentConfig,
      options.spawnCommand,
    );
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
        mode,
        promptPathUsed: promptPath,
        workScope: options.workScope?.trim() || undefined,
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
    mode,
    promptPathUsed: promptPath,
    workScope: options.workScope?.trim() || undefined,
    completed: false,
    stopReason: "max_iterations",
    iterations,
  };
}

// ============================================================================
// Initialization and Templates
// ============================================================================

/**
 * デフォルトのPRDテンプレート
 */
const DEFAULT_PRD_TEMPLATE = {
  branchName: "",
  title: "プロジェクト名",
  description: "このプロジェクトの概要を記載してください",
  tasks: [
    {
      id: "task-1",
      title: "最初のタスク",
      status: "pending",
      priority: "high",
    },
  ],
};

/**
 * デフォルトの IMPLEMENTATION_PLAN.md テンプレート
 */
const DEFAULT_IMPLEMENTATION_PLAN_TEMPLATE = `<!-- .pi/ralph/IMPLEMENTATION_PLAN.md -->
<!-- このファイルは、Ralph loop の共有状態となる優先度付き実装計画を保持します。 -->
<!-- なぜ存在するか: 各 iteration が同じ plan を読み、最重要の 1 件だけを確実に進めるためです。 -->
<!-- 関連ファイル: .pi/ralph/PROMPT_plan.md, .pi/ralph/PROMPT_build.md, .pi/ralph/AGENTS.md, .pi/ralph/specs/ -->

# IMPLEMENTATION_PLAN

## Release Summary

- Scope: 未定
- Why now: 未定

## Prioritized Tasks

- [ ] Task 1
  - Why: ここに理由を書く
  - Required tests: ここに acceptance-driven backpressure を書く

## Risks / Discoveries

- なし
`;

/**
 * デフォルトの AGENTS.md テンプレート
 */
const DEFAULT_AGENT_MD_TEMPLATE = `<!-- .pi/ralph/AGENTS.md -->
<!-- このファイルは、Ralph loop が毎回読む短い運用メモを保持します。 -->
<!-- なぜ存在するか: build / test / lint の実コマンドと運用上の学びを context に安定注入するためです。 -->
<!-- 関連ファイル: .pi/ralph/IMPLEMENTATION_PLAN.md, .pi/ralph/PROMPT_build.md, package.json, AGENTS.md -->

# Ralph Loop AGENTS

## Build & Run

- 作業対象の最小単位で build / test / lint / typecheck を回す

## Validation

- Tests: npm run test:unit -- <target>
- Typecheck: npm run typecheck
- Lint: npm run lint
- Workspace gate: npm run verify:workspace -- --fail-on-interactive

## Notes

- ここには運用上の学びだけを短く残す
`;

/**
 * デフォルトの planning prompt
 */
const DEFAULT_PLAN_PROMPT_TEMPLATE = `<!-- .pi/ralph/PROMPT_plan.md -->
<!-- このファイルは、Ralph loop の planning mode を定義します。 -->
<!-- なぜ存在するか: build より前に specs と code の gap を整理し、共有 plan だけを更新するためです。 -->
<!-- 関連ファイル: .pi/ralph/IMPLEMENTATION_PLAN.md, .pi/ralph/PROMPT_build.md, .pi/ralph/specs/, .pi/ralph/AGENTS.md -->

0a. Study \`.pi/ralph/specs/*\` with parallel subagents to learn the application specifications.
0b. Study @.pi/ralph/IMPLEMENTATION_PLAN.md if present.
0c. Study \`src/*\` or the main source locations in this repository. Do not assume functionality is missing without code search first.

1. Create or update @.pi/ralph/IMPLEMENTATION_PLAN.md only. Compare specs and code, then write a prioritized bullet list of not-yet-implemented work.
2. For each task, derive required tests from acceptance criteria. Required tests describe what must be verified, not how to implement it.
3. Keep the plan concise. Mark completed items clearly and remove stale clutter when helpful.

IMPORTANT:
- Plan only. Do not implement code.
- Prefer one coherent next release or slice over a giant backlog.
- Treat @.pi/ralph/AGENTS.md as operational notes only.
- If specs are inconsistent, record the issue in the plan.
`;

/**
 * デフォルトの build prompt
 */
const DEFAULT_BUILD_PROMPT_TEMPLATE = `<!-- .pi/ralph/PROMPT_build.md -->
<!-- このファイルは、Ralph loop の building mode を定義します。 -->
<!-- なぜ存在するか: 共有 plan から 1 task だけ選び、検証付きで実装を進めるためです。 -->
<!-- 関連ファイル: .pi/ralph/IMPLEMENTATION_PLAN.md, .pi/ralph/PROMPT_plan.md, .pi/ralph/specs/, .pi/ralph/AGENTS.md -->

0a. Study \`.pi/ralph/specs/*\` to understand requirements.
0b. Study @.pi/ralph/IMPLEMENTATION_PLAN.md and choose the single most important unfinished item.
0c. Search the codebase before changing anything. Do not assume the task is not implemented.

1. Implement one task from @.pi/ralph/IMPLEMENTATION_PLAN.md.
2. Run the required tests listed in the task definition. Required tests are part of the task scope.
3. Update @.pi/ralph/IMPLEMENTATION_PLAN.md with discoveries, completion state, and any newly found bugs.
4. Keep @.pi/ralph/AGENTS.md operational only. Put status and discoveries in @.pi/ralph/IMPLEMENTATION_PLAN.md.
5. When all planned work is complete, include \`COMPLETE\` in your output.

IMPORTANT:
- Use acceptance-driven backpressure. A task is not done until the required tests exist and pass.
- Prefer quick and dirty prototype first, then tighten with targeted verification.
- No placeholders, no stubbed success.
`;

/**
 * デフォルトの scoped planning prompt
 */
const DEFAULT_PLAN_WORK_PROMPT_TEMPLATE = `<!-- .pi/ralph/PROMPT_plan_work.md -->
<!-- このファイルは、Ralph loop の scoped planning mode を定義します。 -->
<!-- なぜ存在するか: 作業ブランチごとに narrow な plan を作り、build 時の曖昧な task filtering を避けるためです。 -->
<!-- 関連ファイル: .pi/ralph/IMPLEMENTATION_PLAN.md, .pi/ralph/PROMPT_plan.md, .pi/ralph/specs/, .pi/ralph/AGENTS.md -->

0a. Study \`.pi/ralph/specs/*\` with parallel subagents to learn the application specifications.
0b. Study @.pi/ralph/IMPLEMENTATION_PLAN.md if present.
0c. Study the current source code. Search before assuming missing functionality.

1. Create or update a scoped @.pi/ralph/IMPLEMENTATION_PLAN.md for this work only: "\${WORK_SCOPE}".
2. Include only tasks directly related to the work scope. If uncertain, exclude the task.
3. For each task, derive required tests from acceptance criteria.

IMPORTANT:
- Plan only. Do not implement code.
- Keep the plan tightly scoped to "\${WORK_SCOPE}".
- If the branch is wrong or the scope is unclear, fail fast instead of producing a broad plan.
`;

/**
 * 初期化結果のインターフェース
 */
export interface RalphLoopInitResult {
  paths: RalphLoopPaths;
  created: {
    prd: boolean;
    progress: boolean;
    promptPlan: boolean;
    promptBuild: boolean;
    promptPlanWork: boolean;
    /** implementation plan が作成されたか */
    implementationPlan: boolean;
    /** 互換用途の別名 */
    fixPlan: boolean;
    agentMd: boolean;
    /** specs/ディレクトリが作成されたか */
    specs: boolean;
  };
  message: string;
}

/**
 * Ralph Loopの初期化オプション
 */
export interface RalphLoopInitOptions {
  cwd: string;
  runtime?: RalphLoopRuntime;
  mode?: RalphLoopMode;
  stateDir?: string;
  promptPath?: string;
  prdContent?: Partial<typeof DEFAULT_PRD_TEMPLATE>;
  promptContent?: string;
  force?: boolean;
  resolveCurrentBranch?: (cwd: string) => string;
}

/**
 * プロンプトテンプレートを取得する
 * @param mode - ループモード
 * @returns プロンプトテンプレート
 */
function getPromptTemplate(mode: RalphLoopMode): string {
  switch (mode) {
    case "plan":
      return DEFAULT_PLAN_PROMPT_TEMPLATE;
    case "plan-work":
      return DEFAULT_PLAN_WORK_PROMPT_TEMPLATE;
    case "build":
    default:
      return DEFAULT_BUILD_PROMPT_TEMPLATE;
  }
}

/**
 * Ralph Loopを初期化する
 *
 * 必要なファイル（prd.json, プロンプトファイル, progress.txt）を作成する。
 * 既存のファイルは force: true の場合のみ上書きする。
 *
 * @param options - 初期化オプション
 * @returns 初期化結果
 *
 * @example
 * ```typescript
 * const result = initRalphLoop({
 *   cwd: process.cwd(),
 *   runtime: "pi",
 *   prdContent: {
 *     title: "マイプロジェクト",
 *     tasks: [{ id: "1", title: "機能Aを実装", status: "pending" }]
 *   }
 * });
 * console.log(result.message);
 * ```
 */
export function initRalphLoop(options: RalphLoopInitOptions): RalphLoopInitResult {
  const paths = buildPaths(options);
  ensureStateDirs(paths);

  const created = {
    prd: false,
    progress: false,
    promptPlan: false,
    promptBuild: false,
    promptPlanWork: false,
    implementationPlan: false,
    fixPlan: false,
    agentMd: false,
    specs: false,
  };

  // prd.json の作成
  if (!existsSync(paths.prdPath) || options.force) {
    const prdContent = {
      ...DEFAULT_PRD_TEMPLATE,
      ...options.prdContent,
    };
    // branchName が空の場合は現在のブランチを設定
    if (!prdContent.branchName) {
      try {
        const resolveBranch = options.resolveCurrentBranch ?? resolveGitBranch;
        prdContent.branchName = resolveBranch(options.cwd);
      } catch {
        prdContent.branchName = "main";
      }
    }
    writeText(paths.prdPath, JSON.stringify(prdContent, null, 2));
    created.prd = true;
  }

  // プロンプトファイル群の作成
  if (!existsSync(paths.promptPlanPath) || options.force) {
    writeText(paths.promptPlanPath, getPromptTemplate("plan"));
    created.promptPlan = true;
  }
  if (!existsSync(paths.promptBuildPath) || options.force) {
    const promptContent = options.promptContent ?? getPromptTemplate("build");
    writeText(paths.promptBuildPath, promptContent);
    created.promptBuild = true;
  }
  if (!existsSync(paths.promptPlanWorkPath) || options.force) {
    writeText(paths.promptPlanWorkPath, getPromptTemplate("plan-work"));
    created.promptPlanWork = true;
  }
  if (
    options.promptPath &&
    paths.promptPath !== paths.promptBuildPath &&
    (!existsSync(paths.promptPath) || options.force)
  ) {
    const promptContent = options.promptContent ?? getPromptTemplate(resolveMode(options));
    writeText(paths.promptPath, promptContent);
  }

  // progress.txt の作成
  if (!existsSync(paths.progressPath) || options.force) {
    writeText(paths.progressPath, "");
    created.progress = true;
  }

  // IMPLEMENTATION_PLAN.md の作成
  if (!existsSync(paths.implementationPlanPath) || options.force) {
    writeText(paths.implementationPlanPath, DEFAULT_IMPLEMENTATION_PLAN_TEMPLATE);
    created.implementationPlan = true;
    created.fixPlan = true;
  }

  // AGENTS.md の作成
  if (!existsSync(paths.agentMdPath) || options.force) {
    writeText(paths.agentMdPath, DEFAULT_AGENT_MD_TEMPLATE);
    created.agentMd = true;
  }

  // specs/ ディレクトリの作成（Ralph記事: 仕様書ディレクトリ）
  if (!existsSync(paths.specsDir) || options.force) {
    mkdirSync(paths.specsDir, { recursive: true });
    created.specs = true;
  }

  // メッセージの生成
  const messages: string[] = [];
  if (created.prd) {
    messages.push(`prd.json を作成しました: ${paths.prdPath}`);
  }
  if (created.progress) {
    messages.push(`progress.txt を作成しました: ${paths.progressPath}`);
  }
  if (created.promptPlan) {
    messages.push(`PROMPT_plan.md を作成しました: ${paths.promptPlanPath}`);
  }
  if (created.promptBuild) {
    messages.push(`PROMPT_build.md を作成しました: ${paths.promptBuildPath}`);
  }
  if (created.promptPlanWork) {
    messages.push(`PROMPT_plan_work.md を作成しました: ${paths.promptPlanWorkPath}`);
  }
  if (created.implementationPlan) {
    messages.push(`IMPLEMENTATION_PLAN.md を作成しました: ${paths.implementationPlanPath}`);
  }
  if (created.agentMd) {
    messages.push(`AGENTS.md を作成しました: ${paths.agentMdPath}`);
  }
  if (created.specs) {
    messages.push(`.pi/ralph/specs/ ディレクトリを作成しました: ${paths.specsDir}`);
  }

  if (messages.length === 0) {
    messages.push("すべてのファイルが既に存在します。force: true で上書きできます。");
  }

  return {
    paths,
    created,
    message: messages.join("\n"),
  };
}

/**
 * エラーメッセージを生成する
 * @param missingFile - 不足しているファイルの種類
 * @param path - ファイルパス
 * @param runtime - ランタイム種別
 * @returns エラーメッセージ
 */
export function buildMissingFileMessage(
  missingFile: "prd" | "prompt",
  path: string,
  _runtime: RalphLoopRuntime,
): string {
  if (missingFile === "prd") {
    return [
      `prd.json が見つかりません: ${path}`,
      "",
      "Ralph Loop を開始するには、以下のコマンドで初期化してください:",
      "",
      "  ralph_loop_init を実行",
      "",
      "または、手動で prd.json を作成してください:",
      "",
      '  {',
      '    "branchName": "feature/xxx",',
      '    "title": "プロジェクト名",',
      '    "tasks": [',
      '      { "id": "1", "title": "タスク名", "status": "pending" }',
      "    ]",
      "  }",
    ].join("\n");
  }

  return [
    `プロンプトファイルが見つかりません: ${path}`,
    "",
    "Ralph Loop を開始するには、以下のコマンドで初期化してください:",
    "",
    "  ralph_loop_init を実行",
    "",
    "または、手動で PROMPT_build.md / PROMPT_plan.md / PROMPT_plan_work.md のいずれかを作成してください。",
    "",
    "プロンプトファイルには、エージェントへの指示を記載します。",
    "例: タスクの説明、実行ルール、終了条件など",
  ].join("\n");
}

// ============================================================================
// Backpressure Control Functions (Ralph Wiggum Technique)
// ============================================================================

/**
 * タスク種別に応じた最大並列数を取得
 *
 * Ralph記事: "You may use up to 500 parallel subagents for all operations
 * but only 1 subagent for build/tests of rust."
 *
 * @param taskType - タスク種別
 * @param config - サブエージェント設定
 * @returns 最大並列数
 */
export function getMaxParallelForTaskType(
  taskType: TaskType,
  config: SubagentConfig = DEFAULT_SUBAGENT_CONFIG,
): number {
  switch (taskType) {
    case "explore":
      return config.maxParallelExplore;
    case "implement":
      return config.maxParallelImplement;
    case "build":
      return config.maxParallelBuild;
    case "test":
      return config.maxParallelTest;
    case "review":
      return config.maxParallelReview;
    default:
      return 1;
  }
}

/**
 * バックプレッシャーが必要なタスクかどうかを判定
 *
 * @param taskType - タスク種別
 * @param config - サブエージェント設定
 * @returns バックプレッシャーが必要な場合はtrue
 */
export function requiresBackpressure(
  taskType: TaskType,
  config: SubagentConfig = DEFAULT_SUBAGENT_CONFIG,
): boolean {
  const typeMap: Record<TaskType, "explore" | "build" | "test" | "lint"> = {
    explore: "explore",
    implement: "build",
    build: "build",
    test: "test",
    review: "lint",
  };
  return config.backpressureTypes.includes(typeMap[taskType]);
}

/**
 * 並列実行制御付きでタスクを実行
 *
 * @param tasks - 実行するタスクの配列
 * @param taskType - タスク種別
 * @param executor - タスク実行関数
 * @param config - サブエージェント設定
 * @returns 実行結果の配列
 */
export async function executeWithBackpressureBatch<T, R>(
  tasks: T[],
  taskType: TaskType,
  executor: (task: T, index: number) => Promise<R>,
  config: SubagentConfig = DEFAULT_SUBAGENT_CONFIG,
): Promise<R[]> {
  const maxParallel = getMaxParallelForTaskType(taskType, config);
  const results: R[] = [];

  if (maxParallel === 1) {
    for (let i = 0; i < tasks.length; i++) {
      results.push(await executor(tasks[i], i));
      if (config.rateLimitMs && i < tasks.length - 1) {
        await sleep(config.rateLimitMs);
      }
    }
    return results;
  }

  for (let i = 0; i < tasks.length; i += maxParallel) {
    const batch = tasks.slice(i, i + maxParallel);
    const batchResults = await Promise.all(
      batch.map((task, batchIndex) => executor(task, i + batchIndex)),
    );
    results.push(...batchResults);
    if (config.rateLimitMs && i + maxParallel < tasks.length) {
      await sleep(config.rateLimitMs);
    }
  }

  return results;
}

/**
 * executeWithBackpressureBatchのエイリアス
 *
 * テスト互換性のために提供
 *
 * @deprecated executeWithBackpressureBatchを使用してください
 */
export const executeWithBackpressure = executeWithBackpressureBatch;

// ============================================================================
// Backpressure Validation Functions (Ralph Wiggum Technique)
// ============================================================================

/**
 * バックプレッシャー検証結果
 */
export interface BackpressureValidationResult {
  /** 検証が成功したか */
  success: boolean;
  /** 実行したコマンド */
  command: string;
  /** 標準出力 */
  stdout: string;
  /** 標準エラー出力 */
  stderr: string;
  /** 終了コード */
  exitCode: number;
  /** 実行時間（ミリ秒） */
  durationMs: number;
  /** エラーメッセージ（失敗時） */
  error?: string;
}

/**
 * バックプレッシャー検証コマンドを実行
 *
 * Ralph記事: "If tests fail, you are responsible for fixing related tests"
 * "After implementing functionality or resolving problems, run the tests
 * for that unit of code that was improved."
 *
 * @param type - 検証タイプ
 * @param config - サブエージェント設定
 * @param cwd - 作業ディレクトリ
 * @returns 検証結果
 */
export async function runBackpressureValidation(
  type: "test" | "build" | "lint" | "typecheck",
  config: SubagentConfig = DEFAULT_SUBAGENT_CONFIG,
  cwd: string = process.cwd(),
): Promise<BackpressureValidationResult> {
  const commands = config.backpressureCommands ?? {};
  const command = commands[type];

  if (!command) {
    return {
      success: false,
      command: "",
      stdout: "",
      stderr: "",
      exitCode: -1,
      durationMs: 0,
      error: `${type}コマンドが設定されていません`,
    };
  }

  const startTime = Date.now();

  return await new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn("sh", ["-c", command], {
      cwd,
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
      resolve({
        success: false,
        command,
        stdout,
        stderr,
        exitCode: 1,
        durationMs: Date.now() - startTime,
        error: error.message,
      });
    });
    child.on("close", (code) => {
      resolve({
        success: code === 0,
        command,
        stdout,
        stderr,
        exitCode: code ?? 1,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * 全てのバックプレッシャー検証を実行
 *
 * @param config - サブエージェント設定
 * @param cwd - 作業ディレクトリ
 * @returns 検証結果の配列
 */
export async function runAllBackpressureValidations(
  config: SubagentConfig = DEFAULT_SUBAGENT_CONFIG,
  cwd: string = process.cwd(),
): Promise<BackpressureValidationResult[]> {
  const results: BackpressureValidationResult[] = [];
  const commands = config.backpressureCommands ?? {};

  // typecheck → lint → build → test の順で実行
  const order: Array<"typecheck" | "lint" | "build" | "test"> = [
    "typecheck",
    "lint",
    "build",
    "test",
  ];

  for (const type of order) {
    if (commands[type]) {
      const result = await runBackpressureValidation(type, config, cwd);
      results.push(result);

      // 失敗したら即座に停止
      if (!result.success) {
        break;
      }
    }
  }

  return results;
}

// ============================================================================
// Placeholder Detection Functions (Ralph Wiggum Technique)
// ============================================================================

/**
 * ファイル内のプレースホルダーを検出
 *
 * @param content - ファイル内容
 * @param filePath - ファイルパス
 * @param patterns - 検出パターン
 * @returns 検出結果
 */
export function detectPlaceholders(
  content: string,
  filePath: string,
  patterns: PlaceholderPattern[] = DEFAULT_PLACEHOLDER_PATTERNS,
): PlaceholderDetectionResult {
  const result: PlaceholderDetectionResult = {
    detected: [],
    warnings: [],
    errors: [],
  };

  const lines = content.split("\n");

  for (const pattern of patterns) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const matches = line.matchAll(pattern.pattern);

      for (const match of matches) {
        result.detected.push({
          pattern,
          file: filePath,
          line: lineIndex + 1,
          match: match[0],
          context: line.trim(),
        });

        const message = `[${pattern.name}] ${filePath}:${lineIndex + 1} - ${pattern.description}`;

        if (pattern.severity === "error") {
          result.errors.push(message);
        } else if (pattern.severity === "warning") {
          result.warnings.push(message);
        }
      }
    }
  }

  return result;
}

// ============================================================================
// Search Logging Functions (Ralph Wiggum Technique)
// ============================================================================

/**
 * 検索ログを記録
 *
 * @param entry - 検索ログエントリ
 * @param searchLogPath - 検索ログファイルのパス
 */
export function logSearchEntry(entry: SearchLogEntry, searchLogPath: string): void {
  const timestamp = new Date().toISOString();
  const logLine = JSON.stringify({ ...entry, timestamp }) + "\n";
  const existing = readTextIfExists(searchLogPath);
  writeText(searchLogPath, existing + logLine);
}

/**
 * 検索ログを読み込み
 *
 * @param searchLogPath - 検索ログファイルのパス
 * @returns 検索ログエントリの配列
 */
export function readSearchLog(searchLogPath: string): SearchLogEntry[] {
  const content = readTextIfExists(searchLogPath);
  if (!content.trim()) {
    return [];
  }

  const lines = content.trim().split("\n");
  const entries: SearchLogEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as SearchLogEntry);
    } catch {
      // skip invalid lines
    }
  }

  return entries;
}

/**
 * 未実装判断の根拠を記録
 *
 * @param query - 検索クエリ
 * @param reason - 未実装と判断した理由
 * @param filesChecked - 確認したファイル
 * @param searchLogPath - 検索ログファイルのパス
 */
export function logNotImplementedReason(
  query: string,
  reason: string,
  filesChecked: string[],
  searchLogPath: string,
): void {
  logSearchEntry(
    {
      timestamp: new Date().toISOString(),
      query,
      type: "code",
      resultsFound: 0,
      filesChecked,
      notImplementedReason: reason,
    },
    searchLogPath,
  );
}

// ============================================================================
// Context Usage Monitoring Functions (Phase 2 High)
// ============================================================================

/** デフォルトのコンテキスト監視設定 */
export const DEFAULT_CONTEXT_MONITOR: ContextUsageMonitor = {
  maxOutputBytes: 50 * 1024, // 50KB
  currentOutputBytes: 0,
  contextOccupancy: 0,
  warningThreshold: 0.7,
  errorThreshold: 0.9,
};

/** デフォルトのワークスペース検証設定 */
export const DEFAULT_WORKSPACE_VERIFICATION: WorkspaceVerificationConfig = {
  enabled: true,
  testCommand: "npm test",
  lintCommand: "npm run lint",
  typecheckCommand: "npm run typecheck",
  retryOnFailure: true,
  maxRetries: 3,
  timeoutMs: 120000,
};

/**
 * 出力サイズをチェック
 *
 * Ralph記事: "Truncate output to 50KB to avoid context blowout."
 *
 * @param output - 出力文字列
 * @param maxSize - 最大サイズ（バイト）
 * @returns トリミングされた出力とサイズ情報
 */
export function checkOutputSize(
  output: string,
  maxSize: number = DEFAULT_CONTEXT_MONITOR.maxOutputBytes,
): {
  output: string;
  originalBytes: number;
  truncated: boolean;
} {
  const originalBytes = Buffer.byteLength(output, "utf-8");
  const truncated = originalBytes > maxSize;

  if (truncated) {
    // トリミングして末尾にメッセージを追加
    const truncatedOutput = output.slice(0, maxSize - 100);
    return {
      output: truncatedOutput + `\n\n[TRUNCATED: ${originalBytes} bytes > ${maxSize} bytes limit]`,
      originalBytes,
      truncated: true,
    };
  }

  return { output, originalBytes, truncated: false };
}

/**
 * コンテキスト占有率を計算
 *
 * @param usedTokens - 使用トークン数
 * @param maxTokens - 最大トークン数
 * @returns コンテキスト監視情報
 */
export function calculateContextOccupancy(
  usedTokens: number,
  maxTokens: number,
): ContextUsageMonitor {
  const occupancy = usedTokens / maxTokens;

  return {
    ...DEFAULT_CONTEXT_MONITOR,
    currentOutputBytes: 0,
    contextOccupancy: occupancy,
  };
}

/**
 * コンテキスト状況をチェック
 *
 * @param monitor - コンテキスト監視情報
 * @returns ステータス（ok/warning/error）
 */
export function checkContextStatus(
  monitor: ContextUsageMonitor,
): "ok" | "warning" | "error" {
  if (monitor.contextOccupancy >= monitor.errorThreshold) {
    return "error";
  }
  if (monitor.contextOccupancy >= monitor.warningThreshold) {
    return "warning";
  }
  return "ok";
}

// ============================================================================
// Fix Plan Functions (Phase 2 High)
// ============================================================================

/**
 * fix_plan.mdエントリをMarkdown形式に変換
 *
 * @param entry - fix_planエントリ
 * @returns Markdown文字列
 */
export function formatFixPlanEntry(entry: FixPlanEntry): string {
  const lines = [
    `## ${entry.timestamp}`,
    "",
    `### 問題`,
    entry.problem,
    "",
    `### 根本原因`,
    entry.rootCause,
    "",
    `### 解決策`,
    entry.solution,
    "",
    `### 検証方法`,
    entry.verification,
    "",
    `### 関連ファイル`,
    ...entry.relatedFiles.map((f) => `- ${f}`),
  ];

  if (entry.lessonLearned) {
    lines.push("", `### 学んだこと`, entry.lessonLearned);
  }

  lines.push("", "---", "");
  return lines.join("\n");
}

/**
 * fix_plan.mdに追記
 *
 * @param entry - fix_planエントリ
 * @param fixPlanPath - fix_plan.mdのパス
 */
export function appendFixPlanEntry(entry: FixPlanEntry, fixPlanPath: string): void {
  const formatted = formatFixPlanEntry(entry);
  const existing = readTextIfExists(fixPlanPath);
  const header = existing.trim() === "" ? "# Fix Plan\n\n" : "";
  writeText(fixPlanPath, header + existing + formatted);
}

/**
 * fix_plan.mdを読み込み
 *
 * @param fixPlanPath - fix_plan.mdのパス
 * @returns ファイル内容
 */
export function readFixPlan(fixPlanPath: string): string {
  return readTextIfExists(fixPlanPath);
}

// ============================================================================
// Git Workflow Integration (Phase 3 Medium)
// ============================================================================

/**
 * Git自動コミット設定
 *
 * Ralph記事: "On test pass, commit changes automatically."
 */
export interface GitCommitConfig {
  /** 自動コミットを有効にするか */
  enabled: boolean;
  /** コミットメッセージのプレフィックス */
  commitPrefix: string;
  /** テストパス時のみコミットするか */
  commitOnTestPassOnly: boolean;
  /** ステージングするファイルパターン */
  stagingPatterns: string[];
}

/** デフォルトのGit自動コミット設定 */
export const DEFAULT_GIT_COMMIT_CONFIG: GitCommitConfig = {
  enabled: true,
  commitPrefix: "ralph-loop:",
  commitOnTestPassOnly: true,
  stagingPatterns: ["."],
};

/**
 * 自動コミット結果
 */
export interface AutoCommitResult {
  /** コミットを実行したか */
  committed: boolean;
  /** コミットハッシュ（コミットした場合） */
  commitHash?: string;
  /** コミットメッセージ */
  commitMessage?: string;
  /** エラーメッセージ（失敗した場合） */
  error?: string;
}

/**
 * テストパス時に自動コミット
 *
 * @param cwd - 作業ディレクトリ
 * @param testPassed - テストがパスしたか
 * @param config - Git設定
 * @returns コミット結果
 */
export function autoCommitOnTestPass(
  cwd: string,
  testPassed: boolean,
  config: GitCommitConfig = DEFAULT_GIT_COMMIT_CONFIG,
): AutoCommitResult {
  if (!config.enabled) {
    return { committed: false };
  }

  if (config.commitOnTestPassOnly && !testPassed) {
    return { committed: false };
  }

  try {
    // git status --porcelain で変更を確認
    const statusResult = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf-8" });

    if (!statusResult.trim()) {
      return { committed: false };
    }

    // ステージング
    for (const pattern of config.stagingPatterns) {
      execFileSync("git", ["add", pattern], { cwd });
    }

    // コミットメッセージ生成
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const commitMessage = `${config.commitPrefix} auto commit at ${timestamp}`;

    // コミット実行
    execFileSync("git", ["commit", "-m", commitMessage], { cwd });

    // コミットハッシュ取得
    const hashResult = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" });
    const commitHash = hashResult.trim().slice(0, 7);

    return { committed: true, commitHash, commitMessage };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { committed: false, error: errorMessage };
  }
}

// ============================================================================
// AGENT.md Self-Update (Phase 3 Medium)
// ============================================================================

/**
 * AGENT.md学習エントリ
 *
 * Ralph記事: "Update AGENT.md with learnings from the session."
 */
export interface AgentMdEntry {
  /** タイムスタンプ */
  timestamp: string;
  /** 学んだこと */
  learning: string;
  /** 適用すべきルール */
  rule?: string;
  /** 関連ファイル */
  relatedFiles?: string[];
  /** タグ */
  tags?: string[];
}

/**
 * AGENT.mdに学習内容を追記
 *
 * @param entry - 学習エントリ
 * @param agentMdPath - AGENT.mdのパス
 */
export function appendAgentMdLearning(entry: AgentMdEntry, agentMdPath: string): void {
  const existing = readTextIfExists(agentMdPath);

  const lines = [
    "",
    "<!-- Ralph Loop Learning -->",
    `<!-- Date: ${entry.timestamp} -->`,
    "",
    `## Learned: ${entry.learning}`,
  ];

  if (entry.rule) {
    lines.push("", `### Rule`, entry.rule);
  }

  if (entry.relatedFiles && entry.relatedFiles.length > 0) {
    lines.push("", `### Related Files`, ...entry.relatedFiles.map((f) => `- ${f}`));
  }

  if (entry.tags && entry.tags.length > 0) {
    lines.push("", `### Tags`, entry.tags.map((t) => `\`${t}\``).join(", "));
  }

  lines.push("", "---", "");

  writeText(agentMdPath, existing + lines.join("\n"));
}

/**
 * AGENT.mdを読み込み
 *
 * @param agentMdPath - AGENT.mdのパス
 * @returns ファイル内容
 */
export function readAgentMd(agentMdPath: string): string {
  return readTextIfExists(agentMdPath);
}

// ============================================================================
// Workspace Verify Integration (Phase 3 Medium)
// ============================================================================

/**
 * ワークスペース検証結果
 */
export interface WorkspaceVerifyResult {
  /** 検証を実行したか */
  executed: boolean;
  /** テストがパスしたか */
  testPassed?: boolean;
  /** Lintがパスしたか */
  lintPassed?: boolean;
  /** 型チェックがパスしたか */
  typecheckPassed?: boolean;
  /** エラーメッセージ */
  errors?: string[];
}

/**
 * ワークスペース検証を実行
 *
 * @param cwd - 作業ディレクトリ
 * @param config - 検証設定
 * @param timeoutMs - タイムアウト（ミリ秒）
 * @returns 検証結果
 */
export function runWorkspaceVerify(
  cwd: string,
  config: WorkspaceVerificationConfig = DEFAULT_WORKSPACE_VERIFICATION,
  timeoutMs: number = 120000,
): WorkspaceVerifyResult {
  if (!config.enabled) {
    return { executed: false };
  }

  const errors: string[] = [];
  const result: WorkspaceVerifyResult = { executed: true, errors };

  try {
    // テスト実行
    if (config.testCommand) {
      try {
        execFileSync("sh", ["-c", config.testCommand], { cwd, timeout: timeoutMs, encoding: "utf-8" });
        result.testPassed = true;
      } catch (err) {
        result.testPassed = false;
        const output = err instanceof Error ? err.message : String(err);
        errors.push(`Test failed: ${output.slice(0, 200)}`);
      }
    }

    // Lint実行
    if (config.lintCommand) {
      try {
        execFileSync("sh", ["-c", config.lintCommand], { cwd, timeout: timeoutMs, encoding: "utf-8" });
        result.lintPassed = true;
      } catch (err) {
        result.lintPassed = false;
        const output = err instanceof Error ? err.message : String(err);
        errors.push(`Lint failed: ${output.slice(0, 200)}`);
      }
    }

    // 型チェック実行
    if (config.typecheckCommand) {
      try {
        execFileSync("sh", ["-c", config.typecheckCommand], { cwd, timeout: timeoutMs, encoding: "utf-8" });
        result.typecheckPassed = true;
      } catch (err) {
        result.typecheckPassed = false;
        const output = err instanceof Error ? err.message : String(err);
        errors.push(`Typecheck failed: ${output.slice(0, 200)}`);
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    errors.push(`Verification error: ${errorMessage}`);
  }

  return result;
}

/**
 * 検証結果から全体パスを判定
 *
 * @param result - 検証結果
 * @returns 全てパスしたか
 */
export function isAllVerificationPassed(result: WorkspaceVerifyResult): boolean {
  if (!result.executed) {
    return true; // 検証が無効ならパス扱い
  }

  const checks = [result.testPassed, result.lintPassed, result.typecheckPassed];
  const definedChecks = checks.filter((c) => c !== undefined);

  return definedChecks.length > 0 && definedChecks.every((c) => c === true);
}
