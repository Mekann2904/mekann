import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { detectTerminalEmulatorAdapters, launchExternalUi } from "../terminal/index.js";
import { decideTuiPlacement, type SupportedTuiPlacements } from "../tui/index.js";
import { startModelCatalogServer } from "./model-ipc.js";

/** The settings editor is an External UI feature: External split UI only, never pass-through. */
const SETTINGS_EDITOR_PLACEMENT: SupportedTuiPlacements = {
	kind: "external-ui-feature",
	placements: ["external-split"],
};

export default function settingsEditor(pi: ExtensionAPI): void {
  pi.registerCommand("mekann-settings", {
    description: "Open the Mekann settings editor in an external split UI",
    handler: async (_args, ctx) => {
      const placement = decideTuiPlacement({
        feature: SETTINGS_EDITOR_PLACEMENT,
        capability: { split: detectTerminalEmulatorAdapters().some((a) => a.capabilities().split) },
        preference: "split-longer-side",
        isIdle: ctx.isIdle(),
      });
      if (placement.status !== "ok") {
        ctx.ui.notify(`Mekann settings editor requires an external split UI: ${placement.reason}`, "error");
        return;
      }

      const endpoint = await startModelCatalogServer(ctx);
      const cliPath = new URL("./cli.ts", import.meta.url).pathname;
      const logPath = `/tmp/mekann-settings-${process.pid}.log`;
      const debug = process.env.MEKANN_SETTINGS_DEBUG === "1";
      const baseCommand = `MEKANN_SETTINGS_MODEL_SOCKET=${JSON.stringify(endpoint.socketPath)} MEKANN_SETTINGS_MODEL_TOKEN=${JSON.stringify(endpoint.token)} bun ${JSON.stringify(cliPath)}`;
      const command = debug ? `${baseCommand} 2>&1 | tee ${JSON.stringify(logPath)}; code=$?; echo; echo "mekann-settings exited with code $code"; echo "log: ${logPath}"; echo "Press Enter to close"; read _; exit $code` : baseCommand;

      const result = await launchExternalUi({
        cwd: ctx.cwd,
        title: "Mekann Settings",
        copyEnv: true,
        matchCurrentWindow: true,
        hold: debug,
        action: { mode: "shell", command },
      });
      if (!result.ok) {
        await endpoint.close();
        ctx.ui.notify(`Mekann settings editor could not open external split UI: ${result.reason ?? "unknown"}`, "error");
        return;
      }
      setTimeout(() => { void endpoint.close(); }, 30 * 60 * 1000).unref?.();
      ctx.ui.notify("Mekann settings editor opened.", "info");
    },
  });
}
