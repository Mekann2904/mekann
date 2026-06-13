import { describe, expect, it } from "vitest";
import type { EffectiveSetting, SettingSchema } from "../../settings/types.js";
import type { ModelCatalogItem } from "./model-ipc.js";
import type { DraftChange } from "./state.js";
import {
	buildFeatureGroups,
	countDiagnosticsForFeature,
	countDraftsForFeature,
	displaySettingKey,
	displaySettingValue,
	featureOrder,
	featureTitle,
	modeFromSetting,
	modeLabel,
	pad,
	resolveDisplayValue,
	resolveModelForThinking,
	resolveModelMatch,
	resolveRawValue,
	resolveThinkingEnumDisplay,
	resolveThinkingModelLabel,
	settingsColumns,
	supportedThinking,
	truncate,
	valueText,
} from "./viewModel.js";

// ─── Helpers for constructing test data ────────────────────────────

function makeSetting(overrides: Partial<EffectiveSetting> & Pick<EffectiveSetting, "feature" | "key">): EffectiveSetting {
	return {
		schema: { key: overrides.key, type: "string", defaultValue: "", description: "", category: "", scopes: ["global", "workspace"], restartRequired: false, validate: () => [] } satisfies SettingSchema,
		defaultValue: "",
		effectiveValue: overrides.effectiveValue ?? "",
		source: overrides.source ?? "default",
		diagnostics: overrides.diagnostics ?? [],
		...overrides,
	};
}

function makeModelRefSetting(feature: string, key: string, effectiveValue: unknown, diagnostics: string[] = []): EffectiveSetting {
	return makeSetting({
		feature,
		key,
		effectiveValue,
		diagnostics,
		schema: { key, type: "modelRef", defaultValue: undefined, description: "", category: "", scopes: ["global", "workspace"], restartRequired: false, validate: () => [] } satisfies SettingSchema,
		defaultValue: undefined,
	});
}

function makeEnumSetting(feature: string, key: string, enumValues: string[], effectiveValue?: string): EffectiveSetting {
	return makeSetting({
		feature,
		key,
		effectiveValue: effectiveValue ?? enumValues[0],
		schema: { key, type: "enum", defaultValue: enumValues[0], description: "", category: "", scopes: ["global", "workspace"], restartRequired: false, validate: () => [], enumValues } satisfies SettingSchema,
	});
}

function makeCatalogItem(provider: string, modelId: string, thinking: string[] = []): ModelCatalogItem {
	return {
		provider,
		modelId,
		label: `${provider} ${modelId}`,
		providerLabel: provider.charAt(0).toUpperCase() + provider.slice(1),
		reasoning: thinking.length > 0,
		supportedThinkingLevels: thinking,
		input: ["text"],
		source: "runtime",
		available: true,
	};
}

// ─── valueText ─────────────────────────────────────────────────────

describe("valueText", () => {
	it("shows (unset) for undefined", () => {
		expect(valueText(undefined)).toBe("(unset)");
	});

	it("shows (null) for null", () => {
		expect(valueText(null)).toBe("(null)");
	});

	it("formats modelRef objects as provider/modelId", () => {
		expect(valueText({ provider: "openai", modelId: "gpt-4" })).toBe("openai/gpt-4");
	});

	it("JSON-stringifies other objects", () => {
		expect(valueText({ foo: 1 })).toBe('{"foo":1}');
	});

	it("converts primitives to string", () => {
		expect(valueText(42)).toBe("42");
		expect(valueText(true)).toBe("true");
		expect(valueText("hello")).toBe("hello");
	});
});

// ─── displaySettingKey ─────────────────────────────────────────────

describe("displaySettingKey", () => {
	it("shows 'Model' for modes.models.<mode>", () => {
		expect(displaySettingKey(makeSetting({ feature: "modes", key: "models.main" }))).toBe("Model");
	});

	it("shows 'Thinking' for modes.thinking.<mode>", () => {
		expect(displaySettingKey(makeSetting({ feature: "modes", key: "thinking.sub" }))).toBe("Thinking");
	});

	it("returns raw key for non-modes feature", () => {
		expect(displaySettingKey(makeSetting({ feature: "sandbox", key: "enabled" }))).toBe("enabled");
	});

	it("returns raw key for modes keys that are not models/thinking", () => {
		expect(displaySettingKey(makeSetting({ feature: "modes", key: "other.main" }))).toBe("other.main");
	});
});

// ─── displaySettingValue ───────────────────────────────────────────

