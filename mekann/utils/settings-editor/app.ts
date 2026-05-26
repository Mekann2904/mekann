import React, { useMemo, useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { EffectiveSetting, SettingsScope } from "../../settings/types.js";
import type { ModelCatalogItem } from "./model-ipc.js";

export interface DraftChange { feature: string; key: string; scope: SettingsScope; raw: string; }
export interface SettingsEditorAppProps {
  effective: EffectiveSetting[];
  diagnostics: string[];
  models: ModelCatalogItem[];
  onApply: (changes: DraftChange[]) => Promise<string | undefined>;
  onQuit: () => void;
}
function el(type: string, props: Record<string, unknown>, ...children: React.ReactNode[]) { return React.createElement(type, props, ...children); }
function itemId(i: EffectiveSetting): string { return `${i.feature}.${i.key}`; }
function valueText(value: unknown): string { if (value === undefined) return ""; if (value && typeof value === "object") { const v = value as Record<string, unknown>; if (typeof v.provider === "string" && typeof v.modelId === "string") return `${v.provider}/${v.modelId}`; return JSON.stringify(value); } return String(value); }
function fit(s: string, n: number): string { const text = s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s; return text.length >= n ? text : text + " ".repeat(n - text.length); }
function supportedThinking(models: ModelCatalogItem[], item: EffectiveSetting, items: EffectiveSetting[]): string[] {
  const mode = item.key.split(".")[1];
  const modelItem = items.find((i) => i.feature === "plan-mode" && i.key === `models.${mode}`);
  const modelText = valueText(modelItem?.effectiveValue);
  const model = models.find((m) => `${m.provider}/${m.modelId}` === modelText);
  return model?.supportedThinkingLevels?.length ? model.supportedThinkingLevels : (item.schema.enumValues ?? []);
}

export function SettingsEditorApp({ effective, diagnostics, models, onApply, onQuit }: SettingsEditorAppProps) {
  const [selected, setSelected] = useState(0);
  const [scope, setScope] = useState<SettingsScope>("global");
  const [mode, setMode] = useState<"list" | "edit" | "models" | "diff">("list");
  const [buffer, setBuffer] = useState("");
  const [modelSelected, setModelSelected] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DraftChange>>({});
  const [message, setMessage] = useState("↑/↓ select  e edit  m model  Space cycle  g/w scope  d diff  a apply  q quit");
  const items = useMemo(() => effective, [effective]);
  const current = items[Math.min(selected, Math.max(0, items.length - 1))];
  const currentDraft = current ? drafts[itemId(current)] : undefined;
  const shownValue = currentDraft?.raw ?? valueText(current?.effectiveValue);

  function stage(item: EffectiveSetting, raw: string) {
    setDrafts((d) => ({ ...d, [itemId(item)]: { feature: item.feature, key: item.key, scope, raw } }));
    setMessage(`staged ${itemId(item)} to ${scope}; press a to apply`);
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") { onQuit(); return; }
    if (mode === "edit") {
      if (key.name === "escape") { setMode("list"); setMessage("edit cancelled"); return; }
      if (key.name === "backspace" || key.name === "delete") { setBuffer((b) => b.slice(0, -1)); return; }
      if (key.name === "return" || key.name === "enter") { if (current) stage(current, buffer); setMode("list"); return; }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) setBuffer((b) => b + key.sequence);
      return;
    }
    if (mode === "models") {
      if (key.name === "escape") { setMode("list"); return; }
      if (key.name === "up") setModelSelected((i) => Math.max(0, i - 1));
      else if (key.name === "down") setModelSelected((i) => Math.min(models.length - 1, i + 1));
      else if ((key.name === "return" || key.name === "enter") && current && models[modelSelected]) { const m = models[modelSelected]; stage(current, `${m.provider}/${m.modelId}`); setMode("list"); }
      return;
    }
    if (key.name === "q") { onQuit(); return; }
    if (key.name === "up") setSelected((i) => Math.max(0, i - 1));
    else if (key.name === "down") setSelected((i) => Math.min(items.length - 1, i + 1));
    else if (key.name === "g") { setScope("global"); setMessage("save scope: global"); }
    else if (key.name === "w") { setScope("workspace"); setMessage("save scope: workspace"); }
    else if (key.name === "d") setMode(mode === "diff" ? "list" : "diff");
    else if (key.name === "e" && current) { setBuffer(shownValue); setMode("edit"); setMessage(`editing ${itemId(current)}`); }
    else if (key.name === "m" && current?.schema.type === "modelRef") { setModelSelected(0); setMode("models"); setMessage("select model with ↑/↓ Enter"); }
    else if (key.name === "space" && current?.schema.type === "enum") { const values = current.feature === "plan-mode" && current.key.startsWith("thinking.") ? supportedThinking(models, current, items) : (current.schema.enumValues ?? []); const idx = Math.max(0, values.indexOf(shownValue)); stage(current, values[(idx + 1) % values.length] ?? ""); }
    else if (key.name === "a") { const changes = Object.values(drafts); void onApply(changes).then((err) => { if (err) setMessage(`apply failed: ${err}`); else { setDrafts({}); setMessage("applied; restart Pi to use new settings"); } }); }
  });

  const lines: string[] = [];
  lines.push("Mekann Settings Editor");
  lines.push("======================");
  lines.push(`Models: ${models.length}    Diagnostics: ${diagnostics.length}    Scope: ${scope}    Drafts: ${Object.keys(drafts).length}`);
  lines.push(message);
  if (mode === "edit") lines.push(`EDIT ${itemId(current)}: ${buffer}_`);
  lines.push("");

  if (mode === "models") {
    lines.push("Model select"); lines.push("------------");
    models.slice(Math.max(0, modelSelected - 8), modelSelected + 12).forEach((m, offset) => {
      const idx = Math.max(0, modelSelected - 8) + offset;
      lines.push(`${idx === modelSelected ? ">" : " "}${fit(`${m.provider}/${m.modelId}`, 42)} ${m.reasoning ? "reasoning" : ""}`);
    });
  } else if (mode === "diff") {
    lines.push("Draft diff / Apply preview"); lines.push("--------------------------");
    for (const change of Object.values(drafts)) {
      const base = items.find((i) => i.feature === change.feature && i.key === change.key);
      lines.push(`${change.feature}.${change.key} (${change.scope})`);
      lines.push(`- ${valueText(base?.effectiveValue) || "(unset)"}`);
      lines.push(`+ ${change.raw || "(unset)"}`);
    }
    if (Object.keys(drafts).length === 0) lines.push("(no draft changes)");
  } else {
    let lastFeature = "";
    items.forEach((item, i) => {
      if (item.feature !== lastFeature) { lastFeature = item.feature; lines.push(`[${lastFeature}]`); lines.push(`${fit("Setting", 22)} ${fit("Effective", 30)} ${fit("Src", 9)}`); lines.push(`${"-".repeat(22)} ${"-".repeat(30)} ${"-".repeat(9)}`); }
      const marker = i === selected ? ">" : " "; const draft = drafts[itemId(item)];
      lines.push(`${marker}${fit(item.key, 21)} ${fit((draft?.raw ?? valueText(item.effectiveValue)) || "(unset)", 30)} ${fit((draft ? draft.scope : item.source) + (item.schema.restartRequired ? "*" : ""), 9)}`);
    });
  }
  return el("box", { flexDirection: "column", padding: 1 }, el("text", { fg: "white", content: lines.join("\n") }));
}
