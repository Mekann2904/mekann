import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { EffectiveSetting, SettingsScope } from "../../settings/types.js";
import type { ModelCatalogItem } from "./model-ipc.js";

// ─── createElement shorthand ──────────────────────────────────────

function el(
	type: string | React.ComponentType<any>,
	props: Record<string, unknown> | null,
	...children: React.ReactNode[]
) {
	return React.createElement(type as any, props as any, ...children);
}

// ─── Types ────────────────────────────────────────────────────────

export interface DraftChange {
	feature: string;
	key: string;
	scope: SettingsScope;
	raw: string;
}
export interface SettingsEditorAppProps {
	effective: EffectiveSetting[];
	diagnostics: string[];
	models: ModelCatalogItem[];
	onApply: (changes: DraftChange[]) => Promise<string | undefined>;
	onQuit: () => void;
}

type AppMode = "list" | "edit" | "models" | "diff";
const ALL_FEATURE = "__all__";

// ─── Helpers ──────────────────────────────────────────────────────

function itemId(i: EffectiveSetting): string {
	return `${i.feature}.${i.key}`;
}

function valueText(value: unknown): string {
	if (value === undefined) return "(unset)";
	if (value === null) return "(null)";
	if (value && typeof value === "object") {
		const v = value as Record<string, unknown>;
		if (typeof v.provider === "string" && typeof v.modelId === "string")
			return `${v.provider}/${v.modelId}`;
		return JSON.stringify(value);
	}
	return String(value);
}

function pad(s: string, n: number): string {
	if (n <= 0) return "";
	if (s.length >= n) return truncate(s, Math.max(1, n - 1)) + " ";
	return s + " ".repeat(n - s.length);
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}

function supportedThinking(
	models: ModelCatalogItem[],
	item: EffectiveSetting,
	items: EffectiveSetting[],
	drafts: Record<string, DraftChange>,
): string[] {
	const mode = item.key.split(".")[1];
	const modelItem = items.find(
		(i) => i.feature === "modes" && i.key === `models.${mode}`,
	);
	// Check draft first, then effective value
	const draft = modelItem ? drafts[itemId(modelItem)] : undefined;
	const modelKey = draft?.raw ?? valueText(modelItem?.effectiveValue);
	const model = models.find(
		(m) => `${m.provider}/${m.modelId}` === modelKey,
	);
	return model?.supportedThinkingLevels?.length
		? model.supportedThinkingLevels
		: (item.schema.enumValues ?? []);
}

// ─── Tokyo Night dark palette (refined) ────────────────────────────

const C = {
	// Base backgrounds
	bg: "#11111b",
	sidebarBg: "#0d0d17",
	contentBg: "#11111b",
	detailBg: "#141420",
	bgSelected: "#33467c",

	// Text
	fg: "#c0caf5",
	fgDim: "#565f89",
	fgBright: "#d4d4d4",

	// Accent
	accent: "#7aa2f7",
	accentDim: "#3b4261",
	teal: "#8abeb7",

	// Semantic
	green: "#9ece6a",
	yellow: "#e0af68",
	cyan: "#7dcfff",
	purple: "#bb9af7",
	orange: "#ff9e64",

	// UI chrome
	border: "#2f3350",
	separator: "#252840",
	inputBg: "#0d0d14",
	overlayBg: "#0d0d14",
	statusBarBg: "#0d0d14",
	statusKeyBg: "#09090f",
	titleBarBg: "#1d1d2e",
	groupHeaderBg: "#1e1e2e",
	rowEvenBg: "#151520",
	rowOddBg: "#11111b",
};

// ─── Feature group helpers ────────────────────────────────────────

function featureIcon(_feature: string): string { return ""; }

function featureTitle(feature: string): string {
	switch (feature) {
		case "modes": return "Collaboration Modes";
		case "sandbox": return "Sandbox";
		case "subagent": return "Subagent";
		case "output-gate": return "Output Gate";
		case "codex-shared": return "Codex Shared";
		case "codex-web-search": return "Codex Web Search";
		case "codex-limits": return "Codex Limits";
		case "dashboard": return "Dashboard";
		case "model-optimizer": return "Model Optimizer";
		case "terminal": return "Terminal";
		default: return feature;
	}
}

function featureOrder(feature: string): number {
	const order: Record<string, number> = {
		"modes": 0,
		"sandbox": 1,
		"subagent": 2,
		"output-gate": 3,
		"codex-shared": 4,
		"codex-web-search": 5,
		"codex-limits": 6,
		"dashboard": 7,
		"model-optimizer": 8,
		"terminal": 9,
	};
	return order[feature] ?? 99;
}

