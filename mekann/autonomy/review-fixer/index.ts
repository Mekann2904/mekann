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
import { snapshotContentHashes, computeChangedFiles } from "./changedFiles.js";

export function extractReviewFixerResult(output: string | undefined): ReviewFixerResult | null {
  // Legacy helper kept for callers/tests that still parse old structured output.
  // The review_fixer workflow now returns the child Pi's normal skill output.
  if (!output) return null;
  const json = extractJSONWithSchema(output, "review-fixer.result.v1");
  if (!json) return null;
  try { return JSON.parse(json) as ReviewFixerResult; }
  catch { return null; }
}

export default function reviewFixerExtension(pi: ExtensionAPI): void | Promise<void> {
  if (!isFeatureEnabled("review-fixer")) return;

  registerReviewFixerPromptProvider();

  // ── Subagent runtime dependency boundary ──────────────────────────
  //
  // review-fixer reuses the subagent feature's control plane
  // (`createSubagentControl` → `AgentControl.delegate()`) for child Pi
  // lifecycle management. The following subagent settings affect review-fixer:
  //   - display mode (kitty-split / kitty-pi / none)
  //   - extensionPath (child Pi extension loading)
  //   - piCommand, kittenBin, logDir
  //   - maxAgents, maxDepth, maxQueuedSubagents
  //   - defaultReasoningEffort (overridden by review-fixer settings)
  //
  // Review-fixer-specific settings (model, reasoningEffort, maxFixRetries)
  // are resolved in ./settingsLoader.ts and passed explicitly to the
  // delegate call and child prompt.
  // ──────────────────────────────────────────────────────────────────
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

      // 4. Snapshot content hashes before (detects changes to already-dirty files)
      const hashesBefore = snapshotContentHashes(ctx.cwd);
      // Also keep a porcelain snapshot for the details payload
      let statusBefore = "";
      try {
        statusBefore = execFileSync("git", ["status", "--porcelain"], { cwd: ctx.cwd, encoding: "utf-8" });
      } catch { /* ignore */ }

      // 5. Run through the same synchronous subagent delegate path as delegate_agent
      const prompt = buildChildPrompt(issueContext, ctx.cwd, { maxFixRetries: settings.maxFixRetries });
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

      // 6. Snapshot content hashes after
      const hashesAfter = snapshotContentHashes(ctx.cwd);
      let statusAfter = "";
      try {
        statusAfter = execFileSync("git", ["status", "--porcelain"], { cwd: ctx.cwd, encoding: "utf-8" });
      } catch { /* ignore */ }

      // 7. Build response
      if (delegate.status === "errored") {
        return {
          content: [{
            type: "text" as const,
            text: [
              `## Review Fixer FAILED for Issue #${issueContext.number}`,
              "",
              `**Status**: FAILED — subagent status: ${delegate.status}`,
              "Do NOT proceed with commit / push / PR creation. Re-run review_fixer or investigate the failure.",
            ].join("\n"),
          }],
          details: {
            issue: { number: issueContext.number, title: issueContext.title, url: issueContext.url },
            childResult: result,
            subagent: { agent_id: delegate.agent_id, task_name: delegate.task_name, status: delegate.status },
            rawOutputLength: (delegate.final_result ?? "").length,
            statusBefore: statusBefore.trim(),
            statusAfter: statusAfter.trim(),
          },
          isError: true,
        };
      }

      // Compute changed files via content-hash comparison
      // This detects changes to files that were already dirty before the child ran,
      // not just newly-appeared files in git status.
      const effectiveChangedFiles = computeChangedFiles(hashesBefore, hashesAfter);

      const details: Record<string, unknown> = {
        issue: { number: issueContext.number, title: issueContext.title, url: issueContext.url },
        childResult: result,
        subagent: { agent_id: delegate.agent_id, task_name: delegate.task_name, status: delegate.status },
        changedFiles: effectiveChangedFiles,
        statusBefore: statusBefore.trim(),
        statusAfter: statusAfter.trim(),
      };

      const summaryLines: string[] = [];
      summaryLines.push(`## Review Fixer Result for Issue #${issueContext.number}`);
      summaryLines.push("");
      summaryLines.push(`**Subagent status**: ${delegate.status}`);
      summaryLines.push(`**New workspace changes**: ${effectiveChangedFiles.length > 0 ? effectiveChangedFiles.join(", ") : "none"}`);
      summaryLines.push("");
      summaryLines.push("## Child Pi output");
      summaryLines.push("");
      summaryLines.push((delegate.final_result ?? "(no final output)").trim() || "(no final output)");

      return {
        content: [{ type: "text" as const, text: summaryLines.join("\n") }],
        details,
        isError: false,
      };
    },
  });
}
