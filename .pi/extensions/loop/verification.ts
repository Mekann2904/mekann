// File: .pi/extensions/loop/verification.ts
// Description: Verification command execution for loop extension.
// Why: Handles deterministic verification commands with allowlist-based security.
// Related: .pi/extensions/loop.ts

import { spawn } from "node:child_process";

import { formatDuration } from "../../lib/format-utils.js";
import { toErrorMessage } from "../../lib/error-utils.js";

// ============================================================================
// Constants
// ============================================================================

const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;

export const VERIFICATION_ALLOWLIST_ENV = "PI_LOOP_VERIFY_ALLOWLIST";
export const VERIFICATION_ALLOWLIST_ADDITIONAL_ENV = "PI_LOOP_VERIFY_ALLOWLIST_ADDITIONAL";
export const VERIFICATION_POLICY_ENV = "PI_LOOP_VERIFY_POLICY";
export const VERIFICATION_POLICY_EVERY_N_ENV = "PI_LOOP_VERIFY_EVERY_N";

export const DEFAULT_VERIFICATION_POLICY_MODE: VerificationPolicyMode = "done_only";
export const DEFAULT_VERIFICATION_POLICY_EVERY_N = 2;

export const DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES: string[][] = [
  ["npm", "test"],
  ["npm", "run", "test"],
  ["pnpm", "test"],
  ["pnpm", "run", "test"],
  ["yarn", "test"],
  ["yarn", "run", "test"],
  ["bun", "test"],
  ["vitest"],
  ["pytest"],
  ["go", "test"],
  ["cargo", "test"],
];

// ============================================================================
// Types
// ============================================================================

/**
 * ループ検証の実行結果を表すインターフェース
 *
 * テストコマンドや検証コマンドの実行結果を格納します。
 *
 * @property command - 実行されたコマンド文字列
 * @property passed - 検証が成功したかどうか
 * @property timedOut - コマンドがタイムアウトしたかどうか
 * @property exitCode - プロセスの終了コード（取得できない場合はnull）
 * @property durationMs - 実行時間（ミリ秒）
 * @property stdout - 標準出力の内容
/**
  * パース済みの検証コマンド情報を表すインターフェース
  *
  * 検証コマンド文字列を解析し、実行可能ファイル名と引数に分解した結果を格納します。
  * パースに失敗した場合はerrorフィールドにエラーメッセージが設定されます。
  *
  * @property executable - 実行可能ファイルのパスまたは名前
  * @property args - コマンドに渡す引数の配列
/**
   * 検証ポリシーの設定を定義するインターフェース
   *
   * ループ処理における検証実行のタイミングと頻度を制御する。
   *
   * @property mode - 検証モード（"always": 常に検証, "done_only": 完了時のみ, "every_n": N回ごとに検証）
   * @property everyN - modeが"every_n"の場合の検証間隔（何回に1回検証するか）
   * @example
   * const config: VerificationPolicyConfig = {
   *   mode: "every_n",
   *   everyN: 10
   * };
   */

/**
 * ループ検証結果を表すインターフェース
 *
 * @property command - 実行されたコマンド
 * @property passed - 検証が成功したかどうか
 * @property timedOut - タイムアウトしたかどうか
 * @property exitCode - 終了コード
 * @property durationMs - 実行時間（ミリ秒）
 * @property stdout - 標準出力の内容
 * @property stderr - 標準エラー出力の内容
 * @property error - エラーが発生した場合のエラーメッセージ（オプション）
 */
export interface LoopVerificationResult {
  command: string;
  passed: boolean;
  timedOut: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
/**
   * /**
   * * 検証コマンドを実行し、結果を返す
   * *
   * * 指定されたコマンドをシェル経由せず直接実行し、
   * * 許可リストのプレフィックスに一致するか検証します。
   * *
   * * @param input - 実行パラ
   */
  error?: string;
}

export interface ParsedVerificationCommand {
  executable: string;
  args: string[];
  error?: string;
}

export type VerificationPolicyMode = "always" | "done_only" | "every_n";

export interface VerificationPolicyConfig {
  mode: VerificationPolicyMode;
  everyN: number;
}

// ============================================================================
// Verification Policy
// ============================================================================