describe("displaySettingValue", () => {
	it("replaces (unset) for models.<mode> with inherit message", () => {
		expect(displaySettingValue(makeSetting({ feature: "modes", key: "models.main" }), "(unset)")).toBe("inherit current model");
	});

	it("replaces (unset) for thinking.<mode> with inherit message", () => {
		expect(displaySettingValue(makeSetting({ feature: "modes", key: "thinking.main" }), "(unset)")).toBe("inherit current thinking");
	});

	it("passes through non-unset values unchanged", () => {
		expect(displaySettingValue(makeSetting({ feature: "modes", key: "models.main" }), "openai/gpt-4")).toBe("openai/gpt-4");
	});

	it("passes through values for non-modes features", () => {
		expect(displaySettingValue(makeSetting({ feature: "sandbox", key: "enabled" }), "(unset)")).toBe("(unset)");
	});
});

// ─── modeLabel ─────────────────────────────────────────────────────

describe("modeLabel", () => {
	it("maps known modes", () => {
		expect(modeLabel("main")).toBe("Main");
		expect(modeLabel("sub")).toBe("Subagent");
		expect(modeLabel("auto")).toBe("Auto");
		expect(modeLabel("read_only")).toBe("Read-only");
	});

	it("passes through unknown modes", () => {
		expect(modeLabel("custom")).toBe("custom");
	});
});

// ─── modeFromSetting ───────────────────────────────────────────────

describe("modeFromSetting", () => {
	it("extracts mode from modes feature", () => {
		expect(modeFromSetting(makeSetting({ feature: "modes", key: "models.main" }))).toBe("main");
		expect(modeFromSetting(makeSetting({ feature: "modes", key: "thinking.sub" }))).toBe("sub");
	});

	it("returns undefined for non-modes feature", () => {
		expect(modeFromSetting(makeSetting({ feature: "sandbox", key: "enabled" }))).toBeUndefined();
	});
});

// ─── featureTitle ──────────────────────────────────────────────────

describe("featureTitle", () => {
	it("maps known features", () => {
		expect(featureTitle("modes")).toBe("Collaboration Modes");
		expect(featureTitle("sandbox")).toBe("Sandbox");
		expect(featureTitle("review-fixer")).toBe("Review Fixer");
	});

	it("passes through unknown features", () => {
		expect(featureTitle("unknown-feature")).toBe("unknown-feature");
	});
});

// ─── featureOrder ──────────────────────────────────────────────────

describe("featureOrder", () => {
	it("orders modes before sandbox", () => {
		expect(featureOrder("modes")).toBeLessThan(featureOrder("sandbox"));
	});

	it("defaults unknown features to 99", () => {
		expect(featureOrder("nonexistent")).toBe(99);
	});
});

// ─── buildFeatureGroups ────────────────────────────────────────────

describe("buildFeatureGroups", () => {
	it("groups settings by feature", () => {
		const items = [
			makeSetting({ feature: "sandbox", key: "a" }),
			makeSetting({ feature: "sandbox", key: "b" }),
			makeSetting({ feature: "modes", key: "c" }),
		];
		const groups = buildFeatureGroups(items);
		// modes comes before sandbox in order
		expect(groups).toHaveLength(2);
		expect(groups[0].feature).toBe("modes");
		expect(groups[0].items).toHaveLength(1);
		expect(groups[1].feature).toBe("sandbox");
		expect(groups[1].items).toHaveLength(2);
	});

	it("sets startIndex correctly", () => {
		const items = [
			makeSetting({ feature: "modes", key: "a" }),
			makeSetting({ feature: "modes", key: "b" }),
			makeSetting({ feature: "sandbox", key: "c" }),
		];
		const groups = buildFeatureGroups(items);
		expect(groups[0].startIndex).toBe(0); // modes sorted first
		expect(groups[1].startIndex).toBe(2);
	});

	it("returns empty array for empty input", () => {
		expect(buildFeatureGroups([])).toEqual([]);
	});
});

// ─── settingsColumns ───────────────────────────────────────────────

describe("settingsColumns", () => {
	it("allocates all width to key/value/source", () => {
		const cols = settingsColumns(80);
		// 80 - 6 padding = 74 available
		expect(cols.key + cols.value + cols.source).toBe(74);
	});

	it("clamps minimum width for very narrow terminals", () => {
		const cols = settingsColumns(20);
		expect(cols.key).toBeGreaterThanOrEqual(7);
		expect(cols.value).toBeGreaterThanOrEqual(1);
		expect(cols.source).toBeGreaterThanOrEqual(4);
	});
});

