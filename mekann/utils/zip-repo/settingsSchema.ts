import { enabledOnlySchema } from "../../settings/simpleSchema.js";

export const zipRepoSettingsSchema = enabledOnlySchema(
	"zip-repo",
	"Zip Repo",
	"/zip command を有効にします。false の場合、zip utility command を登録しません。",
);