export function resolveVerificationPolicy(): VerificationPolicyConfig {
  const rawMode = String(process.env[VERIFICATION_POLICY_ENV] || "")
    .trim()
    .toLowerCase();
  const mode: VerificationPolicyMode =
    rawMode === "always" || rawMode === "done_only" || rawMode === "every_n"
      ? rawMode
      : DEFAULT_VERIFICATION_POLICY_MODE;
  const rawEveryN = Number(process.env[VERIFICATION_POLICY_EVERY_N_ENV]);
  const everyN =
    Number.isFinite(rawEveryN) && rawEveryN >= 1 ? Math.trunc(rawEveryN) : DEFAULT_VERIFICATION_POLICY_EVERY_N;
  return { mode, everyN };
}

export function shouldRunVerificationCommand(input: {
  iteration: number;
  maxIterations: number;
  status: "continue" | "done" | "unknown";
  policy: VerificationPolicyConfig;
}): boolean {
  if (input.policy.mode === "always") {
    return true;
  }
  if (input.policy.mode === "every_n") {
    if (input.status === "done") return true;
    if (input.iteration === input.maxIterations) return true;
    return input.iteration % input.policy.everyN === 0;
  }
  return input.status === "done" || input.iteration === input.maxIterations;
}

// ============================================================================
// Verification Execution
// ============================================================================

export async function runVerificationCommand(input: {
  command: string;
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<LoopVerificationResult> {
  // Verification is executed without a shell and must match an explicit allowlist prefix.
  const parsedCommand = parseVerificationCommand(input.command);
  if (parsedCommand.error) {
    return {
      command: input.command,
      passed: false,
      timedOut: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: parsedCommand.error,
    };
  }

  const allowlist = resolveVerificationAllowlistPrefixes();
  if (!isVerificationCommandAllowed(parsedCommand, allowlist)) {
    return {
      command: input.command,
      passed: false,
      timedOut: false,
      exitCode: null,
      durationMs: 0,
      stdout: "",
      stderr: "",
      error: `verification command is not allowed by ${VERIFICATION_ALLOWLIST_ENV}: ${formatAllowlistPreview(allowlist)}`,
    };
  }

  const startedAt = Date.now();

  return await new Promise<LoopVerificationResult>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const child = spawn(parsedCommand.executable, parsedCommand.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const finish = (partial: {
      passed: boolean;
      timedOut: boolean;
      exitCode: number | null;
      error?: string;
    }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise({
        command: input.command,
        passed: partial.passed,
        timedOut: partial.timedOut,
        exitCode: partial.exitCode,
        durationMs: Date.now() - startedAt,
        stdout: truncateText(redactSensitiveText(stdout.trim()), 1_200),
        stderr: truncateText(redactSensitiveText(stderr.trim()), 1_200),
        error: partial.error,
      });
    };

    const killSafely = (sig: NodeJS.Signals) => {
      if (child.killed) return;
      try {
        child.kill(sig);
      } catch {
        // noop
      }
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish({
        passed: false,
        timedOut: false,
        exitCode: null,
        error: "verification aborted",
      });
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      killSafely("SIGTERM");
/**
       * 検証コマンド文字列を解析する
       *
       * コマンド文字列を受け取り、実行可能ファイル名と引数の配列に分解して返す。
       * 空文字列や無効な形式の場合は、エラー情報を含むオブジェクトを返す。
       *
       * @param command - 解析対象の検証コマンド文字列
       * @returns 解析結果。executable、args、error（エラー時のみ）を含むオブジェクト
       * @example
       * // 正常なコマンドの解析
       * const result = parseVerificationCommand("node --check script.js");
       * // result: { executable: "node", args: ["--check", "script.js"] }
       * @example
       * // 空文字列の場合
       * const result = parseVerificationCommand("");
       * // result: { executable: "", args: [], error: "verification command is empty" }
       */
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
    }, input.timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", onAbort);
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
    });

    child.on("error", (error) => {
      finish({
        passed: false,
        timedOut: false,
        exitCode: null,
        error: toErrorMessage(error),
      });
    });

    child.on("close", (code) => {
      if (timedOut) {
        finish({
          passed: false,
          timedOut: true,
          exitCode: code,
          error: `verification timed out after ${input.timeoutMs}ms`,
        });
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        finish({
          passed: false,
          timedOut: false,
          exitCode: code,
          error: detail,
        });
        return;
      }

      finish({
        passed: true,
        timedOut: false,
        exitCode: code,
      });
    });
  });
}

// ============================================================================
// Command Parsing
// ============================================================================

