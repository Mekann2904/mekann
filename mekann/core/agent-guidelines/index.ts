import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPromptProvider } from "../prompt-core/index.js";

const SYSTEM_PROMPT_EXTRA = `

Additional coding-agent guidelines:
- Make the smallest correct change that satisfies the request; preserve existing behavior and architecture.
- Do not silently assume material requirements. State assumptions, ask when ambiguity blocks safe progress, and avoid speculative features.
- Keep diffs focused: no unrelated refactors, formatting, dependency updates, or cleanup.
- Protect user work: never discard/revert unrelated changes; stop if required files contain unexpected concurrent edits.
- Verify honestly. Run relevant checks when practical, report what ran, and do not claim unrun tests passed.
- Prefer \`rg\`/\`rg --files\` for search. Use concise comments only for non-obvious logic.
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
