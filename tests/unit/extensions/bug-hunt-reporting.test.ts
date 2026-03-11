// Path: tests/unit/extensions/bug-hunt-reporting.test.ts
// What: bug-hunt reporting helper の prompt / parser を検証する
// Why: runner が期待する JSON 契約の退行を防ぐため
// Related: .pi/extensions/bug-hunt/reporting.ts, .pi/extensions/bug-hunt/types.ts, .pi/extensions/bug-hunt/runner.ts

import { describe, expect, it } from "vitest";

import { buildBugHuntPrompt, parseBugHuntModelOutput } from "../../../.pi/extensions/bug-hunt/reporting.js";

describe("bug-hunt reporting helpers", () => {
  it("prompt に mission と重複回避情報を含める", () => {
    const prompt = buildBugHuntPrompt({
      cwd: "/repo",
      iteration: 3,
      taskPrompt: "Find lifecycle bugs",
      knownFingerprints: ["abc", "def"],
      recentTitles: ["old title"],
    });

    expect(prompt).toContain("Find lifecycle bugs");
    expect(prompt).toContain("Known dedupe keys: abc, def");
    expect(prompt).toContain("Recent bug titles: old title");
    expect(prompt).toContain('"status": "bug_found" | "no_bug"');
  });

  it("bug_found JSON を正規化できる", () => {
    const result = parseBugHuntModelOutput(`
\`\`\`json
{
  "status": "bug_found",
  "title": "Timer leak on repeated startup",
  "summary": "A timer is never cleared.",
  "severity": "high",
  "confidence": 0.91,
  "why": "The startup path creates a timer without matching cleanup.",
  "dedupeKey": "timer-leak-startup",
  "evidence": [
    { "file": ".pi/extensions/example.ts", "line": 42, "reason": "setInterval is created here" }
  ]
}
\`\`\`
    `);

    expect(result.status).toBe("bug_found");
    if (result.status === "bug_found") {
      expect(result.report.title).toBe("Timer leak on repeated startup");
      expect(result.report.severity).toBe("high");
      expect(result.report.evidence[0]?.line).toBe(42);
      expect(result.report.dedupeKey).toBe("timer-leak-startup");
    }
  });

  it("no_bug JSON を受け取れる", () => {
    const result = parseBugHuntModelOutput(`
{
  "status": "no_bug",
  "reason": "No new credible bug after checking the remaining files."
}
    `);

    expect(result).toEqual({
      status: "no_bug",
      reason: "No new credible bug after checking the remaining files.",
    });
  });
});
