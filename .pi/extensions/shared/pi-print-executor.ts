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

export interface PrintExecutorOptions {
  /** Entity type label for error messages (e.g., "subagent", "agent team member") */
  entityLabel: string;
  /** Optional provider override */
  provider?: string;
  /** Optional model override */
  model?: string;
  /** Prompt to send to pi */
  prompt: string;
  /** Idle timeout in milliseconds - resets on each output chunk (0 = disabled, default: 300000) */
  timeoutMs: number;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional callback for stdout chunks */
  onStdoutChunk?: (chunk: string) => void;
  /** Optional callback for stderr chunks */
  onStderrChunk?: (chunk: string) => void;
}

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
function parseJsonStreamLine(line: string): { type: string; textDelta?: string; isEnd?: boolean } | null {
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
    
    return { type: obj.type || "unknown" };
  } catch {
    return null;
  }
}

/**
 * Extract final text from agent_end message.
 */
function extractFinalText(line: string): string | null {
  try {
    const obj = JSON.parse(line);
    if (obj.type === "agent_end" && obj.messages) {
      const lastMessage = obj.messages[obj.messages.length - 1];
      if (lastMessage?.role === "assistant" && Array.isArray(lastMessage.content)) {
        const textBlock = lastMessage.content.find((b: { type: string }) => b.type === "text");
        return textBlock?.text || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Execute pi in JSON mode and return the result.
 * Uses idle timeout strategy: timer resets on each output, allowing long tasks to continue.
 */
export async function runPiPrintMode(
  input: PrintExecutorOptions,
): Promise<PrintCommandResult> {
  const { entityLabel } = input;

  if (input.signal?.aborted) {
    throw new Error(`${entityLabel} run aborted`);
  }

  // Use JSON mode for streaming output
  const args = ["--mode", "json", "-p", "--no-extensions"];

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
    let finalText = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let idleTimeout: NodeJS.Timeout | undefined;
    const startedAt = Date.now();
    const idleTimeoutMs = input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_IDLE_TIMEOUT_MS;

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
        }
        
        // Try to extract final text from agent_end
        if (parsed?.isEnd) {
          const extracted = extractFinalText(trimmed);
          if (extracted) {
            finalText = extracted;
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

        // Prefer final text from agent_end, fallback to collected deltas
        const output = finalText || textContent;
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

export interface CallModelOptions {
  /** Provider ID */
  provider: string;
  /** Model ID */
  id: string;
  /** Optional thinking level */
  thinkingLevel?: string;
}

export interface CallModelViaPiOptions {
  /** Model configuration */
  model: CallModelOptions;
  /** Prompt to send to pi */
  prompt: string;
  /** Timeout in milliseconds (0 = disabled) */
  timeoutMs: number;
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Optional callback for stdout chunks (streaming) */
  onChunk?: (chunk: string) => void;
  /** Entity label for error messages (default: "RSA") */
  entityLabel?: string;
}

/**
 * Call model via pi --mode json for loop and RSA modules.
 * Uses idle timeout strategy with streaming support.
 */
export async function callModelViaPi(options: CallModelViaPiOptions): Promise<string> {
  const { model, prompt, timeoutMs, signal, onChunk, entityLabel = "RSA" } = options;

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
    let finalText = "";
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
        }

        if (parsed?.isEnd) {
          const extracted = extractFinalText(trimmed);
          if (extracted) {
            finalText = extracted;
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

        const output = finalText || textContent;
        if (!output) {
          rejectPromise(new Error("pi --mode json returned empty output"));
          return;
        }

        resolvePromise(output);
      });
    });
  });
}
