import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import zipRepo from "./zip-repo/index.js";
import codexLimits from "./codex-limits/index.js";
import codexWebSearch from "./codex-web-search/index.js";
import dashboard from "./dashboard/pi-component.js";
import terminalShortcuts from "./terminal-shortcuts/index.js";
import settingsEditor from "./settings-editor/index.js";

export default function utilsSuite(pi: ExtensionAPI): void {
	zipRepo(pi);
	codexLimits(pi);
	codexWebSearch(pi);
	dashboard(pi);
	terminalShortcuts(pi);
	settingsEditor(pi);
}