// ─── resolveModelForThinking ───────────────────────────────────────

describe("resolveModelForThinking", () => {
	it("finds the paired model item and resolves draft first", () => {
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		const items = [modelItem];
		const drafts: Record<string, DraftChange> = {
			"modes.models.main": { feature: "modes", key: "models.main", scope: "global", raw: "anthropic/claude-3" },
		};
		const result = resolveModelForThinking("main", items, drafts);
		expect(result.modelKey).toBe("anthropic/claude-3");
	});

	it("falls back to effective value when no draft", () => {
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		const items = [modelItem];
		const result = resolveModelForThinking("main", items, {});
		expect(result.modelKey).toBe("openai/gpt-4");
	});

	it("returns (unset) when no model item found", () => {
		const result = resolveModelForThinking("main", [], {});
		expect(result.modelKey).toBe("(unset)");
	});
});

// ─── resolveModelMatch ─────────────────────────────────────────────

describe("resolveModelMatch", () => {
	it("finds a matching model", () => {
		const models = [makeCatalogItem("openai", "gpt-4"), makeCatalogItem("anthropic", "claude-3")];
		expect(resolveModelMatch("openai/gpt-4", models)?.modelId).toBe("gpt-4");
	});

	it("returns undefined for no match", () => {
		expect(resolveModelMatch("unknown/model", [makeCatalogItem("openai", "gpt-4")])).toBeUndefined();
	});
});

// ─── supportedThinking ─────────────────────────────────────────────

describe("supportedThinking", () => {
	it("returns model-specific thinking levels when model is found", () => {
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		const thinkingItem = makeEnumSetting("modes", "thinking.main", ["low", "medium", "high"]);
		const items = [modelItem, thinkingItem];
		const models = [makeCatalogItem("openai", "gpt-4", ["low", "medium", "high", "extended"])];
		const result = supportedThinking(models, thinkingItem, items, {});
		expect(result).toEqual(["low", "medium", "high", "extended"]);
	});

	it("falls back to schema enumValues when model has no thinking levels", () => {
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		const thinkingItem = makeEnumSetting("modes", "thinking.main", ["low", "medium", "high"]);
		const items = [modelItem, thinkingItem];
		const models = [makeCatalogItem("openai", "gpt-4")]; // no thinking levels
		const result = supportedThinking(models, thinkingItem, items, {});
		expect(result).toEqual(["low", "medium", "high"]);
	});

	it("falls back to schema enumValues when no model found", () => {
		const thinkingItem = makeEnumSetting("modes", "thinking.main", ["low", "high"]);
		const result = supportedThinking([], thinkingItem, [], {});
		expect(result).toEqual(["low", "high"]);
	});
});

// ─── resolveDisplayValue ───────────────────────────────────────────

describe("resolveDisplayValue", () => {
	it("prefers draft value", () => {
		const item = makeSetting({ feature: "sandbox", key: "enabled", effectiveValue: true });
		const drafts: Record<string, DraftChange> = {
			"sandbox.enabled": { feature: "sandbox", key: "enabled", scope: "global", raw: "false" },
		};
		expect(resolveDisplayValue(item, drafts)).toBe("false");
	});

	it("applies mode-aware substitution", () => {
		const item = makeSetting({ feature: "modes", key: "models.main", effectiveValue: undefined });
		expect(resolveDisplayValue(item, {})).toBe("inherit current model");
	});

	it("shows effective value when no draft", () => {
		const item = makeSetting({ feature: "sandbox", key: "enabled", effectiveValue: true });
		expect(resolveDisplayValue(item, {})).toBe("true");
	});
});

// ─── resolveRawValue ───────────────────────────────────────────────

describe("resolveRawValue", () => {
	it("prefers draft raw", () => {
		const item = makeSetting({ feature: "sandbox", key: "enabled", effectiveValue: true });
		const drafts: Record<string, DraftChange> = {
			"sandbox.enabled": { feature: "sandbox", key: "enabled", scope: "global", raw: "false" },
		};
		expect(resolveRawValue(item, drafts)).toBe("false");
	});

	it("falls back to valueText of effectiveValue", () => {
		const item = makeSetting({ feature: "sandbox", key: "enabled", effectiveValue: true });
		expect(resolveRawValue(item, {})).toBe("true");
	});
});

