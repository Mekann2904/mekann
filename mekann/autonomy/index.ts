import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureRawConfig, isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

function isExplicitlyEnabled(feature: string): boolean {
	return featureRawConfig(feature).enabled === true;
}

export default async function autonomySuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-autonomy", async () => {
		const [goalModule, subagentModule, reviewFixerModule, autoresearchModule] = await profileStartupStep("autonomy-imports", () => Promise.all([
			isFeatureEnabled("goal") ? profileStartupStep("import:autonomy/goal", () => import("./goal/index.js")) : undefined,
			(isFeatureEnabled("subagent") || isFeatureEnabled("review-fixer")) ? profileStartupStep("import:autonomy/subagent", () => import("./subagent/index.js")) : undefined,
			isFeatureEnabled("review-fixer") ? profileStartupStep("import:autonomy/review-fixer", () => import("./review-fixer/index.js")) : undefined,
			isExplicitlyEnabled("autoresearch") ? profileStartupStep("import:autonomy/autoresearch", () => import("./autoresearch/index.js")) : undefined,
		]));
		const goal = goalModule?.default;
		const subagent = subagentModule?.default;
		const reviewFixer = reviewFixerModule?.default;
		const autoresearch = autoresearchModule?.default;
		if (goal) await goal(pi);
		if (subagent) await subagent(pi);
		if (reviewFixer) await reviewFixer(pi);
		if (autoresearch) await autoresearch(pi);
	});
}
