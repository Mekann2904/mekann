import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isFeatureEnabled } from "../settings/enabled.js";
import goal from "./goal/index.js";
import subagent from "./subagent/index.js";
import autoresearch from "./autoresearch/index.js";

export default async function autonomySuite(pi: ExtensionAPI): Promise<void> {
	if (isFeatureEnabled("goal")) await goal(pi);
	if (isFeatureEnabled("subagent")) await subagent(pi);
	if (isFeatureEnabled("autoresearch")) await autoresearch(pi);
}
