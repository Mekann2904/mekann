/**
 * @abdd.meta
 * path: .pi/extensions/shared/pi-print-executor.ts
 * role: piコマンドのJSONストリーミング実行を管理するエグゼキューター
 * why: subagents.tsとagent-teams.ts間で一貫したプロセス実行とアイドルタイムアウト検出を実現するため
 * related: .pi/extensions/shared/subagents.ts, .pi/extensions/shared/agent-teams.ts
 * public_api: executePrintCommand関数, PrintExecutorOptionsインターフェース, PrintCommandResultインターフェース
 * invariants: タイムアウト期間中に出力がなければプロセスを終了する, agent_endまたはmessage_endを受信すると実行完了とみなす
 * side_effects: 外部プロセスを生成する, 標準出力・標準エラーをリアルタイムで処理する
 * failure_modes: プロセスが応答しない場合のタイムアウト, JSONパースエラーによる行の無視, シグナルによる中断時の強制終了
 * @abdd.explain
 * overview: pi --mode json を使用した外部プロセスの実行ラッパー
 * what_it_does:
 *   - piプロセスを生成し、stdout/stderrのストリームを監視する
 *   - JSON行をパースし、text_deltaとthinking_deltaを抽出する
 *   - 出力ごとにタイマーをリセットし、アイドル状態を検出してタイムアウトする
 *   - AbortSignalを使用してプロセスをキャンセルする
 * why_it_exists:
 *   - GLM-5など推論時間が長いモデルに対応するため
 *   - 複数の呼び出し元で一貫した実行ロジックを再利用するため
 *   - 出力がない場合のみタイムアウトすることで、正確な応答待機を行うため
 * scope:
 *   in: プロンプト、プロバイダー/モデル設定、タイムアウト時間、AbortSignal
 *   out: 生成されたテキスト、実行時間、ストリーミングイベント
 */

/**
 * Shared pi print mode executor.
 * Used by both subagents.ts and agent-teams.ts for consistent process execution.
 *
 * Uses pi --mode json for streaming output:
 * - Receives text_delta events in real-time, allowing accurate idle timeout detection.
 * - Supports models with long thinking times (e.g., GLM-5).
 * - Only times out when the process becomes unresponsive (no output for the timeout period).
 */

import { spawn } from "node:child_process";

const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;

/** Default idle timeout for subagent execution (5 minutes) */
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;

/**
 * 印刷実行オプション
 * @summary オプション設定
 * @param entityLabel - エンティティラベル
 * @param provider - プロバイダ名
 * @param model - モデル名
 * @param prompt - プロンプト
 * @param timeoutMs - タイムアウト時間
 * @returns -
 */
export interface PrintExecutorOptions {
  /** Entity type label for error messages (e.g., "subagent", "agent team member") */
  entityLabel: string;
  /** Optional provider override */
  provider?: string;
  /** Optional model override */
  model?: string;
  /** Prompt to send to pi */
  prompt: string;
  /** Whether to disable extensions in child pi process (default: true) */
  noExtensions?: boolean;
  /** Optional environment overrides for child process */
  envOverrides?: NodeJS.ProcessEnv;
  /** Idle timeout in milliseconds - resets on each output chunk (0 = disabled, default: 300000) */
  timeoutMs: number;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional callback for stdout chunks (raw JSON lines) */
  onStdoutChunk?: (chunk: string) => void;
  /** Optional callback for stderr chunks */
  onStderrChunk?: (chunk: string) => void;
  /** Optional callback for text delta events (for preview display) */
  onTextDelta?: (delta: string) => void;
  /** Optional callback for thinking delta events (for preview display) */
  onThinkingDelta?: (delta: string) => void;
}

/**
 * 印刷コマンド結果
 * @summary 結果を表す
 * @param output - 出力データ
 * @param latencyMs - レイテンシ(ミリ秒)
 * @returns -
 */
export interface PrintCommandResult {
  output: string;
  latencyMs: number;
}

/**
 * Trims error messages to a reasonable length for display.
 */
function trimForError(text: string, maxLength = 200): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength) + "...";
}

/**
 * Parse JSON stream lines and extract text content.
 * Handles both complete JSON objects and partial lines.
 */
function parseJsonStreamLine(line: string): { type: string; textDelta?: string; thinkingDelta?: string; isEnd?: boolean } | null {
  if (!line.startsWith("{")) return null;

  try {
    const obj = JSON.parse(line);

    // Check for agent_end (completion)
    if (obj.type === "agent_end") {
      return { type: "agent_end", isEnd: true };
    }

    // Check for message_end (turn completion)
    if (obj.type === "message_end") {
      return { type: "message_end", isEnd: true };
    }

    // Extract text_delta from message_update
    if (obj.type === "message_update" && obj.assistantMessageEvent?.type === "text_delta") {
      return { type: "text_delta", textDelta: obj.assistantMessageEvent.delta };
    }

    // Extract thinking_delta from message_update
    if (obj.type === "message_update" && obj.assistantMessageEvent?.type === "thinking_delta") {
      return { type: "thinking_delta", thinkingDelta: obj.assistantMessageEvent.delta };
    }

    return { type: obj.type || "unknown" };
  } catch {
    return null;
  }
}

