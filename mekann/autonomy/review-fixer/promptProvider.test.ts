/**
 * Tests for registerReviewFixerPromptProvider — verify the prompt fragment
 * contains the enforcement gate and key policy instructions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prompt-core registry
const registeredProviders: Array<{ id: string; getFragments: () => Array<{ content: string }> }> = [];

vi.mock("../../core/prompt-core/index.js", () => ({
  registerPromptProvider: (provider: any) => {
    registeredProviders.push(provider);
  },
}));

describe("registerReviewFixerPromptProvider", () => {
  beforeEach(() => {
    registeredProviders.length = 0;
  });

  it("registers a prompt provider with id 'review-fixer'", async () => {
    const { registerReviewFixerPromptProvider } = await import("./promptProvider.js");
    registerReviewFixerPromptProvider();
    expect(registeredProviders).toHaveLength(1);
    expect(registeredProviders[0].id).toBe("review-fixer");
  });

  it("includes GATE enforcement instruction", async () => {
    const { registerReviewFixerPromptProvider } = await import("./promptProvider.js");
    registerReviewFixerPromptProvider();
    const fragments = registeredProviders[0].getFragments();
    expect(fragments.length).toBeGreaterThanOrEqual(1);
    const content = fragments[0].content;
    expect(content).toContain("GATE");
    expect(content).toContain("強制 gate");
    expect(content).toContain("省略不可");
  });

  it("requires review_fixer before commit/push/PR", async () => {
    const { registerReviewFixerPromptProvider } = await import("./promptProvider.js");
    registerReviewFixerPromptProvider();
    const content = registeredProviders[0].getFragments()[0].content;
    expect(content).toContain("review_fixer tool を必ず実行");
    expect(content).toContain("commit / push / PR 作成する前に");
  });

  it("mentions blocked issue exception", async () => {
    const { registerReviewFixerPromptProvider } = await import("./promptProvider.js");
    registerReviewFixerPromptProvider();
    const content = registeredProviders[0].getFragments()[0].content;
    expect(content).toContain("blocked issue");
    expect(content).toContain("review_fixer を実行しない");
  });

  it("instructs to verify structured result before proceeding", async () => {
    const { registerReviewFixerPromptProvider } = await import("./promptProvider.js");
    registerReviewFixerPromptProvider();
    const content = registeredProviders[0].getFragments()[0].content;
    expect(content).toContain("findings / changes / verification");
    expect(content).toContain("結果確認");
  });

  it("prescribes the phased issue workflow", async () => {
    const { registerReviewFixerPromptProvider } = await import("./promptProvider.js");
    registerReviewFixerPromptProvider();
    const content = registeredProviders[0].getFragments()[0].content;
    expect(content).toContain("issue対応 → review_fixerによる調査と修正 → git add commit push pr");
    expect(content).toContain("各フェーズ開始時に現在のフェーズを短く宣言");
  });
});
