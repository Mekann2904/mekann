import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { OutputBudgetKind } from "./formatters.js";

export interface NormalizationRecord {
	version: 1;
	timestamp: string;
	toolCallId?: string;
	kind: OutputBudgetKind;
	cwd: string;
	originalCommand: string;
	normalizedCommand: string;
	changed: boolean;
	result?: {
		originalBytes: number;
		compactBytes?: number;
		compacted: boolean;
		isError?: boolean;
	};
}

export function outputBudgetLogPath(cwd: string): string {
	return path.join(cwd, ".mekann", "output-budget", "normalization.jsonl");
}

export async function appendNormalizationRecord(cwd: string, record: NormalizationRecord): Promise<void> {
	const file = outputBudgetLogPath(cwd);
	await fsp.mkdir(path.dirname(file), { recursive: true });
	await fsp.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
}