function typeIcon(_type: string): string { return ""; }

interface FeatureGroup {
	feature: string;
	items: EffectiveSetting[];
	startIndex: number;
}

function buildFeatureGroups(items: EffectiveSetting[]): FeatureGroup[] {
	const groups: FeatureGroup[] = [];
	let current: FeatureGroup | null = null;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!current || current.feature !== item.feature) {
			current = { feature: item.feature, items: [], startIndex: i };
			groups.push(current);
		}
		current.items.push(item);
	}
	groups.sort((a, b) => featureOrder(a.feature) - featureOrder(b.feature));
	return groups;
}

function isLeftMouse(event: any): boolean {
	return event?.button === "left" || event?.button === 0 || event?.button === undefined;
}

function countDraftsForFeature(drafts: Record<string, DraftChange>, feature: string): number {
	let count = 0;
	for (const key of Object.keys(drafts)) {
		if (drafts[key].feature === feature) count++;
	}
	return count;
}

function countDiagnosticsForFeature(items: EffectiveSetting[]): number {
	let count = 0;
	for (const item of items) {
		count += item.diagnostics.length;
	}
	return count;
}

// ─── Sidebar ──────────────────────────────────────────────────────

function Sidebar(p: {
	groups: FeatureGroup[];
	activeFeature: string;
	drafts: Record<string, DraftChange>;
	diagnostics: string[];
	totalItems: number;
	totalModels: number;
	onSelectFeature: (feature: string) => void;
}) {
	const sidebarWidth = 26;

	return el("box", {
		style: {
			width: sidebarWidth,
			height: "100%",
			flexDirection: "column",
			backgroundColor: C.sidebarBg,
			paddingBottom: 2,
		},
	},
		// Sidebar header
		el("box", {
			style: {
				width: "100%",
				height: 1,
				backgroundColor: C.titleBarBg,
				flexDirection: "row",
				paddingLeft: 2,
				alignItems: "center",
			},
		},
			el("text", { fg: C.fgBright, content: "⚙ Mekann" }),
		),
		// "All" row
		el("box", {
			key: "sidebar-all",
			style: {
				flexDirection: "row",
				width: "100%",
				height: 1,
				backgroundColor: p.activeFeature === ALL_FEATURE ? C.bgSelected : C.sidebarBg,
				paddingLeft: 2,
				paddingRight: 1,
				alignItems: "center",
			},
			onMouseDown: (event: any) => {
				if (isLeftMouse(event)) {
					p.onSelectFeature(ALL_FEATURE);
					event?.stopPropagation?.();
				}
			},
		},
			el("text", { fg: p.activeFeature === ALL_FEATURE ? C.fgBright : C.fg, content: "All" }),
			el("box", { style: { flexGrow: 1 } }),
			el("text", { fg: C.fgDim, content: `${p.totalItems}` }),
			...(Object.keys(p.drafts).length > 0
				? [el("text", { fg: C.fgDim, content: " " }), el("text", { fg: C.green, content: `${Object.keys(p.drafts).length}` })]
				: []
			),
			...(p.diagnostics.length > 0
				? [el("text", { fg: C.fgDim, content: " " }), el("text", { fg: C.orange, content: "⚠" })]
				: []
			),
		),
		// Feature list
		...p.groups.map((group) => {
			const isActive = group.feature === p.activeFeature;
			const draftCount = countDraftsForFeature(p.drafts, group.feature);
			const diagCount = countDiagnosticsForFeature(group.items);
			const bgColor = isActive ? C.bgSelected : C.sidebarBg;
			const textColor = isActive ? C.fgBright : C.fg;
			const icon = featureIcon(group.feature);
			const title = featureTitle(group.feature);

			const children: React.ReactNode[] = [
				el("text", { fg: isActive ? C.accent : C.fgDim, content: `${icon} ` }),
				el("text", { fg: textColor, content: title }),
				el("box", { style: { flexGrow: 1 } }),
			];

			// Settings count
			children.push(
				el("text", { fg: C.fgDim, content: `${group.items.length}` }),
			);

			// Draft count badge
			if (draftCount > 0) {
				children.push(
					el("text", { fg: C.fgDim, content: " " }),
					el("text", { fg: C.green, content: `${draftCount}` }),
				);
			}

			// Diagnostics warning
			if (diagCount > 0) {
				children.push(
					el("text", { fg: C.fgDim, content: " " }),
					el("text", { fg: C.orange, content: "⚠" }),
				);
			}

			return el("box", {
				key: `sidebar-${group.feature}`,
				style: {
					flexDirection: "row",
					width: "100%",
					height: 1,
					backgroundColor: bgColor,
					paddingLeft: 2,
					paddingRight: 1,
					alignItems: "center",
				},
				onMouseDown: (event: any) => {
					if (isLeftMouse(event)) {
						p.onSelectFeature(group.feature);
						event?.stopPropagation?.();
					}
				},
			}, ...children);
		}),
		// Spacer (fills remaining sidebar height)
		el("box", { style: { flexGrow: 1 } }),
	);
}

