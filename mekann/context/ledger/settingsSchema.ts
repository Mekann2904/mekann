import { enabledOnlySchema } from "../../settings/simpleSchema.js";

export const contextLedgerSettingsSchema = enabledOnlySchema(
	"context-ledger",
	"Context Ledger",
	"context-ledger tools と command を有効にします。false の場合、LLM-visible search/snapshot tools を登録しません。",
);
