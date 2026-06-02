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
