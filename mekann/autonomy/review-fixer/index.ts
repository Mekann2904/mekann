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
import { fileURLToPath } from "node:url";
import { isFeatureEnabled } from "../../settings/enabled.js";
import { createSubagentControl } from "../subagent/controlFactory.js";
import { extractJSONWithSchema } from "../subagent/resultSchemaShared.js";
import type { ReviewFixerResult } from "./types.js";
import { resolveIssueContext, checkIssueReadiness } from "./issueContext.js";
import { loadReviewFixerSettings } from "./settingsLoader.js";
import { ReviewFixerParamsSchema } from "./schemas.js";
import { buildChildPrompt } from "./childPrompt.js";
import { registerReviewFixerPromptProvider } from "./promptProvider.js";

export function extractReviewFixerResult(output: string | undefined): ReviewFixerResult | null {
  if (!output) return null;
  const json = extractJSONWithSchema(output, "review-fixer.result.v1");
  if (!json) return null;
  try { return JSON.parse(json) as ReviewFixerResult; }
  catch { return null; }
}

export default function reviewFixerExtension(pi: ExtensionAPI): void | Promise<void> {
  if (!isFeatureEnabled("review-fixer")) return;

  registerReviewFixerPromptProvider();

  // Review fixer intentionally reuses the subagent control plane instead of
  // hand-rolling Kitty/IPC lifecycle. If delegate_agent works, review_fixer
  // should work through the same path.
  let control: ReturnType<typeof createSubagentControl> | null = null;
  const subagentExtensionPath = fileURLToPath(new URL("../subagent/index.ts", import.meta.url));
  function ensureControl() {
    if (!control) control = createSubagentControl(pi, subagentExtensionPath);
    return control;
  }

  pi.on("session_shutdown", async () => {
    if (control) { await control.shutdown(); control = null; }
  });

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
          details: undefined,
          isError: true,
        };
      }

      // 3. Check dependencies
      const blockReason = checkIssueReadiness(issueContext);
      if (blockReason) {
        return {
          content: [{ type: "text" as const, text: `Review fixer blocked: ${blockReason}` }],
          details: undefined,
          isError: true,
        };
      }

      // 4. Snapshot git status before
      let statusBefore = "";
      try {
        statusBefore = execFileSync("git", ["status", "--porcelain"], { cwd: ctx.cwd, encoding: "utf-8" });
      } catch { /* ignore */ }

      // 5. Run through the same synchronous subagent delegate path as delegate_agent
      const prompt = buildChildPrompt(issueContext, ctx.cwd);
      const delegate = await ensureControl().delegate({
        task_name: `review-fixer-${issueContext.number}`,
        message: prompt,
        model: settings.model ? `${settings.model.provider}/${settings.model.modelId}` : undefined,
        reasoning_effort: settings.reasoningEffort,
        role: "review-fixer",
        nickname: `review-fixer #${issueContext.number}`,
        fork_turns: "none",
        authority: { mode: "edit" },
        result_contract: "free_text",
        roi_category: "fresh_review",
        justification: "Synchronous issue-scoped thermo-nuclear code quality review before PR creation.",
        cost_intent: "expensive",
      }, ctx);
      const result = extractReviewFixerResult(delegate.final_result);
      const contractError = result
        ? undefined
        : delegate.status === "errored"
          ? `subagent status: ${delegate.status}`
          : `structured result missing: child Pi did not return valid review-fixer.result.v1 JSON. Raw output length: ${(delegate.final_result ?? "").length} chars. This is a FAILURE — do not treat as success.`;

      // 6. Snapshot git status after
      let statusAfter = "";
      try {
        statusAfter = execFileSync("git", ["status", "--porcelain"], { cwd: ctx.cwd, encoding: "utf-8" });
      } catch { /* ignore */ }

      // 7. Build response
      if (!result) {
        const reason = contractError ?? "structured result missing: child Pi did not return valid review-fixer.result.v1 JSON.";
        return {
          content: [{
            type: "text" as const,
            text: [
              `## Review Fixer FAILED for Issue #${issueContext.number}`,
              "",
              `**Status**: ❌ FAILED — ${reason}`,
              `**Subagent status**: ${delegate.status}`,
              "",
              "This is a contract violation. The child Pi must output review-fixer.result.v1 JSON.",
              "Do NOT proceed with commit / push / PR creation. Re-run review_fixer or investigate the failure.",
            ].join("\n"),
          }],
          details: {
            issue: { number: issueContext.number, title: issueContext.title, url: issueContext.url },
            childResult: null,
            subagent: { agent_id: delegate.agent_id, task_name: delegate.task_name, status: delegate.status },
            rawOutputLength: (delegate.final_result ?? "").length,
            statusBefore: statusBefore.trim(),
            statusAfter: statusAfter.trim(),
          },
          isError: true,
        };
      }

      // Compute actual changed files from diff
      const beforeFiles = new Set(statusBefore.split("\n").filter(Boolean).map((l) => l.slice(3)));
      const afterFiles = new Set(statusAfter.split("\n").filter(Boolean).map((l) => l.slice(3)));
      const newChangedFiles = [...afterFiles].filter((f) => !beforeFiles.has(f));

      const effectiveChangedFiles = newChangedFiles;

      const details: Record<string, unknown> = {
        issue: { number: issueContext.number, title: issueContext.title, url: issueContext.url },
        childResult: result,
        subagent: { agent_id: delegate.agent_id, task_name: delegate.task_name, status: delegate.status },
        changedFiles: effectiveChangedFiles,
        statusBefore: statusBefore.trim(),
        statusAfter: statusAfter.trim(),
      };

      // Format human-readable summary (result is guaranteed non-null here)
      const summaryLines: string[] = [];
      summaryLines.push(`## Review Fixer Result for Issue #${issueContext.number}`);
      summaryLines.push("");

      summaryLines.push(`**Status**: ${result.status}`);
      summaryLines.push(`**Findings**: ${result.findings.length} (${result.findings.filter((f) => f.severity === "blocker").length} blockers, ${result.findings.filter((f) => f.severity === "major").length} major, ${result.findings.filter((f) => f.severity === "minor").length} minor)`);
      summaryLines.push(`**Files changed**: ${result.changes.files_changed.length > 0 ? result.changes.files_changed.join(", ") : "none"}`);
      summaryLines.push(`**Structural changes**: ${result.changes.structural_changes.length > 0 ? result.changes.structural_changes.join("; ") : "none"}`);
      summaryLines.push(`**Behavior changes**: ${result.changes.behavior_changes.length > 0 ? result.changes.behavior_changes.join("; ") : "none"}`);
      summaryLines.push(`**Tests modified**: ${result.changes.tests_added_or_modified.length > 0 ? result.changes.tests_added_or_modified.join(", ") : "none"}`);
      summaryLines.push(`**Verification**: ${result.verification.all_passed ? "✅ All passed" : "❌ Some failed"} (${result.verification.commands_run.length} commands)`);
      summaryLines.push(`**Remaining risks**: ${result.remaining_risks.length > 0 ? result.remaining_risks.join("; ") : "none"}`);
      summaryLines.push(`**Next steps**: ${result.parent_next_steps}`);

      if (effectiveChangedFiles.length > 0) {
        summaryLines.push("");
        summaryLines.push(`**New workspace changes**: ${effectiveChangedFiles.join(", ")}`);
      }

      const reviewFailed = result.status === "failed" || !result.verification.all_passed;

      return {
        content: [{ type: "text" as const, text: summaryLines.join("\n") }],
        details,
        isError: reviewFailed,
      };
    },
  });
}