// ─── Feature Header ─────────────────────────────────────────────

function FeatureHeader(p: { feature: string }) {
	return el("box", {
		style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.groupHeaderBg, paddingLeft: 1, alignItems: "center" },
	},
		el("text", { fg: C.fgBright, content: featureTitle(p.feature).toUpperCase() }),
	);
}

// ─── Setting Row ──────────────────────────────────────────────────

function SettingRow(p: {
	item: EffectiveSetting;
	index: number;
	isSelected: boolean;
	hasDraft: boolean;
	draftValue: string;
	draftScope: string;
	onSelect: (index: number) => void;
}) {
	const bgColor = p.isSelected ? C.bgSelected : p.index % 2 === 0 ? C.rowEvenBg : C.rowOddBg;
	const keyColor = p.isSelected ? C.fgBright : C.accent;
	const displayValue = p.hasDraft ? p.draftValue : valueText(p.item.effectiveValue);
	const valColor = p.hasDraft ? C.green : C.fg;
	const srcColor = p.hasDraft ? C.yellow : C.fgDim;
	const restartIcon = p.item.schema.restartRequired ? " ↻" : "";

	return el("box", {
		id: `setting-row-${p.index}`,
		style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: bgColor, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		onMouseDown: (event: any) => { if (isLeftMouse(event)) { p.onSelect(p.index); event?.stopPropagation?.(); } },
	},
		el("text", { fg: C.fgDim, content: `${typeIcon(p.item.schema.type)} ` }),
		el("text", { fg: keyColor, content: pad(p.item.key, 24) }),
		el("text", { fg: valColor, content: pad(displayValue, 28) }),
		el("text", { fg: srcColor, content: truncate((p.hasDraft ? `${p.draftScope}*` : p.item.source) + restartIcon, 10) }),
	);
}

// ─── Column Header ────────────────────────────────────────────────

function ColumnHeader() {
	return el("box", {
		style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.groupHeaderBg, paddingLeft: 3, paddingRight: 1 },
	},
		el("text", { fg: C.fgDim, content: pad("SETTING", 24) }),
		el("text", { fg: C.fgDim, content: pad("VALUE", 28) }),
		el("text", { fg: C.fgDim, content: "SOURCE" }),
	);
}

// ─── Content Header ───────────────────────────────────────────────

function ContentHeader(p: { feature: string; count: number; featureGroups: FeatureGroup[] }) {
	const isAll = p.feature === ALL_FEATURE;
	const title = isAll ? "All Settings" : featureTitle(p.feature);
	const featureIndex = isAll ? 0 : p.featureGroups.findIndex((g) => g.feature === p.feature) + 1;
	const totalFeatures = p.featureGroups.length;

	return el("box", {
		style: { width: "100%", height: 1, backgroundColor: C.titleBarBg, flexDirection: "row", paddingLeft: 1, paddingRight: 1, alignItems: "center" },
	},
		el("text", { fg: C.fgBright, content: title }),
		el("text", { fg: C.fgDim, content: ` · ${p.count} setting${p.count !== 1 ? "s" : ""}` }),
		el("box", { style: { flexGrow: 1 } }),
		el("text", { fg: C.fgDim, content: isAll ? `${totalFeatures} features` : `${featureIndex}/${totalFeatures}` }),
	);
}

// ─── Detail Panel (inline) ────────────────────────────────────────

