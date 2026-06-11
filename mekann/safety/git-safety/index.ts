import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type GitSafetyMatch = {
	label: string;
	reason: string;
};

const MUTATING_PATTERNS: Array<{ pattern: RegExp; label: string; reason: string }> = [
	{ pattern: /\bgit\s+push\b/i, label: "git push", reason: "remote branch publication requires explicit user permission" },
	{ pattern: /\bgit\s+push\b[^\n;&|]*\s(?:--force|-f|--force-with-lease)\b/i, label: "git force push", reason: "force push can rewrite remote history" },
	{ pattern: /\bgit\s+reset\s+--hard\b/i, label: "git reset --hard", reason: "hard reset discards local work" },
	{ pattern: /\bgit\s+clean\b(?=[^\n;&|]*(?:\s-[A-Za-z]*f[A-Za-z]*\b|\s--force\b))/i, label: "git clean", reason: "git clean can delete untracked files" },
	{ pattern: /\bgit\s+branch\s+-D\b/i, label: "git branch -D", reason: "forced branch deletion can remove local work" },
	{ pattern: /\bgit\s+rebase\b/i, label: "git rebase", reason: "rebase rewrites local history" },
	{ pattern: /\bgh\s+pr\s+(?:merge|close|ready|review\b[^\n;&|]*\s--approve\b)\b/i, label: "GitHub PR mutation", reason: "PR merge/close/ready/approval changes remote collaboration state" },
	{ pattern: /\bgh\s+issue\s+close\b/i, label: "GitHub issue close", reason: "closing an issue changes remote project state" },
	{ pattern: /\bgh\s+pr\s+create\b/i, label: "GitHub PR create", reason: "creating a PR changes remote project state" },
	{ pattern: /\bgh\s+issue\s+create\b/i, label: "GitHub issue create", reason: "creating an issue changes remote project state" },
];

export function classifyGitSafetyCommand(command: string): GitSafetyMatch | undefined {
	return MUTATING_PATTERNS.find(({ pattern }) => pattern.test(command));
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
