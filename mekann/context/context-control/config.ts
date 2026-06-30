/**
 * Centralised context-control threshold resolution (issue #166,
 * IC-174 / IC-175 / IC-176).
 *
 * `planner.ts`, `report.ts`, and `analysis.ts` all read thresholds through
 * {@link resolveContextControlConfig} so a single `mekann.json` override
 * (`features.context-control.*`) moves every consumer in tandem and the
 * planner/report no longer disagree on the same metric.
 *
 * Resolution follows the established `featureConfig` pattern: schema-backed
 * and raw keys in `features.context-control` (workspace > global) are merged
 * over {@link MEKANN_CONTEXT_CONTROL_DEFAULTS}. Unknown or non-numeric values
 * fall back to the default, mirroring `MEKANN_OUTPUT_GATE_DEFAULTS` usage.
 */
import { MEKANN_CONTEXT_CONTROL_DEFAULTS, type MekannContextControlConfig } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";

function num(raw: unknown, fallback: number): number {
	const n = Number(raw);
	return Number.isFinite(n) ? n : fallback;
}

export function resolveContextControlConfig(
	cwd: string = process.cwd(),
	home?: string,
): MekannContextControlConfig {
	const cfg = featureConfig("context-control", cwd, home);
	const d = MEKANN_CONTEXT_CONTROL_DEFAULTS;
	return {
		pressureCriticalPct: num(cfg.pressureCriticalPct, d.pressureCriticalPct),
		pressureHighPct: num(cfg.pressureHighPct, d.pressureHighPct),
		pressureMediumPct: num(cfg.pressureMediumPct, d.pressureMediumPct),
		budgetDynamicTailCriticalBytes: num(cfg.budgetDynamicTailCriticalBytes, d.budgetDynamicTailCriticalBytes),
		budgetDynamicTailHighBytes: num(cfg.budgetDynamicTailHighBytes, d.budgetDynamicTailHighBytes),
		budgetDynamicTailMediumBytes: num(cfg.budgetDynamicTailMediumBytes, d.budgetDynamicTailMediumBytes),
		budgetDynamicTailLowBytes: num(cfg.budgetDynamicTailLowBytes, d.budgetDynamicTailLowBytes),
		budgetMessageCriticalBytes: num(cfg.budgetMessageCriticalBytes, d.budgetMessageCriticalBytes),
		budgetMessageHighBytes: num(cfg.budgetMessageHighBytes, d.budgetMessageHighBytes),
		messageSummarizeBytes: num(cfg.messageSummarizeBytes, d.messageSummarizeBytes),
		budgetToolCriticalBytes: num(cfg.budgetToolCriticalBytes, d.budgetToolCriticalBytes),
		budgetToolHighBytes: num(cfg.budgetToolHighBytes, d.budgetToolHighBytes),
		budgetToolNormalBytes: num(cfg.budgetToolNormalBytes, d.budgetToolNormalBytes),
		messageRetrieveBytes: num(cfg.messageRetrieveBytes, d.messageRetrieveBytes),
		savingsSummarizeHigh: num(cfg.savingsSummarizeHigh, d.savingsSummarizeHigh),
		savingsRetrieveMedium: num(cfg.savingsRetrieveMedium, d.savingsRetrieveMedium),
		savingsExternalize: num(cfg.savingsExternalize, d.savingsExternalize),
		savingsCacheableOverflow: num(cfg.savingsCacheableOverflow, d.savingsCacheableOverflow),
		savingsSystemPrompt: num(cfg.savingsSystemPrompt, d.savingsSystemPrompt),
		savingsToolSchema: num(cfg.savingsToolSchema, d.savingsToolSchema),
		savingsMessagesClassify: num(cfg.savingsMessagesClassify, d.savingsMessagesClassify),
		savingsSystemPromptAudit: num(cfg.savingsSystemPromptAudit, d.savingsSystemPromptAudit),
		savingsToolExternalize: num(cfg.savingsToolExternalize, d.savingsToolExternalize),
		savingsCompactTrigger: num(cfg.savingsCompactTrigger, d.savingsCompactTrigger),
		messagePctHigh: num(cfg.messagePctHigh, d.messagePctHigh),
		systemPromptPctHigh: num(cfg.systemPromptPctHigh, d.systemPromptPctHigh),
		systemPromptPctAudit: num(cfg.systemPromptPctAudit, d.systemPromptPctAudit),
		toolExternalizeTotalBytes: num(cfg.toolExternalizeTotalBytes, d.toolExternalizeTotalBytes),
		toolWarnBytes: num(cfg.toolWarnBytes, d.toolWarnBytes),
		toolLargeSchemaBytes: num(cfg.toolLargeSchemaBytes, d.toolLargeSchemaBytes),
		growthTokensPerRequest: num(cfg.growthTokensPerRequest, d.growthTokensPerRequest),
		growthPayloadBytesPerRequest: num(cfg.growthPayloadBytesPerRequest, d.growthPayloadBytesPerRequest),
		penaltyPressureCritical: num(cfg.penaltyPressureCritical, d.penaltyPressureCritical),
		penaltyPressureHigh: num(cfg.penaltyPressureHigh, d.penaltyPressureHigh),
		penaltyPressureMedium: num(cfg.penaltyPressureMedium, d.penaltyPressureMedium),
		penaltyMessagePct: num(cfg.penaltyMessagePct, d.penaltyMessagePct),
		penaltySystemPromptPct: num(cfg.penaltySystemPromptPct, d.penaltySystemPromptPct),
		penaltyGrowth: num(cfg.penaltyGrowth, d.penaltyGrowth),
		penaltyLargeResult: num(cfg.penaltyLargeResult, d.penaltyLargeResult),
		riskCriticalScore: num(cfg.riskCriticalScore, d.riskCriticalScore),
		riskHighScore: num(cfg.riskHighScore, d.riskHighScore),
		riskMediumScore: num(cfg.riskMediumScore, d.riskMediumScore),
		cacheWarmHitRateWarn: num(cfg.cacheWarmHitRateWarn, d.cacheWarmHitRateWarn),
		cacheWarmRequestMin: num(cfg.cacheWarmRequestMin, d.cacheWarmRequestMin),
		cachePrefixHashChurn: num(cfg.cachePrefixHashChurn, d.cachePrefixHashChurn),
		cacheModelSwitchChurn: num(cfg.cacheModelSwitchChurn, d.cacheModelSwitchChurn),
		alertTokenPct: num(cfg.alertTokenPct, d.alertTokenPct),
		alertLargeResultBytes: num(cfg.alertLargeResultBytes, d.alertLargeResultBytes),
		alertPayloadGrowthRatio: num(cfg.alertPayloadGrowthRatio, d.alertPayloadGrowthRatio),
		alertTokenGrowthRatio: num(cfg.alertTokenGrowthRatio, d.alertTokenGrowthRatio),
		alertPendingResults: num(cfg.alertPendingResults, d.alertPendingResults),
	};
}

export { MEKANN_CONTEXT_CONTROL_DEFAULTS } from "../../config.js";
export type { MekannContextControlConfig } from "../../config.js";