// ─── countDraftsForFeature ─────────────────────────────────────────

describe("countDraftsForFeature", () => {
	it("counts only drafts matching the feature", () => {
		const drafts: Record<string, DraftChange> = {
			"sandbox.enabled": { feature: "sandbox", key: "enabled", scope: "global", raw: "false" },
			"sandbox.bashMode": { feature: "sandbox", key: "bashMode", scope: "global", raw: "unsandboxed" },
			"modes.models.main": { feature: "modes", key: "models.main", scope: "global", raw: "openai/gpt-4" },
		};
		expect(countDraftsForFeature(drafts, "sandbox")).toBe(2);
		expect(countDraftsForFeature(drafts, "modes")).toBe(1);
		expect(countDraftsForFeature(drafts, "unknown")).toBe(0);
	});
});

// ─── countDiagnosticsForFeature ────────────────────────────────────

describe("countDiagnosticsForFeature", () => {
	it("sums diagnostics across all items", () => {
		const items = [
			makeSetting({ feature: "sandbox", key: "a", diagnostics: ["warn1"] }),
			makeSetting({ feature: "sandbox", key: "b", diagnostics: ["warn2", "warn3"] }),
		];
		expect(countDiagnosticsForFeature(items)).toBe(3);
	});

	it("returns 0 for items with no diagnostics", () => {
		const items = [makeSetting({ feature: "sandbox", key: "a" })];
		expect(countDiagnosticsForFeature(items)).toBe(0);
	});
});

// ─── resolveThinkingEnumDisplay ────────────────────────────────────

describe("resolveThinkingEnumDisplay", () => {
	it("returns model-specific thinking levels when model found", () => {
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		const thinkingItem = makeEnumSetting("modes", "thinking.main", ["low", "medium", "high"]);
		const models = [makeCatalogItem("openai", "gpt-4", ["low", "medium", "high", "extended"])];
		const result = resolveThinkingEnumDisplay(thinkingItem, [modelItem, thinkingItem], {}, models);
		expect(result).toEqual(["low", "medium", "high", "extended"]);
	});

	it("returns schema enumValues when not a thinking setting", () => {
		const item = makeEnumSetting("sandbox", "bashMode", ["sandboxed", "unsandboxed"]);
		expect(resolveThinkingEnumDisplay(item, [], {}, [])).toEqual(["sandboxed", "unsandboxed"]);
	});

	it("returns empty array when no enumValues", () => {
		const item = makeSetting({ feature: "sandbox", key: "enabled" });
		expect(resolveThinkingEnumDisplay(item, [], {}, [])).toEqual([]);
	});
});

// ─── resolveThinkingModelLabel ─────────────────────────────────────

describe("resolveThinkingModelLabel", () => {
	it("returns empty string for non-thinking setting", () => {
		const item = makeSetting({ feature: "modes", key: "models.main" });
		expect(resolveThinkingModelLabel(item, [], {}, [])).toBe("");
	});

	it("returns model label when found", () => {
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		const thinkingItem = makeSetting({ feature: "modes", key: "thinking.main" });
		const models = [makeCatalogItem("openai", "gpt-4")];
		expect(resolveThinkingModelLabel(thinkingItem, [modelItem], {}, models)).toBe("openai gpt-4 (Openai)");
	});

	it("returns raw key when model not found", () => {
		const thinkingItem = makeSetting({ feature: "modes", key: "thinking.main" });
		const modelItem = makeModelRefSetting("modes", "models.main", { provider: "openai", modelId: "gpt-4" });
		expect(resolveThinkingModelLabel(thinkingItem, [modelItem], {}, [])).toBe("openai/gpt-4");
	});
});

// ─── pad / truncate ────────────────────────────────────────────────

describe("pad", () => {
	it("pads short strings", () => {
		expect(pad("hi", 5)).toBe("hi   ");
	});

	it("truncates and adds trailing space for long strings", () => {
		expect(pad("hello world", 5)).toBe("hel… ");
	});

	it("returns empty for non-positive width", () => {
		expect(pad("hi", 0)).toBe("");
		expect(pad("hi", -1)).toBe("");
	});
});

describe("truncate", () => {
	it("passes through short strings", () => {
		expect(truncate("hi", 5)).toBe("hi");
	});

	it("truncates with ellipsis for long strings", () => {
		expect(truncate("hello world", 5)).toBe("hell…");
	});

	it("returns empty for non-positive max", () => {
		expect(truncate("hi", 0)).toBe("");
	});
});
