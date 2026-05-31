import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import zipRepo from "./zip-repo/index.js";
import codexLimits from "./codex-limits/index.js";
import codexWebSearch from "./codex-web-search/index.js";
import dashboard from "./dashboard/pi-component.js";
import terminalShortcuts from "./terminal-shortcuts/index.js";
import settingsEditor from "./settings-editor/index.js";
import startupClear from "./terminal/startup-clear.js";

export default function utilsSuite(pi: ExtensionAPI): void {
	if (isFeatureEnabled("zip-repo")) zipRepo(pi);
	if (isFeatureEnabled("codex-limits")) codexLimits(pi);
	if (isFeatureEnabled("codex-web-search")) codexWebSearch(pi);
	if (isFeatureEnabled("dashboard")) dashboard(pi);
	if (isFeatureEnabled("terminal-shortcuts")) terminalShortcuts(pi);
	if (isFeatureEnabled("settings-editor")) settingsEditor(pi);
	startupClear(pi);
}
