import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { MEKANN_SUBAGENT_DEFAULTS } from "../../config.js";
import { featureRawConfig } from "../../settings/enabled.js";
import { AgentControl } from "./agentControl.js";
import { KittyController } from "./kittyControl.js";

function readSettingsFile(): Record<string, unknown> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return {};
  return { subagent: featureRawConfig("subagent") };
}

function getFlagOrSetting<T>(pi: ExtensionAPI, flagName: string, settingsKey: string, defaultValue?: T): T | undefined {
  const flagVal = pi.getFlag(flagName) as T | undefined;
  try {
    const settings = readSettingsFile();
    const sub = settings.subagent as Record<string, unknown> | undefined;
    if (sub && sub[settingsKey] !== undefined) {
      // pi.getFlag() returns registered defaults too. Treat the default value
      // as "not explicitly set" so mekann.json can actually configure the
      // extension. A non-default CLI flag still wins.
      if (flagVal === undefined || flagVal === null || flagVal === defaultValue) return sub[settingsKey] as T;
    }
  } catch { /* ignore malformed settings */ }
  if (flagVal !== undefined && flagVal !== null) return flagVal;
  return defaultValue;
}

function truthySetting(value: unknown): boolean {
  return /^(1|true|yes|on)$/i.test(String(value));
}

export function createSubagentControl(pi: ExtensionAPI, extensionPathDefault: string): AgentControl {
  // AgentRegistry counts the root agent too, so root + max 2 subagents = 3 open agents.
  const maxSubagentsDefault = String(MEKANN_SUBAGENT_DEFAULTS.maxSubagents);
  const maxSubagents = Math.min(
    Math.max(Number(getFlagOrSetting(pi, "subagent-max-agents", "maxSubagents", maxSubagentsDefault)) || MEKANN_SUBAGENT_DEFAULTS.maxSubagents, 0),
    4,
  );
  const configuredMaxOpenAgents = Number(getFlagOrSetting(pi, "subagent-max-open-agents", "maxOpenAgents", String(maxSubagents + 1))) || maxSubagents + 1;
  const maxAgents = Math.max(configuredMaxOpenAgents, maxSubagents + 1);
  const maxQueuedDefault = String(MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents);
  const maxQueuedSubagents = Math.max(Number(getFlagOrSetting(pi, "subagent-max-queued-agents", "maxQueuedSubagents", maxQueuedDefault)) || MEKANN_SUBAGENT_DEFAULTS.maxQueuedSubagents, 0);
  const maxDepthDefault = String(MEKANN_SUBAGENT_DEFAULTS.maxDepth);
  const maxDepth = Number(getFlagOrSetting(pi, "subagent-max-depth", "maxDepth", maxDepthDefault)) || MEKANN_SUBAGENT_DEFAULTS.maxDepth;
  const rawDefaultWait = getFlagOrSetting<string>(pi, "subagent-default-wait-timeout-ms", "defaultWaitTimeoutMs");
  const parsedDefaultWait = rawDefaultWait === undefined || rawDefaultWait === "" ? undefined : Number(rawDefaultWait);
  const defaultWait = parsedDefaultWait !== undefined && Number.isFinite(parsedDefaultWait) ? parsedDefaultWait : undefined;
  const minWaitDefault = String(MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs);
  const minWait = Number(getFlagOrSetting(pi, "subagent-min-wait-timeout-ms", "minWaitTimeoutMs", minWaitDefault)) || MEKANN_SUBAGENT_DEFAULTS.minWaitTimeoutMs;
  const rawDisplayFlag = getFlagOrSetting<string>(pi, "subagent-display", "display", MEKANN_SUBAGENT_DEFAULTS.display);
  const isKitty = !process.env.VITEST && process.env.NODE_ENV !== "test" && Boolean(process.env.KITTY_WINDOW_ID);
  const displayFlag = String(rawDisplayFlag ?? MEKANN_SUBAGENT_DEFAULTS.display);
  const displayMap: Record<string, "none" | "kitty-pi" | "kitty-split"> = { none: "none", "external-pi": "kitty-pi", "external-split": "kitty-split" };
  const requestedDisplayMode = isKitty && displayFlag === "none" ? "kitty-split" : displayMap[displayFlag] ?? "none";
  const displayMode = requestedDisplayMode.startsWith("kitty-") && !isKitty ? "none" : requestedDisplayMode;
  const configuredAllowUnsafeExternalPi = truthySetting(
    getFlagOrSetting<string>(
      pi,
      "subagent-allow-unsafe-external-pi",
      "allowUnsafeExternalPi",
      String(MEKANN_SUBAGENT_DEFAULTS.allowUnsafeExternalPi),
    ) ?? String(MEKANN_SUBAGENT_DEFAULTS.allowUnsafeExternalPi),
  );
  const allowUnsafeExternalPi = isKitty && displayMode.startsWith("kitty-") ? true : configuredAllowUnsafeExternalPi;
  const logDirFlag = String(getFlagOrSetting<string>(pi, "subagent-log-dir", "log-dir", MEKANN_SUBAGENT_DEFAULTS.logDir) ?? MEKANN_SUBAGENT_DEFAULTS.logDir).trim();
  const kittenBin = String(getFlagOrSetting<string>(pi, "subagent-kitten-bin", "kitten-bin", MEKANN_SUBAGENT_DEFAULTS.kittenBin) ?? MEKANN_SUBAGENT_DEFAULTS.kittenBin) || MEKANN_SUBAGENT_DEFAULTS.kittenBin;
  const piCommand = String(getFlagOrSetting<string>(pi, "subagent-pi-command", "pi-command", MEKANN_SUBAGENT_DEFAULTS.piCommand) ?? MEKANN_SUBAGENT_DEFAULTS.piCommand) || MEKANN_SUBAGENT_DEFAULTS.piCommand;
  const extensionPath = String(getFlagOrSetting<string>(pi, "subagent-extension-path", "extensionPath", extensionPathDefault) ?? extensionPathDefault).trim();
  const configuredExternalPiSlots = Number(getFlagOrSetting(pi, "subagent-external-pi-slots", "externalPiSlots", String(MEKANN_SUBAGENT_DEFAULTS.externalPiSlots))) || MEKANN_SUBAGENT_DEFAULTS.externalPiSlots;
  const externalPiSlots = isKitty && displayMode.startsWith("kitty-") ? Math.max(configuredExternalPiSlots, 1) : configuredExternalPiSlots;
  const allowNestedSubagents = truthySetting(getFlagOrSetting<string>(pi, "subagent-allow-nested", "allowNestedSubagents", String(MEKANN_SUBAGENT_DEFAULTS.allowNestedSubagents)) ?? String(MEKANN_SUBAGENT_DEFAULTS.allowNestedSubagents));
  const defaultReasoningEffort = String(getFlagOrSetting<string>(pi, "subagent-default-reasoning-effort", "defaultReasoningEffort", MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort) ?? MEKANN_SUBAGENT_DEFAULTS.defaultReasoningEffort);

  return new AgentControl(pi, maxAgents, maxDepth, defaultWait, minWait, {
    displayMode,
    logDir: logDirFlag || undefined,
    kitty: new KittyController(kittenBin),
    piCommand,
    extensionPath: extensionPath || undefined,
    allowUnsafeExternalPi,
    maxQueuedSubagents,
    externalPiSlots,
    allowNestedSubagents,
    defaultReasoningEffort,
  });
}
