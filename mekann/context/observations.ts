import { recordContextObservation as appendContextObservation } from "./context-control/store.js";
import type { ContextObservation } from "./context-control/observation.js";

export type RecordContextObservationInput = ContextObservation;

/**
 * Best-effort observation seam for context-control monitoring.
 *
 * Feature modules publish observations here instead of importing the tracker or
 * web server directly. This keeps cacheable-context/output-gate/ledger from
 * depending on a particular monitoring surface.
 */
export async function recordContextObservation(input: RecordContextObservationInput): Promise<void> {
	try {
		appendContextObservation(input);
	} catch {
		// Best-effort by contract: monitoring must not break the caller.
	}
}
