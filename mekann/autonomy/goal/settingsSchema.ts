import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

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

export const goalSettingsSchema: FeatureSettingsSchema = {
	feature: "goal",
	title: "Goal",
	settings: [
		boolSetting("enabled", "General", true, "goal instructions、/goal command、goal tools を有効にします。false の場合、LLM-visible surface を登録しません。", true),
		toolSurfaceSetting,
	],
};
