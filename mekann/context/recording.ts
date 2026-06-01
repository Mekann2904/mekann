import { appendContextEvent } from "./ledger/store.js";

export interface RecordContextObservationInput {
	cwd?: string;
	sessionId?: string;
	phase: string;
	summary: Record<string, unknown>;
	at?: number;
}

function byteLen(value: unknown): number {
	if (typeof value === "string") return Buffer.byteLength(value, "utf8");
	try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return 0; }
}

/**
 * Best-effort observation seam for context-control features.
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

export async function recordToolSchemaObservation(name: string, parameters: unknown): Promise<void> {
	try {
		const { recordToolSchema } = await import("./context-tracker/server.js");
		recordToolSchema(name, byteLen(parameters ?? {}));
	} catch {
		// Best-effort by contract: monitoring must not break the caller.
	}
}

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
