import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { handleCommand } from "./tools/commandHandler.js";
import type { SessionStore } from "./tools/sessionStore.js";
import type { toolDeps } from "./index.js";

export function registerAutoresearchCommands(
	pi: ExtensionAPI,
	store: SessionStore,
	syncAutoresearchToolSurface: () => void,
	deps: typeof toolDeps,
): void {
	pi.registerCommand("autoresearch", {
		description: "autoresearch モードの管理(on / off / status / clear)",
		handler: async (args, ctx) => {
			await handleCommand(args, ctx, pi, store, { ...deps, onSurfaceChange: syncAutoresearchToolSurface });
		},
	});
}
