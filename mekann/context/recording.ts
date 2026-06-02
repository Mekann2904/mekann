import { appendContextEvent } from "./ledger/store.js";

export interface RecordToolOutputArtifactInput {
	cwd: string;
	toolName: string;
	artifactId: string;
	originalBytes: number;
	originalLines: number;
	isError?: boolean;
	sessionId?: string;
	turnId?: string;
	toolCallId?: string;
	branchId?: string;
}

/**
 * Best-effort seam for features that observe runtime context facts.
 *
 * Callers pass domain facts, not context-ledger storage details. Recording
 * failures are intentionally swallowed so the observing feature can keep its
 * primary responsibility, such as preserving large raw output in output-gate.
 */
export async function recordToolOutputArtifact(input: RecordToolOutputArtifactInput): Promise<void> {
	try {
		await appendContextEvent({
			cwd: input.cwd,
			kind: "tool_result",
			priority: input.isError ? 1 : 3,
			title: `${input.toolName} output stored`,
			summary: `Large ${input.toolName} output stored as ${input.artifactId} (${input.originalBytes} bytes, ${input.originalLines} lines)`,
			evidenceLevel: "tool_reported",
			refs: [{ type: "artifact", value: input.artifactId, role: "output" }],
			sessionId: input.sessionId,
			turnId: input.turnId,
			toolCallId: input.toolCallId,
			branchId: input.branchId,
		});
	} catch {
		// Best-effort by contract: context recording must not break the caller.
	}
}
