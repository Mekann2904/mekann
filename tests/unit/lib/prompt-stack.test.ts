/**
 * @file .pi/lib/agent/prompt-stack.ts の単体テスト
 * @description Prompt Stack の順序制御と重複防止を検証する
 * @testFramework vitest
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("../../../.pi/lib/context-breakdown-utils.js", () => ({
  recordInjection: vi.fn(),
}));

import {
  applyPromptStack,
  hasPromptStackMarker,
  renderPromptStack,
  type PromptStackEntry,
} from "../../../.pi/lib/agent/prompt-stack.js";

describe("prompt-stack", () => {
  it("layer 順で prompt を合成する", () => {
    const entries: PromptStackEntry[] = [
      {
        source: "runtime",
        layer: "runtime-notification",
        content: "RUNTIME",
        markerId: "runtime",
      },
      {
        source: "policy",
        layer: "system-policy",
        content: "POLICY",
        markerId: "policy",
      },
    ];

    const result = applyPromptStack("BASE", entries);

    expect(result.systemPrompt.indexOf("POLICY")).toBeGreaterThan(result.systemPrompt.indexOf("BASE"));
    expect(result.systemPrompt.indexOf("RUNTIME")).toBeGreaterThan(result.systemPrompt.indexOf("POLICY"));
  });

  it("同じ marker の重複注入を防ぐ", () => {
    const entry: PromptStackEntry = {
      source: "policy",
      layer: "system-policy",
      content: "POLICY",
      markerId: "policy",
    };

    const once = applyPromptStack("BASE", [entry]);
    const twice = applyPromptStack(once.systemPrompt, [entry]);

    expect(once.appliedEntries).toHaveLength(1);
    expect(twice.appliedEntries).toHaveLength(0);
    expect(hasPromptStackMarker(twice.systemPrompt, entry)).toBe(true);
  });

  it("空コンテンツは無視する", () => {
    const result = applyPromptStack("BASE", [
      {
        source: "empty",
        layer: "system-policy",
        content: "   ",
        markerId: "empty",
      },
    ]);

    expect(result.systemPrompt).toBe("BASE");
    expect(result.appliedEntries).toHaveLength(0);
  });

  it("marker なし描画はコメントを含めない", () => {
    const rendered = renderPromptStack([
      {
        source: "policy",
        layer: "system-policy",
        content: "POLICY",
        markerId: "policy",
      },
      {
        source: "notice",
        layer: "runtime-notification",
        content: "NOTICE",
        markerId: "notice",
      },
    ]);

    expect(rendered.prompt).toContain("POLICY");
    expect(rendered.prompt).toContain("NOTICE");
    expect(rendered.prompt).not.toContain("prompt-stack:");
  });
});
