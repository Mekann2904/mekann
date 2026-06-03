import type { FeatureSettingsSchema, SettingSchema } from "../settings/types.js";
import { SKILL_SURFACE_DEFINITIONS, skillSettingKey } from "./skills.js";

function skillVisibilitySetting(name: string, defaultValue: boolean): SettingSchema<boolean> {
	return {
		key: skillSettingKey(name),
		type: "boolean",
		defaultValue,
		description: `System prompt の available skills に ${name} を表示します。off でも /skill:${name} で明示起動できます。`,
		category: "Skill visibility",
		scopes: ["global", "workspace"],
		restartRequired: false,
		validate(value) {
			return typeof value === "boolean" ? [] : ["boolean である必要があります"];
		},
	};
}

export const skillSurfaceSettingsSchema: FeatureSettingsSchema = {
	feature: "skills",
	title: "Mekann Skills",
	settings: SKILL_SURFACE_DEFINITIONS.map((skill) => skillVisibilitySetting(skill.name, skill.defaultSurface === "on")),
};
