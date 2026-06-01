import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { profileStartupStep } from "../startupProfile.js";

export default async function coreSuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-core", async () => {
		const [cacheFriendlyPrompt, agentGuidelines, modelOptimizer] = await profileStartupStep("core-imports", () => Promise.all([
			profileStartupStep("import:core/cache-friendly-prompt", () => import("./cache-friendly-prompt/index.js")),
			profileStartupStep("import:core/agent-guidelines", () => import("./agent-guidelines/index.js")),
			profileStartupStep("import:core/model-optimizer", () => import("./model-optimizer/index.js")),
		]));
		cacheFriendlyPrompt.default(pi);
		agentGuidelines.default(pi);
		modelOptimizer.default(pi);
	});
}
