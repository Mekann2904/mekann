import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";

export default async function utilsSuite(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("zip-repo")) (await import("./zip-repo/index.js")).default(pi);
	if (isFeatureEnabled("codex-limits")) (await import("./codex-limits/index.js")).default(pi);
	if (isFeatureEnabled("codex-web-search")) (await import("./codex-web-search/index.js")).default(pi);
	if (isFeatureEnabled("dashboard")) (await import("./dashboard/pi-component.js")).default(pi);
	if (isFeatureEnabled("terminal-shortcuts")) (await import("./terminal-shortcuts/index.js")).default(pi);
	if (isFeatureEnabled("settings-editor")) (await import("./settings-editor/index.js")).default(pi);
	(await import("./terminal/startup-clear.js")).default(pi);
}
