/**
 * Tests for extractReviewFixerResult — verify JSON extraction behavior
 * for review-fixer.result.v1 structured results.
 */

import { describe, it, expect } from "vitest";
import { extractReviewFixerResult } from "./index.js";
import type { ReviewFixerResult } from "./types.js";

const VALID_RESULT: ReviewFixerResult = {
  schema: "review-fixer.result.v1",
  status: "changed",
  issue: { number: 21, title: "Test", url: "https://example.com" },
  findings: [
    { severity: "blocker", description: "重大な問題", applied: true },
  ],
  changes: {
    files_changed: ["src/foo.ts"],
    structural_changes: ["ヘルパーを抽出"],
    behavior_changes: [],
    tests_added_or_modified: ["src/foo.test.ts"],
  },
  verification: {
    commands_run: ["npm test"],
    results: [{ command: "npm test", exit_code: 0, passed: true }],
    all_passed: true,
  },
  remaining_risks: ["リスク1"],
  parent_next_steps: "PR を作成してください",
};

describe("extractReviewFixerResult", () => {
  it("extracts valid review-fixer.result.v1 JSON from raw output", () => {
    const result = extractReviewFixerResult(JSON.stringify(VALID_RESULT));
    expect(result).not.toBeNull();
    expect(result!.schema).toBe("review-fixer.result.v1");
    expect(result!.status).toBe("changed");
    expect(result!.findings).toHaveLength(1);
    expect(result!.findings[0].severity).toBe("blocker");
  });

  it("returns null for undefined output", () => {
    expect(extractReviewFixerResult(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractReviewFixerResult("")).toBeNull();
  });

  it("returns null for plain text without JSON", () => {
    expect(extractReviewFixerResult("I reviewed the code and it looks fine.")).toBeNull();
  });

  it("extracts JSON embedded in prose", () => {
    const output = `I completed the review. Here is my result:\n\n${JSON.stringify(VALID_RESULT)}\n\nAll done.`;
    const result = extractReviewFixerResult(output);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("changed");
  });

  it("extracts JSON from markdown code fence", () => {
    const output = "```json\n" + JSON.stringify(VALID_RESULT, null, 2) + "\n```";
    const result = extractReviewFixerResult(output);
    expect(result).not.toBeNull();
    expect(result!.schema).toBe("review-fixer.result.v1");
  });

  it("returns null for JSON with wrong schema identifier", () => {
    const wrongSchema = { ...VALID_RESULT, schema: "subagent.result.v1" };
    expect(extractReviewFixerResult(JSON.stringify(wrongSchema))).toBeNull();
  });

  it("returns null for valid JSON without schema field", () => {
    const noSchema = { status: "changed", findings: [] };
    expect(extractReviewFixerResult(JSON.stringify(noSchema))).toBeNull();
  });

  it("handles no_change status", () => {
    const noChangeResult = { ...VALID_RESULT, status: "no_change", findings: [], changes: { files_changed: [], structural_changes: [], behavior_changes: [], tests_added_or_modified: [] } };
    const result = extractReviewFixerResult(JSON.stringify(noChangeResult));
    expect(result).not.toBeNull();
    expect(result!.status).toBe("no_change");
  });

  it("handles failed status", () => {
    const failedResult = { ...VALID_RESULT, status: "failed", changes: { files_changed: [], structural_changes: [], behavior_changes: [], tests_added_or_modified: [] } };
    const result = extractReviewFixerResult(JSON.stringify(failedResult));
    expect(result).not.toBeNull();
    expect(result!.status).toBe("failed");
  });
});
