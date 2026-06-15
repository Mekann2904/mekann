/**
 * issue_workflow Extension — single structured tool for git/gh workflow actions.
 *
 * Phase 3 of issue work (status → diff → commit → push → create_pr) goes through
 * this tool instead of the bash tool. Messages/bodies are passed via temp files
 * (`git commit -F` / `gh pr create --body-file`), so they survive shell-special
 * characters verbatim and never trigger git-safety's bash confirmation gate.
 *
 * Tool: issue_workflow
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { rm, writeFile } from "node:fs/promises";
import { isFeatureEnabled } from "../../settings/enabled.js";
import { IssueWorkflowParamsSchema, type IssueWorkflowParams } from "./schemas.js";
import { executeAction, validateActionArgs, type CommandRunner, type ExecOut } from "./actions.js";

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 20 * 1024 * 1024;

/**
 * Real CommandRunner: invokes git/gh via execFile (not the bash tool, so
 * git-safety does not intercept), and writes messages to temp files that are
 * removed after use.
 */
function createRunner(): CommandRunner {
	return {
		async git(args, cwd): Promise<ExecOut> {
			const r = await execFileAsync("git", args, { cwd, maxBuffer: MAX_BUFFER });
			return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
		},
		async gh(args, cwd): Promise<ExecOut> {
			const r = await execFileAsync("gh", args, { cwd, maxBuffer: MAX_BUFFER });
			return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
		},
		async withTempFile(content, use) {
			const filePath = join(tmpdir(), `issue-workflow-${process.pid}-${randomUUID()}.txt`);
			await writeFile(filePath, content, "utf8");
			try {
				return await use(filePath);
			} finally {
				await rm(filePath, { force: true }).catch(() => {
					/* best-effort cleanup */
				});
			}
		},
	};
}

export default function issueWorkflowExtension(pi: ExtensionAPI): void {
	if (!isFeatureEnabled("issue-workflow")) return;

	pi.registerTool({
		name: "issue_workflow",
		label: "Issue workflow (git/gh actions)",
		description:
			"Run git/gh workflow actions for issue worktrees: current_branch, status, diff, view_pr, commit, push, create_pr, update_pr, ready, comment, issue_comment. " +
			"Messages and bodies are passed via temp files (-F / --body-file) so $, backticks, newlines, and code blocks survive verbatim and bypass git-safety's bash confirmation. " +
			"Mutating actions only run inside an issue worktree (branch issue-<number>).",
		promptSnippet:
			"Run git/gh workflow actions (status, diff, commit, push, create_pr) for the issue worktree without shell-quoting issues or git-safety confirmation",
		promptGuidelines: [
			"Use issue_workflow for Phase 3 of issue work: status → diff → commit → push → create_pr. Do NOT run git/gh through the bash tool — git-safety intercepts bash mutating git/gh and commit/PR messages get mangled by shell expansion of $, backticks, newlines, and code blocks.",
			"issue_workflow writes message/body to a temp file and passes it via -F / --body-file, so commit messages and PR bodies survive shell-special characters verbatim.",
			"Mutating actions (commit, push, create_pr, update_pr, ready, comment, issue_comment) only run inside an issue worktree (branch issue-<number>) and are auto-approved there. Read-only actions (current_branch, status, diff, view_pr) work anywhere.",
			"create_pr should produce a ready (non-draft) PR — review_fixer has already gated implementation quality.",
		],
		parameters: IssueWorkflowParamsSchema,
		prepareArguments(args: unknown): IssueWorkflowParams {
			const params = (args ?? {}) as Partial<IssueWorkflowParams>;
			const error = validateActionArgs(params);
			if (error) throw new Error(error);
			return params as IssueWorkflowParams;
		},
		async execute(_id, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const runner = createRunner();
			const result = await executeAction(params, ctx.cwd, runner);
			return {
				content: [{ type: "text" as const, text: result.text }],
				details: result.details,
				isError: result.isError,
			};
		},
	});
}
