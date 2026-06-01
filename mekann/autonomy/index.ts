import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureRawConfig, isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

export default async function autonomySuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-autonomy", async () => {
		const autoresearchEnabled = featureRawConfig("autoresearch").enabled === true;
		const [goalModule, subagentModule, autoresearchModule] = await profileStartupStep("autonomy-imports", () => Promise.all([
			isFeatureEnabled("goal") ? profileStartupStep("import:autonomy/goal", () => import("./goal/index.js")) : undefined,
			isFeatureEnabled("subagent") ? profileStartupStep("import:autonomy/subagent", () => import("./subagent/index.js")) : undefined,
			autoresearchEnabled ? profileStartupStep("import:autonomy/autoresearch", () => import("./autoresearch/index.js")) : undefined,
		]));
		const goal = goalModule?.default;
		const subagent = subagentModule?.default;
		const autoresearch = autoresearchModule?.default;
		if (goal) await goal(pi);
		if (subagent) await subagent(pi);
		if (autoresearch) await autoresearch(pi);
	});
}
