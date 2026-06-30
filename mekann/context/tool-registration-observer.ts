import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { canonicalizeJson } from "../core/prompt-core/index.js";
import { safeByteLen } from "../utils/safe-bytes/index.js";
import { recordToolSchemaCurrent } from "./context-control/tool-schemas.js";

function recordToolRegistrationObservation(name: string, parameters: unknown): void {
	try {
		// canonicalizeJson gives a stable representation so the same logical schema
		// always reports the same byte length; safeByteLen never collapses to 0
		// even if canonicalization throws (cyclic parameters, BigInt, etc.).
		recordToolSchemaCurrent(name, safeByteLen(parameters ?? {}, canonicalizeJson));
	} catch {
		// Best-effort by contract: monitoring must not break the caller.
	}
}

const decoratedApis = new WeakSet<ExtensionAPI>();

/**
 * Instrument Pi's tool-registration boundary once.
 *
 * Context tracker measures the total LLM-visible tool schema surface, so this
 * intentionally observes every Mekann tool registered after startup
 * instrumentation, not only tools owned by the context suite.
 */
export function observeToolRegistrations(pi: ExtensionAPI): void {
	if (decoratedApis.has(pi)) return;
	decoratedApis.add(pi);
	const registerTool = pi.registerTool.bind(pi);
	pi.registerTool = ((tool: Parameters<ExtensionAPI["registerTool"]>[0]) => {
		const result = registerTool(tool);
		recordToolRegistrationObservation(String(tool.name ?? "unknown"), tool.parameters ?? {});
		return result;
	}) as ExtensionAPI["registerTool"];
}
