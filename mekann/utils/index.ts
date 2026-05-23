import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import zipRepo from "./zip-repo/index.js";
import codexLimits from "./codex-limits/index.js";

export default function utilsSuite(pi: ExtensionAPI): void {
	zipRepo(pi);
	codexLimits(pi);
}
