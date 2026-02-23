/**
 * .pi/extensions/rate-limit-retry-budget.ts
 * 429系のリトライ予算を拡張する旧ランタイムパッチ実装（現在は既定で無効）。
 * no patch方針により本実装は非推奨で、依存物の直接改変を避けるため履歴として保持する。
 * 関連: .pi/extensions/pi-coding-agent-rate-limit-fix.ts, .pi/extensions/rpm-throttle.ts, package.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type Replacement = {
  marker: string;
  beforeCandidates: string[];
  after: string;
};

const TARGET_MODULE = "@mariozechner/pi-coding-agent/dist/core/agent-session.js";

const REPLACEMENTS: Replacement[] = [
  {
    marker: "const rateLimitMaxRetries =",
    beforeCandidates: [
      "        if (this._retryAttempt > settings.maxRetries) {",
      "if (this._retryAttempt > settings.maxRetries) {",
    ],
    after:
      "        const isRateLimitRetry = /rate.?limit|too many requests|429|quota exceeded/i.test(message.errorMessage || \"\");\n" +
      "        const configuredRateLimitRetries = Number.parseInt(process.env.PI_RATE_LIMIT_MAX_RETRIES ?? \"8\", 10);\n" +
      "        const rateLimitMaxRetries = isRateLimitRetry\n" +
      "            ? Math.max(settings.maxRetries, Number.isFinite(configuredRateLimitRetries) && configuredRateLimitRetries > 0\n" +
      "                ? configuredRateLimitRetries\n" +
      "                : 8)\n" +
      "            : settings.maxRetries;\n" +
      "        if (this._retryAttempt > rateLimitMaxRetries) {",
  },
  {
    marker: "maxAttempts: rateLimitMaxRetries,",
    beforeCandidates: [
      "            maxAttempts: settings.maxRetries,",
      "maxAttempts: settings.maxRetries,",
    ],
    after: "            maxAttempts: rateLimitMaxRetries,",
  },
];

async function applyPatch(requireFn: NodeRequire): Promise<"patched" | "already" | "skip"> {
  let resolvedPath: string;
  try {
    resolvedPath = requireFn.resolve(TARGET_MODULE);
  } catch {
    return "skip";
  }

  const source = await readFile(resolvedPath, "utf-8");
  let patched = source;
  let changed = false;

  for (const replacement of REPLACEMENTS) {
    if (patched.includes(replacement.marker)) {
      continue;
    }
    let next = patched;
    let replaced = false;
    for (const before of replacement.beforeCandidates) {
      if (!next.includes(before)) continue;
      next = next.replace(before, replacement.after);
      replaced = true;
      break;
    }
    if (!replaced) {
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

export default function registerRateLimitRetryBudgetExtension(pi: ExtensionAPI): void {
  let initialized = false;

  pi.on("session_start", async () => {
    if (initialized) return;
    initialized = true;

    const requireFn = createRequire(import.meta.url);
    let result: "patched" | "already" | "skip" = "skip";

    try {
      result = await applyPatch(requireFn);
    } catch {
      result = "skip";
    }

    if (result === "patched") {
      console.error("[rate-limit-retry-budget] applied runtime patch");
    } else if (result === "already") {
      console.error("[rate-limit-retry-budget] patch already applied");
    } else {
      console.error("[rate-limit-retry-budget] skipped (target changed or not found)");
    }
  });
}
