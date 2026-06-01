import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import outputGate from "./output-gate/index.js";
import contextLedger from "./ledger/index.js";
import contextTracker from "./context-tracker/index.js";

export default async function context(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("output-gate")) outputGate(pi);
	if (isFeatureEnabled("context-ledger")) contextLedger(pi);
	if (isFeatureEnabled("context-tracker")) contextTracker(pi);
}
