/**
 * Issue list OpenTUI app — beautiful Tokyo Night dark theme UI.
 * Modeled after the Mekann settings editor visual style.
 */

import type { IssueWithStatus } from "./github.js";
import { createSelectionState, issuesToOpen, isMarked, selectionCount, toggleSelection, type SelectionState } from "./selection.js";

export interface IssueListCallbacks {
	/** Receives the array of issues to open: one for single-select, many for bulk. */
	onSelect: (issues: IssueWithStatus[]) => void;
	onCancel: () => void;
}

// ─── createElement shorthand ──────────────────────────────────

function el(
	type: string,
	props: Record<string, unknown> | null,
	...children: any[]
): any {
	const React = require("react");
	return React.createElement(type as any, props as any, ...children);
}

// ─── Tokyo Night dark palette ──────────────────────────────────

const C = {
	bg: "#11111b",
	headerBg: "#1d1d2e",
	rowEvenBg: "#151520",
	rowOddBg: "#11111b",
	rowMarkedBg: "#1f2230",
	selectedBg: "#33467c",
	statusBarBg: "#0d0d14",
	statusKeyBg: "#09090f",
	separator: "#252840",

	fg: "#c0caf5",
	fgDim: "#565f89",
	fgBright: "#d4d4d4",
	accent: "#7aa2f7",
	green: "#9ece6a",
	yellow: "#e0af68",
	cyan: "#7dcfff",
	purple: "#bb9af7",
	orange: "#ff9e64",
	teal: "#8abeb7",
	red: "#f7768e",
};

// ─── Helper ────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
	if (max <= 0) return "";
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}

function labelBadge(label: string): { text: string; color: string } {
	const lower = label.toLowerCase();
	if (lower.includes("bug")) return { text: "bug", color: C.red };
	if (lower.includes("feature") || lower.includes("enhance")) return { text: "feat", color: C.purple };
	if (lower.includes("ready-for-agent")) return { text: "agent", color: C.teal };
	if (lower.includes("ready-for-human")) return { text: "human", color: C.cyan };
	if (lower.includes("needs-triage")) return { text: "triage", color: C.orange };
	if (lower.includes("needs-info")) return { text: "info", color: C.yellow };
	if (lower.includes("wontfix")) return { text: "wontfix", color: C.fgDim };
	return { text: label, color: C.fgDim };
}

// ─── Responsive layout ────────────────────────────────────────
//
// The issue panel opens in a split pane (≈half terminal width, often
// 30–60 columns). The previous layout used a fixed `max(20, …)` title
// width plus an unbounded dependency string placed *after* a flexGrow
// spacer, so narrow panes clipped the right-hand columns. These helpers
// reverse the math: reserve widths for the right-hand columns first,
// give the title whatever is left, and progressively hide columns as the
// pane shrinks so the total intrinsic width never exceeds `available`.

// Row geometry. Each value is documented with where it is spent.
const ROW_PADDING = 4;        // paddingLeft(3) + paddingRight(1)
const ROW_LEFT_FIXED = 9;     // `${cursor} ${num.padEnd(4)} `(7) + status icon(1) + title leading space(1)
const ROW_SPACER = 1;         // minimum gap between title and right-hand columns
const DEP_RESERVED = 18;      // " blocked by #NNN,… " standard reservation
const LABELS_RATIO = 0.22;    // labels column share of terminal width
const LABELS_MIN = 10;        // labels column floor (only when shown)
const MIN_TITLE = 8;          // if title would fall below this, drop right columns

export interface IssueLayout {
	/** Available content width inside a row (terminalWidth - ROW_PADDING). */
	available: number;
	/** Width reserved for the title column (shared by header and rows). */
	titleWidth: number;
	/** Width reserved for the dependency column (0 when hidden). */
	depWidth: number;
	/** Width reserved for the labels column (0 when hidden). */
	labelsWidth: number;
	/** Whether the dependency column is shown at this width. */
	showDeps: boolean;
	/** Whether the labels column is shown at this width. */
	showLabels: boolean;
}

/**
 * Compute shared column widths for the issue list at a given terminal width.
 * Guarantees `ROW_LEFT_FIXED + ROW_SPACER + titleWidth + depWidth +
 * labelsWidth <= available`, so no column is ever clipped.
 */
