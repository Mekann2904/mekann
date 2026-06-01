import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";

export default async function context(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("output-gate")) (await import("./output-gate/index.js")).default(pi);
	if (isFeatureEnabled("context-ledger")) (await import("./ledger/index.js")).default(pi);
	if (isFeatureEnabled("context-tracker")) (await import("./context-tracker/index.js")).default(pi);
	if (isFeatureEnabled("cacheable-context")) (await import("./cacheable-context/index.js")).default(pi);
}
