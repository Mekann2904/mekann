// Path: tests/unit/extensions/bug-hunt-localization.test.ts
// What: bug-hunt localization helper の evidence validation を検証する
// Why: task 化前の file / line 検証の退行を防ぐため
// Related: .pi/extensions/bug-hunt/localization.ts, .pi/extensions/bug-hunt/types.ts, .pi/extensions/bug-hunt/runner.ts

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { validateBugHuntReportEvidence } from "../../../.pi/extensions/bug-hunt/localization.js";

describe("bug-hunt localization helpers", () => {
  it("存在する evidence だけを残して正規化する", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bug-hunt-localization-"));
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(join(cwd, "src", "app.ts"), "const a = 1;\nconst b = 2;\nexport function run() {}\n", "utf8");

    const result = await validateBugHuntReportEvidence({
      title: "Example",
      summary: "Example bug",
      severity: "high",
      confidence: 0.9,
      why: "Example why",
      dedupeKey: "example",
      evidence: [
        { file: "src/app.ts", line: 3, reason: "Valid line" },
        { file: "src/missing.ts", line: 1, reason: "Missing file" },
        { file: "src/app.ts", line: 100, reason: "Out of range line" },
      ],
    }, cwd);

    expect(result.valid).toBe(true);
    expect(result.report?.evidence).toHaveLength(2);
    expect(result.report?.evidence[0]?.file).toBe("src/app.ts");
    expect(result.report?.evidence[0]?.line).toBe(3);
    expect(result.report?.evidence[1]?.line).toBeUndefined();
    expect(result.issues.some((issue) => issue.includes("missing evidence file"))).toBe(true);
  });

  it("全 evidence が無効なら invalid を返す", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "bug-hunt-localization-"));

    const result = await validateBugHuntReportEvidence({
      title: "Example",
      summary: "Example bug",
      severity: "medium",
      confidence: 0.5,
      why: "Example why",
      dedupeKey: "example",
      evidence: [
        { file: "src/missing.ts", line: 1, reason: "Missing file" },
      ],
    }, cwd);

    expect(result.valid).toBe(false);
    expect(result.report).toBeNull();
    expect(result.issues[0]).toContain("missing evidence file");
  });
});
