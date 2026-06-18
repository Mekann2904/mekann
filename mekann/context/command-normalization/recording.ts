import * as path from "node:path";
import type { CommandNormalizationKind } from "./command.js";
import { appendJsonlLine } from "../../utils/atomic-append.js";

export interface NormalizationRecord {
	version: 1;
	timestamp: string;
	toolCallId?: string;
	kind: CommandNormalizationKind;
	cwd: string;
	originalCommand: string;
	normalizedCommand: string;
	changed: boolean;
	result?: {
		outputBytes: number;
		isError?: boolean;
	};
}

export function commandNormalizationLogPath(cwd: string): string {
	return path.join(cwd, ".mekann", "command-normalization", "normalization.jsonl");
}

export async function appendNormalizationRecord(cwd: string, record: NormalizationRecord): Promise<void> {
	// Atomic across processes (issue #139): plain appendFile can interleave
	// JSONL lines when several pi processes normalize commands in one cwd.
	await appendJsonlLine(commandNormalizationLogPath(cwd), `${JSON.stringify(record)}\n`);
}