function DetailPanel(p: {
	item: EffectiveSetting;
	draft: DraftChange | undefined;
	drafts: Record<string, DraftChange>;
	models: ModelCatalogItem[];
	allItems: EffectiveSetting[];
	scope: SettingsScope;
}) {
	const id = itemId(p.item);
	const shown = p.draft?.raw ?? valueText(p.item.effectiveValue);
	const isModel = p.item.schema.type === "modelRef";
	const modelMatch = isModel ? p.models.find((m) => `${m.provider}/${m.modelId}` === shown) : null;

	const children: React.ReactNode[] = [
		// Title row: feature + key + type
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.accent, content: `${featureIcon(p.item.feature)} ` }),
			el("text", { fg: C.fgBright, content: id }),
			el("text", { fg: C.fgDim, content: `  (${p.item.schema.type === "modelRef" ? "model" : p.item.schema.type})` }),
		),
		// Description
		el("text", { fg: C.fg, content: p.item.schema.description }),
		// Value row
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: "Value:   " }),
			el("text", { fg: p.draft ? C.green : C.fgBright, content: truncate(shown, 50) }),
		),
		// Source + Type row
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: `Source:  ${p.item.source}` }),
			el("box", { style: { width: 2 } }),
			el("text", { fg: C.fgDim, content: `Type:    ${p.item.schema.type === "modelRef" ? "model" : p.item.schema.type}` }),
		),
		// Default + Save scope row
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: `Default: ${valueText(p.item.schema.defaultValue)}` }),
			el("box", { style: { width: 2 } }),
			el("text", { fg: C.fgDim, content: "Save to: " }),
			el("text", { fg: p.scope === "global" ? C.purple : C.cyan, content: p.scope }),
		),
	];

	// Restart warning
	if (p.item.schema.restartRequired) {
		children.push(el("text", { fg: C.orange, content: "⚠ Restart required for changes to take effect" }));
	}

	// Enum options (use model-specific thinking levels for thinking settings)
	if (p.item.schema.enumValues && p.item.schema.enumValues.length > 0) {
		let enumDisplay = p.item.schema.enumValues;
		if (p.item.feature === "modes" && p.item.key.startsWith("thinking.")) {
			const mode = p.item.key.split(".")[1];
			const modelItem = p.allItems.find((i) => i.feature === "modes" && i.key === `models.${mode}`);
			if (modelItem) {
				const modelKey = p.drafts[itemId(modelItem)]?.raw ?? valueText(modelItem.effectiveValue);
				const thinkingModel = p.models.find((m) => `${m.provider}/${m.modelId}` === modelKey);
				if (thinkingModel?.supportedThinkingLevels?.length) {
					enumDisplay = thinkingModel.supportedThinkingLevels;
				}
			}
		}
		children.push(
			el("box", { style: { flexDirection: "row" } },
				el("text", { fg: C.fgDim, content: "Options: " }),
				el("text", { fg: C.teal, content: enumDisplay.join(" │ ") }),
			),
		);
	}

	// Model info (for modelRef settings)
	if (modelMatch) {
		children.push(
			el("box", { style: { flexDirection: "row" } },
				el("text", { fg: C.fgDim, content: "Model:   " }),
				el("text", { fg: C.fg, content: `${modelMatch.label} (${modelMatch.providerLabel})` }),
				...(modelMatch.reasoning ? [el("text", { fg: C.teal, content: "  ✓ reasoning" })] : []),
			),
		);
		if (modelMatch.supportedThinkingLevels.length > 0) {
			children.push(el("text", { fg: C.fgDim, content: `  thinking: ${modelMatch.supportedThinkingLevels.join(", ")}` }));
		}
	}

	// For thinking settings, show which model drives the options
	if (p.item.feature === "modes" && p.item.key.startsWith("thinking.")) {
		const mode = p.item.key.split(".")[1];
		const modelItem = p.allItems.find((i) => i.feature === "modes" && i.key === `models.${mode}`);
		if (modelItem) {
			const modelKey = p.drafts[itemId(modelItem)]?.raw ?? valueText(modelItem.effectiveValue);
			const thinkingModel = p.models.find((m) => `${m.provider}/${m.modelId}` === modelKey);
			const label = thinkingModel ? `${thinkingModel.label} (${thinkingModel.providerLabel})` : modelKey;
			children.push(el("text", { fg: C.fgDim, content: `Model:   ${label}` }));
		}
	}

	// Diagnostics
	for (const d of p.item.diagnostics) {
		children.push(el("text", { fg: C.orange, content: `⚠ ${d}` }));
	}

	return el("box", {
		style: {
			width: "100%",
			flexDirection: "column",
			gap: 1,
			backgroundColor: C.detailBg,
			padding: 1,
			borderStyle: "single",
			borderColor: C.border,
		},
	}, ...children);
}

