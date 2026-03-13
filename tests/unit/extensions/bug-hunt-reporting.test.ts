// Path: tests/unit/extensions/bug-hunt-reporting.test.ts
// What: bug-hunt reporting helper の prompt / parser を検証する
// Why: runner が期待する JSON 契約の退行を防ぐため
// Related: .pi/extensions/bug-hunt/reporting.ts, .pi/extensions/bug-hunt/types.ts, .pi/extensions/bug-hunt/runner.ts

import { describe, expect, it } from "vitest";

import {
  buildBugHuntHypothesisPrompt,
  buildBugHuntInvestigationPrompt,
  buildBugHuntObserverPrompt,
  buildBugHuntQueryPrompt,
  extractBugHuntMissionBrief,
  parseBugHuntHypothesisOutput,
  parseBugHuntInvestigationOutput,
  parseBugHuntModelOutput,
  parseBugHuntQueryOutput,
  resolveBugHuntCandidateReference,
} from "../../../.pi/extensions/bug-hunt/reporting.js";

describe("bug-hunt reporting helpers", () => {
  it("query prompt に mission と重複回避情報を含める", () => {
    const prompt = buildBugHuntQueryPrompt({
      cwd: "/repo",
      iteration: 3,
      taskPrompt: "Find lifecycle bugs in .pi/tests/ul-workflow-artifacts.test.ts",
      knownDedupeKeys: ["abc", "def"],
      recentTitles: ["old title"],
      seenFiles: ["src/old.ts"],
      missionBrief: extractBugHuntMissionBrief("Find lifecycle bugs in .pi/tests/ul-workflow-artifacts.test.ts"),
      missionVerificationSummary: "Verified by running vitest on .pi/tests/ul-workflow-artifacts.test.ts: passing in current workspace.",
    });

    expect(prompt).toContain("Find lifecycle bugs");
    expect(prompt).toContain("Mission focus files: .pi/tests/ul-workflow-artifacts.test.ts");
    expect(prompt).toContain("passing in current workspace");
    expect(prompt).toContain("Known dedupe keys: abc, def");
    expect(prompt).toContain("Recent bug titles: old title");
    expect(prompt).toContain("Recently seen files: src/old.ts");
    expect(prompt).toContain('"query": "short localized investigation query"');
  });

  it("mission から focus file と verification target を抽出できる", () => {
    const result = extractBugHuntMissionBrief(
      "未カバー領域のテスト追加。現在 .pi/tests/ul-workflow-artifacts.test.ts に1つの失敗テストがある。",
    );

    expect(result.focusFiles).toContain(".pi/tests/ul-workflow-artifacts.test.ts");
    expect(result.verificationTarget).toBe(".pi/tests/ul-workflow-artifacts.test.ts");
    expect(result.runtimeClaims[0]).toContain("失敗テスト");
  });

  it("query plan JSON を正規化できる", () => {
    const result = parseBugHuntQueryOutput(`
{
  "query": "Timer leak during repeated startup",
  "keywords": ["timer", "startup", "cleanup"],
  "bugSignals": ["resource leak"],
  "areasToAvoid": ["already reported timer bug"],
  "confidence": 0.77
}
    `);

    expect(result.query).toBe("Timer leak during repeated startup");
    expect(result.keywords).toEqual(["timer", "startup", "cleanup"]);
    expect(result.bugSignals).toEqual(["resource leak"]);
  });

  it("hypothesis prompt と parser が候補を扱える", () => {
    const prompt = buildBugHuntHypothesisPrompt({
      queryPlan: {
        query: "Timer leak during startup",
        keywords: ["timer", "startup"],
        bugSignals: ["resource leak"],
        areasToAvoid: [],
        confidence: 0.8,
      },
      candidates: [{
        id: "candidate:src/app.ts|10|startTimer",
        file: "src/app.ts",
        line: 10,
        symbolName: "startTimer",
        sources: ["locagent"],
        score: 2.4,
        summary: "setInterval is created in startup",
        snippet: "10: const id = setInterval(...)",
      }],
    });

    expect(prompt).toContain("candidate:src/app.ts|10|startTimer");

    const hypotheses = parseBugHuntHypothesisOutput(`
{
  "hypotheses": [
    {
      "id": "hyp-1",
      "candidateId": "candidate:src/app.ts|10|startTimer",
      "titleHint": "Timer is never cleared",
      "hypothesis": "The startup path allocates a timer without cleanup.",
      "severity": "high",
      "confidence": 0.88,
      "focus": ["shutdown path", "cleanup"]
    }
  ]
}
    `);

    expect(hypotheses).toHaveLength(1);
    expect(hypotheses[0]?.candidateId).toBe("candidate:src/app.ts|10|startTimer");
    expect(hypotheses[0]?.severity).toBe("high");
  });

  it("candidate 参照は file:line:symbol 形式でも解決できる", () => {
    const candidates = [{
      id: "candidate:src/app.ts|10|startTimer",
      file: "src/app.ts",
      line: 10,
      symbolName: "startTimer",
      sources: ["locagent"] as const,
      score: 2.4,
      summary: "setInterval is created in startup",
    }];

    expect(resolveBugHuntCandidateReference("src/app.ts:10:startTimer", candidates)).toBe(
      "candidate:src/app.ts|10|startTimer",
    );
    expect(resolveBugHuntCandidateReference("src/app.ts:10", candidates)).toBe(
      "candidate:src/app.ts|10|startTimer",
    );
  });

  it("investigation JSON を正規化できる", () => {
    const prompt = buildBugHuntInvestigationPrompt({
      queryPlan: {
        query: "Timer leak during startup",
        keywords: ["timer"],
        bugSignals: ["resource leak"],
        areasToAvoid: [],
        confidence: 0.7,
      },
      candidate: {
        id: "candidate:src/app.ts|10|startTimer",
        file: "src/app.ts",
        line: 10,
        symbolName: "startTimer",
        sources: ["locagent"],
        score: 2.4,
        summary: "setInterval is created in startup",
      },
      hypothesis: {
        id: "hyp-1",
        candidateId: "candidate:src/app.ts|10|startTimer",
        titleHint: "Timer leak",
        hypothesis: "The timer is never cleared on shutdown.",
        severity: "high",
        confidence: 0.8,
        focus: ["shutdown"],
      },
      context: "Snippet...",
      rejectedHypotheses: [],
      missionVerificationSummary: "Verified by running vitest on src/app.test.ts: failing in current workspace.",
    });

    expect(prompt).toContain('"status": "supported|rejected|inconclusive"');
    expect(prompt).toContain("failing in current workspace");

    const result = parseBugHuntInvestigationOutput(`
{
  "candidateId": "candidate:src/app.ts|10|startTimer",
  "hypothesisId": "hyp-1",
  "status": "supported",
  "confidence": 0.84,
  "title": "Timer leak on repeated startup",
  "summary": "A timer is created during startup and never cleared.",
  "why": "The cleanup path is missing a clearInterval call.",
  "chain": ["startTimer", "shutdown"],
  "evidence": [
    { "file": "src/app.ts", "line": 10, "reason": "Timer allocation" }
  ]
}
    `);

    expect(result.status).toBe("supported");
    expect(result.chain).toEqual(["startTimer", "shutdown"]);
    expect(result.evidence[0]?.file).toBe("src/app.ts");
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

  it("observer prompt に mission verification を含める", () => {
    const prompt = buildBugHuntObserverPrompt({
      taskPrompt: "Investigate failing test",
      queryPlan: {
        query: "failing ul workflow test",
        keywords: ["ul", "workflow"],
        bugSignals: ["test failure"],
        areasToAvoid: [],
        confidence: 0.7,
      },
      investigations: [],
      knownDedupeKeys: [],
      recentTitles: [],
      missionVerificationSummary: "Verified by running vitest on .pi/tests/ul-workflow-artifacts.test.ts: passing in current workspace.",
    });

    expect(prompt).toContain("Mission verification:");
    expect(prompt).toContain("passing in current workspace");
  });
});
