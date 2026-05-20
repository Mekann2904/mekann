import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import cacheFriendlyPrompt from "./cache-friendly-prompt/index.js";
import agentGuidelines from "./agent-guidelines/index.js";

export default function coreSuite(pi: ExtensionAPI): void {
	cacheFriendlyPrompt(pi);
	agentGuidelines(pi);
}
