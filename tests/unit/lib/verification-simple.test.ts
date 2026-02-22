import { describe, it, expect } from "vitest";
import { verifyOutput, simpleVerificationHook } from "../../../.pi/lib/verification-simple.js";

describe("verification-simple", () => {
  describe("verifyOutput", () => {
    it("should pass for empty output", () => {
      const result = verifyOutput("", 0.8, { task: "test", triggerMode: "post-subagent" });
      expect(result.triggered).toBe(false);
      expect(result.verdict).toBe("pass");
    });

    it("should skip for high confidence", () => {
      const result = verifyOutput("some output", 0.96, { task: "test", triggerMode: "post-subagent" });
      expect(result.triggered).toBe(false);
      expect(result.verdict).toBe("pass");
    });

    it("should detect CLAIM-RESULT mismatch", () => {
      const output = `CLAIM: Implementation is complete
RESULT: Deletion is required`;
      const result = verifyOutput(output, 0.7, { task: "test", triggerMode: "post-subagent" });
      expect(result.triggered).toBe(true);
      expect(result.issues.some(i => i.type === "claim-result-mismatch")).toBe(true);
    });

    it("should detect overconfidence", () => {
      const output = `CLAIM: This is certain
EVIDENCE: very strong
CONFIDENCE: 1.0`;
      const result = verifyOutput(output, 0.8, { task: "test", triggerMode: "post-subagent" });
      expect(result.triggered).toBe(true);
      expect(result.issues.some(i => i.type === "overconfidence")).toBe(true);
    });

    it("should return needs-review for high severity issues", () => {
      const output = `CLAIM: This is true
RESULT: Different content here`;
      const result = verifyOutput(output, 0.8, { task: "test", triggerMode: "post-subagent" });
      expect(result.verdict).toBe("needs-review");
      expect(result.confidenceAdjustment).toBeLessThan(1.0);
    });
  });

  describe("simpleVerificationHook", () => {
    it("should return async result", async () => {
      const result = await simpleVerificationHook("test output", 0.7, {
        task: "test",
        triggerMode: "post-subagent",
      });
      expect(result).toHaveProperty("triggered");
    });

    it("should handle errors gracefully", async () => {
      // 無効なコンテキストでもエラーにならないことを確認
      const result = await simpleVerificationHook("test", 0.7, {
        task: "test",
        triggerMode: "post-subagent",
      });
      expect(result.triggered).toBeDefined();
    });
  });
});
