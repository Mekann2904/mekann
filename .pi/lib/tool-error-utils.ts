/**
 * @abdd.meta
 * path: .pi/lib/tool-error-utils.ts
 * role: ツール実行エラーの改善版ユーティリティ
 * why: bash/edit/readツールのエラー判定を改善し、誤検知を減らすため
 * related: lib/errors.ts, lib/agent-errors.ts
 * public_api: BashOptions, SafeBashResult, safeBash, EditOptions, SafeEditResult, safeEdit, ReadOptions, SafeReadResult, safeRead, ToolCriticality, evaluateToolResult
 * invariants: 各関数は一貫した戻り値構造を返す
 * side_effects: ファイルシステム操作（safeRead, safeEdit）
 * failure_modes: ファイル不存在、権限不足、テキスト不一致
 * @abdd.explain
 * overview: コアツール（bash, edit, read）のエラー処理を改善し、誤検知を減らしてAgent Run失敗率を下げるためのユーティリティ。
 * what_it_does:
 *   - bash: exit code判定の改善、期待される終了コードを指定可能に
 *   - edit: 自動リトライ、テキスト不一致時の代替提案
 *   - read: パス検証、存在確認、類似ファイル提案
 *   - ツール重要度判定: クリティカル/非クリティカルの分類
 * why_it_exists:
 *   - 現在のエラー率21.1%の多くが誤検知（bash exit code 1等）
 *   - Agent Runの部分的失敗を許容し、過剰なエラー判定を防ぐため
 * scope:
 *   in: ツール実行パラメータ、オプション設定
 *   out: 統一された結果構造（status, isCritical, suggestions等）
 */

import { existsSync, statSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { basename, dirname, join, normalize } from "path";

// ============================================================================
// Types
// ============================================================================

/**
 * ツール実行の重要度レベル
 */
export type ToolCriticality = "critical" | "non-critical" | "informational";

/**
 * ツール実行結果の状態
 */
export type ToolResultStatus = "ok" | "warning" | "error";

/**
 * 基本ツール結果
 */
export interface BaseToolResult {
  status: ToolResultStatus;
  isCritical: boolean;
  error?: string;
  suggestions?: string[];
}

// ============================================================================
// Bash Tool Enhancement
// ============================================================================

/**
 * safeBash のオプション
 */
export interface BashOptions {
  /** コマンド */
  command: string;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** 許容する終了コード（デフォルト: [0]） */
  allowedExitCodes?: number[];
  /** exit code 1 をエラーとしない（diff/grep等用） */
  allowExitOne?: boolean;
  /** 作業ディレクトリ */
  cwd?: string;
  /** 環境変数 */
  env?: Record<string, string>;
}

/**
 * safeBash の結果
 */
export interface SafeBashResult extends BaseToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** exit code が非ゼロだが許容された場合 */
  isNonZeroAllowed?: boolean;
}

/**
 * デフォルトで exit code 1 を許容するコマンドパターン
 */
const EXIT_ONE_ALLOWED_PATTERNS = [
  /^diff\s/,           // diff は差分があると exit 1
  /^grep\s/,           // grep はマッチしないと exit 1
  /^test\s/,           // test は false で exit 1
  /^\[\s+.*\s+\]$/,    // [ ] も test の別名
  /^git\s+diff\s/,     // git diff も同様
  /^comm\s/,           // comm も比較コマンド
];

/**
 * コマンドが exit code 1 を許容されるか判定
 * @summary exit 1 許容判定
 * @param command 実行コマンド
 * @returns 許容される場合 true
 */
