import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function coreSuite(pi: ExtensionAPI): Promise<void> {
	(await import("./cache-friendly-prompt/index.js")).default(pi);
	(await import("./agent-guidelines/index.js")).default(pi);
	(await import("./model-optimizer/index.js")).default(pi);
}
