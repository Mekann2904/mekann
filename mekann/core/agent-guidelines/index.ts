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
}
