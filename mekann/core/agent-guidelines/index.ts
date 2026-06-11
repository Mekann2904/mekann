import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPromptProvider } from "../prompt-core/index.js";

const SYSTEM_PROMPT_EXTRA = `

Additional coding-agent guidelines:
- Make the smallest correct change; avoid unrelated refactors or formatting churn.
- Protect user work: never discard unrelated changes; stop on unexpected concurrent edits.
- Verify honestly: run relevant checks when practical and report exactly what ran.
- Prefer \`rg\`/\`rg --files\` for search.
- For reviews, lead with findings by severity and include file/line references.
`;

const PROACTIVE_REVIEW_EXTRA = `

Proactive code review policy:
- After completing a non-trivial implementation or when the user seems to want a review, actively propose running the thermo-nuclear-code-quality-review skill.
- Even if the user has not explicitly asked for a review, if the change's importance or complexity makes a review beneficial, run the review yourself or recommend the skill.
- When you judge that a review would add value, do not wait for the user to ask — suggest it proactively.
`;

const GIT_SAFETY_EXTRA = `

Git safety policy — require explicit user instruction before executing:
- Never push (including force push) unless the user explicitly asks you to.
- Never create, merge, close, or approve a PR unless the user explicitly asks you to.
- Never create or close a GitHub issue unless the user explicitly asks you to.
- Never run destructive local operations (git reset --hard, git clean -f, git branch -D, git rebase) unless the user explicitly asks you to.
- Never delete a remote branch unless the user explicitly asks you to.
- If you believe one of these actions would be appropriate, suggest it and wait for the user to confirm before executing.
`;

const GITHUB_LINKS_EXTRA = `

GitHub link policy:
- Whenever you reference a GitHub issue, PR, commit, branch, or release, always include the full URL (e.g. https://github.com/owner/repo/issues/42, https://github.com/owner/repo/pull/13, https://github.com/owner/repo/commit/abc123).
- Do not write only short identifiers like "#42" or "PR 13" — always provide the clickable URL alongside or instead of the short form.
- After creating an issue or PR, report the URL immediately so the user can open it directly.
- After pushing a commit or branch, provide the commit URL or compare URL.
- Before creating a new issue, always check open issues first to avoid duplicates or conflicts. Use \`gh issue list --state open\` or search existing issues. If a similar or overlapping issue already exists, reference it or suggest updating it instead of creating a new one.
`;

const PR_WORKFLOW_EXTRA = `

PR workflow routing policy:
- Prefer Mekann PR runtime flows such as \`/pr-check\` over manual ad-hoc PR mergeability procedures when available.
- If a runtime flow reports that a PR is blocked, conflicted, dirty, or unknown, handle only safe follow-up work and defer force push, merge, close, approval, or destructive git decisions to explicit user permission.
`;

export default function agentGuidelinesExtension(_pi: ExtensionAPI): void {
	registerPromptProvider({
		id: "agent-guidelines",
		getFragments() {
			return [{
				id: "agent-guidelines:system-prompt-extra",
				source: "agent-guidelines",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 100,
				version: "v1",
				cacheIntent: "prefer_cache",
				metadata: { volatileTermsArePolicyReferences: true },
				content: SYSTEM_PROMPT_EXTRA,
			}];
		},
	});

	registerPromptProvider({
		id: "proactive-review",
		getFragments() {
			return [{
				id: "proactive-review:coding_guidelines",
				source: "proactive-review",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 110,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: PROACTIVE_REVIEW_EXTRA,
			}];
		},
	});

	registerPromptProvider({
		id: "github-links",
		getFragments() {
			return [{
				id: "github-links:coding_guidelines",
				source: "github-links",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 130,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: GITHUB_LINKS_EXTRA,
			}];
		},
	});

	registerPromptProvider({
		id: "pr-workflow",
		getFragments() {
			return [{
				id: "pr-workflow:coding_guidelines",
				source: "pr-workflow",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 135,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: PR_WORKFLOW_EXTRA,
			}];
		},
	});

	registerPromptProvider({
		id: "git-safety",
		getFragments() {
			return [{
				id: "git-safety:coding_guidelines",
				source: "git-safety",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 140,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: GIT_SAFETY_EXTRA,
			}];
		},
	});
}
