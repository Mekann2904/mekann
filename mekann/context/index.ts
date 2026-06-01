import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

export default async function context(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-context", async () => {
		const modules = await profileStartupStep("context-imports", () => Promise.all([
			isFeatureEnabled("output-gate") ? profileStartupStep("import:context/output-gate", () => import("./output-gate/index.js")) : undefined,
			isFeatureEnabled("context-ledger") ? profileStartupStep("import:context/ledger", () => import("./ledger/index.js")) : undefined,
			isFeatureEnabled("context-tracker") ? profileStartupStep("import:context/context-tracker", () => import("./context-tracker/index.js")) : undefined,
			isFeatureEnabled("cacheable-context") ? profileStartupStep("import:context/cacheable-context", () => import("./cacheable-context/index.js")) : undefined,
		]));
		modules[0]?.default(pi);
		modules[1]?.default(pi);
		modules[2]?.default(pi);
		modules[3]?.default(pi);
	});
}
