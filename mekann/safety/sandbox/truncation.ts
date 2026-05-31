import { MEKANN_SANDBOX_DEFAULTS } from "../../config.js";
import { featureConfig } from "../../settings/featureConfig.js";

export const DEFAULT_LLM_OUTPUT_MAX_BYTES = MEKANN_SANDBOX_DEFAULTS.llmOutputMaxBytes;
export const DEFAULT_LLM_OUTPUT_MAX_LINES = MEKANN_SANDBOX_DEFAULTS.llmOutputMaxLines;
export function getEffectiveLlmOutputMaxBytes(): number { return Number(featureConfig("sandbox").llmOutputMaxBytes) || DEFAULT_LLM_OUTPUT_MAX_BYTES; }
export function getEffectiveLlmOutputMaxLines(): number { return Number(featureConfig("sandbox").llmOutputMaxLines) || DEFAULT_LLM_OUTPUT_MAX_LINES; }

export interface TruncateForLlmOptions {
	maxBytes: number;
	maxLines: number;
}

export function truncateForLlm(
	text: string,
	opts: TruncateForLlmOptions = { maxBytes: getEffectiveLlmOutputMaxBytes(), maxLines: getEffectiveLlmOutputMaxLines() },
): { text: string; truncated: boolean; originalBytes: number; originalLines: number } {
	const originalBytes = Buffer.byteLength(text, "utf8");
	let lines = text.split(/\r?\n/);
	const originalLines = text.length === 0 ? 0 : lines.length;
	let truncated = false;

	if (lines.length > opts.maxLines) { lines = lines.slice(0, opts.maxLines); truncated = true; }
	let out = lines.join("\n");
	if (Buffer.byteLength(out, "utf8") > opts.maxBytes) { out = Buffer.from(out, "utf8").subarray(0, opts.maxBytes).toString("utf8").replace(/\uFFFD$/u, ""); truncated = true; }

	if (truncated) out += `\n\n[...出力が切り詰められました: 元の ${originalBytes} バイト、${originalLines} 行; 最大 ${opts.maxBytes} バイト / ${opts.maxLines} 行...]`;

	return { text: out, truncated, originalBytes, originalLines };
}
