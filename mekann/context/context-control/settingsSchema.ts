import { MEKANN_CONTEXT_CONTROL_DEFAULTS } from "../../config.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

function num(key: string, category: string, defaultValue: number, min: number, max: number, description: string): SettingSchema<number> {
  return { key, type: "number", defaultValue, description, category, scopes: ["global", "workspace"], restartRequired: false, validate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
    if (n < min || n > max) return [`${min}〜${max} の範囲で指定してください`];
    return [];
  } };
}

const d = MEKANN_CONTEXT_CONTROL_DEFAULTS;

export const contextControlSettingsSchema: FeatureSettingsSchema = {
  feature: "context-control",
  title: "Context Control",
  settings: [
    // Pressure classification (% of context window)
    num("pressureCriticalPct", "Pressure", d.pressureCriticalPct, 50, 100, "context window 使用率がこの値以上なら critical 圧力とみなします。"),
    num("pressureHighPct", "Pressure", d.pressureHighPct, 30, 100, "context window 使用率がこの値以上なら high 圧力とみなします。"),
    num("pressureMediumPct", "Pressure", d.pressureMediumPct, 10, 100, "context window 使用率がこの値以上なら medium 圧力とみなします。"),
    // Inline budgets by pressure (bytes)
    num("budgetDynamicTailCriticalBytes", "Inline Budget", d.budgetDynamicTailCriticalBytes, 1024, 65536, "critical 圧力時の dynamic tail 上限バイト数。"),
    num("budgetDynamicTailHighBytes", "Inline Budget", d.budgetDynamicTailHighBytes, 1024, 65536, "high 圧力時の dynamic tail 上限バイト数。"),
    num("budgetDynamicTailMediumBytes", "Inline Budget", d.budgetDynamicTailMediumBytes, 1024, 65536, "medium 圧力時の dynamic tail 上限バイト数。"),
    num("budgetDynamicTailLowBytes", "Inline Budget", d.budgetDynamicTailLowBytes, 1024, 65536, "low 圧力時の dynamic tail 上限バイト数。"),
    num("budgetMessageCriticalBytes", "Inline Budget", d.budgetMessageCriticalBytes, 1024, 65536, "critical 圧力時のメッセージ inline 上限バイト数。"),
    num("budgetMessageHighBytes", "Inline Budget", d.budgetMessageHighBytes, 1024, 65536, "high 圧力時のメッセージ inline 上限バイト数。"),
    num("budgetToolCriticalBytes", "Inline Budget", d.budgetToolCriticalBytes, 1024, 131072, "critical 圧力時のツール出力 inline 上限バイト数。"),
    num("budgetToolHighBytes", "Inline Budget", d.budgetToolHighBytes, 1024, 131072, "high 圧力時のツール出力 inline 上限バイト数。"),
    num("budgetToolNormalBytes", "Inline Budget", d.budgetToolNormalBytes, 1024, 131072, "medium/low 圧力時のツール出力 inline 上限バイト数。"),
    // Message / tool policy thresholds (IC-175 unification)
    num("messageSummarizeBytes", "Policy", d.messageSummarizeBytes, 1024, 131072, "このバイト数を超えるメッセージアイテムは summarize 対象(planner/report/analysis 共通)。"),
    num("messageRetrieveBytes", "Policy", d.messageRetrieveBytes, 256, 65536, "このバイト数を超えるメッセージアイテムは retrieve(遅延取得)対象。"),
    num("toolExternalizeTotalBytes", "Policy", d.toolExternalizeTotalBytes, 4096, 524288, "ツール出力の累計がこのバイト数を超えると外部化を推奨(report/analysis 共通)。"),
    num("toolWarnBytes", "Policy", d.toolWarnBytes, 4096, 524288, "ツール出力1件がこのバイト数を超えると warning 表示(top contributors)。"),
    num("toolLargeSchemaBytes", "Policy", d.toolLargeSchemaBytes, 4096, 524288, "ツール schema 総量がこのバイト数を超えると surface 縮小を推奨(planner)。"),
    // Payload-share thresholds (%)
    num("messagePctHigh", "Payload Share", d.messagePctHigh, 10, 100, "メッセージが payload のこの % を超えると retention 分類/減点(analysis/report 共通)。"),
    num("systemPromptPctHigh", "Payload Share", d.systemPromptPctHigh, 5, 100, "system prompt が payload のこの % を超えると lazy-load/減点(planner/analysis 共通)。"),
    num("systemPromptPctAudit", "Payload Share", d.systemPromptPctAudit, 5, 100, "system prompt が payload のこの % を超えると audit 推奨(report)。"),
    // Growth-rate thresholds
    num("growthTokensPerRequest", "Growth", d.growthTokensPerRequest, 0, 100000, "1 リクエストあたりの token 増加がこの値を超えると高成長とみなします。"),
    num("growthPayloadBytesPerRequest", "Growth", d.growthPayloadBytesPerRequest, 0, 1048576, "1 リクエストあたりの payload 増加がこのバイト数を超えると高成長とみなします。"),
    // Health penalties
    num("penaltyPressureCritical", "Health Penalty", d.penaltyPressureCritical, 0, 100, "critical 圧力時の health 減点。"),
    num("penaltyPressureHigh", "Health Penalty", d.penaltyPressureHigh, 0, 100, "high 圧力時の health 減点。"),
    num("penaltyPressureMedium", "Health Penalty", d.penaltyPressureMedium, 0, 100, "medium 圧力時の health 減点。"),
    num("penaltyMessagePct", "Health Penalty", d.penaltyMessagePct, 0, 100, "メッセージ占有率超過の health 減点。"),
    num("penaltySystemPromptPct", "Health Penalty", d.penaltySystemPromptPct, 0, 100, "system prompt 占有率超過の health 減点。"),
    num("penaltyGrowth", "Health Penalty", d.penaltyGrowth, 0, 100, "高成長率の health 減点。"),
    num("penaltyLargeResult", "Health Penalty", d.penaltyLargeResult, 0, 100, "直近ツール結果巨大時の health 減点。"),
    // Risk bands
    num("riskCriticalScore", "Risk Band", d.riskCriticalScore, 0, 100, "health score がこの値未満なら risk=critical。"),
    num("riskHighScore", "Risk Band", d.riskHighScore, 0, 100, "health score がこの値未満なら risk=high。"),
    num("riskMediumScore", "Risk Band", d.riskMediumScore, 0, 100, "health score がこの値未満なら risk=medium。"),
    // Alert thresholds
    num("alertTokenPct", "Alert", d.alertTokenPct, 10, 100, "context window 使用率がこの % を超えると alert。"),
    num("alertLargeResultBytes", "Alert", d.alertLargeResultBytes, 1024, 524288, "直近ツール結果がこのバイト数を超えると alert。"),
    num("alertPendingResults", "Alert", d.alertPendingResults, 0, 1000, "pending subagent results がこの数を超えると alert。"),
  ],
};
