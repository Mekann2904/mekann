import type { EffectiveSetting, SettingsScope } from "../../settings/types.js";

export interface DraftChange {
	feature: string;
	key: string;
	scope: SettingsScope;
	raw: string;
}

export type SettingsEditorMode = "list" | "edit" | "models" | "diff";
export const ALL_FEATURE = "__all__";

export interface SettingsEditorState {
	selected: number;
	scope: SettingsScope;
	mode: SettingsEditorMode;
	buffer: string;
	modelSelected: number;
	drafts: Record<string, DraftChange>;
	message: string;
	activeFeature: string;
}

export function itemId(i: Pick<EffectiveSetting, "feature" | "key">): string {
	return `${i.feature}.${i.key}`;
}

export function initialSettingsEditorState(): SettingsEditorState {
	return {
		selected: 0,
		scope: "global",
		mode: "list",
		buffer: "",
		modelSelected: 0,
		drafts: {},
		message: "Welcome to Mekann Settings Editor",
		activeFeature: ALL_FEATURE,
	};
}

export function selectFeature(state: SettingsEditorState, feature: string, title: string): SettingsEditorState {
	return {
		...state,
		activeFeature: feature,
		selected: 0,
		mode: state.mode === "list" ? state.mode : "list",
		message: feature === ALL_FEATURE ? "Showing all settings" : `Switched to ${title}`,
	};
}

export function stageDraft(state: SettingsEditorState, item: EffectiveSetting, raw: string): SettingsEditorState {
	return {
		...state,
		drafts: { ...state.drafts, [itemId(item)]: { feature: item.feature, key: item.key, scope: state.scope, raw } },
		message: `staged ${itemId(item)} → ${state.scope}`,
	};
}

export function openEdit(state: SettingsEditorState, item: EffectiveSetting, shown: string): SettingsEditorState {
	return { ...state, buffer: shown === "(unset)" ? "" : shown, mode: "edit", message: `editing ${itemId(item)}` };
}

export function openModelPicker(state: SettingsEditorState): SettingsEditorState {
	return { ...state, modelSelected: 0, mode: "models", message: "pick a model" };
}

export function cancelEdit(state: SettingsEditorState): SettingsEditorState {
	return { ...state, mode: "list", message: "edit cancelled" };
}

export function toggleScope(state: SettingsEditorState): SettingsEditorState {
	const scope = state.scope === "global" ? "workspace" : "global";
	return { ...state, scope, message: `save scope → ${scope}` };
}

export function clearDraftsAfterApply(state: SettingsEditorState): SettingsEditorState {
	return { ...state, drafts: {}, message: "✓ applied — settings view refreshed" };
}
