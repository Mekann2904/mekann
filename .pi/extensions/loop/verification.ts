/**
 * @abdd.meta
 * path: .pi/extensions/loop/verification.ts
 * role: ループ拡張機能における検証コマンドの実行と設定管理
 * why: 決定的な検証コマンドの実行を処理し、許可リストベースのセキュリティと実行ポリシー制御を提供するため
 * related: .pi/extensions/loop.ts, ../../lib/format-utils.js, ../../lib/error-utils.js
 * public_api: LoopVerificationResult, ParsedVerificationCommand, VerificationPolicyConfig, executeVerification, parseVerificationCommand, DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES
 * invariants: 検証実行は許可リストのプレフィックス一致を必須とする、結果オブジェクトは成功/失敗/タイムアウトのいずれかの状態を持つ
 * side_effects: 子プロセスの生成、標準入出力の読み取り、環境変数の参照
 * failure_modes: 許可リスト不一致による実行拒否、コマンドパースエラー、子プロセスの起動失敗またはタイムアウト
 * @abdd.explain
 * overview: ループ処理内での検証コマンド（テスト等）を安全に実行するためのモジュール。コマンド文字列のパース、許可リスト（Allowlist）によるセキュリティチェック、実行ポリシー（頻度やタイミング）の制御を行う。
 * what_it_does:
 *   - 検証コマンド文字列を実行可能ファイルと引数にパースする
 *   - 事前定義された許可リストと照合し、一致する場合のみ実行を許可する
 *   - 子プロセスとして検証コマンドを実行し、終了コード、標準出力、実行時間を収集する
 *   - 環境変数や設定に基づいて検証の実行ポリシー（毎回、完了時のみ、N回ごと）を決定する
 *   - デフォルトの許可リストとしてnpm, pnpm, yarn, vitest等の主要なテストコマンドを提供する
 * why_it_exists:
 *   - CI/CDや開発ループにおいて、ビルドと検証を自動的に連携させるため
 *   - 任意のコマンド実行によるセキュリティリスクを許可リストで軽減するため
 *   - 検証の実行頻度を制御し、リソース消費を最適化するため
 * scope:
 *   in: 検証コマンド文字列、環境変数（PI_LOOP_VERIFY_*）、実行ポリシー設定
 *   out: 検証実行結果（成否、時間、ログ）、パースエラー情報
 */

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
 * ループ検証の実行結果
 * @summary 検証結果
 * @param command - 実行したコマンド
 * @param passed - 検証合格フラグ
 * @param timedOut - タイムアウトフラグ
 * @param exitCode - 終了コード
 * @param durationMs - 実行時間（ミリ秒）
 * @param stdout - 標準出力
 * @param stderr - 標準エラー出力
 * @param error - エラーメッセージ（任意）
 */
export interface LoopVerificationResult {
  command: string;
  passed: boolean;
  timedOut: boolean;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error?: string;
}

/**
 * パースされた検証コマンド
 * @summary 検証コマンド情報
 * @param executable - 実行ファイルパス
 * @param args - 引数リスト
 * @param error - エラー文字列（任意）
 */
export interface ParsedVerificationCommand {
  executable: string;
  args: string[];
  error?: string;
}

/**
 * 検証ポリシーのモード
 * @summary 検証モード
 */
export type VerificationPolicyMode = "always" | "done_only" | "every_n";

/**
 * 検証ポリシーの設定
 * @summary 検証ポリシー設定
 * @param mode - 検証モード
 * @param everyN - 実行頻度（modeがevery_nの場合）
 */
export interface VerificationPolicyConfig {
  mode: VerificationPolicyMode;
  everyN: number;
}

// ============================================================================
// Verification Policy
// ============================================================================

/**
 * 検証ポリシー設定を解決
 * @summary ポリシー設定解決
 * @returns 検証ポリシーの設定オブジェクト
 */
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

/**
 * 検証実行判定
 * @summary 実行可否判定
 * @param input - 現在のイテレーション情報と検証ポリシー
 * @returns 実行する場合はtrue
 */
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

 /**
  * 検証コマンドを実行する
  * @param input.command - 実行するコマンド
  * @param input.cwd - 作業ディレクトリ
  * @param input.timeoutMs - タイムアウト（ミリ秒）
  * @param input.signal - 中断シグナル
  * @returns 検証結果
  */
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

/**
 * @summary コマンドをパース
 * @param command - パース対象のコマンド文字列
 * @returns パース結果（実行ファイル、引数、エラー）
 */
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

/**
 * 許可リストを解決
 * @summary プレフィックスを解決
 * @param なし
 * @returns 許可リストのプレフィックスの2次元配列
 */
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

 /**
  * 検証コマンドが許可リストに含まれるか判定
  * @param command 検証対象のコマンド
  * @param allowlistPrefixes 許可するコマンド接頭辞のリスト
  * @returns 許可されている場合はtrue
  */
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

/**
 * 検証結果からフィードバックを生成
 * @summary フィードバック生成
 * @param result 検証結果
 * @returns フィードバックメッセージの配列
 */
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
