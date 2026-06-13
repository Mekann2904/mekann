/**
 * Settings Editor view model — display-only knowledge for settings rendering.
 *
 * All settings semantics (grouping, display values, mode-specific rules,
 * draft resolution, thinking support, column widths) live here.
 * React / OpenTUI components import from this module and render the results
 * as a thin adapter layer.
 */
import type { EffectiveSetting } from "../../settings/types.js";
import type { ModelCatalogItem } from "./model-ipc.js";
import { itemId, type DraftChange } from "./state.js";

// ─── Value formatting ──────────────────────────────────────────────

/** Format any effective-value as a human-readable string. */
export function valueText(value: unknown): string {
	if (value === undefined) return "(unset)";
	if (value === null) return "(null)";
	if (value && typeof value === "object") {
		const v = value as Record<string, unknown>;
		if (typeof v.provider === "string" && typeof v.modelId === "string")
			return `${v.provider}/${v.modelId}`;
		return JSON.stringify(value);
	}
	return String(value);
}

// ─── Key display ───────────────────────────────────────────────────

/** Feature-aware display key for a setting. */
export function displaySettingKey(item: EffectiveSetting): string {
	if (item.feature === "modes") {
		const [kind, mode] = item.key.split(".");
		if (kind === "models" && mode) return "Model";
		if (kind === "thinking" && mode) return "Thinking";
	}
	return item.key;
}

// ─── Value display ─────────────────────────────────────────────────

/** Context-aware display value, replacing generic "(unset)" when semantics exist. */
export function displaySettingValue(item: EffectiveSetting, raw: string): string {
	if (item.feature === "modes" && raw === "(unset)") {
		if (item.key.startsWith("models.")) return "inherit current model";
		if (item.key.startsWith("thinking.")) return "inherit current thinking";
	}
	return raw;
}

// ─── Mode section headers ──────────────────────────────────────────

/** Map a raw mode string to its display label. */
export function modeLabel(mode: string): string {
	switch (mode) {
		case "main": return "Main";
		case "sub": return "Subagent";
		case "auto": return "Auto";
		case "read_only": return "Read-only";
		default: return mode;
	}
}

/** Extract the mode section name from a modes-feature setting, or undefined. */
export function modeFromSetting(item: EffectiveSetting): string | undefined {
	if (item.feature !== "modes") return undefined;
	return item.key.split(".")[1];
}

// ─── Feature grouping & ordering ──────────────────────────────────

/** Stable display title for a feature identifier. */
export function featureTitle(feature: string): string {
	switch (feature) {
		case "modes": return "Collaboration Modes";
		case "sandbox": return "Sandbox";
		case "subagent": return "Subagent";
		case "review-fixer": return "Review Fixer";
		case "command-normalization": return "Command Normalization";
		case "output-gate": return "Output Gate";
		case "codex-shared": return "Codex Shared";
		case "codex-web-search": return "Codex Web Search";
		case "codex-limits": return "Codex Limits";
		case "dashboard": return "Dashboard";
		case "model-optimizer": return "Model Optimizer";
		case "terminal": return "Terminal";
		default: return feature;
	}
}

/** Numeric sort order for feature sidebar. */
export function featureOrder(feature: string): number {
	const order: Record<string, number> = {
		"modes": 0,
		"sandbox": 1,
		"subagent": 2,
		"review-fixer": 3,
		"command-normalization": 4,
		"output-gate": 5,
		"codex-shared": 6,
		"codex-web-search": 7,
		"codex-limits": 8,
		"dashboard": 9,
		"model-optimizer": 10,
		"terminal": 11,
	};
	return order[feature] ?? 99;
}

export interface FeatureGroup {
	feature: string;
	items: EffectiveSetting[];
	startIndex: number;
}

/** Group effective settings by feature, sorted by stable sidebar order. */
export function buildFeatureGroups(items: EffectiveSetting[]): FeatureGroup[] {
	const groups: FeatureGroup[] = [];
	let current: FeatureGroup | null = null;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!current || current.feature !== item.feature) {
			current = { feature: item.feature, items: [], startIndex: i };
			groups.push(current);
		}
		current.items.push(item);
	}
	groups.sort((a, b) => featureOrder(a.feature) - featureOrder(b.feature));
	return groups;
}

// ─── Column layout ─────────────────────────────────────────────────

export interface SettingsColumns {
	key: number;
	value: number;
	source: number;
}

/** Calculate column widths for the settings list given available content width. */
export function settingsColumns(contentWidth: number): SettingsColumns {
	// Row padding (left 3 + right 1) and type icon take 6 cells.
	const available = Math.max(12, contentWidth - 6);
	const source = Math.max(4, Math.min(10, Math.floor(available * 0.18)));
	const key = Math.max(7, Math.min(24, Math.floor(available * 0.38)));
	const value = Math.max(1, available - key - source);
	return { key, value, source };
}

