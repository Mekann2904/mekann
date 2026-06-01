import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function mekannExtension(pi: ExtensionAPI): Promise<void> {
	const { default: core } = await import("./core/index.js");
	const { default: safety } = await import("./safety/index.js");
	const { default: autonomy } = await import("./autonomy/index.js");
	const { default: utils } = await import("./utils/index.js");
	const { default: context } = await import("./context/index.js");
	await core(pi);
	await safety(pi);
	await autonomy(pi);
	await utils(pi);
	await context(pi);
}
