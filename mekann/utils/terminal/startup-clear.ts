import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { featureValue } from "../../settings/featureConfig.js";

export default function startupClear(pi: ExtensionAPI): void {
	pi.on("session_start", (event) => {
		if (event.reason !== "startup") return;

		const enabled = featureValue("terminal", "clearOnStartup");
		if (enabled === false) return;

		process.stdout.write("\x1b[2J\x1b[H");
	});
}
