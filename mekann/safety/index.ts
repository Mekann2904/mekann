import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import sandbox from "./sandbox/index.js";
import modes from "./modes/index.js";

export default function safetySuite(pi: ExtensionAPI): void {
	if (isFeatureEnabled("sandbox")) sandbox(pi);
	if (isFeatureEnabled("modes")) modes(pi);
}
