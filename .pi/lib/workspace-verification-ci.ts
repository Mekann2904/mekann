/**
 * path: .pi/lib/workspace-verification-ci.ts
 * role: CI から workspace verification を non-interactive に実行する
 * why: repo-level quality gate と artifact upload を同じ runbook で再利用するため
 * related: .pi/lib/workspace-verification.ts, scripts/run-workspace-verification-ci.ts, .github/workflows/test.yml, tests/unit/lib/workspace-verification-ci.test.ts
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  acknowledgeReviewArtifact,
  createWorkspaceVerificationConfig,
  finalizeVerificationRun,
  getResolvedCommandForStep,
  persistWorkspaceVerificationArtifacts,
  persistWorkspaceVerificationContinuityPack,
  persistWorkspaceReviewArtifact,
  resolveEnabledSteps,
  resolveWorkspaceVerificationPlan,
  runWorkspaceCommand,
  saveWorkspaceVerificationState,
  type WorkspaceVerificationConfig,
  type WorkspaceVerificationRunRecord,
  type WorkspaceVerificationStep,
  type WorkspaceVerificationStepResult,
} from "./workspace-verification.js";

const COMMAND_STEPS: WorkspaceVerificationStep[] = ["lint", "typecheck", "test", "build"];

export interface WorkspaceVerificationCiOptions {
  cwd?: string;
  requestedSteps?: string[];
  profile?: "auto" | "web-app" | "library" | "backend" | "cli";
  failOnInteractiveRecommendations?: boolean;
  writeGithubStepSummary?: boolean;
}

export interface WorkspaceVerificationCiResult {
  run: WorkspaceVerificationRunRecord;
  stepResults: WorkspaceVerificationStepResult[];
  executedSteps: WorkspaceVerificationStep[];
  skippedInteractiveSteps: WorkspaceVerificationStep[];
  continuityPath: string;
  summaryText: string;
  changedFiles: string[];
}

function makeSkippedStep(step: WorkspaceVerificationStep, reason: string): WorkspaceVerificationStepResult {
  return {
    step,
    success: false,
    skipped: true,
    durationMs: 0,
    error: reason,
  };
}

function resolveCiUiBaseUrl(resolvedPlan: WorkspaceVerificationRunRecord["resolvedPlan"]): string | undefined {
  const explicit = process.env.CI_WORKSPACE_VERIFY_UI_BASE_URL?.trim();
  if (explicit) {
    return explicit;
  }
  return resolvedPlan.ui.baseUrl;
}

function resolveCiUiCommand(baseUrl?: string): string | undefined {
  const template = process.env.CI_WORKSPACE_VERIFY_UI_COMMAND?.trim();
  if (!template) {
    return undefined;
  }
  return baseUrl ? template.replaceAll("${baseUrl}", baseUrl) : template;
}

function buildCiConfig(options: WorkspaceVerificationCiOptions): WorkspaceVerificationConfig {
  const base = createWorkspaceVerificationConfig();
  return {
    ...base,
    profile: options.profile ?? base.profile,
    autoRunOnTurnEnd: false,
    requireProofReview: false,
    requireReplanOnRepeatedFailure: false,
    checkpointOnMutation: false,
    checkpointOnFailure: false,
    enabledSteps: {
      ...base.enabledSteps,
      runtime: false,
      ui: false,
    },
  };
}

function readChangedFiles(cwd: string): string[] {
  const explicitBase = process.env.CI_WORKSPACE_VERIFY_BASE?.trim();
  const githubBase = process.env.GITHUB_BASE_REF?.trim();
  const baseRef = explicitBase || (githubBase ? `origin/${githubBase}` : "");
  const args = baseRef
    ? ["diff", "--name-only", `${baseRef}...HEAD`]
    : ["diff", "--name-only", "HEAD"];

  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function toLintableFiles(changedFiles: string[]): string[] {
  return changedFiles.filter((file) => {
    if (!/\.(?:[cm]?[jt]sx?)$/u.test(file)) {
      return false;
    }
    const normalized = normalizePathForMatch(file);
    return normalized.startsWith(".pi/extensions/") || normalized.startsWith(".pi/lib/");
  });
}

function toRelevantTestFiles(changedFiles: string[]): string[] {
  const candidates = new Set<string>();

  for (const file of changedFiles) {
    const normalized = normalizePathForMatch(file);
    if (/^tests\/.+\.test\.ts$/u.test(normalized)) {
      candidates.add(normalized);
      continue;
    }

    const libMatch = normalized.match(/^\.pi\/lib\/(.+)\.ts$/u);
    if (libMatch?.[1]) {
      candidates.add(`tests/unit/lib/${libMatch[1]}.test.ts`);
    }

    const extensionMatch = normalized.match(/^\.pi\/extensions\/(.+)\.ts$/u);
    if (extensionMatch?.[1]) {
      candidates.add(`tests/unit/extensions/${extensionMatch[1]}.test.ts`);
    }

    if (normalized === "scripts/run-workspace-verification-ci.ts") {
      candidates.add("tests/unit/lib/workspace-verification-ci.test.ts");
    }
  }

  return [...candidates].filter((file) => existsSync(resolve(process.cwd(), file)));
}

function selectRelevantCiSteps(
  selected: WorkspaceVerificationStep[],
  changedFiles: string[],
): WorkspaceVerificationStep[] {
  if (changedFiles.length === 0) {
    return selected;
  }

  const lower = changedFiles.map((item) => item.toLowerCase());
  const lintable = toLintableFiles(changedFiles);
  const relevantTests = toRelevantTestFiles(changedFiles);
  const shouldTypecheck = lower.some((file) =>
    file.endsWith(".ts")
    || file.endsWith(".tsx")
    || file.includes("tsconfig"),
  );
  const shouldTest = lower.some((file) =>
    relevantTests.length > 0
    || file.includes("/tests/")
    || file.startsWith("tests/"),
  );
  const shouldBuild = lower.some((file) =>
    file.endsWith("package.json")
    || file.includes("vite.config")
    || file.includes("webpack")
    || file.includes("rollup")
    || file.includes("/web-ui/")
    || file.endsWith(".tsx")
    || file.endsWith(".css")
  );

  return selected.filter((step) => {
    if (step === "lint") {
      return lintable.length > 0;
    }
    if (step === "typecheck") {
      return shouldTypecheck;
    }
    if (step === "test") {
      return shouldTest;
    }
    if (step === "build") {
      return shouldBuild;
    }
    return true;
  });
}

function resolveCiCommand(
  step: WorkspaceVerificationStep,
  resolvedPlan: WorkspaceVerificationRunRecord["resolvedPlan"],
  changedFiles: string[],
): string {
  if (step === "lint") {
    const lintable = toLintableFiles(changedFiles);
    if (lintable.length > 0) {
      return `npx eslint ${lintable.map((file) => JSON.stringify(file)).join(" ")} --max-warnings=0`;
    }
  }

  if (step === "test") {
    const relevantTests = toRelevantTestFiles(changedFiles);
    if (relevantTests.length > 0) {
      return `npx vitest run ${relevantTests.map((file) => JSON.stringify(file)).join(" ")}`;
    }
  }

  return getResolvedCommandForStep(resolvedPlan, step as "lint" | "typecheck" | "test" | "build");
}

function normalizePathForMatch(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function collectReferencedFiles(output: string): string[] {
  const results = new Set<string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([^(]+)\(\d+,\d+\): error TS\d+:/);
    if (match?.[1]) {
      results.add(normalizePathForMatch(match[1].trim()));
    }
  }
  return [...results];
}

function shouldDowngradeLegacyTypecheckFailure(
  step: WorkspaceVerificationStep,
  result: { stdout: string; stderr: string; success: boolean },
  changedFiles: string[],
): boolean {
  if (step !== "typecheck" || result.success || changedFiles.length === 0) {
    return false;
  }

  const referenced = collectReferencedFiles(`${result.stdout}\n${result.stderr}`);
  if (referenced.length === 0) {
    return false;
  }

  const changed = new Set(changedFiles.map((file) => normalizePathForMatch(file)));
  return referenced.every((file) => !changed.has(file));
}

function renderSummary(input: {
  run: WorkspaceVerificationRunRecord;
  executedSteps: WorkspaceVerificationStep[];
  skippedInteractiveSteps: WorkspaceVerificationStep[];
  changedFiles: string[];
}): string {
  const { run, executedSteps, skippedInteractiveSteps, changedFiles } = input;
  const lines = [
    "# Workspace Verification CI",
    "",
    `success: ${run.success}`,
    `profile: ${run.resolvedPlan.profile}`,
    `artifact_dir: ${run.artifactDir ?? "-"}`,
    `executed_steps: ${executedSteps.join(", ") || "-"}`,
    `changed_files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "-"}`,
  ];

  if (skippedInteractiveSteps.length > 0) {
    lines.push(`skipped_interactive_steps: ${skippedInteractiveSteps.join(", ")}`);
  }

  if (run.resolvedPlan.reasons.length > 0) {
    lines.push("", "reasons:");
    for (const item of run.resolvedPlan.reasons) {
      lines.push(`- ${item}`);
    }
  }

  if (run.resolvedPlan.proofArtifacts.length > 0) {
    lines.push("", "proof_artifacts:");
    for (const item of run.resolvedPlan.proofArtifacts) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("", "steps:");
  for (const step of run.stepResults) {
    lines.push(`- ${step.step}: success=${step.success} skipped=${step.skipped} duration_ms=${step.durationMs}`);
    if (step.command) {
      lines.push(`  command: ${step.command}`);
    }
    if (step.error) {
      lines.push(`  error: ${step.error}`);
    }
    if (step.artifactPath) {
      lines.push(`  artifact: ${step.artifactPath}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function runWorkspaceVerificationCi(
  options: WorkspaceVerificationCiOptions = {},
): Promise<WorkspaceVerificationCiResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const config = buildCiConfig(options);
  const resolvedPlan = resolveWorkspaceVerificationPlan(config, cwd);
  const selected = resolveEnabledSteps(config, resolvedPlan, options.requestedSteps);
  const changedFiles = readChangedFiles(cwd);
  const relevantSelected = selectRelevantCiSteps(selected, changedFiles);
  const executedSteps = relevantSelected.filter((step): step is WorkspaceVerificationStep => COMMAND_STEPS.includes(step));
  const uiEvidenceCommand = selected.includes("ui") ? resolveCiUiCommand(resolveCiUiBaseUrl(resolvedPlan)) : undefined;
  const skippedInteractiveSteps = selected.filter((step) => {
    if (step === "ui" && uiEvidenceCommand) {
      return false;
    }
    return step === "runtime" || step === "ui";
  });

  if (options.failOnInteractiveRecommendations && skippedInteractiveSteps.length > 0) {
    throw new Error(`interactive verification recommended in CI: ${skippedInteractiveSteps.join(", ")}`);
  }

  const stepResults: WorkspaceVerificationStepResult[] = [];
  for (const step of executedSteps) {
    const command = resolveCiCommand(step, resolvedPlan, changedFiles);
    if (!command) {
      stepResults.push(makeSkippedStep(step, "no command resolved for this step"));
      continue;
    }

    const result = await runWorkspaceCommand({
      command,
      cwd,
      timeoutMs: config.commandTimeoutMs,
    });
    const downgradeLegacyFailure = shouldDowngradeLegacyTypecheckFailure(step, result, changedFiles);
    stepResults.push({
      step,
      success: result.success || downgradeLegacyFailure,
      skipped: false,
      durationMs: result.durationMs,
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      error: downgradeLegacyFailure
        ? "legacy typecheck diagnostics outside changed files were ignored in diff-aware CI"
        : result.error,
      metadata: downgradeLegacyFailure
        ? { downgradedLegacyFailure: true, changedFiles }
        : undefined,
    });

    if (!result.success && !downgradeLegacyFailure) {
      break;
    }
  }

  for (const step of selected) {
    if (step === "runtime" || step === "ui") {
      if (step === "ui" && uiEvidenceCommand) {
        const result = await runWorkspaceCommand({
          command: uiEvidenceCommand,
          cwd,
          timeoutMs: config.commandTimeoutMs,
        });
        stepResults.push({
          step: "ui",
          success: result.success,
          skipped: false,
          durationMs: result.durationMs,
          command: uiEvidenceCommand,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.error,
          metadata: {
            ciUiBaseUrl: resolveCiUiBaseUrl(resolvedPlan),
            ciBrowserEvidence: true,
          },
        });
        if (!result.success) {
          break;
        }
        continue;
      }
      stepResults.push(makeSkippedStep(step, "interactive verification is skipped in CI"));
    }
  }

  const run: WorkspaceVerificationRunRecord = {
    trigger: "manual",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    success: stepResults.every((item) => item.success || item.skipped),
    stepResults,
    resolvedPlan,
  };

  const persistedRun = persistWorkspaceVerificationArtifacts(cwd, config, run);
  let state = finalizeVerificationRun({ cwd, run: persistedRun });
  if (persistedRun.success) {
    const reviewArtifact = persistWorkspaceReviewArtifact({
      cwd,
      run: persistedRun,
    });
    state = saveWorkspaceVerificationState(cwd, {
      ...state,
      pendingReviewArtifact: false,
      lastReviewArtifactPath: reviewArtifact.path,
    });
    state = acknowledgeReviewArtifact({
      cwd,
      path: reviewArtifact.path,
      decision: "accept",
      rationale: "CI-generated review artifact acknowledged after successful non-interactive verification.",
    });
  }
  const continuityPath = persistWorkspaceVerificationContinuityPack(cwd, state, resolvedPlan);
  saveWorkspaceVerificationState(cwd, {
    ...state,
    continuityPath,
  });

  const summaryText = renderSummary({
    run: persistedRun,
    executedSteps,
    skippedInteractiveSteps,
    changedFiles,
  });

  const githubSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (options.writeGithubStepSummary !== false && githubSummaryPath) {
    writeFileSync(githubSummaryPath, summaryText, "utf-8");
  }

  return {
    run: persistedRun,
    stepResults: persistedRun.stepResults,
    executedSteps,
    skippedInteractiveSteps,
    continuityPath,
    summaryText,
    changedFiles,
  };
}