export function computeIssueLayout(terminalWidth: number | undefined): IssueLayout {
	const width = terminalWidth || 80;
	const available = Math.max(0, width - ROW_PADDING);
	const labelsWidthFor = (w: number) => Math.max(LABELS_MIN, Math.floor(w * LABELS_RATIO));

	let showLabels = available >= 50;
	let showDeps = available >= 38;

	const measure = () => {
		const dep = showDeps ? DEP_RESERVED : 0;
		const labels = showLabels ? labelsWidthFor(width) : 0;
		const title = Math.max(0, available - ROW_LEFT_FIXED - ROW_SPACER - dep - labels);
		return { dep, labels, title };
	};

	// Drop right-hand columns in priority order (labels → deps) until the
	// title can keep at least MIN_TITLE columns.
	let dims = measure();
	if (dims.title < MIN_TITLE && showLabels) {
		showLabels = false;
		dims = measure();
	}
	if (dims.title < MIN_TITLE && showDeps) {
		showDeps = false;
		dims = measure();
	}

	return {
		available,
		titleWidth: dims.title,
		depWidth: dims.dep,
		labelsWidth: dims.labels,
		showDeps,
		showLabels,
	};
}

/** Status-bar keybinding hint verbosity tier for a given terminal width. */
export function statusKeyHintsTier(terminalWidth: number | undefined): "full" | "mid" | "short" {
	const width = terminalWidth || 80;
	if (width >= 60) return "full";
	if (width >= 44) return "mid";
	return "short";
}

/** Build label badge elements, truncated to fit `maxWidth` columns. */
function renderLabels(labels: string[], maxWidth: number): any[] {
	if (maxWidth <= 0 || labels.length === 0) return [];
	const badges = labels.map(labelBadge);
	const items: { text: string; color: string }[] = [];
	let used = 0;
	for (const badge of badges) {
		const sep = items.length > 0 ? 1 : 0;
		if (used + sep + badge.text.length > maxWidth) break;
		used += sep + badge.text.length;
		items.push(badge);
	}
	const elems: any[] = [];
	items.forEach((badge, i) => {
		if (i > 0) elems.push(el("text", { fg: C.fgDim, content: " " }));
		elems.push(el("text", { fg: badge.color, content: badge.text }));
	});
	const overflow = labels.length - items.length;
	if (overflow > 0) {
		const suffix = ` +${overflow}`;
		if (used + suffix.length <= maxWidth) {
			elems.push(el("text", { fg: C.fgDim, content: suffix }));
		}
	}
	return elems;
}

/** Build status-bar keybinding hint elements for a given terminal width. */
function statusKeyHints(terminalWidth: number | undefined): any[] {
	const tier = statusKeyHintsTier(terminalWidth);
	if (tier === "full") {
		return [
			el("text", { fg: C.fgDim, content: " ↑↓ " }), el("text", { fg: C.fg, content: "navigate" }),
			el("text", { fg: C.fgDim, content: "  Space " }), el("text", { fg: C.green, content: "mark" }),
			el("text", { fg: C.fgDim, content: "  ⏎ " }), el("text", { fg: C.accent, content: "open" }),
			el("text", { fg: C.fgDim, content: "  Esc/q " }), el("text", { fg: C.fgDim, content: "cancel" }),
		];
	}
	if (tier === "mid") {
		return [
			el("text", { fg: C.fgDim, content: " ↑↓ " }), el("text", { fg: C.fg, content: "nav" }),
			el("text", { fg: C.fgDim, content: "  Space " }), el("text", { fg: C.green, content: "mark" }),
			el("text", { fg: C.fgDim, content: "  ⏎ " }), el("text", { fg: C.accent, content: "open" }),
			el("text", { fg: C.fgDim, content: "  Esc/q " }), el("text", { fg: C.fgDim, content: "esc" }),
		];
	}
	return [
		el("text", { fg: C.fgDim, content: " ↑↓ " }),
		el("text", { fg: C.fgDim, content: "  Space " }),
		el("text", { fg: C.fgDim, content: "  ⏎ " }),
		el("text", { fg: C.fgDim, content: "  Esc/q " }),
	];
}

// ─── App ────────────────────────────────────────────────────────

