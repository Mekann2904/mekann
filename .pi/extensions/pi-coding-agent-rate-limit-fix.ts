/**
 * .pi/extensions/pi-coding-agent-rate-limit-fix.ts
 * pi-coding-agentの429自動リトライ挙動を起動時に補正する。
 * patch-packageに依存せず、拡張として恒久運用するために存在する。
 * 関連: .pi/extensions/pi-ai-abort-fix.ts, node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js, package.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Replacement = {
  marker: string;
  before: string;
  after: string;
};

type PatchTarget = {
  modulePath: string;
  replacements: Replacement[];
};

const PATCH_TARGET: PatchTarget = {
  modulePath: "@mariozechner/pi-coding-agent/dist/core/agent-session.js",
  replacements: [
    {
      marker: "_rateLimitCooldownUntilMs = 0;",
      before:
        "    _retryAbortController = undefined;\n    _retryAttempt = 0;\n    _retryPromise = undefined;\n    _retryResolve = undefined;\n",
      after:
        "    _retryAbortController = undefined;\n    _retryAttempt = 0;\n    _retryPromise = undefined;\n    _retryResolve = undefined;\n    _rateLimitCooldownUntilMs = 0;\n    _rateLimitStreak = 0;\n",
    },
    {
      marker: "this._rateLimitStreak = 0;",
      before:
        "                if (assistantMsg.stopReason !== \"error\" && this._retryAttempt > 0) {\n                    this._emit({\n                        type: \"auto_retry_end\",\n                        success: true,\n                        attempt: this._retryAttempt,\n                    });\n                    this._retryAttempt = 0;\n                    this._resolveRetry();\n                }\n",
      after:
        "                if (assistantMsg.stopReason !== \"error\" && this._retryAttempt > 0) {\n                    this._emit({\n                        type: \"auto_retry_end\",\n                        success: true,\n                        attempt: this._retryAttempt,\n                    });\n                    this._retryAttempt = 0;\n                    this._resolveRetry();\n                }\n                if (assistantMsg.stopReason !== \"error\") {\n                    this._rateLimitStreak = 0;\n                    this._rateLimitCooldownUntilMs = 0;\n                }\n",
    },
    {
      marker: "_isRateLimitError(message) {",
      before:
        "        // Match: overloaded_error, rate limit, 429, 500, 502, 503, 504, service unavailable, connection errors, fetch failed, terminated, retry delay exceeded\n        return /overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i.test(err);\n    }\n    /**\n     * Handle retryable errors with exponential backoff.\n     * @returns true if retry was initiated, false if max retries exceeded or disabled\n     */\n",
      after:
        "        // Match: overloaded_error, rate limit, 429, 500, 502, 503, 504, service unavailable, connection errors, fetch failed, terminated, retry delay exceeded\n        return /overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i.test(err);\n    }\n    _isRateLimitError(message) {\n        if (message.stopReason !== \"error\" || !message.errorMessage)\n            return false;\n        return /rate.?limit|too many requests|429|quota exceeded/i.test(message.errorMessage);\n    }\n    _extractRetryAfterMs(message) {\n        if (message.stopReason !== \"error\" || !message.errorMessage)\n            return undefined;\n        const text = message.errorMessage;\n        const secondsMatch = text.match(/retry[-\\s]?after[^0-9]*(\\d+)(?:\\.\\d+)?\\s*(s|sec|secs|second|seconds)\\b/i);\n        if (secondsMatch) {\n            return Math.max(0, Number(secondsMatch[1]) * 1000);\n        }\n        const msMatch = text.match(/retry[-\\s]?after[^0-9]*(\\d+)\\s*(ms|msec|millisecond|milliseconds)\\b/i);\n        if (msMatch) {\n            return Math.max(0, Number(msMatch[1]));\n        }\n        return undefined;\n    }\n    /**\n     * Handle retryable errors with exponential backoff.\n     * @returns true if retry was initiated, false if max retries exceeded or disabled\n     */\n",
    },
    {
      marker: "const exponentialDelayMs = Math.min(",
      before:
        "    async _handleRetryableError(message) {\n        const settings = this.settingsManager.getRetrySettings();\n        if (!settings.enabled)\n            return false;\n        this._retryAttempt++;\n        // Create retry promise on first attempt so waitForRetry() can await it\n        if (this._retryAttempt === 1 && !this._retryPromise) {\n            this._retryPromise = new Promise((resolve) => {\n                this._retryResolve = resolve;\n            });\n        }\n        if (this._retryAttempt > settings.maxRetries) {\n            // Max retries exceeded, emit final failure and reset\n            this._emit({\n                type: \"auto_retry_end\",\n                success: false,\n                attempt: this._retryAttempt - 1,\n                finalError: message.errorMessage,\n            });\n            this._retryAttempt = 0;\n            this._resolveRetry(); // Resolve so waitForRetry() completes\n            return false;\n        }\n        const delayMs = settings.baseDelayMs * 2 ** (this._retryAttempt - 1);\n        this._emit({\n            type: \"auto_retry_start\",\n            attempt: this._retryAttempt,\n            maxAttempts: settings.maxRetries,\n            delayMs,\n            errorMessage: message.errorMessage || \"Unknown error\",\n        });\n",
      after:
        "    async _handleRetryableError(message) {\n        const settings = this.settingsManager.getRetrySettings();\n        if (!settings.enabled)\n            return false;\n        const isRateLimit = this._isRateLimitError(message);\n        if (isRateLimit) {\n            this._rateLimitStreak += 1;\n        }\n        else {\n            this._rateLimitStreak = 0;\n        }\n        this._retryAttempt++;\n        // Create retry promise on first attempt so waitForRetry() can await it\n        if (this._retryAttempt === 1 && !this._retryPromise) {\n            this._retryPromise = new Promise((resolve) => {\n                this._retryResolve = resolve;\n            });\n        }\n        if (this._retryAttempt > settings.maxRetries) {\n            // Max retries exceeded, emit final failure and reset\n            this._emit({\n                type: \"auto_retry_end\",\n                success: false,\n                attempt: this._retryAttempt - 1,\n                finalError: message.errorMessage,\n            });\n            if (isRateLimit) {\n                const now = Date.now();\n                const cooldownMs = Math.min(settings.maxDelayMs, settings.baseDelayMs * 2 ** Math.max(0, this._rateLimitStreak));\n                this._rateLimitCooldownUntilMs = Math.max(this._rateLimitCooldownUntilMs, now + cooldownMs);\n            }\n            this._retryAttempt = 0;\n            this._resolveRetry(); // Resolve so waitForRetry() completes\n            return false;\n        }\n        const exponentialDelayMs = Math.min(settings.maxDelayMs, settings.baseDelayMs * 2 ** (this._retryAttempt - 1));\n        const retryAfterMs = isRateLimit ? this._extractRetryAfterMs(message) : undefined;\n        const streakDelayMs = isRateLimit\n            ? Math.min(settings.maxDelayMs, settings.baseDelayMs * 2 ** Math.max(0, this._rateLimitStreak - 1))\n            : 0;\n        const cooldownWaitMs = Math.max(0, this._rateLimitCooldownUntilMs - Date.now());\n        let delayMs = Math.max(exponentialDelayMs, retryAfterMs ?? 0, streakDelayMs, cooldownWaitMs);\n        delayMs = Math.min(delayMs, settings.maxDelayMs);\n        if (isRateLimit) {\n            this._rateLimitCooldownUntilMs = Date.now() + delayMs;\n        }\n        this._emit({\n            type: \"auto_retry_start\",\n            attempt: this._retryAttempt,\n            maxAttempts: settings.maxRetries,\n            delayMs,\n            errorMessage: message.errorMessage || \"Unknown error\",\n        });\n",
    },
    {
      marker: "unknown error occurred",
      before:
        "        return /overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i.test(err);",
      after:
        "        // Include generic upstream transient messages such as \"An unknown error occurred\".\n        return /overloaded|rate.?limit|too many requests|429|500|502|503|504|service.?unavailable|server error|internal error|unknown error(?: occurred)?|connection.?error|connection.?refused|other side closed|fetch failed|upstream.?connect|reset before headers|terminated|retry delay/i.test(err);",
    },
  ],
};