export function parseVerificationCommand(command: string): ParsedVerificationCommand {
  const raw = String(command ?? "").trim();
  if (!raw) {
    return {
      executable: "",
      args: [],
      error: "verification command is empty",
    };
  }

  if (/[\r\n]/.test(raw)) {
    return {
      executable: "",
      args: [],
      error: "verification command must be a single line",
    };
  }

  if (/[|&;<>()$`]/.test(raw)) {
    return {
      executable: "",
      args: [],
      error: "shell operators are not allowed in verification command",
    };
  }

  const tokens = tokenizeArgs(raw).filter(Boolean);
  if (tokens.length === 0) {
    return {
      executable: "",
      args: [],
      error: "verification command is empty",
    };
  }

  return {
    executable: tokens[0],
    args: tokens.slice(1),
  };
}

function tokenizeArgs(input: string): string[] {
  const tokens: string[] = [];
/**
   * /**
   * * 検証コマンドが許可リストのプレフィックスと一致するか判定する
   * *
   * * コマンドの実行ファイルと引数を結合し、許可リストのいずれかのプレフィックスと
   * * 先頭から一致するかを確認する。大文字小文字は区別しない。
   * *
   * * @param command - 検証対象のパース済みコマンド
   * * @param allowlistPrefixes - 許可されたコマンドプレフィックスのリスト（各プレフィックスはトークン配列）
   * * @returns コマンドが許可リストのいずれかのプレフィックスと一致する場合true
   * * @example
   * * // 許可リストに基づくコマンド検
   */
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

// ============================================================================
// Allowlist
// ============================================================================

export function resolveVerificationAllowlistPrefixes(): string[][] {
  // Always start with the default allowlist for security
  const basePrefixes = DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES.map((item) => [...item]);

  // Check for deprecated override environment variable (warn but still process for backwards compat)
  const rawOverride = String(process.env[VERIFICATION_ALLOWLIST_ENV] || "").trim();
  if (rawOverride) {
    console.warn(
      `[loop] Warning: ${VERIFICATION_ALLOWLIST_ENV} is deprecated. ` +
      `Use ${VERIFICATION_ALLOWLIST_ADDITIONAL_ENV} to add prefixes instead of overriding. ` +
      `Override will be ignored for security reasons.`
    );
  }

  // Only allow additional prefixes via the new environment variable
  const rawAdditional = String(process.env[VERIFICATION_ALLOWLIST_ADDITIONAL_ENV] || "").trim();
  if (!rawAdditional) {
    return basePrefixes;
  }

  const additionalPrefixes = rawAdditional
    .split(",")
    .map((item) => item.trim())
    .map((entry) => tokenizeArgs(entry))
    .map((tokens) => tokens.map((token) => token.trim()).filter(Boolean))
    .filter((tokens) => tokens.length > 0);

  // Merge base prefixes with additional prefixes (additional are appended)
  return [...basePrefixes, ...additionalPrefixes];
}

export function isVerificationCommandAllowed(
  command: ParsedVerificationCommand,
  allowlistPrefixes: string[][],
): boolean {
  const commandTokens = [command.executable, ...command.args].map((token) => token.toLowerCase());
  return allowlistPrefixes.some((prefix) => {
    if (prefix.length === 0 || commandTokens.length < prefix.length) {
      return false;
    }
    return prefix.every((token, index) => token.toLowerCase() === commandTokens[index]);
  });
}

function formatAllowlistPreview(prefixes: string[][]): string {
  const preview = prefixes.slice(0, 6).map((prefix) => prefix.join(" "));
  if (prefixes.length > 6) {
    preview.push("...");
  }
  return preview.join(", ");
}

// ============================================================================
// Utilities
// ============================================================================

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function redactSensitiveText(value: string): string {
  if (!value) return value;

  const replacements: Array<[RegExp, string]> = [
    [/(api[_-]?key\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(token\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(password\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(secret\s*[:=]\s*)([^\s]+)/gi, "$1[REDACTED]"],
    [/(bearer\s+)([a-z0-9._-]+)/gi, "$1[REDACTED]"],
  ];

  let redacted = value;
  for (const [pattern, replacement] of replacements) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

export function buildVerificationValidationFeedback(result: LoopVerificationResult): string[] {
  if (result.passed) return [];

  const duration = formatDuration(result.durationMs);
  const code = result.exitCode === null ? "none" : String(result.exitCode);
  const reason = result.error || result.stderr || result.stdout || "verification failed";
  const compactReason = toPreview(reason.replace(/\s+/g, " ").trim(), 180);

  return [
    `Verification: passed=false timedOut=${result.timedOut ? "yes" : "no"} exit=${code} duration=${duration}.`,
    `Verification reason: ${compactReason}`,
  ];
}

function toPreview(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}
