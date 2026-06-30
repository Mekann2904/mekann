/**
 * Output-gate savings aggregation for the cache-friendly-prompt report.
 *
 * Reads context-ledger `tool_result` events emitted by output-gate
 * (`mekann/context/output-gate`) and aggregates how much raw tool output was
 * externalized out of the inline conversation into searchable artifacts.
 *
 * This module deliberately avoids importing the context-ledger or output-gate
 * packages so cache-friendly-prompt stays self-contained. It only consumes the
 * minimal event shape it needs (`kind`, `summary`, `createdAt`), which makes the
 * aggregation pure and trivially unit-testable.
 *
 * Event summary format (from `mekann/context/recording.ts`):
 *   "Large <toolName> output stored as og_<id> (<bytes> bytes, <lines> lines)"
 *   "Large <toolName> output stored as og_<id> (<bytes> bytes, <lines> lines, stub <stubBytes> bytes)"
 *
 * The `, stub <stubBytes> bytes` segment was added so the report can compute the
 * real inline-reduction rate instead of a threshold-baseline proxy. Legacy
 * events without it fall back to the preview-bytes default.
 */

export interface OutputGateLedgerEvent {
	kind: string;
	title?: string;
	summary?: string;
	createdAt?: number;
}

export interface ParsedOutputGateEvent {
	toolName: string;
	artifactId: string;
	bytes: number;
	lines: number;
	/** Inline stub bytes when recorded in the summary; null for legacy events. */
	stubBytes: number | null;
}

export interface OutputGateToolBreakdown {
	count: number;
	bytes: number;
}

export interface OutputGateSavings {
	/** 外部化件数: number of tool outputs externalized (stubbed). */
	count: number;
	/** 外部化 bytes: sum of originalBytes across externalized outputs. */
	totalBytes: number;
	/** Gate threshold used as the relative baseline (default 48 KiB). */
	thresholdBytes: number;
	/** Mean originalBytes per externalization, null when count is 0. */
	avgBytes: number | null;
	/** Bytes beyond the threshold baseline (totalBytes - thresholdBytes * count). */
	savingsBeyondThresholdBytes: number;
	/**
	 * stub化率（閾値超過削減率）: share of externalized bytes beyond the
	 * threshold baseline, i.e. (totalBytes - thresholdBytes * count) / totalBytes.
	 * In [0, 1]. Null when there are no externalized bytes. This is a
	 * threshold-baseline proxy, NOT the true inline-reduction rate; when most
	 * externalized outputs sit just above the threshold it collapses toward 0
	 * and underreports savings. Kept for backward compatibility — prefer
	 * `inlineReductionRate`.
	 */
	stubRate: number | null;
	/** Preview-bytes fallback used for legacy events lacking `stub N bytes`. */
	fallbackStubBytes: number;
	/** Estimated total inline stub bytes (measured where available, else fallback). */
	totalStubBytes: number;
	/** Sum of measured stub bytes (events that recorded `stub N bytes`). */
	measuredStubBytes: number;
	/** Number of events whose stub bytes were measured (not fallback). */
	measuredStubEvents: number;
	/**
	 * 真の inline 削減率: (totalBytes - totalStubBytes) / totalBytes. In [0, 1].
	 * Share of conversation bytes actually removed by externalization, using
	 * measured stub bytes when recorded and the preview-bytes fallback
	 * otherwise. Null when there are no externalized bytes. This is the
	 * primary savings metric; `stubRate` is a legacy proxy.
	 */
	inlineReductionRate: number | null;
	/** Most recent externalization timestamp (ISO), null when count is 0. */
	latestTimestamp: string | null;
	/** Externalization count and bytes broken down by tool name. */
	byTool: Record<string, OutputGateToolBreakdown>;
}

/**
 * Default output-gate inline threshold. Mirrors
 * `MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes` in `mekann/config.ts`. Kept as a
 * local constant so this report package does not cross package boundaries; if
 * the runtime default changes, update this together with the glossary wording.
 */
export const OUTPUT_GATE_DEFAULT_THRESHOLD_BYTES = 48 * 1024;

/**
 * Default output-gate inline preview size. Mirrors
 * `MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes` in `mekann/config.ts`. Used as the
 * stub-bytes fallback for legacy events that predate `stub N bytes` recording,
 * so the inline-reduction rate stays meaningful on historical logs.
 */
export const OUTPUT_GATE_DEFAULT_PREVIEW_BYTES = 8 * 1024;

