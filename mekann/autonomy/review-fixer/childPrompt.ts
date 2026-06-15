/**
 * Build the child Pi prompt for review-fixer mode.
 *
 * Keep this intentionally small: the child Pi should load and run the existing
 * thermo-nuclear-code-quality-review skill through Pi's normal skill expansion
 * path, instead of receiving a bespoke embedded variant of that skill.
 */

import type { ResolvedIssueContext } from "./issueContext.js";

export interface ChildPromptOptions {
  maxFixRetries: number;
}

export function buildChildPrompt(issueContext: ResolvedIssueContext, _cwd: string, options: ChildPromptOptions): string {
  return [
    "/skill:thermo-nuclear-code-quality-review",
    "",
    "Issue worktree の current branch changes をレビューしてください。",
    "既存の thermo-nuclear-code-quality-review skill の手順・出力形式・判断基準に従ってください。",
    "必要な修正があれば、この workspace に直接 edit してください。",
    `verification が失敗した場合は、最大 ${options.maxFixRetries} 回まで修正と再検証を試みてください。`,
    "commit / push / PR 作成は行わないでください。",
    "subagent を起動せず、この child Pi 自身で完結してください。",
    "review_fixer tool を呼び出さないでください（再帰呼び出しを防ぐため）。",
    "最後に、実施した review、修正、検証、残リスクを日本語で簡潔に報告してください。",
    "",
    "## Issue Context",
    "",
    `- Issue: #${issueContext.number} — ${issueContext.title}`,
    `- URL: ${issueContext.url}`,
    `- Labels: ${issueContext.labels.join(", ") || "(none)"}`,
    "",
    "### Issue Body",
    "",
    issueContext.body || "(no body)",
  ].join("\n");
}
