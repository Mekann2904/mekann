import { extractAccountIdFromToken } from "./auth.js";

export interface CodexAccountSession {
	accessToken: string;
	accountId: string;
}

export type CodexAccessTokenProvider = () => Promise<string | undefined>;

export async function resolveCodexAccountSession(
	getAccessToken: CodexAccessTokenProvider,
	options: { missingTokenMessage: string; missingAccountIdMessage: string },
): Promise<CodexAccountSession> {
	const accessToken = await getAccessToken();
	if (!accessToken) throw new Error(options.missingTokenMessage);
	const accountId = extractAccountIdFromToken(accessToken);
	if (!accountId) throw new Error(options.missingAccountIdMessage);
	return { accessToken, accountId };
}
