/**
 * model-optimizer — context overflow recovery.
 *
 * Monitors assistant message_end events and delegates overflow detection
 * and rewriting to the active provider optimizer module.
 *
 * ## How pi detects overflow
 *
 * pi's isContextOverflow() (packages/ai/src/utils/overflow.ts) uses 22 regex
 * patterns including the generic fallback /context[_ ]length[_ ]exceeded/i.
 * Both OpenAI's "exceeds the context window" and our canonical
 * "context_length_exceeded:" prefix match this fallback.
 *
 * pi also has a small NON_OVERFLOW_PATTERNS guard excluding common
 * throttling and rate-limit strings.  Provider modules keep their own
 * detection narrow; a false positive not matching those exclusions would
 * still be treated as overflow after rewriting.
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

		const module = state.activeModule;
		if (!module) return;

		// We need a model object for the module methods.  Construct a minimal one.
		// The model was stored at applyModel time but the module methods need it.
		// Since state.provider/modelId/api are set, we can pass a stub.
		const modelStub = { provider: state.provider!, id: state.modelId!, api: state.api } as any;

		const detected = module.detectOverflow({ model: modelStub, errorMessage });
		if (!detected) return;

		state.metrics.overflowRecoveries++;

		const rewritten = module.rewriteOverflow({ model: modelStub, errorMessage });

		if (state.enableDebugLogging) {
			const providerName = ctx.modelRegistry?.getProviderDisplayName(state.provider ?? "")
				?? state.provider ?? "?";
			ctx.ui.notify(
				`model-optimizer: overflow detected for ${providerName} (api=${state.api ?? "?"}, module=${module.id})`,
				"info",
			);
		}

		return {
			message: {
				...event.message,
				errorMessage: rewritten,
			},
		};
	});
}
