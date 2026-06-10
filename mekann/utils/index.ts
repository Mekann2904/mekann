import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import { profileStartupStep } from "../startupProfile.js";

export default async function utilsSuite(pi: ExtensionAPI): Promise<void> {
	await profileStartupStep("suite-utils", async () => {
		const modules = await profileStartupStep("utils-imports", () => Promise.all([
			isFeatureEnabled("zip-repo") ? profileStartupStep("import:utils/zip-repo", () => import("./zip-repo/index.js")) : undefined,
			isFeatureEnabled("codex-limits") ? profileStartupStep("import:utils/codex-limits", () => import("./codex-limits/index.js")) : undefined,
			isFeatureEnabled("codex-web-search") ? profileStartupStep("import:utils/codex-web-search", () => import("./codex-web-search/index.js")) : undefined,
			isFeatureEnabled("dashboard") ? profileStartupStep("import:utils/dashboard", () => import("./dashboard/pi-component.js")) : undefined,
			isFeatureEnabled("terminal-shortcuts") ? profileStartupStep("import:utils/terminal-shortcuts", () => import("./terminal-shortcuts/index.js")) : undefined,
			isFeatureEnabled("settings-editor") ? profileStartupStep("import:utils/settings-editor", () => import("./settings-editor/index.js")) : undefined,
			profileStartupStep("import:utils/startup-clear", () => import("./terminal/startup-clear.js")),
			isFeatureEnabled("issue-worktree") ? profileStartupStep("import:utils/issue", () => import("./issue/extension.js")) : undefined,
		]));
		modules[0]?.default(pi);
		modules[1]?.default(pi);
		modules[2]?.default(pi);
		modules[3]?.default(pi);
		modules[4]?.default(pi);
		modules[5]?.default(pi);
		modules[6].default(pi);
		modules[7]?.default(pi);
	});
}