// ─── Thinking support ──────────────────────────────────────────────

/** Resolve the model item that drives thinking-level options for a mode. */
export function resolveModelForThinking(
	mode: string,
	items: EffectiveSetting[],
	drafts: Record<string, DraftChange>,
): { modelKey: string; model: ModelCatalogItem | undefined } {
	const modelItem = items.find(
		(i) => i.feature === "modes" && i.key === `models.${mode}`,
	);
	const draft = modelItem ? drafts[itemId(modelItem)] : undefined;
	const modelKey = draft?.raw ?? valueText(modelItem?.effectiveValue);
	return {
		modelKey,
		model: undefined, // callers use resolveModelMatch separately
	};
}

/** Find the model catalog entry for a provider/modelId string. */
export function resolveModelMatch(
	modelKey: string,
	models: ModelCatalogItem[],
): ModelCatalogItem | undefined {
	return models.find((m) => `${m.provider}/${m.modelId}` === modelKey);
}

/** Enum values for a thinking-level setting, scoped to the paired model. */
export function supportedThinking(
	models: ModelCatalogItem[],
	item: EffectiveSetting,
	items: EffectiveSetting[],
	drafts: Record<string, DraftChange>,
): string[] {
	const mode = item.key.split(".")[1];
	const { modelKey } = resolveModelForThinking(mode, items, drafts);
	const model = resolveModelMatch(modelKey, models);
	return model?.supportedThinkingLevels?.length
		? model.supportedThinkingLevels
		: (item.schema.enumValues ?? []);
}

// ─── Draft helpers ─────────────────────────────────────────────────

/** Resolve the display value for a setting, preferring draft when present. */
export function resolveDisplayValue(
	item: EffectiveSetting,
	drafts: Record<string, DraftChange>,
): string {
	const raw = drafts[itemId(item)]?.raw ?? valueText(item.effectiveValue);
	return displaySettingValue(item, raw);
}

/** Resolve the raw value (no mode-aware substitutions) for a setting, preferring draft. */
export function resolveRawValue(
	item: EffectiveSetting,
	drafts: Record<string, DraftChange>,
): string {
	return drafts[itemId(item)]?.raw ?? valueText(item.effectiveValue);
}

/** Count drafts that belong to a given feature. */
export function countDraftsForFeature(drafts: Record<string, DraftChange>, feature: string): number {
	let count = 0;
	for (const key of Object.keys(drafts)) {
		if (drafts[key].feature === feature) count++;
	}
	return count;
}

/** Count diagnostics across all items in a group. */
export function countDiagnosticsForFeature(items: EffectiveSetting[]): number {
	let count = 0;
	for (const item of items) {
		count += item.diagnostics.length;
	}
	return count;
}

/** Resolve thinking-level enum display for the detail panel. */
export function resolveThinkingEnumDisplay(
	item: EffectiveSetting,
	items: EffectiveSetting[],
	drafts: Record<string, DraftChange>,
	models: ModelCatalogItem[],
): string[] {
	if (!item.schema.enumValues || item.schema.enumValues.length === 0) return [];
	if (item.feature === "modes" && item.key.startsWith("thinking.")) {
		const mode = item.key.split(".")[1];
		const { modelKey } = resolveModelForThinking(mode, items, drafts);
		const thinkingModel = resolveModelMatch(modelKey, models);
		if (thinkingModel?.supportedThinkingLevels?.length) {
			return thinkingModel.supportedThinkingLevels;
		}
	}
	return item.schema.enumValues;
}

/** Resolve the model label for a thinking setting's paired model. */
export function resolveThinkingModelLabel(
	item: EffectiveSetting,
	items: EffectiveSetting[],
	drafts: Record<string, DraftChange>,
	models: ModelCatalogItem[],
): string {
	if (item.feature !== "modes" || !item.key.startsWith("thinking.")) return "";
	const mode = item.key.split(".")[1];
	const { modelKey } = resolveModelForThinking(mode, items, drafts);
	const model = resolveModelMatch(modelKey, models);
	return model ? `${model.label} (${model.providerLabel})` : modelKey;
}

/** Format string helpers */
export function pad(s: string, n: number): string {
	if (n <= 0) return "";
	if (s.length >= n) return truncate(s, Math.max(1, n - 1)) + " ";
	return s + " ".repeat(n - s.length);
}

export function truncate(s: string, max: number): string {
	if (max <= 0) return "";
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}
