import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";

/** Register all CLI flags owned by the subagent feature. */
export function registerSubagentFlags(pi: ExtensionAPI, extensionPathDefault: string): void {
  pi.registerFlag("subagent-max-agents", {
    description: `Maximum number of concurrent subagents. Hard-capped at ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents} (default: ${MEKANN_SUBAGENT_DEFAULTS.maxSubagents})`,
    type: "string",
    default: String(MEKANN_SUBAGENT_DEFAULTS.maxSubagents),
  });

  pi.registerFlag("subagent-max-depth", {
    description: `Maximum nesting depth for subagents (default: ${MEKANN_SUBAGENT_DEFAULTS.maxDepth})`,
    type: "string",
    default: String(MEKANN_SUBAGENT_DEFAULTS.maxDepth),
  });

  pi.registerFlag("subagent-default-wait-timeout-ms", {
    description: "Default wait_agent timeout in ms (unset = no default)",
    type: "string",
  });

  pi.registerFlag("subagent-min-wait-timeout-ms", {
    description: `Minimum wait_agent timeout in ms (default: ${MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs})`,
    type: "string",
    default: String(MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs),
  });

  pi.registerFlag("subagent-display", {
    description: 'Display mode for subagents: "none" (default), "external-pi", or "external-split".',
    type: "string",
    default: MEKANN_SUBAGENT_DEFAULTS.display,
  });

  pi.registerFlag("subagent-allow-unsafe-external-pi", {
    description: "Allow external-pi/external-split to launch independent Pi processes. Disable to force in-process agents with parent-side authority/tool filtering.",
    type: "string",
    default: String(MEKANN_SUBAGENT_DEFAULTS.allowUnsafeExternalPi),
  });

  pi.registerFlag("subagent-log-dir", {
    description: "Directory for subagent display logs",
    type: "string",
    default: MEKANN_SUBAGENT_DEFAULTS.logDir,
  });

  pi.registerFlag("subagent-kitten-bin", {
    description: "kitten binary path/name used for kitty remote control",
    type: "string",
    default: MEKANN_SUBAGENT_DEFAULTS.kittenBin,
  });

  pi.registerFlag("subagent-pi-command", {
    description: "shell command used to start child Pi process in external-pi/external-split mode",
    type: "string",
    default: MEKANN_SUBAGENT_DEFAULTS.piCommand,
  });

  pi.registerFlag("subagent-extension-path", {
    description: "extension path passed to child Pi with -e in external-pi/external-split mode (empty disables explicit loading)",
    type: "string",
    default: extensionPathDefault,
  });

  pi.registerFlag("subagent-allow-nested", {
    description: "Allow subagents to call spawn_agent recursively (default false to prevent cost storms)",
    type: "string",
    default: String(MEKANN_SUBAGENT_DEFAULTS.allowNestedSubagents),
  });

  pi.registerFlag("subagent-default-reasoning-effort", {
    description: `Default reasoning effort for subagents when spawn_agent.reasoning_effort is omitted (default: ${MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort})`,
    type: "string",
    default: MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort,
  });
}
