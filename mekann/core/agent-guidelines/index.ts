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

Proactive review routing policy:
- Prefer Mekann runtime review-quality detection such as \`/review-quality\` for diff-size based review prompts; still use judgment to recommend deeper review when risk is semantic rather than mechanical.
`;

const GIT_SAFETY_EXTRA = `

Git safety routing policy:
- Use Mekann runtime confirmation flows for remote GitHub mutations, push/force-push, and destructive local git operations; if a needed action is blocked or not covered by runtime policy, ask for explicit user permission first.
`;

const GITHUB_LINKS_EXTRA = `

GitHub link policy:
- Whenever you reference a GitHub issue, PR, commit, branch, or release, always include the full URL (e.g. https://github.com/owner/repo/issues/42, https://github.com/owner/repo/pull/13, https://github.com/owner/repo/commit/abc123).
- Do not write only short identifiers like "#42" or "PR 13" — always provide the clickable URL alongside or instead of the short form.
- After creating an issue or PR, report the URL immediately so the user can open it directly.
- After pushing a commit or branch, provide the commit URL or compare URL.
- Before creating a new issue, always check open issues first to avoid duplicates or conflicts. Use \`gh issue list --state open\` or search existing issues. If a similar or overlapping issue already exists, reference it or suggest updating it instead of creating a new one.
`;

const ISSUE_CREATION_EXTRA = `

Issue creation routing policy:
- When the user asks to create an issue (or issues), load the matching issue skill via read(SKILL.md) and follow its process instead of drafting issues ad hoc:
  - \`to-prd\` — the request is a large feature or epic that needs a PRD synthesised from the current conversation context (no user interview; it infers modules and user stories itself).
  - \`to-issues\` — the request is a plan, spec, or PRD to break into independently-grabbable tracer-bullet vertical slices, published as multiple linked issues in dependency order.
  - \`triage\` — the request is a single issue to create or triage, an incoming bug/feature request to classify through the state roles, or preparing an issue for a coding agent (with an agent brief).
- If the intent is ambiguous, ask which outcome is wanted (a single triaged issue / multiple sliced issues / a PRD) before creating anything.
- All three skills are \`disable-model-invocation: true\`, so explicit load via this policy is the required trigger; do not wait for automatic invocation.
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
		id: "issue-creation",
		getFragments() {
			return [{
				id: "issue-creation:coding_guidelines",
				source: "issue-creation",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 132,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: ISSUE_CREATION_EXTRA,
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
