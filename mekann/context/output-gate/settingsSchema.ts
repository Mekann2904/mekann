import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
  return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
    if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
    return [];
  } };
}

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
  return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

const toolSurfaceValues = ["artifact", "always"] as const;
const toolSurfaceSetting: SettingSchema<string> = {
  key: "toolSurface",
  type: "enum",
  defaultValue: "artifact",
  description: "search_tool_outputs を LLM に見せる条件。artifact は保存済み artifact がある時だけ、always は常時。",
  category: "Context Surface",
  scopes: ["global", "workspace"],
  restartRequired: false,
  enumValues: [...toolSurfaceValues],
  validate(value) { return toolSurfaceValues.includes(value as any) ? [] : ["artifact | always のいずれかです"]; },
};

export const outputGateSettingsSchema: FeatureSettingsSchema = {
  feature: "output-gate",
  title: "Output Gate",
  settings: [
    bool("enabled", "General", true, "tool_result hook による大出力保存・stub 化と search_tool_outputs を有効にします。"),
    toolSurfaceSetting,
    num("maxInlineBytes", "Limits", MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes, 1024, 1048576, "ツール出力のインライン表示上限バイト数。"),
    num("previewBytes", "Limits", MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes, 256, 65536, "プレビュー表示バイト数。"),
    num("maxSearchResultBytes", "Limits", MEKANN_OUTPUT_GATE_DEFAULTS.maxSearchResultBytes, 1024, 65536, "検索結果の最大バイト数。"),
    num("defaultContextLines", "Search", MEKANN_OUTPUT_GATE_DEFAULTS.defaultContextLines, 0, 50, "検索結果のデフォルトコンテキスト行数。"),
    num("defaultMaxResults", "Search", MEKANN_OUTPUT_GATE_DEFAULTS.defaultMaxResults, 1, 100, "検索結果のデフォルト最大件数。"),
    num("artifactRetentionMaxFiles", "Retention", MEKANN_OUTPUT_GATE_DEFAULTS.artifactRetentionMaxFiles, 10, 1000, "保持する artifact ファイルの最大数。"),
  ],
};
