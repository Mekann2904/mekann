/**
 * @abdd.meta
 * path: .pi/extensions/search/utils/cli.ts
 * role: 外部プロセス実行ラッパー
 * why: タイムアウト、中断信号、出力サイズ制限、エラー処理を統一的に管理するため
 * related: .pi/extensions/search/types, .pi/extensions/search/utils/constants
 * public_api: execute
 * invariants: タイムアウトまたはサイズ制限を超過した場合、プロセスは必ずSIGTERMで終了される
 * side_effects: 子プロセスの生成と終了、プロセス環境変数への書き込み、システムシグナルの監視
 * failure_modes: コマンド不在、権限不足、シグナルによる強制終了、出力バッファオーバーフロー
 * @abdd.explain
 * overview: Node.jsのspawnをラップし、安全かつ制御可能なCLIコマンド実行環境を提供する
 * what_it_does:
 *   - コマンドを指定された作業ディレクトリと環境変数で実行する
 *   - 標準出力・標準エラーの収集量をmaxOutputSizeで制限する
 *   - timeout時間経過またはAbortSignal受信によりプロセスを強制終了する
 *   - 終了コード、出力内容、タイムアウト/強制終了フラグを含む結果オブジェクトを返す
 * why_it_exists:
 *   - 外部ツール（検索コマンド等）の実行において、ハングアップやメモリ過大消費を防ぐため
 *   - 呼び出し元で個別に実装するよりも、一貫したエラーハンドリングとリソース管理を提供するため
 * scope:
 *   in: コマンド文字列、引数リスト、実行オプション（cwd, timeout, signal, maxOutputSize, env）
 *   out: 実行結果を表すPromise<CliResult>（code, stdout, stderr, timedOut, killed, truncated）
 */

/**
 * CLI Execution Utilities
 *
 * Provides spawn wrapper with:
 * - Timeout handling
 * - Abort signal support
 * - Output size limits
 * - Consistent error handling
 * - Default exclusion patterns
 */

import { spawn } from "node:child_process";
import type { CliOptions, CliResult, CliError, ToolAvailability, ToolVersion } from "../types";
import { DEFAULT_EXCLUDES, DEFAULT_LIMIT, DEFAULT_CODE_SEARCH_LIMIT, DEFAULT_IGNORE_CASE } from "./constants.js";

// Default timeout: 30 seconds
const DEFAULT_TIMEOUT = 30_000;

// Maximum output size: 10MB
const DEFAULT_MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

/**
 * コマンドを実行する
 * @summary コマンドを実行する
 * @param command - 実行するコマンド
 * @param args - コマンド引数
 * @param options - 実行オプション
 * @returns コマンドの実行結果
 * @throws コマンド実行失敗時
 */
export async function execute(
  command: string,
  args: string[] = [],
  options: CliOptions = {}
): Promise<CliResult> {
  const {
    cwd = process.cwd(),
    timeout = DEFAULT_TIMEOUT,
    signal,
    maxOutputSize = DEFAULT_MAX_OUTPUT_SIZE,
    env = {},
  } = options;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let killed = false;
    let timedOut = false;

    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Handle abort signal
    const abortHandler = () => {
      killed = true;
      proc.kill("SIGTERM");
    };

    if (signal) {
      if (signal.aborted) {
        proc.kill("SIGTERM");
        resolve({
          code: 1,
          stdout: "",
          stderr: "Operation aborted",
          timedOut: false,
          killed: true,
        });
        return;
      }
      signal.addEventListener("abort", abortHandler);
    }

    // Timeout handler
    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeout);

    // Collect stdout
    proc.stdout.on("data", (data: Buffer) => {
      if (!truncated && stdout.length < maxOutputSize) {
        const remaining = maxOutputSize - stdout.length;
        if (data.length <= remaining) {
          stdout += data.toString();
        } else {
          stdout += data.subarray(0, remaining).toString();
          truncated = true;
        }
      }
    });

    // Collect stderr
    proc.stderr.on("data", (data: Buffer) => {
      if (!truncated && stderr.length < maxOutputSize) {
        const remaining = maxOutputSize - stderr.length;
        if (data.length <= remaining) {
          stderr += data.toString();
        } else {
          stderr += data.subarray(0, remaining).toString();
        }
      }
    });

    // Handle process exit
    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        timedOut,
        killed,
      });
    });

    // Handle process error
    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }

      resolve({
        code: 1,
        stdout,
        stderr: err.message,
        timedOut: false,
        killed: false,
      });
    });
  });
}

/**
 * コマンド実行
 * @summary コマンド実行
 * @param command - 実行するコマンド
 * @param args - コマンド引数
 * @param options - 実行オプション
 * @returns 標準出力の内容
 * @throws コマンド失敗時
 */
export async function executeOrThrow(
  command: string,
  args: string[] = [],
  options: CliOptions = {}
): Promise<string> {
  const result = await execute(command, args, options);

  if (result.code !== 0) {
    const error = new Error(
      `Command failed: ${command} ${args.join(" ")}\n${result.stderr}`
    ) as CliError;
    error.code = result.code;
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.command = `${command} ${args.join(" ")}`;
    throw error;
  }

  return result.stdout;
}

/**
 * コマンドの存在確認
 * @summary コマンド確認
 * @param command - コマンド名
 * @returns 利用可能であれば true
 */
