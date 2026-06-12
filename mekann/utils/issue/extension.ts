import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { launchExternalUi } from "../terminal/launch.js";
import { getRepoInfo, listExistingWorktrees, parseIssueNumberFromBranch, removeWorktree } from "./worktree.js";
import { createIssue, getIssueStatus, searchOpenIssues } from "./github.js";

function checkPrerequisites(ctx: ExtensionContext): string | null {
	if (!process.env.KITTY_WINDOW_ID) return "Kitty terminal is required for /issue.";
	try {
		execFileSync("gh", ["--version"], { encoding: "utf-8", timeout: 3000 });
	} catch {
		return "`gh` CLI is required. Install with: brew install gh";
	}
	if (!getRepoInfo(ctx.cwd)) return "Not inside a git repository.";
	return null;
}

export default function issueWorktree(pi: ExtensionAPI): void {
	pi.registerCommand("issue", {
		description: "Open a GitHub issue worktree in a new Pi split.",
		handler: async (args, ctx) => {
			const input = (args ?? "").trim();

			if (input !== "") {
				ctx.ui.notify("Usage: /issue. Use /clean-issue-worktrees to remove closed issue worktrees.", "warning");
				return;
			}

			const error = checkPrerequisites(ctx);
			if (error) {
				ctx.ui.notify(error, "error");
				return;
			}

			// Launch the interactive issue list CLI in a Kitty split.
			// The CLI handles: list → select → create worktree → open pi → close list.
			const cliPath = new URL("./cli.ts", import.meta.url).pathname;
			// Pass the current Pi runtime so the nested session does not pick up an incompatible node from shell PATH.
			const envVar = `MEKANN_NODE_BIN=${JSON.stringify(process.execPath)}`;
			const result = await launchExternalUi({
				cwd: ctx.cwd,
				title: "Issues",
				copyEnv: true,
				matchCurrentWindow: true,
				action: { mode: "shell", command: `${envVar} bun ${JSON.stringify(cliPath)}` },
			});

			if (!result.ok) {
				ctx.ui.notify(`Failed to open issue list: ${result.reason ?? "unknown"}`, "error");
			}
		},
	});

	pi.registerCommand("issue-create", {
		description: "Create a GitHub issue after searching for open duplicates.",
		handler: async (args, ctx) => {
			await handleIssueCreate(args, ctx);
		},
	});

	pi.registerCommand("clean-issue-worktrees", {
		description: "Remove issue worktrees whose GitHub issues are closed.",
		handler: async (_args, ctx) => {
			await handleCleanup(ctx);
		},
	});
}

function parseIssueCreateArgs(args: string): { title: string; body: string } | null {
	const trimmed = (args ?? "").trim();
	if (!trimmed) return null;
	const [titlePart, ...bodyParts] = trimmed.split(/\n\n+/);
	return { title: titlePart.trim(), body: bodyParts.join("\n\n").trim() || titlePart.trim() };
}

async function handleIssueCreate(args: string, ctx: ExtensionContext): Promise<void> {
	const repoInfo = getRepoInfo(ctx.cwd);
	if (!repoInfo) { ctx.ui.notify("Not inside a git repository.", "error"); return; }

	const parsed = parseIssueCreateArgs(args);
	if (!parsed) {
		ctx.ui.notify("Usage: /issue-create <title> followed optionally by a blank line and body.", "warning");
		return;
	}

	try {
		const duplicates = await searchOpenIssues(repoInfo.remote, parsed.title);
		if (duplicates.length > 0) {
			const summary = duplicates.map((issue) => `#${issue.number} ${issue.title}\n${issue.url}`).join("\n\n");
			const ok = await ctx.ui.confirm("Potential duplicate issues found", `Open issues matched this title:\n\n${summary}\n\nCreate a new issue anyway?`);
			if (!ok) { ctx.ui.notify("Issue creation canceled.", "info"); return; }
		} else {
			const ok = await ctx.ui.confirm("Create GitHub issue?", `No open duplicate issues were found. Create this issue?\n\n${parsed.title}`);
			if (!ok) { ctx.ui.notify("Issue creation canceled.", "info"); return; }
		}

		const issue = await createIssue(repoInfo.remote, parsed.title, parsed.body);
		ctx.ui.notify(`Created issue: ${issue.url}`, "info");
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
	}
}

async function handleCleanup(ctx: ExtensionContext): Promise<void> {
	const repoInfo = getRepoInfo(ctx.cwd);
	if (!repoInfo) { ctx.ui.notify("Not inside a git repository.", "error"); return; }

	const existing = listExistingWorktrees(repoInfo.root);
	if (existing.length === 0) { ctx.ui.notify("No issue worktrees found.", "info"); return; }

	const toRemove = [];
	for (const wt of existing) {
		const num = parseIssueNumberFromBranch(wt.branch);
		if (num === null) continue;
		if ((await getIssueStatus(repoInfo.remote, num)) === "closed") toRemove.push(wt);
	}

	if (toRemove.length === 0) { ctx.ui.notify("No closed issue worktrees to clean up.", "info"); return; }

	const names = toRemove.map((wt) => wt.branch).join(", ");
	if (!(await ctx.ui.confirm("Remove closed issue worktrees?", `The following worktrees will be removed:\n${names}`))) {
		ctx.ui.notify("Cleanup canceled.", "info");
		return;
	}

	for (const wt of toRemove) removeWorktree(repoInfo.root, wt);
	ctx.ui.notify(`Removed ${toRemove.length} worktree(s): ${names}`, "info");
}