export function isExitOneAllowed(command: string): boolean {
  const trimmed = command.trim();
  return EXIT_ONE_ALLOWED_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * 改善版 bash 実行
 * @summary 安全なbash実行
 * @param options 実行オプション
 * @returns 実行結果
 */
export function safeBash(options: BashOptions): SafeBashResult {
  const {
    command,
    timeout = 30000,
    allowedExitCodes = [0],
    allowExitOne = false,
    cwd = process.cwd(),
    env = {},
  } = options;

  // 自動判定: diff/grep 等は exit 1 を許容
  const effectiveAllowedCodes = allowExitOne || isExitOneAllowed(command)
    ? [...new Set([...allowedExitCodes, 1])]
    : allowedExitCodes;

  try {
    const stdout = execSync(command, {
      timeout,
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }) as string;

    return {
      status: "ok",
      isCritical: false,
      stdout: stdout || "",
      stderr: "",
      exitCode: 0,
    };
  } catch (error: unknown) {
    const execError = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    const exitCode = execError.status ?? 1;
    const stdout = execError.stdout || "";
    const stderr = execError.stderr || execError.message || "";

    // 許容された終了コードかチェック
    const isAllowed = effectiveAllowedCodes.includes(exitCode);

    if (isAllowed) {
      return {
        status: "ok",
        isCritical: false,
        stdout,
        stderr,
        exitCode,
        isNonZeroAllowed: exitCode !== 0,
      };
    }

    // エラーとして返す（ただし非クリティカルの可能性）
    return {
      status: "error",
      isCritical: false, // bash エラーは通常リカバリ可能
      stdout,
      stderr,
      exitCode,
      error: `Command exited with code ${exitCode}: ${stderr.slice(0, 200)}`,
      suggestions: [
        "コマンド構文を確認してください",
        "必要なツールがインストールされているか確認してください",
        exitCode === 1 && !allowExitOne ? "allowExitOne: true で exit 1 を許容できます" : undefined,
      ].filter(Boolean) as string[],
    };
  }
}

// ============================================================================
// Edit Tool Enhancement
// ============================================================================

/**
 * safeEdit のオプション
 */
export interface EditOptions {
  /** ファイルパス */
  path: string;
  /** 置換元テキスト */
  oldText: string;
  /** 置換後テキスト */
  newText: string;
  /** リトライ回数（デフォルト: 1） */
  retries?: number;
  /** リトライ間隔（ミリ秒、デフォルト: 100） */
  retryDelayMs?: number;
  /** フォールバック: 行番号指定を提案 */
  suggestLineNumber?: boolean;
}

/**
 * safeEdit の結果
 */
export interface SafeEditResult extends BaseToolResult {
  /** 編集が成功したか */
  success: boolean;
  /** リトライ回数 */
  retryCount: number;
  /** フォールバック提案: 行番号編集 */
  lineNumberSuggestion?: {
    line: number;
    currentContent: string;
  };
}

/**
 * ファイル内でテキストを検索し、行番号を返す
 * @summary テキスト行番号検索
 * @param content ファイル内容
 * @param searchText 検索テキスト
 * @returns 行番号（1始まり）または null
 */
export function findTextLine(content: string, searchText: string): number | null {
  const lines = content.split("\n");
  const searchLines = searchText.split("\n");
  const firstLine = searchLines[0];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === firstLine) {
      // 複数行マッチ確認
      let match = true;
      for (let j = 1; j < searchLines.length; j++) {
        if (lines[i + j] !== searchLines[j]) {
          match = false;
          break;
        }
      }
      if (match) return i + 1; // 1始まり
    }
  }

  // 部分一致を試す
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(searchText.slice(0, 50))) {
      return i + 1;
    }
  }

  return null;
}

/**
 * 改善版 edit 実行
 * @summary 安全な編集実行
 * @param options 編集オプション
 * @returns 編集結果
 */
export function safeEdit(options: EditOptions): SafeEditResult {
  const {
    path,
    oldText,
    newText,
    retries = 1,
    retryDelayMs = 100,
    suggestLineNumber = true,
  } = options;

  let lastError = "";
  let currentContent = "";

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 最新の内容を読み込む
      currentContent = readFileSync(path, "utf-8");

      // テキストが存在するか確認
      if (!currentContent.includes(oldText)) {
        lastError = `Text not found in ${path}`;

        if (attempt < retries) {
          // 短い待機後にリトライ
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
          continue;
        }

        // 行番号提案を生成
        let lineNumberSuggestion: SafeEditResult["lineNumberSuggestion"];
        if (suggestLineNumber) {
          const line = findTextLine(currentContent, oldText);
          if (line) {
            const lines = currentContent.split("\n");
            lineNumberSuggestion = {
              line,
              currentContent: lines[line - 1] || "",
            };
          }
        }

        return {
          status: "error",
          isCritical: true, // edit 失敗は通常クリティカル
          success: false,
          retryCount: attempt,
          error: lastError,
          suggestions: [
            "ファイルが変更されている可能性があります。内容を確認してください",
            "正確なテキスト（空白・改行含む）を指定してください",
            lineNumberSuggestion ? `行 ${lineNumberSuggestion.line} 付近を確認してください` : undefined,
          ].filter(Boolean) as string[],
          lineNumberSuggestion,
        };
      }

      // 編集実行
      const newContent = currentContent.replace(oldText, newText);
      writeFileSync(path, newContent, "utf-8");

      return {
        status: "ok",
        isCritical: false,
        success: true,
        retryCount: attempt,
      };
    } catch (error: unknown) {
      const err = error as Error;
      lastError = err.message;

      if (attempt < retries) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, retryDelayMs);
        continue;
      }

      return {
        status: "error",
        isCritical: true,
        success: false,
        retryCount: attempt,
        error: lastError,
        suggestions: [
          "ファイルが存在し、書き込み権限があることを確認してください",
          "パスが正しいことを確認してください",
        ],
      };
    }
  }

  return {
    status: "error",
    isCritical: true,
    success: false,
    retryCount: retries,
    error: lastError || "Unknown error",
  };
}

