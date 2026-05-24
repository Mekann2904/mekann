import { describe, expect, it } from "vitest";
import { normalizeActualCacheUsage } from "./actualUsage.js";

describe("normalizeActualCacheUsage", () => {
  it.each([
    {
      name: "openai",
      provider: "openai",
      usage: { prompt_tokens: 2000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 1024 } },
      expected: { inputTotalTokens: 2000, outputTokens: 100, cacheReadTokens: 1024, tokenHitRate: 0.512, cacheableReadRate: null },
    },
    {
      name: "deepseek",
      provider: "deepseek",
      usage: { prompt_cache_hit_tokens: 1500, prompt_cache_miss_tokens: 500, completion_tokens: 100 },
      expected: { inputTotalTokens: 2000, outputTokens: 100, cacheReadTokens: 1500, cacheMissTokens: 500, tokenHitRate: 0.75, cacheableReadRate: null },
    },
    {
      name: "deepseek-compatible fallback without miss tokens",
      provider: "deepseek",
      usage: { prompt_tokens: 2000, completion_tokens: 100, prompt_cache_hit_tokens: 0 },
      expected: { inputTotalTokens: 2000, outputTokens: 100, cacheReadTokens: 0, tokenHitRate: 0, cacheableReadRate: null },
    },
    {
      name: "anthropic",
      provider: "anthropic",
      usage: { input_tokens: 500, cache_read_input_tokens: 1000, cache_creation_input_tokens: 500, output_tokens: 100 },
      expected: { inputTotalTokens: 2000, outputTokens: 100, cacheReadTokens: 1000, cacheWriteTokens: 500, tokenHitRate: 0.5, cacheableReadRate: 1000 / 1500 },
    },
    {
      name: "pi normalized",
      provider: "pi",
      usage: { input: 0, output: 10, cacheRead: 0 },
      expected: { inputTotalTokens: 0, outputTokens: 10, cacheReadTokens: 0, tokenHitRate: null, cacheableReadRate: null },
    },
  ])("normalizes $name usage", ({ provider, usage, expected }) => {
    expect(normalizeActualCacheUsage(provider, usage)).toEqual(expect.objectContaining(expected));
  });
});
