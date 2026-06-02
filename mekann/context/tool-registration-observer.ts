import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function byteLen(value: unknown): number {
	if (typeof value === "string") return Buffer.byteLength(value, "utf8");
	try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return 0; }
}

function recordToolRegistrationObservation(name: string, parameters: unknown): void {
	try {
		void import("./context-tracker/server.js").then(({ recordToolSchema }) => {
			recordToolSchema(name, byteLen(parameters ?? {}));
		}).catch(() => {});
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
		registerTool(tool);
		recordToolRegistrationObservation(String(tool.name ?? "unknown"), tool.parameters ?? {});
	}) as ExtensionAPI["registerTool"];
}
