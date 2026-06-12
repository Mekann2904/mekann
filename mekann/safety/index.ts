import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

export default async function safetySuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-safety", async () => {
		const [sandboxModule, modesModule] = await profileStartupStep("safety-imports", () => Promise.all([
			isFeatureEnabled("sandbox") ? profileStartupStep("import:safety/sandbox", () => import("./sandbox/index.js")) : undefined,
			isFeatureEnabled("modes") ? profileStartupStep("import:safety/modes", () => import("./modes/index.js")) : undefined,
		]));
		const sandbox = sandboxModule?.default;
		const modes = modesModule?.default;
		if (sandbox) sandbox(pi);
		if (modes) modes(pi);
	});
}