// ─── Status Bar ───────────────────────────────────────────────────

function StatusBar(p: {
	message: string;
	scope: SettingsScope;
	draftCount: number;
	diagnosticsCount: number;
	mode: AppMode;
	currentType: string;
}) {
	const scopeColor = p.scope === "global" ? C.purple : C.cyan;
	const modeLabel: Record<AppMode, string> = { list: "BROWSE", edit: "EDIT", models: "MODEL PICK", diff: "DIFF" };
	const modeColor: Record<AppMode, string> = { list: C.green, edit: C.yellow, models: C.cyan, diff: C.purple };

	let enterHint = "open";
	if (p.mode === "list") {
		if (p.currentType === "modelRef") enterHint = "pick model";
		else if (p.currentType === "enum") enterHint = "cycle";
		else if (p.currentType === "boolean") enterHint = "toggle";
		else enterHint = "edit";
	}

	const statusChildren: React.ReactNode[] = [
		el("text", { fg: modeColor[p.mode], content: ` ${modeLabel[p.mode]} ` }),
		el("text", { fg: C.fgDim, content: "│" }),
		el("text", { fg: scopeColor, content: ` ${p.scope} ` }),
		el("text", { fg: C.fgDim, content: "│" }),
		el("text", { fg: p.draftCount > 0 ? C.green : C.fgDim, content: ` ${p.draftCount} draft${p.draftCount !== 1 ? "s" : ""} ` }),
	];
	if (p.diagnosticsCount > 0) {
		statusChildren.push(
			el("text", { fg: C.fgDim, content: "│" }),
			el("text", { fg: C.orange, content: ` ⚠ ${p.diagnosticsCount} ` }),
		);
	}
	statusChildren.push(
		el("box", { style: { flexGrow: 1 } }),
		el("text", { fg: C.fgDim, content: truncate(p.message, 60) }),
	);

	return el("box", {
		style: { position: "absolute", bottom: 0, width: "100%", height: 2, flexDirection: "column" },
	},
		// Message row
		el("box", {
			style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusBarBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		}, ...statusChildren),
		// Keybinding hints row
		el("box", {
			style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusKeyBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		},
			el("text", { fg: C.fgDim, content: " ↑↓/wheel " }), el("text", { fg: C.fg, content: "nav" }),
			el("text", { fg: C.fgDim, content: "  ←→ " }), el("text", { fg: C.fg, content: "feature" }),
			el("text", { fg: C.fgDim, content: "  click " }), el("text", { fg: C.fg, content: "select" }),
			el("text", { fg: C.fgDim, content: "  click²/⏎ " }), el("text", { fg: C.accent, content: enterHint }),
			el("text", { fg: C.fgDim, content: "  Tab " }), el("text", { fg: C.fg, content: "scope" }),
			el("text", { fg: C.fgDim, content: "  d " }), el("text", { fg: C.fg, content: "diff" }),
			el("text", { fg: C.fgDim, content: "  a " }), el("text", { fg: C.green, content: "apply" }),
			el("text", { fg: C.fgDim, content: "  q " }), el("text", { fg: C.fgDim, content: "quit" }),
		),
	);
}

// ─── Overlays ─────────────────────────────────────────────────────

function EditOverlay(p: { settingKey: string; buffer: string; type: string }) {
	return el("box", {
		style: { position: "absolute", top: 4, left: 4, right: 4, height: 5, borderStyle: "rounded", borderColor: C.yellow, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 0 },
	},
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.yellow, content: "EDIT " }),
			el("text", { fg: C.fgBright, content: p.settingKey }),
			el("text", { fg: C.fgDim, content: ` (${p.type})` }),
		),
		el("box", { style: { flexDirection: "row", backgroundColor: C.inputBg, height: 1, paddingLeft: 1 } },
			el("text", { fg: C.fg, content: p.buffer }),
			el("text", { fg: C.accent, content: "█" }),
		),
		el("text", { fg: C.fgDim, content: "Enter confirm · Esc cancel" }),
	);
}

