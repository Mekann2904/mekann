import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import sandbox from "./sandbox/index.js";
import planMode from "./plan-mode/index.js";

export default function safetySuite(pi: ExtensionAPI): void {
	// sandbox must be registered before plan-mode so plan-mode's read-only
	// profile events are observed during --plan startup and toggles.
	sandbox(pi);
	planMode(pi);
}
