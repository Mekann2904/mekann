import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";

export default async function autonomySuite(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("goal")) await (await import("./goal/index.js")).default(pi);
	if (isFeatureEnabled("subagent")) await (await import("./subagent/index.js")).default(pi);
	if (isFeatureEnabled("autoresearch")) await (await import("./autoresearch/index.js")).default(pi);
}
