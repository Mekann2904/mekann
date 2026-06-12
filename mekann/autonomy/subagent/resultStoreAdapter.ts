/**
 * ResultStoreAdapter — read-only seam for semantic conflict log.
 *
 * The pipeline reads the log to detect conflicts but does not
 * mutate the store directly. Mutation stays in ApplyQueue.
 */

import type { SemanticApplyLogEntry } from "./types.js";
import type { SubagentResultStore } from "./resultStore.js";

export interface SemanticConflictLogReader {
	readSemanticLog(): SemanticApplyLogEntry[];
}

export class ResultStoreSemanticLogReader implements SemanticConflictLogReader {
	constructor(private readonly store: SubagentResultStore) {}

	readSemanticLog(): SemanticApplyLogEntry[] {
		return this.store.readSemanticLog();
	}
}
