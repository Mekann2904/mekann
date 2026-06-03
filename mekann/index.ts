import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { profileStartupStep } from "./startupProfile.js";
import { isFeatureEnabled } from "./settings/enabled.js";
import { observeToolRegistrations } from "./context/tool-registration-observer.js";

export default async function mekannExtension(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("context-tracker")) observeToolRegistrations(pi);

	const [{ default: core }, { default: safety }, { default: autonomy }, { default: utils }, { default: context }, { default: skillSurface }] = await profileStartupStep("suite-imports", () => Promise.all([
		import("./core/index.js"),
		import("./safety/index.js"),
		import("./autonomy/index.js"),
		import("./utils/index.js"),
		import("./context/index.js"),
		import("./skill-surface/index.js"),
	]));

	await core(pi);
	await safety(pi);
	await autonomy(pi);
	await utils(pi);
	await context(pi);
	skillSurface();
}
