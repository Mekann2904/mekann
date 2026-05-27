#!/usr/bin/env node
import React from "react";
import { existsSync } from "node:fs";
import { getLegacyPlanModeConfigPath } from "../../config.js";
import { getGlobalMekannSettingsPath, getWorkspaceMekannSettingsPath, loadSettings, saveSettingsChecked, setFeatureValue } from "../../settings/store.js";
import { mekannSettingsSchemas } from "../../settings/registry.js";
import { diagnosticsForUnknownKeys, flattenEffective } from "../../settings/effective.js";
import { fetchModelCatalog } from "./model-ipc.js";
import { SettingsEditorApp, type DraftChange } from "./app.js";

export async function runSettingsEditorCli(argv = process.argv.slice(2)): Promise<void> {
  const diagnose = argv.includes("--diagnose");
  const global = loadSettings(getGlobalMekannSettingsPath());
  const workspace = loadSettings(getWorkspaceMekannSettingsPath());
  const effective = flattenEffective(mekannSettingsSchemas, global, workspace);
  const diagnostics = diagnosticsForUnknownKeys(mekannSettingsSchemas, global, workspace);
  if (existsSync(getLegacyPlanModeConfigPath())) diagnostics.push("legacy plan-mode.json が残っています。mekann.json へ移行済みなら削除/退避してください。");
  const models = await fetchModelCatalog(process.env.MEKANN_SETTINGS_MODEL_SOCKET, process.env.MEKANN_SETTINGS_MODEL_TOKEN);
  if (diagnose) {
    console.log(`Mekann settings: ${effective.length} items, ${models.length} models`);
    for (const d of diagnostics) console.log(`diagnostic: ${d}`);
    for (const item of effective) for (const d of item.diagnostics) console.log(`diagnostic: ${item.feature}.${item.key}: ${d}`);
    return;
  }
  // @opentui/react and @opentui/core have a circular initialization path under Bun
  // when imported concurrently. Import core first, then the React renderer.
  const { createCliRenderer } = await import("@opentui/core");
  const { createRoot } = await import("@opentui/react");
  const renderer = await createCliRenderer({ exitOnCtrlC: false, useMouse: true, enableMouseMovement: true });
  const root = createRoot(renderer);
  const apply = async (changes: DraftChange[]): Promise<string | undefined> => {
    const byScope = new Map<"global" | "workspace", DraftChange[]>();
    for (const change of changes) byScope.set(change.scope, [...(byScope.get(change.scope) ?? []), change]);
    for (const [scope, scopedChanges] of byScope.entries()) {
      const path = scope === "global" ? getGlobalMekannSettingsPath() : getWorkspaceMekannSettingsPath();
      const loaded = loadSettings(path);
      let next = loaded.settings;
      for (const change of scopedChanges) {
        const item = effective.find((e) => e.feature === change.feature && e.key === change.key);
        if (!item) return `unknown setting: ${change.feature}.${change.key}`;
        let value: unknown = change.raw === "" ? undefined : change.raw;
        if (item.schema.type === "number" && change.raw !== "") value = Number(change.raw);
        if (item.schema.type === "boolean" && change.raw !== "") {
          if (/^(true|1|yes|on)$/i.test(change.raw)) value = true;
          else if (/^(false|0|no|off)$/i.test(change.raw)) value = false;
          else return `${change.feature}.${change.key}: boolean は true/false で入力してください`;
        }
        if (item.schema.type === "modelRef" && change.raw !== "") {
          const idx = change.raw.indexOf("/");
          if (idx <= 0 || idx === change.raw.length - 1) return `${change.feature}.${change.key}: provider/modelId 形式で入力してください`;
          value = { provider: change.raw.slice(0, idx), modelId: change.raw.slice(idx + 1) };
        }
        const errors = item.schema.validate(value);
        if (errors.length > 0) return `${change.feature}.${change.key}: ${errors.join(", ")}`;
        next = setFeatureValue(next, change.feature, change.key, value);
      }
      try { saveSettingsChecked(path, next, loaded.hash); } catch (e) { return (e as Error).message; }
    }
    return undefined;
  };
  root.render(React.createElement(SettingsEditorApp, { effective, diagnostics, models, onApply: apply, onQuit: () => renderer.destroy() }));
  process.stdin?.resume?.();
  await new Promise<void>((resolve) => {
    const done = () => { renderer.destroy(); resolve(); };
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
    renderer.keyInput.on("q", done);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSettingsEditorCli().catch((e) => { console.error(e); process.exitCode = 1; });
}
