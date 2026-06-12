import { enabledOnlySchema } from "../../settings/simpleSchema.js";

export const terminalShortcutsSettingsSchema = enabledOnlySchema(
	"terminal-shortcuts",
	"Terminal Shortcuts",
	"terminal shortcut handling を有効にします。false の場合、shortcut hooks を登録しません。",
);
