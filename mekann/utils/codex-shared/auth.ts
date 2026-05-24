/**
 * Codex authentication helpers.
 *
 * Framework-independent. No Pi imports.
 */

const ACCOUNT_ID_CLAIM = "https://api.openai.com/auth";

/**
 * Extract the ChatGPT account ID from a JWT access token.
 * Returns undefined if the token is malformed or missing the claim.
 */
export function extractAccountIdFromToken(token: string): string | undefined {
	const parts = token.split(".");
	if (parts.length !== 3) return undefined;

	try {
		const payload = JSON.parse(
			Buffer.from(parts[1] ?? "", "base64url").toString("utf8"),
		) as { [ACCOUNT_ID_CLAIM]?: { chatgpt_account_id?: unknown } };
		const accountId = payload[ACCOUNT_ID_CLAIM]?.chatgpt_account_id;
		return typeof accountId === "string" && accountId.length > 0
			? accountId
			: undefined;
	} catch {
		return undefined;
	}
}
