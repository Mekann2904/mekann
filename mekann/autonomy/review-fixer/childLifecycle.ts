/**
 * Review fixer child Pi lifecycle.
 *
 * Handles spawning a child Pi with PI_SUBAGENT_ROLE=review-fixer,
 * waiting for completion, and collecting the structured result.
 */

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ReviewFixerResult, ReviewFixerSettings } from "./types.js";
import type { ResolvedIssueContext } from "./issueContext.js";
import { buildChildPrompt } from "./childPrompt.js";

const execFileAsync = promisify(execFile);

function getExtensionPath(): string {
  // Resolve to the mekann extension root so child Pi loads the same extensions.
  try {
    return path.resolve(fileURLToPath(import.meta.url), "../../..");
  } catch {
    return "";
  }
}

/**
 * Get git status snapshot for comparing before/after.
 */
function snapshotChangedFiles(cwd: string): Set<string> {
  try {
    const output = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf-8" });
    return new Set(output.split("\n").filter(Boolean).map((line) => line.slice(3)));
  } catch {
    return new Set();
  }
}

/**
 * Spawn a child Pi process for the review fixer and wait for completion.
 */
export async function runChildReviewFixer(
  issueContext: ResolvedIssueContext,
  settings: ReviewFixerSettings,
  cwd: string,
  ctx: ExtensionContext,
): Promise<{ result: ReviewFixerResult | null; changedFiles: string[]; error?: string }> {
  const extensionPath = getExtensionPath();
  const prompt = buildChildPrompt(issueContext, cwd);

  // Snapshot before
  const filesBefore = snapshotChangedFiles(cwd);

  // Resolve model arguments
  const modelArgs: string[] = [];
  if (settings.model) {
    modelArgs.push("--model", `${settings.model.provider}/${settings.model.modelId}`);
  }
  if (settings.reasoningEffort) {
    modelArgs.push("--effort", settings.reasoningEffort);
  }

  // Build the child Pi command.
  // The child runs with the same cwd and receives the review prompt as its initial user message.
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PI_SUBAGENT_ROLE: "review-fixer",
    PI_REVIEW_FIXER_MAX_RETRIES: String(settings.maxFixRetries),
    PI_REVIEW_FIXER_INITIAL_MESSAGE: prompt,
  };

  try {
    const extensionArgs = extensionPath ? ["-e", extensionPath] : [];
    const childArgs = [
      ...extensionArgs,
      ...modelArgs,
      "--prompt", prompt,
      "--no-interactive",
    ];

    // Use the pi command to launch child.
    const piCommand = process.env.PI_REVIEW_FIXER_PI_COMMAND || "pi";

    const { stdout, stderr } = await execFileAsync(piCommand, childArgs, {
      cwd,
      env,
      timeout: 600_000, // 10 minute timeout
      maxBuffer: 10 * 1024 * 1024,
    });

    // Extract the structured result from child output
    const result = extractResult(stdout || stderr);

    // Compute changed files: diff before vs after snapshot
    const filesAfter = snapshotChangedFiles(cwd);
    const changedFiles = [...filesAfter].filter((f) => !filesBefore.has(f));

    return { result, changedFiles };
  } catch (err: any) {
    // Even on error, check what changed
    const filesAfter = snapshotChangedFiles(cwd);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { result: null, changedFiles: [...filesAfter], error: errorMessage };
  }
}

/**
 * Extract the structured JSON result from child Pi output.
 */
function extractResult(output: string): ReviewFixerResult | null {
  // Try to find JSON in the output
  // First try: entire output is JSON
  try {
    const parsed = JSON.parse(output.trim());
    if (parsed.schema === "review-fixer.result.v1") return parsed as ReviewFixerResult;
  } catch { /* not raw JSON */ }

  // Second try: extract from markdown code blocks
  const jsonBlockMatch = output.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      if (parsed.schema === "review-fixer.result.v1") return parsed as ReviewFixerResult;
    } catch { /* not valid JSON */ }
  }

  // Third try: find any JSON object with the right schema
  const jsonMatch = output.match(/\{[\s\S]*?"schema"\s*:\s*"review-fixer\.result\.v1"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as ReviewFixerResult;
    } catch { /* not valid JSON */ }
  }

  return null;
}
