/**
 * path: scripts/run-workspace-verification-ci.ts
 * role: GitHub Actions やローカル CI から workspace verification を実行する
 * why: repo-level quality gate を CLI で再利用し、artifact を残すため
 * related: .pi/lib/workspace-verification-ci.ts, .github/workflows/test.yml, package.json, tests/unit/lib/workspace-verification-ci.test.ts
 */

import { join } from "node:path";

function parseArgs(argv: string[]): {
  requestedSteps?: string[];
  profile?: "auto" | "web-app" | "library" | "backend" | "cli";
  failOnInteractiveRecommendations: boolean;
} {
  const result: {
    requestedSteps?: string[];
    profile?: "auto" | "web-app" | "library" | "backend" | "cli";
    failOnInteractiveRecommendations: boolean;
  } = {
    failOnInteractiveRecommendations: false,
  };

  for (const raw of argv) {
    if (raw.startsWith("--steps=")) {
      const steps = raw.slice("--steps=".length).split(",").map((item) => item.trim()).filter(Boolean);
      if (steps.length > 0) {
        result.requestedSteps = steps;
      }
      continue;
    }

    if (raw.startsWith("--profile=")) {
      const profile = raw.slice("--profile=".length).trim();
      if (profile === "auto" || profile === "web-app" || profile === "library" || profile === "backend" || profile === "cli") {
        result.profile = profile;
      }
      continue;
    }

    if (raw === "--fail-on-interactive") {
      result.failOnInteractiveRecommendations = true;
    }
  }

  return result;
}

async function main(): Promise<void> {
  process.env.PI_RUNTIME_DIR = process.env.PI_RUNTIME_DIR || join(process.cwd(), ".pi", "runtime");
  const args = parseArgs(process.argv.slice(2));
  const { runWorkspaceVerificationCi } = await import("../.pi/lib/workspace-verification-ci.js");
  const result = await runWorkspaceVerificationCi({
    requestedSteps: args.requestedSteps,
    profile: args.profile,
    failOnInteractiveRecommendations: args.failOnInteractiveRecommendations,
    writeGithubStepSummary: true,
  });

  process.stdout.write(result.summaryText);
  process.exitCode = result.run.success ? 0 : 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
