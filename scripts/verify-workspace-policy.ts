/**
 * path: scripts/verify-workspace-policy.ts
 * role: repo 内の workspace quality policy が崩れていないかを検証する
 * why: required checks と artifact policy をコード側で固定し、運用 drift を防ぐため
 * related: .github/workflows/test.yml, scripts/apply-github-branch-protection.ts, README.md, docs/03-development/04-testing.md
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_JOB_MARKERS = [
  "quality-gates:",
  "compatibility:",
  "security:",
];

const REQUIRED_ARTIFACT_MARKERS = [
  ".pi/verification-runs/",
  ".pi/evals/workspace-verification/",
  ".pi/workspace-verification/reviews/",
  ".pi/workspace-verification/continuity.json",
  ".pi/workspace-verification/trajectory.json",
];

function assertContains(content: string, marker: string, label: string): void {
  if (!content.includes(marker)) {
    throw new Error(`missing ${label}: ${marker}`);
  }
}

function main(): void {
  const workflowPath = resolve(process.cwd(), ".github", "workflows", "test.yml");
  const workflow = readFileSync(workflowPath, "utf-8");

  for (const marker of REQUIRED_JOB_MARKERS) {
    assertContains(workflow, marker, "required job");
  }

  for (const marker of REQUIRED_ARTIFACT_MARKERS) {
    assertContains(workflow, marker, "required artifact path");
  }

  process.stdout.write("workspace quality policy is consistent\n");
}

main();
