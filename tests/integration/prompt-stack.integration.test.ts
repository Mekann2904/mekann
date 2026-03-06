/**
 * @file Prompt Stack と benchmark harness の統合テスト
 * @description runtime notification を含む描画結果と指標集計が整合することを検証する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import {
  renderPromptStack,
  type PromptStackEntry,
} from "../../.pi/lib/agent/prompt-stack.js";
import {
  createRuntimeNotification,
  formatRuntimeNotificationBlock,
} from "../../.pi/lib/agent/runtime-notifications.js";
import {
  summarizePromptStackForBenchmark,
} from "../../.pi/lib/agent/benchmark-harness.js";

describe("prompt-stack integration", () => {
  it("runtime notification を含む Prompt Stack を描画して計測できる", () => {
    const verificationNotice = createRuntimeNotification(
      "loop",
      "Verification failed. Re-run after fixing the output format.",
      "warning",
      1,
    );

    const entries: PromptStackEntry[] = [
      {
        source: "tooling",
        layer: "tool-description",
        content: "# Tool Rules\nUse compact tool calls.",
      },
      {
        source: "policy",
        layer: "system-policy",
        content: "# System Policy\nDo not claim completion without evidence.",
      },
      {
        source: "runtime",
        layer: "runtime-notification",
        content: formatRuntimeNotificationBlock([verificationNotice!]),
      },
    ];

    const rendered = renderPromptStack(entries);
    const benchmark = summarizePromptStackForBenchmark(rendered.renderedEntries);

    expect(rendered.prompt).toContain("# Runtime Notifications");
    expect(rendered.prompt.indexOf("# Runtime Notifications")).toBeGreaterThan(
      rendered.prompt.indexOf("# System Policy"),
    );
    expect(benchmark.entryCount).toBe(3);
    expect(benchmark.byLayer["runtime-notification"]).toBeGreaterThan(0);
    expect(benchmark.estimatedTokens).toBeGreaterThan(0);
  });
});
