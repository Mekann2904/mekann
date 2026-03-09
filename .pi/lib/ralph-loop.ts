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

export async function runRalphLoop(options: RalphLoopOptions): Promise<RalphLoopRunResult> {
  const runtime = options.runtime ?? "pi";
  const status = inspectRalphLoop({ ...options, runtime });
  const prompt = readTextIfExists(status.paths.promptPath).trim();

  if (!status.prdExists) {
    throw new Error(buildMissingFileMessage("prd", status.paths.prdPath, runtime));
  }
  if (!prompt) {
    throw new Error(buildMissingFileMessage("prompt", status.paths.promptPath, runtime));
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
 * デフォルトのプロンプトテンプレート（pi用）
 */
const DEFAULT_PI_PROMPT_TEMPLATE = `# Ralph Loop プロンプト

## 役割
あなたはRalph Loopのエージェントです。以下のルールに従って自律的にタスクを実行してください。

## 基本ルール
1. **1ループ1タスク**: 各ループで最重要の未完了タスクを1つだけ進める
2. **検索してから変更**: 未実装と決めつけず、必ず検索してから実装する
3. **検証は局所的に**: 変更した単位のテスト/lint/型検査を実行する
4. **プレースホルダー禁止**: 簡易実装やplaceholderで済ませない

## タスク管理
- prd.json の tasks 配列を参照して、status: "pending" のタスクを処理する
- タスク完了時は prd.json の status を "completed" に更新する
- progress.txt に進捗を追記する

## 終了条件
すべてのタスクが完了したら、出力に \`COMPLETE\` という文字列を含めてください。

## prd.json の場所
\`\`\`
.pi/ralph/prd.json
\`\`\`

## 進捗ファイルの場所
\`\`\`
.pi/ralph/progress.txt
\`\`\`

## 最初のタスク
prd.jsonを確認し、最初のタスクを特定して実行を開始してください。
`;

/**
 * Claude用プロンプトテンプレート
 */
const DEFAULT_CLAUDE_PROMPT_TEMPLATE = `# Ralph Loop for Claude

## Instructions
You are a Ralph Loop agent. Follow these rules to execute tasks autonomously.

## Core Rules
1. **One task per loop**: Process only the most important pending task each iteration
2. **Search before change**: Always search before assuming something is not implemented
3. **Local verification**: Run tests/lint/typecheck only on changed units
4. **No placeholders**: Never use placeholder or simple implementations

## Task Management
- Read prd.json to find tasks with status: "pending"
- Update task status to "completed" when done
- Append progress to progress.txt

## Completion
When all tasks are complete, include \`COMPLETE\` in your output.

## Files
- PRD: .pi/ralph/prd.json
- Progress: .pi/ralph/progress.txt

Start by reading prd.json and identifying the first task.
`;

/**
 * AMP用プロンプトテンプレート
 */
const DEFAULT_AMP_PROMPT_TEMPLATE = `# Ralph Loop for AMP

## Instructions
Execute tasks autonomously following Ralph Loop methodology.

## Rules
1. One task per iteration
2. Search before implementing
3. Verify changes locally
4. No placeholder implementations

## Completion
Output \`COMPLETE\` when all tasks are done.

## Files
- .pi/ralph/prd.json
- .pi/ralph/progress.txt
`;

/**
 * 初期化結果のインターフェース
 */
export interface RalphLoopInitResult {
  paths: RalphLoopPaths;
  created: {
    prd: boolean;
    prompt: boolean;
    progress: boolean;
  };
  message: string;
}

/**
 * Ralph Loopの初期化オプション
 */
export interface RalphLoopInitOptions {
  cwd: string;
  runtime?: RalphLoopRuntime;
  stateDir?: string;
  promptPath?: string;
  prdContent?: Partial<typeof DEFAULT_PRD_TEMPLATE>;
  promptContent?: string;
  force?: boolean;
  resolveCurrentBranch?: (cwd: string) => string;
}

/**
 * プロンプトテンプレートを取得する
 * @param runtime - ランタイム種別
 * @returns プロンプトテンプレート
 */
function getPromptTemplate(runtime: RalphLoopRuntime): string {
  switch (runtime) {
    case "claude":
      return DEFAULT_CLAUDE_PROMPT_TEMPLATE;
    case "amp":
      return DEFAULT_AMP_PROMPT_TEMPLATE;
    default:
      return DEFAULT_PI_PROMPT_TEMPLATE;
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
  const runtime = options.runtime ?? "pi";
  const paths = buildPaths(options);
  ensureStateDirs(paths);

  const created = {
    prd: false,
    prompt: false,
    progress: false,
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

  // プロンプトファイルの作成
  if (!existsSync(paths.promptPath) || options.force) {
    const promptContent = options.promptContent ?? getPromptTemplate(runtime);
    writeText(paths.promptPath, promptContent);
    created.prompt = true;
  }

  // progress.txt の作成
  if (!existsSync(paths.progressPath) || options.force) {
    writeText(paths.progressPath, "");
    created.progress = true;
  }

  // メッセージの生成
  const messages: string[] = [];
  if (created.prd) {
    messages.push(`prd.json を作成しました: ${paths.prdPath}`);
  }
  if (created.prompt) {
    messages.push(`プロンプトファイルを作成しました: ${paths.promptPath}`);
  }
  if (created.progress) {
    messages.push(`progress.txt を作成しました: ${paths.progressPath}`);
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
  runtime: RalphLoopRuntime,
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

  const promptFileName = defaultPromptFileName(runtime);
  return [
    `プロンプトファイルが見つかりません: ${path}`,
    "",
    "Ralph Loop を開始するには、以下のコマンドで初期化してください:",
    "",
    "  ralph_loop_init を実行",
    "",
    `または、手動で ${promptFileName} を作成してください。`,
    "",
    "プロンプトファイルには、エージェントへの指示を記載します。",
    "例: タスクの説明、実行ルール、終了条件など",
  ].join("\n");
}

