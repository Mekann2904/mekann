/**
 * path: tests/unit/lib/harness-engineering.test.ts
 * role: harness engineering ライブラリの診断結果と workflow template 生成を検証する
 * why: repo 診断のスコアリングと report 出力が壊れないようにするため
 * related: .pi/lib/harness-engineering.ts, scripts/harness-engineering.ts, WORKFLOW.md, tests/unit/extensions/harness-engineering.test.ts
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assessHarnessEngineering,
  createAgentFirstWorkflowTemplate,
  renderHarnessAssessmentMarkdown,
} from "../../../.pi/lib/harness-engineering.js";

describe("harness-engineering lib", () => {
  it("主要な信号が揃うと strong 以上を返す", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mekann-harness-"));

    mkdirSync(join(cwd, ".github", "workflows"), { recursive: true });
    mkdirSync(join(cwd, ".pi"), { recursive: true });
    mkdirSync(join(cwd, "docs", "05-meta"), { recursive: true });
    mkdirSync(join(cwd, "docs", "02-user-guide"), { recursive: true });
    mkdirSync(join(cwd, "docs", "04-reference"), { recursive: true });

    writeFileSync(join(cwd, "AGENTS.md"), "agents");
    writeFileSync(join(cwd, ".pi", "INDEX.md"), "index");
    writeFileSync(join(cwd, "WORKFLOW.md"), createAgentFirstWorkflowTemplate());
    writeFileSync(join(cwd, "docs", "05-meta", "08-autonomous-harness-playbook.md"), "playbook");
    writeFileSync(join(cwd, "docs", "05-meta", "06-autonomy-improvement-plan.md"), "plan");
    writeFileSync(join(cwd, "docs", "02-user-guide", "07-plan.md"), "plan guide");
    writeFileSync(join(cwd, "docs", "04-reference", "verification-workflow.md"), "verify");
    writeFileSync(
      join(cwd, ".github", "workflows", "test.yml"),
      "quality-gates:\ncompatibility:\nsecurity:\n.pi/verification-runs/\n",
    );
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          typecheck: "tsc --noEmit",
          lint: "eslint .",
          test: "vitest run",
          "verify:workspace": "node verify.js",
          "policy:workspace": "node policy.js",
        },
        pi: {
          extensions: [
            "./.pi/extensions/autonomy-policy.ts",
            "./.pi/extensions/long-running-supervisor.ts",
            "./.pi/extensions/workspace-verification.ts",
            "./.pi/extensions/ralph-loop.ts",
            "./.pi/extensions/task-auto-executor.ts",
            "./.pi/extensions/playwright-cli.ts",
            "./.pi/extensions/background-process.ts",
            "./.pi/extensions/repo-audit-orchestrator.ts",
          ],
        },
      }),
    );

    const assessment = assessHarnessEngineering(cwd);

    expect(assessment.overallScore).toBeGreaterThanOrEqual(90);
    expect(assessment.readiness).toBe("elite");
    expect(renderHarnessAssessmentMarkdown(assessment)).toContain("Harness Engineering Report");
  });

  it("workflow template は repo-native workflow を返す", () => {
    const template = createAgentFirstWorkflowTemplate();

    expect(template).toContain("kind: mekann-agent-first-workflow");
    expect(template).toContain("workspace_verify");
  });
});