function DiffOverlay(p: { drafts: Record<string, DraftChange>; items: EffectiveSetting[] }) {
	const entries = Object.entries(p.drafts);
	const children: React.ReactNode[] = [
		el("text", { fg: C.purple, content: "Draft Diff · Apply Preview" }),
	];
	if (entries.length === 0) {
		children.push(el("text", { fg: C.fgDim, content: "  (no draft changes)" }));
	} else {
		for (const [key, change] of entries) {
			const base = p.items.find((i) => i.feature === change.feature && i.key === change.key);
			children.push(
				el("box", { key, style: { flexDirection: "column" } },
					el("box", { style: { flexDirection: "row" } },
						el("text", { fg: C.accent, content: key }),
						el("text", { fg: C.fgDim, content: ` (${change.scope})` }),
					),
					el("text", { fg: C.orange, content: `- ${valueText(base?.effectiveValue) || "(unset)"}` }),
					el("text", { fg: C.green, content: `+ ${change.raw || "(unset)"}` }),
				),
			);
		}
		children.push(el("text", { fg: C.green, content: "Press a to apply · Esc to close" }));
	}

	return el("box", {
		style: { position: "absolute", top: 3, left: 2, right: 2, bottom: 3, borderStyle: "rounded", borderColor: C.purple, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 1 },
	}, ...children);
}

function ModelPickerOverlay(p: { models: ModelCatalogItem[]; selected: number; onSelect: (index: number) => void; onConfirm: () => void }) {
	const scrollRef = useRef<ScrollBoxRenderable>(null);
	const lastClickRef = useRef<{ index: number; at: number } | null>(null);

	useEffect(() => {
		const id = `model-row-${p.selected}`;
		scrollRef.current?.scrollChildIntoView(id);
	}, [p.selected, p.models.length]);

	const handleClick = useCallback((i: number, event: any) => {
		if (!isLeftMouse(event)) return;
		event?.stopPropagation?.();
		const now = Date.now();
		const last = lastClickRef.current;
		p.onSelect(i);
		if (last && last.index === i && now - last.at <= 400) {
			lastClickRef.current = null;
			p.onConfirm();
			return;
		}
		lastClickRef.current = { index: i, at: now };
	}, [p]);

	const rows = p.models.map((m, i) => {
		const isSel = i === p.selected;
		return el("box", {
			key: `${m.provider}/${m.modelId}`,
			id: `model-row-${i}`,
			style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: isSel ? C.bgSelected : C.bg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		},
			el("text", {
				fg: isSel ? C.fgBright : C.fg,
				content: `${isSel ? "▸" : " "} ${pad(`${m.provider}/${m.modelId}`, 44)} `,
				onMouseDown: (event: any) => handleClick(i, event),
			}),
			...(m.reasoning ? [el("text", { fg: isSel ? C.fgBright : C.teal, content: "reasoning " })] : []),
			el("text", { fg: C.fgDim, content: m.label }),
		);
	});

	return el("box", {
		style: { position: "absolute", top: 1, left: 2, right: 2, bottom: 2, borderStyle: "rounded", borderColor: C.cyan, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 0 },
	},
		el("text", { fg: C.cyan, content: "Select Model" }),
		el("text", { fg: C.fgDim, content: "↑↓ navigate · click select · dbl-click/Enter confirm · Esc cancel" }),
		el("scrollbox", {
			ref: scrollRef,
			style: { width: "100%", flexGrow: 1, backgroundColor: C.bg },
			scrollY: true,
			viewportCulling: true,
		}, ...rows),
	);
}

// ─── Main App ─────────────────────────────────────────────────────

