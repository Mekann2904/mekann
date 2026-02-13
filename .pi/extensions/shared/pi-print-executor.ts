/**
 * Shared pi print mode executor.
 * Used by both subagents.ts and agent-teams.ts for consistent process execution.
 */

import { spawn, type SpawnOptions } from "node:child_process";

const GRACEFUL_SHUTDOWN_DELAY_MS = 2000;

export interface PrintExecutorOptions {
  /** Entity type label for error messages (e.g., "subagent", "agent team member") */
  entityLabel: string;
  /** Optional provider override */
  provider?: string;
  /** Optional model override */
  model?: string;
  /** Prompt to send to pi */
  prompt: string;
  /** Timeout in milliseconds (0 = disabled) */
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
 * Execute pi in print mode and return the result.
 * Handles timeout, abort, and process lifecycle.
 */
export async function runPiPrintMode(
  input: PrintExecutorOptions,
): Promise<PrintCommandResult> {
  const { entityLabel } = input;

  if (input.signal?.aborted) {
    throw new Error(`${entityLabel} run aborted`);
  }

  const args = ["-p", "--no-extensions"];

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
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const startedAt = Date.now();

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

    const onAbort = () => {
      killSafely("SIGTERM");
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish(() => rejectPromise(new Error(`${entityLabel} run aborted`)));
    };

    const timeoutEnabled = input.timeoutMs > 0;
    const timeout = timeoutEnabled
      ? setTimeout(() => {
          timedOut = true;
          killSafely("SIGTERM");
          if (forceKillTimer) {
            clearTimeout(forceKillTimer);
          }
          forceKillTimer = setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
        }, input.timeoutMs)
      : undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
      }
      input.signal?.removeEventListener("abort", onAbort);
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
      input.onStdoutChunk?.(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
      input.onStderrChunk?.(text);
    });

    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`${entityLabel} timed out after ${input.timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          rejectPromise(new Error(stderr.trim() || `${entityLabel} exited with code ${code}`));
          return;
        }

        const output = stdout.trim();
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
 * Call model via pi -p for loop and RSA modules.
 * Supports thinking level and optional streaming via onChunk callback.
 */
export async function callModelViaPi(options: CallModelViaPiOptions): Promise<string> {
  const { model, prompt, timeoutMs, signal, onChunk, entityLabel = "RSA" } = options;

  if (signal?.aborted) {
    throw new Error(`${entityLabel} aborted`);
  }

  const args = ["-p", "--no-extensions", "--provider", model.provider, "--model", model.id];

  if (model.thinkingLevel) {
    args.push("--thinking", model.thinkingLevel);
  }

  args.push(prompt);

  return await new Promise<string>((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

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

    const onAbort = () => {
      killSafely("SIGTERM");
      setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
      finish(() => rejectPromise(new Error(`${entityLabel} aborted`)));
    };

    // timeoutMs <= 0 means "no per-call timeout". User cancellation still aborts the process.
    const timeoutEnabled = timeoutMs > 0;
    const timeout = timeoutEnabled
      ? setTimeout(() => {
          timedOut = true;
          killSafely("SIGTERM");
          setTimeout(() => killSafely("SIGKILL"), GRACEFUL_SHUTDOWN_DELAY_MS);
        }, timeoutMs)
      : undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stdout += text;
      onChunk?.(text);
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      stderr += text;
    });

    child.on("error", (error) => {
      finish(() => rejectPromise(error));
    });

    child.on("close", (code) => {
      finish(() => {
        if (timedOut) {
          rejectPromise(new Error(`pi -p timed out after ${timeoutMs}ms`));
          return;
        }

        if (code !== 0) {
          const message = stderr.trim() || `exit code ${code}`;
          rejectPromise(new Error(`pi -p failed: ${message}`));
          return;
        }

        const output = stdout.trim();
        if (!output) {
          rejectPromise(new Error("pi -p returned empty output"));
          return;
        }

        resolvePromise(output);
      });
    });
  });
}
