import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { profileStartupStep } from "./startupProfile.js";

export default async function mekannExtension(pi: ExtensionAPI): Promise<void> {
	const [{ default: context }, { default: core }, { default: safety }, { default: autonomy }, { default: utils }] = await profileStartupStep("suite-imports", () => Promise.all([
		import("./context/index.js"),
		import("./core/index.js"),
		import("./safety/index.js"),
		import("./autonomy/index.js"),
		import("./utils/index.js"),
	]));

	// Context tracking is instrumentation for the rest of Mekann. Register the
	// context suite first so its monitoring hooks and schema accounting can observe
	// subsequent suite/tool registration.
	await context(pi);
	await core(pi);
	await safety(pi);
	await autonomy(pi);
	await utils(pi);
}