export async function mountIssueList(
	renderer: any,
	issues: IssueWithStatus[],
	callbacks: IssueListCallbacks,
): Promise<void> {
	const React = await import("react");
	const { createRoot, useKeyboard, useTerminalDimensions } = await import("@opentui/react");
	const { createElement, useState } = React;

	const { onSelect, onCancel } = callbacks;

	function IssueListApp() {
		const [selectedIndex, setSelectedIndex] = (useState as any)(0);
		const [selection, setSelection] = (useState as any)(createSelectionState());
		const { width: terminalWidth } = (useTerminalDimensions as any)();

		(useKeyboard as any)((key: any) => {
			if (key.name === "up" || key.name === "k") {
				setSelectedIndex((i: number) => Math.max(0, i - 1));
			} else if (key.name === "down" || key.name === "j") {
				setSelectedIndex((i: number) => Math.min(issues.length - 1, i + 1));
			} else if (key.name === "space") {
				// Toggle the mark on the focused issue. Blocked-rejection is out of
				// scope for this slice (PRD #66, slice 2) — every issue is markable.
				const focused = issues[selectedIndex];
				if (focused) setSelection((s: SelectionState) => toggleSelection(s, focused.number));
			} else if (key.name === "return") {
				const focusedNumber = issues[selectedIndex]?.number;
				if (focusedNumber === undefined) return;
				const numbersToOpen = issuesToOpen(selection, focusedNumber);
				const byNumber = new Map(issues.map((issue: IssueWithStatus) => [issue.number, issue]));
				const toOpen = numbersToOpen.map((n) => byNumber.get(n)).filter((issue): issue is IssueWithStatus => Boolean(issue));
				onSelect(toOpen);
			} else if (key.name === "escape" || key.name === "q") {
				onCancel();
			}
		});

		const layout = computeIssueLayout(terminalWidth);
		const markedCount = selectionCount(selection);

		const rows = issues.map((issue: IssueWithStatus, i: number) =>
			createElement(IssueRow, {
				key: issue.number,
				issue,
				index: i,
				selected: i === selectedIndex,
				marked: isMarked(selection, issue.number),
				terminalWidth,
			})
		);

		return el("box", {
			style: { flexDirection: "column", width: "100%", height: "100%", backgroundColor: C.bg },
		},
			// Header
			el("box", {
				style: {
					width: "100%",
					height: 1,
					backgroundColor: C.headerBg,
					flexDirection: "row",
					paddingLeft: 2,
					paddingRight: 1,
					alignItems: "center",
				},
			},
				el("text", { fg: C.fgBright, content: "Open Issues" }),
				el("text", { fg: C.fgDim, content: ` · ${issues.length} issue${issues.length !== 1 ? "s" : ""}` }),
			),
			// Column header — shares column widths with rows via computeIssueLayout
			el("box", {
				style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.headerBg, paddingLeft: 3, paddingRight: 1 },
			},
				el("text", { fg: C.fgDim, content: "  " }),
				el("text", { fg: C.fgDim, content: "#".padEnd(6) }),
				el("text", { fg: C.fgDim, content: " " }),
				el("text", { fg: C.fgDim, content: truncate("TITLE", layout.titleWidth).padEnd(layout.titleWidth) }),
				// Spacer mirroring the row's flexGrow gap so LABELS aligns across header/rows.
				el("text", { fg: C.fgDim, content: " " }),
				layout.showDeps ? el("text", { fg: C.fgDim, content: "".padEnd(layout.depWidth) }) : null,
				layout.showLabels ? el("text", { fg: C.fgDim, content: truncate("LABELS", layout.labelsWidth) }) : null,
			),
			// Issue rows
			el("scrollbox", {
				style: { width: "100%", flexGrow: 1, backgroundColor: C.bg },
				scrollY: true,
				viewportCulling: true,
				focused: true,
			}, ...rows),
			// Status bar
			createElement(StatusBar, { selected: selectedIndex, total: issues.length, markedCount, terminalWidth }),
		);
	}

	function IssueRow({ issue, index, selected, marked, terminalWidth: tw }: {
		issue: IssueWithStatus; index: number; selected: boolean; marked: boolean; terminalWidth: number;
	}) {
		const bgColor = selected ? C.selectedBg : marked ? C.rowMarkedBg : index % 2 === 0 ? C.rowEvenBg : C.rowOddBg;
		const numColor = selected ? C.fgBright : marked ? C.green : C.accent;
		const isBlocked = issue.openBlockers.length > 0 || Boolean(issue.error);
		const titleColor = selected ? C.fgBright : isBlocked ? C.fgDim : C.fg;
		// Mark takes precedence in the cursor slot so a mark is always visible,
		// regardless of focus. The focus cursor only shows on unmarked rows.
		const cursor = marked ? "✔" : selected ? "▸" : " ";
		const cursorColor = marked ? C.green : numColor;
		const statusIcon = isBlocked
			? el("text", { fg: C.red, content: "⛔" })
			: issue.hasWorktree
				? el("text", { fg: C.yellow, content: "●" })
				: el("text", { fg: C.fgDim, content: " " });

		const layout = computeIssueLayout(tw);

		// Dependency text is composed first, then truncated to its reserved
		// column width so it can never push past the right edge.
		const depCore = issue.error
			? "dependency-error"
			: issue.openBlockers.length > 0
				? `blocked by ${issue.openBlockers.slice(0, 3).map((blocker) => `#${blocker.number}`).join(",")}${issue.openBlockers.length > 3 ? ",…" : ""}`
				: issue.blockedBy.length > 0
					? "unblocked"
					: "";
		const depColor = issue.error
			? C.red
			: issue.openBlockers.length > 0
				? C.red
				: C.green;
		const dependencyContent = depCore
			? ` ${truncate(depCore, Math.max(0, layout.depWidth - 2))} `
			: "";
		const dependencyColumn = layout.showDeps
			? el("box", { style: { width: layout.depWidth, height: 1, flexDirection: "row", flexShrink: 0 } },
				el("text", { fg: depColor, content: dependencyContent }),
			)
			: null;

		const labelsColumn = layout.showLabels
			? el("box", { style: { width: layout.labelsWidth, height: 1, flexDirection: "row", flexShrink: 0 } },
				...renderLabels(issue.labels, layout.labelsWidth),
			)
			: null;

		return el("box", {
			style: {
				flexDirection: "row",
				width: "100%",
				height: 1,
				backgroundColor: bgColor,
				paddingLeft: 3,
				paddingRight: 1,
				alignItems: "center",
			},
		},
			el("text", { fg: cursorColor, content: `${cursor} ${String(issue.number).padEnd(4)} ` }),
			statusIcon,
			el("text", { fg: titleColor, content: ` ${truncate(issue.title, layout.titleWidth)}` }),
			el("box", { style: { flexGrow: 1 } }),
			dependencyColumn,
			labelsColumn,
		);
	}

	function selectedIssueSummary(issue: IssueWithStatus | undefined): string {
		if (!issue) return "";
		if (issue.error) return `#${issue.number}: dependency check failed`;
		if (issue.openBlockers.length > 0) return `#${issue.number}: blocked by ${issue.openBlockers.map((blocker) => `#${blocker.number}`).join(", ")}`;
		return `#${issue.number}: ${truncate(issue.title, 40)}`;
	}

	function StatusBar({ selected, total, markedCount, terminalWidth: tw }: { selected: number; total: number; markedCount: number; terminalWidth: number }) {
		const width = tw || 80;
		const infoAvail = Math.max(0, width - 2); // paddingLeft(1) + paddingRight(1)
		const selectionInfo = `${markedCount} selected`;
		const leftInfo = ` BROWSE │ ${selected + 1}/${total} │ ${selectionInfo} `;
		// Reserve the left info block + a 1-column spacer; truncate the summary
		// to whatever remains so it never pushes past the right edge.
		const summaryMax = Math.max(0, infoAvail - leftInfo.length - 1);
		const summary = markedCount > 0 ? `${markedCount} issue${markedCount !== 1 ? "s" : ""} marked — Enter opens all` : selectedIssueSummary(issues[selected]);

		return el("box", {
			style: { position: "absolute", bottom: 0, width: "100%", height: 2, flexDirection: "column" },
		},
			// Info row
			el("box", {
				style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusBarBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
			},
				el("text", { fg: C.green, content: " BROWSE " }),
				el("text", { fg: C.fgDim, content: "│" }),
				el("text", { fg: C.fgDim, content: ` ${selected + 1}/${total} ` }),
				el("text", { fg: C.fgDim, content: "│" }),
				el("text", { fg: markedCount > 0 ? C.green : C.fgDim, content: ` ${selectionInfo} ` }),
				el("box", { style: { flexGrow: 1 } }),
				el("text", { fg: markedCount > 0 ? C.green : C.fgDim, content: truncate(summary, summaryMax) }),
			),
			// Keybinding hints row — verbosity shortens with terminal width
			el("box", {
				style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusKeyBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
			},
				...statusKeyHints(tw),
			),
		);
	}

	const root = createRoot(renderer);
	root.render(createElement(IssueListApp));
}
