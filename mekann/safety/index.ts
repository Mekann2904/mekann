import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import sandbox from "./sandbox/index.js";
import modes from "./modes/index.js";

export default function safetySuite(pi: ExtensionAPI): void {
	sandbox(pi);
	modes(pi);
}
