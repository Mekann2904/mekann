import { boolSetting } from "../../settings/simpleSchema.js";
import type { FeatureSettingsSchema, SettingSchema } from "../../settings/types.js";

const toolSurfaceValues = ["active", "always"] as const;

const toolSurfaceSetting: SettingSchema<string> = {
	key: "toolSurface",
	type: "enum",
	defaultValue: "active",
	description: "autoresearch model tools を LLM に見せる条件。active は /autoresearch on や scale 実行中のみ、always は常時。",
	category: "Context Surface",
	scopes: ["global", "workspace"],
	restartRequired: false,
	enumValues: [...toolSurfaceValues],
	validate(value) {
		return toolSurfaceValues.includes(value as any) ? [] : ["active | always のいずれかです"];
	},
};

export const autoresearchSettingsSchema: FeatureSettingsSchema = {
	feature: "autoresearch",
	title: "Autoresearch",
	settings: [
		boolSetting("enabled", "General", true, "autoresearch instructions、commands、tools を有効にします。false の場合、LLM-visible surface を登録しません。", true),
		toolSurfaceSetting,
	],
};