/**
 * Extract final text from agent_end message.
 */
function extractFinalText(line: string): { text: string | null; thinking: string | null } {
  try {
    const obj = JSON.parse(line);
    if (obj.type === "agent_end" && obj.messages) {
      const lastMessage = obj.messages[obj.messages.length - 1];
      if (lastMessage?.role === "assistant" && Array.isArray(lastMessage.content)) {
        const textBlock = lastMessage.content.find((b: { type: string }) => b.type === "text");
        const thinkingBlock = lastMessage.content.find((b: { type: string }) => b.type === "thinking");
        return {
          text: textBlock?.text || null,
          thinking: thinkingBlock?.thinking || null,
        };
      }
    }
    return { text: null, thinking: null };
  } catch {
    return { text: null, thinking: null };
  }
}

/**
 * Format thinking block with indentation for distinct display.
 */
function formatThinkingBlock(thinking: string): string {
  if (!thinking?.trim()) return "";
  const lines = thinking.split("\n");
  const formatted = lines.map((line) => `  ${line}`).join("\n");
  return `[Thinking]\n${formatted}`;
}

/**
 * Combine text and thinking content with proper formatting.
 */
function combineTextAndThinking(text: string, thinking: string): string {
  const parts: string[] = [];
  if (thinking?.trim()) {
    parts.push(formatThinkingBlock(thinking));
  }
  if (text?.trim()) {
    if (parts.length > 0) parts.push("");
    parts.push(text.trim());
  }
  return parts.join("\n");
}

/**
 * Pi印刷モード実行
 * @summary 印刷を実行する
 * @param input - 実行オプション
 * @returns コマンド実行結果
 */
export async function runPiPrintMode(
  input: PrintExecutorOptions,
): Promise<PrintCommandResult> {
  const { entityLabel } = input;

  if (input.signal?.aborted) {
    throw new Error(`${entityLabel} run aborted`);
  }

  // Use JSON mode for streaming output.
  // Keep extensions disabled by default for deterministic child behavior.
  const disableExtensions = input.noExtensions ?? true;
  const args = ["--mode", "json", "-p"];
  if (disableExtensions) {
    args.push("--no-extensions");
  }

  if (input.provider) {
    args.push("--provider", input.provider);
  }

  if (input.model) {
    args.push("--model", input.model);
  }

  args.push(input.prompt);

  return await new Promise<PrintCommandResult>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let textContent = "";
    let thinkingContent = "";
    let finalText = "";
    let finalThinking = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let idleTimeout: NodeJS.Timeout | undefined;
    const startedAt = Date.now();
    const idleTimeoutMs = input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_IDLE_TIMEOUT_MS;

    const child = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(input.envOverrides || {}),
      },
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const killSafely = (sig: NodeJS.Signals) => {
      if (!child.killed) {
        try {
          child.kill(sig);
        } catch {
          // noop
        }
      }
    };

    const resetIdleTimeout = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      idleTimeout = setTimeout(() => {
        timedOut = true;
        killSafely("SIGTERM");
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
        }
        forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      }, idleTimeoutMs);
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish(() => rejectPromise(new Error(`${entityLabel} run aborted`)));
    };

    const timeoutEnabled = input.timeoutMs !== 0;
    if (timeoutEnabled) {
      resetIdleTimeout();
    }

    const cleanup = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    // Buffer for incomplete JSON lines
    let lineBuffer = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
      input.onStdoutChunk?.(text);

      // Reset idle timeout on any output
      if (timeoutEnabled) {
        resetIdleTimeout();
      }

      // Process complete lines
      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = parseJsonStreamLine(trimmed);
        if (parsed?.type === "text_delta" && parsed.textDelta) {
          textContent += parsed.textDelta;
          input.onTextDelta?.(parsed.textDelta);
        }

        if (parsed?.type === "thinking_delta" && parsed.thinkingDelta) {
          thinkingContent += parsed.thinkingDelta;
          // Don't show thinking in preview - only in final output
        }

        // Try to extract final text from agent_end
        if (parsed?.isEnd) {
          const extracted = extractFinalText(trimmed);
          if (extracted.text) {
            finalText = extracted.text;
          }
          if (extracted.thinking) {
            finalThinking = extracted.thinking;
          }
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
      input.onStderrChunk?.(text);
      if (timeoutEnabled) {
        resetIdleTimeout();
      }
    });

    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`${entityLabel} idle timeout after ${idleTimeoutMs}ms of no output`));
          return;
        }

        if (code !== 0) {
          rejectPromise(new Error(stderr.trim() || `${entityLabel} exited with code ${code}`));
          return;
        }

        // Prefer final text/thinking from agent_end, fallback to collected deltas
        const outputText = finalText || textContent;
        const outputThinking = finalThinking || thinkingContent;
        const output = combineTextAndThinking(outputText, outputThinking);

        if (!output) {
          const stderrMessage = trimForError(stderr);
          rejectPromise(
            new Error(
              stderrMessage
                ? `${entityLabel} returned empty output; stderr=${stderrMessage}`
                : `${entityLabel} returned empty output`,
            ),
          );
          return;
        }

        resolvePromise({
          output,
          latencyMs: Date.now() - startedAt,
        });
      });
    });
  });
}

