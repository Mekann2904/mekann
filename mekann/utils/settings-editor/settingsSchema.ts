import { enabledOnlySchema } from "../../settings/simpleSchema.js";

export const settingsEditorSettingsSchema = enabledOnlySchema(
	"settings-editor",
	"Settings Editor",
	"/mekann-settings command を有効にします。false の場合、settings editor command を登録しません。",
);