export async function isAvailable(command: string): Promise<boolean> {
  const whichCommand = process.platform === "win32" ? "where" : "which";
  const result = await execute(whichCommand, [command], { timeout: 5000 });
  return result.code === 0 && result.stdout.trim().length > 0;
}

/**
 * ツールバージョン取得
 * @summary ツールバージョンを取得
 * @param command - コマンド名
 * @param versionFlag - バージョンフラグ
 * @returns ツールバージョン情報
 */
export async function getVersion(
  command: string,
  versionFlag = "--version"
): Promise<ToolVersion | null> {
  const pathResult = await execute("which", [command], { timeout: 5000 });
  if (pathResult.code !== 0) return null;

  const versionResult = await execute(command, [versionFlag], { timeout: 5000 });
  if (versionResult.code !== 0) return null;

  return {
    name: command,
    version: versionResult.stdout.trim().split("\n")[0],
    path: pathResult.stdout.trim(),
  };
}

/**
 * Check availability of all search tools.
 * Caches results for the session.
 * @param force - Force refresh cache (default: false)
 */
let cachedAvailability: ToolAvailability | null = null;

/**
 * ツール利用可否チェック
 * @summary ツール利用可否を確認
 * @param force - キャッシュを強制更新するか
 * @returns ツール利用可否情報
 */
export async function checkToolAvailability(force = false): Promise<ToolAvailability> {
  if (cachedAvailability && !force) return cachedAvailability;

  const [fd, rg, ctagsPath] = await Promise.all([
    isAvailable("fd"),
    isAvailable("rg"),
    execute("which", ["ctags"], { timeout: 5000 }),
  ]);

  let ctags = ctagsPath.code === 0;
  let ctagsJson = false;

  // Check if ctags supports JSON output (universal-ctags)
  if (ctags) {
    const ctagsHelp = await execute("ctags", ["--help"], { timeout: 5000 });
    ctagsJson = ctagsHelp.stdout.includes("--output-format");
  }

  cachedAvailability = { fd, rg, ctags, ctagsJson };
  return cachedAvailability;
}

/**
 * fdコマンド引数作成
 * @summary fd引数を生成
 * @param input - ファイル候補入力
 * @returns コマンド引数配列
 */
export function buildFdArgs(input: import("../types").FileCandidatesInput): string[] {
  const args: string[] = [];

  // Type filter: fd uses short form -t f or -t d
  const typeMap: Record<string, string> = { file: "f", dir: "d", directory: "d" };
  const fdType = typeMap[input.type || "file"] || "f";
  args.push("-t", fdType);

  // Pattern (must always provide a pattern before the search path)
  // fd syntax: fd [OPTIONS] [PATTERN] [PATH]
  // If pattern is omitted, the search path would be interpreted as a pattern
  args.push(input.pattern || ".");

  // Extensions: fd requires -e for each extension
  if (input.extension && input.extension.length > 0) {
    for (const ext of input.extension) {
      args.push("-e", ext);
    }
  }

  // Exclusions: Apply DEFAULT_EXCLUDES when not explicitly specified
  // User can pass empty array `exclude: []` to disable default excludes
  const excludes = input.exclude ?? [...DEFAULT_EXCLUDES];
  for (const exc of excludes) {
    args.push("--exclude", exc);
  }

  // Depth
  if (input.maxDepth !== undefined) {
    args.push("--max-depth", String(input.maxDepth));
  }

  // Limit (fd has --max-results)
  const limit = input.limit ?? DEFAULT_LIMIT;
  args.push("--max-results", String(limit));

  // Pattern is positional - search path is provided via execute cwd option
  // Do NOT add path as positional argument to avoid conflict with cwd option

  return args;
}

/**
 * ripgrepコマンド引数作成
 * @summary ripgrep引数を生成
 * @param input - コード検索入力
 * @returns コマンド引数配列
 */
export function buildRgArgs(input: import("../types").CodeSearchInput): string[] {
  const args: string[] = ["--json"];

  // Case sensitivity (default: true from DEFAULT_IGNORE_CASE)
  const ignoreCase = input.ignoreCase ?? DEFAULT_IGNORE_CASE;
  if (ignoreCase) {
    args.push("--ignore-case");
  }

  // Literal search
  if (input.literal) {
    args.push("--fixed-strings");
  }

  // File type
  if (input.type) {
    args.push("--type", input.type);
  }

  // Context
  if (input.context !== undefined && input.context > 0) {
    args.push("--context", String(input.context));
  }

  // Exclusions: Apply DEFAULT_EXCLUDES when not explicitly specified
  // User can pass empty array `exclude: []` to disable default excludes
  // ripgrep uses --glob '!pattern' format for exclusions
  const excludes = input.exclude ?? [...DEFAULT_EXCLUDES];
  for (const exc of excludes) {
    args.push("--glob", `!${exc}`);
  }

  // Pattern (required)
  args.push("--", input.pattern);

  // Path
  if (input.path) {
    args.push(input.path);
  }

  return args;
}

/**
 * ctagsコマンド引数作成
 * @summary ctags引数を生成
 * @param targetPath - 対象パス
 * @param cwd - カレントディレクトリ
 * @returns コマンド引数配列
 */
export function buildCtagsArgs(targetPath: string, cwd: string): string[] {
  return [
    "--output-format=json",
    "--fields=+n+s+S+k",
    "--extras=+q",
    "--sort=no",
    "-R",
    targetPath,
  ];
}
