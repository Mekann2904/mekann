import { describe, expect, it } from "vitest";
import { classifyGoalStopReason } from "./stopReason.js";

describe("classifyGoalStopReason", () => {
  it.each([
    "Rate limit exceeded",
    "usage limit reached",
    "HTTP 429 Too Many Requests",
    "quota limit exceeded",
    "insufficient credits",
  ])("classifies provider capacity errors as usage_limited: %s", (message) => {
    expect(classifyGoalStopReason(message)).toBe("usage_limited");
  });

  it("classifies other settled terminal errors as blocked", () => {
    expect(classifyGoalStopReason("Compaction failed after retries")).toBe("blocked");
  });
});
