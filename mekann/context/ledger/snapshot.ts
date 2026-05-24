import * as crypto from "node:crypto";
import type { MekannContextEvent, MekannContextEventKind, ProjectedContextEvent } from "./store.js";
import { truncate, sortByPriorityThenNewest, projectContextEvents } from "./store.js";

// ─── Priority labels ───────────────────────────────────────────

const PRIORITY_LABEL: Record<number, string> = {
	0: "critical",
	1: "high",
	2: "medium",
	3: "low",
	4: "info",
};

// ─── Snapshot Builder ──────────────────────────────────────────

export interface SnapshotOptions {
	maxEvents?: number;
	maxTitleLen?: number;
	maxSummaryLen?: number;
	maxBytes?: number;
	kinds?: MekannContextEventKind[];
	now?: number;
}

interface SnapshotSection {
	label: string;
	events: ProjectedContextEvent[];
}

export interface SnapshotWatermark {
	schemaVersion: "mekann-context-snapshot/v2";
	generatedAt: string;
	sourceEventCount: number;
	lastEventId: string;
	eventLogHash: string;
}

export function computeSnapshotWatermark(events: MekannContextEvent[], now = Date.now()): SnapshotWatermark {
	const ordered = [...events].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
	const hash = crypto.createHash("sha256");
	for (const event of ordered) hash.update(`${event.id}\t${event.createdAt}\t${event.schemaVersion}\n`);
	return {
		schemaVersion: "mekann-context-snapshot/v2",
		generatedAt: new Date(now).toISOString(),
		sourceEventCount: ordered.length,
		lastEventId: ordered.at(-1)?.id ?? "",
		eventLogHash: hash.digest("hex"),
	};
}