// ============================================================================
// Read Tool Enhancement
// ============================================================================

/**
 * safeRead のオプション
 */
export interface ReadOptions {
  /** ファイルパス */
  path: string;
  /** 開始行（1始まり） */
  offset?: number;
  /** 最大行数 */
  limit?: number;
  /** 類似ファイル検索を有効化 */
  findSimilar?: boolean;
  /** 類似ファイル検索のベースディレクトリ */
  searchBaseDir?: string;
}

/**
 * safeRead の結果
 */
export interface SafeReadResult extends BaseToolResult {
  /** ファイル内容 */
  content: string;
  /** 実際に読み込んだパス */
  actualPath: string;
  /** 類似ファイルの候補 */
  similarFiles?: string[];
  /** ディレクトリ内のファイル一覧（EISDIR の場合） */
  directoryContents?: string[];
}

/**
 * 類似ファイル名を検索
 * @summary 類似ファイル検索
 * @param targetPath 対象パス
 * @param baseDir ベースディレクトリ
 * @returns 類似ファイル一覧
 */
export function findSimilarFiles(targetPath: string, baseDir: string): string[] {
  const targetName = basename(targetPath).toLowerCase();
  const dir = dirname(targetPath);

  try {
    const searchDir = dir.startsWith("/") ? dir : join(baseDir, dir);
    const files = readdirSync(searchDir);

    return files
      .filter(f => {
        const name = f.toLowerCase();
        // 同じ拡張子、または名前が似ている
        return (
          name.endsWith(".ts") && targetName.endsWith(".ts") &&
          (name.includes(targetName.replace(".ts", "")) ||
           targetName.includes(name.replace(".ts", "")))
        );
      })
      .map(f => join(dir, f))
      .slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * 改善版 read 実行
 * @summary 安全な読み込み実行
 * @param options 読み込みオプション
 * @returns 読み込み結果
 */
export function safeRead(options: ReadOptions): SafeReadResult {
  const {
    path,
    offset,
    limit,
    findSimilar = true,
    searchBaseDir = process.cwd(),
  } = options;

  const normalizedPath = normalize(path);

  // 存在確認
  if (!existsSync(normalizedPath)) {
    const similarFiles = findSimilar && findSimilar !== false
      ? findSimilarFiles(normalizedPath, searchBaseDir)
      : [];

    return {
      status: "error",
      isCritical: false, // read 失敗はリカバリ可能
      content: "",
      actualPath: normalizedPath,
      error: `ENOENT: no such file or directory: ${normalizedPath}`,
      similarFiles,
      suggestions: [
        "パスが正しいことを確認してください",
        similarFiles.length > 0 ? `類似ファイル: ${similarFiles.join(", ")}` : undefined,
      ].filter(Boolean) as string[],
    };
  }

  // ディレクトリ確認
  const stat = statSync(normalizedPath);
  if (stat.isDirectory()) {
    try {
      const contents = readdirSync(normalizedPath);
      return {
        status: "error",
        isCritical: false,
        content: "",
        actualPath: normalizedPath,
        error: `EISDIR: illegal operation on a directory: ${normalizedPath}`,
        directoryContents: contents,
        suggestions: [
          "ディレクトリではなくファイルを指定してください",
          `ディレクトリ内のファイル: ${contents.slice(0, 10).join(", ")}${contents.length > 10 ? "..." : ""}`,
        ],
      };
    } catch {
      return {
        status: "error",
        isCritical: false,
        content: "",
        actualPath: normalizedPath,
        error: `EISDIR: illegal operation on a directory: ${normalizedPath}`,
      };
    }
  }

  // ファイル読み込み
  try {
    let content = readFileSync(normalizedPath, "utf-8");

    // オフセット・リミット処理
    if (offset || limit) {
      const lines = content.split("\n");
      const startLine = Math.max(1, offset ?? 1) - 1;
      const endLine = limit !== undefined ? startLine + limit : lines.length;
      content = lines.slice(startLine, endLine).join("\n");
    }

    return {
      status: "ok",
      isCritical: false,
      content,
      actualPath: normalizedPath,
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      status: "error",
      isCritical: false,
      content: "",
      actualPath: normalizedPath,
      error: err.message,
      suggestions: [
        "ファイルが読み取り可能であることを確認してください",
        "ファイルサイズが大きすぎる場合は limit を使用してください",
      ],
    };
  }
}

// ============================================================================
// Tool Criticality Evaluation
// ============================================================================

/**
 * ツール名から重要度を判定
 * @summary ツール重要度判定
 * @param toolName ツール名
 * @returns 重要度レベル
 */
export function getToolCriticality(toolName: string): ToolCriticality {
  // クリティカル: 失敗するとタスク完了不可
  const criticalTools = [
    "write",
    "edit",
    "agent_team_run",
    "agent_team_run_parallel",
    "subagent_run",
    "subagent_run_parallel",
    "create_tool",
    "delete_dynamic_tool",
  ];

  // 情報取得のみ: 失敗してもリカバリ可能
  const informationalTools = [
    "read",
    "bash",
    "code_search",
    "file_candidates",
    "sym_find",
    "sym_index",
    "semantic_search",
    "gh_agent",
  ];

  if (criticalTools.some(t => toolName.includes(t))) {
    return "critical";
  }

  if (informationalTools.some(t => toolName.includes(t))) {
    return "informational";
  }

  return "non-critical";
}

/**
 * ツール実行結果を評価
 * @summary ツール結果評価
 * @param toolName ツール名
 * @param status 実行状態
 * @param errorMessage エラーメッセージ（任意）
 * @returns 評価結果
 */
export function evaluateToolResult(
  toolName: string,
  status: "ok" | "error",
  errorMessage?: string,
): {
  isCritical: boolean;
  shouldFailAgentRun: boolean;
  downgradeToWarning: boolean;
} {
  const criticality = getToolCriticality(toolName);
  const isCritical = criticality === "critical";
  const isError = status === "error";

  // informational ツールのエラーは warning に降格
  const downgradeToWarning = isError && criticality === "informational";

  // Agent Run を失敗させるかどうか
  // - critical ツールのエラー: 失敗
  // - non-critical / informational: 警告のみ
  const shouldFailAgentRun = isError && isCritical;

  return {
    isCritical,
    shouldFailAgentRun,
    downgradeToWarning,
  };
}

// ============================================================================
// Agent Run Partial Failure Evaluation
// ============================================================================

/**
 * Agent Run のツール呼び出し結果を集計評価
 * @summary Agent Run評価
 * @param results ツール呼び出し結果一覧
 * @returns Agent Run 全体の評価
 */
export function evaluateAgentRunResults(
  results: Array<{
    toolName: string;
    status: "ok" | "error";
    errorMessage?: string;
  }>,
): {
  status: "ok" | "warning" | "error";
  failedCount: number;
  criticalFailureCount: number;
  warningCount: number;
  message: string;
  shouldFailAgentRun: boolean;
} {
  const evaluated = results.map(r => ({
    ...r,
    evaluation: evaluateToolResult(r.toolName, r.status, r.errorMessage),
  }));

  const failedCount = evaluated.filter(r => r.status === "error").length;
  const criticalFailureCount = evaluated.filter(
    r => r.status === "error" && r.evaluation.isCritical
  ).length;
  const warningCount = evaluated.filter(
    r => r.status === "error" && r.evaluation.downgradeToWarning
  ).length;

  if (criticalFailureCount > 0) {
    return {
      status: "error",
      failedCount,
      criticalFailureCount,
      warningCount,
      message: `${criticalFailureCount} critical tool(s) failed`,
      shouldFailAgentRun: true,
    };
  }

  if (warningCount > 0) {
    return {
      status: "warning",
      failedCount,
      criticalFailureCount,
      warningCount,
      message: `${warningCount} non-critical tool(s) failed (ignored)`,
      shouldFailAgentRun: false,
    };
  }

  return {
    status: "ok",
    failedCount: 0,
    criticalFailureCount: 0,
    warningCount: 0,
    message: "All tools completed successfully",
    shouldFailAgentRun: false,
  };
}
