/**
 * Issue list OpenTUI app — beautiful Tokyo Night dark theme UI.
 * Modeled after the Mekann settings editor visual style.
 */

import type { IssueWithStatus } from "./github.js";

export interface IssueListCallbacks {
	onSelect: (issue: IssueWithStatus) => void;
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
		const { width: terminalWidth } = (useTerminalDimensions as any)();

		(useKeyboard as any)((key: any) => {
			if (key.name === "up" || key.name === "k") {
				setSelectedIndex((i: number) => Math.max(0, i - 1));
			} else if (key.name === "down" || key.name === "j") {
				setSelectedIndex((i: number) => Math.min(issues.length - 1, i + 1));
			} else if (key.name === "return") {
				onSelect(issues[selectedIndex]);
			} else if (key.name === "escape" || key.name === "q") {
				onCancel();
			}
		});

		const rows = issues.map((issue: IssueWithStatus, i: number) =>
			createElement(IssueRow, {
				key: issue.number,
				issue,
				index: i,
				selected: i === selectedIndex,
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
			// Column header
			el("box", {
				style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.headerBg, paddingLeft: 3, paddingRight: 1 },
			},
				el("text", { fg: C.fgDim, content: "  " }),
				el("text", { fg: C.fgDim, content: "#".padEnd(6) }),
				el("text", { fg: C.fgDim, content: "TITLE".padEnd(Math.max(20, (terminalWidth || 80) - 40)) }),
				el("text", { fg: C.fgDim, content: "LABELS" }),
			),
			// Issue rows
			el("scrollbox", {
				style: { width: "100%", flexGrow: 1, backgroundColor: C.bg },
				scrollY: true,
				viewportCulling: true,
				focused: true,
			}, ...rows),
			// Status bar
			createElement(StatusBar, { selected: selectedIndex, total: issues.length }),
		);
	}

	function IssueRow({ issue, index, selected, terminalWidth: tw }: {
		issue: IssueWithStatus; index: number; selected: boolean; terminalWidth: number;
	}) {
		const bgColor = selected ? C.selectedBg : index % 2 === 0 ? C.rowEvenBg : C.rowOddBg;
		const numColor = selected ? C.fgBright : C.accent;
		const titleColor = selected ? C.fgBright : C.fg;
		const cursor = selected ? "▸" : " ";
		const statusIcon = issue.hasWorktree ? el("text", { fg: C.yellow, content: "●" }) : null;

		const labelsWidth = Math.max(10, Math.floor((tw || 80) * 0.25));
		const titleWidth = Math.max(20, (tw || 80) - labelsWidth - 12);

		const labelElements = issue.labels.slice(0, 3).map((label: string, li: number) => {
			const badge = labelBadge(label);
			const sep = li > 0 ? " " : "";
			return [
				el("text", { fg: C.fgDim, content: sep }),
				el("text", { fg: badge.color, content: badge.text }),
			];
		}).flat();
		if (issue.labels.length > 3) {
			labelElements.push(el("text", { fg: C.fgDim, content: ` +${issue.labels.length - 3}` }));
		}

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
			el("text", { fg: numColor, content: `${cursor} ${String(issue.number).padEnd(4)} ` }),
			statusIcon,
			el("text", { fg: titleColor, content: ` ${truncate(issue.title, titleWidth)}` }),
			el("box", { style: { flexGrow: 1 } }),
			...labelElements,
		);
	}

	function StatusBar({ selected, total }: { selected: number; total: number }) {
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
				el("box", { style: { flexGrow: 1 } }),
				el("text", { fg: C.fgDim, content: total > 0 ? `#${issues[selected].number}: ${truncate(issues[selected].title, 40)}` : "" }),
			),
			// Keybinding hints row
			el("box", {
				style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusKeyBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
			},
				el("text", { fg: C.fgDim, content: " ↑↓ " }), el("text", { fg: C.fg, content: "navigate" }),
				el("text", { fg: C.fgDim, content: "  ⏎ " }), el("text", { fg: C.accent, content: "open worktree" }),
				el("text", { fg: C.fgDim, content: "  Esc/q " }), el("text", { fg: C.fgDim, content: "cancel" }),
			),
		);
	}

	const root = createRoot(renderer);
	root.render(createElement(IssueListApp));
}