export function snapshotWatermarkMatches(xml: string, events: MekannContextEvent[]): boolean {
	const expected = computeSnapshotWatermark(events, 0);
	const root = xml.match(/<mekann_session_context\b([^>]*)>/)?.[1];
	if (!root) return false;
	const attr = (name: string) => root.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
	return attr("schemaVersion") === expected.schemaVersion
		&& Number(attr("sourceEventCount")) === expected.sourceEventCount
		&& attr("lastEventId") === expected.lastEventId
		&& attr("eventLogHash") === expected.eventLogHash;
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function formatRef(ref: MekannContextEvent["refs"] extends (infer R)[] | undefined ? R : never): string {
	const escaped = escapeXml(ref.value);
	switch (ref.type) {
		case "artifact": return `<artifact id="${escaped}"${ref.role ? ` role="${escapeXml(ref.role)}"` : ""} />`;
		case "file": return `<file${ref.role ? ` role="${escapeXml(ref.role)}"` : ""}>${escaped}</file>`;
		case "url": return `<url${ref.role ? ` role="${escapeXml(ref.role)}"` : ""}>${escaped}</url>`;
		case "symbol": return `<symbol${ref.role ? ` role="${escapeXml(ref.role)}"` : ""}>${escaped}</symbol>`;
		case "commit": return `<commit${ref.role ? ` role="${escapeXml(ref.role)}"` : ""}>${escaped}</commit>`;
		case "event": return `<event_ref${ref.role ? ` role="${escapeXml(ref.role)}"` : ""}>${escaped}</event_ref>`;
		case "snapshot": return `<snapshot${ref.role ? ` role="${escapeXml(ref.role)}"` : ""}>${escaped}</snapshot>`;
	}
}

function formatEvent(event: ProjectedContextEvent, maxTitleLen: number, maxSummaryLen: number): string {
	const title = escapeXml(truncate(event.title, maxTitleLen));
	const summary = escapeXml(truncate(event.summary, maxSummaryLen));
	const refs = event.refs?.map((r) => `      ${formatRef(r)}`).join("\n") ?? "";
	const refBlock = refs ? `\n    <refs>\n${refs}\n    </refs>` : "";
	const scopeEntries = event.scope ? Object.entries(event.scope) : [];
	const scopeBlock = scopeEntries.length > 0
		? `\n    <scope>${scopeEntries.map(([k, v]) => `<${k}>${escapeXml(Array.isArray(v) ? v.join(",") : String(v))}</${k}>`).join("")}</scope>`
		: "";
	return `    <event id="${event.id}" kind="${event.kind}" priority="P${event.priority} (${PRIORITY_LABEL[event.priority] ?? "unknown"})" status="${event.status}" effectiveStatus="${event.effectiveStatus}" evidenceLevel="${event.evidenceLevel}" at="${new Date(event.createdAt).toISOString()}">\n      <title>${title}</title>\n      <summary>${summary}</summary>${scopeBlock}${refBlock}\n    </event>`;
}

export function buildSnapshot(events: MekannContextEvent[] | ProjectedContextEvent[], options: SnapshotOptions = {}): string {
	const maxEvents = options.maxEvents ?? 50;
	const maxTitleLen = options.maxTitleLen ?? 120;
	const maxSummaryLen = options.maxSummaryLen ?? 300;
	const maxBytes = options.maxBytes ?? 0; // 0 = unlimited
	const now = options.now ?? Date.now();

	const sourceEvents = (events.length > 0 && "effectiveStatus" in events[0])
		? events as ProjectedContextEvent[]
		: events as MekannContextEvent[];
	const watermark = computeSnapshotWatermark(sourceEvents as MekannContextEvent[], now);
	let filtered = (events.length > 0 && "effectiveStatus" in events[0])
		? [...events as ProjectedContextEvent[]]
		: projectContextEvents(events as MekannContextEvent[]);

	filtered = filtered.filter((e) => (e.effectiveStatus === "active" || e.effectiveStatus === "blocked") && !(e.expiresAt != null && e.expiresAt < now));

	if (options.kinds) filtered = filtered.filter((e) => options.kinds!.includes(e.kind));

	// Sort by priority (ascending = most important first), then by createdAt (newest first)
	filtered = sortByPriorityThenNewest(filtered);

	if (filtered.length > maxEvents) filtered = filtered.slice(0, maxEvents);

	if (filtered.length === 0) return buildSnapshotXml([], maxTitleLen, maxSummaryLen, watermark);

	let xml = buildSnapshotXml(filtered, maxTitleLen, maxSummaryLen, watermark);
	if (maxBytes > 0 && Buffer.byteLength(xml, "utf8") > maxBytes) {
		xml = trimSnapshotToBudget(filtered, maxTitleLen, maxSummaryLen, maxBytes, watermark);
	}
	return xml;
}

function buildSnapshotXml(events: ProjectedContextEvent[], maxTitleLen: number, maxSummaryLen: number, watermark: SnapshotWatermark): string {
	const kindOrder: MekannContextEventKind[] = ["error", "task", "plan", "user_decision", "constraint", "rule", "safety_boundary", "autoresearch", "file_change", "git", "tool_result", "subagent"];
	const sections: SnapshotSection[] = [];
	for (const kind of kindOrder) {
		const kindEvents = events.filter((e) => e.kind === kind);
		if (kindEvents.length > 0) sections.push({ label: `${kind}_events`, events: kindEvents });
	}
	const sectionXml = sections.map((s) => {
		const eventXmls = s.events.map((e) => formatEvent(e, maxTitleLen, maxSummaryLen)).join("\n");
		return `  <${s.label}>\n${eventXmls}\n  </${s.label}>`;
	}).join("\n");
	return `<mekann_session_context schemaVersion="${watermark.schemaVersion}" generatedAt="${watermark.generatedAt}" sourceEventCount="${watermark.sourceEventCount}" lastEventId="${escapeXml(watermark.lastEventId)}" eventLogHash="${watermark.eventLogHash}">\n${sectionXml}\n</mekann_session_context>\n`;
}

function trimSnapshotToBudget(events: ProjectedContextEvent[], maxTitleLen: number, maxSummaryLen: number, maxBytes: number, watermark: SnapshotWatermark): string {
	const dropOrder: MekannContextEventKind[] = ["subagent", "tool_result", "git", "file_change", "autoresearch", "safety_boundary", "rule", "constraint", "user_decision", "plan", "task", "error"];
	const remaining = [...events];
	for (let pri = 4; pri >= 0; pri--) {
		for (const dropKind of dropOrder) {
			for (let i = remaining.length - 1; i >= 0; i--) {
				if (remaining[i].kind === dropKind && remaining[i].priority === pri) {
					remaining.splice(i, 1);
					const candidate = buildSnapshotXml(remaining, maxTitleLen, maxSummaryLen, watermark);
					if (Buffer.byteLength(candidate, "utf8") <= maxBytes) return candidate;
				}
			}
		}
	}
	return buildSnapshotXml(remaining, maxTitleLen, maxSummaryLen, watermark);
}
