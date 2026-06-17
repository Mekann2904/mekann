import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";
import { DEFAULT_OBJECTIVE_LENGTH, HARD_MAX_OBJECTIVE_LENGTH } from "./state.js";

const toolSurfaceValues = ["slash", "active", "always"] as const;

const toolSurfaceSetting: SettingSchema<string> = {
	key: "toolSurface",
	type: "enum",
	defaultValue: "slash",
	description: "goal model tools を LLM に見せる条件。slash は /goal command のみ、active は active goal 中のみ、always は常時。",
	category: "Context Surface",
	scopes: ["global", "workspace"],
	restartRequired: false,
	enumValues: [...toolSurfaceValues],
	validate(value) {
		return toolSurfaceValues.includes(value as any) ? [] : ["slash | active | always のいずれかです"];
	},
};

const maxObjectiveLengthSetting: SettingSchema<number> = {
	key: "maxObjectiveLength",
	type: "number",
	defaultValue: DEFAULT_OBJECTIVE_LENGTH,
	description: `goal objective の最大文字数。既定 ${DEFAULT_OBJECTIVE_LENGTH}（約25–32k token）。指定した値は sanity ceiling ${HARD_MAX_OBJECTIVE_LENGTH} でクランプされます。restart 不要。`,
	category: "Limits",
	scopes: ["global", "workspace"],
	restartRequired: false,
	validate(value) {
		const n = Number(value);
		if (!Number.isFinite(n) || !Number.isInteger(n)) return ["整数である必要があります"];
		if (n < 1 || n > HARD_MAX_OBJECTIVE_LENGTH) return [`1〜${HARD_MAX_OBJECTIVE_LENGTH} の範囲で指定してください`];
		return [];
	},
};

export const goalSettingsSchema: FeatureSettingsSchema = {
	feature: "goal",
	title: "Goal",
	settings: [
		boolSetting("enabled", "General", true, "goal instructions、/goal command、goal tools を有効にします。false の場合、LLM-visible surface を登録しません。", true),
		toolSurfaceSetting,
		maxObjectiveLengthSetting,
	],
};
