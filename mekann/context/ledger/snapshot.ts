import type { MekannContextEvent, MekannContextEventKind } from "./store.js";

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
}

interface SnapshotSection {
	label: string;
	events: MekannContextEvent[];
}

import { truncate, sortByPriorityThenNewest } from "./store.js";

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
		case "artifact": return `<artifact id="${escaped}" />`;
		case "file": return `<file>${escaped}</file>`;
		case "url": return `<url>${escaped}</url>`;
		case "symbol": return `<symbol>${escaped}</symbol>`;
		case "commit": return `<commit>${escaped}</commit>`;
	}
}

function formatEvent(event: MekannContextEvent, maxTitleLen: number, maxSummaryLen: number): string {
	const title = escapeXml(truncate(event.title, maxTitleLen));
	const summary = escapeXml(truncate(event.summary, maxSummaryLen));
	const refs = event.refs?.map((r) => `      ${formatRef(r)}`).join("\n") ?? "";
	const refBlock = refs ? `\n    <refs>\n${refs}\n    </refs>` : "";
	return `    <event id="${event.id}" kind="${event.kind}" priority="P${event.priority} (${PRIORITY_LABEL[event.priority] ?? "unknown"})" at="${new Date(event.createdAt).toISOString()}">\n      <title>${title}</title>\n      <summary>${summary}</summary>${refBlock}\n    </event>`;
}

export function buildSnapshot(events: MekannContextEvent[], options: SnapshotOptions = {}): string {
	const maxEvents = options.maxEvents ?? 50;
	const maxTitleLen = options.maxTitleLen ?? 120;
	const maxSummaryLen = options.maxSummaryLen ?? 300;
	const maxBytes = options.maxBytes ?? 0; // 0 = unlimited

	let filtered = options.kinds
		? events.filter((e) => options.kinds!.includes(e.kind))
		: [...events];

	// Sort by priority (ascending = most important first), then by createdAt (newest first)
	filtered = sortByPriorityThenNewest(filtered);

	if (filtered.length > maxEvents) {
		filtered = filtered.slice(0, maxEvents);
	}

	if (filtered.length === 0) {
		return "<mekann_session_context />\n";
	}

	// Build full snapshot first, then trim if maxBytes is set
	let xml = buildSnapshotXml(filtered, maxTitleLen, maxSummaryLen);

	if (maxBytes > 0 && Buffer.byteLength(xml, "utf8") > maxBytes) {
		xml = trimSnapshotToBudget(filtered, maxTitleLen, maxSummaryLen, maxBytes);
	}

	return xml;
}

function buildSnapshotXml(events: MekannContextEvent[], maxTitleLen: number, maxSummaryLen: number): string {
	const kindOrder: MekannContextEventKind[] = ["error", "task", "plan", "user_decision", "file_change", "tool_result", "subagent"];
	const sections: SnapshotSection[] = [];
	for (const kind of kindOrder) {
		const kindEvents = events.filter((e) => e.kind === kind);
		if (kindEvents.length > 0) {
			sections.push({ label: `${kind}_events`, events: kindEvents });
		}
	}

	const sectionXml = sections.map((s) => {
		const eventXmls = s.events.map((e) => formatEvent(e, maxTitleLen, maxSummaryLen)).join("\n");
		return `  <${s.label}>\n${eventXmls}\n  </${s.label}>`;
	}).join("\n");

	return `<mekann_session_context>\n${sectionXml}\n</mekann_session_context>\n`;
}

function trimSnapshotToBudget(
	events: MekannContextEvent[],
	maxTitleLen: number,
	maxSummaryLen: number,
	maxBytes: number,
): string {
	// Remove events from lowest priority / oldest first until within budget
	// Dropping order: P4 → P3 → P2 (tool_result/subagent before task/plan/error)
	const dropOrder: MekannContextEventKind[] = ["subagent", "tool_result", "file_change", "user_decision", "plan", "task", "error"];

	const remaining = [...events];
	for (const dropKind of dropOrder) {
		// Drop from highest priority first within each kind
		for (let pri = 4; pri >= 0; pri--) {
			for (let i = remaining.length - 1; i >= 0; i--) {
				if (remaining[i].kind === dropKind && remaining[i].priority === pri) {
					remaining.splice(i, 1);
					const candidate = buildSnapshotXml(remaining, maxTitleLen, maxSummaryLen);
					if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
						return candidate;
					}
				}
			}
		}
	}

	// If still over budget, return whatever fits
	return buildSnapshotXml(remaining, maxTitleLen, maxSummaryLen);
}
