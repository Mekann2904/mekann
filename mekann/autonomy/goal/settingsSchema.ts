import { enabledOnlySchema } from "../../settings/simpleSchema.js";

export const goalSettingsSchema = enabledOnlySchema(
	"goal",
	"Goal",
	"goal instructions、/goal command、goal tools を有効にします。false の場合、LLM-visible surface を登録しません。",
);
