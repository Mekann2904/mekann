import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

export interface RecordContextObservationInput {
	cwd?: string;
	sessionId?: string;
	phase: string;
	summary: Record<string, unknown>;
	at?: number;
}

/**
 * Best-effort observation seam for context-control monitoring.
 *
 * Feature modules publish observations here instead of importing the tracker or
 * web server directly. This keeps cacheable-context/output-gate/ledger from
 * depending on a particular monitoring surface.
 */
export async function recordContextObservation(input: RecordContextObservationInput): Promise<void> {
	try {
		const { recordContextMonitorSample } = await import("./context-tracker/server.js");
		recordContextMonitorSample(input);
	} catch {
		// Best-effort by contract: monitoring must not break the caller.
	}
}

function byteLen(value: unknown): number {
	if (typeof value === "string") return Buffer.byteLength(value, "utf8");
	try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return 0; }
}

export function recordToolRegistrationObservation(name: string, parameters: unknown): void {
	try {
		void import("./context-tracker/server.js").then(({ recordToolSchema }) => {
			recordToolSchema(name, byteLen(parameters ?? {}));
		}).catch(() => {});
	} catch {
		// Best-effort by contract: monitoring must not break the caller.
	}
}

export function registerContextTool<TParams extends TSchema, TDetails = unknown, TState = any>(pi: ExtensionAPI, tool: ToolDefinition<TParams, TDetails, TState>): void {
	pi.registerTool(tool);
	recordToolRegistrationObservation(String(tool.name ?? "unknown"), tool.parameters ?? {});
}