export function SettingsEditorApp({
	effective,
	diagnostics,
	models,
	onApply,
	onQuit,
}: SettingsEditorAppProps) {
	useTerminalDimensions();
	const settingsScrollRef = useRef<ScrollBoxRenderable>(null);

	const [selected, setSelected] = useState(0);
	const [scope, setScope] = useState<SettingsScope>("global");
	const [mode, setMode] = useState<AppMode>("list");
	const [buffer, setBuffer] = useState("");
	const [modelSelected, setModelSelected] = useState(0);
	const [drafts, setDrafts] = useState<Record<string, DraftChange>>({});
	const [message, setMessage] = useState("Welcome to Mekann Settings Editor");
	const [applying, setApplying] = useState(false);

	const items = useMemo(() => effective, [effective]);
	const groups = useMemo(() => buildFeatureGroups(items), [items]);

	// Active feature state (defaults to "All")
	const [activeFeature, setActiveFeature] = useState<string>(ALL_FEATURE);
	const activeGroup = useMemo(
		() => groups.find((g) => g.feature === activeFeature),
		[groups, activeFeature],
	);
	// Settings for the currently active feature (all items when "All")
	const featureItems = useMemo(
		() => activeFeature === ALL_FEATURE ? items : (activeGroup?.items ?? []),
		[activeFeature, activeGroup, items],
	);

	const current = featureItems[Math.min(selected, Math.max(0, featureItems.length - 1))];
	const currentDraft = current ? drafts[itemId(current)] : undefined;

	// When switching features, reset selected and scroll
	const switchFeature = useCallback((feature: string) => {
		setActiveFeature(feature);
		setSelected(0);
		setMessage(feature === ALL_FEATURE ? "Showing all settings" : `Switched to ${featureTitle(feature)}`);
		// close any open overlays
		if (mode !== "list") setMode("list");
	}, [mode]);

	// Scroll selected row into view
	useEffect(() => {
		settingsScrollRef.current?.scrollChildIntoView(`setting-row-${selected}`);
	}, [selected, featureItems.length]);

	const stage = useCallback(
		(item: EffectiveSetting, raw: string) => {
			setDrafts((d) => ({ ...d, [itemId(item)]: { feature: item.feature, key: item.key, scope, raw } }));
			setMessage(`staged ${itemId(item)} → ${scope}`);
		},
		[scope],
	);

	const shownValueFor = useCallback((item: EffectiveSetting): string => {
		return drafts[itemId(item)]?.raw ?? valueText(item.effectiveValue);
	}, [drafts]);

	const activateSetting = useCallback((item: EffectiveSetting) => {
		const shown = shownValueFor(item);
		if (item.schema.type === "modelRef") {
			setModelSelected(0); setMode("models"); setMessage("pick a model");
		} else if (item.schema.type === "enum") {
			const values = item.feature === "modes" && item.key.startsWith("thinking.") ? supportedThinking(models, item, items, drafts) : (item.schema.enumValues ?? []);
			const idx = Math.max(0, values.indexOf(shown));
			stage(item, values[(idx + 1) % values.length] ?? "");
		} else if (item.schema.type === "boolean") {
			const draft = drafts[itemId(item)]?.raw;
			const cur = draft === undefined ? item.effectiveValue : /^(true|1|yes|on)$/i.test(draft);
			stage(item, String(!cur));
		} else {
			setBuffer(shown === "(unset)" ? "" : shown); setMode("edit"); setMessage(`editing ${itemId(item)}`);
		}
	}, [drafts, items, models, shownValueFor, stage]);

	// Model picker confirm
	const confirmModel = useCallback(() => {
		if (!current || !models[modelSelected]) return;
		const m = models[modelSelected];
		stage(current, `${m.provider}/${m.modelId}`);
		setMode("list");
	}, [current, models, modelSelected, stage]);

	const selectSettingByMouse = useCallback((index: number) => {
		if (index === selected) {
			// Already selected: single click activates (cycle/toggle/pick)
			const item = featureItems[index];
			if (item) activateSetting(item);
			return;
		}
		// Not selected yet: just select it
		setSelected(index);
	}, [selected, activateSetting, featureItems]);

	// ─── Keyboard ──────────────────────────────────────────────

	useKeyboard((key) => {
		if (key.ctrl && key.name === "c") { onQuit(); return; }

		if (mode === "edit") {
			if (key.name === "escape") { setMode("list"); setMessage("edit cancelled"); return; }
			if (key.name === "backspace" || key.name === "delete") { setBuffer((b) => b.slice(0, -1)); return; }
			if (key.name === "return" || key.name === "enter") { if (current) stage(current, buffer); setMode("list"); return; }
			if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) setBuffer((b) => b + key.sequence);
			return;
		}

		if (mode === "models") {
			if (key.name === "escape") { setMode("list"); return; }
			if (key.name === "up") setModelSelected((i) => Math.max(0, i - 1));
			else if (key.name === "down") setModelSelected((i) => Math.min(models.length - 1, i + 1));
			else if ((key.name === "return" || key.name === "enter") && current && models[modelSelected]) {
				confirmModel();
			}
			return;
		}

		// Feature navigation: ←→ keys (cycle through All + features)
		if (key.name === "left") {
			const features = [ALL_FEATURE, ...groups.map((g) => g.feature)];
			const idx = features.indexOf(activeFeature);
			const prev = features[idx <= 0 ? features.length - 1 : idx - 1];
			if (prev && prev !== activeFeature) switchFeature(prev);
			return;
		}
		if (key.name === "right") {
			const features = [ALL_FEATURE, ...groups.map((g) => g.feature)];
			const idx = features.indexOf(activeFeature);
			const next = features[idx >= features.length - 1 ? 0 : idx + 1];
			if (next && next !== activeFeature) switchFeature(next);
			return;
		}

		if (key.name === "q") { onQuit(); return; }
		if (key.name === "up") setSelected((i) => Math.max(0, i - 1));
		else if (key.name === "down") setSelected((i) => Math.min(featureItems.length - 1, i + 1));
		else if (key.name === "tab") {
			setScope((s) => s === "global" ? "workspace" : "global");
			setMessage(`save scope → ${scope === "global" ? "workspace" : "global"}`);
		}
		else if (key.name === "d") setMode(mode === "diff" ? "list" : "diff");
		else if ((key.name === "return" || key.name === "enter") && current) {
			activateSetting(current);
		} else if (key.name === "a" && !applying) {
			const changes = Object.values(drafts);
			if (changes.length === 0) { setMessage("no drafts to apply"); return; }
			setApplying(true);
			void onApply(changes).then((err) => {
				setApplying(false);
				if (err) setMessage(`✗ ${err}`);
				else { setDrafts({}); setMessage("✓ applied — restart Pi to use new settings"); }
			});
		}
	});

	// ─── Build setting rows for active feature ─────────────────

	const rows: React.ReactNode[] = [];
	const isAll = activeFeature === ALL_FEATURE;
	if (isAll) {
		let globalIdx = 0;
		for (let gi = 0; gi < groups.length; gi++) {
			const group = groups[gi];
			rows.push(el(FeatureHeader, { feature: group.feature, key: `h-${group.feature}` }));
			for (let j = 0; j < group.items.length; j++) {
				const item = group.items[j];
				const draft = drafts[itemId(item)];
				rows.push(el(SettingRow, {
					key: itemId(item),
					item, index: globalIdx,
					isSelected: globalIdx === selected,
					hasDraft: !!draft,
					draftValue: draft?.raw ?? "",
					draftScope: draft?.scope ?? "",
					onSelect: selectSettingByMouse,
				}));
				globalIdx++;
			}
		}
	} else {
		for (let j = 0; j < featureItems.length; j++) {
			const item = featureItems[j];
			const draft = drafts[itemId(item)];
			rows.push(el(SettingRow, {
				key: itemId(item),
				item, index: j,
				isSelected: j === selected,
				hasDraft: !!draft,
				draftValue: draft?.raw ?? "",
				draftScope: draft?.scope ?? "",
				onSelect: selectSettingByMouse,
			}));
		}
	}

	// ─── Render ────────────────────────────────────────────────

	const showDetail = current !== undefined && mode === "list";

	return el("box", {
		style: { flexDirection: "column", width: "100%", height: "100%", backgroundColor: C.bg },
	},
		// ── Main area (sidebar + content) ──
		el("box", {
			style: { flexDirection: "row", width: "100%", flexGrow: 1, paddingBottom: 2 },
		},
			// Sidebar
			el(Sidebar, {
				groups,
				activeFeature,
				drafts,
				diagnostics,
				totalItems: items.length,
				totalModels: models.length,
				onSelectFeature: switchFeature,
			}),
			// Vertical separator
			el("box", {
				style: { width: 1, height: "100%", backgroundColor: C.separator },
			}),
			// Content area
			el("box", {
				style: { flexGrow: 1, height: "100%", flexDirection: "column", backgroundColor: C.contentBg, paddingRight: 1 },
			},
				el(ContentHeader, { feature: activeFeature, count: featureItems.length, featureGroups: groups }),
				el(ColumnHeader, {}),
				el("scrollbox", {
					ref: settingsScrollRef,
					style: { width: "100%", flexGrow: 1, backgroundColor: C.contentBg },
					scrollY: true,
					viewportCulling: true,
					focused: true,
				}, ...rows),
				// Inline detail panel (conditional)
				...(showDetail
					? [el(DetailPanel, { item: current, draft: currentDraft, drafts, models, allItems: items, scope })]
					: []
				),
			),
		),
		// ── Status bar ──
		el(StatusBar, { message, scope, draftCount: Object.keys(drafts).length, diagnosticsCount: diagnostics.length, mode, currentType: current?.schema.type ?? "" }),
		// ── Overlays ──
		...(mode === "edit" && current ? [el(EditOverlay, { settingKey: itemId(current), buffer, type: current.schema.type })] : []),
		...(mode === "diff" ? [el(DiffOverlay, { drafts, items })] : []),
		...(mode === "models" ? [el(ModelPickerOverlay, { models, selected: modelSelected, onSelect: setModelSelected, onConfirm: confirmModel })] : []),
	);
}
