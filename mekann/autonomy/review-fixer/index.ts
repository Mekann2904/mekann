/**
 * Review fixer Extension — Synchronous issue-scoped review-and-fix workflow.
 *
 * Launches a child Pi in the same branch/workspace, runs
 * thermo-nuclear-code-quality-review, edits the workspace directly,
 * verifies changes, and returns a structured JSON result.
 *
 * Tool: review_fixer
 * No parameters — issue, scope, model are all derived mechanically.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { isFeatureEnabled } from "../../settings/enabled.js";
import { resolveIssueContext, checkIssueReadiness } from "./issueContext.js";
import { runChildReviewFixer } from "./childLifecycle.js";
import { loadReviewFixerSettings } from "./settingsLoader.js";
import { ReviewFixerParamsSchema } from "./schemas.js";
import { registerReviewFixerPromptProvider } from "./promptProvider.js";

export default function reviewFixerExtension(pi: ExtensionAPI): void | Promise<void> {
  if (!isFeatureEnabled("review-fixer")) return;

  registerReviewFixerPromptProvider();

  // ─── Tool ────────────────────────────────────────────────────

  pi.registerTool({
    name: "review_fixer",
    label: "Review and fix code quality",
    description:
      "Launch a synchronous review-and-fix workflow for the current issue worktree. " +
      "A child Pi runs thermo-nuclear-code-quality-review in a clean context, " +
      "edits the workspace directly to achieve the best possible implementation quality, " +
      "verifies changes with tests, and returns a structured result. " +
      "Requires an issue worktree (branch issue-<number>). " +
      "Blocked issues will not be reviewed.",
    promptSnippet: "Run a thermo-nuclear code quality review and fix for the current issue",
    promptGuidelines: [
      "Use review_fixer before creating a PR for an issue implementation.",
      "The tool is synchronous — it will block until the child Pi completes.",
      "The child Pi edits the current workspace directly. Review the returned result carefully.",
      "After review_fixer completes, use /issue to create the PR.",
    ],
    parameters: ReviewFixerParamsSchema,
    execute: async (
      _id: string,
      _params: unknown,
      _signal: unknown,
      _onUpdate: unknown,
      ctx: ExtensionContext,
    ) => {
      // 1. Load settings
      const settings = loadReviewFixerSettings();

      // 2. Resolve issue context
      const issueContext = await resolveIssueContext(ctx.cwd);
      if (!issueContext) {
        return {
          content: [{ type: "text" as const, text: "Review fixer failed: could not resolve issue context. Ensure you are on an issue worktree (branch issue-<number>) and the GitHub issue exists." }],
          isError: true,
        };
      }

      // 3. Check dependencies
      const blockReason = checkIssueReadiness(issueContext);
      if (blockReason) {
        return {
          content: [{ type: "text" as const, text: `Review fixer blocked: ${blockReason}` }],
          isError: true,
        };
      }

      // 4. Snapshot git status before
      let statusBefore = "";
      try {
        statusBefore = execFileSync("git", ["status", "--porcelain"], { cwd: ctx.cwd, encoding: "utf-8" });
      } catch { /* ignore */ }

      // 5. Run child Pi
      const { result, changedFiles, error } = await runChildReviewFixer(
        issueContext,
        settings,
        ctx.cwd,
        ctx,
      );

      // 6. Snapshot git status after
      let statusAfter = "";
      try {
        statusAfter = execFileSync("git", ["status", "--porcelain"], { cwd: ctx.cwd, encoding: "utf-8" });
      } catch { /* ignore */ }

      // 7. Build response
      if (error && !result) {
        return {
          content: [{
            type: "text" as const,
            text: `Review fixer failed: ${error}\n\nChanged files: ${changedFiles.length > 0 ? changedFiles.join(", ") : "none"}`,
          }],
          isError: true,
        };
      }

      // Compute actual changed files from diff
      const beforeFiles = new Set(statusBefore.split("\n").filter(Boolean).map((l) => l.slice(3)));
      const afterFiles = new Set(statusAfter.split("\n").filter(Boolean).map((l) => l.slice(3)));
      const newChangedFiles = [...afterFiles].filter((f) => !beforeFiles.has(f));

      // If child reported its own changed files, prefer those; otherwise use diff
      const effectiveChangedFiles = changedFiles.length > 0 ? changedFiles : newChangedFiles;

      const details: Record<string, unknown> = {
        issue: { number: issueContext.number, title: issueContext.title, url: issueContext.url },
        childResult: result,
        changedFiles: effectiveChangedFiles,
        statusBefore: statusBefore.trim(),
        statusAfter: statusAfter.trim(),
      };

      // Format human-readable summary
      const summaryLines: string[] = [];
      summaryLines.push(`## Review Fixer Result for Issue #${issueContext.number}`);
      summaryLines.push("");

      if (result) {
        summaryLines.push(`**Status**: ${result.status}`);
        summaryLines.push(`**Findings**: ${result.findings.length} (${result.findings.filter((f) => f.severity === "blocker").length} blockers, ${result.findings.filter((f) => f.severity === "major").length} major, ${result.findings.filter((f) => f.severity === "minor").length} minor)`);
        summaryLines.push(`**Files changed**: ${result.changes.files_changed.length > 0 ? result.changes.files_changed.join(", ") : "none"}`);
        summaryLines.push(`**Structural changes**: ${result.changes.structural_changes.length > 0 ? result.changes.structural_changes.join("; ") : "none"}`);
        summaryLines.push(`**Behavior changes**: ${result.changes.behavior_changes.length > 0 ? result.changes.behavior_changes.join("; ") : "none"}`);
        summaryLines.push(`**Tests modified**: ${result.changes.tests_added_or_modified.length > 0 ? result.changes.tests_added_or_modified.join(", ") : "none"}`);
        summaryLines.push(`**Verification**: ${result.verification.all_passed ? "✅ All passed" : "❌ Some failed"} (${result.verification.commands_run.length} commands)`);
        summaryLines.push(`**Remaining risks**: ${result.remaining_risks.length > 0 ? result.remaining_risks.join("; ") : "none"}`);
        summaryLines.push(`**Next steps**: ${result.parent_next_steps}`);
      } else {
        summaryLines.push("**Status**: No structured result returned from child Pi");
      }

      if (effectiveChangedFiles.length > 0) {
        summaryLines.push("");
        summaryLines.push(`**New workspace changes**: ${effectiveChangedFiles.join(", ")}`);
      }

      if (error) {
        summaryLines.push("");
        summaryLines.push(`**Warning**: ${error}`);
      }

      return {
        content: [{ type: "text" as const, text: summaryLines.join("\n") }],
        details,
      };
    },
  });
}
