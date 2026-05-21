import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import outputGate from "./output-gate/index.js";

export default async function context(pi: ExtensionAPI): Promise<void> {
	outputGate(pi);
}
