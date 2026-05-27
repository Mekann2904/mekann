/**
 * model-optimizer — context overflow recovery.
 *
 * Monitors assistant message_end events for provider-specific context-overflow
 * errors and rewrites the errorMessage to the canonical
 * "context_length_exceeded:" prefix so pi's built-in auto-compaction and retry
 * machinery can kick in.
 *
 * ## How pi detects overflow
 *
 * pi's isContextOverflow() (packages/ai/src/utils/overflow.ts) uses 22 regex
 * patterns including the generic fallback /context[_ ]length[_ ]exceeded/i.
 * Both OpenAI's "exceeds the context window" and our canonical
 * "context_length_exceeded:" prefix match this fallback.
 *
 * pi also has a small NON_OVERFLOW_PATTERNS guard excluding common
 * throttling and rate-limit strings.  We keep this extension's own regexes
 * narrow; a false positive not matching those exclusions would still be
 * treated as overflow after rewriting.
 *
 * ## How Codex does it
 *
 * Codex uses structured error.code == "context_length_exceeded" in its SSE
 * response parser (codex-api/src/sse/responses.rs).  pi extensions don't have
 * direct access to the structured error code, so we normalise provider-specific
 * message text into the canonical prefix.
 *
 * Safety rules:
 * - Only fires when state.enabled and state.overflowRecoveryEnabled are true.
 * - Only touches assistant messages with stopReason === "error".
 * - Never rewrites rate-limit, auth, timeout, or network errors.
 * - Idempotent: skips messages already starting with "context_length_exceeded:".
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ActiveOptimizationState } from "./types.js";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerOverflowRecovery(
	pi: ExtensionAPI,
	state: ActiveOptimizationState,
): void {
	pi.on("message_end", (event, ctx: ExtensionContext) => {
		if (!state.enabled) return;
		if (!state.overflowRecoveryEnabled) return;
		if (event.message.role !== "assistant") return;
		if (event.message.stopReason !== "error") return;

		const errorMessage = event.message.errorMessage ?? "";
		if (!errorMessage) return;

		// Already canonical — avoid double prefix
		if (errorMessage.startsWith("context_length_exceeded:")) return;

		const profile = state.profile;
		if (!profile) return;

		const matched = profile.overflowPatterns.some((pattern) =>
			pattern.test(errorMessage),
		);
		if (!matched) return;

		state.metrics.overflowRecoveries++;

		if (state.enableDebugLogging) {
			ctx.ui.notify(
				`model-optimizer: overflow detected for ${profile.displayName}`,
				"info",
			);
		}

		return {
			message: {
				...event.message,
				errorMessage: `context_length_exceeded: ${errorMessage}`,
			},
		};
	});
}