// ============================================================================
// callModelViaPi - Used by loop.ts and rsa.ts
// ============================================================================

/**
 * モデル呼び出し共通オプション
 * @summary 共通オプション
 * @param provider プロバイダID
 * @param id モデルID
 * @param thinkingLevel 思考レベル
 */
export interface CallModelOptions {
  /** Provider ID */
  provider: string;
  /** Model ID */
  id: string;
  /** Optional thinking level */
  thinkingLevel?: string;
}

/**
 * PI呼び出しオプション
 * @summary 呼び出しオプション
 * @param model モデル名
 * @param prompt プロンプト
 * @param timeoutMs タイムアウト(ミリ秒)
 * @param signal 中断シグナル
 * @param onChunk チャンク受信コールバック
 */
export interface CallModelViaPiOptions {
  /** Model configuration */
  model: CallModelOptions;
  /** Prompt to send to pi */
  prompt: string;
  /** Timeout in milliseconds (0 = disabled) */
  timeoutMs: number;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional callback for stdout chunks (raw JSON lines) */
  onChunk?: (chunk: string) => void;
  /** Optional callback for text delta events (for preview display) */
  onTextDelta?: (delta: string) => void;
  /** Entity label for error messages (default: "RSA") */
  entityLabel?: string;
}

/**
 * PI経由でLLMを呼び出す
 * @summary モデル呼び出し
 * @param options 呼び出しオプション
 * @returns 生成テキスト
 */
export async function callModelViaPi(options: CallModelViaPiOptions): Promise<string> {
  const { model, prompt, timeoutMs, signal, onChunk, onTextDelta, entityLabel = "RSA" } = options;

  if (signal?.aborted) {
    throw new Error(`${entityLabel} aborted`);
  }

  const args = [
    "--mode", "json",
    "-p",
    "--no-extensions",
    "--provider", model.provider,
    "--model", model.id,
  ];

  if (model.thinkingLevel) {
    args.push("--thinking", model.thinkingLevel);
  }

  args.push(prompt);

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let textContent = "";
    let thinkingContent = "";
    let finalText = "";
    let finalThinking = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let idleTimeout: NodeJS.Timeout | undefined;
    const idleTimeoutMs = timeoutMs > 0 ? timeoutMs : DEFAULT_IDLE_TIMEOUT_MS;

    const child = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const killSafely = (sig: NodeJS.Signals) => {
      if (!child.killed) {
        try {
          child.kill(sig);
        } catch {
          // noop
        }
      }
    };

    const resetIdleTimeout = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      idleTimeout = setTimeout(() => {
        timedOut = true;
        killSafely("SIGTERM");
        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
        }
        forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      }, idleTimeoutMs);
    };

    const onAbort = () => {
      killSafely("SIGTERM");
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish(() => rejectPromise(new Error(`${entityLabel} aborted`)));
    };

    const timeoutEnabled = timeoutMs !== 0;
    if (timeoutEnabled) {
      resetIdleTimeout();
    }

    const cleanup = () => {
      if (idleTimeout) {
        clearTimeout(idleTimeout);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    let lineBuffer = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
      onChunk?.(text);

      if (timeoutEnabled) {
        resetIdleTimeout();
      }

      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = parseJsonStreamLine(trimmed);
        if (parsed?.type === "text_delta" && parsed.textDelta) {
          textContent += parsed.textDelta;
          onTextDelta?.(parsed.textDelta);
        }

        if (parsed?.type === "thinking_delta" && parsed.thinkingDelta) {
          thinkingContent += parsed.thinkingDelta;
          // Don't show thinking in preview - only in final output
        }

        if (parsed?.isEnd) {
          const extracted = extractFinalText(trimmed);
          if (extracted.text) {
            finalText = extracted.text;
          }
          if (extracted.thinking) {
            finalThinking = extracted.thinking;
          }
        }
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
      if (timeoutEnabled) {
        resetIdleTimeout();
      }
    });

    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`pi --mode json idle timeout after ${idleTimeoutMs}ms of no output`));
          return;
        }

        if (code !== 0) {
          const message = stderr.trim() || `exit code ${code}`;
          rejectPromise(new Error(`pi --mode json failed: ${message}`));
          return;
        }

        // Prefer final text/thinking from agent_end, fallback to collected deltas
        const outputText = finalText || textContent;
        const outputThinking = finalThinking || thinkingContent;
        const output = combineTextAndThinking(outputText, outputThinking);

        if (!output) {
          rejectPromise(new Error("pi --mode json returned empty output"));
          return;
        }

        resolvePromise(output);
      });
    });
  });
}
