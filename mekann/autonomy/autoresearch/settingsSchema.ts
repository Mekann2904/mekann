import { enabledOnlySchema } from "../../settings/simpleSchema.js";

export const autoresearchSettingsSchema = enabledOnlySchema(
	"autoresearch",
	"Autoresearch",
	"autoresearch instructions、commands、tools を有効にします。false の場合、LLM-visible surface を登録しません。",
);
