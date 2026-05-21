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
}
