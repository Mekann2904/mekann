/**
 * @file .pi/lib/agent/model-adapters.ts の単体テスト
 * @description provider/model ごとの prompt adapter 解決を検証する
 * @testFramework vitest
 */

import { describe, expect, it } from "vitest";

import { resolveModelPromptAdapter } from "../../../.pi/lib/agent/model-adapters.js";

describe("model-adapters", () => {
  it("OpenAI 系は compact adapter を返す", () => {
    const adapter = resolveModelPromptAdapter("openai", "gpt-5");
    expect(adapter.id).toBe("openai");
    expect(adapter.instructionDensity).toBe("compact");
    expect(adapter.prefersShortRuntimeNotices).toBe(true);
  });

  it("Anthropic Sonnet は compact へ寄せる", () => {
    const adapter = resolveModelPromptAdapter("anthropic", "claude-sonnet-4-5");
    expect(adapter.id).toBe("anthropic");
    expect(adapter.instructionDensity).toBe("compact");
    expect(adapter.internalContextHandoffLines).toBeLessThanOrEqual(10);
  });

  it("不明な provider は default を返す", () => {
    const adapter = resolveModelPromptAdapter(undefined, undefined);
    expect(adapter.id).toBe("default");
  });
});
