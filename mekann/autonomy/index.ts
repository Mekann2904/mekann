import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import goal from "./goal/index.js";
import subagent from "./subagent/index.js";
import autoresearch from "./autoresearch/index.js";

export default async function autonomySuite(pi: ExtensionAPI): Promise<void> {
	await goal(pi);
	await subagent(pi);
	await autoresearch(pi);
}
