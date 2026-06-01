import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";

export default async function safetySuite(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("sandbox")) (await import("./sandbox/index.js")).default(pi);
	if (isFeatureEnabled("modes")) (await import("./modes/index.js")).default(pi);
}
