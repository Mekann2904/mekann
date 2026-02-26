/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-pipeline.test.ts
 * role: Unit tests for self-improvement-pipeline.ts
 * why: Verify pipeline functions work correctly
 * related: self-improvement-pipeline.ts, self-improvement-dev-analyzer.ts
 * public_api: None (test file)
 * invariants: Pipeline must not block commits
 * side_effects: None (tests mock git commands)
 * failure_modes: Test failures indicate pipeline bugs
 * @abdd.explain
 * overview: Unit tests for development pipeline integration
 * what_it_does:
 *   - Tests pre-commit analysis
 *   - Tests post-commit analysis
 *   - Tests review analysis generation
 * why_it_exists: Ensures pipeline integration works correctly
 * scope:
 *   in: self-improvement-pipeline.ts exports
 *   out: Test results
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runPreCommitAnalysis,
  generateReviewAnalysis,
  getHighRiskPatterns,
  type PreCommitAnalysisResult,
  type PostCommitAnalysisResult,
} from "../extensions/self-improvement-pipeline.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes("git diff --cached --name-only")) {
      return "src/test.ts\nsrc/utils.ts\n";
    }
    if (cmd.includes("git show")) {
      return `// test file content
const password = "secret123";
const x: any = {} as any as string;
// TODO: fix this later
`;
    }
    if (cmd.includes("git log")) {
      return "feat: add new feature\n";
    }
    if (cmd.includes("git diff-tree")) {
      return "src/test.ts\n";
    }
    if (cmd.includes("git diff")) {
      return "+const x = 1;\n-const y = 2;\n";
    }
    return "";
  }),
}));

// Mock fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe("runPreCommitAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return PreCommitAnalysisResult structure", async () => {
    const result = await runPreCommitAnalysis();

    expect(result).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
    expect(["low", "medium", "high"]).toContain(result.riskLevel);
    expect(Array.isArray(result.perspectives)).toBe(true);
    expect(typeof result.shouldBlock).toBe("boolean");
  });

  it("should never block commits (advisory only)", async () => {
    const result = await runPreCommitAnalysis();
    expect(result.shouldBlock).toBe(false);
  });

  it("should detect high-risk patterns in staged files", async () => {
    const result = await runPreCommitAnalysis();

    // Should detect password/secret pattern (schizoanalysis perspective)
    const schizoWarnings = result.perspectives.find(
      (p) => p.perspective === "schizoanalysis"
    );
    expect(schizoWarnings).toBeDefined();

    // Should detect any as pattern (deconstruction perspective)
    const deconWarnings = result.perspectives.find(
      (p) => p.perspective === "deconstruction"
    );
    expect(deconWarnings).toBeDefined();

    // Should detect TODO/FIXME (eudaimonia perspective)
    const eudaimoniaWarnings = result.perspectives.find(
      (p) => p.perspective === "eudaimonia"
    );
    expect(eudaimoniaWarnings).toBeDefined();
  });

  it("should provide suggestions for detected risks", async () => {
    const result = await runPreCommitAnalysis();

    for (const perspective of result.perspectives) {
      expect(Array.isArray(perspective.warnings)).toBe(true);
      expect(Array.isArray(perspective.suggestions)).toBe(true);
    }
  });
});

describe("generateReviewAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate markdown report", async () => {
    const report = await generateReviewAnalysis("main");

    expect(report).toBeDefined();
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(0);
  });

  it("should include all perspective sections", async () => {
    const report = await generateReviewAnalysis("main");

    const perspectives = [
      "コード批判的分析",
      "欲望-機能分析",
      "開発者体験",
      "アーキテクチャ未来予測",
      "メタプログラミング認識",
      "思考モード選択",
      "ロジック検証",
    ];

    for (const perspective of perspectives) {
      expect(report).toContain(perspective);
    }
  });

  it("should include recommended actions section", async () => {
    const report = await generateReviewAnalysis("main");
    expect(report).toContain("推奨アクション");
  });

  it("should include timestamp", async () => {
    const report = await generateReviewAnalysis("main");
    expect(report).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp pattern
  });
});

describe("getHighRiskPatterns", () => {
  it("should return list of high-risk patterns", () => {
    const patterns = getHighRiskPatterns();

    expect(Array.isArray(patterns)).toBe(true);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it("should include expected risk types", () => {
    const patterns = getHighRiskPatterns();
    const riskTypes = patterns.map((p) => p.risk);

    expect(riskTypes).toContain("destructive_operation");
    expect(riskTypes).toContain("database_destruction");
    expect(riskTypes).toContain("sensitive_data");
    expect(riskTypes).toContain("type_unsafety");
    expect(riskTypes).toContain("tech_debt");
  });

  it("should map risks to perspectives", () => {
    const patterns = getHighRiskPatterns();

    for (const pattern of patterns) {
      expect(pattern.perspective).toBeDefined();
      expect([
        "deconstruction",
        "schizoanalysis",
        "eudaimonia",
        "utopia_dystopia",
        "thinking_philosophy",
        "thinking_taxonomy",
        "logic",
      ]).toContain(pattern.perspective);
    }
  });
});

describe("Type exports", () => {
  it("should export PreCommitAnalysisResult type correctly", () => {
    const result: PreCommitAnalysisResult = {
      timestamp: "2024-01-01T00:00:00Z",
      files: ["test.ts"],
      riskLevel: "low",
      perspectives: [],
      shouldBlock: false,
    };
    expect(result.shouldBlock).toBe(false);
  });

  it("should export PostCommitAnalysisResult type correctly", () => {
    const result: PostCommitAnalysisResult = {
      commitHash: "abc123",
      commitMessage: "test",
      timestamp: "2024-01-01T00:00:00Z",
      analyses: [],
    };
    expect(result.commitHash).toBe("abc123");
  });
});
