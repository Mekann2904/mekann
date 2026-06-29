import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function bool(key: string, category: string, defaultValue: boolean, description: string): SettingSchema<boolean> {
  return { key, type: "boolean", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "boolean" ? [] : ["boolean である必要があります"]; } };
}

function stringEnum(key: string, category: string, defaultValue: string, values: string[], description: string): SettingSchema<string> {
  return { key, type: "string", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) { return typeof value === "string" && values.includes(value) ? [] : [`${values.join(" / ")} のいずれかである必要があります`]; } };
}

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
  return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: true, validate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
    if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
    return [];
  } };
}

export const cacheableContextSettingsSchema: FeatureSettingsSchema = {
  feature: "cacheable-context",
  title: "Cacheable Context Prefix",
  settings: [
    bool("enabled", "General", true, "CONTEXT.md / AGENTS.md / ADR index から検索用 fragment を生成します。初期値では system prompt には小さな locator だけを追加し、詳細は agent が通常の read/rg で探索します。LLM tool は追加しません。"),
    {
      key: "promptSurface",
      type: "string",
      defaultValue: "locator",
      description: "system prompt への露出方式。locator は保存場所と探索方針だけを出し、off は prompt 露出なし。full は非推奨（base system が既に AGENTS.md / domain docs を注入するため二重注入になる）で、指定時は locator にフォールバックします。",
      category: "General",
      scopes: ["global", "workspace"],
      restartRequired: true,
      validate(value) {
        if (value === "full") return ["非推奨: full は base system と二重注入するため locator にフォールバックします。locator または off に設定してください。"];
        return typeof value === "string" && ["locator", "off"].includes(value) ? [] : ["locator / off のいずれかである必要があります"];
      },
    },
    stringEnum("contextMode", "Content", "term-index", ["off", "term-index", "distilled", "full"], "CONTEXT.md の取り込み方式。初期値は term-index で、用語名と検索方針だけを含めます。"),
    bool("includeAgents", "Content", true, "AGENTS.md の要約 fragment を含めます。"),
    bool("includeDomainDocs", "Content", true, "docs/agents/domain.md の要約 fragment を含めます。"),
    bool("includeAdrIndex", "Content", true, "docs/adr/*.md の ADR index fragment を含めます。ADR 全文は含めません。"),
    bool("includeCodeStructure", "Content", false, "軽量 code structure fragment を含めます。初期MVPでは既定で無効です。"),
    num("maxPrefixChars", "Limits", 32000, 1000, 100000, "生成 prefix の最大文字数。超過時は後続 fragment を省略します。"),
    num("maxContextTerms", "Limits", 100, 1, 1000, "distilled CONTEXT.md に含める最大 term 数。"),
    num("maxContextTermBytes", "Limits", 1000, 60, 8000, "distilled CONTEXT.md の各用語定義の最大バイト数(UTF-8)。超過時は byte-safe で切り詰め [...] マーカを付与します。CJK でも文字境界で安全に切り、後続の _Avoid: 行は保持されます。"),
    num("maxAdrEntries", "Limits", 80, 1, 1000, "ADR index に含める最大 ADR 数。"),
  ],
};