async function patchFile(requireFn: NodeRequire, target: PatchTarget): Promise<"patched" | "already" | "skip"> {
  let resolvedPath: string;
  try {
    resolvedPath = requireFn.resolve(target.modulePath);
  } catch {
    return "skip";
  }

  const source = await readFile(resolvedPath, "utf-8");
  let patched = source;
  let changed = false;

  for (const replacement of target.replacements) {
    if (patched.includes(replacement.marker)) {
      continue;
    }
    const next = patched.replace(replacement.before, replacement.after);
    if (next === patched) {
      return "skip";
    }
    patched = next;
    changed = true;
  }

  if (!changed) {
    return "already";
  }

  await writeFile(resolvedPath, patched, "utf-8");
  return "patched";
}

export default function (pi: ExtensionAPI) {
  let initialized = false;

  pi.on("session_start", async () => {
    if (initialized) return;
    initialized = true;

    const requireFn = createRequire(import.meta.url);
    let result: "patched" | "already" | "skip" = "skip";

    try {
      result = await patchFile(requireFn, PATCH_TARGET);
    } catch {
      result = "skip";
    }

    if (result === "patched") {
      console.error("[pi-coding-agent-rate-limit-fix] applied runtime patch");
    } else if (result === "already") {
      console.error("[pi-coding-agent-rate-limit-fix] patch already applied");
    } else {
      console.error("[pi-coding-agent-rate-limit-fix] skipped (target changed or not found)");
    }

    pi.events.emit("pi-coding-agent-rate-limit-fix:status", { result });
  });
}
