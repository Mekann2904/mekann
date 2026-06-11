import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

export default async function safetySuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-safety", async () => {
		const [sandboxModule, modesModule, gitSafetyModule] = await profileStartupStep("safety-imports", () => Promise.all([
			isFeatureEnabled("sandbox") ? profileStartupStep("import:safety/sandbox", () => import("./sandbox/index.js")) : undefined,
			isFeatureEnabled("modes") ? profileStartupStep("import:safety/modes", () => import("./modes/index.js")) : undefined,
			isFeatureEnabled("git-safety") ? profileStartupStep("import:safety/git-safety", () => import("./git-safety/index.js")) : undefined,
		]));
		const sandbox = sandboxModule?.default;
		const modes = modesModule?.default;
		const gitSafety = gitSafetyModule?.default;
		if (sandbox) sandbox(pi);
		if (modes) modes(pi);
		if (gitSafety) gitSafety(pi);
	});
}
