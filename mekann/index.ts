import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import core from "./core/index.js";
import safety from "./safety/index.js";
import autonomy from "./autonomy/index.js";
import utils from "./utils/index.js";
import context from "./context/index.js";

export default async function mekannExtension(pi: ExtensionAPI): Promise<void> {
	await core(pi);
	await safety(pi);
	await autonomy(pi);
	await utils(pi);
	await context(pi);
}
