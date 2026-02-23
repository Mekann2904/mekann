/**
 * @abdd.meta
 * path: .pi/extensions/loop/verification.ts
 * role: ループ検証コマンドの実行および結果の集約
 * why: ループ処理中に外部検証コマンド（テスト等）を安全かつ確定的に実行し、その結果をシステムに通知するため
 * related: .pi/extensions/loop.ts, .pi/lib/error-utils.ts, .pi/lib/text-utils.ts
 * public_api: LoopVerificationResult, ParsedVerificationCommand, VerificationPolicyConfig, DEFAULT_VERIFICATION_ALLOWLIST_PREFIXES
 * invariants: 捕捉される出力はMAX_CAPTURED_OUTPUTLIST_BYTES(64KB)を超えない
 * side_effects: 外部プロセスを生成し、実行ファイルシステムに対してコマンドを実行する
 * failure_modes: コマンド実行のタイムアウト、許可リストによる実行拒否、標準出力の切り詰め
 * @abdd.explain
 * overview: ループ拡張機能における検証ステップの実行ロジックを提供するモジュール
 * what_it_does:
 *   - 外部プロセスとして検証コマンドを生成・実行する
 *   - 実行許可リスト（Allowlist）に基づいたセキュリティチェックを行う
 *   - 標準出力・標準エラー出力をサイズ制限付きで捕捉する
 *   - 実行結果（終了コード、所要時間、出力内容）を集約して返却する
 * why_it_exists:
 *   - 自動化されたワークフローにおいて、開発者定義のテスト等をループ処理内で確実に実行する必要があるため
 *   - 任意コマンドの実行リスクを軽減するため、明示的な許可リスト制御を行うため
 *   - 冗長な出力によるメモリ消費を抑止し、結果を安定して扱うため
 * scope:
 *   in: 検証コマンド文字列、環境変数によるポリシー設定、許可リスト定義
 *   out: コマンドの実行成否、終了コード、切り詰められた出力ログ、実行時間
 */

// File: .pi/extensions/loop/verification.ts
// Description: Verification command execution for loop extension.
// Why: Handles deterministic verification commands with allowlist-based security.
// Related: .pi/extensions/loop.ts

import { spawn } from "node:child_process";

import { formatDuration } from "../../lib/format-utils.js";
import { toErrorMessage } from "../../lib/error-utils.js";
import {
  truncateTextWithMarker as truncateText,
  toPreview,
} from "../../lib/text-utils.js";

// ============================================================================
// Constants
// ============================================================================

const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;
const MAX_CAPTURED_OUTPUT_BYTES = 64 * 1024;

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

function appendBoundedText(current: string, incoming: string, maxBytes: number): string {
  const next = current + incoming;
  if (Buffer.byteLength(next, "utf-8") <= maxBytes) {
    return next;
  }

  // Keep only tail to cap memory footprint on verbose commands.
  const target = maxBytes - 128;
  if (target <= 0) {
    return next.slice(-maxBytes);
  }

  let tail = next.slice(-Math.max(target, 1));
  while (Buffer.byteLength(tail, "utf-8") > target && tail.length > 1) {
    tail = tail.slice(1);
  }
  return `...[truncated]\n${tail}`;
}

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
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

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
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
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
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
    }, input.timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = undefined;
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout = appendBoundedText(stdout, text, MAX_CAPTURED_OUTPUT_BYTES);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr = appendBoundedText(stderr, text, MAX_CAPTURED_OUTPUT_BYTES);
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
