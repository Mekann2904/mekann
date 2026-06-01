import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { CommandNormalizationKind } from "./command.js";

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
	const file = commandNormalizationLogPath(cwd);
	await fsp.mkdir(path.dirname(file), { recursive: true });
	await fsp.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}
