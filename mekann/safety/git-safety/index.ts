import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type GitSafetyMatch = {
	label: string;
	reason: string;
	severity: number;
};

type GitSafetyRule = GitSafetyMatch & { pattern: RegExp };

function commandPrefix(tool: "git" | "gh"): string {
	return `(?:^|[\\s;&|()])(?:command\\s+|env\\s+[^;&|]*?\\s+)?${tool}(?:\\s+-C\\s+\\S+|\\s+--repo\\s+\\S+|\\s+--no-pager)*\\s+`;
}

const GIT = commandPrefix("git");
const GH = commandPrefix("gh");

const MUTATING_PATTERNS: GitSafetyRule[] = [
	{ pattern: new RegExp(`${GIT}push\\b[^\\n;&|]*(?:\\s--force\\b|\\s-f\\b|\\s--force-with-lease\\b)`, "i"), label: "git force push", reason: "force push can rewrite remote history", severity: 100 },
	{ pattern: new RegExp(`${GIT}reset\\s+--hard\\b`, "i"), label: "git reset --hard", reason: "hard reset discards local work", severity: 90 },
	{ pattern: new RegExp(`${GIT}clean\\b(?=[^\\n;&|]*(?:\\s-[A-Za-z]*f[A-Za-z]*\\b|\\s--force\\b))`, "i"), label: "git clean", reason: "git clean can delete untracked files", severity: 90 },
	{ pattern: new RegExp(`${GIT}branch\\s+-D\\b`, "i"), label: "git branch -D", reason: "forced branch deletion can remove local work", severity: 80 },
	{ pattern: new RegExp(`${GIT}rebase\\b`, "i"), label: "git rebase", reason: "rebase rewrites local history", severity: 80 },
	{ pattern: new RegExp(`${GIT}config\\b(?![^\\n;&|]*(?:\\s--get\\b|\\s--get-regexp\\b|\\s--list\\b|\\s-l\\b))`, "i"), label: "git config mutation", reason: "git config can rewrite repository-local settings such as user.email or core.bare", severity: 80 },
	{ pattern: new RegExp(`${GIT}push\\b`, "i"), label: "git push", reason: "remote branch publication requires explicit user permission", severity: 70 },
	{ pattern: new RegExp(`${GH}pr\\s+(?:merge|close|ready)\\b`, "i"), label: "GitHub PR mutation", reason: "PR merge/close/ready changes remote collaboration state", severity: 80 },
	{ pattern: new RegExp(`${GH}pr\\s+review\\b[^\\n;&|]*\\s--approve\\b`, "i"), label: "GitHub PR approval", reason: "approving a PR changes remote collaboration state", severity: 80 },
	{ pattern: new RegExp(`${GH}issue\\s+close\\b`, "i"), label: "GitHub issue close", reason: "closing an issue changes remote project state", severity: 70 },
	{ pattern: new RegExp(`${GH}pr\\s+create\\b`, "i"), label: "GitHub PR create", reason: "creating a PR changes remote project state", severity: 70 },
	{ pattern: new RegExp(`${GH}issue\\s+create\\b`, "i"), label: "GitHub issue create", reason: "creating an issue changes remote project state", severity: 70 },
];

export function classifyGitSafetyCommand(command: string): GitSafetyMatch | undefined {
	return MUTATING_PATTERNS
		.filter(({ pattern }) => pattern.test(command))
		.sort((a, b) => b.severity - a.severity)[0];
}

export default function gitSafetyExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const command = String(((event.input ?? {}) as Record<string, unknown>).command ?? "");
		const match = classifyGitSafetyCommand(command);
		if (!match) return;

		const ok = await ctx.ui.confirm(
			"Git safety confirmation",
			`Allow ${match.label}?\n\n${match.reason}\n\nCommand:\n${command}`,
		);
		if (!ok) return { block: true, reason: `Blocked by Mekann git safety: ${match.reason}` };
	});
}