/**
 * Matches output-gate tool_result summaries recorded by
 * `recordToolOutputArtifact`. Anchored end-to-end so unrelated `tool_result`
 * events (if any are added later) are ignored. The `, stub N bytes` tail is
 * optional for backward compatibility with events recorded before stub-byte
 * tracking landed.
 */
const OUTPUT_GATE_SUMMARY_RE =
	/^Large (?<tool>\S+) output stored as (?<artifact>og_[a-z0-9]+_[a-z0-9]+(?:_[a-z0-9]+)?) \((?<bytes>\d+) bytes, (?<lines>\d+) lines(?:, stub (?<stubBytes>\d+) bytes)?\)$/;

export function parseOutputGateEvent(event: OutputGateLedgerEvent): ParsedOutputGateEvent | null {
	if (event.kind !== "tool_result") return null;
	const match = OUTPUT_GATE_SUMMARY_RE.exec(event.summary ?? "");
	if (!match?.groups) return null;
	const bytes = Number(match.groups.bytes);
	const lines = Number(match.groups.lines);
	if (!Number.isFinite(bytes) || !Number.isFinite(lines)) return null;
	const stubBytesRaw = match.groups.stubBytes;
	const stubBytes = stubBytesRaw !== undefined && Number.isFinite(Number(stubBytesRaw)) ? Number(stubBytesRaw) : null;
	return { toolName: match.groups.tool, artifactId: match.groups.artifact, bytes, lines, stubBytes };
}

export function summarizeOutputGateSavings(
	events: OutputGateLedgerEvent[],
	thresholdBytes = OUTPUT_GATE_DEFAULT_THRESHOLD_BYTES,
	fallbackStubBytes = OUTPUT_GATE_DEFAULT_PREVIEW_BYTES,
): OutputGateSavings {
	const parsed: Array<ParsedOutputGateEvent & { createdAt?: number }> = [];
	for (const event of events) {
		const parsedEvent = parseOutputGateEvent(event);
		if (parsedEvent) parsed.push({ ...parsedEvent, createdAt: event.createdAt });
	}

	const count = parsed.length;
	const totalBytes = parsed.reduce((sum, event) => sum + event.bytes, 0);
	const avgBytes = count > 0 ? totalBytes / count : null;
	const baselineBytes = thresholdBytes * count;
	const savingsBeyondThresholdBytes = Math.max(0, totalBytes - baselineBytes);
	const stubRate = totalBytes > 0 ? savingsBeyondThresholdBytes / totalBytes : null;

	const measuredEvents = parsed.filter((event) => event.stubBytes !== null);
	const measuredStubBytes = measuredEvents.reduce((sum, event) => sum + (event.stubBytes as number), 0);
	const totalStubBytes = parsed.reduce((sum, event) => sum + (event.stubBytes ?? fallbackStubBytes), 0);
	const inlineReductionRate = totalBytes > 0 ? Math.max(0, (totalBytes - totalStubBytes) / totalBytes) : null;

	let latestCreatedAt: number | undefined;
	for (const event of parsed) {
		const createdAt = event.createdAt;
		if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
			latestCreatedAt = latestCreatedAt === undefined ? createdAt : Math.max(latestCreatedAt, createdAt);
		}
	}
	const latestTimestamp = latestCreatedAt === undefined ? null : new Date(latestCreatedAt).toISOString();

	const byTool: Record<string, OutputGateToolBreakdown> = {};
	for (const event of parsed) {
		const current = byTool[event.toolName] ?? { count: 0, bytes: 0 };
		current.count += 1;
		current.bytes += event.bytes;
		byTool[event.toolName] = current;
	}

	return {
		count,
		totalBytes,
		thresholdBytes,
		avgBytes,
		savingsBeyondThresholdBytes,
		stubRate,
		fallbackStubBytes,
		totalStubBytes,
		measuredStubBytes,
		measuredStubEvents: measuredEvents.length,
		inlineReductionRate,
		latestTimestamp,
		byTool,
	};
}

/**
 * Parses a context-ledger `events.v2.jsonl` blob into the minimal event shape
 * consumed by `summarizeOutputGateSavings`. Broken JSONL lines are skipped.
 */
export function readOutputGateEvents(text: string): OutputGateLedgerEvent[] {
	const out: OutputGateLedgerEvent[] = [];
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (parsed && typeof parsed === "object" && typeof (parsed as { kind?: unknown }).kind === "string") {
			const event = parsed as OutputGateLedgerEvent;
			out.push({ kind: event.kind, title: event.title, summary: event.summary, createdAt: event.createdAt });
		}
	}
	return out;
}
