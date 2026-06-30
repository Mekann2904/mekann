/**
 * Build the child Pi prompt for review-fixer mode.
 *
 * Keep this intentionally small: the child Pi should load and run the existing
 * thermo-nuclear-code-quality-review skill through Pi's normal skill expansion
 * path, instead of receiving a bespoke embedded variant of that skill.
 */

import type { ResolvedIssueContext } from "./issueContext.js";
import { REVIEW_FIXER_FALLBACK_SKILL } from "./constants.js";

export interface ChildPromptOptions {
  maxFixRetries: number;
}

export function buildChildPrompt(issueContext: ResolvedIssueContext, _cwd: string, options: ChildPromptOptions): string {
  return [
    `/skill:${REVIEW_FIXER_FALLBACK_SKILL}`,
    "",
    "あなたは review_fixer の child Pi です。Issue workflow の Phase 2（review + fix）だけを実行してください。",
    "Issue worktree の current branch changes をレビューしてください。",
    `既存の ${REVIEW_FIXER_FALLBACK_SKILL} skill の手順・出力形式・判断基準に従ってください。`,
    "必要な修正があれば、この workspace に直接 edit してください。",
    `verification が失敗した場合は、最大 ${options.maxFixRetries} 回まで修正と再検証を試みてください。`,
    "commit / push / PR 作成は行わないでください。Phase 3 は親 Issue Pi が issue_workflow で実行します。",
    "issue_workflow tool を呼び出さないでください。",
    "subagent を起動せず、この child Pi 自身で完結してください。",
    "review_fixer tool を呼び出さないでください（再帰呼び出しを防ぐため）。",
    "最後は必ず review-fixer.result.v1 の JSON オブジェクトだけを返してください。markdown fence や説明文を JSON の外に出してはいけません。",
    "status は changed / no_change / failed のいずれかです。verification.all_passed が false、または必須修正が未完了なら status は failed にしてください。",
    "JSON schema:",
    '{"schema":"review-fixer.result.v1","status":"changed|no_change|failed","issue":{"number":0,"title":"","url":""},"findings":[{"severity":"blocker|major|minor","description":"","file":"optional","line":1,"remediation":"optional","applied":false}],"changes":{"files_changed":[],"structural_changes":[],"behavior_changes":[],"tests_added_or_modified":[]},"verification":{"commands_run":[],"results":[{"command":"","exit_code":0,"passed":true}],"all_passed":true},"remaining_risks":[],"parent_next_steps":""}',
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
