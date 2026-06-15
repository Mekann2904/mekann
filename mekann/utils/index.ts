import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

type UtilsModule = { default: (pi: ExtensionAPI) => void | Promise<void> };
type UtilsFeatureLoader = {
	feature: string;
	importLabel: string;
	alwaysEnabled?: boolean;
	load: () => Promise<UtilsModule>;
};

const UTILS_FEATURES: UtilsFeatureLoader[] = [
	{ feature: "zip-repo", importLabel: "import:utils/zip-repo", load: () => import("./zip-repo/index.js") },
	{ feature: "codex-limits", importLabel: "import:utils/codex-limits", load: () => import("./codex-limits/index.js") },
	{ feature: "codex-web-search", importLabel: "import:utils/codex-web-search", load: () => import("./codex-web-search/index.js") },
	{ feature: "dashboard", importLabel: "import:utils/dashboard", load: () => import("./dashboard/pi-component.js") },
	{ feature: "terminal-shortcuts", importLabel: "import:utils/terminal-shortcuts", load: () => import("./terminal-shortcuts/index.js") },
	{ feature: "settings-editor", importLabel: "import:utils/settings-editor", load: () => import("./settings-editor/index.js") },
	{ feature: "startup-clear", importLabel: "import:utils/startup-clear", alwaysEnabled: true, load: () => import("./terminal/startup-clear.js") },
	{ feature: "issue-worktree", importLabel: "import:utils/issue", load: () => import("./issue/extension.js") },
	{ feature: "issue-workflow", importLabel: "import:utils/issue-workflow", load: () => import("./issue-workflow/index.js") },
	{ feature: "voice-notify", importLabel: "import:utils/voice-notify", load: () => import("./voice-notify/index.js") },
	{ feature: "pr-workflow", importLabel: "import:utils/pr-workflow", load: () => import("./pr-workflow/index.js") },
	{ feature: "verify", importLabel: "import:utils/verify", load: () => import("./verify/index.js") },
	{ feature: "review-quality", importLabel: "import:utils/review-quality", load: () => import("./review-quality/index.js") },
];

export default async function utilsSuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-utils", async () => {
		const enabledFeatures = UTILS_FEATURES.filter((feature) => feature.alwaysEnabled || isFeatureEnabled(feature.feature));
		const modules = await profileStartupStep("utils-imports", () => Promise.all(
			enabledFeatures.map((feature) => profileStartupStep(feature.importLabel, feature.load)),
		));
		for (const module of modules) await module.default(pi);
	});
}
